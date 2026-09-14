/**
 * The pipeline-failure state (status: 'error'). Distinct from RejectionCard:
 * something broke, it wasn't a considered refusal. Offers retry when the error
 * is retryable (timeout / rate limit).
 */
export default function ErrorCard({
  message,
  retryable,
  onRetry,
  onReset,
}: {
  message: string;
  retryable: boolean;
  onRetry: () => void;
  onReset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2 p-6 text-center">
      <div className="text-4xl" aria-hidden>
        ⚠️
      </div>
      <h2 className="mt-3 text-lg font-semibold text-ink">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <div className="mt-5 flex justify-center gap-3">
        {retryable && (
          <button
            onClick={onRetry}
            className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover"
          >
            Try again
          </button>
        )}
        <button
          onClick={onReset}
          className="rounded-full border border-line bg-card px-5 py-2 text-sm font-semibold text-ink transition hover:bg-surface-2"
        >
          Upload a different photo
        </button>
      </div>
    </div>
  );
}
