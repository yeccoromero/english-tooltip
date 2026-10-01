import { getConfig } from "./config";

export interface AuthState {
  access_token: string;
  refresh_token: string;
  /** Unix seconds. */
  expires_at: number;
  user_id: string;
  email?: string;
}

export class AuthExpired extends Error {}

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** PKCE: random verifier and its SHA-256 challenge. */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

export function authorizeUrl(base: string, redirectTo: string, challenge: string): string {
  const q = new URLSearchParams({ provider: "google", redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: "s256" });
  return `${base}/auth/v1/authorize?${q}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id: string; email?: string };
}

function toState(t: TokenResponse): AuthState {
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: t.expires_at ?? Math.floor(Date.now() / 1000) + (t.expires_in ?? 3600),
    user_id: t.user?.id ?? "",
    email: t.user?.email,
  };
}

/** Google sign-in in a browser popup; the extension gets its own session (it never shares the web app's tokens). */
export async function signInWithGoogle(): Promise<AuthState> {
  const { url, key } = await getConfig();
  const redirectTo = chrome.identity.getRedirectURL();
  const { verifier, challenge } = await pkcePair();
  const result = await chrome.identity.launchWebAuthFlow({ url: authorizeUrl(url, redirectTo, challenge), interactive: true });
  if (!result) throw new Error("Inicio de sesión cancelado.");
  const params = new URL(result).searchParams;
  const code = params.get("code");
  if (!code) throw new Error(params.get("error_description") ?? "Google no devolvió un código de acceso.");

  const res = await fetch(`${url}/auth/v1/token?grant_type=pkce`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  if (!res.ok) throw new Error(`No se pudo completar el acceso (HTTP ${res.status}).`);
  const state = toState((await res.json()) as TokenResponse);
  await chrome.storage.local.set({ auth: state });
  return state;
}

async function refresh(a: AuthState): Promise<AuthState> {
  const { url, key } = await getConfig();
  const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: a.refresh_token }),
  }).catch(() => {
    throw new Error("Sin conexión con el servidor.");
  });
  if (res.status === 400 || res.status === 401) {
    await chrome.storage.local.remove("auth");
    throw new AuthExpired("La sesión caducó. Vuelve a conectar tu cuenta.");
  }
  if (!res.ok) throw new Error(`No se pudo renovar la sesión (HTTP ${res.status}).`);
  const state = toState((await res.json()) as TokenResponse);
  const merged = { ...state, user_id: state.user_id || a.user_id, email: state.email ?? a.email };
  await chrome.storage.local.set({ auth: merged });
  return merged;
}

/** The stored session (renewed if it is about to expire), or null when not connected. */
export async function getValidSession(): Promise<AuthState | null> {
  const { auth } = (await chrome.storage.local.get("auth")) as { auth?: AuthState };
  if (!auth) return null;
  if (auth.expires_at * 1000 - 60_000 > Date.now()) return auth;
  return refresh(auth);
}
