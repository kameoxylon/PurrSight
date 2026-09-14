/** The PurrSight paw mark. Inherits colour via currentColor so it works on the
 *  ginger badge (white) and anywhere else. Kept in sync with app/icon.svg. */
export default function PawLogo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" aria-hidden="true">
      <ellipse cx="32" cy="45" rx="16" ry="13" />
      <ellipse cx="13" cy="31" rx="6" ry="8" transform="rotate(-15 13 31)" />
      <ellipse cx="25" cy="21" rx="6.5" ry="9" transform="rotate(-6 25 21)" />
      <ellipse cx="39" cy="21" rx="6.5" ry="9" transform="rotate(6 39 21)" />
      <ellipse cx="51" cy="31" rx="6" ry="8" transform="rotate(15 51 31)" />
    </svg>
  );
}
