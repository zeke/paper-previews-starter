# Operations

Detailed configuration and maintenance for a self-hosted instance. Start with the
[quick start](../README.md).

## Coordinated design edits

For a longer editing session that must stay unpublished, run `npm run pause`
before edits begin. Finish the boards, then run `npm run resume` and
`npm run update`. The pause marker skips source reads, exports and deployments;
the existing gallery keeps serving. Snapshot settling checks detect concurrent
changes, but cannot determine whether a design is conceptually finished.

## Automatic updates

```sh
npm run install-agent
```

The macOS LaunchAgent runs immediately and then every `pollSeconds` (300 by
default) while you're logged in. Its label defaults to
`dev.paper-previews.updater`. It refuses to replace an existing job. To inspect
or pause the default job:

```sh
launchctl print gui/$(id -u)/dev.paper-previews.updater
tail -f .state/service.log .state/service-error.log
launchctl bootout gui/$(id -u)/dev.paper-previews.updater
```

Reinstall the agent after moving the checkout, changing its label or polling
interval, or removing the installed Node binary. To reinstall, unload the old
job, remove its specific plist from `~/Library/LaunchAgents`, then run the
installer again. Keep the checkout and `.state/` in place.

## Configuration

| Option             | Default                      | Purpose                                                                   |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------- |
| `files`            | required                     | Explicit Paper file IDs. New pages and boards within them are discovered. |
| `title`            | `Paper previews`             | Gallery heading.                                                          |
| `publish`          | `false`                      | Enable cloud deployment after reviewing the selected exports.             |
| `pollSeconds`      | `300`                        | LaunchAgent interval; reinstall after changing it.                        |
| `settleMs`         | `5000`                       | Time between two source snapshots before export.                          |
| `exportScale`      | `1x`                         | Paper PNG export scale, for example `2x` or `1440w`.                      |
| `paperUrl`         | local port `29979`           | Local HTTP MCP endpoint. Remote endpoints are rejected.                   |
| `deploymentConfig` | `wrangler.local.jsonc`       | Untracked local Worker settings.                                          |
| `agentLabel`       | `dev.paper-previews.updater` | Unique macOS job label.                                                   |

Every poll reads each allowed board twice; changed runs take a third snapshot
after exporting. This consumes Paper's MCP call allowance. Choose a polling
interval that fits your plan. This is polling, not an instant change webhook.

## Links, freshness and failures

Designs appear newest first, with public/admin pairs together. When complete
creation metadata is unavailable, persistent first-discovery order is used,
initially seeded from Paper's page/artboard sequence. This approximates design
age; it does not use image capture or modification times. The manifest identifies
which ordering basis was used. Re-exporting an older design does not promote it.

Gallery and board identifiers are UUIDv4 values with 122 random bits. A board's
viewer URL stays stable when its name changes. The PNG filename follows the
current name, and its URL includes a SHA-256 content hash. Unchanged images are
reused. Viewer pages and manifests use `no-store`; versioned PNGs are immutable.
Reload a viewer to see a newer capture. Full-resolution image links support zoom.

Two matching source snapshots provide a settling check. A detected edit during
export, a failed export, an empty inventory, or an unavailable Paper server leaves
the existing gallery published. This doesn't establish that a design is finished:
a pause in a longer editing session can still expose unfinished work. Paper
doesn't provide a finished-edit transaction to this service.

Only a complete staged release is eligible for cloud deployment. Failed deploys
retry on a later run. A process lock prevents concurrent updates. Capture times
show when an offline Mac has left a gallery unchanged. To re-export one board
without editing its source:

```sh
npm run update -- --refresh-board <PUBLIC_BOARD_UUID>
```

Back up `.state/` privately. It maps native Paper IDs to public UUIDs; deleting it
loses stable links. Recreating a board creates a new identity. If Paper reassigns
native IDs, rebind that mapping deliberately rather than guessing from names.
Local releases and cached PNGs accumulate; retain or remove old releases according
to your own storage needs while keeping the current release and state mapping.

## Data boundaries

`config.json`, `wrangler.local.jsonc`, `.state/`, releases, logs and credentials
are excluded from Git. Deployed assets contain the selected board PNGs, their
names, page labels and capture metadata. Native file/node IDs, file URLs, JSX,
local paths and unrelated document inventories aren't deployed. The service has
no Paper design mutation tools and doesn't scan all documents.

`noindex`, robots.txt and no-referrer headers reduce indexing and referrer
leakage. They don't restrict access or revoke copied images. Add a separate,
reviewed authentication layer if you need private previews.

## Development

```sh
npm test
npm run check
npm run format
```

Tests use neutral generated PNG fixtures and a fake Paper API. They cover scoped
reads, changed image bytes, stable rename links, deduplication, failed and partial
exports, empty scope/inventory guards, public routes, escaping and cache headers.
CI runs without Paper access or Cloudflare credentials. Browser emulation can
check mobile layout; it doesn't establish that a physical phone was tested.

Sources: [Paper MCP](https://paper.design/docs/mcp),
[Paper export shortcuts](https://paper.design/docs/support),
[Workers static assets](https://developers.cloudflare.com/workers/static-assets/).

Licensed under [MIT](../LICENSE).
