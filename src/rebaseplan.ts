/**
 * rebaseplan core: plan a safe rebase before you start.
 *
 *   planRebase(args) -> { commit_count, merge_commits,
 *     squash_markers, upstream_new_commits, published,
 *     force_push_risk, recommended_strategy, steps, warnings }
 *
 * Pinned semantics:
 * - merge_commits counts commits entries with merge true.
 * - A commit is a squash marker when its subject starts
 *   with "Squashed commit" or matches /\(#\d+\)$/.
 *   squash_markers counts only the branch's own commits;
 *   upstream commits are never counted.
 * - upstream_new_commits is the number of upstream commits.
 * - Force-push risk: low when published is false; medium
 *   when published and there are no merge commits and no
 *   squash markers; high when published and either count
 *   is > 0.
 * - Strategy, first match wins: merge commits > 0 ->
 *   "rebase_with_merge_preservation"; squash markers > 0
 *   -> "interactive_squash_cleanup"; otherwise
 *   "linear_rebase".
 * - Steps and warnings are pinned strings in pinned order,
 *   each included only when its condition holds.
 *
 * Validation is strict and path-naming: any malformed
 * input throws an Error naming the offending path and no
 * partial result is produced. Unknown extra fields are
 * ignored; a non-object top-level argument is treated
 * as {}.
 */
import type {
  CommitEntry,
  ForcePushRisk,
  RebasePlanResult,
  RebaseStrategy,
  UpstreamCommitEntry,
} from "./types.js";

export const VERSION = "0.1.0";

const SQUASH_SUFFIX = /\(#\d+\)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a branch commit is a squash marker (pinned). */
export function isSquashMarker(subject: string): boolean {
  return subject.startsWith("Squashed commit") || SQUASH_SUFFIX.test(subject);
}

function validateCommitEntry(entry: unknown, path: string): CommitEntry {
  if (!isRecord(entry)) throw new Error(`${path} must be an object`);
  if (entry.hash === undefined) throw new Error(`${path}.hash is required`);
  if (typeof entry.hash !== "string" || entry.hash.length === 0) {
    throw new Error(`${path}.hash must be a non-empty string`);
  }
  if (entry.subject === undefined) throw new Error(`${path}.subject is required`);
  if (typeof entry.subject !== "string" || entry.subject.length === 0) {
    throw new Error(`${path}.subject must be a non-empty string`);
  }
  let merge = false;
  if (entry.merge !== undefined) {
    if (typeof entry.merge !== "boolean") {
      throw new Error(`${path}.merge must be a boolean`);
    }
    merge = entry.merge;
  }
  return { hash: entry.hash, subject: entry.subject, merge };
}

function validateUpstreamEntry(
  entry: unknown,
  path: string,
): UpstreamCommitEntry {
  if (!isRecord(entry)) throw new Error(`${path} must be an object`);
  if (entry.hash === undefined) throw new Error(`${path}.hash is required`);
  if (typeof entry.hash !== "string" || entry.hash.length === 0) {
    throw new Error(`${path}.hash must be a non-empty string`);
  }
  if (entry.subject === undefined) throw new Error(`${path}.subject is required`);
  if (typeof entry.subject !== "string" || entry.subject.length === 0) {
    throw new Error(`${path}.subject must be a non-empty string`);
  }
  return { hash: entry.hash, subject: entry.subject };
}

function validateArgs(args: unknown): {
  commits: CommitEntry[];
  upstreamCommits: UpstreamCommitEntry[];
  published: boolean;
} {
  const raw: Record<string, unknown> = isRecord(args) ? args : {};

  if (raw.commits === undefined) throw new Error("commits is required");
  if (!Array.isArray(raw.commits)) throw new Error("commits must be an array");
  if (raw.commits.length === 0) {
    throw new Error("commits must be a non-empty array");
  }
  const commits = raw.commits.map((entry, i) =>
    validateCommitEntry(entry, `commits[${i}]`),
  );

  let upstreamCommits: UpstreamCommitEntry[] = [];
  if (raw.upstream_commits !== undefined) {
    if (!Array.isArray(raw.upstream_commits)) {
      throw new Error("upstream_commits must be an array");
    }
    upstreamCommits = raw.upstream_commits.map((entry, i) =>
      validateUpstreamEntry(entry, `upstream_commits[${i}]`),
    );
  }

  let published = false;
  if (raw.published !== undefined) {
    if (typeof raw.published !== "boolean") {
      throw new Error("published must be a boolean");
    }
    published = raw.published;
  }

  return { commits, upstreamCommits, published };
}

/** Plan a safe rebase for one branch. */
export function planRebase(args: unknown): RebasePlanResult {
  const { commits, upstreamCommits, published } = validateArgs(args);

  const commit_count = commits.length;
  const merge_commits = commits.filter((c) => c.merge === true).length;
  const squash_markers = commits.filter((c) => isSquashMarker(c.subject)).length;
  const upstream_new_commits = upstreamCommits.length;

  let force_push_risk: ForcePushRisk;
  if (!published) {
    force_push_risk = "low";
  } else if (merge_commits === 0 && squash_markers === 0) {
    force_push_risk = "medium";
  } else {
    force_push_risk = "high";
  }

  let recommended_strategy: RebaseStrategy;
  if (merge_commits > 0) {
    recommended_strategy = "rebase_with_merge_preservation";
  } else if (squash_markers > 0) {
    recommended_strategy = "interactive_squash_cleanup";
  } else {
    recommended_strategy = "linear_rebase";
  }

  const steps: string[] = [];
  steps.push("fetch upstream before planning the final rebase");
  if (published) {
    steps.push("create a backup branch pointing at the current head");
  }
  if (recommended_strategy === "rebase_with_merge_preservation") {
    steps.push("rebase onto upstream preserving merge commits");
  } else if (recommended_strategy === "interactive_squash_cleanup") {
    steps.push("rebase interactively and drop or fold squash-merge markers");
  } else {
    steps.push("rebase linearly onto upstream");
  }
  steps.push("run the test suite on the rebased head");
  if (published) {
    steps.push("push with --force-with-lease, never plain --force");
  } else {
    steps.push("push normally; no force push is needed");
  }

  const warnings: string[] = [];
  if (merge_commits > 0) {
    warnings.push("history contains merge commits; a plain rebase will flatten them");
  }
  if (squash_markers > 0) {
    warnings.push(
      "history contains squash-merge markers; their original commits may also exist upstream, which can duplicate changes",
    );
  }
  if (upstream_new_commits >= 10) {
    warnings.push("upstream is 10 or more commits ahead; expect conflict resolution");
  }
  if (published) {
    warnings.push(
      "branch is published; rewriting it rewrites history others may have based work on",
    );
  }

  return {
    commit_count,
    merge_commits,
    squash_markers,
    upstream_new_commits,
    published,
    force_push_risk,
    recommended_strategy,
    steps,
    warnings,
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
