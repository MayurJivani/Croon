// Fetch wrapper: JSON in and out, the CSRF double-submit header on every write, errors as messages.
let csrf: string | null = null;

async function token() {
  if (!csrf) csrf = (await (await fetch('/api/csrf-token', { credentials: 'same-origin' })).json()).csrfToken;
  return csrf!;
}
export const setCsrf = (t: string) => (csrf = t);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; retry?: boolean } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-csrf-token'] = await token();
  const r = await fetch(`/api${path}`, { method, headers, credentials: 'same-origin', body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const j = await r.json().catch(() => ({}));
  if (j.csrfToken) csrf = j.csrfToken;
  if (r.status === 403 && method !== 'GET' && opts.retry !== false) {
    // The session rotated under us (another tab signed in or out): refresh the token once.
    csrf = null;
    return api(path, { ...opts, retry: false });
  }
  if (!r.ok) throw new ApiError(r.status, j.error ?? 'Something went wrong.');
  return j as T;
}
