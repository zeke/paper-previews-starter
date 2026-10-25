# Project context

Paper Previews is a self-hosted preview service. A local Node process reads
explicitly selected files through Paper Desktop's native MCP API, exports PNGs,
and deploys a complete gallery to Cloudflare Workers with static assets. Public
viewer links work in phone and desktop browsers. This is an independent project.

The exporter needs macOS, an available Paper Desktop file, Node.js 24+ and npm.
The Worker serves the last successful release while the Mac is offline. Paper
also has a browser app; don't describe Paper as desktop-only. The local HTTP MCP
endpoint remains supported while Desktop is running with a file open. See
[Paper's MCP documentation](https://paper.design/docs/mcp).

## Setup

Use a persistent checkout outside Documents, Desktop and Downloads, such as
`~/.local/share/paper-previews`. macOS background privacy prompts can stall a
LaunchAgent that reads code or assets from those protected folders.

```sh
npm ci
cp config.example.json config.json
cp wrangler.example.jsonc wrangler.local.jsonc
```

Set `title` and the explicit `files` allow-list in `config.json`. A Paper URL has
the form `https://app.paper.design/file/<FILE_ID>`; use the file ID. Pick an unused
Worker name in `wrangler.local.jsonc`, and set `account_id` there if needed. Both
local configuration files are ignored by Git. Never default to the foreground
document or scan all private files.

Start with `publish: false` and run `npm run update`. Inspect the resulting PNGs
under `releases/` before enabling public uploads. Publishing is explicitly public:
anyone with a link can view, copy or redistribute the images. Random links are
not authentication. Use a separately reviewed access layer for private previews.

## Architecture and data boundaries

- `src/paper.mjs`: local MCP transport with a read/export tool allow-list. It does
  not read browser/session storage, extract Paper credentials or mutate designs.
- `src/config.mjs`: explicit scope and option validation. Remote Paper endpoints
  and missing file allow-lists are rejected.
- `src/sync.mjs`: inventories allowed files, compares source snapshots, exports
  changed boards, hashes image bytes and stages a complete release.
- `src/worker.mjs`: neutral root landing, opaque gallery/board routes and static
  image delivery. The root must not list galleries or reveal their identifiers.
- `scripts/update.mjs`: process locking, pause checks and complete-release
  deployment. `scripts/install-agent.mjs` installs configurable macOS polling.

Preserve `.state/` privately: it maps native IDs to stable public UUIDs and records
the current staged and published releases. Board names can change without changing
viewer links. Recreated boards get new identities. Content hashes version PNG
URLs and deduplicate uploads. Metadata pages use `no-store`; versioned images are
immutable. Capture times show freshness; viewers reload for the latest snapshot.

Only selected PNGs, names, page labels and capture metadata are deployed. Never
commit or publish raw inventory, native file/node IDs, file URLs, JSX, local paths,
state, designs, logs, credentials or real instance configuration. Keep tests and
documentation examples neutral. Audit all reachable Git history before a public
source release. `noindex`, robots.txt and referrer headers are hygiene, not access
control.

## Export and polling

The updater takes two source snapshots separated by `settleMs` (five seconds by
default), exports changed boards and checks the source again. Detected concurrent
edits, failed exports or an empty inventory preserve the existing cloud release.
A settling check cannot establish that a design is conceptually finished.

For coordinated edits that must remain unpublished:

```sh
npm run pause
# Complete the design edits.
npm run resume
npm run update
```

The pause marker skips reads, exports and deployments while leaving the last
gallery online. To force one native re-export without changing its design:

```sh
npm run update -- --refresh-board <PUBLIC_BOARD_UUID>
```

`npm run install-agent` installs a user LaunchAgent. It runs immediately and every
`pollSeconds` (300 by default) while the user is logged in. Paper and the Mac must
be available. Every poll reads each selected board twice, with a third snapshot
on changed runs, so account for the Paper MCP allowance. This is polling; don't
claim instant event delivery. New pages/boards within selected files are discovered
automatically. New documents require an explicit allow-list change.

## Cloudflare deployment

```sh
npx wrangler login
# Enable publish in local config after approving the selected exports.
npm run update
```

Use the operator's intended Cloudflare account and an unused Worker name. Never
overwrite an unrelated Worker. This uses static assets, not R2. Inspect current
Cloudflare limits and account usage; don't silently add paid services, credentials,
storage grants or access policies.

Custom domains are configured separately in the dashboard after checking DNS and
Worker collisions. Unattended deployment rejects `routes`, since noninteractive
Wrangler can replace conflicting DNS records. Existing domain bindings survive
normal updates. Failed deployments retry a complete staged release.

## Tests and maintenance

```sh
npm test
npm run check
npm run format
```

Tests use generated neutral PNGs and a fake Paper API; CI requires no Paper access
or cloud credentials. Coverage includes changed bytes, scope, new-board discovery,
stable IDs, failed/partial exports, empty results, pause/resume, route privacy and
caching. Native smoke tests must use explicitly selected files and preserve source
designs. Browser emulation is useful, but must not be reported as physical-phone
testing.

Preserve existing useful instructions in [CONTRIBUTING.md](CONTRIBUTING.md) and
[docs/operations.md](docs/operations.md). The latter covers pausing/uninstalling
the LaunchAgent, reinstalling after path/Node/interval changes, configuration,
storage growth and recovery. Source licensing is [MIT](LICENSE).
