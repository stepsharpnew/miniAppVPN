import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "vpn_paid_config";

let memoryCache: string | null = null;

function getSnapshot(): string | null {
  if (memoryCache !== null) return memoryCache;
  try {
    memoryCache = localStorage.getItem(STORAGE_KEY);
  } catch {
    memoryCache = null;
  }
  return memoryCache;
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  listeners.forEach((cb) => cb());
}

export function saveVpnConfig(config: string) {
  memoryCache = config;
  try {
    localStorage.setItem(STORAGE_KEY, config);
  } catch { /* quota exceeded */ }
  notify();
}

export function useVpnConfig() {
  const config = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const save = useCallback((c: string) => saveVpnConfig(c), []);

  return { config, save, hasConfig: config !== null && config.length > 0 };
}
