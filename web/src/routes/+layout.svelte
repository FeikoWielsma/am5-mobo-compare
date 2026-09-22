<script lang="ts">
  import { page } from '$app/state';
  import { compareStore } from '$lib/stores/compare';
  let { data, children } = $props();

  const version = $derived(data?.buildMeta?.schema_version ? `v${data.buildMeta.schema_version}` : 'v1.0');
  const formattedDate = $derived.by(() => {
    if (!data?.buildMeta?.build_timestamp) return '';
    try {
      const d = new Date(data.buildMeta.build_timestamp);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  });
</script>

<svelte:head>
  <title>AM5 Motherboard Comparison</title>
</svelte:head>

<div class="min-vh-100 d-flex flex-column bg-dark text-light">
  <!-- Top Navbar (Non-sticky: scrolls away so sticky search toolbar takes top position) -->
  <nav class="navbar navbar-expand-lg navbar-dark bg-black border-bottom border-secondary px-3 py-2">
    <div class="container-fluid">
      <div class="d-flex align-items-center flex-wrap gap-2">
        <a class="navbar-brand d-flex align-items-center gap-2 fw-bold text-white mb-0" href="/">
          <i class="bi bi-cpu text-primary fs-4"></i>
          <span>AM5 DB</span>
        </a>
        <span class="badge bg-secondary-subtle text-light-emphasis border border-secondary fw-normal">{version}</span>
        <span class="text-secondary small d-none d-sm-inline">•</span>
        <span class="text-secondary small">
          Data by <a href="https://docs.google.com/spreadsheets/d/1NQHkDEcgDPm34Mns3C93K6SJoBnua-x9O-y_6hv8sPs" target="_blank" rel="noreferrer" class="text-info text-decoration-none fw-semibold">Thriplerex</a>
        </span>
        {#if formattedDate}
          <span class="text-secondary small d-none d-md-inline">•</span>
          <span class="text-secondary small d-none d-md-inline">
            <i class="bi bi-clock-history me-1"></i>Updated {formattedDate}
          </span>
        {/if}
      </div>

      <div class="d-flex align-items-center gap-2">
        {#if page.url.pathname !== '/'}
          <a class="btn btn-outline-light btn-sm" href="/">
            <i class="bi bi-grid-3x3"></i> All Boards
          </a>
        {/if}
        {#if page.url.pathname !== '/' && page.url.pathname !== '/compare'}
          <a
            class="btn btn-primary btn-sm position-relative"
            href="/compare{$compareStore.length ? '?ids=' + $compareStore.join(',') : ''}"
          >
            <i class="bi bi-columns-gap"></i> Compare
            {#if $compareStore.length > 0}
              <span class="badge bg-danger ms-1">{$compareStore.length}</span>
            {/if}
          </a>
        {/if}
        <a
          class="btn btn-outline-secondary btn-sm"
          href="https://docs.google.com/spreadsheets/d/1NQHkDEcgDPm34Mns3C93K6SJoBnua-x9O-y_6hv8sPs"
          target="_blank"
          rel="noreferrer"
          title="Original Thriplerex AM5 Spreadsheet"
        >
          <i class="bi bi-file-earmark-spreadsheet"></i> Source
        </a>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="flex-grow-1 pb-4">
    {@render children()}
  </main>
</div>

<style>
  :root {
    --app-nav-height: 56px;
  }
  :global(body) {
    background-color: #121212 !important;
    color: #e0e0e0 !important;
  }
</style>
