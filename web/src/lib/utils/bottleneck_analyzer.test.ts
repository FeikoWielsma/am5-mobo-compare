import { describe, it, expect } from 'vitest';
import { analyzeLaneSharing } from './bottleneck_analyzer';

describe('bottleneck_analyzer', () => {
  it('detects GPU bifurcation penalties when populating M.2 drops PCIe x16 to x8', () => {
    const mobo = {
      model: 'X870E Hero',
      typed: {
        notes_details: 'Using either M.2_2 or M.2_3 (both 5x4) will cause PCIEX16_1 to run at x8 and M.2_3 to run at x4.'
      }
    };
    const result = analyzeLaneSharing(mobo);
    expect(result.hasGpuPenalty).toBe(true);
    expect(result.hasSharing).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].type).toBe('gpu_bifurcation');
    expect(result.summaryBadge.variant).toBe('danger');
    expect(result.summaryBadge.text).toContain('GPU drops to x8');
  });

  it('detects SATA sharing without GPU penalty', () => {
    const mobo = {
      model: 'B650 Pro',
      typed: {
        notes_details: 'SATA 5 and 6 share bandwidth with M.2_3; using one disables the other.'
      }
    };
    const result = analyzeLaneSharing(mobo);
    expect(result.hasGpuPenalty).toBe(false);
    expect(result.hasSharing).toBe(true);
    expect(result.warnings[0].type).toBe('sata_disabled');
    expect(result.summaryBadge.variant).toBe('warning');
  });

  it('returns clean status when no sharing or penalties exist', () => {
    const mobo = {
      model: 'B650 Gaming Plus',
      typed: {
        notes_details: 'All slots operate at dedicated bandwidth without sharing.'
      }
    };
    const result = analyzeLaneSharing(mobo);
    expect(result.hasGpuPenalty).toBe(false);
    expect(result.hasSharing).toBe(false);
    expect(result.summaryBadge.variant).toBe('success');
    expect(result.summaryBadge.text).toContain('No Sharing');
  });

  it('correctly handles ASRock X870E Taichi OCF without false GPU penalties or duplicate USB4 warnings', () => {
    const mobo = {
      model: 'ASRock X870E Taichi OCF',
      typed: {
        notes_details:
          '- Bifurcates to x16/x0 or x8/x8. - The USB4 ports share bandwidth with M2_2 (5x4); they run at 5x2 (in reality, likely 4x2 since ASM4242 operates on a PCIe 4.0x4 interface by default) if M.2_2 is occupied in x2 mode. - If M2_2 is set to x4 in the BIOS, the USB4 ports are fully disabled (or vice versa, if the USB4 is set to take all 4 lanes.) - M2_3 (4x2) and PCIE1 (4x4) share bandwidth; using the M.2 slot causes PCIE1 to run at x2.'
      }
    };
    const result = analyzeLaneSharing(mobo);
    expect(result.hasGpuPenalty).toBe(false);
    expect(result.hasSharing).toBe(true);
    expect(result.summaryBadge.variant).toBe('warning');
    expect(result.summaryBadge.text).toBe('No GPU Penalty (Secondary Sharing)');
    // Verify no duplicates
    const usb4Warnings = result.warnings.filter((w) => w.type === 'usb4_shared');
    expect(usb4Warnings.length).toBe(1);
    // Verify slot disabled warning for PCIE1 and M2_3
    const slotWarnings = result.warnings.filter((w) => w.type === 'slot_disabled');
    expect(slotWarnings.length).toBe(1);
    // Bifurcation is an expansion feature, not a bottleneck warning
    const bifWarnings = result.warnings.filter((w) => w.type === 'bifurcation_feature');
    expect(bifWarnings.length).toBe(0);
  });
});
