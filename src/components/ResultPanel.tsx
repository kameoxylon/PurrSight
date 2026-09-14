import type { Assessment } from '@/lib/contract';
import ScoreDial from './ScoreDial';
import ActionUnitCard from './ActionUnitCard';
import CaveatBanner from './CaveatBanner';

/** Renders a full, successful assessment. */
export default function ResultPanel({ assessment }: { assessment: Assessment }) {
  const { actionUnits, caveats, recommendation, meta, scorableCount } = assessment;

  return (
    <div className="space-y-5">
      <ScoreDial assessment={assessment} />

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800">What we recommend</h2>
        <p className="mt-1 text-sm text-slate-600">{recommendation}</p>
      </div>

      <CaveatBanner caveats={caveats} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Facial features we looked at</h2>
          <span className="text-xs text-slate-400">
            {scorableCount} of {actionUnits.length} scored
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {actionUnits.map((au) => (
            <ActionUnitCard key={au.id} au={au} samples={meta.samples} />
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">
        Assessed with {meta.model} · prompt {meta.promptVersion} · {meta.samples} model runs
      </p>
    </div>
  );
}
