import { useState } from 'react';
import { History as HistoryIcon, Settings as SettingsIcon } from 'lucide-react';
import { Lockup } from '../../components/brand/Logo';
import { ToastProvider } from '../../components/Toast';
import { cx, IconButton } from '../../components/ui';
import { useActivePage } from '../../hooks/useActivePage';
import { useBackendHealth } from '../../hooks/useBackendHealth';
import { useCollections } from '../../hooks/useLibrary';
import { useSettings } from '../../hooks/useSettings';
import { DEFAULT_LIMITS } from '../../shared/constants';
import { CollectionView } from './CollectionView';
import { ExploreView } from './ExploreView';
import { SettingsView } from './SettingsView';

type View = 'explore' | 'saved' | 'history' | 'settings';

export function App() {
  const { settings, loaded, update } = useSettings();
  const health = useBackendHealth(settings.backendUrl, loaded);
  const collections = useCollections();
  const { state: page, refresh } = useActivePage();
  const [view, setView] = useState<View>('explore');
  const [openRecord, setOpenRecord] = useState<{ saved: string | null; history: string | null }>({ saved: null, history: null });
  const limits = health.state.status === 'online' ? health.state.health.limits : DEFAULT_LIMITS;

  const go = (next: View) => {
    // Choosing the current list again returns from an opened analysis to the list.
    if ((next === 'saved' || next === 'history') && view === next) setOpenRecord((o) => ({ ...o, [next]: null }));
    setView(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <ToastProvider>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-line bg-paper/92 px-4 backdrop-blur-sm">
        <button type="button" onClick={() => go('explore')} aria-label="ArticleDNA, explore the current page" className="-ml-1 rounded-[6px] p-1">
          <Lockup height={26} />
        </button>
        <nav className="flex items-center gap-1" aria-label="Main">
          <div className="flex rounded-full bg-cream p-[3px]">
            {(
              [
                ['explore', 'Explore'],
                ['saved', 'Saved'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={view === id ? 'page' : undefined}
                className={cx(
                  'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-small font-semibold transition-colors duration-150',
                  view === id ? 'bg-sheet text-ink shadow-[0_1px_2px_rgb(9_13_26/0.12)]' : 'text-ink-2 hover:text-ink',
                )}
              >
                {label}
                {id === 'saved' && collections.saved.length > 0 && (
                  <span className="tabular text-meta text-ink-3">{collections.saved.length}</span>
                )}
              </button>
            ))}
          </div>
          <IconButton label="History" active={view === 'history'} onClick={() => go('history')}>
            <HistoryIcon size={16} />
          </IconButton>
          <IconButton label="Settings" active={view === 'settings'} onClick={() => go('settings')} className="-mr-1">
            <SettingsIcon size={16} />
          </IconButton>
        </nav>
      </header>

      <main>
        {/* Explore stays mounted so a running analysis survives a visit to another view. */}
        <div hidden={view !== 'explore'}>
          <ExploreView
            page={page}
            refresh={refresh}
            settings={settings}
            health={health.state}
            recheckHealth={health.recheck}
            collections={collections}
            onOpenSettings={() => go('settings')}
          />
        </div>
        {(view === 'saved' || view === 'history') && (
          <CollectionView
            key={view}
            kind={view}
            collections={collections}
            page={page}
            settings={settings}
            maxChars={limits.max_content_chars}
            openId={openRecord[view]}
            onOpen={(id) => {
              setOpenRecord((o) => ({ ...o, [view]: id }));
              window.scrollTo({ top: 0 });
            }}
            onGoToExplore={() => go('explore')}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            settings={settings}
            update={update}
            health={health.state}
            recheck={health.recheck}
            counts={{ saved: collections.saved.length, history: collections.history.length }}
          />
        )}
      </main>
    </ToastProvider>
  );
}
