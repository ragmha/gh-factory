// Factory Floor — the guided demo.
//
// The argument this canvas makes is about motion, not layout: work arriving,
// cheap checks firing, and exactly one box where a person has to think. A
// static board cannot show that. This script drives the real mechanics — the
// same advance(), resolveReview() and switchMode() the buttons and the agent
// actions call — so nothing here is theatre. The board earns its state.
//
// Cards that carry an issue number carry a real one from this repo and link out
// to it. Work with no issue is left without one rather than given a
// plausible-looking number, because a link that 404s is worse than no link.

import { loadConfig, loadState, resetBoard, createCard, findCard, record } from "./state.mjs";

/** Default pace, in milliseconds per step. Slow enough to read the caption. */
const STEP_MS = 3000;

const SPEEDS = [0.5, 1, 2];

function issueUrl(number) {
    const repo = loadState().repo || loadConfig().repo || "";
    return repo ? `https://github.com/${repo}/issues/${number}` : null;
}

/**
 * The script, built against the mechanics rather than importing them, so the
 * demo cannot drift away from what the buttons actually do.
 */
function buildScript({ advance, resolveReview, switchMode }) {
    const at = (id) => findCard(id);

    const required = () => loadConfig().gates?.required ?? [];

    const setCheck = (id, name, status) => {
        const card = at(id);
        if (!card || !name) return;
        card.checks = { ...card.checks, [name]: status };
        record(card, `${name}: ${status}`);
    };

    const greenAll = (id) => {
        for (const name of required()) setCheck(id, name, "pass");
    };

    const redFirst = (id) => {
        const [first, ...rest] = required();
        setCheck(id, first, "fail");
        for (const name of rest) setCheck(id, name, "pass");
    };

    const move = (id, lane) => {
        const card = at(id);
        if (card) advance(card, lane);
    };

    const note = (id, text) => {
        const card = at(id);
        if (!card) return;
        card.reviewNote = text;
        record(card, `review requested: ${text}`);
    };

    const verdict = (id, value, text) => {
        const card = at(id);
        if (card) resolveReview(card, value, text);
    };

    return [
        {
            caption:
                "A signal comes back from production. The SRE agent saw a burst of 500s — nobody filed this, the system noticed it.",
            run: () =>
                createCard({
                    issue: 9,
                    url: issueUrl(9),
                    title: "SRE Agent finding: burst of 500s from /api/chaos/error",
                    kind: "signal",
                    lane: "intake",
                    paths: ["apps/api/src/index.js"],
                }),
        },
        {
            caption: "Four more pieces of work land in intake. Two came from issues, two are chores nobody filed.",
            run: () => {
                createCard({
                    title: "Backfill cart edge-case tests (zero qty, unknown product)",
                    kind: "intent",
                    lane: "intake",
                    paths: ["apps/api/src/cart.test.js"],
                });
                createCard({
                    title: "Document the cart API in the README",
                    kind: "intent",
                    lane: "intake",
                    paths: ["README.md"],
                });
                createCard({
                    issue: 5,
                    url: issueUrl(5),
                    title: "Show live item-count badge in the cart header",
                    kind: "intent",
                    lane: "intake",
                    paths: ["apps/web/src/App.tsx", "apps/web/src/App.css"],
                });
                createCard({
                    issue: 7,
                    url: issueUrl(7),
                    title: "Review: put /api/chaos/error behind an env flag",
                    kind: "intent",
                    lane: "intake",
                    paths: ["apps/api/src/index.js", "docker-compose.yml"],
                });
            },
        },
        {
            caption:
                "Policy has already decided which ones need a person, before a line is written. Amber is lit, grey is dark.",
            run: () => {},
        },
        {
            caption:
                "Look at the badge card: it touches a .tsx file (lit) and a .css file (dark). Lit wins — back pressure follows the riskiest thing in the diff, not the average.",
            run: () => {},
        },
        {
            caption: "All five are queued for a loop.",
            run: () => [1, 2, 3, 4, 5].forEach((id) => move(id, "queue")),
        },
        {
            caption: "Two loops start: the 500s fix and the test backfill.",
            run: () => {
                move(1, "harness");
                move(2, "harness");
            },
        },
        {
            caption: "Both reach the checks. This is the cheap, fast part of the factory — it scales for free.",
            run: () => {
                move(1, "checks");
                move(2, "checks");
            },
        },
        {
            caption: "CI reports. The API fix is red; the test backfill is green on every gate.",
            run: () => {
                redFirst(1);
                greenAll(2);
            },
        },
        {
            caption:
                "The agent tries to ship the API fix anyway. The red gate holds it — that is the loop saying it is not done.",
            run: () => move(1, "shipped"),
        },
        {
            caption:
                "The test backfill ships unattended. Cheap oracle, runs on every push, hard to fake, small blast radius — that loop earned the dark.",
            run: () => move(2, "shipped"),
        },
        {
            caption: "The agent fixes the handler and the gate goes green.",
            run: () => greenAll(1),
        },
        {
            caption:
                "It tries to ship again. Every gate is green — but index.js is a public contract, so policy routes it to the gate instead of main.",
            run: () => move(1, "shipped"),
        },
        {
            caption: "The reviewer is told what to actually look at, not just that something is waiting.",
            run: () =>
                note(
                    1,
                    "Green only proves the handler returns. Confirm the error is handled rather than swallowed, and that the 500 is not simply being converted into a silent 200.",
                ),
        },
        {
            caption: "Meanwhile the README work runs the same loop, start to finish.",
            run: () => {
                move(3, "harness");
                move(3, "checks");
                greenAll(3);
            },
        },
        {
            caption: "Docs ship dark. No runtime effect, so nobody is asked to read it.",
            run: () => move(3, "shipped"),
        },
        {
            caption: "The cart badge and the env-flag change run their loops too.",
            run: () => {
                move(4, "harness");
                move(5, "harness");
                move(4, "checks");
                move(5, "checks");
                greenAll(4);
                greenAll(5);
            },
        },
        {
            caption: "Both are green. Both are lit. Both land at the gate rather than in main.",
            run: () => {
                move(4, "shipped");
                move(5, "shipped");
                note(
                    4,
                    "Build only proves it compiles. Is the badge count correct after removing the last item, and is the change announced to screen readers?",
                );
                note(
                    5,
                    "The flag exists, but what does it default to? A chaos endpoint that stays live unless someone opts out is the same bug with extra steps.",
                );
            },
        },
        {
            caption: "A human reads the 500s fix and approves it. That one shipped read.",
            run: () =>
                verdict(
                    1,
                    "approved",
                    "Error is handled and still logged, and the status code is honest. Checked the reproduction against the original trace.",
                ),
        },
        {
            caption: "And catches what CI never could: the flag defaults to on. Every check was green either way.",
            run: () =>
                verdict(
                    5,
                    "changes-requested",
                    "Flag defaults to enabled, so the endpoint stays live in production unless someone remembers to turn it off. Invert the default and add a test that asserts it.",
                ),
        },
        {
            caption:
                "This is a working factory: most work ships itself, and human judgment went to the two places where it changed the outcome.",
            run: () => {},
        },
        {
            caption: "Now the counter-argument. Lights out — every rule goes dark at once.",
            run: () => switchMode("dark"),
        },
        {
            caption:
                "The gate drained. Everything waiting on a person shipped unread, and every test is still green. That is exactly what makes it hard to notice.",
            run: () => {},
        },
        {
            caption: "Lights back on. The authored policy is restored from factory.config.json, unchanged.",
            run: () => switchMode("lit"),
        },
    ];
}

/**
 * A stepper over the script. State lives here rather than in the board artifact,
 * because where the demo is up to is a property of this session, not of the repo.
 */
export function createDemo({ commit, mechanics }) {
    let script = null;
    let index = 0;
    let playing = false;
    let timer = null;
    let speed = 1;

    const steps = () => (script ??= buildScript(mechanics));

    const interval = () => Math.round(STEP_MS / speed);

    function status() {
        const all = steps();
        return {
            playing,
            step: index,
            total: all.length,
            caption: index > 0 ? all[index - 1].caption : null,
            finished: index >= all.length,
            speed,
            speeds: SPEEDS,
        };
    }

    function clearTimer() {
        if (timer) clearTimeout(timer);
        timer = null;
    }

    function schedule() {
        clearTimer();
        timer = setTimeout(runStep, interval());
        // The demo must never be the reason this process stays alive.
        if (typeof timer.unref === "function") timer.unref();
    }

    function runStep() {
        const all = steps();
        if (index >= all.length) {
            playing = false;
            clearTimer();
            commit();
            return;
        }
        const current = all[index];
        index += 1;
        try {
            current.run();
        } catch {
            // One bad step should not strand the runner mid-demo.
        }
        commit();
        if (playing) schedule();
    }

    function reset() {
        clearTimer();
        playing = false;
        index = 0;
        resetBoard();
        // Leave the repo's policy file the way the demo found it.
        mechanics.switchMode("lit");
        commit();
        return status();
    }

    function play() {
        // The script addresses cards by the ids a fresh board hands out, so a run
        // must start from an empty floor. Resuming a paused run must not.
        const atStart = index === 0 || index >= steps().length;
        if (atStart) reset();
        playing = true;
        runStep();
        return status();
    }

    function pause() {
        playing = false;
        clearTimer();
        commit();
        return status();
    }

    /** Change pace mid-run without losing the place. */
    function setSpeed(value) {
        const next = Number(value);
        if (!SPEEDS.includes(next)) return status();
        speed = next;
        if (playing) schedule();
        commit();
        return status();
    }

    function stop() {
        clearTimer();
        playing = false;
    }

    return {
        status,
        play,
        pause,
        reset,
        setSpeed,
        stop,
        toggle: () => (playing ? pause() : play()),
    };
}

export { STEP_MS, SPEEDS };
