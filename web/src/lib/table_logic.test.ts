import { describe, it, expect } from 'vitest';
import {
  safeString,
  safeNumber,
  safeArray,
  parseNotesList,
  parseM2Generations,
  m2GenBadgeClass,
  getNestedValue,
  matchesX8X8,
  matchesGlobalSearch,
  matchesQuickFilters,
  filterMobos,
  sortRows,
  availableValuesFor,
  matchesFuzzyQuery,
  type DynamicColumn,
  type SortState
} from './table_logic';

describe('Defensive primitives', () => {
  it('safeString converts null, undefined, numbers, and strings safely', () => {
    expect(safeString(null)).toBe('');
    expect(safeString(undefined)).toBe('');
    expect(safeString('')).toBe('');
    expect(safeString('  hello world  ')).toBe('hello world');
    expect(safeString(42)).toBe('42');
    expect(safeString(0)).toBe('0');
    expect(safeString(true)).toBe('true');
  });

  it('safeNumber parses numbers and strings with currency/units safely', () => {
    expect(safeNumber(null)).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber('')).toBe(0);
    expect(safeNumber(129.99)).toBe(129.99);
    expect(safeNumber('$499.00')).toBe(499.0);
    expect(safeNumber('60A')).toBe(60);
    expect(safeNumber('invalid', 99)).toBe(99);
  });

  it('safeArray handles arrays, non-arrays, and nulls', () => {
    expect(safeArray(null)).toEqual([]);
    expect(safeArray(undefined)).toEqual([]);
    expect(safeArray([1, 2, 3])).toEqual([1, 2, 3]);
    expect(safeArray('item')).toEqual(['item']);
  });
});

describe('parseNotesList', () => {
  it('splits notes on newlines and bullet dashes', () => {
    const raw = '- First note point\n- Second note point\n- Third note point';
    expect(parseNotesList(raw)).toEqual([
      'First note point',
      'Second note point',
      'Third note point'
    ]);
  });

  it('handles dash-separated points on a single line', () => {
    const raw = 'Point one - Point two - Point three';
    expect(parseNotesList(raw)).toEqual([
      'Point one',
      'Point two',
      'Point three'
    ]);
  });

  it('handles empty, null, numeric, or placeholder dashes safely without crashing', () => {
    expect(parseNotesList(null)).toEqual([]);
    expect(parseNotesList(undefined)).toEqual([]);
    expect(parseNotesList('-')).toEqual([]);
    expect(parseNotesList(12345)).toEqual(['12345']);
  });
});

describe('parseM2Generations', () => {
  it('splits space-separated M.2 configurations into generation tokens', () => {
    const raw = '2*5x4 2*4x4 1*4x2 1*3x4';
    expect(parseM2Generations(raw)).toEqual(['2*5x4', '2*4x4', '1*4x2', '1*3x4']);
  });

  it('preserves special strings like "see note" and "none"', () => {
    expect(parseM2Generations('see note')).toEqual(['see note']);
    expect(parseM2Generations('None')).toEqual(['None']);
  });

  it('handles null, undefined, empty, and numeric types safely', () => {
    expect(parseM2Generations(null)).toEqual([]);
    expect(parseM2Generations(undefined)).toEqual([]);
    expect(parseM2Generations('-')).toEqual([]);
    expect(parseM2Generations(4)).toEqual(['4']);
  });
});

describe('m2GenBadgeClass', () => {
  it('assigns badge classes according to PCIe generation', () => {
    expect(m2GenBadgeClass('2*5x4')).toContain('bg-primary');
    expect(m2GenBadgeClass('2*4x4')).toContain('bg-info');
    expect(m2GenBadgeClass('1*3x4')).toContain('bg-secondary');
    expect(m2GenBadgeClass('custom')).toContain('bg-dark');
  });
});

describe('getNestedValue', () => {
  const sampleMobo = {
    id: 'test-board',
    brand: 'ASRock',
    chipset: 'B650',
    model: 'Steel Legend',
    specs: {
      General: {
        Market: {
          'A-MSRP (USD)': 229
        },
        Audio: {
          'Audio Codec+DAC': 'Realtek ALC1220'
        }
      }
    },
    typed: {
      lan_controllers: 'Realtek RTL8125BG'
    }
  };

  it('retrieves nested spec values using pipe notation', () => {
    expect(getNestedValue(sampleMobo, 'General|Market|A-MSRP (USD)')).toBe('229');
    expect(getNestedValue(sampleMobo, 'General|Audio|Audio Codec+DAC')).toBe('Realtek ALC1220');
  });

  it('falls back to typed properties or "-" if missing', () => {
    expect(getNestedValue(sampleMobo, 'brand')).toBe('ASRock');
    expect(getNestedValue(sampleMobo, 'NonExistent|Field')).toBe('-');
    expect(getNestedValue(null, 'brand')).toBe('-');
  });
});

describe('PCIe x8/x8 bifurcation detection', () => {
  it('detects x8/x8 bifurcation in typed lanes or nested specs', () => {
    const moboWithBifurcation = {
      typed: { pcie_x16_lanes: '16x or 8x/8x' }
    };
    const moboWithoutBifurcation = {
      typed: { pcie_x16_lanes: '16x' }
    };

    expect(matchesX8X8(moboWithBifurcation)).toBe(true);
    expect(matchesX8X8(moboWithoutBifurcation)).toBe(false);
  });
});

describe('matchesGlobalSearch', () => {
  const mobo = {
    brand: 'ASRock',
    chipset: 'B650E',
    model: 'Taichi Lite',
    form_factor: 'E-ATX',
    typed: {
      audio_codec: 'Realtek ALC4082',
      lan_controllers: 'Killer E3100G 2.5G',
      pcie_x16_lanes: '16x or 8x/8x'
    }
  };

  it('matches multi-word queries in any order', () => {
    expect(matchesGlobalSearch(mobo, 'Taichi B650E')).toBe(true);
    expect(matchesGlobalSearch(mobo, 'asrock alc4082')).toBe(true);
    expect(matchesGlobalSearch(mobo, 'intel')).toBe(false);
  });

  it('supports smart x8/x8 alias in global search', () => {
    expect(matchesGlobalSearch(mobo, 'x8/x8')).toBe(true);
    expect(matchesGlobalSearch(mobo, 'bifurcation')).toBe(true);
  });
});

describe('filterMobos and sortRows', () => {
  const mobos = [
    {
      id: 'board-1',
      brand: 'ASUS',
      chipset: 'X670E',
      model: 'ROG Crosshair Extreme',
      form_factor: 'E-ATX',
      specs: { General: { Market: { 'A-MSRP (USD)': 999 } } }
    },
    {
      id: 'board-2',
      brand: 'MSI',
      chipset: 'B650',
      model: 'PRO B650-P WIFI',
      form_factor: 'ATX',
      specs: { General: { Market: { 'A-MSRP (USD)': 199 } } }
    },
    {
      id: 'board-3',
      brand: 'Gigabyte',
      chipset: 'A620',
      model: 'A620M GAMING X',
      form_factor: 'Micro-ATX',
      specs: { General: { Market: { 'A-MSRP (USD)': 119 } } }
    }
  ];

  it('filters boards by chipset and brand', () => {
    const filtered = filterMobos(mobos, {
      filters: { chipset: ['B650', 'X670E'] }
    });
    expect(filtered.map((m) => m.id)).toEqual(['board-1', 'board-2']);
  });

  it('sorts boards by price ascending and descending', () => {
    const priceKey = 'General|Market|A-MSRP (USD)';
    const dynKeys = { dyn1: priceKey };

    const sortedAsc = sortRows(mobos, { column: 'dyn1', direction: 'asc' }, dynKeys);
    expect(sortedAsc.map((m) => m.id)).toEqual(['board-3', 'board-2', 'board-1']);

    const sortedDesc = sortRows(mobos, { column: 'dyn1', direction: 'desc' }, dynKeys);
    expect(sortedDesc.map((m) => m.id)).toEqual(['board-1', 'board-2', 'board-3']);
  });

  it('calculates available values and counts for faceted dropdowns', () => {
    const { available, counts } = availableValuesFor(mobos, 'brand', {
      filters: { chipset: ['B650'] }
    });
    expect(available.has('MSI')).toBe(true);
    expect(available.has('ASUS')).toBe(false);
    expect(counts.get('MSI')).toBe(1);
  });
});

describe('Fuzzy search query matching', () => {
  it('normalizes punctuation, hyphens, and whitespace', () => {
    expect(matchesFuzzyQuery('General > Networking > M.2 Wi-Fi slot', 'wifi')).toBe(true);
    expect(matchesFuzzyQuery('General > Networking > M.2 Wi-Fi slot', 'wi-fi')).toBe(true);
    expect(matchesFuzzyQuery('Expansion > PCIe Slots > Physical x16', 'pci-e')).toBe(true);
    expect(matchesFuzzyQuery('General > Networking > Ethernet > # RJ-45', 'rj45')).toBe(true);
    expect(matchesFuzzyQuery('General > Audio > S/PDIF', 'spdif')).toBe(true);
  });

  it('matches multi-token terms regardless of order', () => {
    expect(matchesFuzzyQuery('General > Audio > Audio Codec+DAC', 'audio codec')).toBe(true);
    expect(matchesFuzzyQuery('General > Audio > Audio Codec+DAC', 'codec audio')).toBe(true);
    expect(matchesFuzzyQuery('General > Audio > Audio Codec+DAC', 'bluetooth')).toBe(false);
  });
});

describe('Aesthetic and Build-Theme Smart Filters', () => {
  it('matches white and silver themed motherboards', () => {
    const whiteBoard = {
      model: 'B650 AORUS ELITE AX ICE',
      specs: { Color: { Heatsink: { Primary: 'White' }, PCB: { Primary: 'White' } } }
    };
    const silverBoard = {
      model: 'ROG STRIX B650-A GAMING WIFI',
      specs: { Color: { Heatsink: { Primary: 'Silver' }, PCB: { Primary: 'Black' } } }
    };
    const blackBoard = {
      model: 'MAG B650 TOMAHAWK WIFI',
      specs: { Color: { Heatsink: { Primary: 'Black' }, PCB: { Primary: 'Black' } } }
    };

    expect(matchesQuickFilters(whiteBoard, { whiteTheme: true })).toBe(true);
    expect(matchesQuickFilters(silverBoard, { whiteTheme: true })).toBe(true);
    expect(matchesQuickFilters(blackBoard, { whiteTheme: true })).toBe(false);

    expect(matchesQuickFilters(blackBoard, { blackTheme: true })).toBe(true);
    expect(matchesQuickFilters(whiteBoard, { blackTheme: true })).toBe(false);
  });

  it('matches back-connect BTF and Project Zero boards', () => {
    const btf = { model: 'TUF GAMING B650-BTF WIFI' };
    const pz = { model: 'B650M PROJECT ZERO' };
    const standard = { model: 'B650 GAMING PLUS WIFI' };

    expect(matchesQuickFilters(btf, { backConnect: true })).toBe(true);
    expect(matchesQuickFilters(pz, { backConnect: true })).toBe(true);
    expect(matchesQuickFilters(standard, { backConnect: true })).toBe(false);
  });

  it('matches 2-DIMM memory overclocking motherboards', () => {
    const twoDimm = { model: 'X870E Taichi OCF', typed: { ram_slots: 2 } };
    const fourDimm = { model: 'X870E Hero', typed: { ram_slots: 4 } };

    expect(matchesQuickFilters(twoDimm, { twoDimm: true })).toBe(true);
    expect(matchesQuickFilters(fourDimm, { twoDimm: true })).toBe(false);
  });

  it('strictly excludes vivid accents from true stealth all-black filter', () => {
    const goldTaichi = {
      model: 'X870E Taichi',
      specs: { Color: { Heatsink: { Primary: 'Black', 'Text/Accent': 'Gold' }, PCB: { Primary: 'Black' } } }
    };
    const stealthTaichi = {
      model: 'X870E Stealth Edition',
      specs: { Color: { Heatsink: { Primary: 'Black', 'Text/Accent': '-' }, PCB: { Primary: 'Black' } } }
    };
    const limeTomahawk = {
      model: 'MAG X870E TOMAHAWK WIFI',
      specs: { Color: { Heatsink: { Primary: 'Dark Gray', 'Text/Accent': 'Lime' }, PCB: { Primary: 'Black' } } }
    };

    expect(matchesQuickFilters(stealthTaichi, { blackTheme: true })).toBe(true);
    expect(matchesQuickFilters(goldTaichi, { blackTheme: true })).toBe(false);
    expect(matchesQuickFilters(limeTomahawk, { blackTheme: true })).toBe(false);
  });

  it('matches granular color and aesthetic presets correctly', () => {
    const goldTaichi = {
      model: 'X870E Taichi',
      specs: { Color: { Heatsink: { Primary: 'Black', 'Text/Accent': 'Gold' }, PCB: { Primary: 'Black' } } }
    };
    const pureWhiteIce = {
      model: 'B650 AORUS ELITE AX ICE',
      specs: { Color: { Heatsink: { Primary: 'White' }, PCB: { Primary: 'White' } } }
    };
    const limeTomahawk = {
      model: 'MAG X870E TOMAHAWK WIFI',
      specs: { Color: { Heatsink: { Primary: 'Dark Gray', 'Text/Accent': 'Lime' }, PCB: { Primary: 'Black' } } }
    };

    expect(matchesQuickFilters(goldTaichi, { colorTheme: 'black_gold' })).toBe(true);
    expect(matchesQuickFilters(goldTaichi, { colorTheme: 'black_lime' })).toBe(false);
    expect(matchesQuickFilters(pureWhiteIce, { colorTheme: 'white_pcb' })).toBe(true);
    expect(matchesQuickFilters(limeTomahawk, { colorTheme: 'black_lime' })).toBe(true);
  });
});

