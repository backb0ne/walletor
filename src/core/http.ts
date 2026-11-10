export class HttpError extends Error {
  readonly statusCode: number;
  readonly endpoint: string;
  readonly body?: string;

  constructor(statusCode: number, endpoint: string, message?: string, body?: string) {
    super(message ?? `HTTP ${statusCode} from ${endpoint}`);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.body = body;
  }
}

export interface FetchJsonRetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 15_000;
const BASE_BACKOFF_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const trimmed = headerValue.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), MAX_RETRY_AFTER_MS);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return Math.max(0, Math.min(delta, MAX_RETRY_AFTER_MS));
  }
  return null;
}

function computeBackoffMs(attempt: number): number {
  const exponential = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 150);
  return Math.min(exponential + jitter, MAX_RETRY_AFTER_MS);
}

function isRetriableStatus(statusCode: number): boolean {
  return statusCode === 401 || statusCode === 403 || statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function mergeHeaders(
  initHeaders?: HeadersInit,
  extraHeaders?: Record<string, string>,
): Headers {
  const headers = new Headers(initHeaders);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }
  return headers;
}

export async function fetchJsonWithRetry<T>(
  endpoints: string | string[],
  init?: RequestInit,
  options?: FetchJsonRetryOptions,
): Promise<T> {
  const endpointList = (Array.isArray(endpoints) ? endpoints : [endpoints]).filter(Boolean);
  if (endpointList.length === 0) {
    throw new Error('fetchJsonWithRetry requires at least one endpoint');
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const totalAttempts = Math.max(endpointList.length, maxRetries + 1);
  const headers = mergeHeaders(init?.headers, options?.headers);

  let lastError: unknown;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const endpoint = endpointList[attempt % endpointList.length];
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`Request timeout after ${timeoutMs}ms (${endpoint})`));
    }, timeoutMs);

    const signal = init?.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;

    try {
      const response = await fetch(endpoint, {
        ...init,
        headers,
        signal,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        const httpErr = new HttpError(
          response.status,
          endpoint,
          `HTTP ${response.status} from ${endpoint}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`,
          bodyText,
        );

        if (!isRetriableStatus(response.status) || attempt >= totalAttempts - 1) {
          throw httpErr;
        }

        lastError = httpErr;
        const retryAfterMs =
          response.status === 429 ? parseRetryAfterMs(response.headers.get('retry-after')) : null;
        const delayMs =
          retryAfterMs !== null
            ? Math.max(retryAfterMs, computeBackoffMs(attempt))
            : computeBackoffMs(attempt);

        await sleep(delayMs);
        continue;
      }

      const data = (await response.json()) as T;
      return data;
    } catch (err) {
      if (err instanceof HttpError && !isRetriableStatus(err.statusCode)) {
        throw err;
      }

      if (init?.signal?.aborted) {
        throw err;
      }

      lastError = err;
      if (attempt >= totalAttempts - 1) {
        break;
      }

      await sleep(computeBackoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(`All endpoints failed: ${String(lastError)}`);
}

interface JsonRpcResponse<T> {
  jsonrpc?: string;
  id?: unknown;
  result?: T;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

export async function postJsonRpc<T>(
  endpoints: string | string[],
  method: string,
  params: unknown,
  headers?: Record<string, string>,
  timeoutMs?: number,
): Promise<T> {
  const payload = await fetchJsonWithRetry<JsonRpcResponse<T>>(
    endpoints,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
    },
    { timeoutMs },
  );

  if (payload.error) {
    throw new Error(
      `JSON-RPC error (${payload.error.code ?? 'unknown'}): ${payload.error.message ?? 'Unknown RPC error'}`,
    );
  }

  if (payload.result === undefined) {
    throw new Error(`JSON-RPC method ${method} returned empty result`);
  }

  return payload.result;
}
