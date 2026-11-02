# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `plan_rebase` MCP tool and `plan` CLI
  command planning a safe rebase for one branch from its
  commit list, its upstream distance, and whether it is
  published.
- Pinned counts: merge commits, and squash markers detected
  by the `Squashed commit` prefix or the `/\(#\d+\)$/`
  suffix on the branch's own commits only.
- Pinned force-push risk table (low / medium / high) and
  first-match strategy selection, with merge preservation
  beating squash cleanup.
- Pinned steps and warnings in pinned order, including the
  fixed upstream-distance warning at ten or more commits.
- Path-naming validation errors for malformed input,
  including per-entry paths for both commit arrays.
