import { describe, it, expect } from 'vitest';
import {
  simulateLaneAllocation,
  normalizeM2Slot,
  getDefaultSimulatorConfig,
  type SimulatorConfig
} from './lane_simulator_engine';

describe('lane_simulator_engine', () => {
  describe('normalizeM2Slot', () => {
    it('normalizes various formats to canonical M.2_X', () => {
      expect(normalizeM2Slot('m2_1')).toBe('M.2_1');
      expect(normalizeM2Slot('M.2 2')).toBe('M.2_2');
      expect(normalizeM2Slot('M2-3')).toBe('M.2_3');
      expect(normalizeM2Slot('m.2_4')).toBe('M.2_4');
      expect(normalizeM2Slot('M.2_5')).toBe('M.2_5');
      expect(normalizeM2Slot('')).toBe('');
    });
  });

  describe('Clean Board (No Lane Sharing)', () => {
    const cleanBoard = {
      model: 'B650 Gaming Plus WiFi',
      chipset: 'B650',
      typed: {
        notes_details: 'All slots operate at dedicated bandwidth without sharing.',
        pcie_x16_lanes: '4x16',
        m2_total: 2,
        sata_ports: 4
      }
    };

    it('runs at full speed with default single-GPU gaming config', () => {
      const config = getDefaultSimulatorConfig();
      const result = simulateLaneAllocation(cleanBoard, config);

      expect(result.overallPenalty).toBe(false);
      expect(result.warnings).toHaveLength(0);

      const gpu = result.slots['gpu_primary'];
      expect(gpu).toBeDefined();
      expect(gpu.status).toBe('full_speed');
      expect(gpu.actualSpeed).toBe('Gen 4 x16');
      expect(gpu.conflictReason).toBeUndefined();

      const m2_1 = result.slots['m2_1'];
      expect(m2_1).toBeDefined();
      expect(m2_1.status).toBe('full_speed');
      expect(m2_1.occupied).toBe(true);
    });

    it('remains full speed when all M.2 slots are populated on clean board', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [
          { id: '1', slot: 'M.2_1', label: 'Drive 1' },
          { id: '2', slot: 'M.2_2', label: 'Drive 2' }
        ],
        sataDrivesCount: 4
      };

      const result = simulateLaneAllocation(cleanBoard, config);
      expect(result.overallPenalty).toBe(false);
      expect(result.warnings).toHaveLength(0);
      expect(result.slots['gpu_primary'].status).toBe('full_speed');
    });
  });

  describe('Board with GPU Lane Drop (X870E Hero)', () => {
    const heroBoard = {
      model: 'ROG Crosshair X870E Hero',
      chipset: 'X870E',
      typed: {
        notes_details:
          'Using either M.2_2 or M.2_3 (both 5x4) will cause PCIEX16_1 to run at x8 and M.2_3 to run at x4.',
        pcie_x16_lanes: '5x16',
        m2_total: 4,
        sata_ports: 4
      }
    };

    it('keeps GPU at Gen 5 x16 when only M.2_1 (CPU direct) is populated', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [{ id: '1', slot: 'M.2_1', label: 'System Drive' }],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(heroBoard, config);
      expect(result.overallPenalty).toBe(false);
      expect(result.warnings).toHaveLength(0);
      expect(result.slots['gpu_primary'].status).toBe('full_speed');
      expect(result.slots['gpu_primary'].actualSpeed).toBe('Gen 5 x16');
    });

    it('downgrades GPU to Gen 5 x8 when M.2_2 is populated', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [
          { id: '1', slot: 'M.2_1', label: 'System Drive' },
          { id: '2', slot: 'M.2_2', label: 'Games Drive' }
        ],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(heroBoard, config);
      expect(result.overallPenalty).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Primary GPU slot downgraded');

      const gpu = result.slots['gpu_primary'];
      expect(gpu.status).toBe('downgraded');
      expect(gpu.actualSpeed).toBe('Gen 5 x8');
      expect(gpu.conflictReason).toContain('M.2_2');

      // M.2_2 has details explaining lane sharing
      expect(result.slots['m2_2'].details).toContain('Shares lanes with Primary GPU');
    });

    it('downgrades GPU to Gen 5 x8 when M.2_3 is populated', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [
          { id: '1', slot: 'M.2_1', label: 'System Drive' },
          { id: '3', slot: 'M.2_3', label: 'Storage Drive' }
        ],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(heroBoard, config);
      expect(result.overallPenalty).toBe(true);
      expect(result.slots['gpu_primary'].status).toBe('downgraded');
      expect(result.slots['gpu_primary'].actualSpeed).toBe('Gen 5 x8');
      expect(result.slots['gpu_primary'].conflictReason).toContain('M.2_3');
    });

    it('does not penalize GPU when no GPU is installed even if M.2_2 is populated', () => {
      const config: SimulatorConfig = {
        gpuInstalled: false,
        secondaryPcieCards: [],
        m2Drives: [{ id: '2', slot: 'M.2_2', label: 'Fast Drive' }],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(heroBoard, config);
      expect(result.overallPenalty).toBe(false);
      expect(result.slots['gpu_primary'].occupied).toBe(false);
    });
  });

  describe('Board with PCIe x16 Bifurcation (x8/x8)', () => {
    const bifBoard = {
      model: 'ProArt X670E-Creator WiFi',
      chipset: 'X670E',
      typed: {
        pcie_x8_bifurcation: true,
        notes_details: 'Bifurcates to x16/x0 or x8/x8.',
        pcie_x16_lanes: '5x16',
        m2_total: 4
      }
    };

    it('runs at Gen 5 x16 when only primary GPU slot is occupied', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [{ id: '1', slot: 'M.2_1', label: 'Boot' }],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(bifBoard, config);
      expect(result.overallPenalty).toBe(false);
      expect(result.slots['gpu_primary'].actualSpeed).toBe('Gen 5 x16');
      expect(result.slots['gpu_primary'].status).toBe('full_speed');
    });

    it('bifurcates to Gen 5 x8 on both slots when secondary PCIe slot is populated', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [{ id: 'card2', slot: 2, lanes: 8, label: 'Capture Card' }],
        m2Drives: [{ id: '1', slot: 'M.2_1', label: 'Boot' }],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(bifBoard, config);
      expect(result.overallPenalty).toBe(true);
      expect(result.slots['gpu_primary'].status).toBe('downgraded');
      expect(result.slots['gpu_primary'].actualSpeed).toBe('Gen 5 x8');
      expect(result.slots['gpu_primary'].conflictReason).toContain('bifurcation');

      const pcie2 = result.slots['pcie_slot_2'];
      expect(pcie2.actualSpeed).toBe('Gen 5 x8');
      expect(pcie2.conflictReason).toContain('bifurcation');
    });
  });

  describe('Board with SATA Port Lane Sharing', () => {
    const sataSharingBoard = {
      model: 'B650 Pro WiFi',
      chipset: 'B650',
      typed: {
        notes_details: 'SATA 5 and 6 share bandwidth with M.2_3; using one disables the other.',
        m2_total: 3,
        sata_ports: 6
      }
    };

    it('keeps SATA 5/6 active when M.2_3 is not occupied', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [{ id: '1', slot: 'M.2_1', label: 'Boot' }],
        sataDrivesCount: 6
      };

      const result = simulateLaneAllocation(sataSharingBoard, config);
      expect(result.overallPenalty).toBe(false);
      expect(result.slots['sata_5_6'].status).toBe('full_speed');
      expect(result.slots['sata_5_6'].actualSpeed).toBe('6 Gbps');
    });

    it('disables SATA 5/6 and generates warning when M.2_3 is occupied and user has >4 SATA drives', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [
          { id: '1', slot: 'M.2_1', label: 'Boot' },
          { id: '3', slot: 'M.2_3', label: 'Secondary SSD' }
        ],
        sataDrivesCount: 6
      };

      const result = simulateLaneAllocation(sataSharingBoard, config);
      expect(result.overallPenalty).toBe(true);
      expect(result.slots['sata_5_6'].status).toBe('disabled');
      expect(result.slots['sata_5_6'].conflictReason).toContain('M.2_3');
      expect(result.warnings.some((w) => w.includes('SATA'))).toBe(true);
    });

    it('marks SATA 5/6 as disabled but does not generate penalty if user only has 2 SATA drives', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [{ id: '3', slot: 'M.2_3', label: 'Secondary SSD' }],
        sataDrivesCount: 2
      };

      const result = simulateLaneAllocation(sataSharingBoard, config);
      expect(result.slots['sata_5_6'].status).toBe('disabled');
      // No penalty warning since 2 drives easily fit in SATA 1-4
      expect(result.overallPenalty).toBe(false);
    });
  });

  describe('Complex Board: ASRock X870E Taichi OCF', () => {
    const taichiBoard = {
      model: 'ASRock X870E Taichi OCF',
      chipset: 'X870E',
      typed: {
        notes_details:
          '- Bifurcates to x16/x0 or x8/x8. - The USB4 ports share bandwidth with M2_2 (5x4); they run at 5x2 (in reality, likely 4x2 since ASM4242 operates on a PCIe 4.0x4 interface by default) if M.2_2 is occupied in x2 mode. - If M2_2 is set to x4 in the BIOS, the USB4 ports are fully disabled. - M2_3 (4x2) and PCIE1 (4x4) share bandwidth; using the M.2 slot causes PCIE1 to run at x2.',
        pcie_x16_lanes: '5x16',
        m2_total: 3
      }
    };

    it('downgrades USB4 when M.2_2 is populated', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [
          { id: '1', slot: 'M.2_1', label: 'Boot' },
          { id: '2', slot: 'M.2_2', label: 'Storage' }
        ],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(taichiBoard, config);
      expect(result.overallPenalty).toBe(true);
      const usb4 = result.slots['usb4'];
      expect(usb4).toBeDefined();
      expect(usb4.status).toBe('downgraded');
      expect(usb4.conflictReason).toContain('M.2_2');
    });

    it('downgrades secondary PCIe slot when M.2_3 is populated and PCIe card is present', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [{ id: 'aic', slot: 2, lanes: 4, label: '10GbE Card' }],
        m2Drives: [{ id: '3', slot: 'M.2_3', label: 'Scratch' }],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(taichiBoard, config);
      expect(result.overallPenalty).toBe(true);
      const pcie2 = result.slots['pcie_slot_2'];
      expect(pcie2).toBeDefined();
      expect(pcie2.status).toBe('downgraded');
      expect(pcie2.actualSpeed).toBe('Gen 4 x2');
    });
  });

  describe('AM5 28-Lane CPU Budget', () => {
    const cleanB650 = {
      model: 'B650 Gaming Plus',
      chipset: 'B650',
      typed: {
        notes_details: 'All slots dedicated bandwidth.',
        pcie_x16_lanes: '4x16',
        m2_total: 2
      }
    };

    const heroBoard = {
      model: 'ROG Crosshair X870E Hero',
      chipset: 'X870E',
      typed: {
        notes_details: 'Using either M.2_2 or M.2_3 (both 5x4) will cause PCIEX16_1 to run at x8.',
        pcie_x16_lanes: '5x16',
        m2_total: 4
      }
    };

    it('calculates lane allocation for standard B650 setup (24 used, 4 free)', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [{ id: '1', slot: 'M.2_1', label: 'Boot' }],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(cleanB650, config);
      const { cpuBudget } = result;

      expect(cpuBudget.total).toBe(28);
      expect(cpuBudget.gpu).toBe(16);
      expect(cpuBudget.m2Direct).toBe(4);
      expect(cpuBudget.m2OrUsb4).toBe(0);
      expect(cpuBudget.downlink).toBe(4);
      expect(cpuBudget.used).toBe(24);
      expect(cpuBudget.free).toBe(4);
    });

    it('calculates lane allocation for X870E setup with USB4 (28 used, 0 free)', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [{ id: '1', slot: 'M.2_1', label: 'Boot' }],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(heroBoard, config);
      const { cpuBudget } = result;

      expect(cpuBudget.total).toBe(28);
      expect(cpuBudget.gpu).toBe(16);
      expect(cpuBudget.m2Direct).toBe(4);
      expect(cpuBudget.m2OrUsb4).toBe(4); // USB4 takes 4 CPU lanes on X870E
      expect(cpuBudget.downlink).toBe(4);
      expect(cpuBudget.used).toBe(28);
      expect(cpuBudget.free).toBe(0);
    });

    it('adjusts CPU budget when GPU is bifurcated/downgraded to x8 on hero board', () => {
      const config: SimulatorConfig = {
        gpuInstalled: true,
        secondaryPcieCards: [],
        m2Drives: [
          { id: '1', slot: 'M.2_1', label: 'Boot' },
          { id: '2', slot: 'M.2_2', label: 'Games' }
        ],
        sataDrivesCount: 0
      };

      const result = simulateLaneAllocation(heroBoard, config);
      const { cpuBudget } = result;

      expect(cpuBudget.gpu).toBe(8);
      expect(cpuBudget.m2Direct).toBe(4);
      expect(cpuBudget.m2OrUsb4).toBe(4); // M.2_2 takes 4 CPU lanes
      expect(cpuBudget.downlink).toBe(4);
      expect(cpuBudget.used).toBe(20);
      expect(cpuBudget.free).toBe(8);
    });
  });

  describe('Defensive and Edge Case Handling', () => {
    it('handles null board safely', () => {
      const config = getDefaultSimulatorConfig();
      const result = simulateLaneAllocation(null, config);

      expect(result.overallPenalty).toBe(false);
      expect(result.warnings).toHaveLength(0);
      expect(result.slotList).toHaveLength(0);
      expect(result.cpuBudget.total).toBe(28);
    });

    it('handles undefined config safely', () => {
      const board = { model: 'Simple Board' };
      const result = simulateLaneAllocation(board, undefined as any);

      expect(result.overallPenalty).toBe(false);
      expect(result.slots['gpu_primary']).toBeDefined();
    });
  });
});
