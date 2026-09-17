// Factory Floor — shared state, autonomy policy resolution, and persistence.
//
// The state here is the factory's ledger: which work is in which stage, what the
// gates said about it, and whether a human is required before it ships. The
// autonomy policy is read from the repo's factory.config.json, so flipping a
// switch on the canvas edits real policy rather than a display flag.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIR = resolve(HERE, "..");
const ARTIFACT_PATH = join(EXTENSION_DIR, "artifacts", "floor.json");

/** Repo root, walking up from `.github/extensions/factory-floor`. */
export const REPO_ROOT = resolve(EXTENSION_DIR, "..", "..", "..");
const CONFIG_PATH = join(REPO_ROOT, "factory.config.json");

export const LANES = ["intake", "queue", "harness", "checks", "review", "shipped"];

export const LANE_META = {
    intake: { label: "Intake", blurb: "Intent and signals arriving" },
    queue: { label: "Queue", blurb: "Waiting for a loop" },
    harness: { label: "Harness", blurb: "An agent is building" },
    checks: { label: "Checks", blurb: "Typecheck, test, lint" },
    review: { label: "Review Gate", blurb: "Judgment. The one box that does not scale." },
    shipped: { label: "Shipped", blurb: "Merged to main" },
};

const FALLBACK_CONFIG = {
    repo: "",
    defaultAutonomy: "lit",
    rules: [],
    gates: { required: ["Typecheck", "Test", "Lint"] },
    loop: { targetSteps: 10, warnAfterSteps: 20 },
    intake: { labels: [], signalLabels: [] },
};

// ---------------------------------------------------------------------------
// Glob matching
// ---------------------------------------------------------------------------

const REGEX_SPECIALS = new Set([".", "+", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]);

/**
 * Convert a path glob to an anchored RegExp.
 * Supports `**` (any depth), `*` (within one segment) and `?` (one character).
 */
export function globToRegExp(glob) {
    let out = "";
    for (let i = 0; i < glob.length; i++) {
        const char = glob[i];
        if (char === "*") {
            if (glob[i + 1] === "*") {
                if (glob[i + 2] === "/") {
                    out += "(?:.*/)?";
                    i += 2;
                } else {
                    out += ".*";
                    i += 1;
                }
            } else {
                out += "[^/]*";
            }
        } else if (char === "?") {
            out += "[^/]";
        } else if (REGEX_SPECIALS.has(char)) {
            out += `\\${char}`;
        } else {
            out += char;
        }
    }
    return new RegExp(`^${out}$`);
}

function normalisePath(path) {
    return String(path ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export function loadConfig() {
    try {
        if (!existsSync(CONFIG_PATH)) return { ...FALLBACK_CONFIG };
        const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
        return { ...FALLBACK_CONFIG, ...parsed };
    } catch {
        return { ...FALLBACK_CONFIG };
    }
}

export function saveConfig(config) {
    writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * Flip the whole factory between lit and lights-out.
 *
 * Going dark stashes each rule's authored autonomy in `restoreAutonomy` and sets
 * everything to dark, so the change is reversible and visible in the diff of
 * factory.config.json. This is the demo of the argument, not a recommendation:
 * a factory with every switch in the same position is the failure mode, whichever
 * position that is.
 */
export function setFactoryMode(mode) {
    const config = loadConfig();
    const target = mode === "dark" ? "dark" : "lit";

    for (const rule of config.rules ?? []) {
        if (target === "dark") {
            if (rule.restoreAutonomy === undefined) rule.restoreAutonomy = rule.autonomy;
            rule.autonomy = "dark";
        } else if (rule.restoreAutonomy !== undefined) {
            rule.autonomy = rule.restoreAutonomy;
            delete rule.restoreAutonomy;
        }
    }

    config.mode = target;
    config.defaultAutonomy = target === "dark" ? "dark" : (config.authoredDefaultAutonomy ?? "lit");
    if (target === "dark" && config.authoredDefaultAutonomy === undefined) {
        config.authoredDefaultAutonomy = "lit";
    }
    if (target === "lit") delete config.authoredDefaultAutonomy;

    saveConfig(config);
    return config;
}

export function factoryMode(config = loadConfig()) {
    return config.mode === "dark" ? "dark" : "lit";
}

/** First rule whose globs match wins, so declaration order in the config is meaningful. */
export function resolvePathRule(config, path) {
    const candidate = normalisePath(path);
    if (!candidate) return null;
    for (const rule of config.rules ?? []) {
        for (const glob of rule.paths ?? []) {
            if (globToRegExp(normalisePath(glob)).test(candidate)) return rule;
        }
    }
    return null;
}

const BLAST_ORDER = { low: 0, medium: 1, high: 2 };

/**
 * Resolve autonomy for a whole change.
 *
 * Lit wins over dark. A change that touches even one lit path is lit, because
 * back pressure is about the riskiest thing in the diff, not the average one.
 */
export function resolveAutonomy(config, paths) {
    const fallback = config.defaultAutonomy ?? "lit";
    const list = (paths ?? []).map(normalisePath).filter(Boolean);
    if (list.length === 0) {
        return {
            autonomy: fallback,
            blastRadius: "medium",
            reason: "No paths declared yet, so the safe default applies.",
            ruleIds: [],
        };
    }

    let autonomy = "dark";
    let blastRadius = "low";
    let reason = "";
    const ruleIds = [];
    let unmatched = false;

    for (const path of list) {
        const rule = resolvePathRule(config, path);
        if (!rule) {
            unmatched = true;
            continue;
        }
        if (!ruleIds.includes(rule.id)) ruleIds.push(rule.id);
        if (rule.autonomy === "lit" && autonomy !== "lit") {
            autonomy = "lit";
            reason = rule.reason ?? "";
        }
        if (BLAST_ORDER[rule.blastRadius ?? "low"] > BLAST_ORDER[blastRadius]) {
            blastRadius = rule.blastRadius ?? "low";
        }
    }

    if (unmatched && autonomy !== "lit" && fallback === "lit") {
        autonomy = "lit";
        reason = "A path matched no rule, so the default applies. Unknown territory keeps the lights on.";
    }
    if (autonomy === "dark" && !reason) {
        reason = "Every touched path has a cheap, hard-to-fake oracle and a small blast radius.";
    }
    return { autonomy, blastRadius, reason, ruleIds };
}

/** The autonomy a card actually runs under, honouring a manual per-card override. */
export function effectiveAutonomy(config, card) {
    const resolved = resolveAutonomy(config, card.paths);
    if (card.autonomyOverride === "dark" || card.autonomyOverride === "lit") {
        return {
            ...resolved,
            autonomy: card.autonomyOverride,
            overridden: true,
            reason: `Manually overridden to ${card.autonomyOverride}. Policy would have said ${resolved.autonomy}.`,
        };
    }
    return { ...resolved, overridden: false };
}

// ---------------------------------------------------------------------------
// Board state
// ---------------------------------------------------------------------------

function emptyState() {
    const config = loadConfig();
    return {
        repo: config.repo ?? "",
        cards: [],
        nextId: 1,
        lastSync: null,
        policyOpen: false,
        legendOpen: false,
    };
}

let state = null;

export function loadState() {
    if (state) return state;
    try {
        if (existsSync(ARTIFACT_PATH)) {
            const parsed = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
            state = { ...emptyState(), ...parsed };
            state.cards = Array.isArray(state.cards) ? state.cards : [];
            return state;
        }
    } catch {
        // A corrupt artifact should not take the canvas down; start clean instead.
    }
    state = emptyState();
    return state;
}

export function persist() {
    try {
        mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
        writeFileSync(ARTIFACT_PATH, `${JSON.stringify(loadState(), null, 2)}\n`, "utf8");
    } catch {
        // Persistence is a convenience. Losing it must not break the session.
    }
}

/** Clear the board back to an empty floor, keeping the repo and policy intact. */
export function resetBoard() {
    const board = loadState();
    board.cards = [];
    board.nextId = 1;
    board.lastSync = null;
    return board;
}

export function findCard(id) {
    return loadState().cards.find((card) => String(card.id) === String(id)) ?? null;
}
export function findCardByIssue(issue) {
    return loadState().cards.find((card) => card.issue === Number(issue)) ?? null;
}

export function record(card, note) {
    card.history = card.history ?? [];
    card.history.push({ at: new Date().toISOString(), note });
    if (card.history.length > 40) card.history = card.history.slice(-40);
}

export function createCard(fields = {}) {
    const board = loadState();
    const card = {
        id: board.nextId++,
        issue: fields.issue ?? null,
        title: fields.title ?? "Untitled work",
        kind: fields.kind ?? "intent",
        lane: LANES.includes(fields.lane) ? fields.lane : "intake",
        paths: Array.isArray(fields.paths) ? fields.paths : [],
        checks: fields.checks ?? {},
        pr: fields.pr ?? null,
        prUrl: fields.prUrl ?? null,
        url: fields.url ?? null,
        verdict: null,
        reviewNote: null,
        autonomyOverride: null,
        shippedUnread: false,
        history: [],
        enteredAt: new Date().toISOString(),
    };
    record(card, `entered ${LANE_META[card.lane].label}`);
    board.cards.push(card);
    return card;
}

export function moveCard(card, lane) {
    if (!LANES.includes(lane)) {
        throw new Error(`Unknown lane "${lane}". Expected one of: ${LANES.join(", ")}`);
    }
    const from = card.lane;
    card.lane = lane;
    card.enteredAt = new Date().toISOString();
    record(card, `${LANE_META[from]?.label ?? from} → ${LANE_META[lane].label}`);
    return { from, to: lane };
}

/** Gate status across the required checks, used to decide whether a card may leave Checks. */
export function gateStatus(config, card) {
    const required = config.gates?.required ?? [];
    const results = required.map((name) => ({ name, status: card.checks?.[name] ?? "pending" }));
    const failed = results.filter((r) => r.status === "fail");
    const pending = results.filter((r) => r.status !== "pass" && r.status !== "fail");
    if (failed.length > 0) {
        return { state: "fail", results, summary: `${failed.map((r) => r.name).join(", ")} failing` };
    }
    if (pending.length > 0) {
        return { state: "pending", results, summary: `${pending.length} of ${required.length} still to report` };
    }
    return { state: "pass", results, summary: "all gates green" };
}

/**
 * A snapshot enriched with everything the UI and the agent need, so neither has
 * to re-derive policy for itself.
 */
export function snapshot() {
    const board = loadState();
    const config = loadConfig();
    const cards = board.cards.map((card) => ({
        ...card,
        resolved: effectiveAutonomy(config, card),
        gate: gateStatus(config, card),
    }));

    const shipped = cards.filter((c) => c.lane === "shipped");
    const shippedUnread = shipped.filter((c) => c.shippedUnread);

    return {
        repo: board.repo || config.repo || "",
        lanes: LANES,
        laneMeta: LANE_META,
        cards,
        config,
        mode: config.mode === "dark" ? "dark" : "lit",
        lastSync: board.lastSync,
        policyOpen: board.policyOpen ?? false,
        legendOpen: board.legendOpen ?? false,
        stats: {
            total: cards.length,
            atGate: cards.filter((c) => c.lane === "review").length,
            inFlight: cards.filter((c) => c.lane !== "shipped" && c.lane !== "intake").length,
            shipped: shipped.length,
            shippedUnread: shippedUnread.length,
            // Comprehension debt, measured the only honest way available here:
            // the share of shipped work that no human read before it merged.
            unreadShare: shipped.length === 0 ? 0 : Math.round((shippedUnread.length / shipped.length) * 100),
            lit: cards.filter((c) => c.resolved.autonomy === "lit").length,
            dark: cards.filter((c) => c.resolved.autonomy === "dark").length,
        },
    };
}
