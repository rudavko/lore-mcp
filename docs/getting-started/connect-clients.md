# Connect LORE to Your Clients

Use this endpoint in each client integration:

```text
https://<your-worker>.<subdomain>.workers.dev/mcp
```

## Claude Desktop

```json
{
  "mcpServers": {
    "lore": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<your-worker>.<subdomain>.workers.dev/mcp"
      ]
    }
  }
}
```

## Claude Code

```bash
claude mcp add --transport http lore https://<your-worker>.<subdomain>.workers.dev/mcp
```

## Web Agents (claude.ai / chatgpt.com)

Paste the same endpoint into the MCP connector/integration settings.

Once connected, those agents share the same LORE memory.
