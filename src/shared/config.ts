// Public values (protected by Row Level Security on the server; no secret key is used here).
export const SUPABASE_URL = "https://jnhjrpsxpowglagraylx.supabase.co";
export const SUPABASE_KEY = "sb_publishable_Y-nO7H1tweLVwupRQoCMLQ_LnbiKmZB";
export const APP_URL = "https://english-tooltip-app.vercel.app";

/** Supabase endpoint + key. `devSupabase` in chrome.storage.local overrides them (used by the e2e test). */
export async function getConfig(): Promise<{ url: string; key: string }> {
  const { devSupabase } = (await chrome.storage.local.get("devSupabase")) as { devSupabase?: { url: string; key: string } };
  return { url: devSupabase?.url ?? SUPABASE_URL, key: devSupabase?.key ?? SUPABASE_KEY };
}
