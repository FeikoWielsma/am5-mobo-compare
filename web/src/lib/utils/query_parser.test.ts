import { describe, it, expect } from 'vitest';
import { parseSearchQuery, matchesQuery, type ParsedQuery } from './query_parser';

describe('Query Parser - parseSearchQuery', () => {
  it('parses numeric comparisons correctly', () => {
    const q1 = parseSearchQuery('price<400');
    expect(q1.numericFilters).toEqual([
      { field: 'price', operator: '<', value: 400, raw: 'price<400' }
    ]);

    const q2 = parseSearchQuery('price>200');
    expect(q2.numericFilters).toEqual([
      { field: 'price', operator: '>', value: 200, raw: 'price>200' }
    ]);

    const q3 = parseSearchQuery('price<=350');
    expect(q3.numericFilters).toEqual([
      { field: 'price', operator: '<=', value: 350, raw: 'price<=350' }
    ]);

    const q4 = parseSearchQuery('m2>=4');
    expect(q4.numericFilters).toEqual([
      { field: 'm2', operator: '>=', value: 4, raw: 'm2>=4' }
    ]);

    const q5 = parseSearchQuery('m2>3');
    expect(q5.numericFilters).toEqual([
      { field: 'm2', operator: '>', value: 3, raw: 'm2>3' }
    ]);

    const q6 = parseSearchQuery('sata>=6');
    expect(q6.numericFilters).toEqual([
      { field: 'sata', operator: '>=', value: 6, raw: 'sata>=6' }
    ]);

    const q7 = parseSearchQuery('phases>=16');
    expect(q7.numericFilters).toEqual([
      { field: 'phases', operator: '>=', value: 16, raw: 'phases>=16' }
    ]);
  });

  it('handles currency dollar signs and spaces around comparison operators', () => {
    const q = parseSearchQuery('price <= $499.99 m2 > 2');
    expect(q.numericFilters).toContainEqual({
      field: 'price',
      operator: '<=',
      value: 499.99,
      raw: 'price<=$499.99'
    });
    expect(q.numericFilters).toContainEqual({
      field: 'm2',
      operator: '>',
      value: 2,
      raw: 'm2>2'
    });
  });

  it('parses key-value filters correctly', () => {
    const q = parseSearchQuery('chipset:x870e brand:asrock form_factor:itx wifi:7 lan:10g');
    expect(q.keyValueFilters).toEqual([
      { key: 'chipset', value: 'x870e', raw: 'chipset:x870e' },
      { key: 'brand', value: 'asrock', raw: 'brand:asrock' },
      { key: 'form_factor', value: 'itx', raw: 'form_factor:itx' },
      { key: 'wifi', value: '7', raw: 'wifi:7' },
      { key: 'lan', value: '10g', raw: 'lan:10g' }
    ]);
  });

  it('parses boolean presence flags (has:..., no:... and boolean values)', () => {
    const q = parseSearchQuery('has:bifurcation has:usb4 no:wifi has:ecc');
    expect(q.booleanFilters).toEqual([
      { key: 'bifurcation', value: true, raw: 'has:bifurcation' },
      { key: 'usb4', value: true, raw: 'has:usb4' },
      { key: 'wifi', value: false, raw: 'no:wifi' },
      { key: 'ecc', value: true, raw: 'has:ecc' }
    ]);
  });

  it('parses free-text fallback and quoted phrases', () => {
    const q = parseSearchQuery('taichi "Steel Legend" white');
    expect(q.freeText).toEqual(['taichi', 'Steel Legend', 'white']);
  });

  it('parses complex mixed queries with all token types', () => {
    const query = 'brand:msi chipset:b650 price<300 m2>=3 has:wifi no:bifurcation tomahawk';
    const parsed = parseSearchQuery(query);

    expect(parsed.keyValueFilters).toEqual([
      { key: 'brand', value: 'msi', raw: 'brand:msi' },
      { key: 'chipset', value: 'b650', raw: 'chipset:b650' }
    ]);
    expect(parsed.numericFilters).toEqual([
      { field: 'price', operator: '<', value: 300, raw: 'price<300' },
      { field: 'm2', operator: '>=', value: 3, raw: 'm2>=3' }
    ]);
    expect(parsed.booleanFilters).toEqual([
      { key: 'wifi', value: true, raw: 'has:wifi' },
      { key: 'bifurcation', value: false, raw: 'no:bifurcation' }
    ]);
    expect(parsed.freeText).toEqual(['tomahawk']);
  });

  it('handles empty and whitespace-only queries defensively', () => {
    const empty1 = parseSearchQuery('');
    expect(empty1.numericFilters).toEqual([]);
    expect(empty1.keyValueFilters).toEqual([]);
    expect(empty1.booleanFilters).toEqual([]);
    expect(empty1.freeText).toEqual([]);

    const empty2 = parseSearchQuery('    ');
    expect(empty2.numericFilters).toEqual([]);
    expect(empty2.keyValueFilters).toEqual([]);
    expect(empty2.booleanFilters).toEqual([]);
    expect(empty2.freeText).toEqual([]);
  });

  it('handles uppercase and alias variations gracefully', () => {
    const q = parseSearchQuery('PRICE<400 BRAND:ASUS HAS:BIFURCATION NO:WIFI FF:MATX');
    expect(q.numericFilters[0]).toMatchObject({ field: 'price', operator: '<', value: 400 });
    expect(q.keyValueFilters).toContainEqual({ key: 'brand', value: 'ASUS', raw: 'BRAND:ASUS' });
    expect(q.keyValueFilters).toContainEqual({ key: 'form_factor', value: 'MATX', raw: 'FF:MATX' });
    expect(q.booleanFilters).toContainEqual({ key: 'bifurcation', value: true, raw: 'HAS:BIFURCATION' });
    expect(q.booleanFilters).toContainEqual({ key: 'wifi', value: false, raw: 'NO:WIFI' });
  });
});

describe('Query Parser - matchesQuery', () => {
  const sampleBoard = {
    id: 'ASRock_X870E_Taichi',
    brand: 'ASRock',
    chipset: 'X870E',
    model: 'X870E Taichi',
    form_factor: 'E-ATX',
    typed: {
      price_usd: 449.99,
      m2_total: { count: 4, bonus: 0, total: 4, raw: '4' },
      sata_ports: 6,
      vrm_phases: { raw: '24+2+1', vcore_phases: 24, soc_phases: 2, misc_phases: 1, total_phases: 27 },
      wireless: 'Wi-Fi 7 (802.11be)',
      lan_controllers: 'Realtek RTL8126 5GbE + Marvell AQtion 10GbE',
      usb_c_usb4_40g: 2,
      pcie_x16_lanes: '16x or 8x/8x',
      ecc_support: 'Multi-bit ECC',
      notes_details: 'Primary PCIe slot bifurcates to x8/x8 for dual GPU.'
    },
    specs: {
      General: { Market: { 'A-MSRP (USD)': 449.99 } },
      _scorecard: {
        usb_details: { type_c: { usb4_40g: 2 } },
        lan_badges: [{ speed: 10000, label: '10G' }, { speed: 5000, label: '5G' }]
      }
    }
  };

  const budgetBoard = {
    id: 'MSI_PRO_B650M_P',
    brand: 'MSI',
    chipset: 'B650',
    model: 'PRO B650M-P',
    form_factor: 'Micro-ATX',
    typed: {
      price_usd: 119.99,
      m2_total: 2,
      sata_ports: 4,
      vrm_phases: { raw: '8+2+1', vcore_phases: 8, soc_phases: 2, misc_phases: 1, total_phases: 11 },
      wireless: 'No',
      lan_controllers: 'Realtek RTL8125BG 2.5GbE',
      usb_c_usb4_40g: 0,
      pcie_x16_lanes: '16x',
      ecc_support: 'No',
      notes_details: 'Standard budget office board without bifurcation.'
    }
  };

  const itxBoard = {
    id: 'ASUS_ROG_STRIX_B650E_I',
    brand: 'ASUS',
    chipset: 'B650E',
    model: 'ROG STRIX B650E-I GAMING WIFI',
    form_factor: 'Mini-ITX',
    typed: {
      price_usd: 329.99,
      m2_total: 2,
      sata_ports: 2,
      vrm_phases: { raw: '10+2+1', vcore_phases: 10, soc_phases: 2, misc_phases: 1, total_phases: 13 },
      wireless: 'Wi-Fi 6E (802.11ax)',
      lan_controllers: 'Intel I225-V 2.5GbE',
      usb_c_usb4_40g: 0,
      pcie_x16_lanes: '16x',
      ecc_support: 'Supported',
      notes_details: 'Compact ITX layout for SFF builds.'
    }
  };

  describe('Numeric comparisons', () => {
    it('matches price comparisons (price<, price>, price<=)', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('price<500'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('price<400'))).toBe(false);
      expect(matchesQuery(sampleBoard, parseSearchQuery('price>200'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('price<=449.99'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('price<=120'))).toBe(true);
    });

    it('matches M.2 slot comparisons (m2>=4, m2>3)', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('m2>=4'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('m2>3'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('m2>4'))).toBe(false);
      expect(matchesQuery(budgetBoard, parseSearchQuery('m2>=4'))).toBe(false);
    });

    it('matches SATA comparisons (sata>=6)', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('sata>=6'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('sata>=6'))).toBe(false);
      expect(matchesQuery(itxBoard, parseSearchQuery('sata<=2'))).toBe(true);
    });

    it('matches VRM phases comparisons (phases>=16)', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('phases>=16'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('phases>=24'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('phases>=16'))).toBe(false);
      expect(matchesQuery(budgetBoard, parseSearchQuery('phases<=12'))).toBe(true);
    });
  });

  describe('Key-Value filters', () => {
    it('matches chipset:x870e and chipset:b650', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('chipset:x870e'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('chipset:b650'))).toBe(false);
      expect(matchesQuery(budgetBoard, parseSearchQuery('chipset:b650'))).toBe(true);
    });

    it('matches brand:asrock and brand:msi', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('brand:asrock'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('brand:msi'))).toBe(false);
      expect(matchesQuery(budgetBoard, parseSearchQuery('brand:msi'))).toBe(true);
    });

    it('matches form_factor:itx, form_factor:matx, form_factor:eatx', () => {
      expect(matchesQuery(itxBoard, parseSearchQuery('form_factor:itx'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('form_factor:matx'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('form_factor:eatx'))).toBe(true);
    });

    it('matches wifi:7 and wifi:6e', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('wifi:7'))).toBe(true);
      expect(matchesQuery(itxBoard, parseSearchQuery('wifi:7'))).toBe(false);
      expect(matchesQuery(itxBoard, parseSearchQuery('wifi:6e'))).toBe(true);
    });

    it('matches lan:10g and lan:2.5g', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('lan:10g'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('lan:10g'))).toBe(false);
      expect(matchesQuery(budgetBoard, parseSearchQuery('lan:2.5g'))).toBe(true);
    });
  });

  describe('Boolean presence flags', () => {
    it('evaluates has:bifurcation and no:bifurcation', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('has:bifurcation'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('no:bifurcation'))).toBe(false);
      expect(matchesQuery(budgetBoard, parseSearchQuery('no:bifurcation'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('has:bifurcation'))).toBe(false);
    });

    it('evaluates has:usb4 and no:usb4', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('has:usb4'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('no:usb4'))).toBe(false);
      expect(matchesQuery(budgetBoard, parseSearchQuery('no:usb4'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('has:usb4'))).toBe(false);
    });

    it('evaluates has:wifi and no:wifi', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('has:wifi'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('no:wifi'))).toBe(false);
      expect(matchesQuery(budgetBoard, parseSearchQuery('no:wifi'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('has:wifi'))).toBe(false);
    });

    it('evaluates has:ecc and no:ecc', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('has:ecc'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('no:ecc'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('has:ecc'))).toBe(false);
      expect(matchesQuery(itxBoard, parseSearchQuery('has:ecc'))).toBe(true);
    });
  });

  describe('Free-text fallback', () => {
    it('matches model name', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('taichi'))).toBe(true);
      expect(matchesQuery(budgetBoard, parseSearchQuery('b650m-p'))).toBe(true);
    });

    it('matches brand name', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('asrock'))).toBe(true);
      expect(matchesQuery(itxBoard, parseSearchQuery('asus'))).toBe(true);
    });

    it('matches text inside notes_details', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('bifurcates'))).toBe(true);
      expect(matchesQuery(itxBoard, parseSearchQuery('sff'))).toBe(true);
    });

    it('requires all free-text terms to match (AND logic)', () => {
      expect(matchesQuery(sampleBoard, parseSearchQuery('asrock taichi'))).toBe(true);
      expect(matchesQuery(sampleBoard, parseSearchQuery('asrock intel'))).toBe(false);
    });
  });

  describe('Complex combinations and edge cases', () => {
    it('matches complex query with numeric, kv, boolean, and free-text', () => {
      const q = 'brand:asrock chipset:x870e price<500 m2>=4 sata>=6 has:bifurcation has:usb4 wifi:7 lan:10g taichi';
      expect(matchesQuery(sampleBoard, parseSearchQuery(q))).toBe(true);
    });

    it('fails if even one condition does not match', () => {
      // price<400 fails on 449.99 board
      const q = 'brand:asrock chipset:x870e price<400 m2>=4 has:usb4 taichi';
      expect(matchesQuery(sampleBoard, parseSearchQuery(q))).toBe(false);
    });

    it('handles boards with missing properties defensively without crashing', () => {
      const sparseBoard = { id: 'sparse', model: 'Minimal' };
      expect(matchesQuery(sparseBoard, parseSearchQuery('price<200'))).toBe(false);
      expect(matchesQuery(sparseBoard, parseSearchQuery('has:wifi'))).toBe(false);
      expect(matchesQuery(sparseBoard, parseSearchQuery('no:wifi'))).toBe(true);
      expect(matchesQuery(sparseBoard, parseSearchQuery('Minimal'))).toBe(true);
    });
  });
});
