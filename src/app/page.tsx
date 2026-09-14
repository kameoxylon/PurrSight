'use client';

import { useState } from 'react';
import type { AssessResult } from '@/lib/contract';
import UploadCard from '@/components/UploadCard';
import ResultPanel from '@/components/ResultPanel';
import RejectionCard from '@/components/RejectionCard';
import ErrorCard from '@/components/ErrorCard';
import Disclaimer from '@/components/Disclaimer';

type Phase = 'idle' | 'loading';

export default function Home() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<AssessResult | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);

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
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-10 sm:py-14">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          🐾 PurrSight
        </h1>
        <p className="mt-2 text-slate-600">
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
            <div className="text-center">
              <button
                onClick={reset}
                className="rounded-full border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Assess another photo
              </button>
            </div>
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
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
      <p className="font-semibold text-slate-700">Looking at your cat’s face…</p>
      <p className="max-w-xs text-sm text-slate-500">
        We run the assessment a few times and combine the results, so this takes a few seconds.
      </p>
    </div>
  );
}
