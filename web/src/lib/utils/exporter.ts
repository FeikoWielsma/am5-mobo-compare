import { safeString } from '$lib/types';

export interface ExportRow {
  label: string;
  name?: string;
  category?: string;
  get?: (b: any) => any;
}

export interface ExportSection {
  id: string;
  title: string;
  rows?: ExportRow[];
  children?: {
    id: string;
    title: string;
    rows?: ExportRow[];
  }[];
}

/**
 * Escapes a string for inclusion in a Markdown table cell.
 * Pipes '|' are escaped and newlines are replaced with '<br>'.
 */
export function escapeMarkdownCell(val: unknown): string {
  const str = safeString(val);
  if (!str) return '-';
  return str.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/**
 * Escapes a string for inclusion in an RFC-4180 CSV cell.
 */
export function escapeCSVCell(val: unknown): string {
  const str = safeString(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a Reddit/GitHub compliant Markdown comparison table.
 */
export function generateMarkdownTable(
  boards: any[],
  scorecardRows: { label: string; get: (b: any) => any }[] = [],
  layoutSections: ExportSection[] = [],
  resolveValue: (b: any, row: ExportRow) => any = (b, r) => b.specs?.[r.name || ''] ?? '-'
): string {
  if (!boards || boards.length === 0) return '';

  const headers = ['Specification', ...boards.map((b) => `${b.brand || ''} ${b.model || b.id || 'Board'}`.trim())];
  const divider = headers.map(() => ':---');

  const lines: string[] = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${divider.join(' | ')} |`);

  // Quick summary specs
  const basicSpecs = [
    { label: 'Chipset', get: (b: any) => b.chipset },
    { label: 'Form Factor', get: (b: any) => b.form_factor },
    { label: 'MSRP', get: (b: any) => b.price_usd ? `$${b.price_usd}` : b.specs?.General?.Market?.['A-MSRP (USD)'] ?? '-' }
  ];

  basicSpecs.forEach((spec) => {
    const row = [spec.label, ...boards.map((b) => escapeMarkdownCell(spec.get(b)))];
    lines.push(`| ${row.join(' | ')} |`);
  });

  // Scorecard section
  if (scorecardRows && scorecardRows.length > 0) {
    scorecardRows.forEach((sc) => {
      const row = [`**Score: ${sc.label}**`, ...boards.map((b) => escapeMarkdownCell(sc.get(b)))];
      lines.push(`| ${row.join(' | ')} |`);
    });
  }

  // Layout sections
  for (const section of layoutSections) {
    if (section.id === 'scorecard') continue;

    for (const r of section.rows || []) {
      if (r.name === 'io_image' || r.name === 'website' || r.name === 'io_image_link') continue;
      const cleanLabel = r.label.replace(/<[^>]+>/g, '').trim();
      const row = [cleanLabel, ...boards.map((b) => escapeMarkdownCell(resolveValue(b, r)))];
      lines.push(`| ${row.join(' | ')} |`);
    }

    for (const sub of section.children || []) {
      for (const r of sub.rows || []) {
        if (r.name === 'io_image' || r.name === 'website' || r.name === 'io_image_link') continue;
        const cleanLabel = r.label.replace(/<[^>]+>/g, '').trim();
        const row = [cleanLabel, ...boards.map((b) => escapeMarkdownCell(resolveValue(b, r)))];
        lines.push(`| ${row.join(' | ')} |`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generates an RFC-4180 CSV string representing the comparison table with UTF-8 BOM.
 */
export function generateCSV(
  boards: any[],
  scorecardRows: { label: string; get: (b: any) => any }[] = [],
  layoutSections: ExportSection[] = [],
  resolveValue: (b: any, row: ExportRow) => any = (b, r) => b.specs?.[r.name || ''] ?? '-'
): string {
  if (!boards || boards.length === 0) return '';

  const headers = ['Specification', ...boards.map((b) => `${b.brand || ''} ${b.model || b.id || 'Board'}`.trim())];
  const lines: string[] = [];
  lines.push(headers.map(escapeCSVCell).join(','));

  // Basic specs
  const basicSpecs = [
    { label: 'Chipset', get: (b: any) => b.chipset },
    { label: 'Form Factor', get: (b: any) => b.form_factor },
    { label: 'MSRP', get: (b: any) => b.price_usd ? `$${b.price_usd}` : b.specs?.General?.Market?.['A-MSRP (USD)'] ?? '-' }
  ];

  basicSpecs.forEach((spec) => {
    const row = [spec.label, ...boards.map((b) => escapeCSVCell(spec.get(b)))];
    lines.push(row.join(','));
  });

  // Scorecards
  if (scorecardRows && scorecardRows.length > 0) {
    scorecardRows.forEach((sc) => {
      const cleanScLabel = sc.label.replace(/<[^>]+>/g, '').trim();
      const row = [`Score: ${cleanScLabel}`, ...boards.map((b) => escapeCSVCell(sc.get(b)))];
      lines.push(row.join(','));
    });
  }

  // Layout sections
  for (const section of layoutSections) {
    if (section.id === 'scorecard') continue;

    for (const r of section.rows || []) {
      if (r.name === 'io_image' || r.name === 'website' || r.name === 'io_image_link') continue;
      const cleanLabel = r.label.replace(/<[^>]+>/g, '').trim();
      const row = [cleanLabel, ...boards.map((b) => escapeCSVCell(resolveValue(b, r)))];
      lines.push(row.join(','));
    }

    for (const sub of section.children || []) {
      for (const r of sub.rows || []) {
        if (r.name === 'io_image' || r.name === 'website' || r.name === 'io_image_link') continue;
        const cleanLabel = r.label.replace(/<[^>]+>/g, '').trim();
        const row = [cleanLabel, ...boards.map((b) => escapeCSVCell(resolveValue(b, r)))];
        lines.push(row.join(','));
      }
    }
  }

  // Prepend UTF-8 BOM
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Trigger client-side file download in browser.
 */
export function downloadFile(filename: string, content: string, mimeType: string = 'text/csv;charset=utf-8;'): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
