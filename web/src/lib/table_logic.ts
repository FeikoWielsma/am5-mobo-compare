import { safeString, safeNumber, safeArray, type Motherboard, type ScorecardSpecs } from './types';

export { safeString, safeNumber, safeArray, type Motherboard, type ScorecardSpecs };

export interface DynamicColumn {
  id: string; // e.g. "dyn1", "dyn2", etc.
  key: string; // e.g. "General|Market|A-MSRP (USD)"
  label: string; // e.g. "A-MSRP (USD)"
  category?: string; // e.g. "General > Market"
}

export interface SortState {
  column: string | null; // e.g. "brand", "chipset", "dyn1"
  direction: 'asc' | 'desc';
}

/**
 * Read a value out of a motherboard record by path.
 * Supports pipe or dot notation, root first then specs.
 */
export function getNestedValue(obj: any, path: string): string {
  if (!path) return '-';

  const tryAccess = (target: any, p: string): any => {
    if (!target) return undefined;
    if (p in target) return target[p];

    const sep = p.includes('|') ? '|' : '.';
    const parts = p.split(sep);
    let current = target;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  };

  let val = tryAccess(obj, path);
  if (val !== undefined && val !== null && val !== '') return String(val);

  if (obj && obj.specs) {
    val = tryAccess(obj.specs, path);
    if (val !== undefined && val !== null && val !== '') return String(val);
  }

  // Also check obj.typed for common standard paths
  if (obj && obj.typed) {
    if (path.includes('A-MSRP') && obj.typed.price_usd != null) return `$${obj.typed.price_usd}`;
    if (path.includes('LAN') && obj.typed.lan_controllers) return String(obj.typed.lan_controllers);
    if (path.includes('Codec') && obj.typed.audio_codec) return String(obj.typed.audio_codec);
    if (path.includes('Wireless') && obj.typed.wireless) return String(obj.typed.wireless);
  }

  return '-';
}

export function chipsetBadgeClass(chipset: string): string {
  if (!chipset) return 'bg-secondary';
  const clean = chipset.toLowerCase().replace(/[ ()]/g, '');
  return `badge-chipset badge-chipset-${clean}`;
}

export function formFactorBadgeClass(formFactor: string): string {
  if (!formFactor) return 'bg-secondary';
  let normalized = formFactor.toLowerCase();
  normalized = normalized.replace(/atx-b$/i, 'atx');
  normalized = normalized.replace(/bkb itx/i, 'mini-itx');
  normalized = normalized.replace(/[μu]-atx-b/i, 'matx');
  normalized = normalized.replace(/[μu]-atx/i, 'matx');
  normalized = normalized.replace(/e-atx/i, 'eatx');
  const clean = normalized.replace(/[ -]/g, '');
  return `badge-ff badge-ff-${clean}`;
}

export interface QuickFilters {
  pcie5?: boolean;
  usb4?: boolean;
  wifi7?: boolean;
  x8x8?: boolean;
  whiteTheme?: boolean;
  blackTheme?: boolean;
  backConnect?: boolean;
  twoDimm?: boolean;
  colorTheme?: string;
}

/**
 * Check if a motherboard has a white or silver theme.
 */
export function matchesWhiteTheme(mobo: any): boolean {
  const c = mobo?.specs?.Color || {};
  const hs = String(c?.Heatsink?.Primary || '').toLowerCase();
  const pcb = String(c?.PCB?.Primary || '').toLowerCase();
  const mod = String(mobo?.model || '').toLowerCase();
  return ['white', 'silver', 'ice', 'snow', 'glacial', 'aero'].some(
    (w) => hs.includes(w) || pcb.includes(w) || mod.includes(w)
  );
}

/**
 * Check if a motherboard has a true stealth / all-black / monochrome theme.
 * Requires heatsinks to be Black or Dark Gray, PCB to be Black,
 * and accents to be neutral (-, Black, Dark Gray, Gray, None).
 */
export function matchesBlackTheme(mobo: any): boolean {
  if (matchesWhiteTheme(mobo)) return false;
  const c = mobo?.specs?.Color || {};
  const hs = String(c?.Heatsink?.Primary || '').toLowerCase().trim();
  const pcb = String(c?.PCB?.Primary || '').toLowerCase().trim();
  const hsAcc = String(c?.Heatsink?.['Text/Accent'] || '').toLowerCase().trim();
  const pcbAcc = String(c?.PCB?.Accent || '').toLowerCase().trim();

  const isDarkHs = hs === 'black' || hs === 'dark gray' || hs === 'dark grayy' || hs === '';
  if (!isDarkHs) return false;

  const vibrant = [
    'red', 'orange', 'yellow', 'gold', 'lime', 'magenta',
    'pink', 'turquoise', 'teal', 'blue', 'purple', 'rgb'
  ];
  if (vibrant.some((k) => hsAcc.includes(k))) return false;
  if (vibrant.some((k) => pcbAcc.includes(k))) return false;

  return hs.includes('black') || pcb.includes('black');
}

/**
 * Granular color and aesthetic presets for filtering.
 */
export function matchesGranularColor(mobo: any, theme: string): boolean {
  if (!theme || theme === 'all') return true;
  const c = mobo?.specs?.Color || {};
  const hs = String(c?.Heatsink?.Primary || '').toLowerCase().trim();
  const pcb = String(c?.PCB?.Primary || '').toLowerCase().trim();
  const hsAcc = String(c?.Heatsink?.['Text/Accent'] || '').toLowerCase().trim();
  const pcbAcc = String(c?.PCB?.Accent || '').toLowerCase().trim();
  const acc = `${hsAcc} ${pcbAcc}`;

  switch (theme) {
    case 'stealth':
      return matchesBlackTheme(mobo);
    case 'white_pcb':
      return pcb.includes('white');
    case 'white_heatsink':
      return hs.includes('white') || hs.includes('silver');
    case 'black_gold':
      return (hs.includes('black') || hs.includes('dark gray')) &&
        (acc.includes('gold') || acc.includes('copper') || acc.includes('yellow') || acc.includes('bronze'));
    case 'black_red':
      return (hs.includes('black') || hs.includes('dark gray')) &&
        (acc.includes('red') || acc.includes('orange'));
    case 'black_lime':
      return (hs.includes('black') || hs.includes('dark gray')) &&
        (acc.includes('lime') || acc.includes('green'));
    case 'black_blue':
      return (hs.includes('black') || hs.includes('dark gray')) &&
        (acc.includes('blue') || acc.includes('turquoise') || acc.includes('teal') || acc.includes('magenta') || acc.includes('aqua'));
    case 'gunmetal':
      return hs.includes('gray') || hs.includes('dark gray') || hs.includes('dark grayy');
    default:
      return true;
  }
}

/**
 * Check if a motherboard is a back-connect design (ASUS BTF, MSI Project Zero, Gigabyte Stealth).
 */
export function matchesBackConnect(mobo: any): boolean {
  const mod = String(mobo?.model || '').toLowerCase();
  const notes = String(mobo?.typed?.notes_details || mobo?.specs?.Notes?.Details || '').toLowerCase();
  return ['btf', 'project zero', 'stealth'].some(
    (w) => mod.includes(w) || notes.includes(w)
  );
}

/**
 * Check if a motherboard has 2 RAM slots (enthusiast memory overclocking or ITX).
 */
export function matchesTwoDimm(mobo: any): boolean {
  const ramSlots = mobo?.typed?.ram_slots ?? mobo?.specs?.Memory?.RAM?.Slots;
  return ramSlots === 2 || ramSlots === '2';
}

/**
 * Check if a motherboard supports dual x8/x8 PCIe bifurcation (either 5.0 or 4.0).
 */
export function matchesX8X8(mobo: any): boolean {
  const lanes = String(
    mobo.typed?.pcie_x16_lanes ||
    mobo.specs?.Expansion?.['PCIe Slots']?.['Physical x16']?.['Electrical Lanes'] ||
    ''
  ).toLowerCase();
  return lanes.includes('x8') || lanes.includes('8x');
}

/**
 * Free-text multi-word search over brand, chipset, model, and specs.
 * Every whitespace-separated word must appear (order-independent).
 * Also recognizes 'x8/x8', '8x/8x', 'bifurcation' as smart filters.
 */
export function matchesGlobalSearch(mobo: any, search: string): boolean {
  const query = String(search || '').toLowerCase().trim();
  if (!query) return true;

  const words = query.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return true;

  const combined = `${mobo.brand || ''} ${mobo.chipset || ''} ${mobo.model || ''} ${mobo.form_factor || ''} ${mobo.typed?.audio_codec || ''} ${mobo.typed?.lan_controllers || ''} ${mobo.typed?.pcie_x16_lanes || ''}`.toLowerCase();
  const isX8 = matchesX8X8(mobo);

  return words.every((word) => {
    if (word === 'x8/x8' || word === '8x/8x' || word === 'x8x8' || word === 'bifurcation' || word === 'bifurcate') {
      return isX8;
    }
    return combined.includes(word);
  });
}

/**
 * Read the value a given column filter reads off a motherboard record.
 */
export function filterValue(mobo: any, column: string, dynamicKeys: Record<string, string> = {}): string {
  if (column.startsWith('dyn')) {
    const key = dynamicKeys[column];
    return key ? getNestedValue(mobo, key) : '-';
  }
  if (column === 'brand') return String(mobo.brand || '-');
  if (column === 'chipset') return String(mobo.chipset || '-');
  if (column === 'model') return String(mobo.model || '-');
  if (column === 'form_factor') return String(mobo.form_factor || '-');
  return String(mobo[column] || '-');
}

/**
 * Check if a motherboard matches the quick-filter toggles.
 */
export function matchesQuickFilters(mobo: any, quickFilters: QuickFilters = {}): boolean {
  if (quickFilters.pcie5) {
    const pcie5 =
      (mobo.typed?.pcie_x16_lanes || '').includes('5x') ||
      (mobo.typed?.m2_m || '').includes('5x') ||
      (mobo.specs?._scorecard?.pcie5_lanes || false);
    if (!pcie5) return false;
  }
  if (quickFilters.usb4) {
    const usb4Count = mobo.specs?._scorecard?.usb_details?.type_c?.usb4_40g || 0;
    if (usb4Count <= 0) return false;
  }
  if (quickFilters.wifi7) {
    const hasWifi7 =
      (mobo.typed?.wireless || '').includes('7') ||
      (mobo.specs?._scorecard?.wireless || '').includes('7');
    if (!hasWifi7) return false;
  }
  if (quickFilters.x8x8) {
    if (!matchesX8X8(mobo)) return false;
  }
  if (quickFilters.whiteTheme) {
    if (!matchesWhiteTheme(mobo)) return false;
  }
  if (quickFilters.blackTheme) {
    if (!matchesBlackTheme(mobo)) return false;
  }
  if (quickFilters.backConnect) {
    if (!matchesBackConnect(mobo)) return false;
  }
  if (quickFilters.twoDimm) {
    if (!matchesTwoDimm(mobo)) return false;
  }
  if (quickFilters.colorTheme && quickFilters.colorTheme !== 'all') {
    if (!matchesGranularColor(mobo, quickFilters.colorTheme)) return false;
  }
  return true;
}

/**
 * Apply search, column filters, and quick filters.
 */
export function filterMobos(
  mobos: any[],
  {
    search = '',
    filters = {},
    dynamicKeys = {},
    quickFilters = {}
  }: {
    search?: string;
    filters?: Record<string, Set<string> | string[]>;
    dynamicKeys?: Record<string, string>;
    quickFilters?: QuickFilters;
  } = {}
): any[] {
  // Convert filter arrays to Sets for O(1) lookup
  const filterSets: Record<string, Set<string>> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v instanceof Set) {
      if (v.size > 0) filterSets[k] = v;
    } else if (Array.isArray(v) && v.length > 0) {
      filterSets[k] = new Set(v);
    }
  }

  return mobos.filter((m) => {
    if (!matchesGlobalSearch(m, search)) return false;
    if (!matchesQuickFilters(m, quickFilters)) return false;

    // Check fixed columns
    for (const col of ['brand', 'chipset', 'model', 'form_factor']) {
      const set = filterSets[col];
      if (set && !set.has(filterValue(m, col))) {
        return false;
      }
    }

    // Check dynamic columns
    for (const col of Object.keys(dynamicKeys)) {
      const set = filterSets[col];
      if (set && !set.has(filterValue(m, col, dynamicKeys))) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Sort motherboards with natural, numeric-aware ordering.
 */
export function sortMobos(
  mobos: any[],
  sort: SortState | null,
  dynamicKeys: Record<string, string> = {}
): any[] {
  if (!sort || !sort.column) return mobos.slice();

  const read = (m: any): string => {
    if (sort.column?.startsWith('dyn')) {
      const key = dynamicKeys[sort.column];
      return key ? getNestedValue(m, key) : '';
    }
    return m[sort.column!] != null ? String(m[sort.column!]) : '';
  };

  return mobos.slice().sort((a, b) => {
    let aVal = read(a);
    let bVal = read(b);

    aVal = aVal === '-' ? '' : aVal;
    bVal = bVal === '-' ? '' : bVal;

    // Numeric currency parsing if price or MSRP
    const isPrice =
      sort.column === 'price_usd' ||
      (sort.column && dynamicKeys[sort.column]?.includes('MSRP')) ||
      aVal.startsWith('$') ||
      bVal.startsWith('$');

    if (isPrice) {
      const numA = safeNumber(aVal, Infinity);
      const numB = safeNumber(bVal, Infinity);
      return sort.direction === 'asc' ? numA - numB : numB - numA;
    }

    const result = aVal.localeCompare(bVal, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
    return sort.direction === 'asc' ? result : -result;
  });
}

export const sortRows = sortMobos;

/**
 * Calculate available values for a target column given other active filters.
 */
export function availableValuesFor(
  mobos: any[],
  targetCol: string,
  {
    search = '',
    filters = {},
    dynamicKeys = {},
    quickFilters = {}
  }: {
    search?: string;
    filters?: Record<string, Set<string> | string[]>;
    dynamicKeys?: Record<string, string>;
    quickFilters?: QuickFilters;
  } = {}
): { available: Set<string>; counts: Map<string, number> } {
  const filterSets: Record<string, Set<string>> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v instanceof Set) {
      if (v.size > 0) filterSets[k] = v;
    } else if (Array.isArray(v) && v.length > 0) {
      filterSets[k] = new Set(v);
    }
  }

  const columns = ['brand', 'chipset', 'model', 'form_factor', ...Object.keys(dynamicKeys)];

  const subset = mobos.filter((m) => {
    if (!matchesGlobalSearch(m, search)) return false;
    if (!matchesQuickFilters(m, quickFilters)) return false;

    for (const col of columns) {
      if (col === targetCol) continue;
      const set = filterSets[col];
      if (set && !set.has(filterValue(m, col, dynamicKeys))) {
        return false;
      }
    }
    return true;
  });

  const available = new Set<string>();
  const counts = new Map<string, number>();

  subset.forEach((m) => {
    const val = filterValue(m, targetCol, dynamicKeys);
    if (val !== null && val !== undefined) {
      available.add(val);
      counts.set(val, (counts.get(val) || 0) + 1);
    }
  });

  return { available, counts };
}

/**
 * Sort options intelligently (e.g. brand tiers, chipset tiers, form factor sizes).
 */
export function sortFilterOptions(col: string, values: string[]): string[] {
  if (col === 'brand') {
    const tier1 = ['ASRock', 'Asus', 'ASUS', 'Gigabyte', 'MSI'];
    const tier2 = ['Biostar', 'Sapphire'];
    const t1: string[] = [];
    const t2: string[] = [];
    const rest: string[] = [];

    values.forEach((v) => {
      if (tier1.some((t) => t.toLowerCase() === v.toLowerCase())) t1.push(v);
      else if (tier2.some((t) => t.toLowerCase() === v.toLowerCase())) t2.push(v);
      else rest.push(v);
    });
    rest.sort((a, b) => a.localeCompare(b));
    return [...t1, ...t2, ...rest];
  }

  if (col === 'chipset') {
    const chipsetTiers = [
      'X870E', 'X870', 'X670E', 'X670',
      'B850', 'B650E', 'B650', 'B840', 'A620'
    ];
    return [...values].sort((a, b) => {
      const aIdx = chipsetTiers.findIndex((c) => c.toLowerCase() === a.toLowerCase());
      const bIdx = chipsetTiers.findIndex((c) => c.toLowerCase() === b.toLowerCase());
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }

  if (col === 'form_factor') {
    const sizeOrder = ['E-ATX', 'ATX', 'ATX-B', 'μ-ATX', 'μ-ATX-B', 'Mini-ITX', 'BKB ITX', 'm-ITX'];
    return [...values].sort((a, b) => {
      const aIdx = sizeOrder.findIndex((s) => s.toLowerCase() === a.toLowerCase());
      const bIdx = sizeOrder.findIndex((s) => s.toLowerCase() === b.toLowerCase());
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }

  return [...values].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Splits formatted notes string (which may have bullet dashes, ' - ', or newlines)
 * into individual note points.
 */
export function parseNotesList(notes: unknown): string[] {
  const str = safeString(notes);
  if (!str || str === '-') return [];
  // Strip leading bullet/dash
  let cleaned = str.replace(/^[-•*]\s*/, '');
  // Split on newlines, space-dash-space, or period-dash
  const parts = cleaned.split(/(?:\r?\n\s*[-•*]?\s*|\s+[-•*]\s+)/g);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0 && p !== '-');
}

/**
 * Splits M.2 Key M configurations into generation tokens,
 * e.g. "2*5x4 2*4x4 1*4x2 1*3x4" -> ["2*5x4", "2*4x4", "1*4x2", "1*3x4"].
 */
export function parseM2Generations(val: unknown): string[] {
  const str = safeString(val);
  if (!str || str === '-') return [];
  if (str.toLowerCase() === 'see note' || str.toLowerCase() === 'no' || str.toLowerCase() === 'none') {
    return [str];
  }
  const tokens = str.split(/[\s,]+/);
  return tokens.filter(Boolean);
}

/**
 * Return appropriate badge color class for M.2 generation string.
 */
export function m2GenBadgeClass(gen: string): string {
  if (!gen) return 'bg-secondary';
  if (gen.includes('5x') || gen.includes('*5') || gen.startsWith('5')) return 'bg-primary text-white';
  if (gen.includes('4x') || gen.includes('*4') || gen.startsWith('4')) return 'bg-info text-dark';
  if (gen.includes('3x') || gen.includes('*3') || gen.startsWith('3')) return 'bg-secondary text-light';
  return 'bg-dark border border-secondary text-light';
}

/**
 * Strips all non-alphanumeric characters for fuzzy matching.
 */
export function cleanSearchStr(s: string): string {
  return safeString(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if query matches target with fuzzy punctuation and token normalization.
 * E.g. 'wifi' matches 'Wi-Fi', 'pcie' matches 'PCI-e', 'rj45' matches '# RJ-45'.
 */
export function matchesFuzzyQuery(haystack: string, query: string): boolean {
  const rawH = safeString(haystack).toLowerCase();
  const rawQ = safeString(query).toLowerCase();
  if (!rawQ) return true;
  if (rawH.includes(rawQ)) return true;

  const cleanH = cleanSearchStr(haystack);
  const cleanQ = cleanSearchStr(rawQ);
  if (cleanQ && cleanH.includes(cleanQ)) return true;

  const tokens = rawQ.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((tok) => {
      const cTok = cleanSearchStr(tok);
      return rawH.includes(tok) || (cTok && cleanH.includes(cTok));
    });
  }
  return false;
}
