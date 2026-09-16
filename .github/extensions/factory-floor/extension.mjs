// Factory Floor — a canvas for running a software factory.
//
// Loop, harness, factory. Work enters as an issue, an agent builds it, cheap
// automated checks verify it, and exactly one box — the review gate — costs a
// human anything. This canvas is where that gate lives.
//
// Everything a person can do on the surface, the agent can do through an
// action, and both write to the same state. That is the point of a canvas.

import { createServer } from "node:http";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";

import {
    LANES,
    LANE_META,
    loadState,
    loadConfig,
    saveConfig,
    setFactoryMode,
    snapshot,
    persist,
    createCard,
    findCard,
    findCardByIssue,
    moveCard,
    record,
    gateStatus,
    effectiveAutonomy,
} from "./lib/state.mjs";
import { renderHtml } from "./lib/render.mjs";
import * as gh from "./lib/github.mjs";

const servers = new Map(); // instanceId -> { server, url }
const clients = new Map(); // instanceId -> Set<ServerResponse>

// ---------------------------------------------------------------------------
// Live updates
// ---------------------------------------------------------------------------

function broadcast() {
    const payload = `data: ${JSON.stringify(snapshot())}\n\n`;
    for (const set of clients.values()) {
        for (const res of set) {
            try {
                res.write(payload);
            } catch {
                // A disconnected client is cleaned up by its own close handler.
            }
        }
    }
}

/** Persist and push to every open surface. Every mutation funnels through here. */
function commit() {
    persist();
    broadcast();
    return snapshot();
}

function readBody(req) {
    return new Promise((resolve) => {
        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
            if (raw.length > 1_000_000) raw = raw.slice(0, 1_000_000);
        });
        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch {
                resolve({});
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Core factory mechanics, shared by the UI endpoints and the agent actions
// ---------------------------------------------------------------------------

/**
 * Advance a card one stage, enforcing back pressure.
 *
 * The rule that matters: a lit change cannot skip the review gate. Autonomy is
 * bounded by what can be cheaply and reliably verified, so if the policy says a
 * person reads this, the pipeline routes it to a person.
 */
function advance(card, requested) {
    const config = loadConfig();
    const autonomy = effectiveAutonomy(config, card);
    const gate = gateStatus(config, card);
    const index = LANES.indexOf(card.lane);
    const target = requested ?? LANES[Math.min(index + 1, LANES.length - 1)];

    if (card.lane === "checks" && gate.state === "fail" && target !== "harness") {
        return {
            moved: false,
            lane: card.lane,
            reason: `Held in Checks: ${gate.summary}. A red gate is the loop telling you it is not done.`,
        };
    }

    if (target === "shipped" && autonomy.autonomy === "lit" && card.verdict !== "approved") {
        moveCard(card, "review");
        record(card, "routed to the review gate by policy");
        return {
            moved: true,
            lane: "review",
            reason: `Policy marks this lit — ${autonomy.reason} Routed to the review gate rather than shipped.`,
        };
    }

    const move = moveCard(card, target);
    if (target === "shipped") {
        card.shippedUnread = card.verdict !== "approved";
        if (card.shippedUnread) record(card, "shipped without a human reading it");
    }
    return {
        moved: true,
        lane: target,
        reason:
            target === "shipped" && card.shippedUnread
                ? "Dark lane: cheap oracle, small blast radius, shipped unattended."
                : `Moved ${LANE_META[move.from]?.label ?? move.from} → ${LANE_META[target].label}.`,
    };
}

function resolveReview(card, verdict, note) {    card.verdict = verdict;
    card.reviewNote = note ?? null;
    if (verdict === "approved") {
        record(card, `approved${note ? `: ${note}` : ""}`);
        moveCard(card, "shipped");
        card.shippedUnread = false;
        return { verdict, lane: "shipped", reason: "Approved at the gate and shipped. A person read this one." };
    }
    record(card, `changes requested${note ? `: ${note}` : ""}`);
    moveCard(card, "harness");
    return { verdict, lane: "harness", reason: "Sent back to the harness with feedback." };
}

/**
 * Flip the whole factory between lit and lights-out.
 *
 * Going dark is not just a display change: it rewrites factory.config.json and
 * then drains the review gate, because if nothing is lit then nothing is waiting
 * on a person. That drain is the point — you watch the queue of human judgment
 * empty in one click, and the comprehension debt meter pay for it.
 */
function switchMode(mode) {
    const target = mode === "dark" ? "dark" : "lit";
    const config = setFactoryMode(target);
    const board = loadState();
    const drained = [];

    if (target === "dark") {
        for (const card of board.cards) {
            if (card.lane !== "review") continue;
            const gate = gateStatus(config, card);
            if (gate.state === "fail") continue;
            moveCard(card, "shipped");
            card.shippedUnread = true;
            record(card, "shipped unread — lights went out while it waited at the gate");
            drained.push({ id: card.id, issue: card.issue, title: card.title });
        }
    }

    commit();
    return {
        mode: target,
        drained,
        rules: (config.rules ?? []).map((r) => ({ id: r.id, autonomy: r.autonomy })),
        note:
            target === "dark"
                ? `Lights out. ${drained.length} card(s) left the gate without anyone reading them.`
                : "Lights back on. Authored policy restored from factory.config.json.",
    };
}

/** Pull real issues and PR state from GitHub. Best-effort by design. */async function syncFromGitHub() {
    const board = loadState();
    const config = loadConfig();
    const repo = board.repo || config.repo || (await gh.currentRepo());
    if (repo) board.repo = repo;

    const notes = [];
    let added = 0;

    try {
        const issues = await gh.listIntake(repo);
        for (const issue of issues) {
            const existing = findCardByIssue(issue.number);
            if (existing) {
                // Keep the board honest when an issue is retitled or relabelled.
                if (existing.title !== issue.title) {
                    record(existing, `retitled: ${issue.title}`);
                    existing.title = issue.title;
                }
                existing.url = issue.url;
                existing.kind = issue.kind;
                continue;
            }
            createCard({
                issue: issue.number,
                title: issue.title,
                url: issue.url,
                kind: issue.kind,
                lane: "intake",
            });
            added += 1;
        }
        notes.push(`${issues.length} open intake issue(s), ${added} new`);
    } catch (error) {
        notes.push(`issue list unavailable (${error.message})`);
    }

    for (const card of board.cards) {
        if (!card.pr) continue;
        try {
            const files = await gh.pullRequestFiles(repo, card.pr);
            if (files.length > 0) card.paths = files;
        } catch {
            notes.push(`could not read files for PR #${card.pr}`);
        }
        try {
            const checks = await gh.pullRequestChecks(repo, card.pr);
            if (Object.keys(checks).length > 0) card.checks = { ...card.checks, ...checks };
        } catch {
            notes.push(`could not read checks for PR #${card.pr}`);
        }
    }

    board.lastSync = new Date().toISOString();
    commit();
    return { repo, added, notes };
}

// ---------------------------------------------------------------------------
// HTTP surface
// ---------------------------------------------------------------------------

const ROUTES = {
    "/move": (body) => {
        const card = findCard(body.cardId);
        if (!card) return { message: "Card not found" };
        if (!LANES.includes(body.lane)) return { message: "Unknown lane" };
        const result = advance(card, body.lane);
        commit();
        return { message: result.reason };
    },
    "/review": (body) => {
        const card = findCard(body.cardId);
        if (!card) return { message: "Card not found" };
        const result = resolveReview(card, body.verdict, body.note);
        commit();
        return { message: result.reason };
    },
    "/policy": (body) => {
        const config = loadConfig();
        const rule = (config.rules ?? []).find((r) => r.id === body.ruleId);
        if (!rule) return { message: "Rule not found" };
        if (rule.autonomy === body.autonomy) return { message: `Already ${body.autonomy}` };
        rule.autonomy = body.autonomy === "dark" ? "dark" : "lit";
        saveConfig(config);
        commit();
        return { message: `${rule.id} is now ${rule.autonomy} — every card re-resolved` };
    },
    "/policy-open": (body) => {
        loadState().policyOpen = !!body.open;
        commit();
        return {};
    },
    "/mode": (body) => {
        const result = switchMode(body.mode);
        return { message: result.note };
    },
};

async function handle(req, res, instanceId) {
    if (req.url === "/events") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        if (!clients.has(instanceId)) clients.set(instanceId, new Set());
        clients.get(instanceId).add(res);
        res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
        req.on("close", () => clients.get(instanceId)?.delete(res));
        return;
    }

    if (req.method === "POST") {
        const body = await readBody(req);
        let result = {};
        if (req.url === "/sync") {
            const sync = await syncFromGitHub();
            result = { message: `${sync.repo || "repo"}: ${sync.notes.join("; ")}` };
        } else if (ROUTES[req.url]) {
            result = ROUTES[req.url](body);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...result, state: snapshot() }));
        return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderHtml(snapshot()));
}

async function startServer(instanceId) {
    const server = createServer((req, res) => {
        handle(req, res, instanceId).catch(() => {
            try {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Factory floor hit an internal error" }));
            } catch {
                // The socket is already gone; nothing useful left to do.
            }
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    return { server, url: `http://127.0.0.1:${port}/` };
}

// ---------------------------------------------------------------------------
// Agent-callable actions
// ---------------------------------------------------------------------------

const LANE_ENUM = { type: "string", enum: LANES, description: `One of: ${LANES.join(", ")}` };

const actions = [
    {
        name: "get_floor",
        description:
            "Read the whole factory floor: every card with its lane, resolved autonomy (dark or lit), gate results, and the current autonomy policy. Call this first to know what the factory is doing.",
        handler: async () => snapshot(),
    },
    {
        name: "enqueue_work",
        description:
            "Put a new piece of work on the floor. Use this when an issue should enter the factory queue. Supplying the paths it will touch lets the policy resolve dark or lit immediately.",
        inputSchema: {
            type: "object",
            properties: {
                title: { type: "string", description: "Short description of the work" },
                issue: { type: "number", description: "GitHub issue number, if there is one" },
                url: { type: "string", description: "Link to the issue" },
                kind: {
                    type: "string",
                    enum: ["intent", "signal"],
                    description: "Intent is a decision; signal comes back from production",
                },
                paths: { type: "array", items: { type: "string" }, description: "Paths this work is expected to touch" },
                lane: LANE_ENUM,
            },
            required: ["title"],
        },
        handler: async (ctx) => {
            const card = createCard(ctx.input);
            commit();
            return {
                card: { id: card.id, title: card.title, lane: card.lane },
                autonomy: effectiveAutonomy(loadConfig(), card),
            };
        },
    },
    {
        name: "pull_next",
        description:
            "Pull the next item off the queue into the harness — the start of one loop. Returns the card plus its autonomy so you know whether a human will need to read the result.",
        handler: async () => {
            const board = loadState();
            const next =
                board.cards.find((c) => c.lane === "queue") ?? board.cards.find((c) => c.lane === "intake");
            if (!next) return { pulled: null, reason: "Nothing waiting. The queue is empty." };
            moveCard(next, "harness");
            commit();
            return {
                pulled: { id: next.id, issue: next.issue, title: next.title, paths: next.paths },
                autonomy: effectiveAutonomy(loadConfig(), next),
                loopBudget: loadConfig().loop,
            };
        },
    },
    {
        name: "advance_stage",
        description:
            "Move a card forward through the factory. Back pressure is enforced here: a card whose policy says lit cannot skip the review gate, and a card with a failing gate stays in Checks.",
        inputSchema: {
            type: "object",
            properties: {
                cardId: { type: "number", description: "Card id from get_floor" },
                lane: LANE_ENUM,
            },
            required: ["cardId"],
        },
        handler: async (ctx) => {
            const card = findCard(ctx.input.cardId);
            if (!card) return { error: `No card ${ctx.input.cardId}` };
            const result = advance(card, ctx.input.lane);
            commit();
            return result;
        },
    },
    {
        name: "record_check",
        description:
            "Record the result of one automated check against a card, e.g. Typecheck, Test or Lint. These are the cheap, high-frequency gates; the card cannot leave Checks while one is failing.",
        inputSchema: {
            type: "object",
            properties: {
                cardId: { type: "number" },
                check: { type: "string", description: "Check name, matching gates.required in factory.config.json" },
                status: { type: "string", enum: ["pass", "fail", "pending"] },
            },
            required: ["cardId", "check", "status"],
        },
        handler: async (ctx) => {
            const card = findCard(ctx.input.cardId);
            if (!card) return { error: `No card ${ctx.input.cardId}` };
            card.checks = { ...card.checks, [ctx.input.check]: ctx.input.status };
            record(card, `${ctx.input.check}: ${ctx.input.status}`);
            commit();
            return { checks: card.checks, gate: gateStatus(loadConfig(), card) };
        },
    },
    {
        name: "set_autonomy",
        description:
            "Change where the lights are. Pass ruleId to edit the shared policy in factory.config.json (this re-resolves every card), or cardId to override one card. Only widen autonomy when the check is cheap, frequent and hard to fake.",
        inputSchema: {
            type: "object",
            properties: {
                ruleId: { type: "string", description: "Policy rule id, e.g. tests or auth" },
                cardId: { type: "number", description: "Override a single card instead of the policy" },
                autonomy: {
                    type: "string",
                    enum: ["dark", "lit", "policy"],
                    description: "Use 'policy' to clear a card override",
                },
            },
            required: ["autonomy"],
        },
        handler: async (ctx) => {
            const { ruleId, cardId, autonomy } = ctx.input;
            if (ruleId) {
                const config = loadConfig();
                const rule = (config.rules ?? []).find((r) => r.id === ruleId);
                if (!rule) return { error: `No policy rule "${ruleId}"` };
                if (autonomy === "policy") return { error: "Use dark or lit when editing a policy rule" };
                rule.autonomy = autonomy;
                saveConfig(config);
                commit();
                return { rule: { id: rule.id, autonomy: rule.autonomy, paths: rule.paths }, appliesTo: "all cards" };
            }
            const card = findCard(cardId);
            if (!card) return { error: "Pass either a ruleId or a valid cardId" };
            card.autonomyOverride = autonomy === "policy" ? null : autonomy;
            record(card, `autonomy set to ${autonomy}`);
            commit();
            return { card: card.id, resolved: effectiveAutonomy(loadConfig(), card) };
        },
    },
    {
        name: "link_pr",
        description:
            "Attach a pull request to a card and pull its changed paths and check results from GitHub, so autonomy is resolved from what the diff actually touches rather than what was predicted.",
        inputSchema: {
            type: "object",
            properties: {
                cardId: { type: "number" },
                pr: { type: "number", description: "Pull request number" },
                url: { type: "string" },
            },
            required: ["cardId", "pr"],
        },
        handler: async (ctx) => {
            const card = findCard(ctx.input.cardId);
            if (!card) return { error: `No card ${ctx.input.cardId}` };
            card.pr = ctx.input.pr;
            card.prUrl = ctx.input.url ?? null;
            record(card, `linked PR #${card.pr}`);

            const repo = loadState().repo || loadConfig().repo;
            const notes = [];
            try {
                const files = await gh.pullRequestFiles(repo, card.pr);
                if (files.length > 0) card.paths = files;
            } catch (error) {
                notes.push(`files unavailable: ${error.message}`);
            }
            try {
                const checks = await gh.pullRequestChecks(repo, card.pr);
                if (Object.keys(checks).length > 0) card.checks = { ...card.checks, ...checks };
            } catch {
                notes.push("checks unavailable");
            }
            commit();
            return {
                card: card.id,
                paths: card.paths,
                checks: card.checks,
                resolved: effectiveAutonomy(loadConfig(), card),
                notes,
            };
        },
    },
    {
        name: "request_review",
        description:
            "Send a card to the review gate and say what a reviewer should look at. Use this for anything the policy marks lit, or whenever you are not confident the automated checks are a sufficient oracle.",
        inputSchema: {
            type: "object",
            properties: {
                cardId: { type: "number" },
                note: { type: "string", description: "What the reviewer should check, and why it needs judgment" },
            },
            required: ["cardId"],
        },
        handler: async (ctx) => {
            const card = findCard(ctx.input.cardId);
            if (!card) return { error: `No card ${ctx.input.cardId}` };
            card.verdict = null;
            card.reviewNote = ctx.input.note ?? null;
            moveCard(card, "review");
            commit();
            return { lane: "review", waitingOn: "a human", note: card.reviewNote };
        },
    },
    {
        name: "resolve_review",
        description:
            "Record a decision at the review gate. Approving ships the card and marks it as read by a human; requesting changes sends it back to the harness with feedback.",
        inputSchema: {
            type: "object",
            properties: {
                cardId: { type: "number" },
                verdict: { type: "string", enum: ["approved", "changes-requested"] },
                note: { type: "string" },
            },
            required: ["cardId", "verdict"],
        },
        handler: async (ctx) => {
            const card = findCard(ctx.input.cardId);
            if (!card) return { error: `No card ${ctx.input.cardId}` };
            const result = resolveReview(card, ctx.input.verdict, ctx.input.note);
            commit();
            return result;
        },
    },
    {
        name: "set_factory_mode",
        description:
            "Turn the whole factory dark (lights out — every rule ships unattended, and anything waiting at the review gate is released unread) or lit (restore the authored policy). This rewrites factory.config.json. Use it to demonstrate what removing human judgment actually costs, not as a normal operating mode.",
        inputSchema: {
            type: "object",
            properties: {
                mode: {
                    type: "string",
                    enum: ["dark", "lit"],
                    description: "dark turns every switch off; lit restores the authored policy",
                },
            },
            required: ["mode"],
        },
        handler: async (ctx) => ({ ...switchMode(ctx.input.mode), stats: snapshot().stats }),
    },
    {
        name: "sync_from_github",
        description:
            "Refresh the floor from GitHub: pull open issues labelled factory:intake into Intake, and refresh changed paths and check results for every card that has a pull request.",
        handler: async () => {
            const result = await syncFromGitHub();
            return { ...result, stats: snapshot().stats };
        },
    },
];

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "factory-floor",
            displayName: "Factory Floor",
            description:
                "The control surface for a software factory. Work moves Intake → Queue → Harness → Checks → Review Gate → Shipped. An autonomy policy decides which changes ship dark (unattended) and which stay lit (a human reads them first); the review gate is the one box that does not scale. Humans drag cards, flip policy switches, cut the lights and approve at the gate; the agent calls get_floor, enqueue_work, pull_next, advance_stage, record_check, set_autonomy, link_pr, request_review, resolve_review, set_factory_mode and sync_from_github.",
            actions,
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    loadState();
                    entry = await startServer(ctx.instanceId);
                    servers.set(ctx.instanceId, entry);
                }
                return { title: "Factory Floor", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (!entry) return;
                servers.delete(ctx.instanceId);
                clients.delete(ctx.instanceId);
                persist();
                await new Promise((resolve) => entry.server.close(() => resolve()));
            },
        }),
    ],
});

await session.log("Factory Floor ready — the review gate is the only expensive box.");
