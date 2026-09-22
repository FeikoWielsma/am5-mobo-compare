import { safeString, safeNumber } from '$lib/types';

export const IGNORED_FIELDS = [
  'release',
  'notes',
  'details',
  'color',
  'heatsink',
  'pcb',
  'primary',
  'accent',
  'textaccent',
  'superiocontroller',
  'super i/o',
  'lane-sharing',
  'bifurcation',
  'website',
  'official page',
  'official website',
  'io_image',
  'image',
  'rear i/o image',
  'rear i/o view'
];

export interface ParsedSpec {
  text: string;
  score: number;
  isNumeric: boolean;
  isEmpty: boolean;
}

export interface CellDiffStatus {
  hasDiff: boolean; // Row has any differences
  isDiff: boolean;  // This specific cell is an outlier/diff
  isBest?: boolean; // Best in row
  isWorst?: boolean; // Worst in row
  isOutlier?: boolean; // Differs from majority
  isMissing?: boolean; // Empty/placeholder
  bgStyle?: string;
  borderStyle?: string;
  badge?: string;
}

export function isFieldIgnored(fieldName: string): boolean {
  const clean = fieldName.replace(/<[^>]+>/g, '').toLowerCase();
  return IGNORED_FIELDS.some((f) => clean.includes(f));
}

export function isLowerBetter(fieldName: string): boolean {
  const clean = fieldName.replace(/<[^>]+>/g, '').toLowerCase();
  return clean.includes('msrp') || clean.includes('price') || clean.includes('cost');
}

/**
 * Parses spec text into a comparable numeric score and metadata.
 */
export function parseSpecScore(raw: unknown, fieldName: string = ''): ParsedSpec {
  const text = safeString(raw);
  if (!text || text === '-' || text.toLowerCase() === 'none' || text.toLowerCase() === 'n/a') {
    return { text: text || '-', score: -Infinity, isNumeric: false, isEmpty: true };
  }

  const fName = fieldName.replace(/<[^>]+>/g, '').toLowerCase();

  // 1. Price / MSRP
  if (isLowerBetter(fName)) {
    const num = safeNumber(text, -Infinity);
    return { text, score: num === -Infinity ? -Infinity : -num, isNumeric: num !== -Infinity, isEmpty: false };
  }

  // 2. LAN Controller speed scoring (supports multi-controller summing)
  if (fName.includes('lan')) {
    let speed = 0;
    const lower = text.toLowerCase();
    
    // Check for controllers and speeds with strict boundaries
    if (/(?:^|[^0-9.])10g(?:be)?/i.test(lower) || lower.includes('aqc113') || lower.includes('10000')) speed += 10000;
    if (/(?:^|[^0-9.])5g(?:be)?/i.test(lower) || lower.includes('rtl8126') || lower.includes('aqc111') || lower.includes('5000')) speed += 5000;
    if (/(?:^|[^0-9.])2\.5g(?:be)?/i.test(lower) || lower.includes('i225') || lower.includes('i226') || lower.includes('rtl8125') || lower.includes('2500')) speed += 2500;
    if (/(?:^|[^0-9.])1g(?:be)?/i.test(lower) || lower.includes('rtl8111') || lower.includes('i219') || lower.includes('i211') || lower.includes('1000')) speed += 1000;
    
    if (speed > 0) {
      return { text, score: speed, isNumeric: true, isEmpty: false };
    }
  }

  // 3. Wireless (Wi-Fi generation & manufacturer bonus)
  if (fName.includes('wireless') || fName.includes('wifi') || fName.includes('wi-fi')) {
    let genScore = 0;
    if (text.includes('Wi-Fi 7') || text.includes('WiFi 7') || text.includes('802.11be')) genScore = 7000;
    else if (text.includes('Wi-Fi 6E') || text.includes('WiFi 6E') || text.includes('802.11axe')) genScore = 6000;
    else if (text.includes('Wi-Fi 6') || text.includes('WiFi 6') || text.includes('802.11ax')) genScore = 5000;
    else if (text.includes('Wi-Fi 5') || text.includes('WiFi 5') || text.includes('802.11ac')) genScore = 4000;
    else if (text.includes('M.2')) genScore = 1000;

    let mfgBonus = 100;
    const lower = text.toLowerCase();
    if (lower.includes('intel') || lower.includes('killer') || lower.includes('be200') || lower.includes('ax210') || lower.includes('ax211') || lower.includes('ax200')) mfgBonus = 500;
    else if (lower.includes('qualcomm') || lower.includes('qcn') || lower.includes('ncm')) mfgBonus = 400;
    else if (lower.includes('realtek') || lower.includes('rtl')) mfgBonus = 300;
    else if (lower.includes('mediatek') || lower.includes('rz') || lower.includes('mt') || lower.includes('amd')) mfgBonus = 200;

    if (genScore > 0) {
      return { text, score: genScore + mfgBonus, isNumeric: true, isEmpty: false };
    }
  }

  // 4. VRM VCore (SPS > DrMOS > Discrete + Amperage)
  if (fName.includes('vrm') || fName.includes('vcore') || fName.includes('mosfet')) {
    let tier = 0;
    if (text.includes('SPS')) tier = 2;
    else if (text.includes('DrMOS')) tier = 1;

    const ampMatch = text.match(/(\d+)\s*A/i);
    const amps = ampMatch ? parseInt(ampMatch[1]) : 0;
    const score = (tier * 1000) + amps;
    if (score > 0) {
      return { text, score, isNumeric: true, isEmpty: false };
    }
  }

  // 5. Audio Solution
  if (fName.includes('audio') || fName.includes('codec') || fName.includes('sound')) {
    const lower = text.toLowerCase();
    let audioScore = 0;
    if (lower.includes('4082') || lower.includes('alc4082')) audioScore = 4200;
    else if (lower.includes('4080') || lower.includes('alc4080')) audioScore = 4000;
    else if (lower.includes('1220') || lower.includes('alc1220')) audioScore = 3200;
    else if (lower.includes('1200') || lower.includes('alc1200')) audioScore = 2800;
    else if (lower.includes('897') || lower.includes('alc897')) audioScore = 1500;
    else if (lower.includes('892') || lower.includes('alc892')) audioScore = 1400;
    
    if (lower.includes('ess') || lower.includes('sabre') || lower.includes('dac')) {
      audioScore += 500;
    }
    if (audioScore > 0) {
      return { text, score: audioScore, isNumeric: true, isEmpty: false };
    }
  }

  // 6. PCIe x16 Electrical slots
  if (fName.includes('x16') || (fName.includes('pcie') && fName.includes('electrical'))) {
    const slots = text.match(/(\d+)x(\d+)/g);
    if (slots) {
      let totalScore = 0;
      const maxSlots = 4;
      slots.slice(0, maxSlots).forEach((slot, index) => {
        const parts = slot.match(/(\d+)x(\d+)/);
        if (parts) {
          const gen = parseInt(parts[1]);
          const lanes = parseInt(parts[2]);
          const slotScore = (gen * 100) + lanes;
          const weight = Math.pow(1000, maxSlots - 1 - index);
          totalScore += slotScore * weight;
        }
      });
      if (totalScore > 0) {
        return { text, score: totalScore, isNumeric: true, isEmpty: false };
      }
    }
  }

  // 7. M.2 Total Slots & Bandwidth (e.g. 2*5x4 2*4x4)
  if (fName.includes('m.2')) {
    const m2Regex = /(\d+)\*(\d+)x(\d+)/g;
    let totalSlots = 0;
    let bandwidth = 0;
    let match: RegExpExecArray | null;
    let found = false;

    while ((match = m2Regex.exec(text)) !== null) {
      found = true;
      const count = parseInt(match[1]);
      const gen = parseInt(match[2]);
      const lanes = parseInt(match[3]);
      totalSlots += count;
      bandwidth += count * ((gen * 100) + lanes);
    }

    if (found) {
      return { text, score: (totalSlots * 1000000) + bandwidth, isNumeric: true, isEmpty: false };
    }

    // "X(+Y)" format
    const countMatch = text.match(/(\d+)\(\+(\d+)\)/);
    if (countMatch) {
      const onboard = parseInt(countMatch[1]);
      const extra = parseInt(countMatch[2]);
      return { text, score: ((onboard + extra) * 100) + onboard, isNumeric: true, isEmpty: false };
    }
  }

  // 8. Diagnostics / Debug rank
  if (fName.includes('debug') || fName.includes('diag') || fName.includes('flash')) {
    const lower = text.toLowerCase();
    let dScore = 0;
    if (lower.includes('lcd')) dScore += 20;
    if (lower.includes('post code') || lower.includes('post')) dScore += 10;
    if (lower.includes('debug led') || lower.includes('debug leds')) dScore += 6;
    if (lower.includes('power led')) dScore += 2;
    if (lower.includes('bios flash') || lower.includes('flash')) dScore += 5;
    if (dScore > 0) return { text, score: dScore, isNumeric: true, isEmpty: false };
  }

  // 9. Scorecard Rating (e.g. "2421 / 100" or simple rating)
  const ratingMatch = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*\d+/);
  if (ratingMatch) {
    const score = parseFloat(ratingMatch[1]);
    return { text, score, isNumeric: true, isEmpty: false };
  }

  // 10. General Numeric extraction
  const simpleInt = text.match(/^\d+$/);
  if (simpleInt) {
    return { text, score: parseInt(simpleInt[0]), isNumeric: true, isEmpty: false };
  }

  const firstNum = text.match(/(\d+(?:\.\d+)?)/);
  if (firstNum && !text.includes('/') && !text.includes(':')) {
    return { text, score: parseFloat(firstNum[1]), isNumeric: true, isEmpty: false };
  }

  return { text, score: 0, isNumeric: false, isEmpty: false };
}

/**
 * Analyzes a full row of values across compared boards and determines
 * sophisticated, non-polluting cell highlight statuses.
 */
export function analyzeRowCells(
  rowLabel: string,
  rawValues: unknown[]
): CellDiffStatus[] {
  const n = rawValues.length;
  if (n <= 1) {
    return rawValues.map(() => ({ hasDiff: false, isDiff: false }));
  }

  // If row is in ignored fields (notes, colors, release, etc.), never highlight
  if (isFieldIgnored(rowLabel)) {
    return rawValues.map(() => ({ hasDiff: false, isDiff: false }));
  }

  // Parse all values
  const parsed = rawValues.map((v) => parseSpecScore(v, rowLabel));

  // Check if all normalized values are identical
  const normalizedTexts = parsed.map((p) => p.isEmpty ? '__EMPTY__' : p.text.trim().toLowerCase());
  const first = normalizedTexts[0];
  const allIdentical = normalizedTexts.every((t) => t === first);

  if (allIdentical) {
    return rawValues.map(() => ({ hasDiff: false, isDiff: false }));
  }

  // Row HAS differences!
  // Find majority text/value
  const textCounts = new Map<string, number>();
  normalizedTexts.forEach((t) => {
    textCounts.set(t, (textCounts.get(t) || 0) + 1);
  });

  let majorityText = '';
  let maxCount = 0;
  textCounts.forEach((count, text) => {
    if (count > maxCount) {
      maxCount = count;
      majorityText = text;
    }
  });

  const hasNumeric = parsed.some((p) => p.isNumeric);
  const lowerBetter = isLowerBetter(rowLabel);
  const bestBadge = lowerBetter ? 'Lowest' : 'Best';
  const worstBadge = lowerBetter ? 'Highest' : 'Lowest';

  // If numeric scoring is possible
  if (hasNumeric) {
    const numericScores = parsed.filter((p) => p.isNumeric).map((p) => p.score);
    const maxScore = Math.max(...numericScores);
    const minScore = Math.min(...numericScores);

    // Find majority score
    const scoreCounts = new Map<number, number>();
    parsed.forEach((p) => {
      if (p.isNumeric) {
        scoreCounts.set(p.score, (scoreCounts.get(p.score) || 0) + 1);
      }
    });

    let majorityScore: number | null = null;
    let maxScoreCount = 0;
    scoreCounts.forEach((count, s) => {
      if (count > maxScoreCount) {
        maxScoreCount = count;
        majorityScore = s;
      }
    });

    const hasClearMajority = maxScoreCount > 1;

    return parsed.map((p) => {
      if (p.isEmpty) {
        return {
          hasDiff: true,
          isDiff: true,
          isMissing: true,
          bgStyle: 'rgba(255, 255, 255, 0.02)',
          borderStyle: 'none'
        };
      }

      if (p.isNumeric) {
        // If there is a clear majority and this cell matches the majority, DO NOT highlight!
        if (hasClearMajority && p.score === majorityScore) {
          return { hasDiff: true, isDiff: false };
        }

        // If this is the best score in the lineup
        if (p.score === maxScore && maxScore !== minScore) {
          return {
            hasDiff: true,
            isDiff: true,
            isBest: true,
            bgStyle: 'rgba(32, 201, 151, 0.14)',
            borderStyle: '3px solid #20c997',
            badge: bestBadge
          };
        }

        // If this is significantly lower / worst than the rest
        if (p.score === minScore && maxScore !== minScore && p.score !== majorityScore) {
          return {
            hasDiff: true,
            isDiff: true,
            isWorst: true,
            bgStyle: 'rgba(220, 53, 69, 0.12)',
            borderStyle: '3px solid #dc3545',
            badge: worstBadge
          };
        }

        // Intermediate difference
        return {
          hasDiff: true,
          isDiff: true,
          isOutlier: true,
          bgStyle: 'rgba(255, 193, 7, 0.12)',
          borderStyle: '3px solid #ffc107'
        };
      }

      // Non-numeric fallback in a partially-numeric row
      const isOutlier = maxCount > 1 ? p.text.trim().toLowerCase() !== majorityText : true;
      if (!isOutlier) return { hasDiff: true, isDiff: false };

      return {
        hasDiff: true,
        isDiff: true,
        isOutlier: true,
        bgStyle: 'rgba(255, 193, 7, 0.12)',
        borderStyle: '3px solid #ffc107'
      };
    });
  }

  // Non-numeric rows (e.g. Form Factor, Chipset, Audio Codec string, etc.)
  return parsed.map((p) => {
    if (p.isEmpty) {
      return {
        hasDiff: true,
        isDiff: true,
        isMissing: true,
        bgStyle: 'rgba(255, 255, 255, 0.02)',
        borderStyle: 'none'
      };
    }

    const norm = p.text.trim().toLowerCase();
    const isOutlier = maxCount > 1 ? norm !== majorityText : true;

    if (!isOutlier) {
      // Cell matches the majority: keep clean and unhighlighted!
      return { hasDiff: true, isDiff: false };
    }

    // Outlier cell: highlight with subtle amber accent
    return {
      hasDiff: true,
      isDiff: true,
      isOutlier: true,
      bgStyle: 'rgba(255, 193, 7, 0.14)',
      borderStyle: '3px solid #ffc107'
    };
  });
}

export interface BaselineDelta {
  text: string;
  positive: boolean | null;
}

/**
 * Computes a human-readable relative delta between a current motherboard cell value
 * and the designated baseline motherboard value.
 */
export function computeBaselineDelta(
  rowLabel: string,
  currentVal: unknown,
  baselineVal: unknown
): BaselineDelta | null {
  if (currentVal == null || baselineVal == null) return null;
  if (isFieldIgnored(rowLabel)) return null;

  const curStr = safeString(currentVal).trim();
  const baseStr = safeString(baselineVal).trim();

  if (!curStr || !baseStr || curStr === '-' || baseStr === '-') return null;
  if (curStr.toLowerCase() === baseStr.toLowerCase()) return null;

  const fName = rowLabel.replace(/<[^>]+>/g, '').toLowerCase();

  // 1. Price / MSRP (lower is better)
  if (isLowerBetter(fName)) {
    const curNum = safeNumber(curStr.replace(/[^0-9.]/g, ''), NaN);
    const baseNum = safeNumber(baseStr.replace(/[^0-9.]/g, ''), NaN);
    if (!isNaN(curNum) && !isNaN(baseNum)) {
      const diff = curNum - baseNum;
      if (diff === 0) return null;
      if (diff > 0) {
        return { text: `+$${diff.toFixed(0)}`, positive: false };
      } else {
        return { text: `-$${Math.abs(diff).toFixed(0)}`, positive: true };
      }
    }
  }

  // 2. Pure integers / counts (USB rear count, M.2 count, RAM slots, fan headers, ARGB headers, SATA)
  const isCountField =
    fName.includes('usb rear') ||
    fName.includes('fan') ||
    fName.includes('argb') ||
    fName.includes('ram slots') ||
    fName.includes('m.2 slots') ||
    fName.includes('sata');

  if (isCountField) {
    const curIntMatch = curStr.match(/^(\d+)/);
    const baseIntMatch = baseStr.match(/^(\d+)/);
    if (curIntMatch && baseIntMatch) {
      const curInt = parseInt(curIntMatch[1], 10);
      const baseInt = parseInt(baseIntMatch[1], 10);
      const diff = curInt - baseInt;
      if (diff !== 0) {
        const sign = diff > 0 ? `+${diff}` : `${diff}`;
        let unit = '';
        if (fName.includes('usb')) unit = ' ports';
        else if (fName.includes('m.2')) unit = ' M.2';
        else if (fName.includes('fan')) unit = ' fans';
        else if (fName.includes('argb')) unit = ' ARGB';
        else if (fName.includes('sata')) unit = ' SATA';
        return { text: `${sign}${unit}`, positive: diff > 0 };
      }
    }
  }

  // 3. Max RAM Capacity (e.g. 192 GB vs 128 GB)
  if (fName.includes('capacity') || fName.includes('max_ram')) {
    const curGb = safeNumber(curStr.replace(/[^0-9]/g, ''), NaN);
    const baseGb = safeNumber(baseStr.replace(/[^0-9]/g, ''), NaN);
    if (!isNaN(curGb) && !isNaN(baseGb)) {
      const diff = curGb - baseGb;
      if (diff !== 0) {
        return { text: `${diff > 0 ? `+${diff}` : diff} GB`, positive: diff > 0 };
      }
    }
  }

  // 4. VRM, LAN, Wireless, Audio, Diagnostics via parseSpecScore
  const curParsed = parseSpecScore(curStr, fName);
  const baseParsed = parseSpecScore(baseStr, fName);

  if (curParsed.isNumeric && baseParsed.isNumeric && !curParsed.isEmpty && !baseParsed.isEmpty) {
    const scoreDiff = curParsed.score - baseParsed.score;
    if (scoreDiff !== 0) {
      if (fName.includes('wireless') || fName.includes('wifi')) {
        const curGen = curStr.includes('7') ? 'Wi-Fi 7' : (curStr.includes('6E') ? '6E' : '6');
        const baseGen = baseStr.includes('7') ? 'Wi-Fi 7' : (baseStr.includes('6E') ? '6E' : '6');
        return {
          text: scoreDiff > 0 ? `Upgrade (${curGen} vs ${baseGen})` : `Downgrade (${curGen} vs ${baseGen})`,
          positive: scoreDiff > 0
        };
      }
      if (fName.includes('lan')) {
        return {
          text: scoreDiff > 0 ? 'Faster LAN' : 'Slower LAN',
          positive: scoreDiff > 0
        };
      }
      if (fName.includes('audio')) {
        return {
          text: scoreDiff > 0 ? 'Better Audio' : 'Basic Audio',
          positive: scoreDiff > 0
        };
      }
      if (fName.includes('vrm') || fName.includes('vcore')) {
        return {
          text: scoreDiff > 0 ? 'Heavier VRM' : 'Lighter VRM',
          positive: scoreDiff > 0
        };
      }
      return {
        text: scoreDiff > 0 ? 'Better' : 'Lower',
        positive: scoreDiff > 0
      };
    }
  }

  return null;
}

