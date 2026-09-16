import { NextResponse } from 'next/server';
import { readTail } from '@/lib/tail';
import { MAX_TAIL_FRAMES, type TailResult } from '@/lib/tail-contract';

/** readTail uses Node APIs (Buffer / model SDK), so pin the Node runtime. */
export const runtime = 'nodejs';

const MAX_BYTES_PER_FRAME = 4 * 1024 * 1024; // frames are downscaled client-side; backstop only.

function err(
  kind: Extract<TailResult, { status: 'error' }>['kind'],
  message: string,
  retryable: boolean,
  httpStatus: number,
) {
  const body: TailResult = { status: 'error', kind, message, retryable };
  return NextResponse.json(body, { status: httpStatus });
}

function httpStatusFor(result: TailResult): number {
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

  const source = form.get('source') === 'video' ? 'video' : 'photo';
  const files = form.getAll('frames').filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return err('internal', 'No frames were included in the request.', false, 400);
  }
  if (files.length > MAX_TAIL_FRAMES) {
    return err('internal', 'Too many frames were sent.', false, 413);
  }

  const frames: string[] = [];
  for (const file of files) {
    if (file.size === 0) {
      return err('internal', 'One of the frames was empty.', false, 400);
    }
    if (file.size > MAX_BYTES_PER_FRAME) {
      return err('internal', 'A frame was too large. Please try a shorter clip.', false, 413);
    }
    if ((file.type || '').toLowerCase() !== 'image/jpeg') {
      return err('internal', 'Frames must be JPEG images.', false, 415);
    }
    frames.push(Buffer.from(await file.arrayBuffer()).toString('base64'));
  }

  let result: TailResult;
  try {
    result = await readTail({ frames, mimeType: 'image/jpeg', source });
  } catch {
    return err('internal', 'Something went wrong while reading the tail. Please try again.', true, 502);
  }

  return NextResponse.json(result, { status: httpStatusFor(result) });
}
