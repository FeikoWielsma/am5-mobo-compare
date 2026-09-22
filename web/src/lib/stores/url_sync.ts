/**
 * Clean URL query string serialization and deserialization for:
 * - Search query string
 * - Multi-select column filters (brand, chipset, form_factor, etc.)
 * - Numeric range filters (price, m2, sata, phases min/max)
 * - Quick-filter boolean toggles
 * - Active dynamic columns
 * - Sort column & direction
 * - Compared board IDs
 *
 * Uses SvelteKit `goto` with `{ replaceState: true, noScroll: true, keepFocus: true }`.
 */

export interface RangeBounds {
  min: number | null;
  max: number | null;
}

export interface RangeFiltersMap {
  price?: RangeBounds;
  m2?: RangeBounds;
  sata?: RangeBounds;
  phases?: RangeBounds;
  [key: string]: RangeBounds | undefined;
}

export interface UrlSyncState {
  search?: string;
  filters?: Record<string, string[] | Set<string>>;
  rangeFilters?: RangeFiltersMap;
  quickFilters?: Record<string, boolean | string>;
  dynamicColumns?: string[];
  sort?: { column: string | null; direction: 'asc' | 'desc' };
  compare?: string[];
}

/**
 * Serializes application filter, range, sort, dynamic column, and compare state into URLSearchParams.
 */
export function serializeUrlParams(state: UrlSyncState): URLSearchParams {
  const params = new URLSearchParams();

  // 1. Search Query
  if (state.search && state.search.trim()) {
    params.set('q', state.search.trim());
  }

  // 2. Column Filters (e.g. brand=ASRock,MSI&chipset=X870E)
  if (state.filters) {
    for (const [col, val] of Object.entries(state.filters)) {
      const items = val instanceof Set ? Array.from(val) : Array.isArray(val) ? val : [];
      const cleanItems = items.map((x) => String(x).trim()).filter(Boolean);
      if (cleanItems.length > 0) {
        params.set(col, cleanItems.join(','));
      }
    }
  }

  // 3. Range Filters (e.g. price_min=200&price_max=400, m2_min=4)
  if (state.rangeFilters) {
    for (const [key, bounds] of Object.entries(state.rangeFilters)) {
      if (!bounds) continue;
      if (bounds.min != null && !isNaN(bounds.min)) {
        params.set(`${key}_min`, String(bounds.min));
      }
      if (bounds.max != null && !isNaN(bounds.max)) {
        params.set(`${key}_max`, String(bounds.max));
      }
    }
  }

  // 4. Quick Filters
  if (state.quickFilters) {
    for (const [key, val] of Object.entries(state.quickFilters)) {
      if (typeof val === 'boolean' && val) {
        params.set(key, '1');
      } else if (typeof val === 'string' && val && val !== 'all') {
        params.set(key, val);
      }
    }
  }

  // 5. Active Dynamic Columns
  if (state.dynamicColumns && state.dynamicColumns.length > 0) {
    params.set('cols', state.dynamicColumns.join(';'));
  }

  // 6. Sort Column & Direction
  if (state.sort && state.sort.column) {
    params.set('sort', state.sort.column);
    if (state.sort.direction === 'desc') {
      params.set('dir', 'desc');
    }
  }

  // 7. Compared Board IDs
  if (state.compare && state.compare.length > 0) {
    params.set('compare', state.compare.join(','));
  }

  return params;
}

/**
 * Deserializes URLSearchParams into structured UrlSyncState.
 */
export function deserializeUrlParams(input: URLSearchParams | string): UrlSyncState {
  const params = typeof input === 'string' ? new URLSearchParams(input.replace(/^\?/, '')) : input;
  const state: UrlSyncState = {
    filters: {},
    rangeFilters: {},
    quickFilters: {},
    dynamicColumns: [],
    compare: []
  };

  const reservedKeys = new Set([
    'q', 'sort', 'dir', 'order', 'sort_by', 'sort_order',
    'cols', 'columns', 'compare', 'compared',
    'pcie5', 'usb4', 'wifi7', 'x8x8', 'whiteTheme', 'blackTheme', 'backConnect', 'twoDimm', 'colorTheme'
  ]);

  for (const [key, val] of params.entries()) {
    if (!val) continue;

    // Search query
    if (key === 'q') {
      state.search = val;
      continue;
    }

    // Dynamic Columns (semicolon or comma delimited)
    if (key === 'cols' || key === 'columns') {
      const sep = val.includes(';') ? ';' : ',';
      state.dynamicColumns = val.split(sep).map((s) => s.trim()).filter(Boolean);
      continue;
    }

    // Sort Column & Direction
    if (key === 'sort' || key === 'sort_by') {
      const dirVal = params.get('dir') || params.get('order') || params.get('sort_order') || 'asc';
      state.sort = {
        column: val,
        direction: dirVal.toLowerCase() === 'desc' ? 'desc' : 'asc'
      };
      continue;
    }
    if (key === 'dir' || key === 'order' || key === 'sort_order') {
      continue; // Handled with sort
    }

    // Compared Board IDs
    if (key === 'compare' || key === 'compared') {
      state.compare = val.split(',').map((s) => s.trim()).filter(Boolean);
      continue;
    }

    // Range Filters (*_min, *_max)
    const minMatch = key.match(/^([a-zA-Z0-9_]+)_min$/);
    if (minMatch) {
      const field = minMatch[1];
      const num = parseFloat(val);
      if (!isNaN(num)) {
        state.rangeFilters![field] = state.rangeFilters![field] || { min: null, max: null };
        state.rangeFilters![field]!.min = num;
      }
      continue;
    }

    const maxMatch = key.match(/^([a-zA-Z0-9_]+)_max$/);
    if (maxMatch) {
      const field = maxMatch[1];
      const num = parseFloat(val);
      if (!isNaN(num)) {
        state.rangeFilters![field] = state.rangeFilters![field] || { min: null, max: null };
        state.rangeFilters![field]!.max = num;
      }
      continue;
    }

    // Quick Filters
    if (['pcie5', 'usb4', 'wifi7', 'x8x8', 'whiteTheme', 'blackTheme', 'backConnect', 'twoDimm'].includes(key)) {
      state.quickFilters![key] = val === '1' || val === 'true';
      continue;
    }
    if (key === 'colorTheme') {
      state.quickFilters!.colorTheme = val;
      continue;
    }

    // Standard Multi-Select Column Filters
    if (!reservedKeys.has(key)) {
      const items = val.split(',').map((s) => s.trim()).filter(Boolean);
      if (items.length > 0) {
        state.filters![key] = items;
      }
    }
  }

  return state;
}

/**
 * Synchronizes filter state to the browser URL using SvelteKit `goto` with:
 * `{ replaceState: true, noScroll: true, keepFocus: true }`.
 */
export async function syncStateToUrl(
  state: UrlSyncState,
  options?: {
    replaceState?: boolean;
    noScroll?: boolean;
    keepFocus?: boolean;
    pathname?: string;
  }
): Promise<void> {
  if (typeof window === 'undefined') return;

  const params = serializeUrlParams(state);
  const paramStr = params.toString();
  const currentPath = options?.pathname || window.location.pathname;
  const targetUrl = paramStr ? `${currentPath}?${paramStr}` : currentPath;

  // Prevent redundant navigation if URL is unchanged
  if (window.location.pathname + window.location.search === targetUrl) {
    return;
  }

  try {
    const { goto } = await import('$app/navigation');
    await goto(targetUrl, {
      replaceState: options?.replaceState ?? true,
      noScroll: options?.noScroll ?? true,
      keepFocus: options?.keepFocus ?? true
    });
  } catch {
    // In test or non-SvelteKit browser contexts, fallback to HTML5 History API
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', targetUrl);
    }
  }
}
