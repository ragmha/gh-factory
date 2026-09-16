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

/** Open issues labelled for the factory queue. */
export async function listIntake(repo, label = "factory:intake", limit = 30) {
    const args = ["issue", "list", "--state", "open", "--limit", String(limit), "--json", "number,title,labels,url"];
    if (repo) args.push("--repo", repo);
    if (label) args.push("--label", label);
    const issues = (await ghJson(args)) ?? [];
    return issues.map((issue) => ({
        number: issue.number,
        title: issue.title,
        url: issue.url,
        labels: (issue.labels ?? []).map((l) => l.name),
        kind: (issue.labels ?? []).some((l) => l.name === "kind:signal") ? "signal" : "intent",
    }));
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
