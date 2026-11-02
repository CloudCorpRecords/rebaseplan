import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSquashMarker, planRebase } from "../src/rebaseplan.js";

/**
 * All tests are pure local computation over inline commit
 * lists: no filesystem and no network. The squash-marker
 * pins (both forms plus near-misses), merge counting, the
 * force-push risk table, strategy first-match precedence,
 * the exact steps arrays for every published x strategy
 * combination, the exact warnings including the >= 10
 * upstream threshold at 9 and 10, the defaults, and every
 * validation path are each pinned.
 */

const commit = (subject: string, extra: Record<string, unknown> = {}) => ({
  hash: `h-${subject.length}-${subject.charCodeAt(0)}`,
  subject,
  ...extra,
});
const simple = (subject: string) => ({ hash: "abc123", subject });
const upstream = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    hash: `u${i}`,
    subject: `Upstream change ${i}`,
  }));

describe("isSquashMarker — pinned forms", () => {
  it("the 'Squashed commit' prefix is a marker", () => {
    assert.equal(isSquashMarker("Squashed commit of the following:"), true);
    assert.equal(isSquashMarker("Squashed commit"), true);
    assert.equal(isSquashMarker("Squashed commits combined"), true);
  });

  it("a trailing GitHub suffix (#<digits>) is a marker", () => {
    assert.equal(isSquashMarker("Add login form (#123)"), true);
    assert.equal(isSquashMarker("Fix it (#1)"), true);
    assert.equal(isSquashMarker("(#42)"), true);
  });

  it("near-miss: a suffix not at the end is not a marker", () => {
    assert.equal(isSquashMarker("Fix thing (#12) and more"), false);
    assert.equal(isSquashMarker("Fix thing (#12) "), false);
    assert.equal(isSquashMarker("(#12) at the start"), false);
  });

  it("near-miss: non-digit suffixes are not markers", () => {
    assert.equal(isSquashMarker("Fix thing (#abc)"), false);
    assert.equal(isSquashMarker("Fix thing (#12a)"), false);
    assert.equal(isSquashMarker("Fix thing (#)"), false);
    assert.equal(isSquashMarker("Fix thing (123)"), false);
    assert.equal(isSquashMarker("Fix thing #123"), false);
  });

  it("near-miss: a lowercase prefix is not a marker", () => {
    assert.equal(isSquashMarker("squashed commit of the following:"), false);
    assert.equal(isSquashMarker("SQUASHED commit"), false);
    assert.equal(isSquashMarker(" Squashed commit indented"), false);
  });

  it("ordinary subjects are not markers", () => {
    assert.equal(isSquashMarker("Add login form"), false);
    assert.equal(isSquashMarker("Merge branch 'main'"), false);
  });
});

describe("planRebase — counting", () => {
  it("counts commits, merge commits, squash markers, and upstream commits", () => {
    const out = planRebase({
      commits: [
        simple("Add login form"),
        { hash: "m1", subject: "Merge branch 'main'", merge: true },
        { hash: "m2", subject: "Merge pull request", merge: true },
        { hash: "s1", subject: "Squashed commit of the following:" },
        { hash: "s2", subject: "Tidy up (#77)" },
        { hash: "n1", subject: "Merge in name only" },
      ],
      upstream_commits: upstream(3),
    });
    assert.equal(out.commit_count, 6);
    assert.equal(out.merge_commits, 2);
    assert.equal(out.squash_markers, 2);
    assert.equal(out.upstream_new_commits, 3);
  });

  it("merge defaults to false and explicit false is not counted", () => {
    const out = planRebase({
      commits: [
        simple("One"),
        { hash: "x", subject: "Two", merge: false },
        { hash: "y", subject: "Three", merge: true },
      ],
    });
    assert.equal(out.merge_commits, 1);
  });

  it("upstream commits are never counted as squash markers", () => {
    const out = planRebase({
      commits: [simple("Plain work")],
      upstream_commits: [
        { hash: "u1", subject: "Squashed commit of the following:" },
        { hash: "u2", subject: "Upstream fix (#99)" },
        { hash: "u3", subject: "Merge branch 'x'" },
      ],
    });
    assert.equal(out.squash_markers, 0);
    assert.equal(out.merge_commits, 0);
    assert.equal(out.upstream_new_commits, 3);
    assert.equal(out.recommended_strategy, "linear_rebase");
  });

  it("a commit that is both a merge and a squash marker counts in both", () => {
    const out = planRebase({
      commits: [{ hash: "b1", subject: "Squashed commit (#5)", merge: true }],
    });
    assert.equal(out.merge_commits, 1);
    assert.equal(out.squash_markers, 1);
  });
});

describe("planRebase — defaults", () => {
  it("published and upstream_commits default, merge defaults to false", () => {
    const out = planRebase({ commits: [simple("Only commit")] });
    assert.deepEqual(out, {
      commit_count: 1,
      merge_commits: 0,
      squash_markers: 0,
      upstream_new_commits: 0,
      published: false,
      force_push_risk: "low",
      recommended_strategy: "linear_rebase",
      steps: [
        "fetch upstream before planning the final rebase",
        "rebase linearly onto upstream",
        "run the test suite on the rebased head",
        "push normally; no force push is needed",
      ],
      warnings: [],
    });
  });

  it("an explicit empty upstream_commits array behaves as the default", () => {
    const out = planRebase({ commits: [simple("One")], upstream_commits: [] });
    assert.equal(out.upstream_new_commits, 0);
  });
});

describe("planRebase — force-push risk table", () => {
  it("low: unpublished, even with merges and squash markers", () => {
    const out = planRebase({
      commits: [
        { hash: "m", subject: "Merge x", merge: true },
        { hash: "s", subject: "Change (#3)" },
      ],
      published: false,
    });
    assert.equal(out.force_push_risk, "low");
  });

  it("low: unpublished with a clean history", () => {
    assert.equal(
      planRebase({ commits: [simple("Clean")] }).force_push_risk,
      "low",
    );
  });

  it("medium: published with no merge commits and no squash markers", () => {
    const out = planRebase({ commits: [simple("Clean")], published: true });
    assert.equal(out.force_push_risk, "medium");
  });

  it("high: published with a merge commit", () => {
    const out = planRebase({
      commits: [{ hash: "m", subject: "Merge x", merge: true }],
      published: true,
    });
    assert.equal(out.force_push_risk, "high");
  });

  it("high: published with a squash marker", () => {
    const out = planRebase({
      commits: [{ hash: "s", subject: "Squashed commit of x" }],
      published: true,
    });
    assert.equal(out.force_push_risk, "high");
  });
});

describe("planRebase — strategy, first match wins", () => {
  it("merge commits -> rebase_with_merge_preservation", () => {
    const out = planRebase({
      commits: [{ hash: "m", subject: "Merge x", merge: true }],
    });
    assert.equal(out.recommended_strategy, "rebase_with_merge_preservation");
  });

  it("squash markers -> interactive_squash_cleanup", () => {
    const out = planRebase({ commits: [{ hash: "s", subject: "Work (#8)" }] });
    assert.equal(out.recommended_strategy, "interactive_squash_cleanup");
  });

  it("neither -> linear_rebase", () => {
    const out = planRebase({ commits: [simple("Plain")] });
    assert.equal(out.recommended_strategy, "linear_rebase");
  });

  it("precedence: merge beats squash when both are present", () => {
    const out = planRebase({
      commits: [
        { hash: "m", subject: "Merge x", merge: true },
        { hash: "s", subject: "Squashed commit of y" },
        { hash: "t", subject: "Other (#2)" },
      ],
    });
    assert.equal(out.recommended_strategy, "rebase_with_merge_preservation");
    assert.equal(out.merge_commits, 1);
    assert.equal(out.squash_markers, 2);
  });
});

describe("planRebase — exact steps for published x strategy", () => {
  const mergeCommit = { hash: "m", subject: "Merge x", merge: true };
  const squashCommit = { hash: "s", subject: "Work (#8)" };
  const plainCommit = simple("Plain work");

  it("unpublished + merge preservation", () => {
    assert.deepEqual(planRebase({ commits: [mergeCommit] }).steps, [
      "fetch upstream before planning the final rebase",
      "rebase onto upstream preserving merge commits",
      "run the test suite on the rebased head",
      "push normally; no force push is needed",
    ]);
  });

  it("published + merge preservation", () => {
    assert.deepEqual(
      planRebase({ commits: [mergeCommit], published: true }).steps,
      [
        "fetch upstream before planning the final rebase",
        "create a backup branch pointing at the current head",
        "rebase onto upstream preserving merge commits",
        "run the test suite on the rebased head",
        "push with --force-with-lease, never plain --force",
      ],
    );
  });

  it("unpublished + interactive squash cleanup", () => {
    assert.deepEqual(planRebase({ commits: [squashCommit] }).steps, [
      "fetch upstream before planning the final rebase",
      "rebase interactively and drop or fold squash-merge markers",
      "run the test suite on the rebased head",
      "push normally; no force push is needed",
    ]);
  });

  it("published + interactive squash cleanup", () => {
    assert.deepEqual(
      planRebase({ commits: [squashCommit], published: true }).steps,
      [
        "fetch upstream before planning the final rebase",
        "create a backup branch pointing at the current head",
        "rebase interactively and drop or fold squash-merge markers",
        "run the test suite on the rebased head",
        "push with --force-with-lease, never plain --force",
      ],
    );
  });

  it("unpublished + linear", () => {
    assert.deepEqual(planRebase({ commits: [plainCommit] }).steps, [
      "fetch upstream before planning the final rebase",
      "rebase linearly onto upstream",
      "run the test suite on the rebased head",
      "push normally; no force push is needed",
    ]);
  });

  it("published + linear", () => {
    assert.deepEqual(
      planRebase({ commits: [plainCommit], published: true }).steps,
      [
        "fetch upstream before planning the final rebase",
        "create a backup branch pointing at the current head",
        "rebase linearly onto upstream",
        "run the test suite on the rebased head",
        "push with --force-with-lease, never plain --force",
      ],
    );
  });
});

describe("planRebase — exact warnings", () => {
  it("no warnings for a clean unpublished branch with a near upstream", () => {
    assert.deepEqual(
      planRebase({ commits: [simple("Plain")], upstream_commits: upstream(2) })
        .warnings,
      [],
    );
  });

  it("merge warning alone", () => {
    assert.deepEqual(
      planRebase({
        commits: [{ hash: "m", subject: "Merge x", merge: true }],
      }).warnings,
      ["history contains merge commits; a plain rebase will flatten them"],
    );
  });

  it("squash warning alone", () => {
    assert.deepEqual(
      planRebase({ commits: [{ hash: "s", subject: "Work (#8)" }] }).warnings,
      [
        "history contains squash-merge markers; their original commits may also exist upstream, which can duplicate changes",
      ],
    );
  });

  it("published warning alone", () => {
    assert.deepEqual(
      planRebase({ commits: [simple("Plain")], published: true }).warnings,
      [
        "branch is published; rewriting it rewrites history others may have based work on",
      ],
    );
  });

  it("upstream threshold: 9 upstream commits does not warn", () => {
    const out = planRebase({
      commits: [simple("Plain")],
      upstream_commits: upstream(9),
    });
    assert.equal(out.upstream_new_commits, 9);
    assert.deepEqual(out.warnings, []);
  });

  it("upstream threshold: 10 upstream commits warns with the fixed text", () => {
    const out = planRebase({
      commits: [simple("Plain")],
      upstream_commits: upstream(10),
    });
    assert.equal(out.upstream_new_commits, 10);
    assert.deepEqual(out.warnings, [
      "upstream is 10 or more commits ahead; expect conflict resolution",
    ]);
  });

  it("upstream warning text is fixed regardless of the exact count", () => {
    const out = planRebase({
      commits: [simple("Plain")],
      upstream_commits: upstream(25),
    });
    assert.deepEqual(out.warnings, [
      "upstream is 10 or more commits ahead; expect conflict resolution",
    ]);
  });

  it("all four warnings together, in pinned order", () => {
    const out = planRebase({
      commits: [
        { hash: "m", subject: "Merge x", merge: true },
        { hash: "s", subject: "Squashed commit of y" },
      ],
      upstream_commits: upstream(12),
      published: true,
    });
    assert.deepEqual(out.warnings, [
      "history contains merge commits; a plain rebase will flatten them",
      "history contains squash-merge markers; their original commits may also exist upstream, which can duplicate changes",
      "upstream is 10 or more commits ahead; expect conflict resolution",
      "branch is published; rewriting it rewrites history others may have based work on",
    ]);
    assert.deepEqual(out, {
      commit_count: 2,
      merge_commits: 1,
      squash_markers: 1,
      upstream_new_commits: 12,
      published: true,
      force_push_risk: "high",
      recommended_strategy: "rebase_with_merge_preservation",
      steps: [
        "fetch upstream before planning the final rebase",
        "create a backup branch pointing at the current head",
        "rebase onto upstream preserving merge commits",
        "run the test suite on the rebased head",
        "push with --force-with-lease, never plain --force",
      ],
      warnings: out.warnings,
    });
  });
});

describe("planRebase — validation", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => planRebase(args), { message });

  it("commits missing names commits", () => {
    throws({}, "commits is required");
    throws({ published: true }, "commits is required");
  });

  it("a non-object top-level argument is treated as {} (pinned judgement call)", () => {
    throws(null, "commits is required");
    throws([], "commits is required");
    throws("commits", "commits is required");
    throws(42, "commits is required");
    throws(undefined, "commits is required");
  });

  it("commits not an array names commits", () => {
    throws({ commits: "x" }, "commits must be an array");
    throws({ commits: {} }, "commits must be an array");
    throws({ commits: null }, "commits must be an array");
    throws({ commits: 3 }, "commits must be an array");
  });

  it("commits empty names commits", () => {
    throws({ commits: [] }, "commits must be a non-empty array");
  });

  it("a non-object commits entry names its indexed path", () => {
    throws({ commits: ["x"] }, "commits[0] must be an object");
    throws({ commits: [null] }, "commits[0] must be an object");
    throws({ commits: [[]] }, "commits[0] must be an object");
    throws(
      { commits: [simple("Ok"), 7] },
      "commits[1] must be an object",
    );
  });

  it("commits entry hash missing, empty, or non-string names its path", () => {
    throws({ commits: [{ subject: "x" }] }, "commits[0].hash is required");
    throws(
      { commits: [{ hash: "", subject: "x" }] },
      "commits[0].hash must be a non-empty string",
    );
    throws(
      { commits: [{ hash: 12, subject: "x" }] },
      "commits[0].hash must be a non-empty string",
    );
    throws(
      { commits: [{ hash: null, subject: "x" }] },
      "commits[0].hash must be a non-empty string",
    );
    throws(
      { commits: [simple("Ok"), { hash: "", subject: "y" }] },
      "commits[1].hash must be a non-empty string",
    );
  });

  it("commits entry subject missing, empty, or non-string names its path", () => {
    throws({ commits: [{ hash: "h" }] }, "commits[0].subject is required");
    throws(
      { commits: [{ hash: "h", subject: "" }] },
      "commits[0].subject must be a non-empty string",
    );
    throws(
      { commits: [{ hash: "h", subject: 9 }] },
      "commits[0].subject must be a non-empty string",
    );
    throws(
      { commits: [{ hash: "h", subject: null }] },
      "commits[0].subject must be a non-empty string",
    );
  });

  it("commits entry merge non-boolean names its path", () => {
    throws(
      { commits: [{ hash: "h", subject: "x", merge: "yes" }] },
      "commits[0].merge must be a boolean",
    );
    throws(
      { commits: [{ hash: "h", subject: "x", merge: 1 }] },
      "commits[0].merge must be a boolean",
    );
    throws(
      { commits: [{ hash: "h", subject: "x", merge: null }] },
      "commits[0].merge must be a boolean",
    );
  });

  it("upstream_commits present but not an array names upstream_commits", () => {
    throws(
      { commits: [simple("Ok")], upstream_commits: "x" },
      "upstream_commits must be an array",
    );
    throws(
      { commits: [simple("Ok")], upstream_commits: {} },
      "upstream_commits must be an array",
    );
    throws(
      { commits: [simple("Ok")], upstream_commits: null },
      "upstream_commits must be an array",
    );
  });

  it("a non-object upstream entry names its indexed path", () => {
    throws(
      { commits: [simple("Ok")], upstream_commits: ["x"] },
      "upstream_commits[0] must be an object",
    );
    throws(
      { commits: [simple("Ok")], upstream_commits: [null] },
      "upstream_commits[0] must be an object",
    );
  });

  it("upstream entry hash and subject are validated like branch entries", () => {
    throws(
      { commits: [simple("Ok")], upstream_commits: [{ subject: "x" }] },
      "upstream_commits[0].hash is required",
    );
    throws(
      {
        commits: [simple("Ok")],
        upstream_commits: [{ hash: "", subject: "x" }],
      },
      "upstream_commits[0].hash must be a non-empty string",
    );
    throws(
      {
        commits: [simple("Ok")],
        upstream_commits: [{ hash: 1, subject: "x" }],
      },
      "upstream_commits[0].hash must be a non-empty string",
    );
    throws(
      { commits: [simple("Ok")], upstream_commits: [{ hash: "h" }] },
      "upstream_commits[0].subject is required",
    );
    throws(
      {
        commits: [simple("Ok")],
        upstream_commits: [{ hash: "h", subject: "" }],
      },
      "upstream_commits[0].subject must be a non-empty string",
    );
    throws(
      {
        commits: [simple("Ok")],
        upstream_commits: [{ hash: "h", subject: false }],
      },
      "upstream_commits[0].subject must be a non-empty string",
    );
  });

  it("published present but not a boolean names published", () => {
    throws(
      { commits: [simple("Ok")], published: "true" },
      "published must be a boolean",
    );
    throws(
      { commits: [simple("Ok")], published: 1 },
      "published must be a boolean",
    );
    throws(
      { commits: [simple("Ok")], published: null },
      "published must be a boolean",
    );
  });

  it("unknown extra fields are ignored, at top level and inside entries (pinned judgement call)", () => {
    const out = planRebase({
      commits: [{ hash: "h", subject: "Plain", author: "someone", extra: 1 }],
      upstream_commits: [{ hash: "u", subject: "Up", note: true }],
      published: false,
      branch: "feature/x",
    });
    assert.equal(out.commit_count, 1);
    assert.equal(out.upstream_new_commits, 1);
  });

  it("no partial result is produced on invalid input", () => {
    assert.throws(() =>
      planRebase({
        commits: [simple("Ok"), { hash: "", subject: "Bad" }],
      }),
    );
  });
});
