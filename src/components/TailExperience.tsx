'use client';

import { useState } from 'react';
import type { TailResult } from '@/lib/tail-contract';
import TailUploadCard from '@/components/TailUploadCard';
import TailResultPanel from '@/components/TailResultPanel';

type Phase = 'idle' | 'loading';

/**
 * Self-contained state machine for the tail-behaviour flow. Kept OUT of
 * page.tsx (which owns the FGS flow) so the two features stay decoupled and
 * the mode switch is a clean either/or. Mirrors the face flow's phases:
 * idle -> loading -> (read | rejected | error).
 */
export default function TailExperience() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<TailResult | null>(null);
  const [lastFrames, setLastFrames] = useState<{ blobs: Blob[]; source: 'photo' | 'video' } | null>(
    null,
  );

  async function readTailFlow(blobs: Blob[], source: 'photo' | 'video') {
    setLastFrames({ blobs, source });
    setPhase('loading');
    setResult(null);
    try {
      const form = new FormData();
      form.append('source', source);
      blobs.forEach((b, i) => form.append('frames', b, `frame-${i}.jpg`));
      const res = await fetch('/api/tail', { method: 'POST', body: form });
      const data = (await res.json()) as TailResult;
      setResult(data);
    } catch {
      setResult({
        status: 'error',
        kind: 'upstream_unavailable',
        message: 'We couldn’t reach the tail reader. Check your connection and try again.',
        retryable: true,
      });
    } finally {
      setPhase('idle');
    }
  }

  function reset() {
    setResult(null);
    setLastFrames(null);
    setPhase('idle');
  }

  const showUpload = phase === 'idle' && result === null;

  return (
    <div>
      {showUpload && <TailUploadCard disabled={false} onSubmit={readTailFlow} />}

      {phase === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-line bg-card px-6 py-16 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
          <p className="font-semibold text-ink">Reading your cat’s tail…</p>
          <p className="max-w-xs text-sm text-muted">
            We’re looking at the tail’s position and movement across your frames.
          </p>
        </div>
      )}

      {phase === 'idle' && result?.status === 'read' && (
        <div className="space-y-6">
          <TailResultPanel reading={result.reading} meta={result.meta} />
          <div className="flex justify-center">
            <button
              onClick={reset}
              className="rounded-full border border-line bg-card px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2"
            >
              Read another
            </button>
          </div>
        </div>
      )}

      {phase === 'idle' && result?.status === 'rejected' && (
        <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-line bg-card p-6 text-center shadow-sm">
          <div className="text-4xl" aria-hidden>
            🙀
          </div>
          <p className="font-semibold text-ink">{result.message}</p>
          {result.tips.length > 0 && (
            <ul className="mx-auto max-w-sm space-y-1.5 text-left">
              {result.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted">
                  <span className="text-brand" aria-hidden>
                    •
                  </span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={reset}
            className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover"
          >
            Try another
          </button>
        </div>
      )}

      {phase === 'idle' && result?.status === 'error' && (
        <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
          <div className="text-4xl" aria-hidden>
            😿
          </div>
          <p className="font-semibold text-rose-700 dark:text-rose-300">{result.message}</p>
          <div className="flex justify-center gap-3">
            {result.retryable && lastFrames && (
              <button
                onClick={() => readTailFlow(lastFrames.blobs, lastFrames.source)}
                className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover"
              >
                Try again
              </button>
            )}
            <button
              onClick={reset}
              className="rounded-full border border-line bg-card px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
