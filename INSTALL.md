# Install Guide (MoviePilot REST -> OpenClaw)

This guide installs the `openclaw-moviepilot` plugin and wires MoviePilot REST API endpoints into OpenClaw.

## Prerequisites

1. OpenClaw is installed and the Gateway process is running.
2. MoviePilot REST API is reachable (for example, `http://localhost:3001`).
3. If MoviePilot requires authentication, have your API key or token ready.

## Install

1. Local dev install (link mode):

```bash
openclaw plugins install -l C:\Users\admin\Documents\github.com\mcp-plugin
```

2. Edit `~/.openclaw/openclaw.json` and add plugin config:

```json
{
  "plugins": {
    "entries": {
      "openclaw-moviepilot": {
        "enabled": true,
        "config": {
          "services": {
            "moviepilot": {
              "baseUrl": "http://localhost:3001",
              "apiKey": "YOUR_API_KEY",
              "apiKeyMode": "header",
              "apiKeyHeader": "X-API-KEY",
              "endpoints": {
                "searchMedia": { "path": "/api/v1/search/media/{mediaId}" },
                "searchTitle": { "path": "/api/v1/search/title" },
                "downloadsList": { "path": "/api/v1/download/" },
                "downloadsAdd": { "path": "/api/v1/download/" },
                "downloadsPause": { "path": "/api/v1/download/stop/{hash}" },
                "downloadsResume": { "path": "/api/v1/download/start/{hash}" },
                "downloadsRemove": { "path": "/api/v1/download/{hash}" },
                "subscriptionsList": { "path": "/api/v1/subscribe/" },
                "subscriptionsAdd": { "path": "/api/v1/subscribe/" },
                "subscriptionsRemove": { "path": "/api/v1/subscribe/{id}" }
              }
            }
          }
        }
      }
    }
  },
  "tools": {
    "allow": ["openclaw-moviepilot"]
  }
}
```

3. Allow write tools when needed (optional):

```json
{
  "tools": {
    "optionalAllow": [
      "moviepilot.subscriptions.add",
      "moviepilot.subscriptions.remove",
      "moviepilot.downloads.add",
      "moviepilot.downloads.pause",
      "moviepilot.downloads.resume",
      "moviepilot.downloads.remove"
    ]
  }
}
```

4. Restart OpenClaw Gateway.

## Verify

1. Check plugin list:

```bash
openclaw plugins list
```

2. Inspect plugin info:

```bash
openclaw plugins info openclaw-moviepilot
```

3. If you set `debug: true`, startup logs will confirm tool registration.

## Docker Note

If OpenClaw runs in a container, `baseUrl` might need to use `http://host.docker.internal:3001` or host networking.
