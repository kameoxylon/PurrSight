import type { Caveat } from '@/lib/contract';

/**
 * Indexed by string, not by `Caveat['kind']`, so a kind added server-side that
 * this build has never heard of still renders with a fallback icon instead of
 * an empty gap.
 */
const ICONS: Record<string, string> = {
  brachycephalic: '🐈',
  dark_coat: '🌑',
  acute_pain_only: '⏱️',
  low_agreement: '❓',
};

/**
 * Caveats about THIS photo, shown directly above the feature cards they refer
 * to — `low_agreement` names the exact features the runs disagreed on, so it
 * reads as a note on those cards rather than as fine print.
 *
 * Deliberately calm. These qualify a reading; they are not warnings. Strong
 * visual alarm is reserved for a score that is actually concerning.
 */
export default function CaveatNotes({ caveats }: { caveats: Caveat[] }) {
  if (caveats.length === 0) return null;

  return (
    <ul className="mb-3 space-y-1.5">
      {caveats.map((caveat, i) => (
        <li
          key={`${caveat.kind}-${i}`}
          className="flex gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-muted"
        >
          <span aria-hidden>{ICONS[caveat.kind] ?? 'ℹ️'}</span>
          <span>{caveat.message}</span>
        </li>
      ))}
    </ul>
  );
}
