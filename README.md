# OpenClaw MoviePilot Plugin (MoviePilot REST)

This plugin exposes MoviePilot's REST API to OpenClaw via fixed tools.

## Install (local dev)

```bash
openclaw plugins install -l C:\path\to\openclaw-moviepilot
```

## Configure

Example updates to merge into your existing `openclaw.json`:

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
  }
}
```

Add the allow/optionalAllow settings under your existing `tools` section:

```json
{
  "tools": {
    "web": {
      "search": { "enabled": false },
      "fetch": { "enabled": true }
    },
    "allow": ["openclaw-moviepilot"],
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

Notes:

1. Optional tools (writes) require explicit allow-listing in your agent or global tools config.
2. If your API token is passed via query string (for example `?token=...`), set `apiKeyMode` to `query` and set `apiKeyQueryParam` accordingly.
3. If OpenClaw runs in Docker, use `host.docker.internal` or host networking for `baseUrl`.

## Tools

Read tools:

1. `moviepilot.search`
2. `moviepilot.subscriptions.list`
3. `moviepilot.downloads.list`

Write tools (optional):

1. `moviepilot.subscriptions.add`
2. `moviepilot.subscriptions.remove`
3. `moviepilot.downloads.add`
4. `moviepilot.downloads.pause`
5. `moviepilot.downloads.resume`
6. `moviepilot.downloads.remove`

## Skill

The MoviePilot skill lives at `skills/moviepilot/SKILL.md`. It is gated by the presence of:

```
plugins.entries.openclaw-moviepilot.config.services.moviepilot.baseUrl
```
