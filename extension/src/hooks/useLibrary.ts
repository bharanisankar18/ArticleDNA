import { useEffect, useState } from 'react';
import { getCollection, onCollectionsChanged } from '../services/storage';
import type { CollectionEntry } from '../shared/types';

/** The History and Saved lists, kept in sync with storage. */
export function useCollections() {
  const [history, setHistory] = useState<CollectionEntry[]>([]);
  const [saved, setSaved] = useState<CollectionEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Promise.all([getCollection('history'), getCollection('saved')]).then(([h, s]) => {
        if (alive) {
          setHistory(h);
          setSaved(s);
          setLoaded(true);
        }
      });
    load();
    const off = onCollectionsChanged(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return { history, saved, loaded };
}

export type Collections = ReturnType<typeof useCollections>;
