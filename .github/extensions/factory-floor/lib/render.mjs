// Factory Floor — the rendered surface.
//
// One page, server-rendered shell plus a small client that re-renders from a
// server-sent-events stream. Everything a person can do here is also something
// the agent can do through a canvas action, and both write to the same state.

const LANE_ACCENT = {
    intake: "#8b949e",
    queue: "#58a6ff",
    harness: "#a371f7",
    checks: "#3fb950",
    review: "#d29922",
    shipped: "#2ea043",
};

export function renderHtml(snapshot) {
    const initial = JSON.stringify(snapshot).replace(/</g, "\\u003c");
    const accents = JSON.stringify(LANE_ACCENT);

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Factory Floor</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: var(--background-color-default, #0d1117);
    --surface: var(--background-color-subtle, #161b22);
    --border: var(--border-color-default, #30363d);
    --text: var(--text-color-default, #e6edf3);
    --muted: var(--text-color-muted, #8b949e);
    --accent-lit: #d29922;
    --accent-dark: #6e7681;
    --pass: #3fb950;
    --fail: #f85149;
  }

  body {
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif);
    font-size: 13px;
    line-height: 1.5;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ---------- header ---------- */
  header {
    flex-shrink: 0;
    padding: 14px 18px 12px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, rgba(210,153,34,0.05), transparent);
  }
  .title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h1 { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  h1 .spark { color: var(--accent-lit); }
  .repo {
    font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
    font-size: 11px; color: var(--muted);
    background: rgba(139,148,158,0.12);
    padding: 2px 8px; border-radius: 10px;
  }
  .actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .actions .sep { width: 1px; height: 18px; background: var(--border); margin: 0 2px; }
  button {
    font: inherit; font-size: 11px; cursor: pointer;
    background: rgba(139,148,158,0.12);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px; padding: 4px 10px;
    transition: background .12s ease, border-color .12s ease;
  }
  button:hover { background: rgba(139,148,158,0.22); }
  button:disabled { opacity: .5; cursor: default; }
  button.primary { background: rgba(46,160,67,0.18); border-color: rgba(46,160,67,0.5); color: #56d364; }
  button.primary:hover { background: rgba(46,160,67,0.3); }
  button.danger { background: rgba(248,81,73,0.14); border-color: rgba(248,81,73,0.45); color: #ff7b72; }
  button.danger:hover { background: rgba(248,81,73,0.26); }
  button.on { background: rgba(88,166,255,0.2); border-color: rgba(88,166,255,0.55); color: #79c0ff; }
  button.lights-out { background: rgba(248,81,73,0.16); border-color: rgba(248,81,73,0.5); color: #ff7b72; }

  /* ---------- lights out ---------- */
  body.dark-factory { background: #08090c; }
  body.dark-factory header { background: linear-gradient(180deg, rgba(248,81,73,0.07), transparent); }
  body.dark-factory .lane { opacity: .62; }
  body.dark-factory .lane.gate { border-color: var(--border); box-shadow: none; opacity: .38; }
  body.dark-factory .lane.gate .name { color: var(--muted); }
  body.dark-factory .debt .fill { background: var(--fail); }
  .lights-banner {
    display: none; margin-top: 10px; padding: 6px 11px; border-radius: 7px;
    background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.4);
    color: #ff9492; font-size: 11.5px;
  }
  body.dark-factory .lights-banner { display: block; }

  /* ---------- demo runner ---------- */
  .demo-strip {
    display: flex; align-items: center; gap: 10px; margin-top: 10px;
    padding: 6px 11px; border-radius: 7px;
    background: rgba(88,166,255,0.08); border: 1px solid rgba(88,166,255,0.32);
  }
  .demo-strip[hidden] { display: none; }
  .demo-strip .step {
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    font-size: 10.5px; color: #79c0ff; white-space: nowrap;
  }
  .demo-strip .bar { width: 90px; height: 4px; border-radius: 3px; background: rgba(139,148,158,0.25); overflow: hidden; flex-shrink: 0; }
  .demo-strip .bar .fill { height: 100%; background: #58a6ff; transition: width .35s ease; }
  .demo-strip .caption { font-size: 11.5px; color: var(--text); line-height: 1.4; }
  button.playing { background: rgba(88,166,255,0.2); border-color: rgba(88,166,255,0.55); color: #79c0ff; }
  .speed { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
  .speed button { border: 0; border-radius: 0; padding: 4px 9px; background: transparent; font-size: 10.5px; }
  .speed button.sel { background: rgba(88,166,255,0.22); color: #79c0ff; }

  /* ---------- pipeline strip ---------- */
  .pipeline { display: flex; align-items: center; gap: 4px; margin-top: 12px; flex-wrap: wrap; }
  .pipe-node {
    display: flex; align-items: baseline; gap: 6px;
    padding: 3px 10px; border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    font-size: 11px;
  }
  .pipe-node .n { font-weight: 600; font-size: 12px; }
  .pipe-node.gate { border-color: rgba(210,153,34,0.55); background: rgba(210,153,34,0.1); }
  .pipe-node.gate .label { color: var(--accent-lit); }
  .pipe-arrow { color: var(--muted); font-size: 11px; }
  .pipe-note { margin-left: auto; font-size: 11px; color: var(--muted); font-style: italic; }

  /* ---------- policy switchboard ---------- */
  .policy {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: rgba(22,27,34,0.6);
    max-height: 42vh; overflow-y: auto;
    padding: 12px 18px 14px;
  }
  .policy[hidden] { display: none; }
  .policy h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-bottom: 4px; }
  .policy .lede { font-size: 11px; color: var(--muted); margin-bottom: 10px; max-width: 70ch; }
  .rule {
    display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;
    padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg); margin-bottom: 6px;
  }
  .rule .globs {
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    font-size: 11px; color: #79c0ff; margin-bottom: 2px;
  }
  .rule .why { font-size: 11px; color: var(--muted); }
  .switch { display: flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; }
  .switch button { border: 0; border-radius: 0; padding: 3px 11px; background: transparent; font-size: 11px; }
  .switch button.sel[data-v="lit"] { background: rgba(210,153,34,0.25); color: #e3b341; }
  .switch button.sel[data-v="dark"] { background: rgba(110,118,129,0.3); color: #adbac7; }

  /* ---------- lit vs dark legend ---------- */
  .legend {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: rgba(22,27,34,0.6);
    max-height: 46vh; overflow-y: auto;
    padding: 14px 18px 16px;
  }
  .legend[hidden] { display: none; }
  .legend h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-bottom: 10px; }
  .legend .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .legend .def { padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
  .legend .def.lit { border-left: 3px solid var(--accent-lit); }
  .legend .def.dark { border-left: 3px solid var(--accent-dark); }
  .legend .def h3 { font-size: 12px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
  .legend .def.lit h3 { color: #e3b341; }
  .legend .def.dark h3 { color: #adbac7; }
  .legend .def p { font-size: 11.5px; color: var(--muted); line-height: 1.5; }
  .legend .def .earn { margin-top: 7px; font-size: 11px; color: var(--muted); }
  .legend .def .earn li { margin-left: 15px; line-height: 1.55; }
  .legend .def .earn strong { color: var(--text); font-weight: 600; }
  .legend .rules-of-thumb { display: flex; flex-direction: column; gap: 7px; }
  .legend .tip {
    font-size: 11.5px; color: var(--muted); line-height: 1.5;
    padding: 7px 11px; border-radius: 7px;
    background: rgba(139,148,158,0.07); border: 1px solid var(--border);
  }
  .legend .tip b { color: var(--text); font-weight: 600; }
  .legend code {
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    font-size: 10.5px; background: rgba(139,148,158,0.14); padding: 1px 5px; border-radius: 4px; color: #79c0ff;
  }

  /* ---------- board ---------- */
  .board { flex: 1; display: flex; gap: 10px; padding: 14px 18px; overflow-x: auto; min-height: 0; }
  .lane {
    flex: 1 0 224px; min-width: 224px; max-width: 300px;
    display: flex; flex-direction: column;
    background: rgba(22,27,34,0.55);
    border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
  }
  .lane.gate { border-color: rgba(210,153,34,0.5); box-shadow: 0 0 0 1px rgba(210,153,34,0.14), 0 0 22px rgba(210,153,34,0.09); }
  .lane.drop { border-color: #58a6ff; background: rgba(88,166,255,0.07); }
  .lane-head { padding: 9px 11px 8px; border-bottom: 1px solid var(--border); }
  .lane-head .top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .lane-head .name { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; display: flex; align-items: center; gap: 6px; }
  .lane-head .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .lane-head .count { background: rgba(139,148,158,0.2); padding: 0 7px; border-radius: 10px; font-size: 11px; color: var(--muted); }
  .lane-head .blurb { font-size: 10.5px; color: var(--muted); margin-top: 3px; }
  .lane-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 7px; min-height: 40px; }
  .lane-empty { font-size: 11px; color: var(--muted); text-align: center; padding: 14px 6px; font-style: italic; opacity: .65; }

  /* ---------- cards ---------- */
  .card {
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 9px; cursor: grab; transition: border-color .12s ease, transform .12s ease;
  }
  .card:hover { border-color: #484f58; }
  .card.dragging { opacity: .45; cursor: grabbing; }
  .card.selected { border-color: #58a6ff; box-shadow: 0 0 0 1px rgba(88,166,255,0.35); }
  .card.lit { border-left: 3px solid var(--accent-lit); }
  .card.dark { border-left: 3px solid var(--accent-dark); }
  .card .head { display: flex; align-items: flex-start; gap: 6px; justify-content: space-between; }
  .card .title { font-size: 12px; font-weight: 500; line-height: 1.35; }
  .card .issue { font-size: 10.5px; color: var(--muted); font-family: var(--font-mono, ui-monospace, Consolas, monospace); white-space: nowrap; }
  .card .issue a { color: #58a6ff; text-decoration: none; }
  .card .issue a:hover { text-decoration: underline; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
  .pill { font-size: 10px; padding: 1px 7px; border-radius: 10px; border: 1px solid transparent; white-space: nowrap; }
  .pill.lit { background: rgba(210,153,34,0.16); color: #e3b341; border-color: rgba(210,153,34,0.35); }
  .pill.dark { background: rgba(110,118,129,0.2); color: #adbac7; border-color: rgba(110,118,129,0.4); }
  .pill.blast-high { background: rgba(248,81,73,0.14); color: #ff7b72; }
  .pill.blast-medium { background: rgba(210,153,34,0.12); color: #d8a63a; }
  .pill.blast-low { background: rgba(63,185,80,0.12); color: #56d364; }
  .pill.override { background: rgba(163,113,247,0.16); color: #d2a8ff; border-color: rgba(163,113,247,0.4); }
  .gates { display: flex; gap: 3px; margin-top: 7px; }
  .gate-chip {
    flex: 1; text-align: center; font-size: 9.5px; padding: 2px 0; border-radius: 4px;
    background: rgba(139,148,158,0.14); color: var(--muted);
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
  }
  .gate-chip.pass { background: rgba(63,185,80,0.18); color: #56d364; }
  .gate-chip.fail { background: rgba(248,81,73,0.18); color: #ff7b72; }
  .paths { margin-top: 6px; font-size: 10px; color: var(--muted); font-family: var(--font-mono, ui-monospace, Consolas, monospace); word-break: break-all; }
  .why { margin-top: 6px; font-size: 10.5px; color: var(--muted); font-style: italic; line-height: 1.4; }
  .card-actions { display: flex; gap: 5px; margin-top: 9px; }
  .card-actions button { flex: 1; padding: 3px 6px; font-size: 10.5px; }
  .verdict { margin-top: 7px; font-size: 10.5px; padding: 4px 7px; border-radius: 5px; }
  .verdict.approved { background: rgba(46,160,67,0.14); color: #56d364; }
  .verdict.changes { background: rgba(248,81,73,0.14); color: #ff7b72; }

  /* ---------- footer ---------- */
  footer {
    flex-shrink: 0; border-top: 1px solid var(--border); padding: 9px 18px;
    display: flex; align-items: center; gap: 14px; font-size: 11px; color: var(--muted);
  }
  .debt { display: flex; align-items: center; gap: 8px; }
  .debt .bar { width: 130px; height: 5px; border-radius: 3px; background: rgba(139,148,158,0.22); overflow: hidden; }
  .debt .fill { height: 100%; background: var(--accent-dark); transition: width .3s ease; }
  .sync { margin-left: auto; }

  #toast {
    position: fixed; bottom: 52px; left: 50%; transform: translateX(-50%) translateY(8px);
    background: #1f6feb; color: #fff; padding: 6px 14px; border-radius: 16px;
    font-size: 11.5px; opacity: 0; pointer-events: none; transition: opacity .2s ease, transform .2s ease;
  }
  #toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* ---------- card detail sheet ---------- */
  .sheet-backdrop {
    position: fixed; inset: 0; background: rgba(1,4,9,0.55); z-index: 40;
    opacity: 0; pointer-events: none; transition: opacity .15s ease;
  }
  .sheet-backdrop.show { opacity: 1; pointer-events: auto; }
  .sheet {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 41;
    width: min(390px, 94%);
    display: flex; flex-direction: column;
    background: var(--surface); border-left: 1px solid var(--border);
    box-shadow: -18px 0 40px rgba(1,4,9,0.5);
    transform: translateX(101%); transition: transform .18s ease;
  }
  .sheet.show { transform: translateX(0); }
  .sheet-head {
    flex-shrink: 0; padding: 13px 15px 11px; border-bottom: 1px solid var(--border);
    display: flex; gap: 10px; align-items: flex-start; justify-content: space-between;
  }
  .sheet-head h2 { font-size: 13px; font-weight: 600; line-height: 1.4; }
  .sheet-head .sub { font-size: 10.5px; color: var(--muted); margin-top: 3px; }
  .sheet-head .sub a { color: #58a6ff; text-decoration: none; }
  .sheet-head .sub a:hover { text-decoration: underline; }
  .sheet-close { flex-shrink: 0; font-size: 14px; line-height: 1; padding: 3px 9px; }
  .sheet-body { flex: 1; overflow-y: auto; padding: 13px 15px 20px; display: flex; flex-direction: column; gap: 15px; }
  .sheet section h3 {
    font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted); margin-bottom: 7px;
  }
  .sheet .kv { font-size: 11.5px; color: var(--muted); line-height: 1.55; }
  .sheet .kv + .kv { margin-top: 4px; }
  .sheet .kv b { color: var(--text); font-weight: 600; }
  .sheet .pathlist {
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    font-size: 11px; color: #79c0ff; display: flex; flex-direction: column; gap: 3px; word-break: break-all;
  }
  .sheet .timeline { border-left: 1px solid var(--border); margin-left: 4px; padding-left: 14px; }
  .sheet .ev { position: relative; padding: 5px 0; font-size: 11.5px; line-height: 1.45; color: var(--text); }
  .sheet .ev::before {
    content: ""; position: absolute; left: -18px; top: 11px;
    width: 7px; height: 7px; border-radius: 50%; background: var(--border);
  }
  .sheet .ev.latest::before { background: #58a6ff; }
  .sheet .ev .t {
    font-family: var(--font-mono, ui-monospace, Consolas, monospace);
    font-size: 10px; color: var(--muted); margin-right: 7px;
  }
</style>
</head>
<body>

<header>
  <div class="title-row">
    <h1><span class="spark">◆</span> Factory Floor <span class="repo" id="repo"></span></h1>
    <div class="actions">
      <button id="demo-btn" class="primary">▶ Play demo</button>
      <span class="speed" id="speed"></span>
      <button id="demo-reset">Reset</button>
      <span class="sep"></span>
      <button id="legend-btn">Lit vs dark</button>
      <button id="mode-btn">Lights out</button>
      <button id="policy-btn">Policy</button>
      <button id="sync-btn">Sync from GitHub</button>
    </div>
  </div>
  <div class="pipeline" id="pipeline"></div>
  <div class="demo-strip" id="demo-strip" hidden>
    <span class="step" id="demo-step"></span>
    <div class="bar"><div class="fill" id="demo-fill"></div></div>
    <span class="caption" id="demo-caption"></span>
  </div>
  <div class="lights-banner">
    Lights out. Every rule is dark and the review gate is bypassed — nothing waits on a person.
    The tests are still green. That is exactly what makes this hard to notice.
  </div>
</header>

<section class="legend" id="legend" hidden>
  <h2>What lit and dark mean</h2>
  <div class="pair">
    <div class="def lit">
      <h3>◉ Lit — a person reads it before it ships</h3>
      <p>
        Not because the agent is careless, but because the automated check is a weak oracle next to
        the cost of being wrong. <code>az bicep build</code> proves a template parses; it says nothing
        about what happens to running infrastructure. Green tells you the code ran, not that it is right.
      </p>
      <div class="earn">
        <strong>Typical lit work:</strong> money and pricing, public contracts, infrastructure,
        the pipeline itself, anything where failure is silent or slow to surface.
      </div>
    </div>
    <div class="def dark">
      <h3>○ Dark — it ships unattended on green</h3>
      <p>
        No human in the loop. A loop does not start dark; it has to earn it. Every touched path must
        have an oracle that is genuinely good enough to be the last word.
      </p>
      <div class="earn">
        <strong>Earning the dark takes all four:</strong>
        <ul>
          <li><strong>Cheap</strong> — runs in seconds, not overnight.</li>
          <li><strong>Frequent</strong> — on every change, not on a schedule.</li>
          <li><strong>Hard to fake</strong> — passing it means the thing actually works.</li>
          <li><strong>Small blast radius</strong> — if it is wrong anyway, the damage is bounded and reversible.</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="rules-of-thumb">
    <div class="tip">
      <b>Lit wins.</b> A change touching one lit path is lit, even if everything else in the diff is dark.
      Back pressure is about the riskiest thing in the change, not the average of it.
    </div>
    <div class="tip">
      <b>Unknown territory stays lit.</b> A path matching no rule falls back to the default, which is lit.
      New parts of the codebase have not earned anything yet.
    </div>
    <div class="tip">
      <b>Blast radius is a separate axis.</b> It is how much breaks if this is wrong, not who checks it.
      High blast with a cheap oracle is still lit — that combination is exactly where autonomy hurts most.
    </div>
    <div class="tip">
      <b>Comprehension debt</b> in the footer is the share of shipped work no human read. Dark work buys
      speed by taking on that debt deliberately. It is a purchase, not a free win — which is what
      <b>Lights out</b> is there to show.
    </div>
    <div class="tip">
      These switches are not a display setting. They are read from and written to
      <code>factory.config.json</code> in the repo, so changing one here shows up in the next diff.
    </div>
  </div>
</section>

<section class="policy" id="policy" hidden>
  <h2>Autonomy policy</h2>
  <p class="lede">
    Back pressure, expressed as data. A loop earns the dark only when the check is cheap, runs
    often, and is hard to fake. Flipping a switch here rewrites <code>factory.config.json</code>
    and re-resolves every card on the board. Not sure which is which? Open <b>Lit vs dark</b>.
  </p>
  <div id="rules"></div>
</section>

<div class="board" id="board"></div>

<footer>
  <div class="debt">
    <span>Comprehension debt</span>
    <div class="bar"><div class="fill" id="debt-fill"></div></div>
    <span id="debt-text"></span>
  </div>
  <span id="counts"></span>
  <span class="sync" id="sync-text"></span>
</footer>

<div class="sheet-backdrop" id="sheet-backdrop"></div>
<aside class="sheet" id="sheet"></aside>

<div id="toast"></div>

<script>
const ACCENT = ${accents};
let state = ${initial};
let dragging = null;
let justDragged = false;
let selected = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function post(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json();
    if (data && data.state) { state = data.state; render(); }
    if (data && data.message) toast(data.message);
    return data;
  } catch (err) {
    toast("Request failed");
  }
}

function renderSheet() {
  const sheet = $("sheet");
  const backdrop = $("sheet-backdrop");
  const card = selected === null ? null : state.cards.find((c) => String(c.id) === String(selected));

  if (!card) {
    selected = null;
    sheet.classList.remove("show");
    backdrop.classList.remove("show");
    return;
  }

  const a = card.resolved;
  const laneLabel = (state.laneMeta[card.lane] || {}).label || card.lane;
  const link = card.url
    ? '<a href="' + esc(card.url) + '" target="_blank">' + (card.issue ? "#" + card.issue : "open") + "</a>"
    : (card.issue ? "#" + card.issue : "no linked issue");
  const prLink = card.pr
    ? (card.prUrl ? ' · <a href="' + esc(card.prUrl) + '" target="_blank">PR #' + card.pr + "</a>" : " · PR #" + card.pr)
    : "";

  const rules = (a.ruleIds || []).length ? (a.ruleIds).map(esc).join(", ") : "none matched — the default applied";

  const gateRows = (card.gate.results || []).length
    ? (card.gate.results).map((r) =>
        '<div class="kv"><span class="gate-chip ' + esc(r.status) + '" style="display:inline-block;min-width:52px;margin-right:7px">' +
        esc(r.status) + "</span>" + esc(r.name) + "</div>").join("")
    : '<div class="kv">No gates have reported yet.</div>';

  const pathRows = (card.paths || []).length
    ? '<div class="pathlist">' + (card.paths).map((p) => "<span>" + esc(p) + "</span>").join("") + "</div>"
    : '<div class="kv">No paths recorded yet, so the default autonomy applies.</div>';

  const hist = card.history || [];
  const timeline = hist.length
    ? '<div class="timeline">' + hist.map((h, i) =>
        '<div class="ev' + (i === hist.length - 1 ? " latest" : "") + '"><span class="t">' +
        esc(new Date(h.at).toLocaleTimeString()) + "</span>" + esc(h.note) + "</div>").join("") + "</div>"
    : '<div class="kv">Nothing recorded yet.</div>';

  let verdictBlock = "";
  if (card.verdict === "approved") {
    verdictBlock = '<section><h3>Verdict</h3><div class="verdict approved">Approved' +
      (card.reviewNote ? " — " + esc(card.reviewNote) : "") + "</div></section>";
  } else if (card.verdict === "changes-requested") {
    verdictBlock = '<section><h3>Verdict</h3><div class="verdict changes">Changes requested' +
      (card.reviewNote ? " — " + esc(card.reviewNote) : "") + "</div></section>";
  } else if (card.reviewNote) {
    verdictBlock = '<section><h3>Waiting on a reviewer</h3><div class="kv">' + esc(card.reviewNote) + "</div></section>";
  }

  const actions = card.lane === "review"
    ? '<section><h3>Review gate</h3><div class="card-actions">' +
        '<button class="primary" data-approve="' + card.id + '">Approve</button>' +
        '<button class="danger" data-changes="' + card.id + '">Request changes</button>' +
      '</div><div class="kv" style="margin-top:6px">This is submitted to GitHub as a real pull request review.</div></section>'
    : "";

  const openBtn = (card.prUrl || card.url)
    ? '<button data-open="' + esc(card.prUrl || card.url) + '">Open on GitHub</button>'
    : "";

  sheet.innerHTML =
    '<div class="sheet-head">' +
      "<div><h2>" + esc(card.title) + "</h2>" +
        '<div class="sub">' + esc(laneLabel) + " · " + link + prLink + "</div></div>" +
      '<button class="sheet-close" id="sheet-close" title="Close">✕</button>' +
    "</div>" +
    '<div class="sheet-body">' +
      (openBtn ? "<section>" + openBtn + "</section>" : "") +
      actions +
      '<section><h3>Autonomy</h3>' +
        '<div class="kv"><b>' + (a.autonomy === "lit" ? "◉ Lit" : "○ Dark") + "</b> · " + esc(a.blastRadius) + " blast radius" +
          (a.overridden ? " · manually overridden" : "") + "</div>" +
        '<div class="kv">' + esc(a.reason || "") + "</div>" +
        '<div class="kv">Matched rules: <b>' + rules + "</b></div>" +
      "</section>" +
      "<section><h3>Gates</h3>" + gateRows +
        '<div class="kv" style="margin-top:5px">' + esc(card.gate.summary || "") + "</div></section>" +
      "<section><h3>Paths</h3>" + pathRows + "</section>" +
      verdictBlock +
      "<section><h3>History</h3>" + timeline + "</section>" +
    "</div>";

  sheet.classList.add("show");
  backdrop.classList.add("show");
  wireSheet();
}

function wireSheet() {
  const close = $("sheet-close");
  if (close) close.onclick = () => { selected = null; renderSheet(); };
  $("sheet").querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = () => window.open(btn.dataset.open, "_blank");
  });
  wireReviewButtons($("sheet"));
}

/** Approve / request changes, wherever they are rendered. */
function wireReviewButtons(root) {
  root.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      const data = await post("/review", { cardId: btn.dataset.approve, verdict: "approved" });
      if (data && data.url) window.open(data.url, "_blank");
    };
  });
  root.querySelectorAll("[data-changes]").forEach((btn) => {
    btn.onclick = async () => {
      const note = prompt("What needs to change? GitHub requires a reason for a request for changes.");
      if (note === null || !note.trim()) return;
      btn.disabled = true;
      const data = await post("/review", { cardId: btn.dataset.changes, verdict: "changes-requested", note: note.trim() });
      if (data && data.url) window.open(data.url, "_blank");
    };
  });
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2400);
}

function renderPipeline() {
  const counts = {};
  for (const lane of state.lanes) counts[lane] = 0;
  for (const c of state.cards) counts[c.lane] = (counts[c.lane] ?? 0) + 1;

  const parts = state.lanes.map((lane, i) => {
    const meta = state.laneMeta[lane];
    const isGate = lane === "review";
    const node =
      '<div class="pipe-node' + (isGate ? " gate" : "") + '">' +
        '<span class="n">' + counts[lane] + '</span>' +
        '<span class="label">' + esc(meta.label) + '</span>' +
      '</div>';
    return i === 0 ? node : '<span class="pipe-arrow">→</span>' + node;
  });

  parts.push('<span class="pipe-note">only one of these boxes costs anything</span>');
  $("pipeline").innerHTML = parts.join("");
}

function renderPolicy() {
  const rules = state.config.rules ?? [];
  $("rules").innerHTML = rules.map((rule) => {
    const globs = (rule.paths ?? []).map(esc).join("  ");
    return '<div class="rule">' +
      '<div>' +
        '<div class="globs">' + globs + '</div>' +
        '<div class="why">' + esc(rule.reason ?? "") + '</div>' +
      '</div>' +
      '<div class="switch">' +
        '<button data-rule="' + esc(rule.id) + '" data-v="dark"' + (rule.autonomy === "dark" ? ' class="sel"' : "") + '>Dark</button>' +
        '<button data-rule="' + esc(rule.id) + '" data-v="lit"' + (rule.autonomy === "lit" ? ' class="sel"' : "") + '>Lit</button>' +
      '</div>' +
    '</div>';
  }).join("") || '<p class="lede">No rules defined in factory.config.json.</p>';

  $("rules").querySelectorAll("button[data-rule]").forEach((btn) => {
    btn.onclick = () => post("/policy", { ruleId: btn.dataset.rule, autonomy: btn.dataset.v });
  });
}

function renderDemo() {
  const d = state.demo || { playing: false, step: 0, total: 0, caption: null, finished: false };
  const btn = $("demo-btn");
  const started = d.step > 0 && !d.finished;
  btn.textContent = d.playing ? "❚❚ Pause" : (started ? "▶ Resume" : "▶ Play demo");
  btn.classList.toggle("playing", !!d.playing);
  btn.classList.toggle("primary", !d.playing);

  const strip = $("demo-strip");
  strip.hidden = d.step === 0;
  if (d.step === 0) return;
  $("demo-step").textContent = d.step + " / " + d.total;
  $("demo-fill").style.width = (d.total ? Math.round((d.step / d.total) * 100) : 0) + "%";
  $("demo-caption").textContent = d.caption || "";
}

function renderSpeed() {
  const d = state.demo || {};
  const speeds = d.speeds || [0.5, 1, 2];
  const current = d.speed || 1;
  $("speed").innerHTML = speeds.map(function (s) {
    return '<button data-speed="' + s + '" title="' + (s < 1 ? "Slower — more time to read each step" : s > 1 ? "Faster" : "Normal pace") + '"' +
      (s === current ? ' class="sel"' : "") + ">" + s + "\u00d7</button>";
  }).join("");
  $("speed").querySelectorAll("button[data-speed]").forEach(function (btn) {
    btn.onclick = () => post("/demo", { action: "speed", value: Number(btn.dataset.speed) });
  });
}

function renderCard(card) {
  const a = card.resolved;
  const issueLink = card.issue
    ? '<span class="issue">' + (card.url ? '<a href="' + esc(card.url) + '" target="_blank">#' + card.issue + "</a>" : "#" + card.issue) + "</span>"
    : "";

  const litTip = a.autonomy === "lit"
    ? "Lit — a person reads this before it ships. The automated checks are not a strong enough oracle for what this change touches."
    : "Dark — ships unattended once the checks are green. This path has a cheap, frequent, hard-to-fake oracle and a small blast radius.";

  const pills = [
    '<span class="pill ' + a.autonomy + '" title="' + esc(litTip) + '">' + (a.autonomy === "lit" ? "◉ lit" : "○ dark") + "</span>",
    '<span class="pill blast-' + esc(a.blastRadius) + '" title="Blast radius: how much breaks if this change is wrong. Separate from who checks it.">' + esc(a.blastRadius) + " blast</span>",
  ];
  if (a.overridden) pills.push('<span class="pill override">override</span>');
  if (card.pr) {
    pills.push('<span class="pill">' + (card.prUrl ? '<a href="' + esc(card.prUrl) + '" target="_blank" style="color:#58a6ff;text-decoration:none">PR #' + card.pr + "</a>" : "PR #" + card.pr) + "</span>");
  }

  const gates = (card.gate.results ?? []).map((r) =>
    '<span class="gate-chip ' + esc(r.status) + '">' + esc(r.name) + "</span>").join("");

  const paths = (card.paths ?? []).length
    ? '<div class="paths">' + (card.paths ?? []).slice(0, 4).map(esc).join(", ") + ((card.paths ?? []).length > 4 ? " +" + ((card.paths ?? []).length - 4) : "") + "</div>"
    : "";

  let verdict = "";
  if (card.verdict === "approved") verdict = '<div class="verdict approved">Approved' + (card.reviewNote ? " — " + esc(card.reviewNote) : "") + "</div>";
  else if (card.verdict === "changes-requested") verdict = '<div class="verdict changes">Changes requested' + (card.reviewNote ? " — " + esc(card.reviewNote) : "") + "</div>";

  let controls = "";
  if (card.lane === "review") {
    controls =
      '<div class="card-actions">' +
        '<button class="primary" data-approve="' + card.id + '">Approve</button>' +
        '<button class="danger" data-changes="' + card.id + '">Request changes</button>' +
      "</div>";
  } else if (card.lane === "shipped" && card.shippedUnread) {
    controls = '<div class="why">Shipped without a human reading it.</div>';
  }

  return '<div class="card ' + a.autonomy + (String(selected) === String(card.id) ? " selected" : "") +
    '" draggable="true" data-card="' + card.id + '" title="Click for full detail and history · drag to move">' +
    '<div class="head"><span class="title">' + esc(card.title) + "</span>" + issueLink + "</div>" +
    '<div class="meta">' + pills.join("") + "</div>" +
    (gates ? '<div class="gates">' + gates + "</div>" : "") +
    paths +
    '<div class="why">' + esc(a.reason ?? "") + "</div>" +
    verdict +
    controls +
  "</div>";
}

function renderBoard() {
  $("board").innerHTML = state.lanes.map((lane) => {
    const meta = state.laneMeta[lane];
    const cards = state.cards.filter((c) => c.lane === lane);
    const body = cards.length
      ? cards.map(renderCard).join("")
      : '<div class="lane-empty">' + esc(meta.blurb) + "</div>";
    return '<div class="lane' + (lane === "review" ? " gate" : "") + '" data-lane="' + lane + '">' +
      '<div class="lane-head">' +
        '<div class="top"><span class="name"><span class="dot" style="background:' + ACCENT[lane] + '"></span>' +
          esc(meta.label) + '</span><span class="count">' + cards.length + "</span></div>" +
        '<div class="blurb">' + esc(meta.blurb) + "</div>" +
      "</div>" +
      '<div class="lane-body">' + body + "</div>" +
    "</div>";
  }).join("");

  wireBoard();
}

function wireBoard() {
  document.querySelectorAll(".card").forEach((el) => {
    el.addEventListener("dragstart", () => { dragging = el.dataset.card; justDragged = true; el.classList.add("dragging"); });
    el.addEventListener("dragend", () => { dragging = null; el.classList.remove("dragging"); });
    el.addEventListener("click", (e) => {
      // Links and the inline gate buttons keep their own behaviour.
      if (e.target.closest("a") || e.target.closest("button")) return;
      // A finished drag can be followed by a click; that is not a selection.
      if (justDragged) { justDragged = false; return; }
      selected = String(selected) === el.dataset.card ? null : el.dataset.card;
      renderSheet();
    });
  });

  document.querySelectorAll(".lane").forEach((el) => {
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drop"); });
    el.addEventListener("dragleave", () => el.classList.remove("drop"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("drop");
      if (dragging) post("/move", { cardId: dragging, lane: el.dataset.lane });
    });
  });

  wireReviewButtons($("board"));
}

function renderFooter() {
  const s = state.stats;
  $("debt-fill").style.width = s.unreadShare + "%";
  $("debt-text").textContent = s.shipped === 0
    ? "nothing shipped yet"
    : s.unreadShare + "% of shipped work unread (" + s.shippedUnread + " of " + s.shipped + ")";
  $("counts").textContent = s.lit + " lit · " + s.dark + " dark · " + s.atGate + " at the gate";
  $("sync-text").textContent = state.lastSync ? "synced " + new Date(state.lastSync).toLocaleTimeString() : "not synced";
}

function render() {
  $("repo").textContent = state.repo || "no repo";
  document.body.classList.toggle("dark-factory", state.mode === "dark");
  const modeBtn = $("mode-btn");
  modeBtn.textContent = state.mode === "dark" ? "Lights on" : "Lights out";
  modeBtn.classList.toggle("lights-out", state.mode === "dark");
  $("policy").hidden = !state.policyOpen;
  $("policy-btn").classList.toggle("on", !!state.policyOpen);
  $("legend").hidden = !state.legendOpen;
  $("legend-btn").classList.toggle("on", !!state.legendOpen);
  renderDemo();
  renderSpeed();
  renderPipeline();
  renderPolicy();
  renderBoard();
  renderFooter();
  renderSheet();
}

$("sheet-backdrop").onclick = () => { selected = null; renderSheet(); };
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && selected !== null) { selected = null; renderSheet(); }
});

$("demo-btn").onclick = () =>
  post("/demo", { action: (state.demo && state.demo.playing) ? "pause" : "play" });
$("demo-reset").onclick = () => post("/demo", { action: "reset" });
$("legend-btn").onclick = () => post("/legend-open", { open: !state.legendOpen });
$("mode-btn").onclick = () => post("/mode", { mode: state.mode === "dark" ? "lit" : "dark" });
$("policy-btn").onclick = () => post("/policy-open", { open: !state.policyOpen });
$("sync-btn").onclick = async () => {
  const btn = $("sync-btn");
  btn.disabled = true;
  btn.textContent = "Syncing…";
  await post("/sync", {});
  btn.disabled = false;
  btn.textContent = "Sync from GitHub";
};

const events = new EventSource("/events");
events.onmessage = (e) => {
  const next = e.data;
  if (next === JSON.stringify(state)) return;
  state = JSON.parse(next);
  render();
};

render();
</script>
</body>
</html>`;
}
