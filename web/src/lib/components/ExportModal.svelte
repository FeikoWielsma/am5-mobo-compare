<script lang="ts">
  import {
    generateMarkdownTable,
    generateCSV,
    downloadFile,
    type ExportSection,
    type ExportRow
  } from '$lib/utils/exporter';
  import {
    renderComparisonCanvas,
    downloadImage,
    copyImageToClipboard
  } from '$lib/utils/image_exporter';

  let {
    isOpen = false,
    boards = [],
    scorecardRows = [],
    layout = [],
    resolveValue,
    onClose
  }: {
    isOpen: boolean;
    boards: any[];
    scorecardRows: { label: string; get: (b: any) => any }[];
    layout: ExportSection[];
    resolveValue: (b: any, row: ExportRow) => any;
    onClose: () => void;
  } = $props();

  let activeTab = $state<'reddit' | 'csv' | 'share' | 'image'>('reddit');
  let copiedReddit = $state(false);
  let copiedLink = $state(false);
  let copiedImage = $state(false);
  let imagePreviewUrl = $state<string>('');
  let canvasRef = $state<HTMLCanvasElement | null>(null);

  $effect(() => {
    if (isOpen && activeTab === 'image' && typeof document !== 'undefined') {
      const c = renderComparisonCanvas(boards, scorecardRows);
      if (c) {
        canvasRef = c;
        imagePreviewUrl = c.toDataURL('image/png');
      }
    }
  });

  let markdownContent = $derived(
    generateMarkdownTable(boards, scorecardRows, layout, resolveValue)
  );

  let csvContent = $derived(
    generateCSV(boards, scorecardRows, layout, resolveValue)
  );

  let shareUrl = $state('');

  $effect(() => {
    if (typeof window !== 'undefined') {
      shareUrl = window.location.href;
    }
  });

  async function copyRedditMarkdown() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(markdownContent);
      }
    } catch (e) {
      console.warn('Clipboard write restricted:', e);
    }
    copiedReddit = true;
    setTimeout(() => (copiedReddit = false), 2000);
  }

  async function copyShareUrl() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch (e) {
      console.warn('Clipboard write restricted:', e);
    }
    copiedLink = true;
    setTimeout(() => (copiedLink = false), 2000);
  }

  function handleDownloadCSV() {
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(`am5_mobo_compare_${timestamp}.csv`, csvContent, 'text/csv;charset=utf-8;');
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
    <div class="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered">
      <div class="modal-content bg-dark text-light border border-secondary shadow-lg">
        <!-- Header -->
        <div class="modal-header bg-black border-secondary py-3 px-4 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-box-arrow-up text-primary fs-5"></i>
            <h5 class="modal-title fw-bold text-white mb-0">Export Comparison</h5>
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle ms-2">
              {boards.length} {boards.length === 1 ? 'Board' : 'Boards'}
            </span>
          </div>
          <button type="button" class="btn-close btn-close-white" onclick={onClose} aria-label="Close"></button>
        </div>

        <!-- Navigation Tabs -->
        <div class="bg-black px-4 pt-2 border-bottom border-secondary">
          <ul class="nav nav-tabs border-bottom-0">
            <li class="nav-item">
              <button
                type="button"
                class="nav-link {activeTab === 'reddit' ? 'active bg-dark text-white border-secondary border-bottom-0 fw-bold' : 'text-secondary border-0'}"
                onclick={() => (activeTab = 'reddit')}
              >
                <i class="bi bi-reddit text-danger me-1"></i> Reddit & Markdown
              </button>
            </li>
            <li class="nav-item">
              <button
                type="button"
                class="nav-link {activeTab === 'image' ? 'active bg-dark text-white border-secondary border-bottom-0 fw-bold' : 'text-secondary border-0'}"
                onclick={() => (activeTab = 'image')}
              >
                <i class="bi bi-image text-warning me-1"></i> Image Card (PNG)
              </button>
            </li>
            <li class="nav-item">
              <button
                type="button"
                class="nav-link {activeTab === 'csv' ? 'active bg-dark text-white border-secondary border-bottom-0 fw-bold' : 'text-secondary border-0'}"
                onclick={() => (activeTab = 'csv')}
              >
                <i class="bi bi-file-earmark-spreadsheet text-success me-1"></i> CSV Spreadsheet
              </button>
            </li>
            <li class="nav-item">
              <button
                type="button"
                class="nav-link {activeTab === 'share' ? 'active bg-dark text-white border-secondary border-bottom-0 fw-bold' : 'text-secondary border-0'}"
                onclick={() => (activeTab = 'share')}
              >
                <i class="bi bi-link-45deg text-info me-1"></i> Share URL
              </button>
            </li>
          </ul>
        </div>

        <!-- Body Content -->
        <div class="modal-body p-4 bg-dark">
          {#if activeTab === 'reddit'}
            <div class="d-flex flex-column gap-3">
              <div>
                <h6 class="fw-bold text-light mb-1">Reddit & Markdown Table</h6>
                <p class="text-secondary small mb-0">
                  Formatted for easy pasting into Reddit comments (<span class="text-info">r/buildapc</span>, <span class="text-info">r/hardware</span>) or GitHub issues.
                </p>
              </div>

              <div class="position-relative">
                <textarea
                  class="form-control font-monospace bg-black text-light border-secondary small"
                  rows="12"
                  readonly
                  value={markdownContent}
                  style="font-size: 0.78rem; line-height: 1.4;"
                ></textarea>
              </div>

              <div class="d-flex justify-content-between align-items-center">
                <span class="text-secondary small">
                  {markdownContent.split('\n').length} rows generated
                </span>
                <button
                  type="button"
                  class="btn btn-primary btn-sm px-3 shadow-sm d-flex align-items-center gap-1"
                  onclick={copyRedditMarkdown}
                >
                  <i class="bi {copiedReddit ? 'bi-check2' : 'bi-clipboard'}"></i>
                  {copiedReddit ? 'Copied to Clipboard!' : 'Copy for Reddit'}
                </button>
              </div>
            </div>
          {:else if activeTab === 'image'}
            <div class="d-flex flex-column gap-3">
              <div>
                <h6 class="fw-bold text-light mb-1">Scorecard Comparison Card (PNG Image)</h6>
                <p class="text-secondary small mb-0">
                  Crisp, high-resolution dark-mode scorecard image ready for sharing on Discord, Reddit, forums, or saving locally.
                </p>
              </div>

              {#if imagePreviewUrl}
                <div class="p-2 bg-black rounded border border-secondary shadow-inner overflow-auto text-center" style="max-height: 420px;">
                  <img src={imagePreviewUrl} alt="AM5 Comparison Scorecard Card" class="img-fluid rounded shadow" style="max-height: 400px; object-fit: contain;" />
                </div>

                <div class="d-flex justify-content-end gap-2 pt-1">
                  <button
                    type="button"
                    class="btn btn-outline-info btn-sm px-3"
                    onclick={async () => {
                      if (canvasRef) {
                        const ok = await copyImageToClipboard(canvasRef);
                        if (ok) {
                          copiedImage = true;
                          setTimeout(() => (copiedImage = false), 2000);
                        }
                      }
                    }}
                  >
                    <i class="bi {copiedImage ? 'bi-check2 text-success' : 'bi-clipboard me-1'}"></i>
                    {copiedImage ? 'Copied to Clipboard!' : 'Copy Image'}
                  </button>

                  <button
                    type="button"
                    class="btn btn-primary btn-sm px-3 shadow-sm fw-semibold"
                    onclick={() => {
                      if (canvasRef) {
                        downloadImage(canvasRef, `am5_comparison_${new Date().toISOString().split('T')[0]}.png`);
                      }
                    }}
                  >
                    <i class="bi bi-download me-1"></i> Download PNG Card
                  </button>
                </div>
              {:else}
                <div class="p-5 text-center text-secondary">
                  <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
                  <div>Rendering high-DPI scorecard comparison card...</div>
                </div>
              {/if}
            </div>
          {:else if activeTab === 'csv'}
            <div class="d-flex flex-column gap-3 py-3 text-center">
              <div class="mb-2">
                <i class="bi bi-file-earmark-spreadsheet-fill text-success display-4"></i>
                <h5 class="fw-bold text-light mt-3 mb-1">Download CSV Spreadsheet</h5>
                <p class="text-secondary small max-w-md mx-auto mb-0" style="max-width: 480px;">
                  Export full side-by-side motherboard specifications with UTF-8 BOM encoding for complete compatibility with Microsoft Excel, Google Sheets, or LibreOffice Calc.
                </p>
              </div>

              <div class="pt-2">
                <button
                  type="button"
                  class="btn btn-success px-4 py-2 shadow-sm fw-semibold"
                  onclick={handleDownloadCSV}
                >
                  <i class="bi bi-download me-1"></i> Download .CSV File
                </button>
              </div>
            </div>
          {:else if activeTab === 'share'}
            <div class="d-flex flex-column gap-3 py-2">
              <div>
                <h6 class="fw-bold text-light mb-1">Direct Comparison Link</h6>
                <p class="text-secondary small mb-0">
                  Share this link directly with others to load this exact motherboard lineup.
                </p>
              </div>

              <div class="input-group">
                <input
                  type="text"
                  class="form-control bg-black text-light border-secondary font-monospace small"
                  readonly
                  value={shareUrl}
                />
                <button
                  type="button"
                  class="btn btn-info text-dark fw-semibold"
                  onclick={copyShareUrl}
                >
                  <i class="bi {copiedLink ? 'bi-check2' : 'bi-link-45deg'}"></i>
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="modal-footer bg-black border-secondary py-2 px-4">
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
