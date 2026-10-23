import type { RunStep } from '../../shared/types';
import { Check } from './icons';

const STEPS: Array<{ id: RunStep; label: string }> = [
  { id: 'LOADING_CHAT', label: 'Loading chat' },
  { id: 'CAPTURING', label: 'Capturing' },
  { id: 'RESCUING_ASSETS', label: 'Saving images' },
  { id: 'UPLOADING', label: 'Uploading' },
];

/** Only rendered while a run is in progress. ✓ done, filled dot current, hollow dot pending. */
export function StepList({ step }: { step: RunStep }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="steps" aria-label="Progress">
      {STEPS.map((s, i) => {
        const status = i < current ? 'done' : i === current ? 'active' : 'todo';
        return (
          <li key={s.id} className={`step ${status}`} aria-current={status === 'active' ? 'step' : undefined}>
            <span className="step-mark">{status === 'done' ? <Check width={12} height={12} strokeWidth={3} /> : null}</span>
            <span>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
