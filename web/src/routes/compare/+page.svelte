<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { compareStore } from '$lib/stores/compare';
  import { parseNotesList, parseM2Generations, m2GenBadgeClass, matchesX8X8 } from '$lib/table_logic';
  import ExportModal from '$lib/components/ExportModal.svelte';
  import LaneSharingSimulator from '$lib/components/LaneSharingSimulator.svelte';

  let { data } = $props();
  let allBoards = $derived(data.boards || []);
  let layout = $derived(data.layout || []);

  let hideIdentical = $state(false);
  let highlightDiffs = $state(true);
  let showExportModal = $state(false);
  let collapsedSections = $state<Set<string>>(new Set());
  let activeModalImage = $state<{ src: string; title: string } | null>(null);
  let activeSimulatorBoard = $state<any | null>(null);

  // Load persisted collapsed sections from localStorage
  $effect(() => {
    if (browser) {
      try {
        const saved = localStorage.getItem('compare_collapsed_sections');
        if (saved) {
          collapsedSections = new Set(JSON.parse(saved));
        }
      } catch (e) {
        console.warn('Failed to load collapsed sections:', e);
      }
    }
  });

  function toggleSection(sectionId: string) {
    const next = new Set(collapsedSections);
    if (next.has(sectionId)) {
      next.delete(sectionId);
    } else {
      next.add(sectionId);
    }
    collapsedSections = next;
    if (browser) {
      try {
        localStorage.setItem('compare_collapsed_sections', JSON.stringify([...next]));
      } catch (e) {
        console.warn('Failed to save collapsed sections:', e);
      }
    }
  }

  function openImageModal(src: string, title: string) {
    activeModalImage = { src, title };
  }

  function closeImageModal() {
    activeModalImage = null;
  }

  let explicitIds = $state<string[] | null>(null);

  // Selected boards derived from URL ?ids= or fallback to store
  let selectedIds = $derived.by(() => {
    if (explicitIds !== null) return explicitIds;
    if (!browser) return [];
    const param = page.url.searchParams.get('ids');
    if (param) {
      return param.split(',').map(s => s.trim()).filter(Boolean);
    }
    return $compareStore;
  });

  let comparedBoards = $derived(
    selectedIds
      .map((id: string) => allBoards.find((b: any) => b.id === id))
      .filter(Boolean)
  );

  function removeBoard(id: string) {
    if (baselineId === id) baselineId = null;
    compareStore.remove(id);
    const newIds = selectedIds.filter((x: string) => x !== id);
    explicitIds = newIds;
    const url = new URL(window.location.href);
    if (newIds.length) {
      url.searchParams.set('ids', newIds.join(','));
    } else {
      url.searchParams.delete('ids');
    }
    window.history.replaceState({}, '', url.toString());
  }

  let baselineId = $state<string | null>(null);
  let baselineBoard = $derived(comparedBoards.find((b: any) => b?.id === baselineId) || null);

  function moveBoard(fromIndex: number, direction: -1 | 1) {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= selectedIds.length) return;
    const nextIds = [...selectedIds];
    const temp = nextIds[fromIndex];
    nextIds[fromIndex] = nextIds[toIndex];
    nextIds[toIndex] = temp;
    explicitIds = nextIds;
    compareStore.set(nextIds);
    const url = new URL(window.location.href);
    url.searchParams.set('ids', nextIds.join(','));
    window.history.replaceState({}, '', url.toString());
  }

  let addSearchQuery = $state('');
  let showAddDropdown = $state(false);

  let searchMatches = $derived.by(() => {
    const q = addSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    return allBoards
      .filter((b: any) => {
        if (selectedIds.includes(b.id)) return false;
        const brand = (b.brand || '').toLowerCase();
        const model = (b.model || '').toLowerCase();
        const chipset = (b.chipset || '').toLowerCase();
        const ff = (b.form_factor || '').toLowerCase();
        const combined = `${brand} ${model} ${chipset} ${ff}`;
        return tokens.every((tok: string) => combined.includes(tok));
      })
      .slice(0, 10);
  });

  function addBoard(id: string) {
    if (selectedIds.includes(id)) return;
    if (selectedIds.length >= 10) {
      alert('You can compare a maximum of 10 motherboards at once.');
      return;
    }
    compareStore.add(id);
    const newIds = [...selectedIds, id];
    explicitIds = newIds;
    const url = new URL(window.location.href);
    url.searchParams.set('ids', newIds.join(','));
    window.history.replaceState({}, '', url.toString());
    addSearchQuery = '';
    showAddDropdown = false;
  }

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      showAddDropdown = false;
    } else if (e.key === 'Enter') {
      if (searchMatches.length > 0) {
        addBoard(searchMatches[0].id);
      }
    }
  }

  function resolveValue(board: any, row: any): string {
    if (!board) return '-';

    if (row.kind === 'custom') {
      if (row.name === 'lan_controller') {
        return String(board.typed?.lan_controllers || board.specs?.General?.Networking?.Ethernet?.LAN || board.specs?._scorecard?.lan_text || '-');
      }
      if (row.name === 'pcie_x16_electrical') return String(board.typed?.pcie_x16_lanes || board.specs?._scorecard?.pcie_x16_lanes || '-');
      if (row.name === 'pcie_bifurcation') {
        const cmt =
          board.specs?.Expansion?.['PCIe Slots']?.['Physical x16']?.['Electrical Lanes_comment'] ||
          board.typed?.['Expansion|PCIe Slots|Physical x16|Electrical Lanes_comment'] ||
          '';
        const lower = cmt.toLowerCase();
        if (lower.includes('bifurcat') || lower.includes('x8/x8') || lower.includes('8x/8x') || matchesX8X8(board)) {
          if (lower.includes('x16/x0 or x8/x8') || lower.includes('x8/x8')) {
            return 'x16/x0 or x8/x8';
          }
          return 'x8/x8 Supported';
        }
        return '-';
      }
      if (row.name === 'pcie_x16_total') return String(board.typed?.pcie_x16_total ?? board.specs?._scorecard?.pcie_x16_total ?? '-');
      if (row.name === 'pcie_x1x4_electrical') return String(board.typed?.pcie_x1x4_lanes || '-');
      if (row.name === 'pcie_total_slots') return String(board.typed?.pcie_total_slots ?? '-');
      if (row.name === 'pcie_slot_layout') {
        return String(
          board.specs?.Expansion?.['PCIe Slots']?.['Total Slot Count_comment'] ||
          board.typed?.['Expansion|PCIe Slots|Total Slot Count_comment'] ||
          '-'
        );
      }
      if (row.name === 'm2_m') return String(board.typed?.m2_m || '-');
      if (row.name === 'website') {
        const u = String(board.typed?.website_url || board.specs?.Links?.Website || '');
        return u.startsWith('http') ? u : '';
      }
      if (row.name === 'notes') return String(board.typed?.notes_details || board.specs?.Notes?.Details || '-');
      if (row.name === 'io_image' || row.name === 'io_image_link') {
        const img = String(board.typed?.rear_io_image || board.specs?.['Rear I/O']?.['Rear I/O Image'] || '');
        return (img.startsWith('/') || img.startsWith('http')) ? img : '';
      }
      return '-';
    }

    const path = row.path || '';
    if (!path) return '-';

    if (path.includes('amsrpusd')) return board.typed?.price_usd ? `$${board.typed.price_usd}` : '-';
    if (path.includes('ram_slots')) return board.typed?.ram_slots ? `${board.typed.ram_slots}` : '-';
    if (path.includes('ecc_support')) return String(board.typed?.ecc_support || '-');
    if (path.includes('max_capacity')) return board.typed?.max_ram_capacity_gb ? `${board.typed.max_ram_capacity_gb} GB` : '-';
    if (path.includes('rj45')) return String(board.typed?.rj45_ports ?? '1');
    if (path.includes('wireless')) return String(board.typed?.wireless || '-');
    if (path.includes('phases')) return String(board.typed?.vrm_phases?.raw || board.specs?._scorecard?.vrm_text || '-');
    if (path.includes('vcore')) return String(board.typed?.vrm_vcore || board.specs?._scorecard?.vcore_text || '-');
    if (path.includes('sata')) return String(board.typed?.sata_ports ?? '-');

    // Fuzzy traversal over board.specs
    const parts = path.split('.');
    let curr: any = board.specs;
    for (const p of parts) {
      if (!curr || typeof curr !== 'object') return '-';
      const cleanTarget = p.toLowerCase().replace(/[^a-z0-9]/g, '');
      const foundKey = Object.keys(curr).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget);
      if (foundKey) {
        curr = curr[foundKey];
      } else {
        return '-';
      }
    }
    return curr != null && curr !== '' ? String(curr) : '-';
  }

  function resolveComment(board: any, row: any): string {
    if (!board) return '';

    if (row.kind === 'custom') {
      if (row.name === 'pcie_total_slots' || row.name === 'pcie_slot_layout') {
        const c =
          board.specs?.Expansion?.['PCIe Slots']?.['Total Slot Count_comment'] ||
          board.typed?.['Expansion|PCIe Slots|Total Slot Count_comment'] ||
          '';
        return c ? `Physical Slot Layout (1–7):\n${c}` : '';
      }
      if (row.name === 'pcie_x16_electrical' || row.name === 'pcie_bifurcation') {
        return (
          board.specs?.Expansion?.['PCIe Slots']?.['Physical x16']?.['Electrical Lanes_comment'] ||
          board.typed?.['Expansion|PCIe Slots|Physical x16|Electrical Lanes_comment'] ||
          ''
        );
      }
      if (row.name === 'm2_m') {
        return (
          board.specs?.Expansion?.Storage?.['PCIe Storage']?.['M.2 (M)_comment'] ||
          board.typed?.['Expansion|Storage|PCIe Storage|M.2 (M)_comment'] ||
          ''
        );
      }
      return '';
    }

    if (row.comment) {
      const parts = row.comment.split('.');
      let curr: any = board.specs;
      for (const p of parts) {
        if (!curr || typeof curr !== 'object') return '';
        const cleanTarget = p.toLowerCase().replace(/[^a-z0-9]/g, '');
        const foundKey = Object.keys(curr).find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTarget);
        if (foundKey) {
          curr = curr[foundKey];
        } else {
          return '';
        }
      }
      return curr != null && curr !== '' ? String(curr) : '';
    }

    // Check if board.typed has matching *_comment
    if (row.path) {
      const lastPart = row.path.split('.').pop();
      if (lastPart && board.typed?.[`${lastPart}_comment`]) {
        return String(board.typed[`${lastPart}_comment`]);
      }
    }

    return '';
  }

  const scorecardRows = [
    {
      id: 'lan',
      label: 'LAN Controller',
      get: (b: any) => String(b.specs?.General?.Networking?.Ethernet?.LAN || b.typed?.lan_controllers || b.specs?._scorecard?.lan_text || '-')
    },
    {
      id: 'wireless',
      label: 'Wireless',
      get: (b: any) => String(b.specs?._scorecard?.wireless || b.typed?.wireless || '-')
    },
    {
      id: 'audio',
      label: 'Audio',
      get: (b: any) => String(b.specs?._scorecard?.audio || b.typed?.audio_codec || '-')
    },
    {
      id: 'vrm',
      label: 'VRM',
      get: (b: any) => {
        const p = b.specs?._scorecard?.vrm_text || b.typed?.vrm_phases?.raw || '-';
        const v = b.specs?._scorecard?.vcore_text || b.typed?.vrm_vcore || '';
        return v && v !== '-' ? `${p} (${v})` : p;
      }
    },
    {
      id: 'fan_headers',
      label: 'Fan Headers',
      get: (b: any) => String(b.specs?._scorecard?.fan_count ?? b.typed?.fan_headers ?? '-')
    },
    {
      id: 'argb_headers',
      label: 'ARGB Headers',
      get: (b: any) => String(b.specs?._scorecard?.argb_count ?? b.typed?.argb_headers ?? '-')
    },
    {
      id: 'diag_flash',
      label: 'Diag. & Flash',
      get: (b: any) => {
        const parts: string[] = [];
        if (b.specs?._scorecard?.bios_flash_btn) parts.push('BIOS Flash');
        const d = b.specs?._scorecard?.debug_score || 0;
        if (d >= 4) parts.push('Debug LCD');
        else if (d === 3) parts.push('POST Code');
        else if (d === 2) parts.push('Debug LEDs');
        else if (d === 1) parts.push('Power LED');
        return parts.length ? parts.join(', ') : '-';
      }
    },
    {
      id: 'usbc_header',
      label: 'USB-C Header',
      get: (b: any) => String(b.specs?._scorecard?.usbc_header || b.typed?.usbc_internal_header || '-')
    },
    {
      id: 'usb_rear',
      label: 'USB Rear',
      get: (b: any) => String(b.specs?._scorecard?.usb_ports_total || b.typed?.usb_total || '-')
    },
    {
      id: 'pcie_x16',
      label: 'PCIe x16',
      get: (b: any) => String(b.specs?._scorecard?.pcie_x16_lanes || b.typed?.pcie_x16_lanes || '-')
    },
    {
      id: 'm2_slots',
      label: 'M.2 Slots',
      get: (b: any) => String(b.specs?._scorecard?.m2_total ?? b.typed?.m2_total?.raw ?? '-')
    },
    {
      id: 'lane_sharing',
      label: 'Lane Sharing / GPU Penalty',
      get: (b: any) => analyzeLaneSharing(b).summaryBadge.text
    }
  ];

  import { analyzeRowCells, computeBaselineDelta } from '$lib/utils/diff_analyzer';
  import { analyzeLaneSharing } from '$lib/utils/bottleneck_analyzer';

  function hasVisibleScorecardRows(): boolean {
    if (!hideIdentical) return true;
    for (const scRow of scorecardRows) {
      const vals = comparedBoards.map((b: any) => scRow.get(b));
      const statuses = analyzeRowCells(scRow.label, vals);
      if (statuses.some((s) => s.hasDiff)) return true;
    }
    return false;
  }

  function hasVisibleRowsInSection(section: any): boolean {
    if (!hideIdentical) return true;
    for (const row of section.rows || []) {
      const vals = comparedBoards.map((b: any) => resolveValue(b, row));
      const statuses = analyzeRowCells(row.label || row.name, vals);
      if (statuses.some((s) => s.hasDiff)) return true;
    }
    for (const sub of section.children || []) {
      for (const row of sub.rows || []) {
        const vals = comparedBoards.map((b: any) => resolveValue(b, row));
        const statuses = analyzeRowCells(row.label || row.name, vals);
        if (statuses.some((s) => s.hasDiff)) return true;
      }
    }
    return false;
  }
</script>

<svelte:window
  onclick={(e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.search-add-container')) {
      showAddDropdown = false;
    }
  }}
/>

<div class="container-fluid px-4 py-3">
  <!-- Toolbar Header -->
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 border-bottom border-secondary pb-3 mb-3">
    <div>
      <h1 class="h3 fw-bold mb-1 d-flex align-items-center gap-2">
        <i class="bi bi-columns-gap text-primary"></i> Motherboard Comparison
      </h1>
      <p class="text-secondary small mb-0">
        Comparing {comparedBoards.length} of {allBoards.length} available models.
      </p>
    </div>

    <!-- Controls -->
    <div class="d-flex flex-wrap align-items-center gap-2 gap-sm-3 w-100 w-md-auto">
      <!-- Inline Add Motherboard Search -->
      <div class="position-relative search-add-container flex-grow-1 flex-md-grow-0" style="min-width: 200px; max-width: 100%;">
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-dark border-secondary text-secondary">
            <i class="bi bi-search"></i>
          </span>
          <input
            type="text"
            class="form-control bg-dark border-secondary text-light"
            placeholder="Add motherboard..."
            bind:value={addSearchQuery}
            onfocus={() => (showAddDropdown = true)}
            onkeydown={handleAddKeydown}
          />
          {#if addSearchQuery}
            <button
              type="button"
              class="btn btn-sm btn-dark border-secondary text-secondary"
              onclick={() => { addSearchQuery = ''; showAddDropdown = false; }}
              title="Clear search"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          {/if}
        </div>

        {#if showAddDropdown && searchMatches.length > 0}
          <div
            class="dropdown-menu show bg-dark border-secondary shadow-lg p-1 position-absolute mt-1"
            style="max-height: 340px; overflow-y: auto; z-index: 1050; width: min(340px, 95vw); left: 0;"
          >
            {#each searchMatches as mobo}
              {@const thumb = mobo.specs?.['Rear I/O']?.['Rear I/O Image Thumb'] || mobo.typed?.rear_io_image}
              <button
                type="button"
                class="dropdown-item d-flex align-items-center gap-2 p-2 rounded text-light hover-search-item cursor-pointer border-0 bg-transparent w-100"
                onclick={() => addBoard(mobo.id)}
              >
                {#if thumb && (thumb.startsWith('/') || thumb.startsWith('http'))}
                  <img src={thumb} alt="" style="height: 26px; width: 36px; object-fit: contain;" class="rounded bg-black p-0.5 flex-shrink-0" />
                {:else}
                  <div class="rounded bg-black text-secondary d-flex align-items-center justify-content-center flex-shrink-0" style="height: 26px; width: 36px;">
                    <i class="bi bi-cpu small"></i>
                  </div>
                {/if}
                <div class="flex-grow-1 text-truncate text-start">
                  <div class="fw-bold small text-light text-truncate">{mobo.brand} {mobo.model}</div>
                  <div class="d-flex gap-1 align-items-center mt-0.5">
                    <span class="badge bg-primary-subtle text-primary-emphasis" style="font-size: 0.65rem;">{mobo.chipset}</span>
                    <span class="badge bg-secondary-subtle text-light-emphasis" style="font-size: 0.65rem;">{mobo.form_factor}</span>
                  </div>
                </div>
                <i class="bi bi-plus-circle-fill text-primary ms-1 flex-shrink-0"></i>
              </button>
            {/each}
          </div>
        {:else if showAddDropdown && addSearchQuery.trim()}
          <div
            class="dropdown-menu show bg-dark border-secondary shadow-lg p-3 text-center text-secondary small position-absolute mt-1"
            style="z-index: 1050; width: min(320px, 95vw); left: 0;"
          >
            No unselected models match "{addSearchQuery}"
          </div>
        {/if}
      </div>

      <div class="d-flex align-items-center gap-3 flex-wrap">
        <div class="form-check form-switch small mb-0">
          <input class="form-check-input" type="checkbox" id="diffToggle" bind:checked={highlightDiffs} />
          <label class="form-check-label text-light fw-medium" for="diffToggle">
            <i class="bi bi-highlighter text-warning"></i> <span class="d-none d-xs-inline">Highlight</span> Diffs
          </label>
        </div>

        <div class="form-check form-switch small mb-0">
          <input class="form-check-input" type="checkbox" id="identicalToggle" bind:checked={hideIdentical} />
          <label class="form-check-label text-light fw-medium" for="identicalToggle">
            <i class="bi bi-eye-slash text-info"></i> Hide Same
          </label>
        </div>
      </div>

      {#if baselineBoard}
        <div class="d-flex align-items-center gap-1 bg-black border border-warning rounded px-2 py-1 small shadow-sm">
          <i class="bi bi-star-fill text-warning"></i>
          <span class="text-secondary" style="font-size: 0.75rem;">Base:</span>
          <span class="text-white fw-semibold text-truncate" style="max-width: 120px; font-size: 0.75rem;">{baselineBoard.brand} {baselineBoard.model}</span>
          <button
            type="button"
            class="btn btn-xs btn-link text-secondary p-0 ms-1 border-0"
            onclick={() => (baselineId = null)}
            title="Clear reference baseline"
          >
            <i class="bi bi-x-circle-fill"></i>
          </button>
        </div>
      {/if}

      <div class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-outline-success btn-sm py-1 px-2"
          disabled={comparedBoards.length === 0}
          onclick={() => (showExportModal = true)}
          title="Export comparison to Reddit, Markdown, CSV, or PNG Image Card"
        >
          <i class="bi bi-box-arrow-up me-1"></i> Export
        </button>

        <a href="/" class="btn btn-outline-primary btn-sm py-1 px-2" title="Browse full catalog on Directory">
          <i class="bi bi-grid-3x3 me-1"></i> Catalog
        </a>
      </div>
    </div>
  </div>

  {#if comparedBoards.length === 0}
    <div class="card bg-dark border-secondary p-5 text-center my-4">
      <i class="bi bi-cpu fs-1 text-secondary mb-3"></i>
      <h2 class="h4 text-light mb-2">No Motherboards Selected</h2>
      <p class="text-secondary mb-4">Select up to 10 motherboards to see an exhaustive side-by-side spec comparison.</p>
      <div>
        <a href="/" class="btn btn-primary">
          <i class="bi bi-grid-3x3"></i> Browse All Boards
        </a>
      </div>
    </div>
  {:else}
    <!-- Side-by-Side Comparison Table -->
    <div class="table-responsive border border-secondary rounded shadow-sm compare-table-container">
      <table class="table table-dark table-hover table-bordered align-middle mb-0 small">
        <!-- Sticky Board Headers -->
        <thead class="table-dark align-top border-bottom border-secondary">
          <tr>
            <th style="width: 200px; min-width: 170px; max-width: 220px;" class="bg-black text-secondary text-uppercase py-3 ps-3 sticky-col-header">
              Specification
            </th>
            {#each comparedBoards as board, i (board.id)}
              {@const typed = board.typed || {}}
              {@const boardThumb = typed.board_image_thumb || typed.board_image || board.specs?.General?.['Board Image Thumb'] || board.specs?.General?.['Board Image']}
              {@const ioThumb = board.specs?.['Rear I/O']?.['Rear I/O Image Thumb'] || typed.rear_io_image}
              {@const thumb = boardThumb || ioThumb}
              {@const fullModalImg = typed.board_image || typed.rear_io_image || thumb}
              <th style="min-width: 175px; max-width: 220px;" class="text-center position-relative py-3 bg-black {baselineId === board.id ? 'border-warning shadow-sm' : ''}">
                <!-- Move Column Left / Right Buttons -->
                <div class="position-absolute top-0 start-0 m-1 d-flex gap-1">
                  <button
                    type="button"
                    class="btn btn-xs btn-outline-secondary p-0 px-1"
                    style="font-size: 0.68rem; line-height: 1.2;"
                    disabled={i === 0}
                    onclick={() => moveBoard(i, -1)}
                    title="Move column left"
                  >
                    <i class="bi bi-chevron-left"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn-xs btn-outline-secondary p-0 px-1"
                    style="font-size: 0.68rem; line-height: 1.2;"
                    disabled={i === comparedBoards.length - 1}
                    onclick={() => moveBoard(i, 1)}
                    title="Move column right"
                  >
                    <i class="bi bi-chevron-right"></i>
                  </button>
                </div>

                <button
                  class="btn btn-sm btn-outline-danger position-absolute top-0 end-0 m-1 p-1 py-0"
                  onclick={() => removeBoard(board.id)}
                  title="Remove from comparison"
                >
                  <i class="bi bi-x-lg"></i>
                </button>

                {#if thumb && (thumb.startsWith('/') || thumb.startsWith('http'))}
                  <div class="mb-2 mt-2">
                    <button
                      type="button"
                      class="p-0 border-0 bg-transparent cursor-pointer"
                      onclick={() => openImageModal(fullModalImg, `${board.brand} ${board.model}`)}
                      title={boardThumb ? 'Click to view Motherboard PCB' : 'Click to view Rear I/O panel'}
                    >
                      <img
                        src={thumb}
                        alt="{board.brand} {board.model}"
                        style="max-height: 54px; object-fit: contain;"
                        class="rounded bg-dark p-1 hover-zoom"
                      />
                    </button>
                  </div>
                {:else}
                  <div class="mt-3"></div>
                {/if}

                <div class="fw-semibold text-uppercase" style="color: #cbd5e1; font-size: 0.8rem; letter-spacing: 0.04em;">{board.brand}</div>
                <div class="fw-bold fs-6 text-light text-truncate" title={board.model}>
                  <a href="/board/{board.id}" class="text-decoration-none text-light hover-primary">
                    {board.model}
                  </a>
                </div>
                <div class="d-flex justify-content-center gap-1 mt-1">
                  <span class="badge bg-primary-subtle text-primary-emphasis">{board.chipset}</span>
                  <span class="badge bg-secondary-subtle text-light-emphasis">{board.form_factor}</span>
                </div>

                <!-- Baseline Toggle Button -->
                <div class="mt-2">
                  {#if baselineId === board.id}
                    <button
                      type="button"
                      class="btn btn-xs btn-warning text-dark fw-bold px-2 py-0 shadow-sm"
                      style="font-size: 0.68rem;"
                      onclick={() => (baselineId = null)}
                      title="Click to clear reference baseline"
                    >
                      <i class="bi bi-star-fill me-1"></i> Baseline (Active)
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="btn btn-xs btn-outline-secondary px-2 py-0"
                      style="font-size: 0.68rem;"
                      onclick={() => (baselineId = board.id)}
                      title="Set as reference baseline to see relative deltas"
                    >
                      <i class="bi bi-star me-1"></i> Set Baseline
                    </button>
                  {/if}
                </div>
              </th>
            {/each}
          </tr>
        </thead>

        <tbody>
          <!-- 1. Scorecard Summary Section -->
          {#if hasVisibleScorecardRows()}
            <tr
              class="table-secondary bg-black border-top border-secondary section-header-row"
              onclick={() => toggleSection('scorecard')}
              style="cursor: pointer; user-select: none;"
              title="Click to {collapsedSections.has('scorecard') ? 'expand' : 'collapse'} Scorecard Summary"
            >
              <th colspan={comparedBoards.length + 1} class="text-uppercase fw-bold text-primary px-3 py-2">
                <span class="sticky-section-title">
                  <i class="bi {collapsedSections.has('scorecard') ? 'bi-chevron-right' : 'bi-chevron-down'} me-1"></i>
                  <i class="bi bi-star-fill text-warning me-1"></i> Scorecard Summary
                </span>
              </th>
            </tr>

            {#if !collapsedSections.has('scorecard')}
              {#each scorecardRows as scRow}
              {@const rowValues = comparedBoards.map((b) => scRow.get(b))}
              {@const statuses = analyzeRowCells(scRow.label, rowValues)}
              {@const isIdentical = !statuses.some((s) => s.hasDiff)}
              {#if !hideIdentical || !isIdentical}
                <tr>
                  <td class="text-light-emphasis ps-4 fw-medium border-secondary row-label">
                    <span>{scRow.label}</span>
                  </td>
                  {#each comparedBoards as board, i (board.id)}
                    {@const status = highlightDiffs ? statuses[i] : null}
                    {@const baseDelta = baselineBoard && board.id !== baselineBoard.id ? computeBaselineDelta(scRow.label, rowValues[i], scRow.get(baselineBoard)) : null}
                    <td
                      class="text-center border-secondary position-relative"
                      style={status && status.isDiff ? `background-color: ${status.bgStyle}; border-left: ${status.borderStyle} !important;` : ''}
                    >
                      {#if status && status.isDiff && status.badge}
                        <span
                          class="badge position-absolute top-0 end-0 m-1 {status.isBest ? 'bg-success' : (status.isWorst ? 'bg-danger' : 'bg-warning text-dark')}"
                          style="font-size: 0.6rem; padding: 1px 4px;"
                        >
                          {status.badge}
                        </span>
                      {/if}

                      {#if scRow.id === 'lan'}
                        {@const text = scRow.get(board)}
                        {@const badges = board.specs?._scorecard?.lan_badges || []}
                        <div class="d-flex align-items-center justify-content-center flex-wrap gap-2">
                          <span class="small">{text}</span>
                          {#if badges.length > 0}
                            <div class="d-flex gap-1 justify-content-center">
                              {#each badges as b}
                                <span class="badge {b.color}" title={b.name}>{b.label}</span>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      {:else if scRow.id === 'vrm'}
                        {@const phase = board.specs?._scorecard?.vrm_text || board.typed?.vrm_phases?.raw || '-'}
                        {@const vcore = board.specs?._scorecard?.vcore_text || board.typed?.vrm_vcore || ''}
                        {@const note = board.specs?._scorecard?.vrm_note || ''}
                        <div>
                          <div class="fw-semibold">
                            {phase}
                            {#if note}
                              <i class="bi bi-info-circle text-info ms-1" style="font-size: 0.8em; cursor: pointer;" title={note}></i>
                            {/if}
                          </div>
                          {#if vcore && vcore !== '-'}
                            <div class="small text-secondary">{vcore}</div>
                          {/if}
                        </div>
                      {:else if scRow.id === 'diag_flash'}
                        {@const sc = board.specs?._scorecard || {}}
                        {@const dScore = sc.debug_score || 0}
                        <div class="d-flex justify-content-center align-items-center gap-2 py-1">
                          {#if sc.bios_flash_btn}
                            <img
                              src="/img/icons/bios-flash.svg"
                              class="custom-icon"
                              title="BIOS Flash Button"
                              alt="BIOS Flash"
                              style="height: 24px; width: auto;"
                            />
                          {/if}
                          {#if dScore >= 4}
                            <img
                              src="/img/icons/debug-lcd.svg"
                              class="custom-icon"
                              title="LCD Display"
                              alt="LCD Display"
                              style="height: 24px; width: auto;"
                            />
                          {:else if dScore === 3}
                            <img
                              src="/img/icons/debug-post.svg"
                              class="custom-icon"
                              title="POST Code"
                              alt="POST Code"
                              style="height: 24px; width: auto;"
                            />
                          {:else if dScore === 2}
                            <img
                              src="/img/icons/debug-led.svg"
                              class="custom-icon"
                              title="Debug LED(s)"
                              alt="Debug LEDs"
                              style="height: 24px; width: auto;"
                            />
                          {:else if dScore === 1}
                            <img
                              src="/img/icons/debug-power.svg"
                              class="custom-icon"
                              title="Power LED"
                              alt="Power LED"
                              style="height: 24px; width: auto;"
                            />
                          {/if}
                          {#if !sc.bios_flash_btn && dScore === 0}
                            <span class="text-secondary small">-</span>
                          {/if}
                        </div>
                      {:else if scRow.id === 'usbc_header'}
                        {@const val = String(board.specs?._scorecard?.usbc_header || board.typed?.usbc_internal_header || '-')}
                        {#if val && val.includes('*')}
                          {@const parts = val.split('*')}
                          {@const count = parts[0]}
                          {@const speed = parts[1].toUpperCase()}
                          {@const badgeColor = speed.includes('40G') ? 'bg-warning text-dark' : (speed.includes('20G') ? 'bg-success' : (speed.includes('10G') ? 'bg-primary' : (speed.includes('5G') ? 'bg-info text-dark' : 'bg-secondary')))}
                          <span>{count}x <span class="badge {badgeColor}">{speed}</span></span>
                        {:else}
                          <span>{val}</span>
                        {/if}
                      {:else if scRow.id === 'usb_rear'}
                        {@const sc = board.specs?._scorecard || {}}
                        {@const total = sc.usb_ports_total || board.typed?.usb_total || '-'}
                        {@const aTotal = board.typed?.usba_total ?? (board.specs?.['Rear I/O']?.['USB']?.['Type-A Total']) ?? ''}
                        {@const cTotal = board.typed?.usbc_total ?? (board.specs?.['Rear I/O']?.['USB']?.['Type-C Total']) ?? ''}
                        {@const usb = sc.usb_details || {}}
                        {@const typeA = usb.type_a || {}}
                        {@const typeC = usb.type_c || {}}
                        <div>
                          <div class="fw-bold mb-2 border-bottom border-secondary pb-1 mx-auto" style="width: fit-content;">
                            {total} Total
                            {#if aTotal || cTotal}
                              <span class="fw-normal text-secondary ms-1" style="font-size: 0.9em;">({aTotal}A + {cTotal}C)</span>
                            {/if}
                          </div>
                          <div class="d-flex flex-column gap-1 align-items-center">
                            {#if (typeA['3.2_10g'] || typeA['3.2_5g'] || typeA['2.0'])}
                              <div class="d-flex align-items-center">
                                <span class="me-2 text-secondary fw-bold" style="width: 20px; text-align: right; font-size: 0.85em;">A:</span>
                                <div class="d-flex gap-1 align-items-center flex-wrap">
                                  {#if typeA['3.2_10g']}{typeA['3.2_10g']}x <span class="badge bg-primary">10G</span>{/if}
                                  {#if typeA['3.2_5g']}{typeA['3.2_5g']}x <span class="badge bg-info text-dark">5G</span>{/if}
                                  {#if typeA['2.0']}{typeA['2.0']}x <span class="badge bg-secondary">2.0</span>{/if}
                                </div>
                              </div>
                            {/if}
                            {#if (typeC['usb4_40g'] || typeC['3.2_20g'] || typeC['3.2_10g'] || typeC['3.2_5g'])}
                              <div class="d-flex align-items-center">
                                <span class="me-2 text-secondary fw-bold" style="width: 20px; text-align: right; font-size: 0.85em;">C:</span>
                                <div class="d-flex gap-1 align-items-center flex-wrap">
                                  {#if typeC['usb4_40g']}{typeC['usb4_40g']}x <span class="badge bg-warning text-dark">40G</span>{/if}
                                  {#if typeC['3.2_20g']}{typeC['3.2_20g']}x <span class="badge bg-success">20G</span>{/if}
                                  {#if typeC['3.2_10g']}{typeC['3.2_10g']}x <span class="badge bg-primary">10G</span>{/if}
                                  {#if typeC['3.2_5g']}{typeC['3.2_5g']}x <span class="badge bg-info text-dark">5G</span>{/if}
                                </div>
                              </div>
                            {/if}
                          </div>
                        </div>
                      {:else if scRow.id === 'pcie_x16'}
                        {@const sc = board.specs?._scorecard || {}}
                        {@const total = sc.pcie_x16_total ?? board.typed?.pcie_x16_total ?? '-'}
                        {@const comment = sc.pcie_x16_comment}
                        {@const details = sc.pcie_x16_details || (board.typed?.pcie_x16_lanes ? [board.typed.pcie_x16_lanes] : [])}
                        <div>
                          <div class="fw-bold mb-1">
                            {total} Total
                            {#if comment}
                              <i class="bi bi-info-circle text-info ms-1" style="font-size: 0.8em; cursor: pointer;" title={comment}></i>
                            {/if}
                          </div>
                          {#each details as detail}
                            <div class="small text-secondary" style="white-space: nowrap;">{@html detail}</div>
                          {/each}
                        </div>
                      {:else if scRow.id === 'm2_slots'}
                        {@const sc = board.specs?._scorecard || {}}
                        {@const total = sc.m2_total ?? board.typed?.m2_total?.raw ?? '-'}
                        {@const note = sc.m2_note}
                        {@const details = sc.m2_details || []}
                        <div>
                          <div class="fw-bold mb-1">
                            {total} Total
                            {#if note}
                              <i class="bi bi-info-circle-fill text-info ms-1" style="font-size: 0.8em; cursor: pointer;" title={note}></i>
                            {/if}
                          </div>
                          {#each details as detail}
                            <div class="small text-secondary" style="white-space: nowrap;">{detail}</div>
                          {/each}
                        </div>
                      {:else if scRow.id === 'lane_sharing'}
                        {@const laneInfo = analyzeLaneSharing(board)}
                        <div>
                          <span class="badge {laneInfo.summaryBadge.variant === 'danger' ? 'bg-danger' : (laneInfo.summaryBadge.variant === 'warning' ? 'bg-warning text-dark' : 'bg-success')}" style="font-size: 0.72rem;">
                            <i class="bi {laneInfo.summaryBadge.icon} me-1"></i>
                            {laneInfo.summaryBadge.text}
                          </span>
                          <div class="mt-1">
                            <button
                              type="button"
                              class="btn btn-xs btn-outline-warning py-0 px-2"
                              style="font-size: 0.68rem;"
                              onclick={() => (activeSimulatorBoard = board)}
                              title="Simulate lane allocations for {board.brand} {board.model}"
                            >
                              <i class="bi bi-diagram-3 me-0.5"></i> Simulate
                            </button>
                          </div>
                          {#if laneInfo.warnings.length > 0}
                            <div class="small text-secondary mt-1 text-start" style="font-size: 0.72rem; max-width: 220px; margin: 0 auto;">
                              {#each laneInfo.warnings as w}
                                <div class="d-flex align-items-start gap-1 mb-1">
                                  <i class="bi {w.severity === 'danger' ? 'bi-exclamation-octagon-fill text-danger' : (w.severity === 'warning' ? 'bi-exclamation-triangle-fill text-warning' : 'bi-info-circle-fill text-info')} flex-shrink-0 mt-0.5" style="font-size: 0.7rem;"></i>
                                  <span class="text-light-emphasis">{w.title}</span>
                                </div>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      {:else}
                        <span>{scRow.get(board)}</span>
                      {/if}

                      {#if baseDelta}
                        <div class="mt-1">
                          <span
                            class="badge {baseDelta.positive === true ? 'bg-success-subtle text-success-emphasis border border-success-subtle' : (baseDelta.positive === false ? 'bg-danger-subtle text-danger-emphasis border border-danger-subtle' : 'bg-secondary-subtle text-secondary-emphasis border border-secondary')}"
                            style="font-size: 0.65rem; padding: 1px 4px;"
                          >
                            {baseDelta.text}
                          </span>
                        </div>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/if}
            {/each}
            {/if}
          {/if}

        {#snippet specRow(row: any)}
          {@const rowValues = comparedBoards.map((b) => resolveValue(b, row))}
          {@const statuses = analyzeRowCells(row.label || row.name, rowValues)}
          {@const isIdentical = !statuses.some((s) => s.hasDiff)}
          {#if !hideIdentical || !isIdentical}
            <tr>
              <td class="text-light-emphasis ps-4 fw-medium border-secondary row-label">
                <span>{@html row.label}</span>
              </td>
              {#each comparedBoards as board, i (board.id)}
                {@const val = rowValues[i]}
                {@const cmt = resolveComment(board, row)}
                {@const status = highlightDiffs ? statuses[i] : null}
                {@const baseDelta = baselineBoard && board.id !== baselineBoard.id ? computeBaselineDelta(row.label || row.name, val, resolveValue(baselineBoard, row)) : null}
                <td
                  class="text-center border-secondary position-relative"
                  style={status && status.isDiff ? `background-color: ${status.bgStyle}; border-left: ${status.borderStyle} !important;` : ''}
                >
                  {#if status && status.isDiff && status.badge}
                    <span
                      class="badge position-absolute top-0 end-0 m-1 {status.isBest ? 'bg-success' : (status.isWorst ? 'bg-danger' : 'bg-warning text-dark')}"
                      style="font-size: 0.6rem; padding: 1px 4px;"
                    >
                      {status.badge}
                    </span>
                  {/if}

                  {#if row.name === 'website'}
                    {#if val}
                      <a href={val} target="_blank" rel="noreferrer" class="btn btn-xs btn-outline-info btn-sm py-0">
                        Official Page
                      </a>
                    {:else}
                      <span class="text-secondary">-</span>
                    {/if}
                  {:else if row.name === 'io_image'}
                    {#if val}
                      <button
                        type="button"
                        class="p-0 border-0 bg-transparent cursor-pointer"
                        onclick={() => openImageModal(val, `${board.brand} ${board.model}`)}
                        title="Click to view full Rear I/O image"
                      >
                        <img src={val} alt="Rear I/O" style="max-height: 40px;" class="rounded hover-zoom" />
                      </button>
                    {:else}
                      <span class="text-secondary">-</span>
                    {/if}
                  {:else if row.name === 'io_image_link'}
                    {#if val}
                      <button
                        type="button"
                        class="btn btn-xs btn-outline-info btn-sm py-0"
                        onclick={() => openImageModal(val, `${board.brand} ${board.model}`)}
                        title="Click to view full Rear I/O image"
                      >
                        <i class="bi bi-card-image me-1"></i> View Image
                      </button>
                    {:else}
                      <span class="text-secondary">-</span>
                    {/if}
                  {:else if row.name === 'notes'}
                    {#if parseNotesList(val).length > 0}
                      <ul class="list-unstyled mb-0 text-start d-flex flex-column gap-2 small px-2" style="min-width: 220px;">
                        {#each parseNotesList(val) as note}
                          <li class="d-flex align-items-start gap-1">
                            <i class="bi bi-arrow-right-short text-info fs-6 flex-shrink-0"></i>
                            <span class="text-light-emphasis">{note}</span>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <span class="text-secondary">-</span>
                    {/if}
                  {:else if row.name === 'm2_m'}
                    {#if parseM2Generations(val).length > 0}
                      <div class="d-flex flex-column gap-1 align-items-center font-monospace">
                        {#each parseM2Generations(val) as gen}
                          <span class="badge {m2GenBadgeClass(gen)}">{gen}</span>
                        {/each}
                      </div>
                    {:else}
                      <span class="text-secondary">-</span>
                    {/if}
                    {#if cmt}
                      <span class="text-info cursor-help ms-1" title={cmt}>
                        <i class="bi bi-info-circle-fill" style="font-size: 0.75rem;"></i>
                      </span>
                    {/if}
                  {:else if row.name === 'pcie_bifurcation'}
                    {#if val !== '-'}
                      <span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle font-monospace fw-semibold">
                        {val}
                      </span>
                    {:else}
                      <span class="text-secondary">-</span>
                    {/if}
                    {#if cmt}
                      <span class="text-info cursor-help ms-1" title={cmt}>
                        <i class="bi bi-info-circle-fill" style="font-size: 0.75rem;"></i>
                      </span>
                    {/if}
                  {:else if row.name === 'pcie_slot_layout'}
                    {#if val !== '-'}
                      <div
                        class="font-monospace small text-light-emphasis text-center py-1 px-2 rounded bg-black border border-secondary"
                        style="font-size: 0.75rem; letter-spacing: 0.02em;"
                        title="Physical slot positions 1 to 7 (top to bottom). '-' denotes empty slot position."
                      >
                        {val}
                      </div>
                    {:else}
                      <span class="text-secondary">-</span>
                    {/if}
                  {:else}
                    <span>{val}</span>
                    {#if cmt}
                      <span class="text-info cursor-help ms-1" title={cmt}>
                        <i class="bi bi-info-circle-fill" style="font-size: 0.75rem;"></i>
                      </span>
                    {/if}
                  {/if}

                  {#if baseDelta}
                    <div class="mt-1">
                      <span
                        class="badge {baseDelta.positive === true ? 'bg-success-subtle text-success-emphasis border border-success-subtle' : (baseDelta.positive === false ? 'bg-danger-subtle text-danger-emphasis border border-danger-subtle' : 'bg-secondary-subtle text-secondary-emphasis border border-secondary')}"
                        style="font-size: 0.65rem; padding: 1px 4px;"
                      >
                        {baseDelta.text}
                      </span>
                    </div>
                  {/if}
                </td>
              {/each}
            </tr>
          {/if}
        {/snippet}

          <!-- 2. Walk Declarative Layout Sections -->
          {#each layout as section (section.id)}
            {#if section.id !== 'scorecard' && hasVisibleRowsInSection(section)}
              <!-- Section Header (Collapsible) -->
              <tr
                class="table-secondary bg-black border-top border-secondary section-header-row"
                onclick={() => toggleSection(section.id)}
                style="cursor: pointer; user-select: none;"
                title="Click to {collapsedSections.has(section.id) ? 'expand' : 'collapse'} {section.title}"
              >
                <th colspan={comparedBoards.length + 1} class="text-uppercase fw-bold text-primary px-3 py-2">
                  <span class="sticky-section-title">
                    <i class="bi {collapsedSections.has(section.id) ? 'bi-chevron-right' : 'bi-chevron-down'} me-1"></i>
                    {section.title}
                  </span>
                </th>
              </tr>

              {#if !collapsedSections.has(section.id)}
                <!-- Direct Section Rows (e.g. Notes, Rear I/O Image) -->
                {#each section.rows || [] as row}
                  {@render specRow(row)}
                {/each}

                <!-- Subsections -->
                {#each section.children || [] as sub (sub.id)}
                  {#each sub.rows || [] as row}
                    {@render specRow(row)}
                  {/each}
                {/each}
              {/if}
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Export Modal Dialog -->
<ExportModal
  isOpen={showExportModal}
  boards={comparedBoards}
  scorecardRows={scorecardRows}
  layout={layout}
  resolveValue={resolveValue}
  onClose={() => (showExportModal = false)}
/>

<!-- Rear I/O Image Modal Dialog -->
{#if activeModalImage}
  <button
    type="button"
    class="modal-backdrop fade show border-0"
    style="z-index: 1060;"
    onclick={closeImageModal}
    aria-label="Close image modal"
  ></button>

  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="z-index: 1065;"
    onkeydown={(e) => e.key === 'Escape' && closeImageModal()}
  >
    <div class="modal-dialog modal-xl modal-dialog-centered">
      <div class="modal-content bg-dark text-light border border-secondary shadow-lg">
        <div class="modal-header bg-black border-secondary py-3 px-4 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-card-image text-info fs-5"></i>
            <h5 class="modal-title fw-bold text-white mb-0">Rear I/O Panel: {activeModalImage.title}</h5>
          </div>
          <div class="d-flex align-items-center gap-2">
            <a
              href={activeModalImage.src}
              target="_blank"
              rel="noreferrer"
              class="btn btn-sm btn-outline-info"
              title="Open full-resolution image in new tab"
            >
              <i class="bi bi-box-arrow-up-right me-1"></i> Open Original
            </a>
            <button type="button" class="btn-close btn-close-white" onclick={closeImageModal} aria-label="Close"></button>
          </div>
        </div>
        <div class="modal-body text-center p-4 bg-black d-flex align-items-center justify-content-center">
          <img
            src={activeModalImage.src}
            alt={activeModalImage.title}
            class="img-fluid rounded border border-secondary shadow"
            style="max-height: 75vh; object-fit: contain;"
          />
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Interactive PCIe Lane Sharing Simulator Dialog -->
<LaneSharingSimulator
  board={activeSimulatorBoard}
  isOpen={Boolean(activeSimulatorBoard)}
  onClose={() => (activeSimulatorBoard = null)}
/>

<style>
  .sticky-col-header {
    position: sticky;
    left: 0;
    z-index: 25;
    background-color: #0d1117 !important;
    box-shadow: 2px 0 6px rgba(0, 0, 0, 0.45);
  }
  .row-label {
    position: sticky;
    left: 0;
    z-index: 15;
    background-color: #161b22 !important;
    box-shadow: 2px 0 6px rgba(0, 0, 0, 0.45);
    min-width: 170px;
    max-width: 220px;
  }
  .sticky-section-title {
    position: sticky;
    left: 1rem;
    display: inline-flex;
    align-items: center;
    max-width: calc(100vw - 32px);
  }
  .compare-table-container {
    -webkit-overflow-scrolling: touch;
  }
  .hover-primary:hover {
    color: #0d6efd !important;
    text-decoration: underline !important;
  }
  .section-header-row {
    transition: background-color 0.15s ease-in-out;
  }
  .section-header-row:hover th {
    color: #38bdf8 !important;
  }
  .hover-zoom {
    transition: transform 0.15s ease, filter 0.15s ease;
  }
  .hover-zoom:hover {
    transform: scale(1.08);
    filter: brightness(1.15);
  }
  .hover-search-item {
    transition: background-color 0.1s ease-in-out;
  }
  .hover-search-item:hover,
  .hover-search-item:focus {
    background-color: rgba(13, 110, 253, 0.25) !important;
  }

  /* USB Icon Colors */
  :global(.usb-icon) {
    font-weight: bold;
    margin-right: 0.35rem;
    font-style: normal;
    display: inline-block;
  }
  :global(.usb-20) {
    color: #94a3b8 !important;
  }
  :global(.usb-30),
  :global(.usb-5g) {
    color: #38bdf8 !important;
  }
  :global(.usb-10g) {
    color: #3b82f6 !important;
  }
  :global(.usb-20g) {
    color: #22c55e !important;
  }
  :global(.usb-40g),
  :global(.usb-tb) {
    color: #eab308 !important;
  }

  /* Custom Diag & Flash Icons */
  :global(.custom-icon) {
    display: inline-block;
    vertical-align: middle;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
  }
</style>
