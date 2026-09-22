<script lang="ts">
  let { buildMeta }: { buildMeta: any } = $props();

  let showModal = $state(false);

  const formattedDate = $derived.by(() => {
    if (!buildMeta?.build_timestamp) return '';
    try {
      const d = new Date(buildMeta.build_timestamp);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  });

  const totalBoards = $derived(buildMeta?.total_boards || 613);
  const stats = $derived(buildMeta?.stats || { added_count: 0, removed_count: 0, modified_count: 0 });
  const addedList = $derived<string[]>(buildMeta?.added || []);
  const modifiedList = $derived<string[]>(buildMeta?.modified || []);
</script>

{#if formattedDate}
  <button
    type="button"
    class="btn btn-xs btn-outline-secondary d-flex align-items-center gap-1.5 py-0 px-2 text-secondary-emphasis"
    onclick={() => (showModal = true)}
    title="Click to view database update history and sheet changes"
    style="font-size: 0.75rem; border-radius: 9999px; height: 26px;"
  >
    <i class="bi bi-clock-history text-info" style="font-size: 0.72rem;"></i>
    <span>Updated {formattedDate}</span>
    <span class="badge bg-secondary-subtle text-secondary ms-0.5" style="font-size: 0.65rem;">{totalBoards} boards</span>
  </button>
{/if}

{#if showModal}
  <button
    type="button"
    class="modal-backdrop fade show border-0"
    style="z-index: 1060;"
    onclick={() => (showModal = false)}
    aria-label="Close freshness modal"
  ></button>

  <div
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    style="z-index: 1065;"
    onkeydown={(e) => e.key === 'Escape' && (showModal = false)}
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content bg-dark text-light border border-secondary shadow-lg">
        <div class="modal-header bg-black border-secondary py-3 px-4 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-database-check text-info fs-5"></i>
            <h5 class="modal-title fw-bold text-white mb-0">Database Freshness & Changes</h5>
          </div>
          <button
            type="button"
            class="btn-close btn-close-white"
            onclick={() => (showModal = false)}
            aria-label="Close"
          ></button>
        </div>

        <div class="modal-body p-4 bg-dark">
          <div class="d-flex flex-column gap-3">
            <div class="p-3 rounded bg-black border border-secondary d-flex justify-content-between align-items-center">
              <div>
                <div class="small text-secondary">Total Motherboards Indexed</div>
                <div class="fs-4 fw-bold text-light">{totalBoards} AM5 Models</div>
              </div>
              <div class="text-end">
                <div class="small text-secondary">Last Ingest Sync</div>
                <div class="small fw-semibold text-info">{formattedDate}</div>
              </div>
            </div>

            <div class="card bg-black border-secondary">
              <div class="card-header bg-dark-subtle border-secondary py-2 px-3 fw-bold text-light small d-flex justify-content-between">
                <span>Recent Sheet Revisions</span>
                <span class="text-secondary">{stats.added_count} added, {stats.modified_count} updated</span>
              </div>
              <div class="card-body p-3">
                {#if addedList.length === 0 && modifiedList.length === 0}
                  <p class="small text-secondary mb-0">
                    <i class="bi bi-check-circle-fill text-success me-1"></i>
                    All 613 motherboard specifications and PCIe scorecard rules are up to date with the latest Thriplerex AM5 master spreadsheet.
                  </p>
                {:else}
                  {#if addedList.length > 0}
                    <div class="mb-3">
                      <div class="small fw-bold text-success mb-1">Newly Added Boards ({addedList.length})</div>
                      <ul class="small text-secondary mb-0 ps-3">
                        {#each addedList as item}
                          <li>{item}</li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                  {#if modifiedList.length > 0}
                    <div>
                      <div class="small fw-bold text-warning mb-1">Updated Specifications ({modifiedList.length})</div>
                      <ul class="small text-secondary mb-0 ps-3">
                        {#each modifiedList as item}
                          <li>{item}</li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                {/if}
              </div>
            </div>

            <div class="small text-secondary">
              Data is parsed directly from the community-maintained
              <a
                href="https://docs.google.com/spreadsheets/d/1NQHkDEcgDPm34Mns3C93K6SJoBnua-x9O-y_6hv8sPs"
                target="_blank"
                rel="noreferrer"
                class="text-info text-decoration-none"
              >
                Thriplerex AM5 Spreadsheet
              </a>.
            </div>
          </div>
        </div>

        <div class="modal-footer bg-black border-secondary py-2 px-3">
          <button type="button" class="btn btn-sm btn-primary px-3" onclick={() => (showModal = false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
