import { NextResponse } from 'next/server';
import { assessImage } from '@/lib/assess';
import type { AssessResult } from '@/lib/contract';

/** assessImage uses Node APIs (Buffer / model SDK), so pin the Node runtime. */
export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — client already downscales; this is a backstop.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function err(
  kind: Extract<AssessResult, { status: 'error' }>['kind'],
  message: string,
  retryable: boolean,
  httpStatus: number,
) {
  const body: AssessResult = { status: 'error', kind, message, retryable };
  return NextResponse.json(body, { status: httpStatus });
}

/** Map an 'error' result to a sensible HTTP status; assessed/rejected are 200. */
function httpStatusFor(result: AssessResult): number {
  if (result.status !== 'error') return 200;
  switch (result.kind) {
    case 'timeout':
      return 504;
    case 'rate_limit':
      return 429;
    case 'upstream_unavailable':
      return 503;
    default:
      return 502;
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err('internal', 'Could not read the uploaded form data.', false, 400);
  }

  const file = form.get('image');
  if (!(file instanceof Blob)) {
    return err('internal', 'No image file was included in the request.', false, 400);
  }
  if (file.size === 0) {
    return err('internal', 'The uploaded image was empty.', false, 400);
  }
  if (file.size > MAX_BYTES) {
    return err('internal', 'That image is too large. Please use one under 10 MB.', false, 413);
  }

  const mimeType = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return err('internal', 'Unsupported image type. Please upload a JPEG, PNG, or WebP.', false, 415);
  }

  const imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  // assessImage is contractually guaranteed never to throw; guard anyway.
  let result: AssessResult;
  try {
    result = await assessImage({ imageBase64, mimeType });
  } catch {
    return err('internal', 'Something went wrong while assessing the image. Please try again.', true, 502);
  }

  return NextResponse.json(result, { status: httpStatusFor(result) });
}
