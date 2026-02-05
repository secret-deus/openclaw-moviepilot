---
name: moviepilot-rest
description: Use MoviePilot REST tools via OpenClaw to search, list subscriptions, and manage downloads.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.openclaw-moviepilot.config.services.moviepilot.baseUrl"]}}}
---

# MoviePilot REST (OpenClaw)

Use the registered MoviePilot REST tools to search the library, list subscriptions, and manage downloads.

Tool naming:

1. Tools are registered with fixed names like `moviepilot.search` and `moviepilot.downloads.list`.

Safety:

1. Treat any tool whose name implies state change as a write tool (add, create, update, delete, remove, subscribe, pause, resume).
2. Before calling a write tool, restate the user's intent and confirm the action.

Output:

1. Summarize results in a short list with titles and statuses.
2. If the API returns structured data, preserve key fields like `id`, `title`, `status`, and `reason`.

Example:

User: Subscribe to Dune Part Two
Assistant: I will add a subscription for Dune Part Two. Proceed?
User: Yes
Assistant: (calls `moviepilot.subscriptions.add`)
