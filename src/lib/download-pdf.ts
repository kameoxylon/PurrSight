/**
 * Build a downloadable PDF of an assessment.
 *
 * The report is generated from the `Assessment` object rather than captured
 * from the DOM, which is what makes the text real text — searchable and
 * selectable — instead of a screenshot. It also means the on-screen
 * interactive affordances (the "find a vet near me" link and its map) are
 * absent by construction rather than filtered out.
 *
 * Section order intentionally mirrors the page: score, recommendation,
 * features. Caveats are split the same way the page splits them (splitCaveats
 * in ./ui) — the scale's scope rides under the score as a quiet note, while
 * caveats about this photo sit with the features they name.
 */
import type { Assessment, ActionUnitAssessment } from './contract';
import { BAND_STYLES, scoreLabel, AU_RELIABILITY, splitCaveats } from './ui';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Code points representable in WinAnsi, the encoding the PDF standard fonts
 * use. `drawText` throws on anything outside it rather than skipping, and
 * action-unit `evidence` is free-form model output that can contain anything —
 * emoji, smart punctuation, other scripts — so everything is filtered through
 * this before being drawn.
 */
const WINANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

function encodable(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true;
  return WINANSI_EXTRA.has(codePoint);
}

/** Drop anything the standard fonts cannot draw, then tidy the whitespace. */
function sanitize(text: string): string {
  let out = '';
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp !== undefined && encodable(cp)) out += char;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export async function buildResultPdf(assessment: Assessment): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  doc.setTitle('PurrSight - Feline Grimace Scale assessment');
  doc.setSubject('An awareness aid. Not a diagnostic tool.');
  doc.setCreator('PurrSight');

  const ink = rgb(0.11, 0.11, 0.13);
  const muted = rgb(0.42, 0.42, 0.47);
  const line = rgb(0.85, 0.85, 0.88);

  const { scope: scopeCaveats, photo: photoCaveats } = splitCaveats(assessment.caveats);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function wrap(text: string, font: typeof body, size: number, width: number): string[] {
    const words = sanitize(text).split(' ').filter(Boolean);
    if (words.length === 0) return [];
    const lines: string[] = [];
    let current = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
    return lines;
  }

  const disclaimer =
    'PurrSight is not a diagnostic tool and is not a substitute for veterinary care.';
  const provenance =
    `Assessed with ${assessment.meta.model} - prompt ${assessment.meta.promptVersion} - ` +
    `${assessment.meta.samples} model runs. The Feline Grimace Scale is (c) Universite de Montreal.`;

  const footerLines = [
    ...wrap(disclaimer, italic, 7.5, CONTENT_W),
    ...wrap(provenance, italic, 7.5, CONTENT_W),
  ];
  /**
   * The footer is drawn on every page after the body is laid out, so the body
   * must stop above it. Without this the last lines of a page render on top of
   * the disclaimer.
   */
  const BOTTOM_LIMIT = MARGIN + footerLines.length * 9.5 + 12;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  /** Start a new page when the next block would run into the footer. */
  const ensure = (needed: number) => {
    if (y - needed < BOTTOM_LIMIT) newPage();
  };

  function paragraph(
    text: string,
    opts: { font?: typeof body; size?: number; color?: typeof ink; indent?: number; gap?: number } = {},
  ) {
    const font = opts.font ?? body;
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const leading = size * 1.45;
    for (const lineText of wrap(text, font, size, CONTENT_W - indent)) {
      ensure(leading);
      page.drawText(lineText, {
        x: MARGIN + indent,
        y: y - size,
        size,
        font,
        color: opts.color ?? ink,
      });
      y -= leading;
    }
    y -= opts.gap ?? 0;
  }

  function heading(text: string) {
    ensure(34);
    y -= 10;
    page.drawText(sanitize(text), { x: MARGIN, y: y - 11, size: 11, font: bold, color: ink });
    y -= 17;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.75,
      color: line,
    });
    y -= 12;
  }

  /* ---- Title ------------------------------------------------------------ */
  page.drawText('PurrSight', { x: MARGIN, y: y - 20, size: 20, font: bold, color: ink });
  y -= 26;
  page.drawText('Feline Grimace Scale assessment', {
    x: MARGIN,
    y: y - 12,
    size: 12,
    font: body,
    color: muted,
  });
  y -= 18;
  const generated = new Date().toLocaleString(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  page.drawText(sanitize(`Generated ${generated}`), {
    x: MARGIN,
    y: y - 9,
    size: 9,
    font: body,
    color: muted,
  });
  y -= 22;

  /* ---- Urgent banner ---------------------------------------------------- */
  if (assessment.aboveThreshold) {
    const heading = 'This score suggests your cat may be in pain';
    // Wrap only the body copy. Wrapping the heading in with it and slicing the
    // first line off drops whatever words shared that line with the heading.
    const lines = wrap(
      'The signs here are above the threshold where the original study recommended pain ' +
        'relief. If this matches how your cat is behaving, please contact a veterinarian.',
      body,
      10,
      CONTENT_W - 24,
    );
    const boxH = 22 + (lines.length + 1) * 14.5;
    ensure(boxH + 10);
    page.drawRectangle({
      x: MARGIN,
      y: y - boxH,
      width: CONTENT_W,
      height: boxH,
      color: rgb(1, 0.92, 0.93),
      borderColor: rgb(0.89, 0.35, 0.42),
      borderWidth: 1,
    });
    let ty = y - 16;
    page.drawText(heading, {
      x: MARGIN + 12,
      y: ty,
      size: 10.5,
      font: bold,
      color: rgb(0.65, 0.12, 0.2),
    });
    ty -= 15;
    for (const lineText of lines) {
      page.drawText(lineText, { x: MARGIN + 12, y: ty, size: 10, font: body, color: ink });
      ty -= 14.5;
    }
    y -= boxH + 14;
  }

  /* ---- 1. Score ---------------------------------------------------------- */
  heading('Score');
  const band = BAND_STYLES[assessment.band];
  const pct = Math.round(assessment.normalizedScore * 100);

  ensure(56);
  page.drawText(`${assessment.rawScore} of ${assessment.maxPossible}`, {
    x: MARGIN,
    y: y - 22,
    size: 22,
    font: bold,
    color: ink,
  });
  const [br, bg, bb] = hexToRgb(band.solid);
  page.drawText(sanitize(band.label), {
    x: MARGIN + 92,
    y: y - 19,
    size: 12,
    font: bold,
    color: rgb(br, bg, bb),
  });
  y -= 32;

  const barW = CONTENT_W;
  const barH = 8;
  page.drawRectangle({ x: MARGIN, y: y - barH, width: barW, height: barH, color: line });
  page.drawRectangle({
    x: MARGIN,
    y: y - barH,
    width: Math.max(2, barW * assessment.normalizedScore),
    height: barH,
    color: rgb(br, bg, bb),
  });
  y -= barH + 12;

  paragraph(
    `${pct}% of the maximum possible score, based on the ${assessment.scorableCount} of ` +
      `${assessment.actionUnits.length} facial features that could be scored from this photo. ` +
      `The study that validated this scale recommended pain relief above 39%.`,
    { size: 9.5, color: muted, gap: 4 },
  );

  for (const caveat of scopeCaveats) {
    paragraph(caveat.message, { font: italic, size: 8.5, color: muted, gap: 4 });
  }

  /* ---- 2. What we recommend ---------------------------------------------- */
  heading('What we recommend');
  paragraph(assessment.recommendation, { size: 10, gap: 6 });

  /* ---- 3. Facial features ------------------------------------------------ */
  heading('Facial features we looked at');
  for (const caveat of photoCaveats) {
    paragraph(`- ${caveat.message}`, { size: 9.5, color: muted, indent: 6, gap: 3 });
  }
  for (const au of assessment.actionUnits) {
    drawActionUnit(au, assessment.meta.samples);
  }

  function drawActionUnit(au: ActionUnitAssessment, samples: number) {
    const evidenceText = au.score === null ? (au.notScorableReason ?? 'Not assessable.') : au.evidence;
    const evidenceLines = wrap(evidenceText, body, 9.5, CONTENT_W - 12);
    ensure(30 + evidenceLines.length * 13);

    page.drawText(sanitize(au.label), { x: MARGIN, y: y - 10, size: 10, font: bold, color: ink });
    const scoreText = sanitize(scoreLabel(au.score));
    page.drawText(scoreText, {
      x: PAGE_W - MARGIN - body.widthOfTextAtSize(scoreText, 9.5),
      y: y - 10,
      size: 9.5,
      font: body,
      color: au.score === null ? muted : ink,
    });
    y -= 15;

    for (const lineText of evidenceLines) {
      page.drawText(lineText, { x: MARGIN + 12, y: y - 9, size: 9.5, font: body, color: ink });
      y -= 13;
    }

    const reliability = Math.round(AU_RELIABILITY[au.id] * 100);
    const note =
      au.score === null
        ? `Not scored - ${samples} of ${samples} runs agreed it was not assessable.`
        : `${au.agreement} of ${samples} model runs agreed. Scale reliability for this feature: ${reliability}%.`;
    page.drawText(sanitize(note), { x: MARGIN + 12, y: y - 8, size: 8, font: italic, color: muted });
    y -= 18;
  }

  /* ---- Footer on every page --------------------------------------------- */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    let fy = MARGIN + (footerLines.length - 1) * 9.5;
    p.drawLine({
      start: { x: MARGIN, y: fy + 14 },
      end: { x: PAGE_W - MARGIN, y: fy + 14 },
      thickness: 0.5,
      color: line,
    });
    for (const lineText of footerLines) {
      p.drawText(lineText, { x: MARGIN, y: fy, size: 7.5, font: italic, color: muted });
      fy -= 9.5;
    }
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: PAGE_W - MARGIN - italic.widthOfTextAtSize(label, 7.5),
      y: PAGE_H - MARGIN + 8,
      size: 7.5,
      font: italic,
      color: muted,
    });
  });

  // useObjectStreams:false keeps the page text in plain content streams, which
  // keeps extraction (and `grep`) working in simple readers.
  return doc.save({ useObjectStreams: false });
}

/** Build the PDF and hand it to the browser as a download. */
export async function downloadResultPdf(assessment: Assessment): Promise<void> {
  const bytes = await buildResultPdf(assessment);
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.download = `purrsight-result-${new Date().toISOString().slice(0, 10)}.pdf`;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
