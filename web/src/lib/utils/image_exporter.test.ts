import { describe, it, expect } from 'vitest';
import { renderComparisonCanvas, downloadImage } from './image_exporter';

describe('image_exporter', () => {
  it('returns null or canvas gracefully in non-DOM environments', () => {
    const canvas = renderComparisonCanvas([], []);
    expect(canvas === null || typeof canvas === 'object').toBe(true);
  });

  it('renders onto provided mock canvas', () => {
    const mockCtx = {
      scale: () => {},
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arcTo: () => {},
      closePath: () => {},
      fillText: () => {},
      measureText: () => ({ width: 50 })
    };
    const mockCanvas = {
      getContext: () => mockCtx,
      width: 0,
      height: 0,
      toDataURL: () => 'data:image/png;base64,mock'
    } as unknown as HTMLCanvasElement;

    const res = renderComparisonCanvas(
      [{ brand: 'ASUS', model: 'ROG Crosshair X870E Hero', chipset: 'X870E', form_factor: 'ATX' }],
      [{ label: 'LAN Controller', get: () => 'Realtek 5GbE' }],
      mockCanvas
    );

    expect(res).toBe(mockCanvas);
  });

  it('provides downloadImage utility', () => {
    expect(typeof downloadImage).toBe('function');
  });
});
