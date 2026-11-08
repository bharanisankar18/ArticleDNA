import { useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, KeyRound, Unplug } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { Button, Spinner, Toggle } from '../../components/ui';
import type { HealthState } from '../../hooks/useBackendHealth';
import { hasAllSitesAccess, removeAllSitesAccess, requestAllSitesAccess } from '../../services/pageBridge';
import { clearCollection, type Collection } from '../../services/storage';
import { DEFAULT_BACKEND_URL } from '../../shared/constants';
import type { Settings } from '../../shared/types';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-sheet p-3.5 shadow-card">
      <h2 className="text-heading font-semibold text-ink">{title}</h2>
      <div className="mt-2.5 space-y-3">{children}</div>
    </section>
  );
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
  } catch {
    return false;
  }
}

export function SettingsView({
  settings,
  update,
  health,
  recheck,
  counts,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  health: HealthState;
  recheck: () => Promise<boolean>;
  counts: { saved: number; history: number };
}) {
  const toast = useToast();
  const [url, setUrl] = useState(settings.backendUrl);
  const [checking, setChecking] = useState(false);
  const [allSites, setAllSites] = useState(false);
  const [confirmClear, setConfirmClear] = useState<Collection | null>(null);

  useEffect(() => setUrl(settings.backendUrl), [settings.backendUrl]);
  useEffect(() => {
    hasAllSitesAccess().then(setAllSites);
  }, []);

  const dirty = url.trim().replace(/\/+$/, '') !== settings.backendUrl;
  const urlOk = validUrl(url.trim());

  return (
    <div className="space-y-3 px-3 pt-4 pb-8">
      <h1 className="px-1 text-display font-bold tracking-[-0.018em] text-ink">Settings</h1>

      <Section title="ArticleDNA server">
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!urlOk) return;
            await update({ backendUrl: url.trim().replace(/\/+$/, '') });
            toast.show('Server address saved');
          }}
        >
          <label htmlFor="backend-url" className="text-small font-semibold text-ink-2">
            Server address
          </label>
          <div className="flex gap-2">
            <input
              id="backend-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
              aria-invalid={!urlOk}
              className="h-9 min-w-0 flex-1 rounded-[9px] border border-line-strong bg-white/60 px-3 text-body text-ink outline-none focus:border-indigo aria-[invalid=true]:border-bad"
            />
            <Button type="submit" size="sm" variant="primary" disabled={!dirty || !urlOk} className="h-9">
              Save
            </Button>
          </div>
          {!urlOk && <p className="text-meta text-bad">Enter a full address, like {DEFAULT_BACKEND_URL}</p>}
        </form>
        <div className="flex items-start justify-between gap-3 rounded-[10px] bg-cream/70 px-3 py-2.5">
          <HealthLine health={health} />
          <Button
            size="sm"
            variant="ghost"
            className="-my-1 shrink-0"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await recheck();
              setChecking(false);
            }}
          >
            {checking ? <Spinner className="h-3.5 w-3.5" /> : 'Check'}
          </Button>
        </div>
        <p className="text-meta text-ink-3">
          Start the server from the backend folder with <code className="rounded bg-cream px-1 py-0.5 text-[11px] whitespace-nowrap">uvicorn main:app --port 8000</code>.
          Your Gemini API key stays on the server and is never stored in the extension.
        </p>
      </Section>

      <Section title="History">
        <Toggle
          label="Keep a history of analyses"
          description="Every article you analyze is listed in History, so you can reopen it. Saved analyses are kept either way."
          checked={settings.keepHistory}
          onChange={(keepHistory) => update({ keepHistory })}
        />
      </Section>

      <Section title="Site access">
        <Toggle
          label="Read pages without clicking the icon"
          description="Lets the panel follow you between tabs. Chrome asks you to confirm. Pages are read in your browser; nothing is sent until you choose Analyze or Visualize."
          checked={allSites}
          onChange={async (next) => {
            const ok = next ? await requestAllSitesAccess() : await removeAllSitesAccess();
            if (ok) setAllSites(next);
          }}
        />
      </Section>

      <Section title="Privacy">
        <ul className="space-y-1.5 text-small text-ink-2">
          <li>Pages are read only in this browser. Article text is sent to your server, and from there to Google Gemini, only when you choose Analyze or Visualize.</li>
          <li>History and saved analyses stay in this browser's local storage. Nothing is synced or collected.</li>
          <li>Gemini's terms apply to text you analyze. Avoid analyzing pages that contain private information.</li>
        </ul>
      </Section>

      <Section title="Data">
        {(['history', 'saved'] as const).map((kind) => (
          <div key={kind} className="flex items-center justify-between gap-3">
            <p className="text-small text-ink-2">
              <span className="tabular font-semibold text-ink">{counts[kind]}</span> {kind === 'history' ? 'in history' : 'saved'}
            </p>
            {confirmClear === kind ? (
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setConfirmClear(null)}>
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await clearCollection(kind);
                    setConfirmClear(null);
                    toast.show(kind === 'history' ? 'History cleared' : 'Saved analyses deleted');
                  }}
                >
                  {kind === 'history' ? 'Clear history' : 'Delete saved'}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="danger" disabled={counts[kind] === 0} onClick={() => setConfirmClear(kind)}>
                {kind === 'history' ? 'Clear history' : 'Delete all saved'}
              </Button>
            )}
          </div>
        ))}
      </Section>

      <p className="px-1 text-meta text-ink-3">ArticleDNA {chrome.runtime.getManifest().version}</p>
    </div>
  );
}

function HealthLine({ health }: { health: HealthState }) {
  if (health.status === 'checking') return <p className="text-small text-ink-3">Checking the connection…</p>;
  if (health.status === 'offline') {
    return (
      <p className="flex gap-2 text-small text-bad">
        <Unplug size={14} className="mt-[3px] shrink-0" aria-hidden />
        Not reachable. Is the server running?
      </p>
    );
  }
  if (!health.health.gemini_configured) {
    return (
      <p className="flex gap-2 text-small text-warn">
        <KeyRound size={14} className="mt-[3px] shrink-0" aria-hidden />
        Connected, but GEMINI_API_KEY isn't set on the server.
      </p>
    );
  }
  const providers = health.health.providers ?? [];
  return (
    <div className="min-w-0 text-small text-ink-2">
      <p className="flex gap-2">
        <CircleCheck size={14} className="mt-[3px] shrink-0 text-ok" aria-hidden />
        <span>Connected. Server {health.health.version}.</span>
      </p>
      {providers.length > 0 && (
        <ol className="mt-1.5 space-y-0.5 pl-[22px]">
          {providers.map((p, i) => (
            <li key={p.name} className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="tabular text-ink-3">{i + 1}.</span>
              <span className="font-semibold text-ink">{p.label}</span>
              <span className="min-w-0 truncate text-meta text-ink-3">{p.model.replace(/ via .*$/, '')}</span>
              {p.status === 'cooling_down' && <span className="text-meta text-warn">at its limit</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
