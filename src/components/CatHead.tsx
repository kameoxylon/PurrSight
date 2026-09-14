/** Friendly cat-face mascot for the upload dropzone. Eyes use the eye-blue
 *  accent to tie into the theme. Purely decorative. */
export default function CatHead({ className = 'h-16 w-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* ears */}
      <path d="M14 22 L18 5 L31 17 Z" className="fill-brand" />
      <path d="M50 22 L46 5 L33 17 Z" className="fill-brand" />
      <path d="M18 18 L20 9 L27 16 Z" className="fill-brand-ink/40" />
      <path d="M46 18 L44 9 L37 16 Z" className="fill-brand-ink/40" />
      {/* head */}
      <circle cx="32" cy="37" r="20" className="fill-brand" />
      {/* eyes */}
      <ellipse cx="24" cy="35" rx="3.2" ry="4.2" className="fill-accent" />
      <ellipse cx="40" cy="35" rx="3.2" ry="4.2" className="fill-accent" />
      {/* nose */}
      <path d="M29.5 43 L34.5 43 L32 46.5 Z" fill="#ffffff" />
      {/* whiskers */}
      <g stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round">
        <line x1="12" y1="40" x2="23" y2="41.5" />
        <line x1="12" y1="46" x2="23" y2="44.5" />
        <line x1="52" y1="40" x2="41" y2="41.5" />
        <line x1="52" y1="46" x2="41" y2="44.5" />
      </g>
    </svg>
  );
}
