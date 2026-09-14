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
    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-6 text-center">
      <div className="text-4xl" aria-hidden>
        ⚠️
      </div>
      <h2 className="mt-3 text-lg font-semibold text-slate-800">Something went wrong</h2>
      <p className="mt-1 text-sm text-slate-600">{message}</p>
      <div className="mt-5 flex justify-center gap-3">
        {retryable && (
          <button
            onClick={onRetry}
            className="rounded-full bg-slate-800 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-900"
          >
            Try again
          </button>
        )}
        <button
          onClick={onReset}
          className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Upload a different photo
        </button>
      </div>
    </div>
  );
}
