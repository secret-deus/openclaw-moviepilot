type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: JsonValue;
  parameters?: JsonValue;
};

type MoviePilotConfig = {
  baseUrl?: string;
  endpointPath?: string;
  apiKey?: string;
  apiKeyMode?: "header" | "query" | "none";
  apiKeyHeader?: string;
  apiKeyQueryParam?: string;
  toolPrefix?: string;
  expose?: string[];
  optionalTools?: string[];
  timeoutMs?: number;
  retries?: number;
  debug?: boolean;
};

type PluginConfig = {
  services?: {
    moviepilot?: MoviePilotConfig;
  };
};

type ToolResult = {
  content: Array<{ type: string; text?: string; data?: JsonValue }>;
  [key: string]: JsonValue;
};

type Logger = {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
  log?: (msg: string) => void;
};

type PluginApi = {
  config?: Record<string, JsonValue>;
  registerTool: (tool: {
    name: string;
    description?: string;
    parameters?: JsonValue;
    execute: (id: string, params: Record<string, JsonValue>) => Promise<ToolResult>;
  }, options?: { optional?: boolean }) => void;
  log?: Logger;
  logger?: Logger;
};

const PLUGIN_ID = "openclaw-local-services-bridge";

class JsonRpcClient {
  private endpointUrl: string;
  private headers: Record<string, string>;
  private timeoutMs: number;
  private retries: number;
  private idCounter: number;

  constructor(options: {
    endpointUrl: string;
    headers: Record<string, string>;
    timeoutMs: number;
    retries: number;
  }) {
    this.endpointUrl = options.endpointUrl;
    this.headers = options.headers;
    this.timeoutMs = options.timeoutMs;
    this.retries = options.retries;
    this.idCounter = 0;
  }

  async request<T = JsonValue>(method: string, params?: Record<string, JsonValue>): Promise<T> {
    const payload: Record<string, JsonValue> = {
      jsonrpc: "2.0",
      id: ++this.idCounter,
      method,
    };
    if (params) {
      payload.params = params;
    }

    const body = JSON.stringify(payload);
    const response = await fetchWithRetry(
      this.endpointUrl,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...this.headers,
        },
        body,
      },
      {
        timeoutMs: this.timeoutMs,
        retries: this.retries,
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MCP HTTP ${response.status}: ${trimForError(text)}`);
    }

    const data = await safeJson(response);
    if (!data || typeof data !== "object") {
      throw new Error("MCP response was not JSON.");
    }

    if ("error" in data && data.error) {
      const message =
        typeof data.error === "object" && data.error && "message" in data.error
          ? String((data.error as Record<string, JsonValue>).message)
          : "Unknown MCP error";
      throw new Error(`MCP error: ${message}`);
    }

    if (!("result" in data)) {
      throw new Error("MCP response missing result.");
    }

    return data.result as T;
  }
}

function resolvePluginConfig(api: PluginApi, pluginId: string): PluginConfig {
  const raw = (api?.config ?? {}) as Record<string, JsonValue>;
  if ("services" in raw) {
    return raw as PluginConfig;
  }
  const entries = (raw.plugins as Record<string, JsonValue> | undefined)?.entries;
  if (entries && typeof entries === "object" && pluginId in entries) {
    const entry = (entries as Record<string, JsonValue>)[pluginId];
    if (entry && typeof entry === "object" && "config" in entry) {
      return (entry as Record<string, JsonValue>).config as PluginConfig;
    }
  }
  return {};
}

function resolveEndpointUrl(baseUrl: string, endpointPath?: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  if (!endpointPath) {
    return trimmedBase;
  }
  const normalizedPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  if (trimmedBase.endsWith(normalizedPath)) {
    return trimmedBase;
  }
  const url = new URL(normalizedPath, `${trimmedBase}/`);
  return url.toString();
}

function normalizeToolName(name: string): string {
  const normalized = name
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return normalized || "moviepilot_tool";
}

function computeOptional(
  toolName: string,
  mappedName: string,
  optionalSet: Set<string>
): boolean {
  if (optionalSet.has(toolName) || optionalSet.has(mappedName) || optionalSet.has(normalizeToolName(toolName))) {
    return true;
  }
  const lower = toolName.toLowerCase();
  return [
    "add",
    "create",
    "update",
    "delete",
    "remove",
    "subscribe",
    "pause",
    "resume",
    "start",
    "stop",
    "enable",
    "disable",
    "set",
    "put",
    "post",
  ].some((token) => lower.includes(token));
}

function trimForError(text: string, max = 500): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned;
}

function safeStringify(value: JsonValue): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function safeJson(response: { text: () => Promise<string> }): Promise<Record<string, JsonValue> | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as Record<string, JsonValue>;
  } catch {
    throw new Error(`Invalid JSON response: ${trimForError(text)}`);
  }
}

async function fetchWithRetry(
  url: string,
  options: Record<string, unknown>,
  config: { timeoutMs: number; retries: number }
): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  let attempt = 0;
  let lastError: Error | null = null;
  while (attempt <= config.retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.status >= 500 && attempt < config.retries) {
        attempt += 1;
        await delay(backoff(attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt >= config.retries) {
        break;
      }
      attempt += 1;
      await delay(backoff(attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error("Unknown MCP request error.");
}

function backoff(attempt: number): number {
  return Math.min(1000 * attempt, 3000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function register(api: PluginApi): Promise<void> {
  const logger = api.log ?? api.logger ?? console;
  const pluginConfig = resolvePluginConfig(api, PLUGIN_ID);
  const moviepilot = pluginConfig.services?.moviepilot;
  if (!moviepilot?.baseUrl) {
    logger.info?.("MoviePilot MCP not configured; skipping tool registration.");
    return;
  }

  let endpointUrl: string;
  try {
    endpointUrl = resolveEndpointUrl(moviepilot.baseUrl, moviepilot.endpointPath);
  } catch (error) {
    logger.error?.(`Invalid MoviePilot MCP baseUrl: ${(error as Error).message}`);
    return;
  }
  const apiKeyMode = moviepilot.apiKeyMode ?? "header";
  const headers: Record<string, string> = {};
  let requestUrl = endpointUrl;

  if (moviepilot.apiKey && apiKeyMode === "header") {
    headers[moviepilot.apiKeyHeader ?? "X-API-KEY"] = moviepilot.apiKey;
  }
  if (moviepilot.apiKey && apiKeyMode === "query") {
    const url = new URL(endpointUrl);
    url.searchParams.set(moviepilot.apiKeyQueryParam ?? "apikey", moviepilot.apiKey);
    requestUrl = url.toString();
  }

  const client = new JsonRpcClient({
    endpointUrl: requestUrl,
    headers,
    timeoutMs: moviepilot.timeoutMs ?? 15000,
    retries: moviepilot.retries ?? 1,
  });

  let tools: McpTool[] = [];
  try {
    const result = await client.request<{ tools?: McpTool[] }>("tools/list");
    tools = Array.isArray(result.tools) ? result.tools : [];
  } catch (error) {
    logger.error?.(`MoviePilot MCP tools/list failed: ${(error as Error).message}`);
    return;
  }

  if (!tools.length) {
    logger.warn?.("MoviePilot MCP returned no tools; nothing to register.");
    return;
  }

  const prefix = normalizeToolName(moviepilot.toolPrefix ?? "moviepilot");
  const exposeSet = new Set(moviepilot.expose ?? []);
  const optionalSet = new Set(moviepilot.optionalTools ?? []);
  const usedNames = new Set<string>();

  for (const tool of tools) {
    if (!tool?.name) {
      continue;
    }
    let mappedName = normalizeToolName(`${prefix}_${tool.name}`);
    const normalizedToolName = normalizeToolName(tool.name);
    if (
      exposeSet.size > 0 &&
      !exposeSet.has(tool.name) &&
      !exposeSet.has(mappedName) &&
      !exposeSet.has(normalizedToolName)
    ) {
      continue;
    }

    let suffix = 2;
    while (usedNames.has(mappedName)) {
      mappedName = `${normalizeToolName(`${prefix}_${tool.name}`)}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(mappedName);

    const parameters = (tool.inputSchema ?? tool.parameters) as JsonValue | undefined;
    const optional = computeOptional(tool.name, mappedName, optionalSet);

    api.registerTool(
      {
        name: mappedName,
        description: tool.description ?? `MoviePilot MCP tool: ${tool.name}`,
        parameters: parameters ?? { type: "object", additionalProperties: true },
        execute: async (_id, params) => {
          const result = await client.request<JsonValue>("tools/call", {
            name: tool.name,
            arguments: (params ?? {}) as JsonValue,
          });

          if (result && typeof result === "object" && "content" in result) {
            return result as ToolResult;
          }

          return {
            content: [
              {
                type: "text",
                text: safeStringify(result),
              },
            ],
          };
        },
      },
      optional ? { optional: true } : undefined
    );
  }

  if (moviepilot.debug) {
    logger.info?.(`Registered ${usedNames.size} MoviePilot MCP tools.`);
  }
}
