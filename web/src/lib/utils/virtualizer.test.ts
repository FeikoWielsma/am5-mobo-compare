import { describe, it, expect } from 'vitest';
import { calculateVirtualWindow, getVisibleSlice } from './virtualizer';

describe('virtualizer: calculateVirtualWindow', () => {
  it('handles empty item list cleanly', () => {
    const res = calculateVirtualWindow({
      totalItems: 0,
      scrollTop: 100,
      viewportHeight: 800,
      rowHeight: 50
    });

    expect(res.startIndex).toBe(0);
    expect(res.endIndex).toBe(0);
    expect(res.paddingTop).toBe(0);
    expect(res.paddingBottom).toBe(0);
    expect(res.totalHeight).toBe(0);
    expect(res.virtualItems).toEqual([]);
  });

  it('calculates initial window at top with overscan', () => {
    // 100 items, each 50px high. Viewport = 500px (10 visible rows).
    const res = calculateVirtualWindow({
      totalItems: 100,
      scrollTop: 0,
      viewportHeight: 500,
      rowHeight: 50,
      overscan: 5
    });

    expect(res.startIndex).toBe(0);
    // 0 + 10 visible + 5 overscan = 15
    expect(res.endIndex).toBe(15);
    expect(res.paddingTop).toBe(0);
    expect(res.paddingBottom).toBe((100 - 15) * 50); // 4250
    expect(res.totalHeight).toBe(5000);
    expect(res.virtualItems.length).toBe(15);
  });

  it('calculates middle window with overscan above and below', () => {
    // Scroll at 1000px -> row 20. Viewport = 500px -> 10 rows visible.
    // overscan = 5.
    // startIndex = 20 - 5 = 15.
    // endIndex = 20 + 10 + 5 = 35.
    const res = calculateVirtualWindow({
      totalItems: 100,
      scrollTop: 1000,
      viewportHeight: 500,
      rowHeight: 50,
      overscan: 5
    });

    expect(res.startIndex).toBe(15);
    expect(res.endIndex).toBe(35);
    expect(res.paddingTop).toBe(15 * 50); // 750
    expect(res.paddingBottom).toBe((100 - 35) * 50); // 3250
    expect(res.paddingTop + (35 - 15) * 50 + res.paddingBottom).toBe(5000);
  });

  it('clamps cleanly when scrolled near the end of dataset', () => {
    // 100 items * 50px = 5000px.
    // Scroll at 4500px -> row 90. Viewport = 500px (10 rows).
    // endIndex clamped to 100.
    const res = calculateVirtualWindow({
      totalItems: 100,
      scrollTop: 4500,
      viewportHeight: 500,
      rowHeight: 50,
      overscan: 5
    });

    expect(res.startIndex).toBe(85);
    expect(res.endIndex).toBe(100);
    expect(res.paddingTop).toBe(85 * 50);
    expect(res.paddingBottom).toBe(0);
    expect(res.virtualItems.length).toBe(15);
  });

  it('accounts for containerOffsetTop before list starts', () => {
    // Toolbar / headers take 300px above table.
    // Scroll at 400px -> relativeScroll is 100px -> row 2.
    const res = calculateVirtualWindow({
      totalItems: 100,
      scrollTop: 400,
      viewportHeight: 500,
      rowHeight: 50,
      containerOffsetTop: 300,
      overscan: 2
    });

    // relative scroll: 100px. rawStartIndex: 2.
    // startIndex: max(0, 2 - 2) = 0.
    // endIndex: min(100, 2 + 10 + 2) = 14.
    expect(res.startIndex).toBe(0);
    expect(res.endIndex).toBe(14);
  });

  it('handles negative or zero overscan gracefully', () => {
    const res = calculateVirtualWindow({
      totalItems: 50,
      scrollTop: 500,
      viewportHeight: 500,
      rowHeight: 50,
      overscan: 0
    });

    // relative scroll = 500px -> row 10.
    // visible = 10 rows.
    expect(res.startIndex).toBe(10);
    expect(res.endIndex).toBe(20);
    expect(res.paddingTop).toBe(500);
    expect(res.paddingBottom).toBe((50 - 20) * 50);
  });

  it('handles dataset smaller than viewport', () => {
    const res = calculateVirtualWindow({
      totalItems: 5,
      scrollTop: 0,
      viewportHeight: 800,
      rowHeight: 50,
      overscan: 5
    });

    expect(res.startIndex).toBe(0);
    expect(res.endIndex).toBe(5);
    expect(res.paddingTop).toBe(0);
    expect(res.paddingBottom).toBe(0);
    expect(res.virtualItems.length).toBe(5);
  });
});

describe('virtualizer: getVisibleSlice', () => {
  it('correctly slices items matching virtual window', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const window = calculateVirtualWindow({
      totalItems: items.length,
      scrollTop: 40,
      viewportHeight: 40,
      rowHeight: 20,
      overscan: 1
    });

    const slice = getVisibleSlice(items, window);
    expect(slice).toEqual(items.slice(window.startIndex, window.endIndex));
  });

  it('returns empty array when source is empty', () => {
    const window = calculateVirtualWindow({
      totalItems: 0,
      scrollTop: 0,
      viewportHeight: 100,
      rowHeight: 20
    });
    expect(getVisibleSlice([], window)).toEqual([]);
  });
});
