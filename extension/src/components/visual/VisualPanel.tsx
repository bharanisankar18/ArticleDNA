import { useState } from 'react';
import { Network, RefreshCw, Workflow } from 'lucide-react';
import { LocatorContext, type Locator } from '../../hooks/useLocate';
import type { Visualization } from '../../shared/types';
import { cx, IconButton } from '../ui';
import { KnowledgeGraph } from './KnowledgeGraph';
import { WorkflowDiagram } from './Workflow';

export function VisualPanel({ visual, locator, onRedraw }: { visual: Visualization; locator: Locator; onRedraw?: () => void }) {
  const [view, setView] = useState<'workflow' | 'graph'>('workflow');
  const tabs = [
    { id: 'workflow' as const, label: 'Workflow', icon: Workflow },
    { id: 'graph' as const, label: 'Knowledge graph', icon: Network },
  ];
  return (
    <LocatorContext.Provider value={locator}>
      <div className="fade-in px-4 pt-3 pb-8">
        <div className="mb-3.5 flex items-center gap-2">
          <div className="flex flex-1 gap-1 border-b border-line" role="tablist">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cx(
                  '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 px-2 text-small font-semibold transition-colors',
                  view === id ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink',
                )}
              >
                <Icon size={15} aria-hidden />
                {label}
              </button>
            ))}
          </div>
          {onRedraw && (
            <IconButton label="Draw again" onClick={onRedraw}>
              <RefreshCw size={15} />
            </IconButton>
          )}
        </div>
        {view === 'workflow' ? <WorkflowDiagram steps={visual.workflow} /> : <KnowledgeGraph visual={visual} />}
      </div>
    </LocatorContext.Provider>
  );
}
