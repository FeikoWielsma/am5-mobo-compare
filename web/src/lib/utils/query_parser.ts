import { safeString, safeNumber } from '../types';
import { matchesX8X8 } from '../table_logic';

export type NumericComparator = '<' | '<=' | '>' | '>=' | '=' | '==';

export interface NumericFilter {
  field: string;
  operator: NumericComparator;
  value: number;
  raw: string;
}

export interface KeyValueFilter {
  key: string;
  value: string;
  raw: string;
}

export interface BooleanFilter {
  key: string;
  value: boolean;
  raw: string;
}

export interface ParsedQuery {
  raw: string;
  numericFilters: NumericFilter[];
  keyValueFilters: KeyValueFilter[];
  booleanFilters: BooleanFilter[];
  freeText: string[];
}

/**
 * Normalizes field aliases for numeric comparisons.
 */
function normalizeNumericField(field: string): string {
  const f = field.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (['price', 'cost', 'msrp', 'amsrp'].includes(f)) return 'price';
  if (['m2', 'm_2', 'm2_slots', 'm2_total', 'm2total'].includes(f)) return 'm2';
  if (['sata', 'sata_ports', 'sata_total', 'sataports'].includes(f)) return 'sata';
  if (['phases', 'phase', 'vrm', 'vrm_phases', 'vcore', 'vcore_phases'].includes(f)) return 'phases';
  if (['ram', 'ram_slots', 'dimm', 'dimms'].includes(f)) return 'ram';
  if (['pcie', 'pcie_slots', 'pcie_total'].includes(f)) return 'pcie';
  if (['usb', 'usb_total', 'rear_usb'].includes(f)) return 'usb';
  if (['rj45', 'lan_ports'].includes(f)) return 'rj45';
  return f;
}

/**
 * Normalizes boolean filter keys.
 */
function normalizeBoolKey(key: string): string {
  const k = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (['bifurcation', 'bifurcate', 'x8x8'].includes(k)) return 'bifurcation';
  if (['usb4', 'tb4', 'thunderbolt', 'thunderbolt4'].includes(k)) return 'usb4';
  if (['wifi', 'wireless', 'wlan'].includes(k)) return 'wifi';
  if (['ecc', 'ecc_support'].includes(k)) return 'ecc';
  if (['pcie5', 'gen5'].includes(k)) return 'pcie5';
  if (['wifi7', 'wi_fi_7'].includes(k)) return 'wifi7';
  if (['btf', 'backconnect', 'back_connect', 'project_zero', 'stealth'].includes(k)) return 'backconnect';
  if (['flashback', 'bios_flash', 'bios_flashback'].includes(k)) return 'bios_flash';
  if (['clear_cmos', 'cmos'].includes(k)) return 'clear_cmos';
  if (['spdif', 'optical'].includes(k)) return 'spdif';
  if (['post_code', 'debug_led'].includes(k)) return 'post_code';
  return k;
}

/**
 * Normalizes key-value filter keys.
 */
function normalizeKey(key: string): string {
  const k = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (['brand', 'make', 'mfg', 'manufacturer'].includes(k)) return 'brand';
  if (['chipset', 'chip'].includes(k)) return 'chipset';
  if (['form_factor', 'formfactor', 'ff', 'factor'].includes(k)) return 'form_factor';
  if (['wifi', 'wireless', 'wlan'].includes(k)) return 'wifi';
  if (['lan', 'ethernet', 'nic'].includes(k)) return 'lan';
  if (['model', 'name'].includes(k)) return 'model';
  if (['audio', 'codec'].includes(k)) return 'audio';
  if (['color', 'theme'].includes(k)) return 'color';
  return k;
}

/**
 * Evaluates a numeric comparison.
 */
function evaluateComparison(actual: number, op: NumericComparator, target: number): boolean {
  switch (op) {
    case '<': return actual < target;
    case '<=': return actual <= target;
    case '>': return actual > target;
    case '>=': return actual >= target;
    case '=':
    case '==': return actual === target;
    default: return false;
  }
}

/**
 * Parses a search query string into structured query tokens:
 * - Numeric comparisons: `price<400`, `price>200`, `price<=350`, `m2>=4`, `m2>3`, `sata>=6`, `phases>=16`
 * - Key-value filters: `chipset:x870e`, `brand:asrock`, `form_factor:itx`, `wifi:7`, `lan:10g`
 * - Boolean presence flags: `has:bifurcation`, `has:usb4`, `no:wifi`, `has:ecc`
 * - Free-text fallback matches model, brand, or notes details.
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const raw = query || '';
  const result: ParsedQuery = {
    raw,
    numericFilters: [],
    keyValueFilters: [],
    booleanFilters: [],
    freeText: []
  };

  if (!raw.trim()) {
    return result;
  }

  // Pre-normalize spaces around operators like `price < 400` -> `price<400` or `brand: asrock` -> `brand:asrock`
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/(\b[a-zA-Z0-9_.-]+)\s*(<=|>=|==|!=|<|>|=)\s*(\$?\d+(?:\.\d+)?)/g, '$1$2$3');
  cleaned = cleaned.replace(/(\b[a-zA-Z0-9_.-]+)\s*:\s*("[^"]*"|'[^']*'|[^\s]+)/g, '$1:$2');

  // Tokenize preserving quoted strings
  const tokens = cleaned.match(/[^\s"']+|"[^"]*"|'[^']*'/g) || [];

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    // 1. Numeric comparisons: price<400, price>200, price<=350, m2>=4, m2>3, sata>=6, phases>=16
    const numMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)(<=|>=|<|>|==|=)(\$?\d+(?:\.\d+)?)$/);
    if (numMatch) {
      const field = normalizeNumericField(numMatch[1]);
      const op = numMatch[2] as NumericComparator;
      const numStr = numMatch[3].replace('$', '');
      const val = parseFloat(numStr);
      if (!isNaN(val)) {
        result.numericFilters.push({
          field,
          operator: op,
          value: val,
          raw: trimmed
        });
        continue;
      }
    }

    // 2. Key-value and Boolean flags (e.g. has:bifurcation, no:wifi, chipset:x870e, brand:asrock)
    const colonMatch = trimmed.match(/^([a-zA-Z0-9_.-]+):(.+)$/);
    if (colonMatch) {
      const rawKey = colonMatch[1].toLowerCase();
      let rawVal = colonMatch[2].replace(/^["']|["']$/g, '').trim();

      // Boolean presence flags: has:..., no:..., not:...
      if (['has', 'with', 'is'].includes(rawKey)) {
        result.booleanFilters.push({
          key: normalizeBoolKey(rawVal),
          value: true,
          raw: trimmed
        });
        continue;
      }
      if (['no', 'not', 'without'].includes(rawKey)) {
        result.booleanFilters.push({
          key: normalizeBoolKey(rawVal),
          value: false,
          raw: trimmed
        });
        continue;
      }

      // Explicit boolean values e.g. bifurcation:true / ecc:no
      if (['true', 'yes', '1'].includes(rawVal.toLowerCase())) {
        result.booleanFilters.push({
          key: normalizeBoolKey(rawKey),
          value: true,
          raw: trimmed
        });
        continue;
      }
      if (['false', 'no', '0'].includes(rawVal.toLowerCase()) && ['bifurcation', 'ecc', 'usb4', 'wifi', 'wifi7', 'pcie5'].includes(rawKey)) {
        result.booleanFilters.push({
          key: normalizeBoolKey(rawKey),
          value: false,
          raw: trimmed
        });
        continue;
      }

      // Numeric equality with colon (e.g. price:400 or phases:16)
      const numericVal = parseFloat(rawVal.replace('$', ''));
      if (!isNaN(numericVal) && ['price', 'm2', 'sata', 'phases', 'ram', 'pcie'].includes(normalizeNumericField(rawKey))) {
        result.numericFilters.push({
          field: normalizeNumericField(rawKey),
          operator: '=',
          value: numericVal,
          raw: trimmed
        });
        continue;
      }

      // Standard Key-value filter
      result.keyValueFilters.push({
        key: normalizeKey(rawKey),
        value: rawVal,
        raw: trimmed
      });
      continue;
    }

    // 3. Free-text token fallback
    const freeTextClean = trimmed.replace(/^["']|["']$/g, '').trim();
    if (freeTextClean) {
      result.freeText.push(freeTextClean);
    }
  }

  return result;
}

/**
 * Extracts numeric M.2 count from a motherboard record.
 */
function extractM2Count(board: any): number {
  if (!board) return NaN;
  if (typeof board.typed?.m2_total === 'object' && board.typed?.m2_total !== null) {
    const tot = board.typed.m2_total.total ?? board.typed.m2_total.count;
    if (tot !== undefined && tot !== null) return safeNumber(tot, NaN);
  }
  const direct = board.typed?.m2_total ?? board.specs?.Expansion?.Storage?.['PCIe Storage']?.['Total M.2'] ?? board.specs?._scorecard?.m2_total ?? board.m2_total;
  return safeNumber(direct, NaN);
}

/**
 * Extracts SATA count from a motherboard record.
 */
function extractSataCount(board: any): number {
  if (!board) return NaN;
  const direct = board.typed?.sata_ports ?? board.specs?.Expansion?.Storage?.SATA ?? board.sata_ports;
  return safeNumber(direct, NaN);
}

/**
 * Extracts VRM phase counts (both vcore and total) from a motherboard record.
 */
function extractVrmPhases(board: any): { vcore: number; total: number } {
  let vcore = 0;
  let total = 0;
  if (!board) return { vcore, total };

  if (board.typed?.vrm_phases) {
    vcore = safeNumber(board.typed.vrm_phases.vcore_phases, 0);
    total = safeNumber(board.typed.vrm_phases.total_phases, 0);
  }

  if (!vcore && !total) {
    const raw = safeString(
      board.specs?._scorecard?.vrm_text ??
      board.specs?.Power?.['VRM configuration']?.['Phase config'] ??
      board.vrm_phases
    );
    const plusMatch = raw.match(/(\d+)\s*\+\s*(\d+)(?:\s*\+\s*(\d+))?/);
    if (plusMatch) {
      const p1 = parseInt(plusMatch[1], 10);
      const p2 = parseInt(plusMatch[2], 10);
      const p3 = plusMatch[3] ? parseInt(plusMatch[3], 10) : 0;
      vcore = p1;
      total = p1 + p2 + p3;
    } else {
      const numMatch = raw.match(/\d+/);
      if (numMatch) {
        vcore = parseInt(numMatch[0], 10);
        total = vcore;
      }
    }
  }

  return { vcore, total };
}

/**
 * Checks whether a board has USB4 support.
 */
function checkUsb4(board: any): boolean {
  if (!board) return false;
  const usb4Count = safeNumber(
    board.typed?.usb_c_usb4_40g ??
    board.specs?._scorecard?.usb_details?.type_c?.usb4_40g,
    0
  );
  if (usb4Count > 0) return true;

  const rearStr = safeString(
    board.typed?.rear_io_summary ??
    board.specs?.['Rear I/O']?.USB?.['Type C']?.['USB4 (40Gbps)'] ??
    ''
  ).toLowerCase();
  if (rearStr.includes('usb4') || rearStr.includes('40gbps') || rearStr.includes('thunderbolt')) {
    return true;
  }

  const notes = safeString(board.typed?.notes_details ?? board.specs?.Notes?.Details ?? '').toLowerCase();
  if (notes.includes('without usb4') || notes.includes('no usb4')) return false;
  return notes.includes('usb4') || notes.includes('40gbps');
}

/**
 * Checks whether a board has PCIe bifurcation support (e.g. x8/x8).
 */
function checkBifurcation(board: any): boolean {
  if (!board) return false;
  if (matchesX8X8(board)) return true;

  const lanes = safeString(
    board.typed?.pcie_x16_lanes ??
    board.specs?.Expansion?.['PCIe Slots']?.['Physical x16']?.['Electrical Lanes'] ??
    ''
  ).toLowerCase();
  if (lanes.includes('x8') || lanes.includes('8x')) return true;

  const notes = safeString(board.typed?.notes_details ?? board.specs?.Notes?.Details ?? '').toLowerCase();
  if (notes.includes('without bifurcat') || notes.includes('no bifurcat') || notes.includes('not bifurcat')) {
    return false;
  }
  return notes.includes('bifurcat') || notes.includes('x8/x8') || notes.includes('8x/8x');
}

/**
 * Checks whether a board has Wi-Fi capability.
 */
function checkWifi(board: any): boolean {
  if (!board) return false;
  const wireless = safeString(
    board.typed?.wireless ??
    board.specs?._scorecard?.wireless ??
    board.specs?.General?.Networking?.Wireless
  );
  if (!wireless || wireless === '-' || wireless.toLowerCase() === 'no' || wireless.toLowerCase() === 'none') {
    return false;
  }
  return true;
}

/**
 * Checks whether a board supports ECC memory.
 */
function checkEcc(board: any): boolean {
  if (!board) return false;
  const ecc = safeString(
    board.typed?.ecc_support ??
    board.specs?.General?.Memory?.['ECC support']
  ).toLowerCase();
  if (!ecc || ecc === '-' || ecc === 'no' || ecc === 'none' || ecc.includes('non-ecc') || ecc.includes('without ecc')) {
    return false;
  }
  return ecc.includes('yes') || ecc.includes('ecc') || ecc.includes('supported') || ecc.includes('multi-bit');
}

/**
 * Evaluates whether a motherboard satisfies a parsed search query.
 */
export function matchesQuery(board: any, parsed: ParsedQuery): boolean {
  if (!board) return false;

  // 1. Evaluate Numeric Filters
  for (const filter of parsed.numericFilters) {
    if (filter.field === 'price') {
      const price = safeNumber(
        board.typed?.price_usd ??
        board.specs?.General?.Market?.['A-MSRP (USD)'] ??
        board.price_usd ??
        board.price,
        NaN
      );
      if (isNaN(price) || price <= 0) return false;
      if (!evaluateComparison(price, filter.operator, filter.value)) return false;
    } else if (filter.field === 'm2') {
      const m2 = extractM2Count(board);
      if (isNaN(m2)) return false;
      if (!evaluateComparison(m2, filter.operator, filter.value)) return false;
    } else if (filter.field === 'sata') {
      const sata = extractSataCount(board);
      if (isNaN(sata)) return false;
      if (!evaluateComparison(sata, filter.operator, filter.value)) return false;
    } else if (filter.field === 'phases') {
      const { vcore, total } = extractVrmPhases(board);
      if (filter.operator === '>=' || filter.operator === '>') {
        const matches = evaluateComparison(vcore, filter.operator, filter.value) ||
                        evaluateComparison(total, filter.operator, filter.value);
        if (!matches) return false;
      } else if (filter.operator === '<=' || filter.operator === '<') {
        const matches = (vcore > 0 && evaluateComparison(vcore, filter.operator, filter.value)) ||
                        (total > 0 && evaluateComparison(total, filter.operator, filter.value));
        if (!matches) return false;
      } else {
        if (vcore !== filter.value && total !== filter.value) return false;
      }
    } else if (filter.field === 'ram') {
      const ram = safeNumber(board.typed?.ram_slots ?? board.specs?.General?.Memory?.['RAM slots'], NaN);
      if (isNaN(ram) || !evaluateComparison(ram, filter.operator, filter.value)) return false;
    } else if (filter.field === 'pcie') {
      const pcie = safeNumber(board.typed?.pcie_x16_total ?? board.typed?.pcie_total_slots, NaN);
      if (isNaN(pcie) || !evaluateComparison(pcie, filter.operator, filter.value)) return false;
    } else if (filter.field === 'usb') {
      const usb = safeNumber(board.typed?.usb_total ?? board.specs?._scorecard?.usb_ports_total, NaN);
      if (isNaN(usb) || !evaluateComparison(usb, filter.operator, filter.value)) return false;
    } else {
      const val = safeNumber(board[filter.field] ?? board.typed?.[filter.field], NaN);
      if (isNaN(val) || !evaluateComparison(val, filter.operator, filter.value)) return false;
    }
  }

  // 2. Evaluate Key-Value Filters
  for (const kv of parsed.keyValueFilters) {
    const target = kv.value.toLowerCase().trim();
    if (kv.key === 'chipset') {
      const rawChipset = safeString(board.chipset).toLowerCase();
      const cleanChipset = rawChipset.replace(/[^a-z0-9]/g, '');
      const cleanTarget = target.replace(/[^a-z0-9]/g, '');
      const normChipset = cleanChipset.replace(/^amd/, '');
      const normTarget = cleanTarget.replace(/^amd/, '');

      const isMatch = normChipset === normTarget ||
                      cleanChipset === cleanTarget ||
                      rawChipset.includes(target) ||
                      (normTarget.length >= 3 && normChipset.includes(normTarget));
      if (!isMatch) return false;
    } else if (kv.key === 'brand') {
      const brand = safeString(board.brand).toLowerCase();
      if (!brand.includes(target)) return false;
    } else if (kv.key === 'form_factor') {
      const ff = safeString(board.form_factor).toLowerCase();
      let isMatch = false;
      if (target === 'itx' || target === 'mini-itx' || target === 'm-itx') {
        isMatch = ff.includes('itx');
      } else if (['matx', 'micro-atx', 'uatx', 'μatx', 'μ-atx', 'u-atx'].includes(target)) {
        isMatch = ff.includes('matx') || ff.includes('micro') || ff.includes('μ') || ff.includes('u-atx');
      } else if (target === 'eatx' || target === 'e-atx') {
        isMatch = ff.includes('eatx') || ff.includes('e-atx');
      } else if (target === 'atx') {
        isMatch = ff === 'atx' || ff === 'atx-b';
      } else {
        isMatch = ff.includes(target);
      }
      if (!isMatch) return false;
    } else if (kv.key === 'wifi') {
      const wireless = safeString(
        board.typed?.wireless ??
        board.specs?._scorecard?.wireless ??
        board.specs?.General?.Networking?.Wireless
      ).toLowerCase();

      if (target === '7') {
        if (!wireless.includes('7') && !wireless.includes('wifi 7') && !wireless.includes('wi-fi 7') && !wireless.includes('802.11be')) {
          return false;
        }
      } else if (target === '6e') {
        if (!wireless.includes('6e') && !wireless.includes('6 e')) return false;
      } else if (target === '6') {
        if ((!wireless.includes('6') && !wireless.includes('802.11ax')) || wireless.includes('6e')) return false;
      } else if (['no', 'none', '0'].includes(target)) {
        if (checkWifi(board)) return false;
      } else {
        if (!wireless.includes(target)) return false;
      }
    } else if (kv.key === 'lan') {
      const lan = safeString(
        board.typed?.lan_controllers ??
        board.specs?.General?.Networking?.Ethernet?.LAN ??
        board.specs?._scorecard?.lan_text
      ).toLowerCase();
      const badges = board.specs?._scorecard?.lan_badges || [];

      if (target === '10g' || target === '10') {
        const has10 = lan.includes('10g') || lan.includes('10 gb') || lan.includes('aqc113') || lan.includes('aqc107') ||
                      badges.some((b: any) => b.speed >= 10000 || b.label === '10G');
        if (!has10) return false;
      } else if (target === '5g' || target === '5') {
        const has5 = lan.includes('5g') || lan.includes('rtl8126') || lan.includes('aqc111') ||
                     badges.some((b: any) => b.speed >= 5000 || b.label === '5G');
        if (!has5) return false;
      } else if (target === '2.5g' || target === '2.5') {
        const has25 = lan.includes('2.5g') || lan.includes('rtl8125') || lan.includes('i225') || lan.includes('i226') ||
                      badges.some((b: any) => b.speed === 2500 || b.label === '2.5G');
        if (!has25) return false;
      } else if (target === '1g' || target === '1') {
        const has1 = lan.includes('1g') || lan.includes('rtl8111') || lan.includes('i219') || lan.includes('i211') ||
                     badges.some((b: any) => b.speed === 1000 || b.label === '1G');
        if (!has1) return false;
      } else {
        if (!lan.includes(target)) return false;
      }
    } else {
      const val = safeString(board[kv.key] ?? board.typed?.[kv.key]).toLowerCase();
      if (!val.includes(target)) return false;
    }
  }

  // 3. Evaluate Boolean Presence Flags
  for (const bool of parsed.booleanFilters) {
    if (bool.key === 'bifurcation') {
      if (checkBifurcation(board) !== bool.value) return false;
    } else if (bool.key === 'usb4') {
      if (checkUsb4(board) !== bool.value) return false;
    } else if (bool.key === 'wifi') {
      if (checkWifi(board) !== bool.value) return false;
    } else if (bool.key === 'ecc') {
      if (checkEcc(board) !== bool.value) return false;
    } else if (bool.key === 'pcie5') {
      const pcie5 = (board.typed?.pcie_x16_lanes || '').includes('5x') ||
                    (board.typed?.m2_m || '').includes('5x') ||
                    Boolean(board.specs?._scorecard?.pcie5_lanes);
      if (pcie5 !== bool.value) return false;
    } else if (bool.key === 'wifi7') {
      const w7 = safeString(board.typed?.wireless).includes('7') ||
                 safeString(board.specs?._scorecard?.wireless).includes('7');
      if (w7 !== bool.value) return false;
    } else if (bool.key === 'backconnect') {
      const btf = ['btf', 'project zero', 'stealth'].some((w) =>
        safeString(board.model).toLowerCase().includes(w) ||
        safeString(board.typed?.notes_details).toLowerCase().includes(w)
      );
      if (btf !== bool.value) return false;
    } else if (bool.key === 'bios_flash') {
      const bf = Boolean(board.typed?.bios_flash_btn || board.specs?._scorecard?.bios_flash_btn);
      if (bf !== bool.value) return false;
    } else if (bool.key === 'clear_cmos') {
      const cc = Boolean(board.typed?.clear_cmos_btn || board.specs?.General?.Buttons?.['Clear CMOS']);
      if (cc !== bool.value) return false;
    } else if (bool.key === 'spdif') {
      const sp = Boolean(board.typed?.spdif && board.typed.spdif !== '-' && board.typed.spdif !== '0');
      if (sp !== bool.value) return false;
    }
  }

  // 4. Evaluate Free-Text Fallback: matches model, brand, or notes details
  if (parsed.freeText.length > 0) {
    const model = safeString(board.model).toLowerCase();
    const brand = safeString(board.brand).toLowerCase();
    const notes = safeString(board.typed?.notes_details ?? board.specs?.Notes?.Details ?? board.notes_details).toLowerCase();
    const chipset = safeString(board.chipset).toLowerCase();
    const formFactor = safeString(board.form_factor).toLowerCase();
    const codec = safeString(board.typed?.audio_codec).toLowerCase();
    const lan = safeString(board.typed?.lan_controllers).toLowerCase();

    const combined = `${brand} ${model} ${notes} ${chipset} ${formFactor} ${codec} ${lan}`;

    for (const term of parsed.freeText) {
      const t = term.toLowerCase();
      if (['x8/x8', '8x/8x', 'x8x8', 'bifurcation'].includes(t)) {
        if (!checkBifurcation(board)) return false;
        continue;
      }
      if (!combined.includes(t)) {
        return false;
      }
    }
  }

  return true;
}
