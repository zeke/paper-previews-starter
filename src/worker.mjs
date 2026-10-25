const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow, noarchive",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "content-security-policy":
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};
function html(title, body) {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)}</title><style>*{box-sizing:border-box}body{margin:0;color:#222;background:#fff;font:16px/1.5 system-ui,sans-serif}header{padding:20px;border-bottom:1px solid #ddd}h1{font-size:24px;margin:4px 0}a{color:#153caf}small{display:block}main{padding:20px}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:32px}.gallery img{width:100%;height:auto;border:1px solid #ddd}.gallery a{text-decoration:none}figure{margin:0}figcaption{padding:8px 0}.viewer{overflow:auto;padding:0}.full{display:block;max-width:100%;height:auto;margin:auto}.native{display:inline-block;margin-top:8px}time{font-variant-numeric:tabular-nums}</style>${body}</html>`,
    { headers },
  );
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    if (url.pathname === "/")
      return html(
        "Paper previews",
        "<header><h1>Paper previews</h1></header><main><h2>Open your complete preview link</h2><p>This service hosts public design previews. Use the complete gallery or board link you were given to view a design.</p><p>The hostname alone does not list galleries. Ask the person sharing the design for its full link.</p></main>",
      );
    if (url.pathname === "/robots.txt")
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: { "content-type": "text/plain" },
      });
    const match = url.pathname.match(
      /^\/g\/([0-9a-f-]{36})(?:\/(?:b\/([0-9a-f-]{36})|manifest\.json|images\/.+))?\/?$/,
    );
    if (!match || match[1] !== env.GALLERY_ID)
      return new Response("Not found", {
        status: 404,
        headers: { "cache-control": "no-store" },
      });
    if (url.pathname.includes("/images/")) {
      const response = await env.ASSETS.fetch(request);
      const h = new Headers(response.headers);
      h.set("x-robots-tag", "noindex, nofollow, noarchive");
      h.set("referrer-policy", "no-referrer");
      h.set(
        "cache-control",
        response.ok ? "public, max-age=31536000, immutable" : "no-store",
      );
      return new Response(response.body, {
        status: response.status,
        headers: h,
      });
    }
    const response = await env.ASSETS.fetch(
      new Request(`${url.origin}/g/${env.GALLERY_ID}/manifest.json`),
    );
    if (!response.ok)
      return new Response("Preview unavailable", { status: 503 });
    const data = await response.json();
    if (url.pathname.endsWith("/manifest.json"))
      return Response.json(data, {
        headers: {
          "cache-control": "no-store",
          "x-robots-tag": "noindex, nofollow, noarchive",
        },
      });
    const home = `/g/${env.GALLERY_ID}/`;
    const stamp = `<small>Preview captured <time>${escape(data.updatedAt)}</time> · revision ${escape(data.revision.slice(0, 8))}</small><small>Checks about every ${data.pollSeconds / 60} minutes while Paper and the Mac are available. Reload for latest.</small>`;
    if (match[2]) {
      const board = data.boards.find((b) => b.id === match[2]);
      if (!board) return new Response("Not found", { status: 404 });
      return html(
        board.name,
        `<header><a href="${home}">← All designs</a><h1>${escape(board.name)}</h1><small>${escape(board.pageName)}</small><small>${board.width} × ${board.height} · captured ${escape(board.updatedAt)}</small><a class="native" href="${board.image}">Open full resolution image / pinch to zoom</a>${stamp}</header><main class="viewer"><img class="full" src="${board.image}" width="${board.width}" height="${board.height}" alt="${escape(board.name)}"></main>`,
      );
    }
    return html(
      data.title,
      `<header><h1>${escape(data.title)}</h1><small>${data.boards.length} designs · newest first · public link previews</small>${stamp}</header><main class="gallery">${data.boards.map((b) => `<figure><a href="${home}b/${b.id}"><img loading="lazy" src="${b.image}" width="${b.width}" height="${b.height}" alt="${escape(b.name)}"><figcaption><strong>${escape(b.name)}</strong><small>${escape(b.pageName)}</small><small>Captured ${escape(b.updatedAt)}</small></figcaption></a></figure>`).join("")}</main>`,
    );
  },
};
