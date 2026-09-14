/**
 * Render a DOM node to a PNG and trigger a download. html-to-image is imported
 * dynamically so it only loads in the browser when the user clicks Download —
 * keeps it out of the initial bundle.
 */
export async function downloadResultImage(node: HTMLElement | null): Promise<void> {
  if (!node) return;
  const { toPng } = await import('html-to-image');
  // Fill transparent gaps with the current page background (light or dark).
  const backgroundColor = getComputedStyle(document.body).backgroundColor;
  const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor, cacheBust: true });

  const link = document.createElement('a');
  link.download = `purrsight-result-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = dataUrl;
  link.click();
}
