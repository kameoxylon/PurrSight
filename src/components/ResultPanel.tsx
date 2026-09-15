import type { Assessment } from '@/lib/contract';
import ScoreDial from './ScoreDial';
import ActionUnitCard from './ActionUnitCard';
import CaveatBanner from './CaveatBanner';
import VetLink from './VetLink';
import VetMap from './VetMap';

/**
 * Renders a full, successful assessment.
 *
 * Section order is deliberate: the caveats come before the number so the
 * limitations are read first rather than as a footnote. The rose "may be in
 * pain" alert stays pinned above everything, because it is the one thing that
 * should never be scrolled past.
 */
export default function ResultPanel({ assessment }: { assessment: Assessment }) {
  const { actionUnits, caveats, recommendation, meta, scorableCount, aboveThreshold } = assessment;

  return (
    <div className="space-y-5">
      {aboveThreshold && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl" aria-hidden>
              🚨
            </span>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-rose-700 dark:text-rose-300">
                This score suggests your cat may be in pain
              </h2>
              <p className="mt-1 text-sm text-muted">
                The signs here are above the threshold where the original study recommended pain
                relief. If this matches how your cat is behaving, please contact a veterinarian.
              </p>
              <div className="mt-3">
                <VetLink />
              </div>
            </div>
          </div>
        </div>
      )}

      <CaveatBanner caveats={caveats} />

      <ScoreDial assessment={assessment} />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Facial features we looked at</h2>
          <span className="text-xs text-faint">
            {scorableCount} of {actionUnits.length} scored
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {actionUnits.map((au) => (
            <ActionUnitCard key={au.id} au={au} samples={meta.samples} />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">What we recommend</h2>
        <p className="mt-1 text-sm text-muted">{recommendation}</p>
        <div className="mt-3">
          <VetMap />
        </div>
      </div>

      <p className="text-center text-xs text-faint">
        Assessed with {meta.model} · prompt {meta.promptVersion} · {meta.samples} model runs
      </p>
    </div>
  );
}
