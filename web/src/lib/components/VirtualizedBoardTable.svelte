<script lang="ts">
  import { onMount } from 'svelte';
  import { compareStore } from '$lib/stores/compare';
  import {
    getNestedValue,
    chipsetBadgeClass,
    formFactorBadgeClass,
    parseM2Generations,
    m2GenBadgeClass,
    type DynamicColumn,
    type SortState
  } from '$lib/table_logic';
  import ColumnFilterDropdown from '$lib/components/ColumnFilterDropdown.svelte';
  import { calculateVirtualWindow, getVisibleSlice } from '$lib/utils/virtualizer';

  interface Props {
    boards: any[];
    dynamicColumns: DynamicColumn[];
    sortState: SortState;
    columnFilters: Record<string, Set<string>>;
    columnAllValues: Record<string, string[]>;
    columnAvailableData: Record<string, { available: Set<string>; counts: Map<string, number> }>;
    hasActiveFilters?: boolean;
    openDropdownId?: string | null;
    toolbarHeight?: number;
    row1Height?: number;
    rowHeight?: number;
    overscan?: number;
    onToggleSort: (col: string) => void;
    onFilterChange: (col: string, newSelected: Set<string>) => void;
    onResetFilters?: () => void;
    onRemoveDynamicColumn: (colId: string) => void;
    onShowColumnPicker: () => void;
    onOpenDetail: (board: any) => void;
    onToggleDropdown: (colId: string) => void;
    onCloseDropdown: () => void;
  }

  let {
    boards = [],
    dynamicColumns = [],
    sortState,
    columnFilters = {},
    columnAllValues = {},
    columnAvailableData = {},
    hasActiveFilters = false,
    openDropdownId = null,
    toolbarHeight = 48,
    row1Height = $bindable(43),
    rowHeight = 52,
    overscan = 8,
    onToggleSort,
    onFilterChange,
    onResetFilters,
    onRemoveDynamicColumn,
    onShowColumnPicker,
    onOpenDetail,
    onToggleDropdown,
    onCloseDropdown
  }: Props = $props();

  let tableContainer = $state<HTMLElement | null>(null);
  let tableTop = $state(0);
  let windowScrollY = $state(0);
  let windowInnerHeight = $state(800);

  function updateOffsets() {
    if (typeof window === 'undefined') return;
    if (tableContainer) {
      const rect = tableContainer.getBoundingClientRect();
      tableTop = rect.top + window.scrollY;
    }
  }

  onMount(() => {
    updateOffsets();
    window.addEventListener('resize', updateOffsets, { passive: true });
    return () => {
      window.removeEventListener('resize', updateOffsets);
    };
  });

  $effect(() => {
    if (tableContainer && boards.length >= 0) {
      updateOffsets();
    }
  });

  const virtualWindow = $derived(
    calculateVirtualWindow({
      totalItems: boards.length,
      scrollTop: windowScrollY,
      viewportHeight: windowInnerHeight,
      rowHeight,
      containerOffsetTop: tableTop,
      overscan
    })
  );

  const visibleBoards = $derived(getVisibleSlice(boards, virtualWindow));
  const totalColCount = $derived(7 + dynamicColumns.length);

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
</script>

<svelte:window bind:scrollY={windowScrollY} bind:innerHeight={windowInnerHeight} />

<div
  bind:this={tableContainer}
  class="table-container border border-secondary rounded shadow-sm"
  style="--tb-h: {toolbarHeight}px; --r1-h: {row1Height}px;"
>
  <div class="table-responsive">
    <table class="table table-dark table-hover table-striped align-middle mb-0 small" id="moboTable">
      <thead class="table-dark text-secondary user-select-none">
        <!-- Row 1: Column Headers with Clickable Sorting -->
        <tr class="border-bottom border-secondary sticky-header-row-1" bind:clientHeight={row1Height}>
          <!-- Select -->
          <th style="width: 45px;" class="text-center">
            <span title="Select to compare">Sel</span>
          </th>

          <!-- Image -->
          <th style="width: 55px;" class="text-center">Image</th>

          <!-- Fixed: Brand & Model -->
          <th
            class="cursor-pointer th-sortable"
            onclick={() => onToggleSort('brand')}
            style="min-width: 190px;"
            title="Click to sort by Brand & Model"
          >
            <div class="d-flex align-items-center gap-1">
              <span>Board</span>
              {#if sortState.column === 'brand' || sortState.column === 'model'}
                <i
                  class="bi bi-sort-{sortState.direction === 'asc'
                    ? 'alpha-down text-primary'
                    : 'alpha-up-alt text-primary'}"
                ></i>
              {:else}
                <i class="bi bi-arrow-down-up text-secondary opacity-25"></i>
              {/if}
            </div>
          </th>

          <!-- Fixed: Chipset -->
          <th
            class="cursor-pointer th-sortable"
            onclick={() => onToggleSort('chipset')}
            style="min-width: 105px;"
            title="Click to sort by Chipset"
          >
            <div class="d-flex align-items-center gap-1">
              <span>Chipset</span>
              {#if sortState.column === 'chipset'}
                <i
                  class="bi bi-sort-{sortState.direction === 'asc'
                    ? 'down text-primary'
                    : 'up text-primary'}"
                ></i>
              {:else}
                <i class="bi bi-arrow-down-up text-secondary opacity-25"></i>
              {/if}
            </div>
          </th>

          <!-- Fixed: Form Factor -->
          <th
            class="cursor-pointer th-sortable"
            onclick={() => onToggleSort('form_factor')}
            style="min-width: 105px;"
            title="Click to sort by Form Factor"
          >
            <div class="d-flex align-items-center gap-1">
              <span>Form Factor</span>
              {#if sortState.column === 'form_factor'}
                <i
                  class="bi bi-sort-{sortState.direction === 'asc'
                    ? 'down text-primary'
                    : 'up text-primary'}"
                ></i>
              {:else}
                <i class="bi bi-arrow-down-up text-secondary opacity-25"></i>
              {/if}
            </div>
          </th>

          <!-- Dynamic Columns Headers -->
          {#each dynamicColumns as col (col.id)}
            <th
              class="dynamic-th th-sortable cursor-pointer"
              style="min-width: 155px;"
              title="{col.category ? col.category + ' > ' : ''}{col.label} (Click to sort)"
            >
              <div class="d-flex align-items-center justify-content-between gap-1">
                <!-- Title and sort icon -->
                <div
                  class="d-flex align-items-center gap-1 text-truncate flex-grow-1"
                  onclick={() => onToggleSort(col.id)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === 'Enter' && onToggleSort(col.id)}
                >
                  <span class="text-truncate">{col.label}</span>
                  {#if sortState.column === col.id}
                    <i
                      class="bi bi-sort-{sortState.direction === 'asc'
                        ? 'down text-primary'
                        : 'up text-primary'}"
                    ></i>
                  {:else}
                    <i class="bi bi-arrow-down-up text-secondary opacity-25"></i>
                  {/if}
                </div>

                <!-- Remove Column Button -->
                <button
                  type="button"
                  class="btn btn-link text-danger p-0 ms-1 opacity-75 hover-opacity-100 no-row-click"
                  onclick={(e) => {
                    e.stopPropagation();
                    onRemoveDynamicColumn(col.id);
                  }}
                  title="Remove column '{col.label}'"
                  aria-label="Remove column"
                >
                  <i class="bi bi-x-lg" style="font-size: 0.75rem;"></i>
                </button>
              </div>
            </th>
          {/each}

          <!-- Add Column Button Header -->
          <th style="width: 50px;" class="text-center align-middle">
            <button
              type="button"
              class="btn btn-sm btn-outline-success py-0 px-2"
              onclick={onShowColumnPicker}
              title="Add dynamic column (+)"
              aria-label="Add dynamic column"
            >
              <i class="bi bi-plus-lg"></i>
            </button>
          </th>

          <!-- Row Actions Header -->
          <th style="width: 80px;" class="text-center">Action</th>
        </tr>

        <!-- Row 2: Per-Column Filter Row -->
        <tr class="filter-row bg-dark-subtle border-bottom border-secondary sticky-header-row-2">
          <!-- Sel & Image don't have filters -->
          <td></td>
          <td></td>

          <!-- Board Brand Filter -->
          <td>
            <ColumnFilterDropdown
              columnId="brand"
              label="Brand"
              allValues={columnAllValues['brand'] || []}
              availableValues={columnAvailableData['brand']?.available || new Set()}
              counts={columnAvailableData['brand']?.counts || new Map()}
              selected={columnFilters['brand'] || new Set()}
              onchange={(s) => onFilterChange('brand', s)}
              isOpen={openDropdownId === 'brand'}
              onToggle={() => onToggleDropdown('brand')}
              onClose={onCloseDropdown}
            />
          </td>

          <!-- Chipset Filter -->
          <td>
            <ColumnFilterDropdown
              columnId="chipset"
              label="Chipset"
              allValues={columnAllValues['chipset'] || []}
              availableValues={columnAvailableData['chipset']?.available || new Set()}
              counts={columnAvailableData['chipset']?.counts || new Map()}
              selected={columnFilters['chipset'] || new Set()}
              onchange={(s) => onFilterChange('chipset', s)}
              isOpen={openDropdownId === 'chipset'}
              onToggle={() => onToggleDropdown('chipset')}
              onClose={onCloseDropdown}
            />
          </td>

          <!-- Form Factor Filter -->
          <td>
            <ColumnFilterDropdown
              columnId="form_factor"
              label="Form Factor"
              allValues={columnAllValues['form_factor'] || []}
              availableValues={columnAvailableData['form_factor']?.available || new Set()}
              counts={columnAvailableData['form_factor']?.counts || new Map()}
              selected={columnFilters['form_factor'] || new Set()}
              onchange={(s) => onFilterChange('form_factor', s)}
              isOpen={openDropdownId === 'form_factor'}
              onToggle={() => onToggleDropdown('form_factor')}
              onClose={onCloseDropdown}
            />
          </td>

          <!-- Dynamic Column Filter Dropdowns -->
          {#each dynamicColumns as col (col.id)}
            <td>
              <ColumnFilterDropdown
                columnId={col.id}
                label={col.label}
                allValues={columnAllValues[col.id] || []}
                availableValues={columnAvailableData[col.id]?.available || new Set()}
                counts={columnAvailableData[col.id]?.counts || new Map()}
                selected={columnFilters[col.id] || new Set()}
                onchange={(s) => onFilterChange(col.id, s)}
                isOpen={openDropdownId === col.id}
                onToggle={() => onToggleDropdown(col.id)}
                onClose={onCloseDropdown}
              />
            </td>
          {/each}

          <!-- Add Column Cell spacer -->
          <td></td>

          <!-- Actions: Clear button -->
          <td class="text-center">
            {#if hasActiveFilters && onResetFilters}
              <button
                type="button"
                class="btn btn-link btn-sm text-warning p-0 text-decoration-none"
                onclick={onResetFilters}
                title="Clear all active filters"
                style="font-size: 0.72rem;"
              >
                Clear All
              </button>
            {/if}
          </td>
        </tr>
      </thead>

      <!-- Table Body (Virtual Window with Buffer Overscan) -->
      <tbody>
        {#if boards.length === 0}
          <tr>
            <td colspan={totalColCount} class="text-center py-5 text-secondary">
              <i class="bi bi-search fs-1 d-block mb-2"></i>
              No motherboards found matching your search and filter criteria.
              {#if hasActiveFilters && onResetFilters}
                <div class="mt-3">
                  <button class="btn btn-sm btn-outline-primary" onclick={onResetFilters}>
                    Clear All Filters
                  </button>
                </div>
              {/if}
            </td>
          </tr>
        {:else}
          <!-- Top Virtual Spacer -->
          {#if virtualWindow.paddingTop > 0}
            <tr class="virtual-spacer" style="height: {virtualWindow.paddingTop}px; border: none;" aria-hidden="true">
              <td colspan={totalColCount} style="padding: 0; border: none; height: {virtualWindow.paddingTop}px; line-height: 0;"></td>
            </tr>
          {/if}

          <!-- Visible Sliced Rows -->
          {#each visibleBoards as board (board.id)}
            {@const isSelected = $compareStore.includes(board.id)}
            {@const thumb = board.specs?.['Rear I/O']?.['Rear I/O Image Thumb'] || board.typed?.rear_io_image}
            <tr
              class="board-row cursor-pointer {isSelected ? 'table-active' : ''}"
              onclick={(e) => handleRowClick(e, board.id)}
              title="Click anywhere to toggle Compare"
            >
              <!-- Select Checkbox -->
              <td
                class="text-center"
                onclick={(e) => {
                  e.stopPropagation();
                  compareStore.toggle(board.id);
                }}
              >
                <input
                  type="checkbox"
                  class="form-check-input cursor-pointer"
                  checked={isSelected}
                  onclick={(e) => e.stopPropagation()}
                  onchange={() => compareStore.toggle(board.id)}
                  title="Toggle compare for {board.model}"
                />
              </td>

              <!-- Rear I/O Thumbnail -->
              <td class="text-center p-1">
                {#if thumb && (thumb.startsWith('/') || thumb.startsWith('http'))}
                  <a
                    href="/board/{board.id}"
                    class="p-0 border-0 d-inline-block"
                    onclick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenDetail(board);
                    }}
                    title="Inspect {board.brand} {board.model}"
                  >
                    <img
                      src={thumb}
                      alt="{board.brand} {board.model}"
                      style="max-height: 34px; border-radius: 4px; object-fit: contain;"
                      loading="lazy"
                    />
                  </a>
                {:else}
                  <span class="text-secondary">-</span>
                {/if}
              </td>

              <!-- Brand & Model -->
              <td>
                <div>
                  <a
                    href="/board/{board.id}"
                    class="text-decoration-none text-light hover-primary fw-bold"
                    onclick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenDetail(board);
                    }}
                    title="Quick inspect {board.model}"
                  >
                    {board.model}
                  </a>
                </div>
                <div class="brand-text">{board.brand}</div>
              </td>

              <!-- Chipset Badge -->
              <td>
                <span class="badge {chipsetBadgeClass(board.chipset)}">
                  {board.chipset}
                </span>
              </td>

              <!-- Form Factor Badge -->
              <td>
                <span class="badge {formFactorBadgeClass(board.form_factor)}">
                  {board.form_factor || '-'}
                </span>
              </td>

              <!-- Dynamic Column Values -->
              {#each dynamicColumns as col (col.id)}
                {@const val = getNestedValue(board, col.key)}
                <td class="text-light-emphasis small text-truncate" style="max-width: 220px;" title={val}>
                  {#if col.key.includes('Audio Codec') && val !== '-'}
                    <span class="text-info">{val}</span>
                  {:else if col.key.includes('Key M') && val !== '-'}
                    <div class="d-flex flex-wrap gap-1 font-monospace">
                      {#each parseM2Generations(val) as gen}
                        <span class="badge {m2GenBadgeClass(gen)}" style="font-size: 0.72rem;">{gen}</span>
                      {/each}
                    </div>
                  {:else}
                    <span>{val}</span>
                  {/if}
                </td>
              {/each}

              <!-- Add Column Cell spacer -->
              <td></td>

              <!-- Actions: Inspect & Compare -->
              <td class="text-center">
                <div class="btn-group btn-group-sm">
                  <a
                    href="/board/{board.id}"
                    class="btn btn-outline-info btn-sm py-0 px-2"
                    onclick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenDetail(board);
                    }}
                    title="Quick inspect specs without leaving directory"
                  >
                    <i class="bi bi-eye"></i>
                  </a>
                  <button
                    type="button"
                    class="btn btn-sm py-0 px-2 {isSelected ? 'btn-danger' : 'btn-outline-secondary'}"
                    onclick={(e) => {
                      e.stopPropagation();
                      compareStore.toggle(board.id);
                    }}
                    title={isSelected ? 'Remove from compare' : 'Add to compare'}
                  >
                    <i class="bi {isSelected ? 'bi-check-lg' : 'bi-plus-lg'}"></i>
                  </button>
                </div>
              </td>
            </tr>
          {/each}

          <!-- Bottom Virtual Spacer -->
          {#if virtualWindow.paddingBottom > 0}
            <tr class="virtual-spacer" style="height: {virtualWindow.paddingBottom}px; border: none;" aria-hidden="true">
              <td colspan={totalColCount} style="padding: 0; border: none; height: {virtualWindow.paddingBottom}px; line-height: 0;"></td>
            </tr>
          {/if}
        {/if}
      </tbody>
    </table>
  </div>
</div>

<style>
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

  /* Desktop Sticky Headers */
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
    :global(.sticky-header-row-1 th),
    :global(.sticky-header-row-2 td) {
      position: static !important;
    }
  }
</style>
