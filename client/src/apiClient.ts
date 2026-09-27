import { API_URL } from './api'

/**
 * The one way the client talks to the API (Lab 3 api-spec.md §1.1, AD-12).
 *
 * Every request carries the session cookie (`credentials: 'include'`), which
 * is what identifies the caller now that the `X-Requester-Id` header is gone.
 * Routing every call through here means a screen cannot forget the flag and
 * silently become anonymous.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, { ...init, credentials: 'include' })
}

/** JSON convenience for the common case; the body is serialised and typed. */
export function apiJson(path: string, method: string, body?: unknown, init: RequestInit = {}): Promise<Response> {
  return apiFetch(path, {
    ...init,
    method,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** The error envelope every non-2xx response uses (api-spec.md §1.2). */
export interface ApiError {
  code: string
  message: string
  fields?: Record<string, string>
  correlationId?: string
}

/** Reads the error envelope off a failed response, tolerating a non-JSON body. */
export async function readApiError(res: Response): Promise<ApiError | null> {
  try {
    const body = (await res.json()) as { error?: ApiError }
    return body?.error ?? null
  } catch {
    return null
  }
}
