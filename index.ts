type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

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
  registerTool: (
    tool: {
      name: string;
      description?: string;
      parameters?: JsonValue;
      execute: (id: string, params: Record<string, JsonValue>) => Promise<ToolResult>;
    },
    options?: { optional?: boolean }
  ) => void;
  log?: Logger;
  logger?: Logger;
};

type EndpointConfig = {
  path?: string;
  method?: string;
};

type MoviePilotEndpoints = {
  searchMedia?: EndpointConfig;
  searchTitle?: EndpointConfig;
  downloadsList?: EndpointConfig;
  downloadsAdd?: EndpointConfig;
  downloadsPause?: EndpointConfig;
  downloadsResume?: EndpointConfig;
  downloadsRemove?: EndpointConfig;
  subscriptionsList?: EndpointConfig;
  subscriptionsAdd?: EndpointConfig;
  subscriptionsRemove?: EndpointConfig;
};

type MoviePilotConfig = {
  baseUrl?: string;
  apiKey?: string;
  apiKeyMode?: "header" | "query" | "bearer" | "none";
  apiKeyHeader?: string;
  apiKeyQueryParam?: string;
  timeoutMs?: number;
  retries?: number;
  endpoints?: MoviePilotEndpoints;
  debug?: boolean;
};

type PluginConfig = {
  services?: {
    moviepilot?: MoviePilotConfig;
  };
};

type FetchResponse = {
  ok: boolean;
  status: number;
  headers?: { get: (name: string) => string | null };
  text: () => Promise<string>;
};

type RequestOptions = {
  pathParams?: Record<string, string>;
  query?: Record<string, JsonValue>;
  body?: JsonValue;
};

const PLUGIN_ID = "openclaw-moviepilot";

const DEFAULT_ENDPOINTS: Required<Pick<MoviePilotEndpoints,
  | "searchMedia"
  | "searchTitle"
  | "downloadsList"
  | "downloadsAdd"
  | "downloadsPause"
  | "downloadsResume"
  | "downloadsRemove"
  | "subscriptionsList"
  | "subscriptionsAdd"
  | "subscriptionsRemove"
>> = {
  searchMedia: { path: "/api/v1/search/media/{mediaId}", method: "GET" },
  searchTitle: { path: "/api/v1/search/title", method: "GET" },
  downloadsList: { path: "/api/v1/download/", method: "GET" },
  downloadsAdd: { path: "/api/v1/download/", method: "POST" },
  downloadsPause: { path: "/api/v1/download/stop/{hash}", method: "GET" },
  downloadsResume: { path: "/api/v1/download/start/{hash}", method: "GET" },
  downloadsRemove: { path: "/api/v1/download/{hash}", method: "DELETE" },
  subscriptionsList: { path: "/api/v1/subscribe/", method: "GET" },
  subscriptionsAdd: { path: "/api/v1/subscribe/", method: "POST" },
  subscriptionsRemove: { path: "/api/v1/subscribe/{id}", method: "DELETE" }
};

class MoviePilotClient {
  private baseUrl: string;
  private apiKey?: string;
  private apiKeyMode: "header" | "query" | "bearer" | "none";
  private apiKeyHeader: string;
  private apiKeyQueryParam: string;
  private timeoutMs: number;
  private retries: number;

  constructor(options: {
    baseUrl: string;
    apiKey?: string;
    apiKeyMode?: "header" | "query" | "bearer" | "none";
    apiKeyHeader?: string;
    apiKeyQueryParam?: string;
    timeoutMs?: number;
    retries?: number;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.apiKeyMode = options.apiKeyMode ?? "header";
    this.apiKeyHeader = options.apiKeyHeader ?? "X-API-KEY";
    this.apiKeyQueryParam = options.apiKeyQueryParam ?? "apikey";
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.retries = options.retries ?? 1;
  }

  async request(method: string, pathTemplate: string, options: RequestOptions): Promise<JsonValue> {
    const path = applyPathParams(pathTemplate, options.pathParams);
    const url = buildUrl(this.baseUrl, path, options.query);

    const headers: Record<string, string> = {};
    if (this.apiKey && this.apiKeyMode === "header") {
      headers[this.apiKeyHeader] = this.apiKey;
    }
    if (this.apiKey && this.apiKeyMode === "bearer") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    if (options.body !== undefined && method.toUpperCase() !== "GET") {
      headers["content-type"] = "application/json";
    }

    const requestUrl = this.apiKey && this.apiKeyMode === "query"
      ? withQueryParam(url, this.apiKeyQueryParam, this.apiKey)
      : url;

    const response = await fetchWithRetry(
      requestUrl,
      {
        method: method.toUpperCase(),
        headers,
        body: options.body !== undefined && method.toUpperCase() !== "GET"
          ? JSON.stringify(options.body)
          : undefined
      },
      { timeoutMs: this.timeoutMs, retries: this.retries }
    );

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`MoviePilot API ${response.status}: ${trimForError(text)}`);
    }

    const contentType = response.headers?.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(text) as JsonValue;
      } catch {
        return text;
      }
    }
    if (!text) {
      return null;
    }
    return text;
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

function resolveEndpoint(config: EndpointConfig | undefined, fallback: EndpointConfig): EndpointConfig {
  return {
    path: config?.path ?? fallback.path,
    method: (config?.method ?? fallback.method ?? "GET").toUpperCase()
  };
}

function applyPathParams(pathTemplate: string, params?: Record<string, string>): string {
  if (!params) {
    return pathTemplate;
  }
  return pathTemplate.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (!params[key]) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return encodeURIComponent(params[key]);
  });
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, JsonValue>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function withQueryParam(url: string, key: string, value: string): string {
  const next = new URL(url);
  next.searchParams.set(key, value);
  return next.toString();
}

function trimForError(text: string, max = 500): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned;
}

async function fetchWithRetry(
  url: string,
  options: Record<string, unknown>,
  config: { timeoutMs: number; retries: number }
): Promise<FetchResponse> {
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
      return response as FetchResponse;
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
  throw lastError ?? new Error("Unknown MoviePilot request error.");
}

function backoff(attempt: number): number {
  return Math.min(1000 * attempt, 3000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toToolResult(data: JsonValue): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [
      {
        type: "text",
        text
      }
    ],
    data
  };
}

export default async function register(api: PluginApi): Promise<void> {
  const logger = api.log ?? api.logger ?? console;
  const pluginConfig = resolvePluginConfig(api, PLUGIN_ID);
  const moviepilot = pluginConfig.services?.moviepilot;
  if (!moviepilot?.baseUrl) {
    logger.info?.("MoviePilot API not configured; skipping tool registration.");
    return;
  }

  const client = new MoviePilotClient({
    baseUrl: moviepilot.baseUrl,
    apiKey: moviepilot.apiKey,
    apiKeyMode: moviepilot.apiKeyMode,
    apiKeyHeader: moviepilot.apiKeyHeader,
    apiKeyQueryParam: moviepilot.apiKeyQueryParam,
    timeoutMs: moviepilot.timeoutMs,
    retries: moviepilot.retries
  });

  const endpoints = moviepilot.endpoints ?? {};
  const searchMedia = resolveEndpoint(endpoints.searchMedia, DEFAULT_ENDPOINTS.searchMedia);
  const searchTitle = resolveEndpoint(endpoints.searchTitle, DEFAULT_ENDPOINTS.searchTitle);
  const downloadsList = resolveEndpoint(endpoints.downloadsList, DEFAULT_ENDPOINTS.downloadsList);
  const downloadsAdd = resolveEndpoint(endpoints.downloadsAdd, DEFAULT_ENDPOINTS.downloadsAdd);
  const downloadsPause = resolveEndpoint(endpoints.downloadsPause, DEFAULT_ENDPOINTS.downloadsPause);
  const downloadsResume = resolveEndpoint(endpoints.downloadsResume, DEFAULT_ENDPOINTS.downloadsResume);
  const downloadsRemove = resolveEndpoint(endpoints.downloadsRemove, DEFAULT_ENDPOINTS.downloadsRemove);
  const subscriptionsList = resolveEndpoint(endpoints.subscriptionsList, DEFAULT_ENDPOINTS.subscriptionsList);
  const subscriptionsAdd = resolveEndpoint(endpoints.subscriptionsAdd, DEFAULT_ENDPOINTS.subscriptionsAdd);
  const subscriptionsRemove = resolveEndpoint(endpoints.subscriptionsRemove, DEFAULT_ENDPOINTS.subscriptionsRemove);

  api.registerTool(
    {
      name: "moviepilot.search",
      description: "Search media by exact media ID or by title keyword.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string", enum: ["media", "title"] },
          mediaId: { type: "string" },
          title: { type: "string" },
          query: { type: "object", additionalProperties: true }
        },
        required: ["mode"]
      },
      execute: async (_id, params) => {
        const mode = String(params.mode ?? "");
        if (mode === "media") {
          const mediaId = String(params.mediaId ?? "");
          if (!mediaId) {
            throw new Error("moviepilot.search (media) requires mediaId.");
          }
          const result = await client.request(searchMedia.method ?? "GET", searchMedia.path ?? "", {
            pathParams: { mediaId },
            query: params.query as Record<string, JsonValue> | undefined
          });
          return toToolResult(result);
        }
        if (mode === "title") {
          const title = String(params.title ?? "");
          if (!title) {
            throw new Error("moviepilot.search (title) requires title.");
          }
          const query: Record<string, JsonValue> = { ...(params.query as Record<string, JsonValue> | undefined) };
          if (!("title" in query)) {
            query.title = title;
          }
          const result = await client.request(searchTitle.method ?? "GET", searchTitle.path ?? "", {
            query
          });
          return toToolResult(result);
        }
        throw new Error("moviepilot.search requires mode=media or mode=title.");
      }
    }
  );

  api.registerTool(
    {
      name: "moviepilot.subscriptions.list",
      description: "List subscriptions.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "object", additionalProperties: true }
        }
      },
      execute: async (_id, params) => {
        const result = await client.request(subscriptionsList.method ?? "GET", subscriptionsList.path ?? "", {
          query: params.query as Record<string, JsonValue> | undefined
        });
        return toToolResult(result);
      }
    }
  );

  api.registerTool(
    {
      name: "moviepilot.downloads.list",
      description: "List download tasks.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "object", additionalProperties: true }
        }
      },
      execute: async (_id, params) => {
        const result = await client.request(downloadsList.method ?? "GET", downloadsList.path ?? "", {
          query: params.query as Record<string, JsonValue> | undefined
        });
        return toToolResult(result);
      }
    }
  );

  api.registerTool(
    {
      name: "moviepilot.subscriptions.add",
      description: "Add a subscription.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          body: { type: "object", additionalProperties: true },
          query: { type: "object", additionalProperties: true }
        }
      },
      execute: async (_id, params) => {
        const result = await client.request(subscriptionsAdd.method ?? "POST", subscriptionsAdd.path ?? "", {
          body: params.body as JsonValue,
          query: params.query as Record<string, JsonValue> | undefined
        });
        return toToolResult(result);
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "moviepilot.downloads.add",
      description: "Add a download task.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          body: { type: "object", additionalProperties: true },
          query: { type: "object", additionalProperties: true }
        }
      },
      execute: async (_id, params) => {
        const result = await client.request(downloadsAdd.method ?? "POST", downloadsAdd.path ?? "", {
          body: params.body as JsonValue,
          query: params.query as Record<string, JsonValue> | undefined
        });
        return toToolResult(result);
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "moviepilot.downloads.pause",
      description: "Pause a download task by hash.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          hash: { type: "string" },
          query: { type: "object", additionalProperties: true }
        },
        required: ["hash"]
      },
      execute: async (_id, params) => {
        const hash = String(params.hash ?? "");
        if (!hash) {
          throw new Error("moviepilot.downloads.pause requires hash.");
        }
        const result = await client.request(downloadsPause.method ?? "GET", downloadsPause.path ?? "", {
          pathParams: { hash },
          query: params.query as Record<string, JsonValue> | undefined
        });
        return toToolResult(result);
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "moviepilot.downloads.resume",
      description: "Resume a download task by hash.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          hash: { type: "string" },
          query: { type: "object", additionalProperties: true }
        },
        required: ["hash"]
      },
      execute: async (_id, params) => {
        const hash = String(params.hash ?? "");
        if (!hash) {
          throw new Error("moviepilot.downloads.resume requires hash.");
        }
        const result = await client.request(downloadsResume.method ?? "GET", downloadsResume.path ?? "", {
          pathParams: { hash },
          query: params.query as Record<string, JsonValue> | undefined
        });
        return toToolResult(result);
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "moviepilot.downloads.remove",
      description: "Remove a download task by hash.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          hash: { type: "string" },
          query: { type: "object", additionalProperties: true }
        },
        required: ["hash"]
      },
      execute: async (_id, params) => {
        const hash = String(params.hash ?? "");
        if (!hash) {
          throw new Error("moviepilot.downloads.remove requires hash.");
        }
        const result = await client.request(downloadsRemove.method ?? "DELETE", downloadsRemove.path ?? "", {
          pathParams: { hash },
          query: params.query as Record<string, JsonValue> | undefined
        });
        return toToolResult(result);
      }
    },
    { optional: true }
  );

  api.registerTool(
    {
      name: "moviepilot.subscriptions.remove",
      description: "Remove a subscription by id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          query: { type: "object", additionalProperties: true }
        },
        required: ["id"]
      },
      execute: async (_id, params) => {
        const id = String(params.id ?? "");
        if (!id) {
          throw new Error("moviepilot.subscriptions.remove requires id.");
        }
        const result = await client.request(subscriptionsRemove.method ?? "DELETE", subscriptionsRemove.path ?? "", {
          pathParams: { id },
          query: params.query as Record<string, JsonValue> | undefined
        });
        return toToolResult(result);
      }
    },
    { optional: true }
  );

  if (moviepilot.debug) {
    logger.info?.("MoviePilot REST tools registered.");
  }
}
