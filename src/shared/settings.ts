export type Provider = "auto" | "chrome" | "mymemory" | "google" | "deepl";

export interface Settings {
  enabled: boolean;
  provider: Provider;
  googleKey: string;
  deeplKey: string;
  anthropicKey: string;
  disabledHosts: string[];
  maxChars: number;
  hover: boolean;
  hoverDelay: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  provider: "auto",
  googleKey: "",
  deeplKey: "",
  anthropicKey: "",
  disabledHosts: [],
  maxChars: 500,
  hover: true,
  hoverDelay: 700,
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(patch);
}
