/** Persistent, always-visible disclaimer. Non-negotiable per the PLAN + README.
 *
 * Two lengths, because the same words are not equally useful at both moments.
 * Before a result there is nothing else on screen qualifying the tool, so the
 * full scope is spelled out here. On a result the acute-pain caveat already
 * sits under the gauge where it qualifies the actual reading, so repeating it
 * would be the third copy — the footer drops back to a plain terms line.
 *
 * Neither variant is bolded or boxed: this is standing boilerplate, and
 * styling it as a warning competes with the one alert that is a warning.
 */
export default function Disclaimer({ variant = 'full' }: { variant?: 'full' | 'short' }) {
  return (
    <footer className="mt-10 border-t border-line pt-6 text-center text-xs leading-relaxed text-faint">
      <p className="mx-auto max-w-2xl">
        PurrSight is not a diagnostic tool and is not a substitute for veterinary care.
        {variant === 'full' && (
          <>
            {' '}
            It is an awareness aid. The Feline Grimace Scale was validated for <em>acute</em> pain —
            a cat with chronic pain may still score low. If something seems wrong, contact a
            veterinarian.
          </>
        )}
      </p>
    </footer>
  );
}
