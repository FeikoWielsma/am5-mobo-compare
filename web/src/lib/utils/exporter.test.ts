import { describe, it, expect } from 'vitest';
import {
  escapeMarkdownCell,
  escapeCSVCell,
  generateMarkdownTable,
  generateCSV
} from './exporter';

describe('Exporter primitives', () => {
  it('escapes pipes and converts newlines in markdown cells', () => {
    expect(escapeMarkdownCell('16x | 8x/8x')).toBe('16x \\| 8x/8x');
    expect(escapeMarkdownCell('Line 1\nLine 2')).toBe('Line 1<br>Line 2');
    expect(escapeMarkdownCell(null)).toBe('-');
  });

  it('escapes quotes and wraps commas in CSV cells', () => {
    expect(escapeCSVCell('ATX')).toBe('ATX');
    expect(escapeCSVCell('ATX, Micro-ATX')).toBe('"ATX, Micro-ATX"');
    expect(escapeCSVCell('He said "Hello"')).toBe('"He said ""Hello"""');
  });
});

describe('generateMarkdownTable', () => {
  const sampleBoards = [
    {
      id: 'asrock-x870e',
      brand: 'ASRock',
      model: 'Taichi OCF',
      chipset: 'X870E',
      form_factor: 'ATX',
      price_usd: 499
    },
    {
      id: 'asus-b650',
      brand: 'ASUS',
      model: 'TUF GAMING',
      chipset: 'B650',
      form_factor: 'mATX',
      price_usd: 179
    }
  ];

  it('generates a clean markdown table header and specs', () => {
    const md = generateMarkdownTable(sampleBoards, [
      { label: 'VRM', get: () => '95/100' }
    ]);

    expect(md).toContain('| Specification | ASRock Taichi OCF | ASUS TUF GAMING |');
    expect(md).toContain('| :--- | :--- | :--- |');
    expect(md).toContain('| Chipset | X870E | B650 |');
    expect(md).toContain('| MSRP | $499 | $179 |');
    expect(md).toContain('| **Score: VRM** | 95/100 | 95/100 |');
  });
});

describe('generateCSV', () => {
  const sampleBoards = [
    {
      id: 'board-1',
      brand: 'MSI',
      model: 'Tomahawk',
      chipset: 'B650',
      form_factor: 'ATX',
      price_usd: 219
    }
  ];

  it('generates CSV with UTF-8 BOM and correct columns', () => {
    const csv = generateCSV(sampleBoards);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Specification,MSI Tomahawk');
    expect(csv).toContain('Chipset,B650');
    expect(csv).toContain('Form Factor,ATX');
  });
});
