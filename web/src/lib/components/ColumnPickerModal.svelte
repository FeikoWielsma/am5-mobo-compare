<script lang="ts">
  import { tick } from 'svelte';
  import defaultFeatures from '$lib/data/features.json';
  import defaultStructure from '$lib/data/structure.json';
  import { matchesFuzzyQuery } from '$lib/table_logic';

  export interface FeatureItem {
    key: string;
    name: string;
    category: string;
    full_label?: string;
  }

  export interface TreeLeaf {
    key: string;
    name: string;
    path: string;
    category: string;
    subcategory: string;
  }

  export interface TreeSubcategory {
    name: string;
    path: string;
    leaves: TreeLeaf[];
  }

  export interface TreeCategory {
    name: string;
    icon: string;
    colorClass: string;
    borderClass: string;
    bgBadgeClass: string;
    subcategories: TreeSubcategory[];
    totalLeaves: number;
  }

  let {
    features = defaultFeatures,
    structure = defaultStructure,
    activeColumnKeys = [],
    isOpen = false,
    onAdd,
    onRemove,
    onClose
  }: {
    features?: FeatureItem[];
    structure?: any[];
    activeColumnKeys: string[];
    isOpen: boolean;
    onAdd: (feature: FeatureItem) => void;
    onRemove?: (key: string) => void;
    onClose: () => void;
  } = $props();

  // Use props or fallback to guarantee non-empty
  let effectiveFeatures = $derived(features && features.length > 0 ? features : defaultFeatures);
  let effectiveStructure = $derived(structure && structure.length > 0 ? structure : defaultStructure);

  let searchInput = $state<HTMLInputElement | null>(null);
  let searchQuery = $state('');
  let selectedCategoryTab = $state('ALL');
  let viewMode = $state<'tree' | 'grid'>('tree');

  // Track collapsed categories
  let collapsedCategories = $state<Record<string, boolean>>({});

  const CATEGORY_META: Record<string, { icon: string; color: string; border: string; bgBadge: string }> = {
    'General': {
      icon: 'bi-gear-wide-connected',
      color: '#60a5fa',
      border: 'border-primary',
      bgBadge: 'bg-primary'
    },
    'Power': {
      icon: 'bi-lightning-charge-fill',
      color: '#fbbf24',
      border: 'border-warning',
      bgBadge: 'bg-warning text-dark'
    },
    'Internal headers & features': {
      icon: 'bi-motherboard',
      color: '#34d399',
      border: 'border-success',
      bgBadge: 'bg-success'
    },
    'Rear I/O': {
      icon: 'bi-hdd-network',
      color: '#38bdf8',
      border: 'border-info',
      bgBadge: 'bg-info text-dark'
    },
    'Video Outs': {
      icon: 'bi-display',
      color: '#c084fc',
      border: 'border-purple',
      bgBadge: 'bg-purple text-white'
    },
    'Expansion': {
      icon: 'bi-gpu-card',
      color: '#f87171',
      border: 'border-danger',
      bgBadge: 'bg-danger'
    },
    'Color': {
      icon: 'bi-palette',
      color: '#f472b6',
      border: 'border-pink',
      bgBadge: 'bg-pink text-white'
    },
    'Lane sharing indicators': {
      icon: 'bi-share',
      color: '#fb923c',
      border: 'border-warning',
      bgBadge: 'bg-warning text-dark'
    },
    'Notes': {
      icon: 'bi-journal-text',
      color: '#94a3b8',
      border: 'border-secondary',
      bgBadge: 'bg-secondary'
    }
  };

  // Build the hierarchical tree
  let treeCategories = $derived.by<TreeCategory[]>(() => {
    const list: TreeCategory[] = [];
    const struct = effectiveStructure;

    for (const catNode of struct) {
      const catName: string = catNode.name || 'Other';
      const meta = CATEGORY_META[catName] || {
        icon: 'bi-folder',
        color: '#94a3b8',
        border: 'border-secondary',
        bgBadge: 'bg-secondary'
      };

      const subcategories: TreeSubcategory[] = [];

      const collectLeaves = (node: any, path: string, target: TreeLeaf[]) => {
        if (node.children && Array.isArray(node.children)) {
          for (const child of node.children) {
            const nextPath = path ? `${path} > ${child.name}` : child.name;
            collectLeaves(child, nextPath, target);
          }
        } else if (node.key) {
          target.push({
            key: node.key,
            name: node.name,
            path: path || node.name,
            category: catName,
            subcategory: node.name
          });
        }
      };

      for (const subNode of catNode.children || []) {
        const subName: string = subNode.name || '';
        if (subNode.key) {
          subcategories.push({
            name: subName,
            path: `${catName} > ${subName}`,
            leaves: [
              {
                key: subNode.key,
                name: subNode.name,
                path: `${catName} > ${subName}`,
                category: catName,
                subcategory: subName
              }
            ]
          });
        } else {
          const leaves: TreeLeaf[] = [];
          collectLeaves(subNode, `${catName} > ${subName}`, leaves);
          subcategories.push({
            name: subName,
            path: `${catName} > ${subName}`,
            leaves
          });
        }
      }

      const total = subcategories.reduce((acc, s) => acc + s.leaves.length, 0);
      list.push({
        name: catName,
        icon: meta.icon,
        colorClass: meta.color,
        borderClass: meta.border,
        bgBadgeClass: meta.bgBadge,
        subcategories,
        totalLeaves: total
      });
    }

    return list;
  });

  // Filtered tree based on search and selected category tab
  let filteredTree = $derived.by<TreeCategory[]>(() => {
    const q = searchQuery.trim();

    return treeCategories
      .map((cat) => {
        if (selectedCategoryTab !== 'ALL' && cat.name !== selectedCategoryTab) {
          return null;
        }

        if (!q) {
          return cat;
        }

        const matchingSubs = cat.subcategories
          .map((sub) => {
            const matchingLeaves = sub.leaves.filter((leaf) => {
              const haystack = `${leaf.name} ${leaf.path} ${leaf.key}`;
              return matchesFuzzyQuery(haystack, q);
            });
            if (matchingLeaves.length === 0) return null;
            return {
              ...sub,
              leaves: matchingLeaves
            };
          })
          .filter(Boolean) as TreeSubcategory[];

        if (matchingSubs.length === 0) return null;

        const total = matchingSubs.reduce((acc, s) => acc + s.leaves.length, 0);
        return {
          ...cat,
          subcategories: matchingSubs,
          totalLeaves: total
        };
      })
      .filter(Boolean) as TreeCategory[];
  });

  let totalVisibleLeaves = $derived(
    filteredTree.reduce((acc, c) => acc + c.totalLeaves, 0)
  );

  let totalAllLeaves = $derived(
    treeCategories.reduce((acc, c) => acc + c.totalLeaves, 0)
  );

  $effect(() => {
    if (isOpen) {
      searchQuery = '';
      selectedCategoryTab = 'ALL';
      tick().then(() => {
        searchInput?.focus();
      });
    }
  });

  function toggleCollapse(catName: string) {
    collapsedCategories[catName] = !collapsedCategories[catName];
  }

  function expandAll() {
    collapsedCategories = {};
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};
    treeCategories.forEach((c) => {
      next[c.name] = true;
    });
    collapsedCategories = next;
  }

  function handleToggleFeature(leaf: TreeLeaf) {
    const isAdded = activeColumnKeys.includes(leaf.key);
    if (isAdded) {
      if (onRemove) {
        onRemove(leaf.key);
      }
    } else {
      onAdd({
        key: leaf.key,
        name: leaf.name,
        category: leaf.path,
        full_label: leaf.path
      });
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <button
    type="button"
    class="modal-backdrop fade show border-0"
    style="z-index: 1060;"
    onclick={onClose}
    aria-label="Close modal"
  ></button>

  <!-- Modal Dialog -->
  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="z-index: 1065;"
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  >
    <div class="modal-dialog modal-xl modal-dialog-scrollable modal-fullscreen-md-down modal-dialog-centered">
      <div class="modal-content bg-dark text-light border border-secondary shadow-lg">
        <!-- Modal Header -->
        <div class="modal-header bg-black border-secondary py-2 py-md-3 px-3 px-md-4 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-3">
            <div class="p-2 rounded bg-primary-subtle text-primary border border-primary-subtle">
              <i class="bi bi-diagram-3-fill fs-5"></i>
            </div>
            <div>
              <h5 class="modal-title fw-bold mb-0 text-white d-flex align-items-center gap-2">
                Add Specification Columns
                <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle fs-6 fw-normal">
                  {totalAllLeaves} Total Specs
                </span>
              </h5>
              <div class="text-secondary small mt-1">
                Browse every motherboard specification organized by the original Excel tree structure.
              </div>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2">
            <!-- View Mode Switch -->
            <div class="btn-group btn-group-sm" role="group">
              <button
                type="button"
                class="btn {viewMode === 'tree' ? 'btn-primary' : 'btn-outline-secondary text-light'}"
                onclick={() => (viewMode = 'tree')}
                title="Hierarchical Tree View matching Excel structure"
              >
                <i class="bi bi-diagram-3"></i> Tree
              </button>
              <button
                type="button"
                class="btn {viewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary text-light'}"
                onclick={() => (viewMode = 'grid')}
                title="Compact Grid View"
              >
                <i class="bi bi-grid-3x3-gap"></i> Grid
              </button>
            </div>

            <button
              type="button"
              class="btn-close btn-close-white ms-2"
              onclick={onClose}
              aria-label="Close"
            ></button>
          </div>
        </div>

        <!-- Modal Search and Category Bar -->
        <div class="p-3 border-bottom border-secondary bg-dark-subtle">
          <div class="row g-2 align-items-center mb-2">
            <div class="col-12 col-md-8">
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-black text-secondary border-secondary">
                  <i class="bi bi-search"></i>
                </span>
                <input
                  type="search"
                  class="form-control bg-black text-light border-secondary"
                  placeholder="Filter specifications (e.g. 'VRM', 'PCIe', 'LAN', 'M.2', 'USB', 'Audio', 'Price', 'MOS HS')..."
                  bind:this={searchInput}
                  bind:value={searchQuery}
                />
                {#if searchQuery}
                  <button
                    class="btn btn-outline-secondary border-secondary text-light"
                    onclick={() => (searchQuery = '')}
                    type="button"
                    aria-label="Clear search"
                  >
                    <i class="bi bi-x"></i>
                  </button>
                {/if}
              </div>
            </div>

            <div class="col-12 col-md-4 d-flex justify-content-md-end gap-2">
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary text-light"
                onclick={expandAll}
                title="Expand all categories"
              >
                <i class="bi bi-arrows-expand"></i> Expand All
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary text-light"
                onclick={collapseAll}
                title="Collapse all categories"
              >
                <i class="bi bi-arrows-collapse"></i> Collapse All
              </button>
            </div>
          </div>

          <!-- Category Quick Jump Tabs -->
          <div class="d-flex flex-nowrap flex-md-wrap gap-1 align-items-center mt-2 category-tabs-scroll pb-1">
            <button
              type="button"
              class="btn btn-sm py-1 px-2 {selectedCategoryTab === 'ALL'
                ? 'btn-primary text-white shadow-sm'
                : 'btn-outline-secondary text-light bg-dark border-secondary'}"
              style="font-size: 0.76rem;"
              onclick={() => (selectedCategoryTab = 'ALL')}
            >
              <i class="bi bi-collection me-1"></i> ALL ({totalAllLeaves})
            </button>

            {#each treeCategories as cat}
              {@const isSelected = selectedCategoryTab === cat.name}
              {@const addedCount = cat.subcategories.reduce(
                (acc, s) => acc + s.leaves.filter((l) => activeColumnKeys.includes(l.key)).length,
                0
              )}
              <button
                type="button"
                class="btn btn-sm py-1 px-2 {isSelected
                  ? 'btn-primary text-white shadow-sm'
                  : 'btn-outline-secondary text-light bg-dark border-secondary'}"
                style="font-size: 0.76rem;"
                onclick={() => (selectedCategoryTab = cat.name)}
              >
                <i class="bi {cat.icon} me-1" style="color: {isSelected ? '#fff' : cat.colorClass};"></i>
                {cat.name} ({cat.totalLeaves})
                {#if addedCount > 0}
                  <span class="badge bg-primary ms-1" style="font-size: 0.65rem;">{addedCount} added</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Modal Body: Hierarchical Tree -->
        <div class="modal-body p-3 p-md-4" style="min-height: 400px; max-height: calc(85vh - 200px); overflow-y: auto;">
          {#if filteredTree.length === 0}
            <div class="text-center py-5 text-secondary">
              <i class="bi bi-search fs-1 d-block mb-2 opacity-50"></i>
              <h6 class="text-light fw-bold">No specifications found matching "{searchQuery}"</h6>
              <p class="small mb-3">Try searching for a broader term like 'USB', 'PCIe', 'Audio', or 'Memory'.</p>
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                onclick={() => {
                  searchQuery = '';
                  selectedCategoryTab = 'ALL';
                }}
              >
                Reset Filter
              </button>
            </div>
          {:else}
            <div class="d-flex flex-column gap-4">
              {#each filteredTree as cat (cat.name)}
                {@const isCollapsed = Boolean(collapsedCategories[cat.name]) && !searchQuery}
                {@const catAddedCount = cat.subcategories.reduce(
                  (acc, s) => acc + s.leaves.filter((l) => activeColumnKeys.includes(l.key)).length,
                  0
                )}

                <div class="card bg-black border-secondary shadow-sm rounded-3 overflow-hidden">
                  <!-- Category Header (Level 1: Excel Main Category) -->
                  <div
                    class="card-header bg-dark d-flex align-items-center justify-content-between py-2 px-3 cursor-pointer border-bottom border-secondary select-none"
                    onclick={() => toggleCollapse(cat.name)}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleCollapse(cat.name)}
                  >
                    <div class="d-flex align-items-center gap-2">
                      <i class="bi {cat.icon} fs-5" style="color: {cat.colorClass};"></i>
                      <span class="fw-bold text-white fs-6">{cat.name}</span>
                      <span class="badge {cat.bgBadgeClass} ms-1" style="font-size: 0.72rem;">
                        {cat.totalLeaves} {cat.totalLeaves === 1 ? 'spec' : 'specs'}
                      </span>
                      {#if catAddedCount > 0}
                        <span class="badge bg-primary text-white ms-1" style="font-size: 0.7rem;">
                          {catAddedCount} active
                        </span>
                      {/if}
                    </div>

                    <div class="d-flex align-items-center gap-2 text-secondary">
                      <span class="small d-none d-sm-inline" style="font-size: 0.75rem;">
                        {isCollapsed ? 'Click to expand' : 'Click to collapse'}
                      </span>
                      <i class="bi {isCollapsed ? 'bi-chevron-down' : 'bi-chevron-up'}"></i>
                    </div>
                  </div>

                  <!-- Category Body (Subcategories & Leaves) -->
                  {#if !isCollapsed}
                    <div class="card-body p-3 bg-black">
                      {#if viewMode === 'tree'}
                        <!-- TREE VIEW: Shows Subcategories with tree branches -->
                        <div class="d-flex flex-column gap-3">
                          {#each cat.subcategories as sub (sub.path)}
                            {@const subAddedCount = sub.leaves.filter((l) => activeColumnKeys.includes(l.key)).length}

                            <div class="subcategory-block border-start border-2 border-secondary ps-3 ms-2">
                              <!-- Subcategory Header (Level 2: Excel Subcategory) -->
                              <div class="d-flex align-items-center gap-2 mb-2">
                                <i class="bi bi-arrow-return-right text-secondary" style="font-size: 0.85rem;"></i>
                                <span class="fw-semibold text-light" style="font-size: 0.88rem;">
                                  {sub.name}
                                </span>
                                <span class="badge bg-dark border border-secondary text-secondary" style="font-size: 0.68rem;">
                                  {sub.leaves.length}
                                </span>
                                {#if subAddedCount > 0}
                                  <span class="badge bg-primary text-white" style="font-size: 0.65rem;">
                                    {subAddedCount} added
                                  </span>
                                {/if}
                              </div>

                              <!-- Feature Items (Level 3: Specific Columns) -->
                              <div class="row g-2 ps-2">
                                {#each sub.leaves as leaf (leaf.key)}
                                  {@const isAdded = activeColumnKeys.includes(leaf.key)}
                                  <div class="col-12 col-sm-6 col-lg-4">
                                    <div
                                      class="spec-chip p-2 rounded border cursor-pointer d-flex align-items-center justify-content-between gap-2 h-100 {isAdded
                                        ? 'bg-primary-subtle border-primary text-light'
                                        : 'bg-dark border-secondary text-light hover-card'}"
                                      onclick={() => handleToggleFeature(leaf)}
                                      role="button"
                                      tabindex="0"
                                      onkeydown={(e) => e.key === 'Enter' && handleToggleFeature(leaf)}
                                      title={leaf.path}
                                    >
                                      <div class="text-truncate flex-grow-1 pe-1">
                                        <div class="fw-medium text-truncate" style="font-size: 0.84rem;">
                                          {leaf.name}
                                        </div>
                                        <div class="text-secondary small text-truncate" style="font-size: 0.68rem;">
                                          {leaf.path}
                                        </div>
                                      </div>

                                      <div class="flex-shrink-0">
                                        {#if isAdded}
                                          <span class="badge bg-primary text-white px-2 py-1 shadow-sm" style="font-size: 0.72rem;">
                                            <i class="bi bi-check2"></i> Added
                                          </span>
                                        {:else}
                                          <button
                                            type="button"
                                            class="btn btn-xs btn-outline-primary py-0 px-2"
                                            style="font-size: 0.72rem;"
                                            onclick={(e) => {
                                              e.stopPropagation();
                                              handleToggleFeature(leaf);
                                            }}
                                          >
                                            <i class="bi bi-plus"></i> Add
                                          </button>
                                        {/if}
                                      </div>
                                    </div>
                                  </div>
                                {/each}
                              </div>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <!-- GRID VIEW: Compact responsive grid -->
                        <div class="row g-2">
                          {#each cat.subcategories as sub}
                            {#each sub.leaves as leaf (leaf.key)}
                              {@const isAdded = activeColumnKeys.includes(leaf.key)}
                              <div class="col-12 col-sm-6 col-md-4 col-lg-3">
                                <div
                                  class="spec-chip p-2 rounded border cursor-pointer d-flex align-items-center justify-content-between gap-2 h-100 {isAdded
                                    ? 'bg-primary-subtle border-primary text-light'
                                    : 'bg-dark border-secondary text-light hover-card'}"
                                  onclick={() => handleToggleFeature(leaf)}
                                  role="button"
                                  tabindex="0"
                                  onkeydown={(e) => e.key === 'Enter' && handleToggleFeature(leaf)}
                                  title={leaf.path}
                                >
                                  <div class="text-truncate flex-grow-1 pe-1">
                                    <div class="fw-medium text-truncate" style="font-size: 0.82rem;">
                                      {leaf.name}
                                    </div>
                                    <div class="text-secondary small text-truncate" style="font-size: 0.68rem;">
                                      {leaf.subcategory}
                                    </div>
                                  </div>

                                  <div class="flex-shrink-0">
                                    {#if isAdded}
                                      <span class="badge bg-primary text-white px-1 py-1" style="font-size: 0.68rem;">
                                        <i class="bi bi-check2"></i>
                                      </span>
                                    {:else}
                                      <span class="badge bg-dark border border-secondary text-secondary" style="font-size: 0.68rem;">
                                        <i class="bi bi-plus"></i>
                                      </span>
                                    {/if}
                                  </div>
                                </div>
                              </div>
                            {/each}
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer border-secondary bg-black py-2 px-3 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div class="d-flex align-items-center gap-3">
            <small class="text-secondary">
              Showing <strong class="text-light">{totalVisibleLeaves}</strong> of {totalAllLeaves} specifications
            </small>
            <span class="text-secondary">•</span>
            <small class="text-secondary">
              <strong class="text-primary">{activeColumnKeys.length}</strong> columns currently active in table
            </small>
          </div>

          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-primary px-4 fw-semibold" onclick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .category-tabs-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .category-tabs-scroll::-webkit-scrollbar {
    display: none;
  }
  .category-tabs-scroll :global(button) {
    flex-shrink: 0;
    white-space: nowrap;
  }
  .cursor-pointer {
    cursor: pointer;
  }
  .select-none {
    user-select: none;
  }
  .hover-card:hover {
    background-color: rgba(255, 255, 255, 0.08) !important;
    border-color: #60a5fa !important;
  }
  .spec-chip {
    transition: all 0.15s ease-in-out;
  }
  .subcategory-block {
    transition: border-color 0.2s ease;
  }
  .subcategory-block:hover {
    border-color: #60a5fa !important;
  }
  .border-purple {
    border-color: #c084fc !important;
  }
  .bg-purple {
    background-color: #9333ea !important;
  }
  .border-pink {
    border-color: #f472b6 !important;
  }
  .bg-pink {
    background-color: #db2777 !important;
  }
</style>
