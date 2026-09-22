export interface LaneWarning {
  type: 'gpu_bifurcation' | 'slot_disabled' | 'sata_disabled' | 'usb4_shared' | 'bifurcation_feature' | 'info';
  severity: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  affectsGpu: boolean;
}

export interface LaneAnalysisResult {
  hasGpuPenalty: boolean;
  hasSharing: boolean;
  warnings: LaneWarning[];
  summaryBadge: {
    text: string;
    variant: 'danger' | 'warning' | 'success' | 'secondary';
    icon: string;
    tooltip: string;
  };
}

/**
 * Parses raw notes and scorecard metadata to detect lane-sharing bottlenecks
 * such as GPU slot drops to x8 when M.2 is populated, disabled SATA ports,
 * or secondary PCIe slot lane contention.
 */
export function analyzeLaneSharing(mobo: any): LaneAnalysisResult {
  if (!mobo) {
    return {
      hasGpuPenalty: false,
      hasSharing: false,
      warnings: [],
      summaryBadge: {
        text: 'Unknown',
        variant: 'secondary',
        icon: 'bi-question-circle',
        tooltip: 'No data available'
      }
    };
  }

  const rawNotes = String(
    mobo.typed?.notes_details ||
    mobo.specs?.Notes?.Details ||
    mobo.specs?._scorecard?.notes ||
    ''
  );

  const warnings: LaneWarning[] = [];
  let hasGpuPenalty = false;
  let hasSharing = false;

  // Split into separate sentences / bullet points (handles both starting '-' and inline ' - ' or ') - ')
  const items = rawNotes
    .split(/(?:^|\s+)-\s*|(?:\r?\n)+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const item of items) {
    const lower = item.toLowerCase();

    // 1. GPU Slot Penalty: x16 drops to x8 when M.2 is populated
    const mentionsGpu =
      lower.includes('pciex16') ||
      lower.includes('pcie 16') ||
      lower.includes('pcie x16') ||
      lower.includes('pci_e1') ||
      lower.includes('primary pcie') ||
      lower.includes('gpu');

    const mentionsM2 = lower.includes('m.2') || lower.includes('m2_') || lower.includes('m2 ');

    const mentionsDrop =
      lower.includes('drops') ||
      (lower.includes('cause') && lower.includes('run at x8')) ||
      (lower.includes('causes') && lower.includes('x8')) ||
      lower.includes('runs at x8') ||
      lower.includes('downgrade') ||
      lower.includes('to x8') ||
      lower.includes('shares bandwidth with pciex16');

    if (mentionsGpu && mentionsM2 && mentionsDrop) {
      hasGpuPenalty = true;
      hasSharing = true;
      if (!warnings.some((w) => w.type === 'gpu_bifurcation')) {
        warnings.push({
          type: 'gpu_bifurcation',
          severity: 'danger',
          title: 'GPU Drops to x8 with M.2',
          detail: item.replace(/^[-*•]\s*/, ''),
          affectsGpu: true
        });
      }
      continue;
    }

    // 2. SATA Port Sharing / Disabling
    if (lower.includes('sata') && (lower.includes('share') || lower.includes('disable'))) {
      hasSharing = true;
      if (!warnings.some((w) => w.type === 'sata_disabled')) {
        warnings.push({
          type: 'sata_disabled',
          severity: 'warning',
          title: 'SATA Port Lane Sharing',
          detail: item.replace(/^[-*•]\s*/, ''),
          affectsGpu: false
        });
      }
      continue;
    }

    // 3. USB4 Lane Sharing
    if (lower.includes('usb4') && (lower.includes('share') || lower.includes('disable'))) {
      hasSharing = true;
      if (!warnings.some((w) => w.type === 'usb4_shared')) {
        warnings.push({
          type: 'usb4_shared',
          severity: 'info',
          title: 'USB4 Bandwidth Shared',
          detail: item.replace(/^[-*•]\s*/, ''),
          affectsGpu: false
        });
      }
      continue;
    }

    // 4. Secondary PCIe / M.2 Slot Sharing
    if (
      (lower.includes('share bandwidth') || lower.includes('disables the other') || lower.includes('disabled if') || (lower.includes('causes') && lower.includes('run at x2'))) &&
      !mentionsGpu
    ) {
      hasSharing = true;
      if (!warnings.some((w) => w.type === 'slot_disabled')) {
        warnings.push({
          type: 'slot_disabled',
          severity: 'warning',
          title: 'Slot Bandwidth Sharing',
          detail: item.replace(/^[-*•]\s*/, ''),
          affectsGpu: false
        });
      }
      continue;
    }
  }

  // Summary badge configuration
  if (hasGpuPenalty) {
    return {
      hasGpuPenalty: true,
      hasSharing: true,
      warnings,
      summaryBadge: {
        text: 'GPU drops to x8 with M.2',
        variant: 'danger',
        icon: 'bi-exclamation-triangle-fill',
        tooltip: 'Populating secondary M.2 slots reduces primary GPU slot from x16 to x8'
      }
    };
  }

  if (hasSharing) {
    return {
      hasGpuPenalty: false,
      hasSharing: true,
      warnings,
      summaryBadge: {
        text: 'No GPU Penalty (Secondary Sharing)',
        variant: 'warning',
        icon: 'bi-info-circle-fill',
        tooltip: 'Primary GPU slot maintains full x16 bandwidth. Secondary PCIe slots, SATA ports, or USB4 share lanes with M.2.'
      }
    };
  }

  return {
    hasGpuPenalty: false,
    hasSharing: false,
    warnings,
    summaryBadge: {
      text: 'Full x16 (No Sharing)',
      variant: 'success',
      icon: 'bi-check-circle-fill',
      tooltip: 'Primary PCIe x16 slot maintains full x16 bandwidth and no secondary lane sharing exists'
    }
  };
}
