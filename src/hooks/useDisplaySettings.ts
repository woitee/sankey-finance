import { useCallback, useSyncExternalStore } from 'react';

// Client-side display preferences, persisted in localStorage and shared
// between Settings and the dashboard so toggles apply without a reload.

export type DisplaySettings = {
  showStartingState: boolean;
  showEndingState: boolean;
};

const STORAGE_KEY = 'sankey-finance:display-settings';

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showStartingState: true,
  showEndingState: true,
};

const listeners = new Set<() => void>();
let cached: DisplaySettings | null = null;

function read(): DisplaySettings {
  if (cached) return cached;
  let stored: Partial<DisplaySettings> = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    // Corrupt or unavailable storage — fall back to defaults
  }
  cached = {
    showStartingState: typeof stored.showStartingState === 'boolean' ? stored.showStartingState : DEFAULT_DISPLAY_SETTINGS.showStartingState,
    showEndingState: typeof stored.showEndingState === 'boolean' ? stored.showEndingState : DEFAULT_DISPLAY_SETTINGS.showEndingState,
  };
  return cached;
}

function write(next: DisplaySettings) {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — keep the in-memory value for this session
  }
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Sync changes made in other tabs
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cached = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useDisplaySettings() {
  const settings = useSyncExternalStore(subscribe, read, () => DEFAULT_DISPLAY_SETTINGS);
  const update = useCallback((patch: Partial<DisplaySettings>) => {
    write({ ...read(), ...patch });
  }, []);
  return [settings, update] as const;
}
