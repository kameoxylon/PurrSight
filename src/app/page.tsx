'use client';

import { useState } from 'react';
import type { AssessResult } from '@/lib/contract';
import UploadCard from '@/components/UploadCard';
import ResultPanel from '@/components/ResultPanel';
import RejectionCard from '@/components/RejectionCard';
import ErrorCard from '@/components/ErrorCard';
import Disclaimer from '@/components/Disclaimer';
import PawLogo from '@/components/PawLogo';
import { downloadResultPdf } from '@/lib/download-pdf';

type Phase = 'idle' | 'loading';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<AssessResult | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  async function assess(blob: Blob) {
    setLastBlob(blob);
    setPhase('loading');
    setResult(null);
    try {
      const form = new FormData();
      form.append('image', blob, 'cat.jpg');
      const res = await fetch('/api/assess', { method: 'POST', body: form });
      const data = (await res.json()) as AssessResult;
      setResult(data);
    } catch {
      setResult({
        status: 'error',
        kind: 'upstream_unavailable',
        message: 'We couldn’t reach the assessment service. Check your connection and try again.',
        retryable: true,
      });
    } finally {
      setPhase('idle');
    }
  }

  function reset() {
    setResult(null);
    setLastBlob(null);
    setPhase('idle');
  }

  const showUpload = phase === 'idle' && result === null;

  return (
    <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-4 pt-10 pb-3.5 sm:pt-14">
      <header className="text-center">
        <div className="inline-flex items-center gap-3">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-hover text-white shadow-sm ring-1 ring-black/5"
            aria-hidden
          >
            <PawLogo className="h-7 w-7" />
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            <span className="text-brand">Purr</span>
            <span className="text-ink">Sight</span>
          </h1>
        </div>
        <p className="mx-auto mt-3 max-w-md text-muted">
          Upload a photo of your cat for an AI-assisted read on signs of pain, based on the Feline
          Grimace Scale.
        </p>
      </header>

      <main className="mt-8 flex-1">
        {showUpload && <UploadCard disabled={false} onSubmit={assess} />}

        {phase === 'loading' && <LoadingState />}

        {phase === 'idle' && result?.status === 'assessed' && (
          <div className="space-y-6">
            <ResultPanel assessment={result.assessment} />
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={async () => {
                  setPdfBusy(true);
                  setPdfError(false);
                  try {
                    await downloadResultPdf(result.assessment);
                  } catch (err) {
                    // Without this the promise rejects unhandled and the button
                    // just snaps back to idle, looking like a dead control.
                    console.error('[pdf] failed to build the report', err);
                    setPdfError(true);
                  } finally {
                    setPdfBusy(false);
                  }
                }}
                disabled={pdfBusy}
                className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover disabled:opacity-60"
              >
                {pdfBusy ? 'Preparing PDF…' : 'Download results (PDF)'}
              </button>
              <button
                onClick={reset}
                className="rounded-full border border-line bg-card px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2"
              >
                Assess another photo
              </button>
            </div>
            {pdfError && (
              <p className="text-center text-sm text-rose-600 dark:text-rose-400">
                We couldn&apos;t build the PDF. Your results are still shown above.
              </p>
            )}
          </div>
        )}

        {phase === 'idle' && result?.status === 'rejected' && (
          <RejectionCard
            reason={result.reason}
            message={result.message}
            retakeTips={result.retakeTips}
            onRetake={reset}
          />
        )}

        {phase === 'idle' && result?.status === 'error' && (
          <ErrorCard
            message={result.message}
            retryable={result.retryable}
            onRetry={() => lastBlob && assess(lastBlob)}
            onReset={reset}
          />
        )}
      </main>

      <Disclaimer />
    </div>
  );
}

/** Model calls take 3–8s and we sample several times — design for the wait. */
function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-line bg-card px-6 py-16 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
      <p className="font-semibold text-ink">Looking at your cat’s face…</p>
      <p className="max-w-xs text-sm text-muted">
        We run the assessment a few times and combine the results, so this takes a few seconds.
      </p>
    </div>
  );
}
