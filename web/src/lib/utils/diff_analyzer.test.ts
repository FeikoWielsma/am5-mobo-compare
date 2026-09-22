import { describe, it, expect } from 'vitest';
import {
  isFieldIgnored,
  isLowerBetter,
  parseSpecScore,
  analyzeRowCells,
  computeBaselineDelta
} from './diff_analyzer';

describe('diff_analyzer', () => {
  describe('isFieldIgnored', () => {
    it('ignores notes, release date, cosmetic colors, websites, and images', () => {
      expect(isFieldIgnored('Notes & Details')).toBe(true);
      expect(isFieldIgnored('Release Date')).toBe(true);
      expect(isFieldIgnored('PCB Color')).toBe(true);
      expect(isFieldIgnored('Official Website')).toBe(true);
      expect(isFieldIgnored('Official Page')).toBe(true);
      expect(isFieldIgnored('Rear I/O Image')).toBe(true);
      expect(isFieldIgnored('Heatsink Color')).toBe(true);
    });

    it('does not ignore key functional specifications', () => {
      expect(isFieldIgnored('VRM (VCore)')).toBe(false);
      expect(isFieldIgnored('LAN Controller')).toBe(false);
      expect(isFieldIgnored('Audio Solution')).toBe(false);
      expect(isFieldIgnored('Wireless Networking')).toBe(false);
      expect(isFieldIgnored('M.2 (M)')).toBe(false);
      expect(isFieldIgnored('MSRP (USD)')).toBe(false);
      expect(isFieldIgnored('Form Factor')).toBe(false);
    });
  });

  describe('parseSpecScore', () => {
    it('scores price with lower-is-better (inverted scoring)', () => {
      const cheap = parseSpecScore('$149.99', 'MSRP (USD)');
      const expensive = parseSpecScore('$499.00', 'MSRP (USD)');
      expect(cheap.isNumeric).toBe(true);
      expect(expensive.isNumeric).toBe(true);
      expect(cheap.score).toBeGreaterThan(expensive.score);
    });

    it('scores LAN controller speeds hierarchically and sums dual controllers', () => {
      const rtl1g = parseSpecScore('Realtek RTL8111H (1GbE)', 'LAN Controller');
      const intel25g = parseSpecScore('Intel I226-V (2.5GbE)', 'LAN Controller');
      const rtl5g = parseSpecScore('Realtek RTL8126 (5GbE)', 'LAN Controller');
      const aqc10g = parseSpecScore('Marvell AQC113C (10GbE)', 'LAN Controller');
      const dualLan = parseSpecScore('Intel I226-V, Marvell AQC113C', 'LAN Controller');

      expect(intel25g.score).toBeGreaterThan(rtl1g.score);
      expect(rtl5g.score).toBeGreaterThan(intel25g.score);
      expect(aqc10g.score).toBeGreaterThan(rtl5g.score);
      expect(dualLan.score).toBe(12500);
      expect(dualLan.score).toBeGreaterThan(aqc10g.score);
    });

    it('scores Wi-Fi generation and manufacturer tiers', () => {
      const wifi7intel = parseSpecScore('Intel BE200 (Wi-Fi 7)', 'Wireless Networking');
      const wifi7qual = parseSpecScore('Qualcomm QCNCM865 (Wi-Fi 7)', 'Wireless Networking');
      const wifi6e = parseSpecScore('AMD RZ608 (Wi-Fi 6E)', 'Wireless Networking');
      const wifi6 = parseSpecScore('Wi-Fi 6', 'Wireless Networking');
      const m2slotOnly = parseSpecScore('M.2 Key E (no card)', 'Wireless Networking');

      expect(wifi7intel.score).toBeGreaterThan(wifi7qual.score);
      expect(wifi7qual.score).toBeGreaterThan(wifi6e.score);
      expect(wifi6e.score).toBeGreaterThan(wifi6.score);
      expect(wifi6.score).toBeGreaterThan(m2slotOnly.score);
    });

    it('scores VRM VCore by tier (SPS > DrMOS > Discrete) and amperage', () => {
      const sps110 = parseSpecScore('110A SPS', 'VRM (VCore)');
      const sps80 = parseSpecScore('80A SPS', 'VRM (VCore)');
      const drmos90 = parseSpecScore('90A DrMOS', 'VRM (VCore)');
      const drmos50 = parseSpecScore('50A DrMOS', 'VRM (VCore)');
      const discrete = parseSpecScore('1H/1L Discrete', 'VRM (VCore)');

      expect(sps110.score).toBe(2110);
      expect(sps80.score).toBe(2080);
      expect(drmos90.score).toBe(1090);
      expect(drmos50.score).toBe(1050);
      expect(discrete.score).toBe(0);

      expect(sps110.score).toBeGreaterThan(sps80.score);
      expect(sps80.score).toBeGreaterThan(drmos90.score);
      expect(drmos90.score).toBeGreaterThan(drmos50.score);
      expect(drmos50.score).toBeGreaterThan(discrete.score);
    });

    it('scores Audio solutions with codec tiers and DAC bonuses', () => {
      const alc4082dac = parseSpecScore('Realtek ALC4082 + ESS SABRE DAC', 'Audio Solution');
      const alc4080 = parseSpecScore('Realtek ALC4080', 'Audio Solution');
      const alc1220 = parseSpecScore('Realtek ALC1220', 'Audio Solution');
      const alc897 = parseSpecScore('Realtek ALC897', 'Audio Solution');

      expect(alc4082dac.score).toBeGreaterThan(alc4080.score);
      expect(alc4080.score).toBeGreaterThan(alc1220.score);
      expect(alc1220.score).toBeGreaterThan(alc897.score);
    });

    it('scores M.2 slots by slot count and generation bandwidth', () => {
      const fourSlots = parseSpecScore('2*5x4 2*4x4', 'M.2 (M)');
      const threeSlots = parseSpecScore('1*5x4 2*4x4', 'M.2 (M)');
      const gen5Single = parseSpecScore('1*5x4', 'M.2 (M)');
      const gen4Single = parseSpecScore('1*4x4', 'M.2 (M)');

      expect(fourSlots.score).toBeGreaterThan(threeSlots.score);
      expect(gen5Single.score).toBeGreaterThan(gen4Single.score);
    });

    it('scores Diagnostic features hierarchically', () => {
      const lcd = parseSpecScore('LCD Display, BIOS Flash', 'Diagnostic & Flash');
      const leds = parseSpecScore('Debug LEDs', 'Diagnostic & Flash');
      const post = parseSpecScore('POST Code', 'Diagnostic & Flash');
      const power = parseSpecScore('Power LED', 'Diagnostic & Flash');

      expect(lcd.score).toBeGreaterThan(post.score);
      expect(post.score).toBeGreaterThan(leds.score);
      expect(leds.score).toBeGreaterThan(power.score);
    });
  });

  describe('analyzeRowCells', () => {
    it('returns no diffs when all boards have identical values', () => {
      const result = analyzeRowCells('Audio Solution', [
        'Realtek ALC897',
        'Realtek ALC897',
        'Realtek ALC897',
        'Realtek ALC897'
      ]);

      expect(result.every((r) => !r.hasDiff && !r.isDiff)).toBe(true);
    });

    it('never highlights ignored fields even if they differ completely', () => {
      const result = analyzeRowCells('Notes & Details', [
        'First board note details',
        'Second board has different lanes',
        'Third board with USB quirks'
      ]);

      expect(result.every((r) => !r.hasDiff && !r.isDiff)).toBe(true);
    });

    it('leaves majority cells UNTOUCHED (isDiff: false) and only highlights the outlier/best cell', () => {
      // 4 boards have 50A DrMOS, 1 board has 110A SPS
      const result = analyzeRowCells('VCore MOSFET', [
        '50A DrMOS',
        '50A DrMOS',
        '110A SPS',
        '50A DrMOS',
        '50A DrMOS'
      ]);

      // Entire row has differences
      expect(result[0].hasDiff).toBe(true);

      // The 4 majority cells MUST NOT be highlighted
      expect(result[0].isDiff).toBe(false);
      expect(result[1].isDiff).toBe(false);
      expect(result[3].isDiff).toBe(false);
      expect(result[4].isDiff).toBe(false);

      // Only the outlier cell gets highlighted as Best
      expect(result[2].isDiff).toBe(true);
      expect(result[2].isBest).toBe(true);
      expect(result[2].badge).toBe('Best');
      expect(result[2].borderStyle).toBe('3px solid #20c997');
    });

    it('correctly attributes Best (Lowest) and Worst (Highest) for Price/MSRP', () => {
      const result = analyzeRowCells('MSRP (USD)', [
        '$199',
        '$299',
        '$299',
        '$499'
      ]);

      // $299 is majority -> untouched
      expect(result[1].isDiff).toBe(false);
      expect(result[2].isDiff).toBe(false);

      // $199 is cheapest -> Best/Lowest
      expect(result[0].isDiff).toBe(true);
      expect(result[0].isBest).toBe(true);
      expect(result[0].badge).toBe('Lowest');

      // $499 is most expensive -> Worst/Highest
      expect(result[3].isDiff).toBe(true);
      expect(result[3].isWorst).toBe(true);
      expect(result[3].badge).toBe('Highest');
    });

    it('highlights single outlier in non-numeric rows (e.g. Form Factor)', () => {
      const result = analyzeRowCells('Form Factor', [
        'ATX',
        'ATX',
        'ATX',
        'Micro ATX'
      ]);

      expect(result[0].isDiff).toBe(false);
      expect(result[1].isDiff).toBe(false);
      expect(result[2].isDiff).toBe(false);

      expect(result[3].isDiff).toBe(true);
      expect(result[3].isOutlier).toBe(true);
      expect(result[3].borderStyle).toBe('3px solid #ffc107');
    });

    it('marks empty or missing values as isMissing', () => {
      const result = analyzeRowCells('Wireless Networking', [
        'Wi-Fi 7',
        'Wi-Fi 7',
        '-'
      ]);

      expect(result[0].isDiff).toBe(false);
      expect(result[1].isDiff).toBe(false);
      expect(result[2].isDiff).toBe(true);
      expect(result[2].isMissing).toBe(true);
    });
  });

  describe('computeBaselineDelta', () => {
    it('computes price deltas with lower-is-better logic', () => {
      // Current $250 vs Baseline $200 -> +$50 (higher price, negative)
      const moreExpensive = computeBaselineDelta('MSRP (USD)', '$250', '$200');
      expect(moreExpensive).toEqual({ text: '+$50', positive: false });

      // Current $170 vs Baseline $200 -> -$30 (lower price, positive)
      const cheaper = computeBaselineDelta('MSRP (USD)', '$170', '$200');
      expect(cheaper).toEqual({ text: '-$30', positive: true });

      // Same price
      const same = computeBaselineDelta('MSRP (USD)', '$200', '$200');
      expect(same).toBeNull();
    });

    it('computes count deltas for USB, M.2, and Fans', () => {
      const usbDelta = computeBaselineDelta('USB Rear', '12 Total', '8 Total');
      expect(usbDelta).toEqual({ text: '+4 ports', positive: true });

      const m2Delta = computeBaselineDelta('M.2 Slots', '2 Total', '4 Total');
      expect(m2Delta).toEqual({ text: '-2 M.2', positive: false });

      const fanDelta = computeBaselineDelta('Fan Headers', '6', '4');
      expect(fanDelta).toEqual({ text: '+2 fans', positive: true });
    });

    it('computes generation deltas for Wi-Fi and LAN', () => {
      const wifiUpgrade = computeBaselineDelta('Wireless', 'Wi-Fi 7', 'Wi-Fi 6E');
      expect(wifiUpgrade?.positive).toBe(true);
      expect(wifiUpgrade?.text).toContain('Upgrade');

      const lanDelta = computeBaselineDelta('LAN Controller', '5GbE', '2.5GbE');
      expect(lanDelta?.positive).toBe(true);
      expect(lanDelta?.text).toContain('Faster LAN');
    });
  });
});

