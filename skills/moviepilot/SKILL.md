---
name: moviepilot-mcp
description: Use MoviePilot MCP tools via OpenClaw to search, list subscriptions, and manage downloads.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.openclaw-local-services-bridge.config.services.moviepilot.baseUrl"]}}}
---

# MoviePilot MCP (OpenClaw)

Use the registered MoviePilot MCP tools to search the library, list subscriptions, and manage downloads.

Tool naming:

1. Tools are registered as `moviepilot_<mcp_tool_name>` by default.
2. If `toolPrefix` is configured, replace `moviepilot_` with the configured prefix.

Safety:

1. Treat any tool whose name implies state change as a write tool (add, create, update, delete, remove, subscribe, pause, resume).
2. Before calling a write tool, restate the user's intent and confirm the action.

Output:

1. Summarize results in a short list with titles and statuses.
2. If the MCP tool returns structured data, preserve key fields like `id`, `title`, `status`, and `reason`.

Example:

User: Subscribe to Dune Part Two
Assistant: I will add a subscription for Dune Part Two. Proceed?
User: Yes
Assistant: (calls the appropriate `moviepilot_*` add tool)
