<script lang="ts">
  import { tick } from 'svelte';

  let {
    columnId,
    label,
    allValues = [],
    availableValues = new Set<string>(),
    counts = new Map<string, number>(),
    selected = new Set<string>(),
    onchange,
    isOpen = false,
    onToggle,
    onClose
  }: {
    columnId: string;
    label: string;
    allValues: string[];
    availableValues: Set<string>;
    counts: Map<string, number>;
    selected: Set<string>;
    onchange: (newSelected: Set<string>) => void;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
  } = $props();

  let searchInput = $state<HTMLInputElement | null>(null);
  let searchText = $state('');

  // Auto-focus search input when opened
  $effect(() => {
    if (isOpen) {
      searchText = '';
      tick().then(() => {
        searchInput?.focus();
      });
    }
  });

  // Filter options based on local search text
  let filteredOptions = $derived(
    allValues.filter((val) => {
      if (!searchText.trim()) return true;
      return val.toLowerCase().includes(searchText.toLowerCase().trim());
    })
  );

  function handleCheckboxToggle(val: string) {
    const next = new Set(selected);
    if (next.has(val)) {
      next.delete(val);
    } else {
      next.add(val);
    }
    onchange(next);
  }

  function handleClear() {
    onchange(new Set());
  }

  function handleSelectAllVisible() {
    const next = new Set(selected);
    filteredOptions.forEach((val) => {
      // Only select options that are actually available or currently shown
      if (availableValues.has(val) || (counts.get(val) || 0) > 0) {
        next.add(val);
      }
    });
    onchange(next);
  }

  let buttonText = $derived.by(() => {
    if (selected.size === 0) return 'All';
    if (selected.size === 1) {
      const val = Array.from(selected)[0];
      return val.length > 12 ? `${val.slice(0, 10)}…` : val;
    }
    return `${selected.size} Selected`;
  });

  let hasFilter = $derived(selected.size > 0);
</script>

<div class="position-relative w-100 filter-dropdown-wrapper">
  <button
    type="button"
    class="btn btn-sm w-100 d-flex align-items-center justify-content-between px-2 py-1 text-truncate {hasFilter
      ? 'btn-primary text-white border-primary shadow-sm'
      : 'btn-outline-secondary text-secondary-emphasis bg-dark-subtle border-secondary'}"
    onclick={onToggle}
    title="Filter by {label}: {selected.size === 0 ? 'All' : Array.from(selected).join(', ')}"
    style="font-size: 0.78rem; min-height: 28px;"
  >
    <span class="text-truncate flex-grow-1 text-start">{buttonText}</span>
    <i class="bi bi-chevron-{isOpen ? 'up' : 'down'} ms-1 opacity-75" style="font-size: 0.7rem;"></i>
  </button>

  {#if isOpen}
    <!-- Backdrop to close on outside click -->
    <div
      class="filter-backdrop position-fixed top-0 start-0 w-100 h-100"
      style="z-index: 1040;"
      onclick={onClose}
      onkeydown={(e) => e.key === 'Escape' && onClose()}
      role="button"
      tabindex="-1"
      aria-label="Close filter"
    ></div>

    <!-- Dropdown Menu -->
    <div
      class="dropdown-menu show p-2 shadow-lg bg-dark text-light border border-secondary filter-dropdown-menu"
    >
      <!-- Search Input inside Dropdown -->
      <div class="input-group input-group-sm mb-2">
        <span class="input-group-text bg-black text-secondary border-secondary py-0 px-2">
          <i class="bi bi-search" style="font-size: 0.75rem;"></i>
        </span>
        <input
          type="text"
          class="form-control form-control-sm bg-black text-light border-secondary py-1"
          placeholder="Filter {label}..."
          bind:this={searchInput}
          bind:value={searchText}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSelectAllVisible();
            }
          }}
        />
        {#if searchText}
          <button
            class="btn btn-outline-secondary border-secondary py-0 px-2 text-light"
            onclick={() => (searchText = '')}
            type="button"
            aria-label="Clear search"
          >
            <i class="bi bi-x"></i>
          </button>
        {/if}
      </div>

      <!-- Options List -->
      <div class="filter-options-list overflow-y-auto pe-1" style="max-height: 220px;">
        {#if filteredOptions.length === 0}
          <div class="text-secondary small text-center py-3">No matching options</div>
        {:else}
          {#each filteredOptions as val}
            {@const isChecked = selected.has(val)}
            {@const count = counts.get(val) || 0}
            {@const isAvailable = availableValues.has(val) || count > 0}
            <label
              class="d-flex align-items-center justify-content-between p-1 rounded filter-option-item cursor-pointer mb-1 {isChecked
                ? 'bg-primary-subtle text-primary-emphasis'
                : isAvailable
                  ? 'text-light'
                  : 'text-secondary opacity-50'}"
              style="font-size: 0.8rem; user-select: none;"
            >
              <div class="d-flex align-items-center text-truncate pe-2">
                <input
                  type="checkbox"
                  class="form-check-input me-2 mt-0 cursor-pointer"
                  checked={isChecked}
                  onchange={() => handleCheckboxToggle(val)}
                />
                <span class="text-truncate" title={val}>{val}</span>
              </div>
              <span
                class="badge {isChecked
                  ? 'bg-primary text-white'
                  : 'bg-secondary-subtle text-secondary-emphasis'} rounded-pill"
                style="font-size: 0.68rem;"
              >
                {count}
              </span>
            </label>
          {/each}
        {/if}
      </div>

      <!-- Footer Actions -->
      <div class="d-flex align-items-center justify-content-between border-top border-secondary pt-2 mt-2">
        <button
          type="button"
          class="btn btn-link btn-sm text-secondary p-0 text-decoration-none"
          style="font-size: 0.75rem;"
          onclick={handleClear}
          disabled={selected.size === 0}
        >
          Clear
        </button>
        <button
          type="button"
          class="btn btn-link btn-sm text-primary p-0 text-decoration-none"
          style="font-size: 0.75rem;"
          onclick={handleSelectAllVisible}
        >
          Select All
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-light py-0 px-2"
          style="font-size: 0.75rem;"
          onclick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .filter-dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 230px;
    max-width: 320px;
    z-index: 1045;
    margin-top: 4px;
  }
  @media (max-width: 767.98px) {
    .filter-dropdown-menu {
      min-width: min(220px, calc(100vw - 24px));
      max-width: calc(100vw - 24px);
    }
  }
  .cursor-pointer {
    cursor: pointer;
  }
  .filter-option-item {
    min-height: 32px;
  }
  .filter-option-item:hover {
    background-color: rgba(255, 255, 255, 0.08);
  }
</style>
