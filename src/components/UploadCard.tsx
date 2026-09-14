'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { prepareImage, UnsupportedImageError } from '@/lib/prepare-image';

const DEMOS = [
  { src: '/demo/tabby.jpg', label: 'Tabby' },
  { src: '/demo/grey.jpg', label: 'Grey' },
  { src: '/demo/calico.jpg', label: 'Calico' },
];

/**
 * Upload surface: drag-and-drop on desktop, tap-to-pick / camera on mobile.
 * Downscales the chosen photo client-side and previews it before the user
 * commits to an assessment.
 */
export default function UploadCard({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (blob: Blob) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      const prepared = await prepareImage(file);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return prepared.previewUrl;
      });
      setBlob(prepared.blob);
    } catch (e) {
      const msg =
        e instanceof UnsupportedImageError
          ? e.message
          : 'That image could not be read. Please try a JPEG or PNG.';
      setError(msg);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      setBlob(null);
    } finally {
      setPreparing(false);
    }
  }, []);

  const reset = () => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setBlob(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const loadDemo = useCallback(
    async (src: string) => {
      setError(null);
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error('fetch failed');
        const raw = await res.blob();
        const name = src.split('/').pop() || 'demo';
        const file = new File([raw], name, { type: raw.type || 'image/jpeg' });
        await handleFile(file);
      } catch {
        setError('Could not load that sample photo. Please try uploading your own.');
      }
    },
    [handleFile],
  );

  return (
    <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!preview ? (
        <>
          <button
            type="button"
            disabled={disabled || preparing}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
              dragOver ? 'border-brand bg-brand/10' : 'border-line hover:border-brand/60'
            } disabled:opacity-60`}
          >
            <span className="text-5xl" aria-hidden>
              🐱
            </span>
            <span className="font-semibold text-ink">
              {preparing ? 'Preparing photo…' : 'Upload a photo of your cat'}
            </span>
            <span className="text-sm text-muted">
              Tap to choose or take a photo · or drag an image here
            </span>
            <span className="text-xs text-faint">JPEG, PNG, or WebP · front-facing works best</span>
          </button>

          <div className="mt-4">
            <p className="mb-2 text-center text-xs text-faint">No cat handy? Try a sample:</p>
            <div className="flex justify-center gap-3">
              {DEMOS.map((d) => (
                <button
                  key={d.src}
                  type="button"
                  disabled={disabled || preparing}
                  onClick={() => loadDemo(d.src)}
                  className="group flex flex-col items-center gap-1 disabled:opacity-60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={d.src}
                    alt={`${d.label} sample cat`}
                    className="h-16 w-16 rounded-xl border border-line object-cover transition group-hover:border-brand"
                  />
                  <span className="text-xs text-muted">{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-surface-2">
            {/* Object URL preview — next/image with unoptimized to skip the loader. */}
            <Image src={preview} alt="Your cat" fill unoptimized className="object-cover" />
          </div>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              disabled={disabled || !blob}
              onClick={() => blob && onSubmit(blob)}
              className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-hover disabled:opacity-60"
            >
              Assess this photo
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={reset}
              className="rounded-full border border-line bg-card px-6 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-60"
            >
              Choose another
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>
      )}
    </div>
  );
}
