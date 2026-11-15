/**
 * Thin client for the FoodCycle API (same origin: Vite proxies /api in development).
 * Every error becomes an ApiError carrying the server's `code`, which errorMessage() turns into Arabic.
 */

const TOKEN_KEY = 'fc-token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: Record<string, unknown>;
  constructor(status: number, code: string, body: Record<string, unknown>) {
    super(code);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** Called when the server says the session is no longer valid */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query) {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${withQuery(path, query)}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new ApiError(0, 'NETWORK', {});
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const code =
      (data && typeof data.code === 'string' && data.code) ||
      (res.status === 400 ? 'VALIDATION' : res.status >= 500 ? 'SERVER' : `HTTP_${res.status}`);
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, code, data ?? {});
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
