#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const owner = process.env.HIRO_OWNER || "KouperHealth";
const repo = process.env.HIRO_REPO || "hiro";
const author = process.env.HIRO_AUTHOR || "wert23239";
const state = process.env.HIRO_PR_STATE || "open";
const repoSlug = `${owner}/${repo}`;
const root = path.resolve(__dirname, "..");

function gh(args) {
  const out = execFileSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 30,
  });
  return out.trim() ? JSON.parse(out) : null;
}

function ghText(args) {
  try {
    return execFileSync("gh", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 30,
    }).trim();
  } catch (error) {
    return "";
  }
}

function ghGraphql(query, fields = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(fields)) {
    args.push("-F", `${key}=${value}`);
  }
  return gh(args);
}

function getAll(endpoint) {
  return gh(["api", "--paginate", endpoint]);
}

function classifyAuthor(login = "") {
  const normalized = login.toLowerCase();
  if (normalized.includes("coderabbit")) return "CodeRabbit";
  if (normalized.endsWith("[bot]") || normalized.includes("bot")) return "Bot";
  return "Human";
}

function markdownComment(comment, type) {
  const authorLogin = comment.user?.login || comment.author?.login || "unknown";
  const createdAt = comment.created_at || comment.createdAt || "";
  const pathLine = comment.path
    ? `${comment.path}${comment.line ? `:${comment.line}` : comment.position ? `:${comment.position}` : ""}`
    : "";
  return {
    id: String(comment.id || comment.node_id || `${type}-${createdAt}-${authorLogin}`),
    type,
    source: classifyAuthor(authorLogin),
    author: authorLogin,
    association: comment.author_association || "",
    path: comment.path || "",
    line: comment.line || comment.original_line || comment.position || null,
    location: pathLine,
    createdAt,
    updatedAt: comment.updated_at || "",
    url: comment.html_url || "",
    body: comment.body || "",
  };
}

function failureLog(run) {
  if (!run.details_url) return "";
  const match = run.details_url.match(/\/actions\/runs\/(\d+)/);
  if (!match) return "";
  return ghText(["run", "view", match[1], "--repo", repoSlug, "--log-failed"]);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolvedReviewCommentIds(pullRequestId) {
  const query = `
    query($pullRequestId: ID!, $after: String) {
      node(id: $pullRequestId) {
        ... on PullRequest {
          reviewThreads(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              isResolved
              comments(first: 100) {
                nodes {
                  databaseId
                }
              }
            }
          }
        }
      }
    }
  `;
  const ids = new Set();
  let after = "";

  do {
    const result = ghGraphql(query, {
      pullRequestId,
      after,
    });
    const threads = result?.data?.node?.reviewThreads;
    if (!threads) break;

    for (const thread of threads.nodes || []) {
      if (!thread.isResolved) continue;
      for (const comment of thread.comments?.nodes || []) {
        if (comment.databaseId) ids.add(String(comment.databaseId));
      }
    }

    after = threads.pageInfo?.hasNextPage ? threads.pageInfo.endCursor : "";
  } while (after);

  return ids;
}

function collectPr(pr) {
  const number = pr.number;
  const issueComments = getAll(`repos/${repoSlug}/issues/${number}/comments?per_page=100`) || [];
  const reviewComments = getAll(`repos/${repoSlug}/pulls/${number}/comments?per_page=100`) || [];
  const reviews = getAll(`repos/${repoSlug}/pulls/${number}/reviews?per_page=100`) || [];
  const checkRuns = getAll(`repos/${repoSlug}/commits/${pr.head.sha}/check-runs?per_page=100`)?.check_runs || [];
  const combinedStatus = gh(["api", `repos/${repoSlug}/commits/${pr.head.sha}/status`]);
  const resolvedCommentIds = resolvedReviewCommentIds(pr.node_id);

  const reviewBodies = reviews
    .filter((review) => review.body && review.body.trim())
    .map((review) => markdownComment(review, "Review"));

  const comments = uniqueBy(
    [
      ...issueComments.map((comment) => markdownComment(comment, "Conversation")),
      ...reviewBodies,
      ...reviewComments
        .filter((comment) => !resolvedCommentIds.has(String(comment.id)))
        .map((comment) => markdownComment(comment, "Code")),
    ].filter((comment) => comment.body.trim()),
    (comment) => comment.id
  ).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  const failedRuns = checkRuns
    .filter((run) => ["failure", "timed_out", "cancelled", "action_required"].includes(run.conclusion))
    .map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      url: run.html_url || run.details_url || "",
      detailsUrl: run.details_url || "",
      app: run.app?.name || "",
      log: failureLog(run),
      isPresubmit: /pre.?submit|presubmit|pre.?commit|lint|test|typecheck|build|ci/i.test(run.name),
    }));

  const statuses = (combinedStatus.statuses || [])
    .filter((statusItem) => ["failure", "error"].includes(statusItem.state))
    .map((statusItem) => ({
      id: statusItem.id,
      name: statusItem.context,
      state: statusItem.state,
      description: statusItem.description || "",
      url: statusItem.target_url || "",
      isPresubmit: /pre.?submit|presubmit|pre.?commit|lint|test|typecheck|build|ci/i.test(statusItem.context),
    }));

  return {
    number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    url: pr.html_url,
    author: pr.user?.login || "",
    base: pr.base?.ref || "",
    head: pr.head?.ref || "",
    headSha: pr.head?.sha || "",
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    comments,
    coderabbitComments: comments.filter((comment) => comment.source === "CodeRabbit"),
    nonCoderabbitComments: comments.filter((comment) => comment.source !== "CodeRabbit"),
    failures: [...failedRuns, ...statuses],
  };
}

function main() {
  const prs = gh([
    "api",
    "--paginate",
    `repos/${repoSlug}/pulls?state=${encodeURIComponent(state)}&per_page=100`,
  ]).filter((pr) => pr.user?.login === author);

  const data = {
    generatedAt: new Date().toISOString(),
    repo: repoSlug,
    author,
    state,
    prs: prs.map(collectPr),
  };

  mkdirSync(path.join(root, "data"), { recursive: true });
  writeFileSync(path.join(root, "data", "prs.json"), `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `Wrote ${data.prs.length} PRs, ${data.prs.reduce((sum, pr) => sum + pr.comments.length, 0)} comments, ${data.prs.reduce((sum, pr) => sum + pr.failures.length, 0)} failures.`
  );
}

main();
