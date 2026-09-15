import { ANALGESIA_THRESHOLD, type Assessment } from '@/lib/contract';
import { BAND_STYLES } from '@/lib/ui';

/**
 * Horizontal 0..1 pain scale with the validated analgesia threshold (0.39)
 * marked, and the cat's normalized score plotted on it. Deliberately simple and
 * legible over a fancy arc — judges read it in two seconds.
 *
 * Carries the submitted photo so the number is never shown detached from the
 * face it was read from, and closes with `scopeNote` — the always-present
 * "validated for acute pain" caveat, kept quiet down here rather than as a
 * banner above the result (see splitCaveats in lib/ui).
 *
 * The thumbnail is a plain <img>: `photoUrl` is an object URL for bytes already
 * in memory, so there is nothing for next/image to fetch or optimise.
 */
export default function ScoreDial({
  assessment,
  photoUrl,
  scopeNote,
}: {
  assessment: Assessment;
  photoUrl?: string | null;
  scopeNote?: string | null;
}) {
  const { normalizedScore, band, aboveThreshold } = assessment;
  const style = BAND_STYLES[band];
  const pct = Math.round(normalizedScore * 100);
  const thresholdPct = Math.round(ANALGESIA_THRESHOLD * 100);

  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} p-5`}>
      <div className="flex items-center gap-4">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="The photo this assessment was based on"
            className="h-16 w-16 shrink-0 rounded-xl border border-black/10 object-cover shadow-sm"
          />
        )}
        <div className="flex flex-1 items-baseline justify-between">
          <span className={`text-sm font-semibold uppercase tracking-wide ${style.text}`}>{style.label}</span>
          <span className="text-2xl font-bold tabular-nums text-ink">{normalizedScore.toFixed(2)}</span>
        </div>
      </div>

      <div className="relative mt-4 h-3 w-full rounded-full bg-black/10 dark:bg-white/10">
        {/* fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, backgroundColor: style.solid }}
        />
        {/* threshold marker */}
        <div
          className="absolute -top-1.5 bottom-[-0.375rem] w-0.5 bg-faint"
          style={{ left: `${thresholdPct}%` }}
          aria-hidden
        />
        {/* score dot */}
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${pct}%`, backgroundColor: style.solid }}
          aria-hidden
        />
      </div>

      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>0 · comfortable</span>
        <span>threshold {ANALGESIA_THRESHOLD}</span>
        <span>1 · marked</span>
      </div>

      <p className="mt-3 text-sm text-muted">
        {aboveThreshold
          ? 'This score is above the pain-relief threshold used in the original study.'
          : 'This score is below the pain-relief threshold used in the original study.'}
      </p>

      {scopeNote && (
        <p className="mt-2 flex gap-1.5 border-t border-black/5 pt-2 text-xs text-faint dark:border-white/10">
          <span aria-hidden>⏱️</span>
          <span>{scopeNote}</span>
        </p>
      )}
    </div>
  );
}
