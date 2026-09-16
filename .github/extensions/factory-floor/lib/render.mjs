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
  .actions { display: flex; gap: 6px; align-items: center; }
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
</style>
</head>
<body>

<header>
  <div class="title-row">
    <h1><span class="spark">◆</span> Factory Floor <span class="repo" id="repo"></span></h1>
    <div class="actions">
      <button id="mode-btn">Lights out</button>
      <button id="policy-btn">Policy</button>
      <button id="sync-btn">Sync from GitHub</button>
    </div>
  </div>
  <div class="pipeline" id="pipeline"></div>
  <div class="lights-banner">
    Lights out. Every rule is dark and the review gate is bypassed — nothing waits on a person.
    The tests are still green. That is exactly what makes this hard to notice.
  </div>
</header>

<section class="policy" id="policy" hidden>
  <h2>Autonomy policy</h2>
  <p class="lede">
    Back pressure, expressed as data. A loop earns the dark only when the check is cheap, runs
    often, and is hard to fake. Flipping a switch here rewrites <code>factory.config.json</code>
    and re-resolves every card on the board.
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

<div id="toast"></div>

<script>
const ACCENT = ${accents};
let state = ${initial};
let dragging = null;

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

function renderCard(card) {
  const a = card.resolved;
  const issueLink = card.issue
    ? '<span class="issue">' + (card.url ? '<a href="' + esc(card.url) + '" target="_blank">#' + card.issue + "</a>" : "#" + card.issue) + "</span>"
    : "";

  const pills = [
    '<span class="pill ' + a.autonomy + '">' + (a.autonomy === "lit" ? "◉ lit" : "○ dark") + "</span>",
    '<span class="pill blast-' + esc(a.blastRadius) + '">' + esc(a.blastRadius) + " blast</span>",
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

  return '<div class="card ' + a.autonomy + '" draggable="true" data-card="' + card.id + '">' +
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
    el.addEventListener("dragstart", () => { dragging = el.dataset.card; el.classList.add("dragging"); });
    el.addEventListener("dragend", () => { dragging = null; el.classList.remove("dragging"); });
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

  document.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.onclick = () => post("/review", { cardId: btn.dataset.approve, verdict: "approved" });
  });
  document.querySelectorAll("[data-changes]").forEach((btn) => {
    btn.onclick = () => {
      const note = prompt("What needs to change?");
      if (note === null) return;
      post("/review", { cardId: btn.dataset.changes, verdict: "changes-requested", note });
    };
  });
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
  renderPipeline();
  renderPolicy();
  renderBoard();
  renderFooter();
}

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
