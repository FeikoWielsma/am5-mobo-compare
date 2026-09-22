<script lang="ts">
  import {
    simulateLaneAllocation,
    type SimulatorConfig,
    type SimulationResult,
    type SlotAllocationResult
  } from '$lib/utils/lane_simulator_engine';

  let {
    board = null,
    isOpen = false,
    onClose
  }: {
    board: any;
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  // Hardware configuration interactive state
  let gpuInstalled = $state<boolean>(true);
  let m2_1Installed = $state<boolean>(true);
  let m2_2Installed = $state<boolean>(false);
  let m2_3Installed = $state<boolean>(false);
  let m2_4Installed = $state<boolean>(false);
  let m2_5Installed = $state<boolean>(false);
  let pcieSlot2Installed = $state<boolean>(false);
  let pcieSlot3Installed = $state<boolean>(false);
  let sataCount = $state<number>(0);

  // Derive SimulatorConfig
  let config = $derived<SimulatorConfig>({
    gpuInstalled,
    m2Drives: [
      ...(m2_1Installed ? [{ id: 'm2_1', slot: 'M.2_1', label: 'Primary SSD' }] : []),
      ...(m2_2Installed ? [{ id: 'm2_2', slot: 'M.2_2', label: 'M.2_2 Drive' }] : []),
      ...(m2_3Installed ? [{ id: 'm2_3', slot: 'M.2_3', label: 'M.2_3 Drive' }] : []),
      ...(m2_4Installed ? [{ id: 'm2_4', slot: 'M.2_4', label: 'M.2_4 Drive' }] : []),
      ...(m2_5Installed ? [{ id: 'm2_5', slot: 'M.2_5', label: 'M.2_5 Drive' }] : [])
    ],
    secondaryPcieCards: [
      ...(pcieSlot2Installed ? [{ id: 'card_slot_2', slot: 2, lanes: 4, label: 'Secondary Card (Slot 2)' }] : []),
      ...(pcieSlot3Installed ? [{ id: 'card_slot_3', slot: 3, lanes: 1, label: 'Add-in Card (Slot 3)' }] : [])
    ],
    sataDrivesCount: sataCount
  });

  // Run reactive simulation
  let simResult = $derived<SimulationResult>(simulateLaneAllocation(board, config));

  let gpuSlot = $derived(simResult.slots['gpu_primary']);
  let gpuBadge = $derived(getStatusBadge(gpuSlot));

  let m21Slot = $derived(simResult.slots['m2_1']);
  let m21Badge = $derived(getStatusBadge(m21Slot));

  let usb4Slot = $derived(simResult.slots['usb4']);
  let usb4Badge = $derived(getStatusBadge(usb4Slot));

  let m22Slot = $derived(simResult.slots['m2_2']);
  let m22Badge = $derived(getStatusBadge(m22Slot));

  let s14Slot = $derived(simResult.slots['sata_1_4']);
  let s56Slot = $derived(simResult.slots['sata_5_6']);
  let s56Badge = $derived(getStatusBadge(s56Slot));

  function setPreset(preset: 'gaming' | 'dual_nvme' | 'creator' | 'storage' | 'reset') {
    if (preset === 'gaming') {
      gpuInstalled = true;
      m2_1Installed = true;
      m2_2Installed = false;
      m2_3Installed = false;
      m2_4Installed = false;
      m2_5Installed = false;
      pcieSlot2Installed = false;
      pcieSlot3Installed = false;
      sataCount = 0;
    } else if (preset === 'dual_nvme') {
      gpuInstalled = true;
      m2_1Installed = true;
      m2_2Installed = true;
      m2_3Installed = false;
      m2_4Installed = false;
      m2_5Installed = false;
      pcieSlot2Installed = false;
      pcieSlot3Installed = false;
      sataCount = 0;
    } else if (preset === 'creator') {
      gpuInstalled = true;
      m2_1Installed = true;
      m2_2Installed = true;
      m2_3Installed = true;
      m2_4Installed = false;
      m2_5Installed = false;
      pcieSlot2Installed = true;
      pcieSlot3Installed = false;
      sataCount = 2;
    } else if (preset === 'storage') {
      gpuInstalled = true;
      m2_1Installed = true;
      m2_2Installed = true;
      m2_3Installed = true;
      m2_4Installed = true;
      m2_5Installed = true;
      pcieSlot2Installed = false;
      pcieSlot3Installed = false;
      sataCount = 6;
    } else if (preset === 'reset') {
      gpuInstalled = false;
      m2_1Installed = false;
      m2_2Installed = false;
      m2_3Installed = false;
      m2_4Installed = false;
      m2_5Installed = false;
      pcieSlot2Installed = false;
      pcieSlot3Installed = false;
      sataCount = 0;
    }
  }

  function getStatusBadge(slot: SlotAllocationResult | undefined) {
    if (!slot) return { color: 'secondary', text: 'Unknown', icon: 'bi-dash' };
    if (!slot.occupied && slot.type !== 'sata' && slot.type !== 'usb4') {
      return { color: 'secondary', text: 'Unpopulated', icon: 'bi-circle' };
    }
    if (slot.status === 'disabled') {
      return { color: 'danger', text: 'Disabled', icon: 'bi-x-octagon-fill' };
    }
    if (slot.status === 'downgraded') {
      return { color: 'warning', text: 'Downgraded', icon: 'bi-exclamation-triangle-fill' };
    }
    return { color: 'success', text: 'Full Speed', icon: 'bi-check-circle-fill' };
  }

  function getCardBorderClass(slot: SlotAllocationResult | undefined): string {
    if (!slot) return 'border-secondary';
    if (!slot.occupied && slot.type !== 'sata' && slot.type !== 'usb4') {
      return 'border-secondary opacity-75';
    }
    if (slot.status === 'disabled') {
      return 'border-danger bg-danger-subtle text-danger-emphasis';
    }
    if (slot.status === 'downgraded') {
      return 'border-warning bg-warning-subtle text-warning-emphasis';
    }
    return 'border-success bg-success-subtle text-success-emphasis';
  }
</script>

{#if isOpen && board}
  <!-- Backdrop -->
  <button
    type="button"
    class="modal-backdrop fade show border-0"
    style="z-index: 1070;"
    onclick={onClose}
    aria-label="Close Lane Sharing Simulator"
  ></button>

  <!-- Modal Dialog -->
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="z-index: 1075;"
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  >
    <div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
      <div class="modal-content bg-dark text-light border border-secondary shadow-lg">
        <!-- Header -->
        <div class="modal-header bg-black border-secondary py-3 px-4 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-3">
            <div class="p-2 rounded bg-primary bg-opacity-10 text-primary border border-primary-subtle">
              <i class="bi bi-diagram-3-fill fs-5"></i>
            </div>
            <div>
              <div class="d-flex align-items-center gap-2">
                <h5 class="modal-title fw-bold text-white mb-0">AM5 PCIe Lane Sharing Simulator</h5>
                <span class="badge bg-primary">{board.chipset || 'AM5'}</span>
                {#if board.brand}
                  <span class="badge bg-secondary">{board.brand}</span>
                {/if}
              </div>
              <p class="text-secondary small mb-0 mt-1">
                {board.model} — Interactive Ryzen AM5 & Promontory 21 Lane Allocation
              </p>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2">
            {#if simResult.overallPenalty}
              <span class="badge bg-danger-subtle text-danger border border-danger-subtle px-3 py-2 fw-semibold">
                <i class="bi bi-exclamation-triangle-fill me-1"></i> Bandwidth Penalty Active
              </span>
            {:else}
              <span class="badge bg-success-subtle text-success border border-success-subtle px-3 py-2 fw-semibold">
                <i class="bi bi-check-circle-fill me-1"></i> Optimal (No Penalties)
              </span>
            {/if}
            <button type="button" class="btn-close btn-close-white ms-2" onclick={onClose} aria-label="Close"></button>
          </div>
        </div>

        <!-- Presets Toolbar -->
        <div class="bg-black px-4 py-2 border-bottom border-secondary d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-2">
            <span class="text-secondary small fw-bold text-uppercase" style="letter-spacing: 0.05em; font-size: 0.75rem;">
              Quick Presets:
            </span>
            <div class="btn-group btn-group-sm" role="group">
              <button type="button" class="btn btn-outline-secondary" onclick={() => setPreset('gaming')}>
                <i class="bi bi-controller me-1"></i> Gaming (1 GPU + M.2_1)
              </button>
              <button type="button" class="btn btn-outline-secondary" onclick={() => setPreset('dual_nvme')}>
                <i class="bi bi-hdd-stack me-1"></i> Dual NVMe (M.2_1 + M.2_2)
              </button>
              <button type="button" class="btn btn-outline-secondary" onclick={() => setPreset('creator')}>
                <i class="bi bi-camera-video me-1"></i> Content Creator (Capture Card)
              </button>
              <button type="button" class="btn btn-outline-secondary" onclick={() => setPreset('storage')}>
                <i class="bi bi-database me-1"></i> Max Storage (All M.2 + SATA)
              </button>
            </div>
          </div>

          <button type="button" class="btn btn-outline-danger btn-sm" onclick={() => setPreset('reset')}>
            <i class="bi bi-trash me-1"></i> Clear Hardware
          </button>
        </div>

        <!-- Body Content -->
        <div class="modal-body p-4 bg-dark">
          <!-- Warnings / Conflict Alert Banner -->
          {#if simResult.overallPenalty}
            <div class="alert alert-danger border-danger d-flex flex-column gap-2 mb-4 shadow-sm">
              <div class="d-flex align-items-center gap-2 fw-bold text-danger">
                <i class="bi bi-exclamation-triangle-fill fs-5"></i>
                <span>PCIe Lane Sharing / Bandwidth Penalty Detected:</span>
              </div>
              <ul class="mb-0 ps-3 small text-light">
                {#each simResult.warnings as w}
                  <li>{w}</li>
                {/each}
              </ul>
            </div>
          {:else}
            <div class="alert alert-success border-success bg-opacity-10 d-flex align-items-center gap-2 mb-4 py-2 px-3 shadow-sm">
              <i class="bi bi-check-circle-fill text-success fs-5"></i>
              <span class="small text-light">
                <strong>Optimal Bandwidth:</strong> All currently configured hardware operates at full dedicated speeds with zero lane downgrades or disabled slots.
              </span>
            </div>
          {/if}

          <div class="row g-4">
            <!-- Left Column: Hardware Toggle Controls -->
            <div class="col-12 col-lg-4">
              <div class="card bg-black border-secondary shadow-sm h-100">
                <div class="card-header bg-dark border-secondary py-2 px-3 d-flex align-items-center justify-content-between">
                  <span class="fw-bold text-white small">
                    <i class="bi bi-sliders me-1 text-primary"></i> Hardware Configuration
                  </span>
                  <span class="badge bg-secondary font-monospace small">Interactive</span>
                </div>
                <div class="card-body p-3 d-flex flex-column gap-3">
                  <!-- GPU Switch -->
                  <div class="p-2 rounded bg-dark border border-secondary d-flex align-items-center justify-content-between">
                    <div>
                      <div class="fw-semibold text-white small">Primary GPU</div>
                      <div class="text-secondary small" style="font-size: 0.75rem;">PCIe Slot 1 (x16 Slot)</div>
                    </div>
                    <div class="form-check form-switch mb-0">
                      <input
                        class="form-check-input cursor-pointer"
                        type="checkbox"
                        role="switch"
                        id="gpuSwitch"
                        bind:checked={gpuInstalled}
                      />
                    </div>
                  </div>

                  <!-- M.2 Drives Toggles -->
                  <div class="p-2 rounded bg-dark border border-secondary">
                    <div class="fw-semibold text-white small mb-2 d-flex justify-content-between align-items-center">
                      <span>M.2 NVMe SSD Sockets</span>
                      <span class="text-secondary" style="font-size: 0.75rem;">
                        {config.m2Drives.length} Installed
                      </span>
                    </div>
                    <div class="d-flex flex-column gap-2">
                      <label class="form-check mb-0 d-flex align-items-center justify-content-between cursor-pointer py-1 px-2 rounded hover-bg-secondary">
                        <span class="small text-light">
                          <strong>M.2_1:</strong> Direct CPU (Primary)
                        </span>
                        <input class="form-check-input ms-2" type="checkbox" bind:checked={m2_1Installed} />
                      </label>

                      {#if simResult.slots['m2_2']}
                        <label class="form-check mb-0 d-flex align-items-center justify-content-between cursor-pointer py-1 px-2 rounded hover-bg-secondary">
                          <span class="small text-light">
                            <strong>M.2_2:</strong> {simResult.slots['m2_2'].maxSpeed}
                            {#if simResult.slots['m2_2'].bus === 'cpu'}
                              <span class="badge bg-info-subtle text-info ms-1" style="font-size: 0.65rem;">CPU</span>
                            {/if}
                          </span>
                          <input class="form-check-input ms-2" type="checkbox" bind:checked={m2_2Installed} />
                        </label>
                      {/if}

                      {#if simResult.slots['m2_3']}
                        <label class="form-check mb-0 d-flex align-items-center justify-content-between cursor-pointer py-1 px-2 rounded hover-bg-secondary">
                          <span class="small text-light">
                            <strong>M.2_3:</strong> {simResult.slots['m2_3'].maxSpeed}
                          </span>
                          <input class="form-check-input ms-2" type="checkbox" bind:checked={m2_3Installed} />
                        </label>
                      {/if}

                      {#if simResult.slots['m2_4']}
                        <label class="form-check mb-0 d-flex align-items-center justify-content-between cursor-pointer py-1 px-2 rounded hover-bg-secondary">
                          <span class="small text-light">
                            <strong>M.2_4:</strong> {simResult.slots['m2_4'].maxSpeed}
                          </span>
                          <input class="form-check-input ms-2" type="checkbox" bind:checked={m2_4Installed} />
                        </label>
                      {/if}

                      {#if simResult.slots['m2_5']}
                        <label class="form-check mb-0 d-flex align-items-center justify-content-between cursor-pointer py-1 px-2 rounded hover-bg-secondary">
                          <span class="small text-light">
                            <strong>M.2_5:</strong> {simResult.slots['m2_5'].maxSpeed}
                          </span>
                          <input class="form-check-input ms-2" type="checkbox" bind:checked={m2_5Installed} />
                        </label>
                      {/if}
                    </div>
                  </div>

                  <!-- Secondary PCIe Cards -->
                  <div class="p-2 rounded bg-dark border border-secondary">
                    <div class="fw-semibold text-white small mb-2">Secondary PCIe Cards</div>
                    <div class="d-flex flex-column gap-2">
                      <label class="form-check mb-0 d-flex align-items-center justify-content-between cursor-pointer py-1 px-2 rounded hover-bg-secondary">
                        <span class="small text-light">PCIe Slot 2 (Physical x16 / x4)</span>
                        <input class="form-check-input ms-2" type="checkbox" bind:checked={pcieSlot2Installed} />
                      </label>

                      {#if simResult.slots['pcie_slot_3']}
                        <label class="form-check mb-0 d-flex align-items-center justify-content-between cursor-pointer py-1 px-2 rounded hover-bg-secondary">
                          <span class="small text-light">PCIe Slot 3 (x1 Slot)</span>
                          <input class="form-check-input ms-2" type="checkbox" bind:checked={pcieSlot3Installed} />
                        </label>
                      {/if}
                    </div>
                  </div>

                  <!-- SATA Drives Slider -->
                  <div class="p-2 rounded bg-dark border border-secondary">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <span class="fw-semibold text-white small">SATA Drives</span>
                      <span class="badge bg-primary font-monospace">{sataCount} Drives</span>
                    </div>
                    <input
                      type="range"
                      class="form-range"
                      min="0"
                      max="6"
                      step="1"
                      bind:value={sataCount}
                    />
                    <div class="d-flex justify-content-between text-secondary" style="font-size: 0.7rem;">
                      <span>0</span>
                      <span>2</span>
                      <span>4 (Native)</span>
                      <span>6 (Shared)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Visual AM5 Block Diagram -->
            <div class="col-12 col-lg-8">
              <div class="p-3 rounded bg-black border border-secondary shadow-inner d-flex flex-column gap-4">
                <!-- AM5 CPU Section -->
                <div class="rounded p-3 border border-primary shadow-sm" style="background: linear-gradient(180deg, #111827 0%, #030712 100%);">
                  <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 pb-2 mb-3 border-bottom border-secondary">
                    <div class="d-flex align-items-center gap-2">
                      <i class="bi bi-cpu-fill text-danger fs-4"></i>
                      <div>
                        <h6 class="fw-bold text-white mb-0">AMD Ryzen 7000/9000 Processor</h6>
                        <span class="text-secondary" style="font-size: 0.75rem;">AM5 Socket — 28 Dedicated PCIe Lanes</span>
                      </div>
                    </div>

                    <!-- Lane Budget Gauge -->
                    <div class="d-flex align-items-center gap-2">
                      <span class="text-secondary small font-monospace">
                        Lanes: <strong class="text-white">{simResult.cpuBudget.used}</strong> / 28 Used
                      </span>
                      <span class="badge {simResult.cpuBudget.free > 0 ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'} font-monospace">
                        {simResult.cpuBudget.free} Free
                      </span>
                    </div>
                  </div>

                  <!-- CPU Outgoing Connections Grid -->
                  <div class="row g-2">
                    <!-- Branch 1: Primary GPU Slot (16 Lanes) -->
                    <div class="col-12 col-md-6">
                      <div class="p-2 rounded border {getCardBorderClass(gpuSlot)} d-flex flex-column justify-content-between h-100">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                          <div class="d-flex align-items-center gap-1">
                            <i class="bi {gpuBadge.icon} text-{gpuBadge.color}"></i>
                            <strong class="small">{gpuSlot?.name || 'Primary GPU Slot'}</strong>
                          </div>
                          <span class="badge bg-{gpuBadge.color} text-{gpuBadge.color === 'warning' ? 'dark' : 'white'} font-monospace" style="font-size: 0.7rem;">
                            {gpuSlot?.occupied ? gpuSlot?.actualSpeed : 'Empty'}
                          </span>
                        </div>
                        <div class="small text-secondary" style="font-size: 0.75rem;">
                          Direct CPU (16 Lanes Rated)
                        </div>
                        {#if gpuSlot?.conflictReason}
                          <div class="mt-1 small text-warning fw-semibold" style="font-size: 0.72rem;">
                            <i class="bi bi-exclamation-circle-fill me-1"></i>
                            {gpuSlot.conflictReason}
                          </div>
                        {/if}
                      </div>
                    </div>

                    <!-- Branch 2: M.2_1 Direct CPU Slot (4 Lanes) -->
                    <div class="col-12 col-md-6">
                      <div class="p-2 rounded border {getCardBorderClass(m21Slot)} d-flex flex-column justify-content-between h-100">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                          <div class="d-flex align-items-center gap-1">
                            <i class="bi {m21Badge.icon} text-{m21Badge.color}"></i>
                            <strong class="small">{m21Slot?.name || 'M.2_1 Slot'}</strong>
                          </div>
                          <span class="badge bg-{m21Badge.color} font-monospace" style="font-size: 0.7rem;">
                            {m21Slot?.occupied ? m21Slot?.actualSpeed : 'Empty'}
                          </span>
                        </div>
                        <div class="small text-secondary" style="font-size: 0.75rem;">
                          Direct CPU Storage (4 Lanes Dedicated)
                        </div>
                      </div>
                    </div>

                    <!-- Branch 3: Direct CPU General Purpose M.2 / USB4 (4 Lanes) -->
                    {#if usb4Slot}
                      <div class="col-12 col-md-6">
                        <div class="p-2 rounded border {getCardBorderClass(usb4Slot)} d-flex flex-column justify-content-between h-100">
                          <div class="d-flex justify-content-between align-items-start mb-1">
                            <div class="d-flex align-items-center gap-1">
                              <i class="bi {usb4Badge.icon} text-{usb4Badge.color}"></i>
                              <strong class="small">Rear USB4 40Gbps</strong>
                            </div>
                            <span class="badge bg-{usb4Badge.color} text-{usb4Badge.color === 'warning' ? 'dark' : 'white'} font-monospace" style="font-size: 0.7rem;">
                              {usb4Slot.actualSpeed}
                            </span>
                          </div>
                          <div class="small text-secondary" style="font-size: 0.75rem;">
                            Direct CPU Host Controller (ASM4242)
                          </div>
                          {#if usb4Slot.conflictReason}
                            <div class="mt-1 small text-warning fw-semibold" style="font-size: 0.72rem;">
                              {usb4Slot.conflictReason}
                            </div>
                          {/if}
                        </div>
                      </div>
                    {:else if m22Slot && m22Slot.bus === 'cpu'}
                      <div class="col-12 col-md-6">
                        <div class="p-2 rounded border {getCardBorderClass(m22Slot)} d-flex flex-column justify-content-between h-100">
                          <div class="d-flex justify-content-between align-items-start mb-1">
                            <div class="d-flex align-items-center gap-1">
                              <i class="bi {m22Badge.icon} text-{m22Badge.color}"></i>
                              <strong class="small">{m22Slot.name}</strong>
                            </div>
                            <span class="badge bg-{m22Badge.color} font-monospace" style="font-size: 0.7rem;">
                              {m22Slot.occupied ? m22Slot.actualSpeed : 'Empty'}
                            </span>
                          </div>
                          <div class="small text-secondary" style="font-size: 0.75rem;">
                            Direct CPU General Purpose (4 Lanes)
                          </div>
                          {#if m22Slot.details}
                            <div class="mt-1 small text-warning fw-semibold" style="font-size: 0.72rem;">
                              {m22Slot.details}
                            </div>
                          {/if}
                        </div>
                      </div>
                    {/if}

                    <!-- Branch 4: Chipset Downlink Connector -->
                    <div class="col-12 col-md-6">
                      <div class="p-2 rounded border border-info bg-info bg-opacity-10 d-flex flex-column justify-content-between h-100">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                          <div class="d-flex align-items-center gap-1 text-info">
                            <i class="bi bi-arrow-down-up"></i>
                            <strong class="small">Chipset Downlink Bus</strong>
                          </div>
                          <span class="badge bg-info text-dark font-monospace" style="font-size: 0.7rem;">
                            PCIe 4.0 x4
                          </span>
                        </div>
                        <div class="small text-secondary" style="font-size: 0.75rem;">
                          Direct 4-Lane Link to Promontory 21
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Downlink Visual Arrow -->
                <div class="text-center my-n2 text-info fs-5">
                  <i class="bi bi-chevron-double-down"></i>
                </div>

                <!-- Promontory 21 Chipset Section -->
                <div class="rounded p-3 border border-secondary shadow-sm" style="background: linear-gradient(180deg, #1f2937 0%, #111827 100%);">
                  <div class="d-flex align-items-center justify-content-between pb-2 mb-3 border-bottom border-secondary">
                    <div class="d-flex align-items-center gap-2">
                      <i class="bi bi-motherboard-fill text-warning fs-4"></i>
                      <div>
                        <h6 class="fw-bold text-white mb-0">AMD Promontory 21 Chipset</h6>
                        <span class="text-secondary" style="font-size: 0.75rem;">
                          Downstream Storage, Secondary PCIe, SATA & Peripheral Controllers
                        </span>
                      </div>
                    </div>
                    <span class="badge bg-dark border border-secondary text-light font-monospace small">
                      PCH Hub
                    </span>
                  </div>

                  <!-- Chipset Outgoing Slots Grid -->
                  <div class="row g-2">
                    <!-- Downstream M.2 Slots -->
                    {#each [simResult.slots['m2_2'], simResult.slots['m2_3'], simResult.slots['m2_4'], simResult.slots['m2_5']] as s}
                      {#if s && s.bus === 'chipset'}
                        {@const sBadge = getStatusBadge(s)}
                        <div class="col-12 col-md-6">
                          <div class="p-2 rounded border {getCardBorderClass(s)} d-flex flex-column justify-content-between h-100">
                            <div class="d-flex justify-content-between align-items-start mb-1">
                              <div class="d-flex align-items-center gap-1">
                                <i class="bi {sBadge.icon} text-{sBadge.color}"></i>
                                <strong class="small">{s.name}</strong>
                              </div>
                              <span class="badge bg-{sBadge.color} font-monospace" style="font-size: 0.7rem;">
                                {s.occupied ? s.actualSpeed : 'Empty'}
                              </span>
                            </div>
                            <div class="small text-secondary" style="font-size: 0.75rem;">
                              Chipset Downstream PCIe ({s.maxSpeed})
                            </div>
                            {#if s.conflictReason}
                              <div class="mt-1 small text-warning fw-semibold" style="font-size: 0.72rem;">
                                {s.conflictReason}
                              </div>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    {/each}

                    <!-- Secondary PCIe Slots -->
                    {#each [simResult.slots['pcie_slot_2'], simResult.slots['pcie_slot_3']] as p}
                      {#if p}
                        {@const pBadge = getStatusBadge(p)}
                        <div class="col-12 col-md-6">
                          <div class="p-2 rounded border {getCardBorderClass(p)} d-flex flex-column justify-content-between h-100">
                            <div class="d-flex justify-content-between align-items-start mb-1">
                              <div class="d-flex align-items-center gap-1">
                                <i class="bi {pBadge.icon} text-{pBadge.color}"></i>
                                <strong class="small">{p.name}</strong>
                              </div>
                              <span class="badge bg-{pBadge.color} text-{pBadge.color === 'warning' ? 'dark' : 'white'} font-monospace" style="font-size: 0.7rem;">
                                {p.occupied ? p.actualSpeed : 'Empty'}
                              </span>
                            </div>
                            <div class="small text-secondary" style="font-size: 0.75rem;">
                              Expansion Slot ({p.maxSpeed})
                            </div>
                            {#if p.conflictReason}
                              <div class="mt-1 small text-warning fw-semibold" style="font-size: 0.72rem;">
                                {p.conflictReason}
                              </div>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    {/each}

                    <!-- SATA Ports 1-4 -->
                    {#if s14Slot}
                      <div class="col-12 col-md-6">
                        <div class="p-2 rounded border border-success bg-success-subtle text-success-emphasis d-flex flex-column justify-content-between h-100">
                          <div class="d-flex justify-content-between align-items-start mb-1">
                            <div class="d-flex align-items-center gap-1">
                              <i class="bi bi-check-circle-fill text-success"></i>
                              <strong class="small">SATA Ports 1–4</strong>
                            </div>
                            <span class="badge bg-success font-monospace" style="font-size: 0.7rem;">
                              Dedicated
                            </span>
                          </div>
                          <div class="small text-secondary" style="font-size: 0.75rem;">
                            Native 6 Gbps AHCI Controller
                          </div>
                        </div>
                      </div>
                    {/if}

                    <!-- SATA Ports 5-6 (Shared) -->
                    {#if s56Slot}
                      <div class="col-12 col-md-6">
                        <div class="p-2 rounded border {getCardBorderClass(s56Slot)} d-flex flex-column justify-content-between h-100">
                          <div class="d-flex justify-content-between align-items-start mb-1">
                            <div class="d-flex align-items-center gap-1">
                              <i class="bi {s56Badge.icon} text-{s56Badge.color}"></i>
                              <strong class="small">SATA Ports 5–6</strong>
                            </div>
                            <span class="badge bg-{s56Badge.color} font-monospace" style="font-size: 0.7rem;">
                              {s56Slot.actualSpeed}
                            </span>
                          </div>
                          <div class="small text-secondary" style="font-size: 0.75rem;">
                            Chipset SATA (Shared Lines)
                          </div>
                          {#if s56Slot.conflictReason}
                            <div class="mt-1 small text-danger fw-semibold" style="font-size: 0.72rem;">
                              {s56Slot.conflictReason}
                            </div>
                          {/if}
                        </div>
                      </div>
                    {/if}

                    <!-- Integrated Networking -->
                    <div class="col-12 col-md-6">
                      <div class="p-2 rounded border border-secondary bg-dark d-flex flex-column justify-content-between h-100">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                          <div class="d-flex align-items-center gap-1 text-light">
                            <i class="bi bi-wifi text-info"></i>
                            <strong class="small">Ethernet & Wi-Fi</strong>
                          </div>
                          <span class="badge bg-secondary font-monospace" style="font-size: 0.7rem;">
                            Dedicated
                          </span>
                        </div>
                        <div class="small text-secondary" style="font-size: 0.75rem;">
                          Chipset PCIe x1 Bus Link
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer bg-black border-secondary py-2 px-4 d-flex justify-content-between align-items-center">
          <div class="small text-secondary">
            <i class="bi bi-info-circle me-1"></i>
            AM5 lane simulation uses manufacturer BIOS routing tables, bifurcation data, and technical specifications.
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm px-3" onclick={onClose}>
            Close Simulator
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .hover-bg-secondary:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }
  .cursor-pointer {
    cursor: pointer;
  }
</style>
