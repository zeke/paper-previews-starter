# Contributing

Use Node.js 24 or newer, then run `npm ci`, `npm test` and `npm run check`.
`npm run format` formats the source and documentation.

Tests should use neutral generated fixtures and a fake Paper API. Native smoke
tests need an explicitly selected file and an open Paper Desktop app; keep those
tests local and leave publishing disabled. CI needs no account credentials.

Keep personal file IDs, hostnames, preview URLs, local paths and account settings
in ignored local configuration. Never commit designs, state, logs or credentials.
Before a public release, review all reachable Git history as well as the current
tree. Removing a value from the latest commit doesn't remove it from history.

Preserve stable board IDs, content hashes and complete-release publication when
changing the pipeline. The root landing must not enumerate galleries or reveal
their identifiers. Update tests when changing those boundaries.

For the architecture, configuration and maintenance commands, see
[operations](docs/operations.md).
