# Paper previews

[Paper](https://paper.design) is a great place to design on your desktop. This
project makes those designs easy to review on your phone: select your files,
run an updater on your Mac, and get shareable preview links hosted on Cloudflare.

Previews keep tall designs at full height, show when they were captured, and keep
the same board links as you iterate. Renames update the readable image filenames.

## Setup

You'll need macOS with Paper Desktop running, Node.js 24+, and a Cloudflare
account. Clone this repository into a persistent directory such as
`~/.local/share/paper-previews`, outside Documents, Desktop and Downloads.

```sh
npm ci
cp config.example.json config.json
cp wrangler.example.jsonc wrangler.local.jsonc
```

In `config.json`, set the gallery title and the Paper file IDs you want to share.
A file URL looks like `https://app.paper.design/file/<FILE_ID>`. In
`wrangler.local.jsonc`, choose an unused Worker name; add `account_id` if needed.
Both local config files are excluded from Git.

Export locally first, with `publish` left at `false`:

```sh
npm run update
```

Inspect the PNGs under `releases/`. When you're ready to publish those files:

```sh
npx wrangler login
# Set "publish": true in config.json.
npm run update
```

The command prints your full gallery URL. Open it to get stable links for
individual boards. The bare hostname shows a help page without listing designs.
Cloudflare static assets hold the images; no R2 bucket is needed.

## Keep it updated

```sh
npm run install-agent
```

The macOS updater checks every five minutes by default. It needs the Mac awake,
you logged in, and Paper available. This is polling, not instant event delivery;
it consumes Paper MCP calls. The last successful gallery stays online if updates
fail. Reload a preview to see the latest capture.

**Preview links are public. Random URLs are not authentication.** Anyone with a
link can view or share its images. Only explicitly selected files are exported.
Back up `.state/` privately to preserve the link mappings.

## Development

```sh
npm test
npm run check
```

See [operations](docs/operations.md) for configuration, custom domains, pausing
updates, failure handling and storage. Tests use neutral fixtures; CI needs no
Paper connection or cloud credentials. Licensed under [MIT](LICENSE).
