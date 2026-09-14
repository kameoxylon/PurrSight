/** Persistent, always-visible disclaimer. Non-negotiable per the PLAN + README. */
export default function Disclaimer() {
  return (
    <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-xs leading-relaxed text-slate-500">
      <p className="mx-auto max-w-2xl">
        <strong className="text-slate-600">PurrSight is not a diagnostic tool and is not a substitute
        for veterinary care.</strong>{' '}
        It is an awareness aid. The Feline Grimace Scale was validated for <em>acute</em> pain — a cat
        with chronic pain may still score low. If something seems wrong, contact a veterinarian.
      </p>
      <p className="mt-3 text-slate-400">
        Feline Grimace Scale © Université de Montréal ·{' '}
        <a
          href="https://www.felinegrimacescale.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-slate-600"
        >
          felinegrimacescale.com
        </a>
      </p>
    </footer>
  );
}
