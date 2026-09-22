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

<div class="min-vh-100 d-flex flex-column bg-dark text-light app-wrapper">
  <!-- Top Navbar (Non-sticky: scrolls away so sticky search toolbar takes top position) -->
  <nav class="navbar navbar-dark bg-black border-bottom border-secondary px-2 px-sm-3 py-2">
    <div class="container-fluid px-1 px-sm-2 d-flex align-items-center justify-content-between flex-wrap gap-2">
      <div class="d-flex align-items-center flex-wrap gap-1.5 gap-sm-2">
        <a class="navbar-brand d-flex align-items-center gap-1.5 gap-sm-2 fw-bold text-white mb-0 fs-6 fs-sm-5" href="/">
          <i class="bi bi-cpu text-primary fs-5"></i>
          <span>AM5 DB</span>
        </a>
        <span class="badge bg-secondary-subtle text-light-emphasis border border-secondary fw-normal d-none d-xs-inline" style="font-size: 0.72rem;">{version}</span>
        <span class="text-secondary small d-none d-sm-inline">•</span>
        <span class="text-secondary small d-none d-sm-inline">
          Data by <a href="https://docs.google.com/spreadsheets/d/1NQHkDEcgDPm34Mns3C93K6SJoBnua-x9O-y_6hv8sPs" target="_blank" rel="noreferrer" class="text-info text-decoration-none fw-semibold">Thriplerex</a>
        </span>
        {#if formattedDate}
          <span class="text-secondary small d-none d-md-inline">•</span>
          <span class="text-secondary small d-none d-md-inline">
            <i class="bi bi-clock-history me-1"></i>Updated {formattedDate}
          </span>
        {/if}
      </div>

      <div class="d-flex align-items-center gap-1.5 gap-sm-2">
        {#if page.url.pathname !== '/'}
          <a class="btn btn-outline-light btn-sm py-1 px-2" href="/" style="font-size: 0.8rem;">
            <i class="bi bi-grid-3x3"></i> <span class="d-none d-sm-inline">All Boards</span>
          </a>
        {/if}
        {#if page.url.pathname !== '/' && page.url.pathname !== '/compare'}
          <a
            class="btn btn-primary btn-sm position-relative py-1 px-2"
            href="/compare{$compareStore.length ? '?ids=' + $compareStore.join(',') : ''}"
            style="font-size: 0.8rem;"
          >
            <i class="bi bi-columns-gap"></i> Compare
            {#if $compareStore.length > 0}
              <span class="badge bg-danger ms-1">{$compareStore.length}</span>
            {/if}
          </a>
        {/if}
        <a
          class="btn btn-outline-secondary btn-sm py-1 px-2"
          href="https://docs.google.com/spreadsheets/d/1NQHkDEcgDPm34Mns3C93K6SJoBnua-x9O-y_6hv8sPs"
          target="_blank"
          rel="noreferrer"
          title="Original Thriplerex AM5 Spreadsheet"
          style="font-size: 0.8rem;"
        >
          <i class="bi bi-file-earmark-spreadsheet"></i> <span class="d-none d-sm-inline">Source</span>
        </a>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="flex-grow-1 pb-4 main-content">
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
    max-width: 100vw;
    overflow-x: hidden;
  }
  .app-wrapper {
    max-width: 100vw;
    overflow-x: hidden;
    min-height: 100dvh;
  }
  .main-content {
    max-width: 100vw;
    overflow-x: hidden;
  }
</style>
