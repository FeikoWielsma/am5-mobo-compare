import { analyzeLaneSharing } from './bottleneck_analyzer';

/**
 * Renders a crisp, dark-mode comparison scorecard card onto an HTML5 canvas.
 * Uses 2x scaling for high-DPI retina display quality.
 */
export function renderComparisonCanvas(
  boards: any[],
  scorecardRows: { label: string; get: (b: any) => string }[] = [],
  customCanvas?: HTMLCanvasElement
): HTMLCanvasElement | null {
  if (typeof document === 'undefined' && !customCanvas) return null;
  const canvas = customCanvas || document.createElement('canvas');
  if (!boards || boards.length === 0) return canvas;

  const colWidth = 240;
  const labelColWidth = 200;
  const paddingX = 32;
  const paddingY = 28;

  const totalWidth = paddingX * 2 + labelColWidth + boards.length * colWidth;

  const headerHeight = 76;
  const boardHeaderHeight = 82;
  const rowHeight = 44;
  const footerHeight = 46;

  // Filter out any unwanted scorecard rows or format them cleanly
  const rowsToRender = scorecardRows.filter((r) => r.label && r.label !== 'Notes');
  const totalHeight = paddingY * 2 + headerHeight + boardHeaderHeight + (rowsToRender.length * rowHeight) + footerHeight;

  // High-DPI 2x scale
  const scale = 2;
  canvas.width = totalWidth * scale;
  canvas.height = totalHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Outer border & card background
  const cardX = paddingX;
  const cardY = paddingY;
  const cardW = totalWidth - paddingX * 2;
  const cardH = totalHeight - paddingY * 2;

  ctx.fillStyle = '#161b22';
  roundRect(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.fill();

  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1.5;
  roundRect(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.stroke();

  // Top Banner
  ctx.fillStyle = '#1c2128';
  roundRectTop(ctx, cardX, cardY, cardW, headerHeight, 12);
  ctx.fill();

  ctx.strokeStyle = '#30363d';
  ctx.beginPath();
  ctx.moveTo(cardX, cardY + headerHeight);
  ctx.lineTo(cardX + cardW, cardY + headerHeight);
  ctx.stroke();

  // Banner Title
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('AM5 Motherboard Comparison', cardX + 24, cardY + 36);

  ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#8b949e';
  ctx.fillText(`Side-by-side spec comparison of ${boards.length} models • am5-mobo-compare`, cardX + 24, cardY + 58);

  // Column Headers
  const startY = cardY + headerHeight;

  // Row header label title
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#8b949e';
  ctx.fillText('SPECIFICATION', cardX + 20, startY + 60);

  // Vertical divider between label column and first board
  const firstColDividerX = cardX + labelColWidth;
  ctx.strokeStyle = '#30363d';
  ctx.beginPath();
  ctx.moveTo(firstColDividerX, startY);
  ctx.lineTo(firstColDividerX, startY + boardHeaderHeight + (rowsToRender.length * rowHeight));
  ctx.stroke();

  // Draw each board header
  boards.forEach((board, index) => {
    const colX = cardX + labelColWidth + index * colWidth;

    // Divider after each column except last
    if (index > 0) {
      ctx.strokeStyle = '#30363d';
      ctx.beginPath();
      ctx.moveTo(colX, startY);
      ctx.lineTo(colX, startY + boardHeaderHeight + (rowsToRender.length * rowHeight));
      ctx.stroke();
    }

    // Brand
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText((board.brand || '').toUpperCase(), colX + 16, startY + 28);

    // Model name
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#ffffff';
    const modelText = truncateText(ctx, board.model || '', colWidth - 32);
    ctx.fillText(modelText, colX + 16, startY + 48);

    // Badges (Chipset + Form Factor)
    const chipset = board.chipset || 'AM5';
    const ff = board.form_factor || 'ATX';
    drawBadge(ctx, chipset, colX + 16, startY + 60, '#0d6efd', '#ffffff');
    const csWidth = ctx.measureText(chipset).width + 12;
    drawBadge(ctx, ff, colX + 16 + csWidth + 6, startY + 60, '#334155', '#cbd5e1');
  });

  // Divider below board headers
  const headerBottomY = startY + boardHeaderHeight;
  ctx.strokeStyle = '#30363d';
  ctx.beginPath();
  ctx.moveTo(cardX, headerBottomY);
  ctx.lineTo(cardX + cardW, headerBottomY);
  ctx.stroke();

  // Render spec rows
  let currentY = headerBottomY;
  rowsToRender.forEach((row, rIndex) => {
    // Alternating zebra row background
    if (rIndex % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
      ctx.fillRect(cardX, currentY, cardW, rowHeight);
    }

    // Row Label
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(row.label, cardX + 20, currentY + 26);

    // Cell values for each board
    boards.forEach((board, bIndex) => {
      const colX = cardX + labelColWidth + bIndex * colWidth;
      const rawVal = row.get(board);
      const cleanVal = cleanCellText(rawVal);

      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#e6edf3';
      const cellText = truncateText(ctx, cleanVal, colWidth - 32);
      ctx.fillText(cellText, colX + 16, currentY + 26);
    });

    currentY += rowHeight;

    // Horizontal divider
    ctx.strokeStyle = '#21262d';
    ctx.beginPath();
    ctx.moveTo(cardX, currentY);
    ctx.lineTo(cardX + cardW, currentY);
    ctx.stroke();
  });

  // Footer
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#8b949e';
  const now = new Date().toISOString().split('T')[0];
  ctx.fillText(`Generated on ${now} • AM5 Motherboard Directory & Comparison Tool`, cardX + 24, currentY + 28);

  return canvas;
}

function cleanCellText(val: string): string {
  if (!val || val === '-') return '-';
  // Strip HTML tags and excessive whitespace
  return val.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bgColor: string,
  textColor: string
) {
  ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const textWidth = ctx.measureText(text).width;
  const padX = 6;
  const padY = 3;
  const badgeH = 16;
  const badgeW = textWidth + padX * 2;

  ctx.fillStyle = bgColor;
  roundRect(ctx, x, y, badgeW, badgeH, 4);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.fillText(text, x + padX, y + 12);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function roundRectTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * Downloads a canvas or data URL as a PNG file.
 */
export function downloadImage(canvas: HTMLCanvasElement, filename: string = 'am5_comparison.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Copies a canvas image directly to the system clipboard as PNG blob.
 */
export async function copyImageToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.clipboard || !window.ClipboardItem) {
    return false;
  }
  return new Promise<boolean>((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob
          })
        ]);
        resolve(true);
      } catch (err) {
        console.warn('Clipboard image write failed:', err);
        resolve(false);
      }
    }, 'image/png');
  });
}
