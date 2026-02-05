# OpenClaw Local Services Bridge (MoviePilot MCP)

This plugin exposes MoviePilot's MCP tools to OpenClaw by proxying `tools/list` and `tools/call` over HTTP JSON-RPC.

## Install (local dev)

```bash
openclaw plugins install -l C:\path\to\openclaw-local-services-bridge
```

## Configure

Example `openclaw.json` entry:

```json
{
  "plugins": {
    "entries": {
      "openclaw-local-services-bridge": {
        "enabled": true,
        "config": {
          "services": {
            "moviepilot": {
              "baseUrl": "http://localhost:3001",
              "endpointPath": "/api/v1/mcp",
              "apiKey": "YOUR_API_KEY",
              "apiKeyMode": "header",
              "toolPrefix": "moviepilot",
              "optionalTools": ["subscriptions_add", "downloads_add"]
            }
          }
        }
      }
    }
  },
  "tools": {
    "allow": ["openclaw-local-services-bridge"]
  }
}
```

Notes:

1. Tools are registered as `moviepilot_<mcp_tool_name>` by default. Change the prefix with `toolPrefix`.
2. Optional tools require explicit allow-listing in your agent or global tools config.
3. If OpenClaw runs in Docker, use `host.docker.internal` or host networking for `baseUrl`.

## Alternate MoviePilot MCP server

If you run a separate MCP server (for example, `moviepilot-mcp` on port 8000):

```json
{
  "plugins": {
    "entries": {
      "openclaw-local-services-bridge": {
        "enabled": true,
        "config": {
          "services": {
            "moviepilot": {
              "baseUrl": "http://localhost:8000",
              "endpointPath": "/mcp",
              "apiKeyMode": "header",
              "apiKeyHeader": "X-API-Key"
            }
          }
        }
      }
    }
  }
}
```

## Skill

The MoviePilot skill lives at `skills/moviepilot/SKILL.md`. It is gated by the presence of:

```
plugins.entries.openclaw-local-services-bridge.config.services.moviepilot.baseUrl
```
