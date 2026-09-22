/**
 * Strict TypeScript types and defensive type-guards for AM5 Motherboard data.
 */

export interface Motherboard {
  id: string;
  brand: string;
  model: string;
  chipset: string;
  form_factor: string;
  specs: Record<string, any>;
  typed?: Record<string, any>;
  [key: string]: any;
}

export interface ScorecardSpecs {
  vrm_score?: number;
  m2_score?: number;
  lan_score?: number;
  wifi_score?: number;
  audio_score?: number;
  rear_usb_score?: number;
  scorecard_total?: number;
  scorecard_badge?: string;
  [key: string]: any;
}

export interface DynamicColumn {
  key: string;
  label: string;
  category: string;
  subcategory?: string;
}

export interface FilterState {
  search?: string;
  chipset?: string;
  form_factor?: string;
  brand?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  pcie_x8_bifurcation?: boolean;
  [key: string]: any;
}

/**
 * Coerce any unknown value safely to a trimmed string.
 * Prevents TypeError crashes when calling .trim() or .split() on numeric/null values.
 */
export function safeString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return String(v).trim();
}

/**
 * Coerce any unknown value safely to a valid number.
 * Returns `fallback` (default 0) if value is NaN or cannot be parsed.
 */
export function safeNumber(v: unknown, fallback: number = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'number') return isNaN(v) ? fallback : v;
  const cleaned = String(v).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Coerce any unknown value safely to an array.
 */
export function safeArray<T = any>(v: unknown): T[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === '') return [];
  return [v as T];
}
