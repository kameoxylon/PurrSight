import type { Assessment } from '@/lib/contract';
import { splitCaveats } from '@/lib/ui';
import ScoreDial from './ScoreDial';
import ActionUnitCard from './ActionUnitCard';
import CaveatNotes from './CaveatNotes';
import VetLink from './VetLink';

/**
 * Renders a full, successful assessment.
 *
 * Section order answers the questions in the order a worried owner asks them:
 * what is it (score), what do I do (recommendation), and why do you say that
 * (the features). Supporting evidence sits below the action rather than in
 * front of it.
 *
 * This deliberately REVERSES an earlier layout that opened with the caveat
 * banner. Leading with a disclaimer spent the most valuable space on text that
 * is identical for every result; the scale's scope now rides quietly under the
 * gauge instead (see splitCaveats), and caveats about the actual photo sit with
 * the feature cards they name.
 *
 * The rose "may be in pain" alert stays pinned above everything — it is the one
 * thing that should never be scrolled past. It carries no vet link: the single
 * "Find a vet" control lives in "What we recommend", so there is exactly one.
 */
export default function ResultPanel({
  assessment,
  photoUrl,
}: {
  assessment: Assessment;
  photoUrl?: string | null;
}) {
  const { actionUnits, caveats, recommendation, meta, scorableCount, aboveThreshold } = assessment;
  const { scope, photo } = splitCaveats(caveats);
  // An odd card would otherwise leave a hole in the two-column grid.
  const lastSpansRow = actionUnits.length % 2 === 1;

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
            </div>
          </div>
        </div>
      )}

      <ScoreDial
        assessment={assessment}
        photoUrl={photoUrl}
        scopeNote={scope[0]?.message ?? null}
      />

      <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">What we recommend</h2>
        <p className="mt-1 text-sm text-muted">{recommendation}</p>
        <div className="mt-3">
          <VetLink />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Facial features we looked at</h2>
          <span className="text-xs text-faint">
            {scorableCount} of {actionUnits.length} scored
          </span>
        </div>
        <CaveatNotes caveats={photo} />
        <div className="grid gap-3 sm:grid-cols-2">
          {actionUnits.map((au, i) => (
            <ActionUnitCard
              key={au.id}
              au={au}
              samples={meta.samples}
              className={lastSpansRow && i === actionUnits.length - 1 ? 'sm:col-span-2' : ''}
            />
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-faint">
        Assessed with {meta.model} · prompt {meta.promptVersion} · {meta.samples} model runs
      </p>
    </div>
  );
}
