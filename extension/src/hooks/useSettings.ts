import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged, saveSettings } from '../services/storage';
import type { Settings } from '../shared/types';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    getSettings().then((s) => {
      if (alive) {
        setSettings(s);
        setLoaded(true);
      }
    });
    const off = onSettingsChanged(setSettings);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await saveSettings(patch));
  }, []);

  return { settings, loaded, update };
}
