/** In-memory store for VPN configs issued after payment. */

interface ConfigEntry {
  config: string;
  createdAt: number;
}

const configs = new Map<number | string, ConfigEntry>();

const TTL_MS = 30 * 60 * 1000; // 30 min

export function saveConfig(userId: number | string, config: string): void {
  configs.set(userId, { config, createdAt: Date.now() });
}

export function getConfig(userId: number | string): string | null {
  const entry = configs.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    configs.delete(userId);
    return null;
  }
  return entry.config;
}
