import type { Caveat } from '@/lib/contract';

const ICONS: Record<Caveat['kind'], string> = {
  brachycephalic: '🐈',
  dark_coat: '🌑',
  acute_pain_only: '⏱️',
  low_agreement: '❓',
};

/** Non-alarming amber notices that qualify the result. Always rendered when present. */
export default function CaveatBanner({ caveats }: { caveats: Caveat[] }) {
  if (caveats.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">Things to keep in mind</h3>
      <ul className="mt-2 space-y-2">
        {caveats.map((c, i) => (
          <li key={`${c.kind}-${i}`} className="flex gap-2 text-sm text-amber-900 dark:text-amber-200">
            <span aria-hidden>{ICONS[c.kind]}</span>
            <span>{c.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
