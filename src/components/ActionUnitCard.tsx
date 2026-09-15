import type { ActionUnitAssessment } from '@/lib/contract';
import { isLowerReliability, scoreLabel } from '@/lib/ui';

/** Colour the score chip by severity; "not assessable" is neutral, not an error. */
function chipClasses(score: 0 | 1 | 2 | null): string {
  switch (score) {
    case 0:
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 1:
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300';
    case 2:
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
    default:
      return 'bg-black/5 text-faint dark:bg-white/10';
  }
}

export default function ActionUnitCard({
  au,
  samples,
  className = '',
}: {
  au: ActionUnitAssessment;
  samples: number;
  /** Lets the grid stretch the odd last card across both columns. */
  className?: string;
}) {
  const lowerReliability = isLowerReliability(au.id);
  const notAssessable = au.score === null;

  return (
    <div
      className={`rounded-xl border p-4 ${
        lowerReliability ? 'border-line bg-surface-2/60' : 'border-line bg-card'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{au.label}</h3>
          {lowerReliability && (
            <span className="mt-0.5 inline-block text-xs font-medium text-faint">
              lower-reliability feature
            </span>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${chipClasses(au.score)}`}>
          {scoreLabel(au.score)}
        </span>
      </div>

      <p className={`mt-2 text-sm ${notAssessable ? 'italic text-faint' : 'text-muted'}`}>
        {notAssessable && au.notScorableReason ? au.notScorableReason : au.evidence}
      </p>

      {!notAssessable && (
        <p className="mt-2 text-xs text-faint">
          {au.agreement} of {samples} runs agreed
        </p>
      )}
    </div>
  );
}
