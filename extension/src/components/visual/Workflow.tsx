import { useLocate } from '../../hooks/useLocate';
import { STEP_LABEL } from '../../services/format';
import type { Visualization } from '../../shared/types';
import { LocateButton, LocateStatus } from '../dashboard/Locate';
import { STEP_COLOR } from './palette';

type Step = Visualization['workflow'][number];

function WorkflowStep({ step, index, last }: { step: Step; index: number; last: boolean }) {
  const locate = useLocate(step.excerpt);
  const color = STEP_COLOR[step.kind];
  return (
    <li className="workflow-step flex gap-3" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="flex flex-col items-center">
        <span
          className="tabular grid h-7 w-7 shrink-0 place-items-center rounded-full text-meta font-bold text-white shadow-[0_0_0_4px_var(--color-paper)]"
          style={{ background: color }}
        >
          {index + 1}
        </span>
        {!last && <span aria-hidden className="my-1 w-[2px] flex-1 rounded-full bg-line-strong" />}
      </div>
      <div className="mb-3 min-w-0 flex-1 rounded-[12px] border border-line bg-sheet px-3 py-2.5 shadow-card">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-meta font-semibold" style={{ color }}>
              {STEP_LABEL[step.kind]}
            </p>
            <p className="text-body font-semibold text-ink">{step.title}</p>
            <p className="mt-0.5 text-small text-ink-2">{step.detail}</p>
            <LocateStatus locate={locate} />
          </div>
          {step.excerpt && <LocateButton locate={locate} />}
        </div>
      </div>
    </li>
  );
}

export function WorkflowDiagram({ steps }: { steps: Step[] }) {
  if (!steps.length) return <p className="py-6 text-center text-small text-ink-3">No workflow could be drawn from this article.</p>;
  return (
    <ol aria-label="Workflow">
      {steps.map((step, i) => (
        <WorkflowStep key={i} step={step} index={i} last={i === steps.length - 1} />
      ))}
    </ol>
  );
}
