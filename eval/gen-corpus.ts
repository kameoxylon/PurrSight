/**
 * PurrSight — eval corpus generator.
 * ---------------------------------------------------------------------------
 * Derives the eval set from the three licensed photos in `public/demo/` by
 * degrading them one axis at a time, plus a few synthetic non-cat images for
 * the gating cases.
 *
 * WHY DERIVED RATHER THAN SOURCED
 * `public/demo/CREDITS.md` tracks provenance for every image in this repo.
 * Scraping cat photos off the web would break that, so the corpus is built
 * from images we already have the rights to. One-axis-at-a-time degradation is
 * also the method the abstention probe in docs/PROMPT-V0.1.md already used
 * successfully, and "add underexposed and dark-coat cases to the eval set" is
 * that document's own follow-up instruction.
 *
 * WHY THE OUTPUT IS COMMITTED
 * The generated files are checked in, so `npm run eval` works without sharp.
 * sharp is only a transitive dependency of Next.js here — it is not in
 * package.json — so nothing on the eval path may depend on it. This generator
 * is a one-off developer tool; the corpus it produces is the actual artifact.
 *
 * Run with: npx tsx eval/gen-corpus.ts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const DEMO_DIR = join(process.cwd(), 'public', 'demo');
const OUT_DIR = join(process.cwd(), 'eval', 'images');

/**
 * Face geometry, as fractions of each image's own dimensions, read off the
 * actual photos rather than assumed. The three compositions genuinely differ —
 * calico is a full-body shot with a small, off-centre face — so a single
 * shared box would miss the anatomy it is supposed to cover.
 */
type Box = { left: number; top: number; width: number; height: number };

interface Source {
  name: string;
  file: string;
  /** Muzzle + whisker pads. Occluding this should produce per-AU nulls. */
  muzzle: Box;
  /** Both ears. Occluding this is the documented whole-image rejection case. */
  ears: Box;
}

const SOURCES: Source[] = [
  {
    name: 'tabby',
    file: 'tabby.jpg',
    muzzle: { left: 0.4, top: 0.53, width: 0.3, height: 0.22 },
    ears: { left: 0.29, top: 0.1, width: 0.47, height: 0.28 },
  },
  {
    name: 'grey',
    file: 'grey.jpg',
    muzzle: { left: 0.28, top: 0.6, width: 0.46, height: 0.26 },
    ears: { left: 0.05, top: 0.02, width: 0.9, height: 0.3 },
  },
  {
    name: 'calico',
    file: 'calico.jpg',
    muzzle: { left: 0.47, top: 0.355, width: 0.26, height: 0.15 },
    ears: { left: 0.44, top: 0.13, width: 0.26, height: 0.14 },
  },
];

/** What the app itself sends: prepare-image.ts caps the long edge at 1024. */
const APP_MAX_EDGE = 1024;

function base(file: string) {
  return sharp(join(DEMO_DIR, file)).rotate();
}

async function baselineBuffer(file: string): Promise<Buffer> {
  return base(file)
    .resize({ width: APP_MAX_EDGE, height: APP_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

/** A solid black rectangle over a normalized box of the image. */
async function occlude(file: string, box: Box): Promise<Buffer> {
  const src = await baselineBuffer(file);
  const meta = await sharp(src).metadata();
  const W = meta.width!;
  const H = meta.height!;

  const left = Math.round(box.left * W);
  const top = Math.round(box.top * H);
  const width = Math.min(Math.round(box.width * W), W - left);
  const height = Math.min(Math.round(box.height * H), H - top);

  return sharp(src)
    .composite([
      {
        input: {
          create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 1 },
          },
        },
        left,
        top,
      },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

const written: { file: string; bytes: number; sha: string }[] = [];

function write(name: string, buf: Buffer) {
  writeFileSync(join(OUT_DIR, name), buf);
  written.push({
    file: name,
    bytes: buf.length,
    sha: createHash('sha256').update(buf).digest('hex').slice(0, 12),
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  for (const s of SOURCES) {
    write(`${s.name}-baseline.jpg`, await baselineBuffer(s.file));

    // Underexposure is the axis the V0.1 probe flagged as questionable:
    // whiskers drifted 0 -> 1 unanimously at every darkness level while the
    // model neither abstained nor rejected. Three levels, so a drift shows up
    // as a trend rather than a single data point.
    for (const [label, brightness] of [
      ['dim50', 0.5],
      ['dim30', 0.3],
      ['dim18', 0.18],
    ] as const) {
      write(
        `${s.name}-${label}.jpg`,
        await sharp(await baselineBuffer(s.file))
          .modulate({ brightness })
          .jpeg({ quality: 88 })
          .toBuffer(),
      );
    }

    // LOW-CONTRAST case, deliberately NOT named "dark coat". Desaturating and
    // darkening a light cat reduces contrast across the whole frame; a black
    // cat has low contrast *within the face*, features dark against dark.
    // PROMPT-V0.1.md makes exactly this concession about the brightness
    // ablation, and renaming it here stops the eval output from claiming a
    // dark-coat result it has not earned. The nearest genuine dark-fur data
    // point in this corpus is calico-baseline, whose face is half black.
    write(
      `${s.name}-lowcontrast.jpg`,
      await sharp(await baselineBuffer(s.file))
        .modulate({ brightness: 0.45, saturation: 0.15 })
        .linear(0.7, 0)
        .jpeg({ quality: 88 })
        .toBuffer(),
    );

    // Still comfortably resolvable; the probe scored 384px fine.
    write(
      `${s.name}-small384.jpg`,
      await sharp(await baselineBuffer(s.file))
        .resize({ width: 384 })
        .jpeg({ quality: 88 })
        .toBuffer(),
    );

    // Intermediate sizes, added to LOCATE the gate threshold empirically
    // rather than pick a round number. 384 reproduces the baseline score
    // exactly; 96 doubled the tabby's score and pushed it over the analgesia
    // threshold. The boundary is somewhere between, so probe it.
    for (const width of [160, 224]) {
      write(
        `${s.name}-small${width}.jpg`,
        await sharp(await baselineBuffer(s.file))
          .resize({ width })
          .jpeg({ quality: 88 })
          .toBuffer(),
      );
    }

    // Occlusion produced correct per-AU nulls in the probe. This is the
    // abstention test: the model should say "cannot see it", not invent a score.
    write(`${s.name}-occl-muzzle.jpg`, await occlude(s.file, s.muzzle));

    // --- gating cases ---
    write(
      `${s.name}-blur.jpg`,
      await sharp(await baselineBuffer(s.file))
        .blur(18)
        .jpeg({ quality: 88 })
        .toBuffer(),
    );
    write(
      `${s.name}-tiny96.jpg`,
      await sharp(await baselineBuffer(s.file))
        .resize({ width: 96 })
        .jpeg({ quality: 88 })
        .toBuffer(),
    );
  }

  // Ear occlusion, tabby only: the probe documented this one rejecting the
  // whole image rather than nulling an AU. Kept as a regression check on a
  // known behaviour, not extrapolated to the other two photos.
  write('tabby-occl-ears.jpg', await occlude('tabby.jpg', SOURCES[0].ears));

  // Two cats in one frame -> multiple_cats.
  for (const [a, b] of [
    ['tabby', 'grey'],
    ['calico', 'tabby'],
  ] as const) {
    const H = 640;
    const left = await sharp(join(DEMO_DIR, `${a}.jpg`))
      .resize({ height: H })
      .toBuffer();
    const right = await sharp(join(DEMO_DIR, `${b}.jpg`))
      .resize({ height: H })
      .toBuffer();
    const lw = (await sharp(left).metadata()).width!;
    const rw = (await sharp(right).metadata()).width!;

    write(
      `multi-${a}-${b}.jpg`,
      await sharp({
        create: {
          width: lw + rw,
          height: H,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .composite([
          { input: left, left: 0, top: 0 },
          { input: right, left: lw, top: 0 },
        ])
        .jpeg({ quality: 88 })
        .toBuffer(),
    );
  }

  // --- non-cat junk, for the "is it even a cat" gate ---
  write(
    'junk-noise.jpg',
    await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
        noise: { type: 'gaussian', mean: 128, sigma: 40 },
      },
    })
      .jpeg({ quality: 88 })
      .toBuffer(),
  );

  write(
    'junk-solid.jpg',
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 96, g: 120, b: 150 } },
    })
      .jpeg({ quality: 88 })
      .toBuffer(),
  );

  // A drawn scene rather than pure noise: a flat colour field is trivially not
  // a photo of anything, whereas this at least contains objects to misread.
  const scene = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <rect width="800" height="600" fill="#8ec5e6"/>
      <rect y="420" width="800" height="180" fill="#5b8c3a"/>
      <rect x="120" y="230" width="240" height="200" fill="#c96f4a"/>
      <polygon points="100,230 240,130 380,230" fill="#8c3f2a"/>
      <rect x="200" y="320" width="70" height="110" fill="#6b4226"/>
      <circle cx="650" cy="120" r="60" fill="#f6e05e"/>
      <rect x="470" y="330" width="170" height="100" rx="18" fill="#3d5a80"/>
      <circle cx="510" cy="440" r="26" fill="#222"/>
      <circle cx="605" cy="440" r="26" fill="#222"/>
    </svg>`,
  );
  write('junk-scene.jpg', await sharp(scene).jpeg({ quality: 88 }).toBuffer());

  // Text-only image: a screenshot-like input a confused user might upload.
  const text = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
      <rect width="800" height="600" fill="#ffffff"/>
      <text x="60" y="180" font-family="Arial" font-size="52" fill="#111">Veterinary Clinic</text>
      <text x="60" y="260" font-family="Arial" font-size="34" fill="#444">Opening hours 9am - 6pm</text>
      <text x="60" y="330" font-family="Arial" font-size="34" fill="#444">Call 555-0134</text>
    </svg>`,
  );
  write('junk-text.jpg', await sharp(text).jpeg({ quality: 88 }).toBuffer());

  const userAdded = readdirSync(OUT_DIR).filter(
    (f) => /\.(jpe?g|png|webp)$/i.test(f) && !written.some((w) => w.file === f),
  );

  console.log(`\nWrote ${written.length} generated images to eval/images/\n`);
  for (const w of written) {
    console.log(
      `  ${w.file.padEnd(28)} ${String(Math.round(w.bytes / 1024)).padStart(5)} KB  ${w.sha}`,
    );
  }
  if (userAdded.length > 0) {
    console.log(
      `\n${userAdded.length} additional image(s) present that this script did not generate:`,
    );
    for (const f of userAdded) console.log(`  ${f}`);
    console.log('Add them to eval/cases.json to include them in the run.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
