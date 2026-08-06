import type { Lead, LeadDraft, LeadStatus } from '@/context/LeadsContext';

/**
 * Requests go to `/api/*` on this app's own origin. `next.config.ts` rewrites
 * that to the FastAPI server, so there is no API host in the client bundle and
 * no CORS preflight in the browser.
 */
const BASE = '/api';

/** A response the server did answer, but with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * FastAPI reports failures as `{ detail: ... }` — a string for our own
 * `HTTPException`s, and an array of per-field objects for validation errors.
 * Both are flattened to one line so a caller can put it straight in the banner.
 */
function extractDetail(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  const detail = (body as { detail?: unknown }).detail;

  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item !== 'object' || item === null) return null;
        const { loc, msg } = item as { loc?: unknown; msg?: unknown };
        if (typeof msg !== 'string') return null;
        // loc is like ["body", "company"] — the field name is the useful part.
        const field = Array.isArray(loc) ? loc[loc.length - 1] : undefined;
        return typeof field === 'string' ? `${field}: ${msg}` : msg;
      })
      .filter((message): message is string => message !== null);

    if (messages.length > 0) return messages.join('; ');
  }

  return fallback;
}

const UNREACHABLE =
  'Could not reach the API. Is the backend running on port 8000?';

/**
 * The dev server's rewrite answers with a plain-text 500 when nothing is
 * listening on the backend port — so `fetch` resolves, and the failure looks
 * like a server error rather than an unreachable one. A 5xx carrying no JSON
 * detail is that case in practice, and saying so beats "Request failed (500)"
 * for the most common thing to go wrong here.
 */
function isUnreachable(status: number, body: unknown): boolean {
  return status >= 500 && body === null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    // fetch only rejects when the request never got an answer — offline, or the
    // page was served without the proxy in front of it.
    throw new ApiError(UNREACHABLE, 0);
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not every error response carries JSON — see `isUnreachable`.
    }

    const fallback = isUnreachable(response.status, body)
      ? UNREACHABLE
      : `Request failed (${response.status}).`;

    throw new ApiError(extractDetail(body, fallback), response.status);
  }

  // 204 has no body, and calling .json() on it throws.
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/** The patch shape the CRM's edit modal sends. Every field is optional. */
export type LeadPatch = Partial<LeadDraft> & { status?: LeadStatus };

export const leadsApi = {
  list: () => request<Lead[]>('/leads'),

  create: (draft: LeadDraft) =>
    request<Lead>('/leads', { method: 'POST', body: JSON.stringify(draft) }),

  update: (id: string, patch: LeadPatch) =>
    request<Lead>(`/leads/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  advance: (id: string) =>
    request<Lead>(`/leads/${encodeURIComponent(id)}/advance`, {
      method: 'POST',
    }),

  remove: (id: string) =>
    request<void>(`/leads/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
