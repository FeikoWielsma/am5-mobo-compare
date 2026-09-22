<script lang="ts">
  import { compareStore } from '$lib/stores/compare';
  import { parseNotesList, parseM2Generations, m2GenBadgeClass } from '$lib/table_logic';
  import LaneSharingSimulator from '$lib/components/LaneSharingSimulator.svelte';

  let { data } = $props();
  let board = $derived(data.board);
  let simulatorOpen = $state(false);
</script>

{#if !board}
  <div class="container py-5 text-center">
    <h2 class="h4 text-danger mb-3">Motherboard Not Found</h2>
    <p class="text-secondary">The requested motherboard identifier could not be found.</p>
    <a href="/" class="btn btn-primary">Back to All Boards</a>
  </div>
{:else}
  {@const typed = board.typed || {}}
  {@const sc = board.specs?._scorecard || {}}
  {@const isSelected = $compareStore.includes(board.id)}

  <div class="container py-4">
    <!-- Breadcrumb & Back -->
    <div class="d-flex align-items-center justify-content-between mb-3">
      <nav aria-label="breadcrumb">
        <ol class="breadcrumb mb-0">
          <li class="breadcrumb-item"><a href="/" class="text-secondary text-decoration-none">All Boards</a></li>
          <li class="breadcrumb-item text-secondary">{board.brand}</li>
          <li class="breadcrumb-item active text-light" aria-current="page">{board.model}</li>
        </ol>
      </nav>

      <div class="d-flex gap-2">
        <button
          class="btn btn-sm {isSelected ? 'btn-danger' : 'btn-outline-primary'}"
          onclick={() => compareStore.toggle(board.id)}
        >
          <i class="bi {isSelected ? 'bi-check-lg' : 'bi-plus-lg'}"></i>
          {isSelected ? 'In Compare Tray' : 'Add to Compare'}
        </button>

        {#if $compareStore.length > 0}
          <a
            href="/compare?ids={$compareStore.join(',')}"
            class="btn btn-sm btn-primary"
            title="Open comparison table with selected boards"
          >
            <i class="bi bi-layers-half me-1"></i> Compare ({$compareStore.length})
          </a>
        {/if}

        <button
          type="button"
          class="btn btn-sm btn-outline-info d-flex align-items-center gap-1"
          onclick={() => (simulatorOpen = true)}
        >
          <i class="bi bi-diagram-3"></i> Simulate Lane Sharing
        </button>

        {#if (typed.website_url || board.specs?.Links?.Website)?.startsWith('http')}
          <a
            href={typed.website_url || board.specs?.Links?.Website}
            target="_blank"
            rel="noreferrer"
            class="btn btn-sm btn-outline-secondary text-light"
          >
            <i class="bi bi-box-arrow-up-right"></i> Official Page
          </a>
        {/if}
      </div>
    </div>

    <!-- Board Hero Banner -->
    <div class="card bg-dark border-secondary p-4 mb-4 shadow">
      <div class="row align-items-center">
        <div class="col-12 col-md-8">
          <span class="text-uppercase fw-bold" style="color: #60a5fa; letter-spacing: 0.05em; font-size: 0.85rem;">{board.brand}</span>
          <h1 class="h2 fw-bold text-white mb-2">{board.model}</h1>
          <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
            <span class="badge bg-primary px-3 py-2 fs-6">{board.chipset}</span>
            <span class="badge bg-secondary px-3 py-2 fs-6">{board.form_factor}</span>
            {#if typed.release}
              <span class="badge bg-dark border border-secondary px-3 py-2 fs-6">Released: {typed.release}</span>
            {/if}
          </div>
        </div>

        {#if typed.rear_io_image || board.specs?.['Rear I/O']?.['Rear I/O Image']}
          {@const fullImg = typed.rear_io_image || board.specs?.['Rear I/O']?.['Rear I/O Image']}
          {#if fullImg && (fullImg.startsWith('/') || fullImg.startsWith('http'))}
            <div class="col-12 col-md-4 text-center mt-3 mt-md-0">
              <div class="p-2 border border-secondary rounded bg-black">
                <span class="text-secondary small d-block mb-1">Rear I/O Panel</span>
                <img
                  src={fullImg}
                  alt="Rear I/O Panel"
                  class="img-fluid rounded"
                  style="max-height: 120px; object-fit: contain;"
                />
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Detailed Specification Sections Grid -->
    <div class="row g-4">
      <!-- Power & VRM -->
      <div class="col-12 col-md-6">
        <div class="card bg-dark border-secondary h-100 shadow-sm">
          <div class="card-header bg-black border-secondary d-flex align-items-center gap-2">
            <i class="bi bi-lightning-charge text-warning"></i>
            <h2 class="h5 mb-0 text-light">Power & VRM</h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0 small">
              <dt class="col-5 text-secondary">Phase Config</dt>
              <dd class="col-7">{sc.vrm_text || typed.vrm_phases?.raw || '-'}</dd>

              <dt class="col-5 text-secondary">VCore MOSFET</dt>
              <dd class="col-7">{sc.vcore_text || typed.vrm_vcore || '-'}</dd>

              <dt class="col-5 text-secondary">MOS Heatsink</dt>
              <dd class="col-7">{typed.vrm_mos_heatsink || '-'}</dd>

              <dt class="col-5 text-secondary">EPS 12V Connectors</dt>
              <dd class="col-7">{typed.eps12v_config || '-'}</dd>

              {#if sc.vrm_note}
                <dt class="col-5 text-secondary">VRM Notes</dt>
                <dd class="col-7 text-muted">{sc.vrm_note}</dd>
              {/if}
            </dl>
          </div>
        </div>
      </div>

      <!-- Networking -->
      <div class="col-12 col-md-6">
        <div class="card bg-dark border-secondary h-100 shadow-sm">
          <div class="card-header bg-black border-secondary d-flex align-items-center gap-2">
            <i class="bi bi-ethernet text-info"></i>
            <h2 class="h5 mb-0 text-light">Networking & Wireless</h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0 small">
              <dt class="col-5 text-secondary">LAN Controller</dt>
              <dd class="col-7">
                <div class="fw-medium text-light">
                  {typed.lan_controllers || board.specs?.General?.Networking?.Ethernet?.LAN || sc.lan_text || '-'}
                </div>
                {#if sc.lan_badges && sc.lan_badges.length > 0}
                  <div class="d-flex gap-1 mt-1">
                    {#each sc.lan_badges as b}
                      <span class="badge {b.color}">{b.label}</span>
                    {/each}
                  </div>
                {/if}
              </dd>

              <dt class="col-5 text-secondary">RJ-45 Ports</dt>
              <dd class="col-7">{typed.rj45_ports || '1'}</dd>

              <dt class="col-5 text-secondary">Wireless</dt>
              <dd class="col-7">{sc.wireless || typed.wireless || '-'}</dd>

              <dt class="col-5 text-secondary">M.2 Wi-Fi Slot</dt>
              <dd class="col-7">{typed.m2_wifi_accessible || '-'}</dd>
            </dl>
          </div>
        </div>
      </div>

      <!-- Memory & Storage -->
      <div class="col-12 col-md-6">
        <div class="card bg-dark border-secondary h-100 shadow-sm">
          <div class="card-header bg-black border-secondary d-flex align-items-center gap-2">
            <i class="bi bi-memory text-primary"></i>
            <h2 class="h5 mb-0 text-light">Memory & Storage</h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0 small">
              <dt class="col-5 text-secondary">RAM Slots</dt>
              <dd class="col-7">{typed.ram_slots ? `${typed.ram_slots} x DDR5` : '-'}</dd>

              <dt class="col-5 text-secondary">Max Capacity</dt>
              <dd class="col-7">{typed.max_ram_capacity_gb ? `${typed.max_ram_capacity_gb} GB` : '-'}</dd>

              <dt class="col-5 text-secondary">ECC Support</dt>
              <dd class="col-7">{typed.ecc_support || '-'}</dd>

              <dt class="col-5 text-secondary">M.2 Total</dt>
              <dd class="col-7">{sc.m2_total || typed.m2_total?.raw || '-'}</dd>

              <dt class="col-5 text-secondary">M.2 Key M</dt>
              <dd class="col-7">
                {#if parseM2Generations(typed.m2_m).length > 0}
                  <div class="d-flex flex-column gap-1 font-monospace">
                    {#each parseM2Generations(typed.m2_m) as gen}
                      <div>
                        <span class="badge {m2GenBadgeClass(gen)}">{gen}</span>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <span class="text-secondary">-</span>
                {/if}
              </dd>

              <dt class="col-5 text-secondary">SATA 6G Ports</dt>
              <dd class="col-7">{typed.sata_ports ?? '-'}</dd>
            </dl>
          </div>
        </div>
      </div>

      <!-- Expansion & Ports -->
      <div class="col-12 col-md-6">
        <div class="card bg-dark border-secondary h-100 shadow-sm">
          <div class="card-header bg-black border-secondary d-flex align-items-center gap-2">
            <i class="bi bi-usb-symbol text-success"></i>
            <h2 class="h5 mb-0 text-light">Expansion & I/O</h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0 small">
              <dt class="col-5 text-secondary">PCIe x16 Physical</dt>
              <dd class="col-7">{typed.pcie_x16_total ?? '-'}</dd>

              <dt class="col-5 text-secondary">PCIe x16 Lanes</dt>
              <dd class="col-7">
                {typed.pcie_x16_lanes || '-'}
                {#if board.specs?.Expansion?.['PCIe Slots']?.['Physical x16']?.['Electrical Lanes_comment']}
                  <span class="text-info cursor-help ms-1" title={board.specs.Expansion['PCIe Slots']['Physical x16']['Electrical Lanes_comment']}>
                    <i class="bi bi-info-circle-fill" style="font-size: 0.75rem;"></i>
                  </span>
                {/if}
              </dd>

              <dt class="col-5 text-secondary">PCIe Bifurcation</dt>
              <dd class="col-7">
                {#if board.specs?.Expansion?.['PCIe Slots']?.['Physical x16']?.['Electrical Lanes_comment']}
                  {@const bifCmt = board.specs.Expansion['PCIe Slots']['Physical x16']['Electrical Lanes_comment']}
                  <span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle font-monospace fw-semibold">
                    {bifCmt.toLowerCase().includes('x16/x0 or x8/x8') || bifCmt.toLowerCase().includes('x8/x8') ? 'x16/x0 or x8/x8' : 'x8/x8 Supported'}
                  </span>
                  <div class="small text-muted mt-1">{bifCmt}</div>
                {:else if typed.pcie_x8_bifurcation}
                  <span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle font-monospace fw-semibold">x8/x8 Supported</span>
                {:else}
                  <span class="text-secondary">-</span>
                {/if}
              </dd>

              <dt class="col-5 text-secondary">Total PCIe Slots</dt>
              <dd class="col-7">
                {typed.pcie_total_slots ?? '-'}
                {#if board.specs?.Expansion?.['PCIe Slots']?.['Total Slot Count_comment']}
                  <span class="text-info cursor-help ms-1" title="Physical Slot Layout (1–7): {board.specs.Expansion['PCIe Slots']['Total Slot Count_comment']}">
                    <i class="bi bi-info-circle-fill" style="font-size: 0.75rem;"></i>
                  </span>
                {/if}
              </dd>

              {#if board.specs?.Expansion?.['PCIe Slots']?.['Total Slot Count_comment']}
                <dt class="col-5 text-secondary">Slot Layout (1–7)</dt>
                <dd class="col-7">
                  <div
                    class="font-monospace small text-light-emphasis py-1 px-2 rounded bg-black border border-secondary"
                    title="Physical slot positions 1 to 7 (top to bottom). '-' denotes empty slot position."
                  >
                    {board.specs.Expansion['PCIe Slots']['Total Slot Count_comment']}
                  </div>
                </dd>
              {/if}

              <dt class="col-5 text-secondary">Rear Total USB</dt>
              <dd class="col-7">{typed.usb_total ?? '-'}</dd>

              <dt class="col-5 text-secondary">Rear USB-C</dt>
              <dd class="col-7">
                {#if sc.usb_details?.type_c}
                  {@const tc = sc.usb_details.type_c}
                  {tc['usb4_40g'] ? `${tc['usb4_40g']}x USB4 (40G) ` : ''}
                  {tc['3.2_20g'] ? `${tc['3.2_20g']}x 20G ` : ''}
                  {tc['3.2_10g'] ? `${tc['3.2_10g']}x 10G ` : ''}
                  {tc['3.2_5g'] ? `${tc['3.2_5g']}x 5G ` : ''}
                  {#if !tc['usb4_40g'] && !tc['3.2_20g'] && !tc['3.2_10g'] && !tc['3.2_5g']}-{/if}
                {:else}
                  -
                {/if}
              </dd>

              <dt class="col-5 text-secondary">Rear USB-A</dt>
              <dd class="col-7">
                {#if sc.usb_details?.type_a}
                  {@const ta = sc.usb_details.type_a}
                  {ta['3.2_10g'] ? `${ta['3.2_10g']}x 10G ` : ''}
                  {ta['3.2_5g'] ? `${ta['3.2_5g']}x 5G ` : ''}
                  {ta['2.0'] ? `${ta['2.0']}x 2.0` : ''}
                  {#if !ta['3.2_10g'] && !ta['3.2_5g'] && !ta['2.0']}-{/if}
                {:else}
                  -
                {/if}
              </dd>

              <dt class="col-5 text-secondary">Audio Codec</dt>
              <dd class="col-7">{typed.audio_codec || '-'}</dd>
            </dl>
          </div>
        </div>
      </div>

      <!-- Notes & Lane Sharing -->
      {#if typed.notes_details || board.specs?.Notes?.Details}
        {@const notes = parseNotesList(typed.notes_details || board.specs?.Notes?.Details)}
        {#if notes.length > 0}
          <div class="col-12">
            <div class="card bg-dark border-secondary shadow-sm">
              <div class="card-header bg-black border-secondary d-flex align-items-center justify-content-between">
                <div class="d-flex align-items-center gap-2">
                  <i class="bi bi-info-circle text-info"></i>
                  <h2 class="h5 mb-0 text-light">Lane Sharing, Bifurcation & Notes</h2>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-info text-dark fw-semibold d-flex align-items-center gap-1"
                  onclick={() => (simulatorOpen = true)}
                >
                  <i class="bi bi-diagram-3-fill"></i> Simulate Lanes
                </button>
              </div>
              <div class="card-body">
                <ul class="list-unstyled mb-0 d-flex flex-column gap-2 small">
                  {#each notes as note}
                    <li class="d-flex align-items-start gap-2">
                      <i class="bi bi-arrow-right-short text-info fs-6 mt-n1 flex-shrink-0"></i>
                      <span class="text-light-emphasis">{note}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>

  <LaneSharingSimulator {board} isOpen={simulatorOpen} onClose={() => (simulatorOpen = false)} />
{/if}
