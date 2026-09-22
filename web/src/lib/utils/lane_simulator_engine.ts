/**
 * AM5 Motherboard PCIe Lane Sharing Simulator Engine
 *
 * Models physical PCIe lane distribution across the AMD AM5 platform:
 * - AMD Ryzen 7000/9000 AM5 CPU (28 PCIe lanes: 16 GPU + 4 M.2_1 + 4 Direct/USB4 + 4 Downlink)
 * - AMD Promontory 21 Chipset (Downstream PCIe, SATA, M.2, Networking)
 *
 * Evaluates lane contention, bifurcation, slot downgrades, and disabling rules
 * based on motherboard specifications, scorecard metadata, and notes.
 */

export interface SecondaryPcieCard {
  id: string;
  slot: number; // 2, 3, 4, etc.
  lanes: number; // 1, 4, 8, 16
  label: string;
}

export interface M2Drive {
  id: string;
  slot: string; // e.g. 'M.2_1', 'M.2_2', 'M.2_3', 'M.2_4', 'M.2_5'
  label: string;
}

export interface SimulatorConfig {
  gpuInstalled: boolean;
  secondaryPcieCards: SecondaryPcieCard[];
  m2Drives: M2Drive[];
  sataDrivesCount: number;
}

export type SlotStatusType = 'full_speed' | 'downgraded' | 'disabled';

export interface SlotAllocationResult {
  id: string;
  name: string;
  type: 'gpu' | 'm2' | 'pcie' | 'sata' | 'usb4';
  bus: 'cpu' | 'chipset';
  maxSpeed: string;
  actualSpeed: string;
  status: SlotStatusType;
  occupied: boolean;
  conflictReason?: string;
  details?: string;
}

export interface CpuLaneBudget {
  total: number;
  gpu: number;
  m2Direct: number;
  m2OrUsb4: number;
  downlink: number;
  used: number;
  free: number;
}

export interface SimulationResult {
  slots: Record<string, SlotAllocationResult>;
  slotList: SlotAllocationResult[];
  overallPenalty: boolean;
  warnings: string[];
  cpuBudget: CpuLaneBudget;
}

export interface BoardLaneRules {
  gpuDropTriggers: string[]; // M.2 slots that drop GPU to x8
  bifurcationSupported: boolean;
  pcieSharing: {
    slotNumber: number;
    triggerM2: string;
    action: 'downgrade_to_x2' | 'disable';
    description: string;
  }[];
  sataSharingTriggers: string[]; // M.2 slots that disable SATA 5/6
  usb4SharingTriggers: string[]; // M.2 slots that share bandwidth with USB4
  rawNotes: string;
}

/**
 * Normalizes M.2 slot strings like 'm2_2', 'M.2 2', 'm2-2', 'M.2_2' into canonical 'M.2_X'.
 */
export function normalizeM2Slot(slot: string): string {
  if (!slot) return '';
  const cleaned = slot.trim().toUpperCase();
  const match = cleaned.match(/M\.?2[_\s-]?(\d+)/i);
  if (match) {
    return `M.2_${match[1]}`;
  }
  return cleaned;
}

/**
 * Creates default simulator configuration for standard single-GPU gaming build.
 */
export function getDefaultSimulatorConfig(): SimulatorConfig {
  return {
    gpuInstalled: true,
    secondaryPcieCards: [],
    m2Drives: [{ id: 'm2_boot', slot: 'M.2_1', label: 'Boot SSD' }],
    sataDrivesCount: 0
  };
}

/**
 * Parses raw notes, typed specs, and scorecard metadata into structured lane allocation rules.
 */
export function parseBoardLaneRules(board: any): BoardLaneRules {
  const result: BoardLaneRules = {
    gpuDropTriggers: [],
    bifurcationSupported: false,
    pcieSharing: [],
    sataSharingTriggers: [],
    usb4SharingTriggers: [],
    rawNotes: ''
  };

  if (!board) return result;

  const rawNotes = String(
    board.typed?.notes_details ||
    board.specs?.Notes?.Details ||
    board.specs?._scorecard?.notes ||
    ''
  );
  result.rawNotes = rawNotes;

  // Check bifurcation support
  const bifComment = String(
    board.specs?.Expansion?.['PCIe Slots']?.['Physical x16']?.['Electrical Lanes_comment'] || ''
  ).toLowerCase();
  const typedBif = !!board.typed?.pcie_x8_bifurcation;
  const notesLower = rawNotes.toLowerCase();

  if (
    typedBif ||
    bifComment.includes('x8/x8') ||
    bifComment.includes('x16/x0') ||
    notesLower.includes('bifurcates to x16/x0 or x8/x8') ||
    notesLower.includes('bifurcation: x8/x8') ||
    (notesLower.includes('bifurcat') && notesLower.includes('x8/x8'))
  ) {
    result.bifurcationSupported = true;
  }

  // Split notes into items
  const items = rawNotes
    .split(/(?:^|\s+)-\s*|(?:\r?\n)+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const item of items) {
    const lower = item.toLowerCase();

    // 1. GPU Drop detection
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
      const matches = [...item.matchAll(/m\.?2[_\s-]?(\d+)/gi)];
      if (matches.length > 0) {
        for (const m of matches) {
          const slot = `M.2_${m[1]}`;
          if (!result.gpuDropTriggers.includes(slot)) {
            result.gpuDropTriggers.push(slot);
          }
        }
      } else {
        if (!result.gpuDropTriggers.includes('M.2_2')) {
          result.gpuDropTriggers.push('M.2_2');
        }
      }
    }

    // 2. SATA sharing detection
    if (lower.includes('sata') && (lower.includes('share') || lower.includes('disable'))) {
      const matches = [...item.matchAll(/m\.?2[_\s-]?(\d+)/gi)];
      for (const m of matches) {
        const slot = `M.2_${m[1]}`;
        if (!result.sataSharingTriggers.includes(slot)) {
          result.sataSharingTriggers.push(slot);
        }
      }
      if (matches.length === 0 && !result.sataSharingTriggers.includes('M.2_3')) {
        result.sataSharingTriggers.push('M.2_3');
      }
    }

    // 3. USB4 sharing detection
    if (lower.includes('usb4') && (lower.includes('share') || lower.includes('disable'))) {
      const matches = [...item.matchAll(/m\.?2[_\s-]?(\d+)/gi)];
      for (const m of matches) {
        const slot = `M.2_${m[1]}`;
        if (!result.usb4SharingTriggers.includes(slot)) {
          result.usb4SharingTriggers.push(slot);
        }
      }
      if (matches.length === 0 && !result.usb4SharingTriggers.includes('M.2_2')) {
        result.usb4SharingTriggers.push('M.2_2');
      }
    }

    // 4. Secondary PCIe / M.2 slot sharing
    if (
      (lower.includes('share bandwidth') ||
        lower.includes('disables the other') ||
        lower.includes('disabled if') ||
        lower.includes('is disabled') ||
        (lower.includes('causes') && lower.includes('run at x2'))) &&
      !mentionsGpu
    ) {
      const pcieMatch = item.match(/(?:pci[e_]|pci_e)(\d+)/i);
      const m2Match = item.match(/m\.?2[_\s-]?(\d+)/i);
      const slotNum = pcieMatch ? parseInt(pcieMatch[1], 10) : 2;
      const trigM2 = m2Match ? `M.2_${m2Match[1]}` : 'M.2_3';
      const isDowngrade = lower.includes('run at x2') || lower.includes('x2 mode');

      result.pcieSharing.push({
        slotNumber: slotNum,
        triggerM2: trigM2,
        action: isDowngrade ? 'downgrade_to_x2' : 'disable',
        description: item.replace(/^[-*•]\s*/, '')
      });
    }
  }

  // Inspect typed lane sharing indicators if present
  const typedGpuSharing = String(board.typed?.lane_sharing_gpu || '');
  if (typedGpuSharing && typedGpuSharing !== '-' && !result.gpuDropTriggers.length) {
    const matches = [...typedGpuSharing.matchAll(/m\.?2[_\s-]?(\d+)/gi)];
    for (const m of matches) {
      const slot = `M.2_${m[1]}`;
      if (!result.gpuDropTriggers.includes(slot)) {
        result.gpuDropTriggers.push(slot);
      }
    }
    if (result.gpuDropTriggers.length === 0) {
      result.gpuDropTriggers.push('M.2_2');
    }
  }

  return result;
}

/**
 * Discovers and builds default slot definitions for a given motherboard.
 */
export function getBoardSlots(board: any, rules: BoardLaneRules): SlotAllocationResult[] {
  const slots: SlotAllocationResult[] = [];
  if (!board) return slots;

  const chipset = String(board.chipset || '').toUpperCase();
  const pcieLanesStr = String(
    board.typed?.pcie_x16_lanes || board.specs?._scorecard?.pcie_x16_lanes || ''
  );
  const isGpuGen5 =
    pcieLanesStr.includes('5x16') ||
    chipset.includes('X870') ||
    chipset.includes('X670E') ||
    chipset.includes('B650E') ||
    chipset.includes('B850');

  // 1. Primary GPU slot
  slots.push({
    id: 'gpu_primary',
    name: 'Primary PCIe x16 Slot (GPU)',
    type: 'gpu',
    bus: 'cpu',
    maxSpeed: isGpuGen5 ? 'Gen 5 x16' : 'Gen 4 x16',
    actualSpeed: isGpuGen5 ? 'Gen 5 x16' : 'Gen 4 x16',
    status: 'full_speed',
    occupied: false
  });

  // 2. M.2 Slots
  let m2Count = 4;
  const rawM2Total = board.typed?.m2_total?.raw ?? board.typed?.m2_total ?? board.specs?._scorecard?.m2_total;
  if (rawM2Total) {
    const num = parseInt(String(rawM2Total).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num >= 1 && num <= 6) {
      m2Count = num;
    }
  }

  const m2MStr = String(board.typed?.m2_m || board.specs?.Expansion?.Storage?.['PCIe Storage']?.['M.2 (M)'] || '');
  const hasGen5M2 = m2MStr.includes('5x') || isGpuGen5;

  for (let i = 1; i <= m2Count; i++) {
    const slotKey = `M.2_${i}`;
    let bus: 'cpu' | 'chipset' = i === 1 ? 'cpu' : 'chipset';
    if (i === 2 && (rules.gpuDropTriggers.includes('M.2_2') || rules.usb4SharingTriggers.includes('M.2_2'))) {
      bus = 'cpu';
    } else if (i === 3 && rules.gpuDropTriggers.includes('M.2_3')) {
      bus = 'cpu';
    }

    let maxSpeed = 'Gen 4 x4';
    if (i === 1 && hasGen5M2) {
      maxSpeed = 'Gen 5 x4';
    } else if (i === 2 && (hasGen5M2 || rules.gpuDropTriggers.includes('M.2_2'))) {
      maxSpeed = m2MStr.includes('2*5x4') || m2MStr.includes('2x5x4') || rules.rawNotes.includes('both 5x4') || rules.rawNotes.includes('M.2_2 (5x4)') || rules.rawNotes.includes('M2_2 (5x4)')
        ? 'Gen 5 x4'
        : 'Gen 4 x4';
    } else if (i === 3 && rules.rawNotes.includes('M.2_3 (both 5x4)')) {
      maxSpeed = 'Gen 5 x4';
    } else if (rules.rawNotes.includes(`M2_${i} (4x2)`) || rules.rawNotes.includes(`M.2_${i} (4x2)`)) {
      maxSpeed = 'Gen 4 x2';
    }

    slots.push({
      id: `m2_${i}`,
      name: `${slotKey} Slot`,
      type: 'm2',
      bus,
      maxSpeed,
      actualSpeed: maxSpeed,
      status: 'full_speed',
      occupied: false
    });
  }

  // 3. Secondary PCIe Slots
  slots.push({
    id: 'pcie_slot_2',
    name: 'Secondary PCIe Slot (Slot 2)',
    type: 'pcie',
    bus: rules.bifurcationSupported ? 'cpu' : 'chipset',
    maxSpeed: rules.bifurcationSupported ? (isGpuGen5 ? 'Gen 5 x8' : 'Gen 4 x8') : 'Gen 4 x4',
    actualSpeed: rules.bifurcationSupported ? (isGpuGen5 ? 'Gen 5 x8' : 'Gen 4 x8') : 'Gen 4 x4',
    status: 'full_speed',
    occupied: false
  });

  const totalPcie = parseInt(String(board.typed?.pcie_total_slots || 0), 10);
  if (totalPcie >= 3) {
    slots.push({
      id: 'pcie_slot_3',
      name: 'Expansion PCIe Slot (Slot 3)',
      type: 'pcie',
      bus: 'chipset',
      maxSpeed: 'Gen 4 x1',
      actualSpeed: 'Gen 4 x1',
      status: 'full_speed',
      occupied: false
    });
  }

  // 4. SATA Ports
  const sataCount = parseInt(String(board.typed?.sata_ports || 4), 10);
  slots.push({
    id: 'sata_1_4',
    name: 'SATA Ports 1–4',
    type: 'sata',
    bus: 'chipset',
    maxSpeed: '6 Gbps',
    actualSpeed: '6 Gbps',
    status: 'full_speed',
    occupied: false
  });

  if (sataCount >= 6 || rules.sataSharingTriggers.length > 0) {
    slots.push({
      id: 'sata_5_6',
      name: 'SATA Ports 5–6',
      type: 'sata',
      bus: 'chipset',
      maxSpeed: '6 Gbps',
      actualSpeed: '6 Gbps',
      status: 'full_speed',
      occupied: false
    });
  }

  // 5. USB4 Ports (if supported on board)
  const hasUsb4 =
    chipset.includes('X870') ||
    (board.specs?._scorecard?.usb_details?.type_c?.usb4_40g || 0) > 0 ||
    (board.typed?.usb_c_usb4_40g || 0) > 0 ||
    rules.usb4SharingTriggers.length > 0 ||
    rules.rawNotes.toLowerCase().includes('usb4');

  if (hasUsb4) {
    slots.push({
      id: 'usb4',
      name: 'Rear USB4 40Gbps Controller',
      type: 'usb4',
      bus: 'cpu',
      maxSpeed: '40 Gbps (Gen 4 x4)',
      actualSpeed: '40 Gbps (Gen 4 x4)',
      status: 'full_speed',
      occupied: true
    });
  }

  return slots;
}

/**
 * Simulates PCIe lane allocation and bandwidth sharing conflicts for a given motherboard configuration.
 */
export function simulateLaneAllocation(board: any, config: SimulatorConfig): SimulationResult {
  const safeConfig: SimulatorConfig = {
    gpuInstalled: config?.gpuInstalled ?? true,
    secondaryPcieCards: config?.secondaryPcieCards || [],
    m2Drives: config?.m2Drives || [],
    sataDrivesCount: config?.sataDrivesCount ?? 0
  };

  const warnings: string[] = [];
  let overallPenalty = false;

  if (!board) {
    return {
      slots: {},
      slotList: [],
      overallPenalty: false,
      warnings: [],
      cpuBudget: {
        total: 28,
        gpu: 0,
        m2Direct: 0,
        m2OrUsb4: 0,
        downlink: 4,
        used: 4,
        free: 24
      }
    };
  }

  const rules = parseBoardLaneRules(board);
  const slotList = getBoardSlots(board, rules);
  const slots: Record<string, SlotAllocationResult> = {};
  for (const slot of slotList) {
    slots[slot.id] = slot;
  }

  // Canonical set of populated M.2 slots
  const occupiedM2Slots = new Set(
    safeConfig.m2Drives.map((d) => normalizeM2Slot(d.slot))
  );

  // 1. Mark occupancy
  const gpuSlot = slots['gpu_primary'];
  if (gpuSlot) {
    gpuSlot.occupied = safeConfig.gpuInstalled;
  }

  for (let i = 1; i <= 6; i++) {
    const m2Slot = slots[`m2_${i}`];
    if (m2Slot) {
      m2Slot.occupied = occupiedM2Slots.has(`M.2_${i}`);
    }
  }

  const pcie2Slot = slots['pcie_slot_2'];
  if (pcie2Slot) {
    pcie2Slot.occupied = safeConfig.secondaryPcieCards.some((c) => c.slot === 2);
  }

  const pcie3Slot = slots['pcie_slot_3'];
  if (pcie3Slot) {
    pcie3Slot.occupied = safeConfig.secondaryPcieCards.some((c) => c.slot === 3);
  }

  const sata14Slot = slots['sata_1_4'];
  if (sata14Slot) {
    sata14Slot.occupied = safeConfig.sataDrivesCount > 0;
  }

  const sata56Slot = slots['sata_5_6'];
  if (sata56Slot) {
    sata56Slot.occupied = safeConfig.sataDrivesCount > 4;
  }

  const usb4Slot = slots['usb4'];
  if (usb4Slot) {
    usb4Slot.occupied = true;
  }

  // 2. Rule Evaluation: GPU Lane Drop from M.2
  const activeGpuTriggers = rules.gpuDropTriggers.filter((slot) =>
    occupiedM2Slots.has(slot)
  );

  if (activeGpuTriggers.length > 0 && gpuSlot) {
    const isGen5 = gpuSlot.maxSpeed.includes('5');
    const droppedSpeed = isGen5 ? 'Gen 5 x8' : 'Gen 4 x8';

    if (safeConfig.gpuInstalled) {
      gpuSlot.status = 'downgraded';
      gpuSlot.actualSpeed = droppedSpeed;
      gpuSlot.conflictReason = `Shares bandwidth with ${activeGpuTriggers.join(' & ')}; Primary GPU dropped to x8`;
      overallPenalty = true;
      warnings.push(
        `Primary GPU slot downgraded from ${gpuSlot.maxSpeed} to ${droppedSpeed} because SSD is installed in ${activeGpuTriggers.join(', ')}.`
      );
    }

    for (const trig of activeGpuTriggers) {
      const trigKey = trig.toLowerCase().replace('.', '');
      const m2Target = slots[trigKey];
      if (m2Target) {
        m2Target.details = `Shares lanes with Primary GPU slot (reduces GPU to x8)`;
      }
    }
  }

  // 3. Rule Evaluation: PCIe x16 Bifurcation (x8/x8)
  const secondaryInSlot2 = safeConfig.secondaryPcieCards.some((c) => c.slot === 2);
  if (rules.bifurcationSupported && secondaryInSlot2 && pcie2Slot) {
    const isGen5 = gpuSlot?.maxSpeed.includes('5') || false;
    const bifSpeed = isGen5 ? 'Gen 5 x8' : 'Gen 4 x8';

    pcie2Slot.actualSpeed = bifSpeed;
    pcie2Slot.conflictReason = 'Operating in x8/x8 bifurcation mode with primary PCIe slot';

    if (safeConfig.gpuInstalled && gpuSlot) {
      gpuSlot.status = 'downgraded';
      gpuSlot.actualSpeed = bifSpeed;
      gpuSlot.conflictReason = 'Operating in x8/x8 bifurcation mode with secondary PCIe slot';
      overallPenalty = true;
      warnings.push(
        'Primary PCIe x16 slot operates in x8/x8 bifurcation mode because secondary PCIe slot is occupied.'
      );
    }
  }

  // 4. Rule Evaluation: Secondary PCIe Slot Sharing with M.2
  for (const pSharing of rules.pcieSharing) {
    if (occupiedM2Slots.has(pSharing.triggerM2)) {
      const targetPcie =
        slots[`pcie_slot_${pSharing.slotNumber}`] ||
        (pSharing.slotNumber === 1 ? slots['pcie_slot_2'] : undefined) ||
        slots['pcie_slot_2'];

      if (targetPcie) {
        const cardOccupied = safeConfig.secondaryPcieCards.some(
          (c) => c.slot === pSharing.slotNumber || c.slot === 2 || c.slot === 1
        );
        if (cardOccupied) {
          targetPcie.occupied = true;
        }

        if (pSharing.action === 'disable') {
          targetPcie.status = 'disabled';
          targetPcie.actualSpeed = 'Disabled';
          targetPcie.conflictReason = `Disabled when ${pSharing.triggerM2} is populated`;
          if (targetPcie.occupied) {
            overallPenalty = true;
            warnings.push(
              `Secondary PCIe card in ${targetPcie.name} cannot function: disabled by SSD in ${pSharing.triggerM2}.`
            );
          }
        } else if (pSharing.action === 'downgrade_to_x2') {
          targetPcie.status = 'downgraded';
          targetPcie.actualSpeed = 'Gen 4 x2';
          targetPcie.conflictReason = `Shares bandwidth with ${pSharing.triggerM2}; dropped to x2`;
          if (targetPcie.occupied) {
            overallPenalty = true;
            warnings.push(
              `${targetPcie.name} bandwidth dropped to Gen 4 x2 due to SSD in ${pSharing.triggerM2}.`
            );
          }
        }
      }
    }
  }

  // 5. Rule Evaluation: SATA Port Sharing with M.2
  const activeSataTriggers = rules.sataSharingTriggers.filter((slot) =>
    occupiedM2Slots.has(slot)
  );
  if (activeSataTriggers.length > 0 && sata56Slot) {
    sata56Slot.status = 'disabled';
    sata56Slot.actualSpeed = 'Disabled';
    sata56Slot.conflictReason = `SATA ports 5 & 6 disabled when ${activeSataTriggers.join(', ')} is populated`;

    if (safeConfig.sataDrivesCount > 4) {
      overallPenalty = true;
      warnings.push(
        `SATA drive count (${safeConfig.sataDrivesCount}) exceeds available active ports: SATA 5 & 6 are disabled by SSD in ${activeSataTriggers.join(', ')}.`
      );
    }
  }

  // 6. Rule Evaluation: USB4 Lane Sharing
  const activeUsb4Triggers = rules.usb4SharingTriggers.filter((slot) =>
    occupiedM2Slots.has(slot)
  );
  if (activeUsb4Triggers.length > 0 && usb4Slot) {
    usb4Slot.status = 'downgraded';
    usb4Slot.actualSpeed = 'Gen 4 x2 (20 Gbps)';
    usb4Slot.conflictReason = `Bandwidth shared with ${activeUsb4Triggers.join(', ')}`;
    overallPenalty = true;
    warnings.push(
      `USB4 controller bandwidth reduced from 40Gbps to 20Gbps (Gen 4 x2) because ${activeUsb4Triggers.join(', ')} is occupied.`
    );
  }

  // 7. Calculate AMD Ryzen AM5 28-PCIe Lane Budget
  let gpuLanes = 0;
  if (safeConfig.gpuInstalled && gpuSlot) {
    gpuLanes = gpuSlot.actualSpeed.includes('x8') ? 8 : 16;
  }

  const m2DirectLanes = occupiedM2Slots.has('M.2_1') ? 4 : 0;

  let m2OrUsb4Lanes = 0;
  if (occupiedM2Slots.has('M.2_2') && slots['m2_2']?.bus === 'cpu') {
    m2OrUsb4Lanes = 4;
  } else if (usb4Slot && usb4Slot.bus === 'cpu') {
    m2OrUsb4Lanes = usb4Slot.actualSpeed.includes('x2') ? 2 : 4;
  }

  const downlinkLanes = 4;
  const usedCpuLanes = gpuLanes + m2DirectLanes + m2OrUsb4Lanes + downlinkLanes;
  const freeCpuLanes = Math.max(0, 28 - usedCpuLanes);

  return {
    slots,
    slotList,
    overallPenalty,
    warnings,
    cpuBudget: {
      total: 28,
      gpu: gpuLanes,
      m2Direct: m2DirectLanes,
      m2OrUsb4: m2OrUsb4Lanes,
      downlink: downlinkLanes,
      used: usedCpuLanes,
      free: freeCpuLanes
    }
  };
}
