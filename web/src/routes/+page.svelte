<script lang="ts">
  import { onMount } from 'svelte';
  import { compareStore } from '$lib/stores/compare';
  import {
    getNestedValue,
    matchesGlobalSearch,
    filterMobos,
    sortMobos,
    availableValuesFor,
    sortFilterOptions,
    chipsetBadgeClass,
    formFactorBadgeClass,
    matchesX8X8,
    matchesWhiteTheme,
    matchesBlackTheme,
    matchesGranularColor,
    matchesBackConnect,
    matchesTwoDimm,
    parseNotesList,
    parseM2Generations,
    m2GenBadgeClass,
    type DynamicColumn,
    type SortState
  } from '$lib/table_logic';
  import ColumnFilterDropdown from '$lib/components/ColumnFilterDropdown.svelte';
  import ColumnPickerModal, { type FeatureItem } from '$lib/components/ColumnPickerModal.svelte';
  import VirtualizedBoardTable from '$lib/components/VirtualizedBoardTable.svelte';
  import { analyzeLaneSharing } from '$lib/utils/bottleneck_analyzer';

  let { data } = $props();
  let boards = $derived(data.boards || []);
  let meta = $derived(data.meta || {});
  let features = $derived<FeatureItem[]>(data.features || []);
  let structure = $derived(data.structure || []);

  // Dynamic columns state
  let dynamicColumns = $state<DynamicColumn[]>([
    { id: 'dyn1', key: 'Expansion|Storage|PCIe Storage|Total M.2', label: 'Total M.2', category: 'Expansion > Storage > PCIe Storage' },
    { id: 'dyn2', key: 'Power|VRM configuration|Phase config', label: 'Phase Config', category: 'Power > VRM configuration' },
    { id: 'dyn3', key: 'General|Audio|Audio Codec+DAC', label: 'Audio Codec', category: 'General > Audio' },
    { id: 'dyn4', key: 'Rear I/O|USB|Total USB', label: 'Rear USB Total', category: 'Rear I/O > USB' }
  ]);

  // Global search & quick filters
  let searchQuery = $state('');
  let filterPcie5 = $state(false);
  let filterUsb4 = $state(false);
  let filterWifi7 = $state(false);
  let filterX8X8 = $state(false);
  let filterWhiteTheme = $state(false);
  let filterBlackTheme = $state(false);
  let filterBackConnect = $state(false);
  let filterTwoDimm = $state(false);
  let selectedColorTheme = $state<string>('all');
  let showColorDropdown = $state(false);

  let x8Count = $derived(boards.filter((b) => matchesX8X8(b)).length);
  let whiteCount = $derived(boards.filter((b) => matchesWhiteTheme(b)).length);
  let blackCount = $derived(boards.filter((b) => matchesBlackTheme(b)).length);
  let btfCount = $derived(boards.filter((b) => matchesBackConnect(b)).length);
  let twoDimmCount = $derived(boards.filter((b) => matchesTwoDimm(b)).length);

  function colorThemeCount(theme: string): number {
    return boards.filter((b) => matchesGranularColor(b, theme)).length;
  }

  function getColorThemeLabel(theme: string): string {
    switch (theme) {
      case 'stealth':
        return 'Stealth / All-Black';
      case 'white_pcb':
        return 'Pure White PCB';
      case 'white_heatsink':
        return 'White/Silver HS';
      case 'black_gold':
        return 'Gold / Copper';
      case 'black_red':
        return 'Red / Orange';
      case 'black_lime':
        return 'Lime Green';
      case 'black_blue':
        return 'Blue / Cyan';
      case 'gunmetal':
        return 'Gunmetal / Gray';
      default:
        return 'Color / Theme';
    }
  }

  // Sorting state
  let sortState = $state<SortState>({
    column: 'brand',
    direction: 'asc'
  });

  // Per-column filter sets: maps column id -> Set of selected values
  let columnFilters = $state<Record<string, Set<string>>>({
    brand: new Set(),
    chipset: new Set(),
    form_factor: new Set(),
    model: new Set(),
    dyn1: new Set(),
    dyn2: new Set(),
    dyn3: new Set(),
    dyn4: new Set()
  });

  // UI state
  let openDropdownId = $state<string | null>(null);
  let showColumnPicker = $state(false);
  let inspectingBoard = $state<any | null>(null);

  // Derived dynamic keys dictionary: { dyn1: "path...", dyn2: "path..." }
  let dynamicKeys = $derived.by(() => {
    const map: Record<string, string> = {};
    for (const col of dynamicColumns) {
      map[col.id] = col.key;
    }
    return map;
  });

  let activeColumnKeys = $derived(dynamicColumns.map((c) => c.key));

  // Distinct all-values per column across whole dataset
  let columnAllValues = $derived.by(() => {
    const map: Record<string, string[]> = {};
    const cols = ['brand', 'chipset', 'form_factor', 'model', ...dynamicColumns.map((c) => c.id)];

    for (const col of cols) {
      const set = new Set<string>();
      for (const m of boards) {
        let val: string;
        if (col.startsWith('dyn')) {
          const key = dynamicKeys[col];
          val = key ? getNestedValue(m, key) : '-';
        } else if (col === 'brand') {
          val = m.brand || '-';
        } else if (col === 'chipset') {
          val = m.chipset || '-';
        } else if (col === 'form_factor') {
          val = m.form_factor || '-';
        } else {
          val = m[col] || '-';
        }
        if (val !== undefined && val !== null && val !== '') {
          set.add(String(val));
        }
      }
      map[col] = sortFilterOptions(col, Array.from(set));
    }
    return map;
  });

  // Available values and counts for each column based on active cross-filters
  let columnAvailableData = $derived.by(() => {
    const map: Record<string, { available: Set<string>; counts: Map<string, number> }> = {};
    const cols = ['brand', 'chipset', 'form_factor', 'model', ...dynamicColumns.map((c) => c.id)];

    for (const col of cols) {
      map[col] = availableValuesFor(boards, col, {
        search: searchQuery,
        filters: columnFilters,
        dynamicKeys,
        quickFilters: {
          pcie5: filterPcie5,
          usb4: filterUsb4,
          wifi7: filterWifi7,
          x8x8: filterX8X8,
          whiteTheme: filterWhiteTheme,
          blackTheme: filterBlackTheme,
          backConnect: filterBackConnect,
          twoDimm: filterTwoDimm,
          colorTheme: selectedColorTheme
        }
      });
    }
    return map;
  });

  // Filtered and sorted boards
  let filteredBoards = $derived(
    sortMobos(
      filterMobos(boards, {
        search: searchQuery,
        filters: columnFilters,
        dynamicKeys,
        quickFilters: {
          pcie5: filterPcie5,
          usb4: filterUsb4,
          wifi7: filterWifi7,
          x8x8: filterX8X8,
          whiteTheme: filterWhiteTheme,
          blackTheme: filterBlackTheme,
          backConnect: filterBackConnect,
          twoDimm: filterTwoDimm,
          colorTheme: selectedColorTheme
        }
      }),
      sortState,
      dynamicKeys
    )
  );

  let hasActiveFilters = $derived.by(() => {
    if (searchQuery.trim() !== '') return true;
    if (
      filterPcie5 ||
      filterUsb4 ||
      filterWifi7 ||
      filterX8X8 ||
      filterWhiteTheme ||
      filterBlackTheme ||
      filterBackConnect ||
      filterTwoDimm ||
      selectedColorTheme !== 'all'
    )
      return true;
    for (const key in columnFilters) {
      if (columnFilters[key] && columnFilters[key].size > 0) return true;
    }
    return false;
  });

  // Sorting
  function toggleSort(col: string) {
    if (sortState.column === col) {
      sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.column = col;
      sortState.direction = col.includes('MSRP') || col.includes('price') ? 'desc' : 'asc';
    }
    saveStateToUrl();
  }

  // Filter changes
  function handleFilterChange(col: string, newSelected: Set<string>) {
    columnFilters[col] = newSelected;
    saveStateToUrl();
  }

  function resetFilters() {
    searchQuery = '';
    filterPcie5 = false;
    filterUsb4 = false;
    filterWifi7 = false;
    filterX8X8 = false;
    filterWhiteTheme = false;
    filterBlackTheme = false;
    filterBackConnect = false;
    filterTwoDimm = false;
    selectedColorTheme = 'all';
    for (const key in columnFilters) {
      columnFilters[key] = new Set();
    }
    saveStateToUrl();
  }

  // Column management
  function addDynamicColumn(feature: FeatureItem) {
    const existingIds = dynamicColumns.map((c) => parseInt(c.id.replace('dyn', '')) || 0);
    const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
    const colId = `dyn${nextNum}`;

    dynamicColumns = [
      ...dynamicColumns,
      {
        id: colId,
        key: feature.key,
        label: feature.name,
        category: feature.category
      }
    ];
    columnFilters[colId] = new Set();
    saveStateToUrl();
  }

  function removeDynamicColumn(colId: string) {
    dynamicColumns = dynamicColumns.filter((c) => c.id !== colId);
    delete columnFilters[colId];
    if (sortState.column === colId) {
      sortState.column = 'brand';
      sortState.direction = 'asc';
    }
    saveStateToUrl();
  }

  function removeDynamicColumnByKey(key: string) {
    const col = dynamicColumns.find((c) => c.key === key);
    if (col) {
      removeDynamicColumn(col.id);
    }
  }

  // Compare selection actions
  function handleRowClick(e: MouseEvent, id: string) {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('a, button, select, label, .dropdown-menu, .modal, .drawer')) {
      return;
    }
    if (target && target.closest('input[type="checkbox"]')) {
      return;
    }
    compareStore.toggle(id);
  }


  function selectVisible() {
    const ids = filteredBoards.map((b: any) => b.id);
    const current = new Set($compareStore);
    ids.forEach((id: string) => current.add(id));
    compareStore.set(Array.from(current).slice(0, 10));
  }

  function clearCompareSelection() {
    compareStore.clear();
  }

  // Modal / Drawer inspect
  function openDetail(board: any) {
    inspectingBoard = board;
  }

  function closeDetail() {
    inspectingBoard = null;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (inspectingBoard) closeDetail();
      if (showColumnPicker) showColumnPicker = false;
      if (openDropdownId) openDropdownId = null;
      if (showColorDropdown) showColorDropdown = false;
    }
  }

  let shareCopied = $state(false);

  // URL state persistence (Human-readable parameters)
  function saveStateToUrl() {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams();

      const q = searchQuery.trim();
      if (q) params.set('search', q);

      if (filterX8X8) params.set('x8', '1');
      if (filterPcie5) params.set('pcie5', '1');
      if (filterUsb4) params.set('usb4', '1');
      if (filterWifi7) params.set('wifi7', '1');
      if (filterWhiteTheme) params.set('white', '1');
      if (filterBlackTheme) params.set('black', '1');
      if (filterBackConnect) params.set('btf', '1');
      if (filterTwoDimm) params.set('twodimm', '1');
      if (selectedColorTheme && selectedColorTheme !== 'all') {
        params.set('color', selectedColorTheme);
      }

      if (sortState.column) {
        params.set('sort', `${sortState.column}:${sortState.direction}`);
      }

      if (dynamicColumns.length > 0) {
        params.set('cols', dynamicColumns.map((c) => c.key).join(','));
      }

      for (const [col, set] of Object.entries(columnFilters)) {
        if (set && set.size > 0) {
          params.set(col, Array.from(set).join(','));
        }
      }

      const queryStr = params.toString();
      const newUrl = queryStr
        ? `${window.location.pathname}?${queryStr}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } catch (e) {
      // Ignored for SSR or bad state
    }
  }

  function loadStateFromUrl() {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    // 1. Check legacy base64 ?v=
    const legacyEncoded = params.get('v');
    if (legacyEncoded) {
      try {
        let base64 = legacyEncoded.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        const state = JSON.parse(atob(base64));

        if (state.s) searchQuery = state.s;
        if (state.p5) filterPcie5 = true;
        if (state.u4) filterUsb4 = true;
        if (state.w7) filterWifi7 = true;
        if (state.x8) filterX8X8 = true;

        if (state.k && Object.keys(state.k).length > 0) {
          const loadedCols: DynamicColumn[] = [];
          for (const [colId, info] of Object.entries<any>(state.k)) {
            loadedCols.push({
              id: colId,
              key: typeof info === 'string' ? info : info.key,
              label: typeof info === 'string' ? info.split('|').pop() || info : info.label,
              category: typeof info === 'object' ? info.cat : ''
            });
          }
          dynamicColumns = loadedCols;
        }

        if (state.f) {
          for (const k in state.f) {
            columnFilters[k] = new Set(state.f[k]);
          }
        }

        if (state.o && state.o.c) {
          sortState = { column: state.o.c, direction: state.o.d || 'asc' };
        }
        return;
      } catch (e) {
        console.warn('Failed to parse legacy URL state:', e);
      }
    }

    // 2. Parse Human-readable parameters
    const s = params.get('search') || params.get('s');
    if (s) searchQuery = s;

    if (params.get('x8') === '1' || params.get('bifurcation') === '1') filterX8X8 = true;
    if (params.get('pcie5') === '1' || params.get('p5') === '1') filterPcie5 = true;
    if (params.get('usb4') === '1' || params.get('u4') === '1') filterUsb4 = true;
    if (params.get('wifi7') === '1' || params.get('w7') === '1') filterWifi7 = true;
    if (params.get('white') === '1') filterWhiteTheme = true;
    if (params.get('black') === '1') filterBlackTheme = true;
    if (params.get('btf') === '1') filterBackConnect = true;
    if (params.get('twodimm') === '1') filterTwoDimm = true;
    if (params.get('color')) {
      const cTheme = params.get('color')!;
      selectedColorTheme = cTheme;
      if (cTheme === 'stealth') filterBlackTheme = true;
      if (cTheme === 'white_pcb' || cTheme === 'white_heatsink') filterWhiteTheme = true;
    }

    const sortParam = params.get('sort');
    if (sortParam) {
      const [col, dir] = sortParam.split(':');
      if (col) {
        sortState = { column: col, direction: dir === 'desc' ? 'desc' : 'asc' };
      }
    }

    // Dynamic columns from ?cols=key1,key2
    const colsParam = params.get('cols');
    if (colsParam) {
      const keys = colsParam.split(',').map((k) => k.trim()).filter(Boolean);
      const restoredCols: DynamicColumn[] = [];
      keys.forEach((key, idx) => {
        const feat = features.find((f: FeatureItem) => f.key === key);
        restoredCols.push({
          id: `dyn${idx + 1}`,
          key,
          label: feat ? feat.name : key.split('|').pop() || key,
          category: feat ? feat.category : ''
        });
      });
      if (restoredCols.length > 0) {
        dynamicColumns = restoredCols;
      }
    }

    // Column faceted filters (e.g. ?chipset=B650,X670E &brand=ASRock)
    const filterKeys = ['brand', 'chipset', 'model', 'form_factor'];
    filterKeys.forEach((key) => {
      const val = params.get(key);
      if (val) {
        const items = val.split(',').map((i) => i.trim()).filter(Boolean);
        if (items.length > 0) {
          columnFilters[key] = new Set(items);
        }
      }
    });
  }

  async function copyShareLink() {
    if (typeof window === 'undefined') return;
    saveStateToUrl();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch (e) {
      console.warn('Clipboard write restricted:', e);
    }
    shareCopied = true;
    setTimeout(() => (shareCopied = false), 2000);
  }

  let toolbarHeight = $state(48);
  let row1Height = $state(43);

  onMount(() => {
    loadStateFromUrl();
  });
</script>

<svelte:window
  onkeydown={onKeyDown}
  onclick={() => {
    openDropdownId = null;
    showColorDropdown = false;
  }}
/>

<div class="container-fluid px-3 px-md-4 py-3">
  <!-- Top Navigation & Hero Banner -->
  <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 border-bottom border-secondary pb-3 mb-3">
    <div>
      <h1 class="h3 fw-bold mb-0 d-flex align-items-center gap-2">
        <i class="bi bi-motherboard text-primary"></i> AM5 Motherboards Directory
      </h1>
    </div>

    <!-- Quick Filter Action Chips (Horizontally swipeable on mobile) -->
    <div class="filter-chips-scroll align-items-center gap-1.5 gap-sm-2">
      <button
        type="button"
        class="btn btn-sm flex-shrink-0 text-nowrap {hasActiveFilters ? 'btn-warning text-dark fw-semibold' : 'btn-outline-secondary'}"
        onclick={resetFilters}
        title={hasActiveFilters ? 'Reset all search and column filters' : 'Showing all boards'}
      >
        <i class="bi bi-cpu"></i> {filteredBoards.length} of {boards.length} Boards
        {#if hasActiveFilters}
          <span class="badge bg-dark text-warning ms-1">Reset</span>
        {/if}
      </button>

      <button
        type="button"
        class="btn btn-sm flex-shrink-0 text-nowrap {filterPcie5 ? 'btn-primary text-white' : 'btn-outline-secondary'}"
        onclick={() => {
          filterPcie5 = !filterPcie5;
          saveStateToUrl();
        }}
        title="Toggle PCIe 5.0 (GPU / M.2) filter"
      >
        <i class="bi bi-lightning-charge"></i> PCIe 5.0
      </button>

      <button
        type="button"
        class="btn btn-sm flex-shrink-0 text-nowrap {filterX8X8 ? 'btn-primary text-white shadow' : 'btn-outline-secondary'}"
        onclick={() => {
          filterX8X8 = !filterX8X8;
          saveStateToUrl();
        }}
        title="Filter boards supporting dual PCIe x8/x8 bifurcation (PCIe 5.0 or 4.0)"
      >
        <i class="bi bi-diagram-2"></i> PCIe x8/x8
        <span
          class="badge {filterX8X8 ? 'bg-dark text-white' : 'bg-secondary-subtle text-secondary-emphasis'} ms-1"
          style="font-size: 0.7rem;"
        >
          {x8Count}
        </span>
      </button>

      <button
        type="button"
        class="btn btn-sm flex-shrink-0 text-nowrap {filterUsb4 ? 'btn-primary text-white' : 'btn-outline-secondary'}"
        onclick={() => {
          filterUsb4 = !filterUsb4;
          saveStateToUrl();
        }}
        title="Toggle USB4 (40Gbps) filter"
      >
        <i class="bi bi-usb-symbol"></i> USB4
      </button>

      <button
        type="button"
        class="btn btn-sm flex-shrink-0 text-nowrap {filterWifi7 ? 'btn-primary text-white' : 'btn-outline-secondary'}"
        onclick={() => {
          filterWifi7 = !filterWifi7;
          saveStateToUrl();
        }}
        title="Toggle Wi-Fi 7 filter"
      >
        <i class="bi bi-wifi"></i> Wi-Fi 7
      </button>

      <button
        type="button"
        class="btn btn-sm flex-shrink-0 text-nowrap {filterWhiteTheme && selectedColorTheme === 'all' ? 'btn-light text-dark fw-bold shadow' : 'btn-outline-secondary'}"
        onclick={() => {
          filterWhiteTheme = !filterWhiteTheme;
          if (filterWhiteTheme) {
            filterBlackTheme = false;
            selectedColorTheme = 'all';
          }
          saveStateToUrl();
        }}
        title="Filter White and Silver themed motherboards"
      >
        <i class="bi bi-palette text-light"></i> White / Silver
        <span class="badge {filterWhiteTheme && selectedColorTheme === 'all' ? 'bg-dark text-light' : 'bg-secondary-subtle text-secondary-emphasis'} ms-1" style="font-size: 0.7rem;">
          {whiteCount}
        </span>
      </button>

      <button
        type="button"
        class="btn btn-sm flex-shrink-0 text-nowrap {filterBlackTheme && selectedColorTheme === 'stealth' ? 'btn-dark text-white border-light fw-bold shadow' : 'btn-outline-secondary'}"
        onclick={() => {
          filterBlackTheme = !filterBlackTheme;
          if (filterBlackTheme) {
            filterWhiteTheme = false;
            selectedColorTheme = 'stealth';
          } else if (selectedColorTheme === 'stealth') {
            selectedColorTheme = 'all';
          }
          saveStateToUrl();
        }}
        title="Filter true stealth / monochrome all-black motherboards (245 models)"
      >
        <i class="bi bi-moon-stars-fill text-secondary"></i> All-Black
        <span class="badge {filterBlackTheme && selectedColorTheme === 'stealth' ? 'bg-light text-dark' : 'bg-secondary-subtle text-secondary-emphasis'} ms-1" style="font-size: 0.7rem;">
          {blackCount}
        </span>
      </button>

      <!-- Granular Color & Aesthetic Dropdown -->
      <div class="dropdown d-inline-block position-relative flex-shrink-0">
        <button
          type="button"
          class="btn btn-sm flex-shrink-0 text-nowrap {selectedColorTheme !== 'all' ? 'btn-info text-dark fw-bold shadow' : 'btn-outline-secondary'} dropdown-toggle"
          onclick={(e) => {
            e.stopPropagation();
            showColorDropdown = !showColorDropdown;
          }}
          title="Filter motherboards by specific color aesthetics and accents"
        >
          <i class="bi bi-palette2"></i> {getColorThemeLabel(selectedColorTheme)}
          {#if selectedColorTheme !== 'all'}
            <span class="badge bg-dark text-white ms-1" style="font-size: 0.7rem;">
              {colorThemeCount(selectedColorTheme)}
            </span>
          {/if}
        </button>

        {#if showColorDropdown}
          <div
            class="dropdown-menu show bg-dark border-secondary shadow-lg py-2 position-absolute mt-1"
            style="z-index: 1060; min-width: 250px;"
            role="menu"
            tabindex="-1"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
          >
            <div class="px-3 py-1 d-flex justify-content-between align-items-center">
              <span class="small fw-bold text-light text-uppercase" style="font-size: 0.7rem; letter-spacing: 0.05em;">
                Aesthetic Presets
              </span>
              {#if selectedColorTheme !== 'all'}
                <button
                  type="button"
                  class="btn btn-link btn-sm text-warning p-0 text-decoration-none"
                  style="font-size: 0.7rem;"
                  onclick={() => {
                    selectedColorTheme = 'all';
                    filterBlackTheme = false;
                    filterWhiteTheme = false;
                    showColorDropdown = false;
                    saveStateToUrl();
                  }}
                >
                  Clear
                </button>
              {/if}
            </div>
            <div class="dropdown-divider border-secondary my-1"></div>

            <button
              type="button"
              class="dropdown-item small text-light d-flex justify-content-between align-items-center py-1.5 {selectedColorTheme === 'all' ? 'active' : ''}"
              onclick={() => {
                selectedColorTheme = 'all';
                filterBlackTheme = false;
                filterWhiteTheme = false;
                showColorDropdown = false;
                saveStateToUrl();
              }}
            >
              <span>All Aesthetics</span>
              <span class="text-secondary small">{boards.length}</span>
            </button>

            <button
              type="button"
              class="dropdown-item small text-light d-flex justify-content-between align-items-center py-1.5 {selectedColorTheme === 'stealth' ? 'active' : ''}"
              onclick={() => {
                selectedColorTheme = 'stealth';
                filterBlackTheme = true;
                filterWhiteTheme = false;
                showColorDropdown = false;
                saveStateToUrl();
              }}
            >
              <span><i class="bi bi-moon-stars-fill text-secondary me-1.5"></i> Stealth / All-Black</span>
              <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size: 0.68rem;">{colorThemeCount('stealth')}</span>
            </button>

            <button
              type="button"
              class="dropdown-item small text-light d-flex justify-content-between align-items-center py-1.5 {selectedColorTheme === 'white_pcb' ? 'active' : ''}"
              onclick={() => {
                selectedColorTheme = 'white_pcb';
                filterWhiteTheme = true;
                filterBlackTheme = false;
                showColorDropdown = false;
                saveStateToUrl();
              }}
            >
              <span><i class="bi bi-square-fill text-light me-1.5"></i> Pure White PCB</span>
              <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size: 0.68rem;">{colorThemeCount('white_pcb')}</span>
            </button>

            <button
              type="button"
              class="dropdown-item small text-light d-flex justify-content-between align-items-center py-1.5 {selectedColorTheme === 'white_heatsink' ? 'active' : ''}"
              onclick={() => {
                selectedColorTheme = 'white_heatsink';
                filterWhiteTheme = true;
                filterBlackTheme = false;
                showColorDropdown = false;
                saveStateToUrl();
              }}
            >
              <span><i class="bi bi-palette text-light me-1.5"></i> White / Silver Heatsinks</span>
              <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size: 0.68rem;">{colorThemeCount('white_heatsink')}</span>
            </button>

            <button
              type="button"
              class="dropdown-item small text-light d-flex justify-content-between align-items-center py-1.5 {selectedColorTheme === 'gunmetal' ? 'active' : ''}"
              onclick={() => {
                selectedColorTheme = 'gunmetal';
                filterWhiteTheme = false;
                filterBlackTheme = false;
                showColorDropdown = false;
                saveStateToUrl();
              }}
            >
              <span><i class="bi bi-circle-half text-secondary me-1.5"></i> Gunmetal / Gray Heatsinks</span>
              <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size: 0.68rem;">{colorThemeCount('gunmetal')}</span>
            </button>

            <div class="dropdown-divider border-secondary my-1"></div>
            <div class="px-3 py-1">
              <span class="small fw-bold text-secondary text-uppercase" style="font-size: 0.68rem; letter-spacing: 0.05em;">
                Dark + Colorful Accents
              </span>
            </div>

            <button
              type="button"
              class="dropdown-item small text-light d-flex justify-content-between align-items-center py-1.5 {selectedColorTheme === 'black_gold' ? 'active' : ''}"
              onclick={() => {
                selectedColorTheme = 'black_gold';
                filterBlackTheme = false;
                filterWhiteTheme = false;
                showColorDropdown = false;
                saveStateToUrl();
              }}
            >
              <span><i class="bi bi-circle-fill text-warning me-1.5"></i> Gold / Copper Accents</span>
              <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size: 0.68rem;">{colorThemeCount('black_gold')}</span>
            </button>

            <button
              type="button"
              class="dropdown-item small text-light d-flex justify-content-between align-items-center py-1.5 {selectedColorTheme === 'black_lime' ? 'active' : ''}"
              onclick={() => {
                selectedColorTheme = 'black_lime';
                filterBlackTheme = false;
                filterWhiteTheme = false;
                showColorDropdown = false;
                saveStateToUrl();
              }}
            >
              <span><i class="bi bi-circle-fill text-success me-1.5"></i> Lime Green Accents</span>
              <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size: 0.68rem;">{colorThemeCount('black_lime')}</span>
            </button>

            <button
              type="button"
              class="dropdown-item small text-light d-flex justify-content-between align-items-center py-1.5 {selectedColorTheme === 'black_red' ? 'active' : ''}"
              onclick={() => {
                selectedColorTheme = 'black_red';
                filterBlackTheme = false;
                filterWhiteTheme = false;
                showColorDropdown = false;
                saveStateToUrl();
              }}
            >
              <span><i class="bi bi-circle-fill text-danger me-1.5"></i> Red / Orange Accents</span>
              <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size: 0.68rem;">{colorThemeCount('black_red')}</span>
            </button>

            <button
              type="button"
              class="dropdown-item small text-light d-flex justify-content-between align-items-center py-1.5 {selectedColorTheme === 'black_blue' ? 'active' : ''}"
              onclick={() => {
                selectedColorTheme = 'black_blue';
                filterBlackTheme = false;
                filterWhiteTheme = false;
                showColorDropdown = false;
                saveStateToUrl();
              }}
            >
              <span><i class="bi bi-circle-fill text-info me-1.5"></i> Blue / Cyan Accents</span>
              <span class="badge bg-secondary-subtle text-secondary-emphasis" style="font-size: 0.68rem;">{colorThemeCount('black_blue')}</span>
            </button>
          </div>
        {/if}
      </div>

      <button
        type="button"
        class="btn btn-sm flex-shrink-0 text-nowrap {filterBackConnect ? 'btn-primary text-white fw-bold shadow' : 'btn-outline-secondary'}"
        onclick={() => {
          filterBackConnect = !filterBackConnect;
          saveStateToUrl();
        }}
        title="Filter Back-Connect / Hidden Connector boards (BTF, Project Zero, Stealth)"
      >
        <i class="bi bi-plug"></i> Back-Connect
        <span class="badge {filterBackConnect ? 'bg-dark text-white' : 'bg-secondary-subtle text-secondary-emphasis'} ms-1" style="font-size: 0.7rem;">
          {btfCount}
        </span>
      </button>

      <button
        type="button"
        class="btn btn-sm flex-shrink-0 text-nowrap {filterTwoDimm ? 'btn-primary text-white fw-bold shadow' : 'btn-outline-secondary'}"
        onclick={() => {
          filterTwoDimm = !filterTwoDimm;
          saveStateToUrl();
        }}
        title="Filter 2-DIMM memory overclocking and compact ITX boards"
      >
        <i class="bi bi-speedometer2"></i> 2-DIMM OC
        <span class="badge {filterTwoDimm ? 'bg-dark text-white' : 'bg-secondary-subtle text-secondary-emphasis'} ms-1" style="font-size: 0.7rem;">
          {twoDimmCount}
        </span>
      </button>
    </div>
  </div>

  <!-- Main Toolbar: Global Search, Quick Selection & Compare (Sticky) -->
  <div
    class="row g-2 align-items-center sticky-toolbar"
    bind:clientHeight={toolbarHeight}
  >
    <!-- Global Multi-word Search -->
    <div class="col-12 col-md-5">
      <div class="input-group input-group-sm">
        <span class="input-group-text bg-dark text-secondary border-secondary">
          <i class="bi bi-search"></i>
        </span>
        <input
          type="search"
          class="form-control form-control-sm bg-dark text-light border-secondary"
          placeholder="Global search: brand, model, chipset, audio, lan... (e.g. 'asus x870e wifi7')"
          bind:value={searchQuery}
          oninput={saveStateToUrl}
        />
        {#if searchQuery}
          <button
            class="btn btn-outline-secondary border-secondary text-light"
            onclick={() => {
              searchQuery = '';
              saveStateToUrl();
            }}
            aria-label="Clear search"
          >
            <i class="bi bi-x"></i>
          </button>
        {/if}
      </div>
    </div>

    <!-- Compare Toolbar Buttons -->
    <div class="col-12 col-md-7 d-flex flex-wrap align-items-center justify-content-md-end gap-1.5 gap-sm-2 toolbar-actions">
      <button
        type="button"
        class="btn btn-sm btn-outline-secondary py-1 px-2"
        onclick={selectVisible}
        title="Add all currently filtered motherboards to compare"
      >
        <i class="bi bi-check2-all"></i> <span class="d-none d-sm-inline">Select</span> Visible ({filteredBoards.length})
      </button>

      {#if $compareStore.length > 0}
        <button
          type="button"
          class="btn btn-sm btn-outline-danger py-1 px-2"
          onclick={clearCompareSelection}
          title="Clear selected boards"
        >
          <i class="bi bi-trash"></i> <span class="d-none d-sm-inline">Clear</span> ({$compareStore.length})
        </button>

        <a href="/compare?ids={$compareStore.join(',')}" class="btn btn-sm btn-primary px-2.5 py-1 shadow-sm fw-semibold">
          <i class="bi bi-layers-half me-1"></i> Compare ({$compareStore.length})
        </a>
      {:else}
        <button type="button" class="btn btn-sm btn-secondary opacity-50 py-1 px-2" disabled>
          <i class="bi bi-layers-half me-1"></i> Compare (0)
        </button>
      {/if}

      <button
        type="button"
        class="btn btn-sm btn-outline-info py-1 px-2"
        onclick={copyShareLink}
        title="Copy shareable link with active filters and columns"
      >
        <i class="bi {shareCopied ? 'bi-check2' : 'bi-share'} me-1"></i>
        <span class="d-none d-sm-inline">{shareCopied ? 'Copied!' : 'Share View'}</span>
        <span class="d-sm-none">{shareCopied ? 'Copied!' : 'Share'}</span>
      </button>

      <button
        type="button"
        class="btn btn-sm btn-outline-success py-1 px-2"
        onclick={() => (showColumnPicker = true)}
        title="Add specification column to the table"
      >
        <i class="bi bi-plus-lg"></i> <span class="d-none d-sm-inline">Add Column</span>
        <span class="d-sm-none">Col +</span>
      </button>
    </div>
  </div>

  <!-- Motherboard Table with Dynamic Columns and Filter Dropdowns (Virtualized) -->
  <VirtualizedBoardTable
    boards={filteredBoards}
    {dynamicColumns}
    {sortState}
    {columnFilters}
    {columnAllValues}
    {columnAvailableData}
    {hasActiveFilters}
    {openDropdownId}
    {toolbarHeight}
    bind:row1Height
    onToggleSort={toggleSort}
    onFilterChange={handleFilterChange}
    onResetFilters={resetFilters}
    onRemoveDynamicColumn={removeDynamicColumn}
    onShowColumnPicker={() => (showColumnPicker = true)}
    onOpenDetail={openDetail}
    onToggleDropdown={(id) => (openDropdownId = openDropdownId === id ? null : id)}
    onCloseDropdown={() => (openDropdownId = null)}
  />
</div>

<!-- Mobile Floating Compare Dock -->
{#if $compareStore.length > 0}
  <div
    class="mobile-compare-dock d-md-none position-fixed bottom-0 start-0 end-0 bg-black border-top border-primary p-2 px-3 shadow-lg d-flex align-items-center justify-content-between"
    style="z-index: 1040; padding-bottom: max(0.5rem, env(safe-area-inset-bottom, 0.5rem));"
  >
    <div class="d-flex align-items-center gap-2">
      <span class="badge bg-primary fs-6">{$compareStore.length}</span>
      <span class="small fw-semibold text-light">Board{$compareStore.length > 1 ? 's' : ''} Selected</span>
    </div>
    <div class="d-flex gap-2">
      <button type="button" class="btn btn-sm btn-outline-danger py-1 px-2" onclick={clearCompareSelection}>Clear</button>
      <a href="/compare?ids={$compareStore.join(',')}" class="btn btn-sm btn-primary py-1 px-3 fw-bold shadow-sm">
        <i class="bi bi-layers-half me-1"></i> Compare Now
      </a>
    </div>
  </div>
{/if}

<!-- Add Dynamic Column Picker Modal -->
<ColumnPickerModal
  features={features}
  structure={structure}
  activeColumnKeys={activeColumnKeys}
  isOpen={showColumnPicker}
  onAdd={addDynamicColumn}
  onRemove={removeDynamicColumnByKey}
  onClose={() => (showColumnPicker = false)}
/>

<!-- Quick Detail Slide-out Drawer (Offcanvas Overlay) -->
{#if inspectingBoard}
  {@const b = inspectingBoard}
  {@const typed = b.typed || {}}
  {@const sc = b.specs?._scorecard || {}}
  {@const isSelected = $compareStore.includes(b.id)}
  {@const fullImg = typed.rear_io_image || b.specs?.['Rear I/O']?.['Rear I/O Image']}

  <button
    type="button"
    class="modal-backdrop fade show border-0"
    style="z-index: 1050;"
    onclick={closeDetail}
    aria-label="Close drawer"
  ></button>

  <div
    class="drawer bg-dark text-light border-start border-secondary shadow-lg d-flex flex-column"
    tabindex="-1"
    role="dialog"
  >
    <!-- Drawer Header -->
    <div
      class="p-3 border-bottom border-secondary bg-black d-flex align-items-center justify-content-between drawer-header"
      style="padding-top: max(1rem, env(safe-area-inset-top, 1rem)) !important;"
    >
      <div>
        <div class="drawer-brand-text text-uppercase fw-bold">{b.brand}</div>
        <h2 class="h5 fw-bold text-white mb-0 text-truncate" style="max-width: 75vw;">{b.model}</h2>
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary text-light p-1 px-2 d-flex align-items-center justify-content-center"
        onclick={closeDetail}
        aria-label="Close"
        style="min-width: 38px; min-height: 38px;"
      >
        <i class="bi bi-x-lg fs-6"></i>
      </button>
    </div>

    <!-- Drawer Quick Actions -->
    <div class="p-3 border-bottom border-secondary bg-dark-subtle d-flex flex-wrap gap-2 align-items-center justify-content-between">
      <div class="d-flex gap-2">
        <button
          type="button"
          class="btn btn-sm {isSelected ? 'btn-danger' : 'btn-primary'}"
          onclick={() => compareStore.toggle(b.id)}
        >
          <i class="bi {isSelected ? 'bi-check-lg' : 'bi-plus-lg'}"></i>
          {isSelected ? 'In Compare Tray' : 'Add to Compare'}
        </button>

        {#if $compareStore.length > 0}
          <a
            href="/compare?ids={$compareStore.join(',')}"
            class="btn btn-sm btn-outline-primary"
            title="Open comparison table with selected boards"
          >
            <i class="bi bi-layers-half me-1"></i> Compare ({$compareStore.length})
          </a>
        {/if}

        {#if (typed.website_url || b.specs?.Links?.Website)?.startsWith('http')}
          <a
            href={typed.website_url || b.specs?.Links?.Website}
            target="_blank"
            rel="noreferrer"
            class="btn btn-sm btn-outline-secondary text-light"
          >
            <i class="bi bi-box-arrow-up-right"></i> Official Page
          </a>
        {/if}
      </div>

      <a
        href="/board/{b.id}"
        class="btn btn-sm btn-outline-info"
        title="Open dedicated standalone page"
      >
        <i class="bi bi-link-45deg"></i> Open Dedicated Page
      </a>
    </div>

    <!-- Drawer Body / Specs Cards -->
    <div class="flex-grow-1 p-3 overflow-y-auto">
      <!-- High-level Badges -->
      <div class="d-flex flex-wrap gap-2 mb-3">
        <span class="badge {chipsetBadgeClass(b.chipset)} px-3 py-2 fs-6">{b.chipset}</span>
        <span class="badge {formFactorBadgeClass(b.form_factor)} px-3 py-2 fs-6">{b.form_factor}</span>
        {#if typed.release}
          <span class="badge bg-dark border border-secondary px-3 py-2 fs-6">Released: {typed.release}</span>
        {/if}
        {#if matchesX8X8(b)}
          <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-3 py-2 fs-6">
            <i class="bi bi-diagram-2 me-1"></i>PCIe x8/x8
          </span>
        {/if}
      </div>

      <!-- Rear I/O Panel Image -->
      {#if fullImg && (fullImg.startsWith('/') || fullImg.startsWith('http'))}
        <div class="card bg-black border-secondary p-2 text-center mb-3">
          <span class="text-secondary small d-block mb-1">Rear I/O Panel</span>
          <img
            src={fullImg}
            alt="Rear I/O"
            class="img-fluid rounded"
            style="max-height: 140px; object-fit: contain;"
          />
        </div>
      {/if}

      <!-- Power & VRM -->
      <div class="card bg-dark border-secondary mb-3 shadow-sm">
        <div class="card-header bg-black border-secondary d-flex align-items-center gap-2 py-2">
          <i class="bi bi-lightning-charge text-warning"></i>
          <h3 class="h6 mb-0 text-light">Power & VRM</h3>
        </div>
        <div class="card-body py-2">
          <dl class="row mb-0 small">
            <dt class="col-5 text-secondary">Phase Config</dt>
            <dd class="col-7">{sc.vrm_text || typed.vrm_phases?.raw || '-'}</dd>

            <dt class="col-5 text-secondary">VCore MOSFET</dt>
            <dd class="col-7">{sc.vcore_text || typed.vrm_vcore || '-'}</dd>

            <dt class="col-5 text-secondary">MOS Heatsink</dt>
            <dd class="col-7">{typed.vrm_mos_heatsink || '-'}</dd>

            <dt class="col-5 text-secondary">EPS Connectors</dt>
            <dd class="col-7">{typed.eps12v_config || '-'}</dd>

            {#if sc.vrm_note}
              <dt class="col-5 text-secondary">VRM Note</dt>
              <dd class="col-7 text-muted">{sc.vrm_note}</dd>
            {/if}
          </dl>
        </div>
      </div>

      <!-- Networking & Wireless -->
      <div class="card bg-dark border-secondary mb-3 shadow-sm">
        <div class="card-header bg-black border-secondary d-flex align-items-center gap-2 py-2">
          <i class="bi bi-ethernet text-info"></i>
          <h3 class="h6 mb-0 text-light">Networking & Wireless</h3>
        </div>
        <div class="card-body py-2">
          <dl class="row mb-0 small">
            <dt class="col-5 text-secondary">LAN Controller</dt>
            <dd class="col-7">
              <div class="fw-medium text-light">
                {typed.lan_controllers || b.specs?.General?.Networking?.Ethernet?.LAN || sc.lan_text || '-'}
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

      <!-- Memory & Storage -->
      <div class="card bg-dark border-secondary mb-3 shadow-sm">
        <div class="card-header bg-black border-secondary d-flex align-items-center gap-2 py-2">
          <i class="bi bi-memory text-primary"></i>
          <h3 class="h6 mb-0 text-light">Memory & Storage</h3>
        </div>
        <div class="card-body py-2">
          <dl class="row mb-0 small">
            <dt class="col-5 text-secondary">RAM Slots</dt>
            <dd class="col-7">{typed.ram_slots ? `${typed.ram_slots} x DDR5` : '-'}</dd>

            <dt class="col-5 text-secondary">Max Capacity</dt>
            <dd class="col-7">{typed.max_ram_capacity_gb ? `${typed.max_ram_capacity_gb} GB` : '-'}</dd>

            <dt class="col-5 text-secondary">ECC Support</dt>
            <dd class="col-7">{typed.ecc_support || '-'}</dd>

            <dt class="col-5 text-secondary">M.2 Total</dt>
            <dd class="col-7">{sc.m2_total || typed.m2_total?.raw || '-'}</dd>

            <dt class="col-5 text-secondary">Key M</dt>
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

            <dt class="col-5 text-secondary">SATA 6G</dt>
            <dd class="col-7">{typed.sata_ports ?? '-'}</dd>
          </dl>
        </div>
      </div>

      <!-- Expansion & Rear I/O -->
      <div class="card bg-dark border-secondary mb-3 shadow-sm">
        <div class="card-header bg-black border-secondary d-flex align-items-center gap-2 py-2">
          <i class="bi bi-usb-symbol text-success"></i>
          <h3 class="h6 mb-0 text-light">Expansion & I/O</h3>
        </div>
        <div class="card-body py-2">
          <dl class="row mb-0 small">
            <dt class="col-5 text-secondary">PCIe x16 Total</dt>
            <dd class="col-7">{typed.pcie_x16_total ?? '-'}</dd>

            <dt class="col-5 text-secondary">PCIe x16 Lanes</dt>
            <dd class="col-7">
              {typed.pcie_x16_lanes || '-'}
              {#if b.specs?.Expansion?.['PCIe Slots']?.['Physical x16']?.['Electrical Lanes_comment']}
                <span class="text-info cursor-help ms-1" title={b.specs.Expansion['PCIe Slots']['Physical x16']['Electrical Lanes_comment']}>
                  <i class="bi bi-info-circle-fill" style="font-size: 0.75rem;"></i>
                </span>
              {/if}
            </dd>

            <dt class="col-5 text-secondary">PCIe Bifurcation</dt>
            <dd class="col-7">
              {#if b.specs?.Expansion?.['PCIe Slots']?.['Physical x16']?.['Electrical Lanes_comment']}
                {@const bifCmt = b.specs.Expansion['PCIe Slots']['Physical x16']['Electrical Lanes_comment']}
                <span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle font-monospace fw-semibold">
                  {bifCmt.toLowerCase().includes('x16/x0 or x8/x8') || bifCmt.toLowerCase().includes('x8/x8') ? 'x16/x0 or x8/x8' : 'x8/x8 Supported'}
                </span>
                <div class="small text-muted mt-0.5">{bifCmt}</div>
              {:else if matchesX8X8(b)}
                <span class="badge bg-primary-subtle text-primary-emphasis border border-primary-subtle font-monospace fw-semibold">x8/x8 Supported</span>
              {:else}
                <span class="text-secondary">-</span>
              {/if}
            </dd>

            <dt class="col-5 text-secondary">Total PCIe Slots</dt>
            <dd class="col-7">
              {typed.pcie_total_slots ?? '-'}
              {#if b.specs?.Expansion?.['PCIe Slots']?.['Total Slot Count_comment']}
                <span class="text-info cursor-help ms-1" title="Physical Slot Layout (1–7): {b.specs.Expansion['PCIe Slots']['Total Slot Count_comment']}">
                  <i class="bi bi-info-circle-fill" style="font-size: 0.75rem;"></i>
                </span>
              {/if}
            </dd>

            {#if b.specs?.Expansion?.['PCIe Slots']?.['Total Slot Count_comment']}
              <dt class="col-5 text-secondary">Slot Layout (1–7)</dt>
              <dd class="col-7">
                <div
                  class="font-monospace small text-light-emphasis py-1 px-2 rounded bg-black border border-secondary"
                  title="Physical slot positions 1 to 7 (top to bottom). '-' denotes empty slot position."
                >
                  {b.specs.Expansion['PCIe Slots']['Total Slot Count_comment']}
                </div>
              </dd>
            {/if}

            <dt class="col-5 text-secondary">Rear USB Total</dt>
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

      <!-- Notes & Lane Sharing -->
      {#if typed.notes_details || b.specs?.Notes?.Details}
        {@const notes = parseNotesList(typed.notes_details || b.specs?.Notes?.Details)}
        {@const laneResult = analyzeLaneSharing(b)}
        {#if notes.length > 0 || laneResult.warnings.length > 0}
          <div class="card bg-dark border-secondary shadow-sm">
            <div class="card-header bg-black border-secondary d-flex align-items-center justify-content-between py-2">
              <div class="d-flex align-items-center gap-2">
                <i class="bi bi-diagram-2 text-info"></i>
                <h3 class="h6 mb-0 text-light">Lane Sharing & Bottlenecks</h3>
              </div>
              <span class="badge {laneResult.summaryBadge.variant === 'danger' ? 'bg-danger' : laneResult.summaryBadge.variant === 'warning' ? 'bg-warning text-dark' : 'bg-success'}" style="font-size: 0.7rem;">
                <i class="bi {laneResult.summaryBadge.icon} me-1"></i>
                {laneResult.summaryBadge.text}
              </span>
            </div>
            <div class="card-body py-2">
              {#if laneResult.warnings.length > 0}
                <div class="d-flex flex-column gap-2 mb-3">
                  {#each laneResult.warnings as warn}
                    <div class="p-2 rounded border {warn.severity === 'danger' ? 'border-danger-subtle bg-danger-subtle text-danger-emphasis' : warn.severity === 'warning' ? 'border-warning-subtle bg-warning-subtle text-warning-emphasis' : 'border-info-subtle bg-info-subtle text-info-emphasis'} small">
                      <div class="fw-bold mb-0.5 d-flex align-items-center gap-1">
                        <i class="bi {warn.severity === 'danger' ? 'bi-exclamation-octagon-fill' : warn.severity === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'}"></i>
                        {warn.title}
                      </div>
                      <div>{warn.detail}</div>
                    </div>
                  {/each}
                </div>
              {/if}

              {#if notes.length > 0}
                <ul class="list-unstyled mb-0 d-flex flex-column gap-2 small">
                  {#each notes as note}
                    <li class="d-flex align-items-start gap-2">
                      <i class="bi bi-arrow-right-short text-info fs-6 mt-n1 flex-shrink-0"></i>
                      <span class="text-light-emphasis">{note}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Quick Filter Chips Carousel */
  .filter-chips-scroll {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .filter-chips-scroll::-webkit-scrollbar {
    display: none;
  }
  @media (min-width: 992px) {
    .filter-chips-scroll {
      flex-wrap: wrap;
      overflow-x: visible;
    }
  }

  .sticky-toolbar {
    position: sticky;
    top: 0;
    z-index: 1025;
    background-color: #121212;
    padding-top: 8px;
    padding-bottom: 8px;
    margin-bottom: 12px;
    border-bottom: 1px solid #30363d;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45);
  }

  /* Desktop Sticky Headers (only on large screens where horizontal overflow is contained) */
  @media (min-width: 992px) {
    :global(.sticky-header-row-1 th) {
      position: sticky;
      top: var(--tb-h, 48px);
      z-index: 1020;
      background-color: #161b22 !important;
      border-bottom: 1px solid #30363d !important;
      box-shadow: inset 0 -1px 0 #30363d;
    }
    :global(.sticky-header-row-2 td) {
      position: sticky;
      top: calc(var(--tb-h, 48px) + var(--r1-h, 43px) - 1px);
      z-index: 1019;
      background-color: #1c2128 !important;
      border-bottom: 2px solid #30363d !important;
      box-shadow: inset 0 -2px 0 #30363d, 0 4px 8px rgba(0, 0, 0, 0.4);
    }
    :global(.table-container),
    :global(.table-responsive) {
      overflow: visible !important;
    }
  }

  /* Mobile Table Container Constraints */
  @media (max-width: 991.98px) {
    :global(.table-container) {
      max-width: 100%;
      overflow-x: hidden;
    }
    :global(.table-responsive) {
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
      max-width: 100%;
    }
    /* On mobile, don't let double header rows take over 50% of the screen */
    :global(.sticky-header-row-1 th),
    :global(.sticky-header-row-2 td) {
      position: static !important;
    }
  }

  .cursor-pointer {
    cursor: pointer;
  }
  .th-sortable:hover {
    color: #fff !important;
    background-color: rgba(255, 255, 255, 0.05);
  }
  .hover-primary:hover {
    color: #0d6efd !important;
    text-decoration: underline !important;
  }
  .brand-text {
    color: #cbd5e1 !important;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .drawer-brand-text {
    color: #60a5fa !important;
    font-size: 0.8rem;
    letter-spacing: 0.05em;
  }
  .board-row:hover {
    background-color: rgba(255, 255, 255, 0.04) !important;
  }
  :global(.board-row.table-active > td) {
    background-color: rgba(13, 110, 253, 0.22) !important;
    color: #fff !important;
  }
  :global(.board-row.table-active > td:first-child) {
    border-left: 4px solid #0d6efd !important;
  }
  :global(.board-row.table-active:hover > td) {
    background-color: rgba(13, 110, 253, 0.3) !important;
  }

  /* Slide-out Drawer */
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    width: 620px;
    max-width: 95vw;
    height: 100vh;
    z-index: 1055;
    animation: slideIn 0.2s ease-out;
  }

  /* Mobile Full-Screen Drawer */
  @media (max-width: 768px) {
    .drawer {
      width: 100vw !important;
      max-width: 100vw !important;
      height: 100dvh !important;
      left: 0 !important;
      right: 0 !important;
      top: 0 !important;
      bottom: 0 !important;
      border-radius: 0 !important;
      border: none !important;
    }
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }
  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  /* Chipset and Form Factor badges */
  :global(.badge-chipset) {
    font-weight: 600;
  }
  :global(.badge-chipset-x870e) {
    background-color: #8b0000;
    color: #fff;
  }
  :global(.badge-chipset-x870) {
    background-color: #b22222;
    color: #fff;
  }
  :global(.badge-chipset-x670e) {
    background-color: #c71585;
    color: #fff;
  }
  :global(.badge-chipset-x670) {
    background-color: #9932cc;
    color: #fff;
  }
  :global(.badge-chipset-b850) {
    background-color: #1e3f8a;
    color: #fff;
  }
  :global(.badge-chipset-b650e) {
    background-color: #2e59ba;
    color: #fff;
  }
  :global(.badge-chipset-b650) {
    background-color: #3b82f6;
    color: #fff;
  }
  :global(.badge-chipset-b840) {
    background-color: #0d9488;
    color: #fff;
  }
  :global(.badge-chipset-a620) {
    background-color: #4b5563;
    color: #fff;
  }
  :global(.badge-chipset-a620a) {
    background-color: #6b7280;
    color: #fff;
  }

  :global(.badge-ff) {
    font-weight: 500;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  :global(.badge-ff-eatx) {
    background-color: #4c1d95;
    color: #e9d5ff;
  }
  :global(.badge-ff-atx) {
    background-color: #1e293b;
    color: #f1f5f9;
  }
  :global(.badge-ff-matx) {
    background-color: #064e3b;
    color: #a7f3d0;
  }
  :global(.badge-ff-miniitx) {
    background-color: #701a75;
    color: #f5d0fe;
  }
</style>
