/**
 * rebaseplan types.
 *
 * rebaseplan plans one branch's rebase onto its upstream.
 * The caller supplies the branch's own commits, optionally
 * the commits upstream has that this branch does not, and
 * whether the branch is published. From that data alone, as
 * pure local computation, rebaseplan reports:
 *
 *   - counts: total commits, merge commits, squash markers,
 *     and upstream new commits
 *   - whether the branch is published
 *   - the force-push risk (low, medium, or high)
 *   - a recommended strategy
 *   - pinned steps and warnings, in pinned order
 */

/** One of the branch's own commits. */
export interface CommitEntry {
  /** Commit hash; non-empty. */
  hash: string;
  /** Commit subject; non-empty. */
  subject: string;
  /** True when the commit is a merge commit; defaults to false. */
  merge?: boolean;
}

/** One upstream commit this branch does not have. */
export interface UpstreamCommitEntry {
  /** Commit hash; non-empty. */
  hash: string;
  /** Commit subject; non-empty. */
  subject: string;
}

/** The arguments accepted by planRebase, after validation. */
export interface RebasePlanInput {
  /** The branch's own commits, oldest first; non-empty. */
  commits: CommitEntry[];
  /** Upstream commits this branch lacks; defaults to []. */
  upstream_commits: UpstreamCommitEntry[];
  /** Whether the branch has been pushed or shared; defaults to false. */
  published: boolean;
}

/** Force-push risk levels. */
export type ForcePushRisk = "low" | "medium" | "high";

/** Recommended rebase strategies. */
export type RebaseStrategy =
  | "rebase_with_merge_preservation"
  | "interactive_squash_cleanup"
  | "linear_rebase";

/** The rebase plan for one branch. */
export interface RebasePlanResult {
  commit_count: number;
  merge_commits: number;
  squash_markers: number;
  upstream_new_commits: number;
  published: boolean;
  force_push_risk: ForcePushRisk;
  recommended_strategy: RebaseStrategy;
  steps: string[];
  warnings: string[];
}
