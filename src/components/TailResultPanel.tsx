import type { TailReading, TailMeta, TailMotion } from '@/lib/tail-contract';
import { TAIL_STATE_META } from '@/lib/tail-contract';

const CONFIDENCE_STYLE: Record<TailReading['confidence'], { label: string; className: string }> = {
  high: { label: 'High confidence', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  medium: { label: 'Medium confidence', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  low: { label: 'Low confidence', className: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
};

const MOTION_LABEL: Record<TailMotion, string> = {
  still: 'Held still',
  slow: 'Moving slowly',
  fast: 'Moving fast',
  unknown: 'Motion unknown (single photo)',
};

/**
 * Renders a playful tail-behaviour read. Deliberately NOT styled like the
 * clinical FGS panel — this is body-language for fun, so it leans warm and
 * casual, and never implies a medical finding.
 */
export default function TailResultPanel({
  reading,
  meta,
}: {
  reading: TailReading;
  meta: TailMeta;
}) {
  const emoji = TAIL_STATE_META[reading.state].emoji;
  const conf = CONFIDENCE_STYLE[reading.confidence];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
        <div className="text-5xl" aria-hidden>
          {emoji}
        </div>
        <h2 className="mt-3 text-2xl font-extrabold text-ink">{reading.label}</h2>
        <p className="mt-1 text-sm font-semibold text-brand">{reading.mood}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${conf.className}`}>
            {conf.label}
          </span>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
            {MOTION_LABEL[reading.motion]}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-ink">What your cat is saying</h3>
        <p className="mt-1 text-sm text-muted">{reading.interpretation}</p>
        <p className="mt-3 text-sm text-faint">{reading.blurb}</p>
      </div>

      {reading.cues.length > 0 && (
        <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-ink">What we noticed</h3>
          <ul className="mt-2 space-y-1.5">
            {reading.cues.map((cue, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted">
                <span className="text-brand" aria-hidden>
                  •
                </span>
                <span>{cue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-800 dark:text-amber-200">
        Just for fun 🐾 Tail reading is a playful take on cat body language, not veterinary or
        behavioural advice. If your cat seems unwell or distressed, talk to a vet.
      </div>

      <p className="text-center text-xs text-faint">
        Read with {meta.model} · prompt {meta.promptVersion} · {meta.frames} frame
        {meta.frames > 1 ? 's' : ''} from {meta.source}
      </p>
    </div>
  );
}
