'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { prepareImage, UnsupportedImageError } from '@/lib/prepare-image';

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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!preview ? (
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
            dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-slate-400'
          } disabled:opacity-60`}
        >
          <span className="text-4xl" aria-hidden>
            🐱
          </span>
          <span className="font-semibold text-slate-700">
            {preparing ? 'Preparing photo…' : 'Upload a photo of your cat'}
          </span>
          <span className="text-sm text-slate-500">
            Tap to choose or take a photo · or drag an image here
          </span>
          <span className="text-xs text-slate-400">JPEG, PNG, or WebP · front-facing works best</span>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-slate-100">
            {/* Object URL preview — next/image with unoptimized to skip the loader. */}
            <Image src={preview} alt="Your cat" fill unoptimized className="object-cover" />
          </div>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              disabled={disabled || !blob}
              onClick={() => blob && onSubmit(blob)}
              className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              Assess this photo
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={reset}
              className="rounded-full border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
            >
              Choose another
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
    </div>
  );
}
