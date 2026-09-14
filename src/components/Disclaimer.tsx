/** Persistent, always-visible disclaimer. Non-negotiable per the PLAN + README. */
export default function Disclaimer() {
  return (
    <footer className="mt-10 border-t border-line pt-6 text-center text-xs leading-relaxed text-muted">
      <p className="mx-auto max-w-2xl">
        <strong className="text-ink">PurrSight is not a diagnostic tool and is not a substitute
        for veterinary care.</strong>{' '}
        It is an awareness aid. The Feline Grimace Scale was validated for <em>acute</em> pain — a cat
        with chronic pain may still score low. If something seems wrong, contact a veterinarian.
      </p>
    </footer>
  );
}
