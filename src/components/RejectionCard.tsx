import type { RejectionReason } from '@/lib/contract';

const HEADINGS: Record<RejectionReason, string> = {
  no_cat_detected: 'We couldn’t find a cat',
  face_not_visible: 'We couldn’t see the face clearly',
  image_quality: 'This photo was hard to read',
  multiple_cats: 'We spotted more than one cat',
  too_few_scorable_aus: 'Not enough of the face was visible to score',
};

/**
 * The deliberate "we won't guess" state. Designed to look intentional and
 * helpful — NOT like an error — because refusing to score is a feature here.
 */
export default function RejectionCard({
  reason,
  message,
  retakeTips,
  onRetake,
}: {
  reason: RejectionReason;
  message: string;
  retakeTips: string[];
  onRetake: () => void;
}) {
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/10 p-6 text-center">
      <div className="text-4xl" aria-hidden>
        📷
      </div>
      <h2 className="mt-3 text-lg font-semibold text-ink">{HEADINGS[reason]}</h2>
      <p className="mt-1 text-sm text-muted">{message}</p>

      {retakeTips.length > 0 && (
        <div className="mx-auto mt-4 max-w-sm rounded-xl border border-line bg-card/70 p-4 text-left">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">
            Tips for a better photo
          </h3>
          <ul className="mt-2 space-y-1.5">
            {retakeTips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink">
                <span aria-hidden>•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onRetake}
        className="mt-5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Try another photo
      </button>
    </div>
  );
}
