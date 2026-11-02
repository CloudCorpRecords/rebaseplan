# rebaseplan

Rebasing a branch is easy to start and hard to undo,
especially once other people have the old history. The risky
parts are rarely visible in the branch name: merge commits
that a plain rebase will flatten, squash-merge markers whose
original commits may also live upstream, an upstream that has
moved far ahead, and a published history that a rewrite will
orphan. rebaseplan reads that shape before you start and
returns a plan instead of a surprise.

You hand it the branch's own commits, oldest first, each with
a hash, a subject, and optionally a flag saying it is a merge
commit. You may also hand it the commits upstream has that
this branch does not, and say whether the branch has been
pushed or shared. Nothing is fetched, rebased, or pushed —
the tool only counts and advises.

A commit counts as a squash marker in exactly two ways: its
subject starts with `Squashed commit`, or it ends with a
GitHub squash-merge suffix such as `(#123)` — the pinned test
is the regular expression `/\(#\d+\)$/`. Upstream commits are
never counted as markers, however their subjects read.

Force-push risk follows a fixed table. An unpublished branch
is `low`. A published branch with no merge commits and no
squash markers is `medium`. A published branch with either is
`high`.

The recommended strategy is chosen by first match: any merge
commits means `rebase_with_merge_preservation`; otherwise any
squash markers means `interactive_squash_cleanup`; otherwise
`linear_rebase`. Merge history therefore beats squash
markers when both are present.

The plan's steps always start with fetching upstream and end
with running the test suite on the rebased head and a push
instruction: `--force-with-lease`, never plain `--force`, for
a published branch, with a backup branch created first; or a
normal push when the branch was never published. Warnings, in
order, flag merge commits, squash markers, an upstream ten or
more commits ahead (the warning text is fixed regardless of
the exact count), and the published-history rewrite.

Malformed input — a missing, empty, or non-array `commits`,
an entry with a missing, empty, or non-string `hash` or
`subject` or a non-boolean `merge`, a badly typed
`upstream_commits` entry, or a non-boolean `published` — is a
validation error naming the offending path, with no partial
result. Unknown extra fields are ignored.

## CLI

```bash
npx @reneturcios/rebaseplan plan --input args.json
npx @reneturcios/rebaseplan --version
```

`args.json` contains the full arguments object:

```json
{
  "commits": [
    { "hash": "a1b2c3", "subject": "Add login form" },
    { "hash": "d4e5f6", "subject": "Merge branch 'main'", "merge": true }
  ],
  "upstream_commits": [
    { "hash": "f7a8b9", "subject": "Bump dependencies" }
  ],
  "published": true
}
```

`upstream_commits` defaults to `[]`, `published` defaults to
`false`, and each commit's `merge` defaults to `false`. The
result is printed as JSON:

```json
{
  "commit_count": 2,
  "merge_commits": 1,
  "squash_markers": 0,
  "upstream_new_commits": 1,
  "published": true,
  "force_push_risk": "high",
  "recommended_strategy": "rebase_with_merge_preservation",
  "steps": [
    "fetch upstream before planning the final rebase",
    "create a backup branch pointing at the current head",
    "rebase onto upstream preserving merge commits",
    "run the test suite on the rebased head",
    "push with --force-with-lease, never plain --force"
  ],
  "warnings": [
    "history contains merge commits; a plain rebase will flatten them",
    "branch is published; rewriting it rewrites history others may have based work on"
  ]
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/rebaseplan mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "rebaseplan": {
      "command": "npx",
      "args": ["-y", "@reneturcios/rebaseplan", "mcp"]
    }
  }
}
```

### Tools

- `plan_rebase` — Plan a safe rebase before you start.
  - `commits` (array, required, non-empty) — the branch's own
    commits, oldest first: `{hash, subject, merge}`
  - `upstream_commits` (array, optional, default `[]`) —
    commits the upstream branch has that this branch does not:
    `{hash, subject}`
  - `published` (boolean, optional, default `false`) —
    whether the branch has been pushed or shared

  Returns `{commit_count, merge_commits, squash_markers,
  upstream_new_commits, published, force_push_risk,
  recommended_strategy, steps, warnings}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/rebaseplan
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/rebaseplan plan --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
