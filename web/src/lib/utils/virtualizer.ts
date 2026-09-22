export interface VirtualizerOptions {
  totalItems: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  containerOffsetTop?: number;
  overscan?: number;
}

export interface VirtualItem {
  index: number;
  offsetTop: number;
}

export interface VirtualWindow {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
  visibleCount: number;
  virtualItems: VirtualItem[];
}

/**
 * Calculates the visible row start/end window based on scroll position,
 * row height, and viewport height with overscan buffers.
 * Ensures zero DOM lag during scrolling over large tabular datasets.
 */
export function calculateVirtualWindow(options: VirtualizerOptions): VirtualWindow {
  const {
    totalItems,
    scrollTop: rawScrollTop,
    viewportHeight: rawViewportHeight,
    rowHeight: rawRowHeight,
    containerOffsetTop = 0,
    overscan = 5
  } = options;

  if (totalItems <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
      visibleCount: 0,
      virtualItems: []
    };
  }

  const rowHeight = Math.max(1, rawRowHeight);
  const viewportHeight = Math.max(0, rawViewportHeight);
  const scrollTop = Math.max(0, rawScrollTop);
  const safeOverscan = Math.max(0, overscan);
  const totalHeight = totalItems * rowHeight;

  // Relative scroll inside the virtualized table list
  const relativeScroll = Math.max(0, scrollTop - containerOffsetTop);

  // How many items fit in the viewport
  const visibleCount = Math.ceil(viewportHeight / rowHeight);

  // Raw start index before overscan
  const rawStartIndex = Math.floor(relativeScroll / rowHeight);

  // Clamped indices with overscan buffer
  const startIndex = Math.max(0, Math.min(totalItems - 1, rawStartIndex - safeOverscan));
  const endIndex = Math.min(totalItems, Math.max(startIndex, rawStartIndex + visibleCount + safeOverscan));

  const paddingTop = startIndex * rowHeight;
  const paddingBottom = Math.max(0, (totalItems - endIndex) * rowHeight);

  const virtualItems: VirtualItem[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    virtualItems.push({
      index: i,
      offsetTop: i * rowHeight
    });
  }

  return {
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    totalHeight,
    visibleCount,
    virtualItems
  };
}

/**
 * Returns the sliced subset of items corresponding to the virtual window.
 */
export function getVisibleSlice<T>(items: T[], window: VirtualWindow): T[] {
  if (!items || items.length === 0) return [];
  return items.slice(window.startIndex, window.endIndex);
}
