// Factory Floor — GitHub integration.
//
// The canvas talks to GitHub through the already-authenticated `gh` CLI rather
// than a stored token, so nothing sensitive lives in the repo. Every call is
// best-effort: GitHub being slow or unreachable must degrade the board, never
// break it.

import { execFile } from "node:child_process";
import { REPO_ROOT } from "./state.mjs";

const DEFAULT_TIMEOUT_MS = 20_000;

function runGh(args, timeout = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        execFile(
            "gh",
            args,
            { cwd: REPO_ROOT, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
            (error, stdout, stderr) => {
                if (error) {
                    const detail = (stderr || error.message || "").trim().split("\n").slice(0, 3).join(" ");
                    reject(new Error(detail || `gh ${args[0]} failed`));
                    return;
                }
                resolve(stdout);
            },
        );
    });
}

async function ghJson(args, timeout) {
    const raw = await runGh(args, timeout);
    const text = raw.trim();
    if (!text) return null;
    return JSON.parse(text);
}

export async function isAvailable() {
    try {
        await runGh(["auth", "status"], 10_000);
        return true;
    } catch {
        return false;
    }
}

/**
 * Open issues that belong in the factory queue.
 *
 * Labels are OR-ed rather than AND-ed: `gh issue list` intersects repeated
 * --label flags, which is the opposite of what an intake filter wants. One
 * query per label, merged by issue number.
 */
export async function listIntake(repo, options = {}) {
    const labels = (options.labels ?? []).filter(Boolean);
    const signalLabels = new Set(options.signalLabels ?? []);
    const limit = options.limit ?? 30;
    const queries = labels.length > 0 ? labels : [null];

    const byNumber = new Map();
    const failures = [];

    for (const label of queries) {
        const args = ["issue", "list", "--state", "open", "--limit", String(limit), "--json", "number,title,labels,url"];
        if (repo) args.push("--repo", repo);
        if (label) args.push("--label", label);
        try {
            for (const issue of (await ghJson(args)) ?? []) byNumber.set(issue.number, issue);
        } catch (error) {
            failures.push(error.message);
        }
    }

    // A single missing label is survivable; losing every query is not.
    if (failures.length === queries.length) throw new Error(failures[0] ?? "gh issue list failed");

    return [...byNumber.values()]
        .map((issue) => {
            const names = (issue.labels ?? []).map((l) => l.name);
            return {
                number: issue.number,
                title: issue.title,
                url: issue.url,
                labels: names,
                kind: names.some((name) => signalLabels.has(name)) ? "signal" : "intent",
            };
        })
        .sort((a, b) => a.number - b.number);
}

/** Paths changed by a pull request. These drive the autonomy resolution. */
export async function pullRequestFiles(repo, number) {
    const slug = repo ? `repos/${repo}` : "repos/{owner}/{repo}";
    const files = (await ghJson(["api", "--paginate", `${slug}/pulls/${number}/files`, "--jq", "[.[].filename]"])) ?? [];
    return Array.isArray(files) ? files : [];
}

const CONCLUSION_MAP = {
    success: "pass",
    neutral: "pass",
    skipped: "pass",
    failure: "fail",
    timed_out: "fail",
    cancelled: "fail",
    action_required: "fail",
    startup_failure: "fail",
};

/**
 * Check-run results for a pull request, keyed by check name.
 * Names are matched against `gates.required` in factory.config.json.
 */
export async function pullRequestChecks(repo, number) {
    const args = ["pr", "checks", String(number), "--json", "name,state,bucket"];
    if (repo) args.push("--repo", repo);
    let rows;
    try {
        rows = (await ghJson(args)) ?? [];
    } catch {
        // `gh pr checks` exits non-zero when checks are failing or none exist yet.
        return {};
    }
    const checks = {};
    for (const row of rows) {
        const raw = String(row.bucket ?? row.state ?? "").toLowerCase();
        checks[row.name] = CONCLUSION_MAP[raw] ?? (raw === "pass" ? "pass" : raw === "fail" ? "fail" : "pending");
    }
    return checks;
}

export async function pullRequestFor(repo, issueNumber) {
    const args = ["pr", "list", "--state", "all", "--limit", "50", "--json", "number,title,url,body,state"];
    if (repo) args.push("--repo", repo);
    const prs = (await ghJson(args)) ?? [];
    const needle = new RegExp(`(closes|fixes|resolves)\\s+#${issueNumber}\\b`, "i");
    return prs.find((pr) => needle.test(pr.body ?? "") || (pr.title ?? "").includes(`#${issueNumber}`)) ?? null;
}

export async function currentRepo() {
    try {
        const info = await ghJson(["repo", "view", "--json", "nameWithOwner"], 10_000);
        return info?.nameWithOwner ?? "";
    } catch {
        return "";
    }
}

/**
 * Submit a real review on a pull request.
 *
 * This is the point of the gate: the decision has to land where the team
 * works, not only on the board. GitHub requires a body for request-changes,
 * and refuses to let you formally approve your own pull request — the caller
 * is expected to fall back to a comment when this throws.
 */
export async function submitReview(repo, number, verdict, body) {
    const args = ["pr", "review", String(number)];
    if (repo) args.push("--repo", repo);
    args.push(verdict === "approved" ? "--approve" : "--request-changes");
    if (body) args.push("--body", body);
    await runGh(args, 30_000);
}

/** Leave a comment on a pull request or an issue. The fallback when a formal review will not go through. */
export async function comment(repo, kind, number, body) {
    const args = [kind === "pr" ? "pr" : "issue", "comment", String(number)];
    if (repo) args.push("--repo", repo);
    args.push("--body", body);
    await runGh(args, 30_000);
}
