import type { AuthUser, SyncPayload, SyncResponse } from './types';

const apiBase = import.meta.env.VITE_API_URL || '/v1';
let accessToken: string | null = null;

export function signedIn(): boolean {
  return Boolean(accessToken);
}

export function currentAccessToken(): string | null {
  return accessToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: { message: 'Unable to reach your backup.' } }));
    throw new Error(body.error?.message ?? 'Unable to reach your backup.');
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export async function googleSignIn(idToken: string): Promise<{ accessToken: string; user: AuthUser }> {
  const response = await request<{ accessToken: string; user: AuthUser }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken })
  });
  accessToken = response.accessToken;
  return response;
}

export async function restoreSession(): Promise<AuthUser | null> {
  try {
    const response = await request<{ accessToken: string; user: AuthUser }>('/auth/refresh', { method: 'POST', body: '{}' });
    accessToken = response.accessToken;
    return response.user;
  } catch {
    accessToken = null;
    return null;
  }
}

export async function signOut(): Promise<void> {
  await request<void>('/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
  accessToken = null;
}

export function syncCloud(payload: SyncPayload): Promise<SyncResponse> {
  return request<SyncResponse>('/sync', { method: 'POST', body: JSON.stringify(payload) });
}
