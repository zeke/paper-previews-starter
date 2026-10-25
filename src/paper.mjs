// Paper's documented localhost MCP transport. No browser/session storage access.
export class Paper {
  constructor(url = "http://127.0.0.1:29979/mcp") {
    const target = new URL(url);
    if (
      target.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.username ||
      target.password
    )
      throw Error("Paper must be a local HTTP endpoint");
    this.url = url;
    this.id = 0;
  }
  async rpc(method, params) {
    const response = await fetch(this.url, {
      method: "POST",
      signal: AbortSignal.timeout(120000),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json,text/event-stream",
        ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
    });
    if (!response.ok) throw Error(`Paper ${method}: HTTP ${response.status}`);
    this.session = response.headers.get("mcp-session-id") ?? this.session;
    const text = await response.text();
    const data = response.headers
      .get("content-type")
      ?.includes("text/event-stream")
      ? JSON.parse(
          text
            .split("\n")
            .find((line) => line.startsWith("data: "))
            .slice(6),
        )
      : JSON.parse(text);
    if (data.error) throw Error(data.error.message);
    return data.result;
  }
  async connect() {
    await this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "paper-previews", version: "1.0.0" },
    });
    await this.call("get_guide", { topic: "paper-mcp-instructions" });
    return this;
  }
  async call(name, args) {
    // This service has no design mutation tools.
    if (
      ![
        "get_guide",
        "get_basic_info",
        "get_jsx",
        "get_node_info",
        "export",
      ].includes(name)
    )
      throw Error("Unsupported tool");
    const result = await this.rpc("tools/call", { name, arguments: args });
    if (result.isError) throw Error(JSON.stringify(result.content));
    const text =
      typeof result === "string"
        ? result
        : result.content
            ?.filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");
    const start = text?.startsWith('{\n  "file"')
      ? text.indexOf("\n}\n") + 3
      : 0;
    const body = text?.slice(start);
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
}
