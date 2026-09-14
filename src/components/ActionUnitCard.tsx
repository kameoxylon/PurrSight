import type { ActionUnitAssessment } from '@/lib/contract';
import { isLowerReliability, scoreLabel } from '@/lib/ui';

/** Colour the score chip by severity; "not assessable" is neutral, not an error. */
function chipClasses(score: 0 | 1 | 2 | null): string {
  switch (score) {
    case 0:
      return 'bg-emerald-100 text-emerald-800';
    case 1:
      return 'bg-amber-100 text-amber-800';
    case 2:
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-500';
  }
}

export default function ActionUnitCard({
  au,
  samples,
}: {
  au: ActionUnitAssessment;
  samples: number;
}) {
  const lowerReliability = isLowerReliability(au.id);
  const notAssessable = au.score === null;

  return (
    <div
      className={`rounded-xl border p-4 ${
        lowerReliability ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-800">{au.label}</h3>
          {lowerReliability && (
            <span className="mt-0.5 inline-block text-xs font-medium text-slate-400">
              lower-reliability feature
            </span>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${chipClasses(au.score)}`}>
          {scoreLabel(au.score)}
        </span>
      </div>

      <p className={`mt-2 text-sm ${notAssessable ? 'italic text-slate-500' : 'text-slate-600'}`}>
        {notAssessable && au.notScorableReason ? au.notScorableReason : au.evidence}
      </p>

      {!notAssessable && (
        <p className="mt-2 text-xs text-slate-400">
          {au.agreement} of {samples} runs agreed
        </p>
      )}
    </div>
  );
}
