<script lang="ts">
  export interface RangeValue {
    min: number | null;
    max: number | null;
  }

  let {
    label = 'Range',
    min = 0,
    max = 1000,
    step = 1,
    unit = '',
    value = { min: null, max: null },
    onchange
  }: {
    label?: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    value?: RangeValue;
    onchange?: (val: RangeValue) => void;
  } = $props();

  let localMinStr = $state('');
  let localMaxStr = $state('');

  $effect(() => {
    localMinStr = value?.min != null ? String(value.min) : '';
  });
  $effect(() => {
    localMaxStr = value?.max != null ? String(value.max) : '';
  });

  let currentMinNum = $derived(value?.min != null ? Math.max(min, Math.min(value.min, max)) : min);
  let currentMaxNum = $derived(value?.max != null ? Math.min(max, Math.max(value.max, min)) : max);

  let hasActiveFilter = $derived(value?.min != null || value?.max != null);

  let rangeSummary = $derived.by(() => {
    if (value?.min == null && value?.max == null) return 'All';
    if (value?.min != null && value?.max != null) {
      return unit === '$' ? `$${value.min} – $${value.max}` : `${value.min} – ${value.max} ${unit}`.trim();
    }
    if (value?.min != null) {
      return unit === '$' ? `≥ $${value.min}` : `≥ ${value.min} ${unit}`.trim();
    }
    return unit === '$' ? `≤ $${value?.max}` : `≤ ${value?.max} ${unit}`.trim();
  });

  function emitChange(newMin: number | null, newMax: number | null) {
    if (newMin != null && newMax != null && newMin > newMax) {
      const temp = newMin;
      newMin = newMax;
      newMax = temp;
    }
    onchange?.({ min: newMin, max: newMax });
  }

  function handleMinInput(e: Event) {
    const target = e.target as HTMLInputElement;
    localMinStr = target.value;
    const num = target.value.trim() === '' ? null : parseFloat(target.value);
    emitChange(num != null && !isNaN(num) ? num : null, value?.max ?? null);
  }

  function handleMaxInput(e: Event) {
    const target = e.target as HTMLInputElement;
    localMaxStr = target.value;
    const num = target.value.trim() === '' ? null : parseFloat(target.value);
    emitChange(value?.min ?? null, num != null && !isNaN(num) ? num : null);
  }

  function handleSliderMin(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseFloat(target.value);
    if (!isNaN(val)) {
      const curMax = value?.max ?? max;
      const nextMin = Math.min(val, curMax);
      localMinStr = String(nextMin);
      emitChange(nextMin, value?.max ?? null);
    }
  }

  function handleSliderMax(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseFloat(target.value);
    if (!isNaN(val)) {
      const curMin = value?.min ?? min;
      const nextMax = Math.max(val, curMin);
      localMaxStr = String(nextMax);
      emitChange(value?.min ?? null, nextMax);
    }
  }

  function handleReset() {
    localMinStr = '';
    localMaxStr = '';
    emitChange(null, null);
  }
</script>

<div class="numeric-range-filter p-2 rounded bg-dark border border-secondary-subtle text-light">
  <div class="d-flex justify-content-between align-items-center mb-2">
    <div class="d-flex align-items-center gap-2">
      <span class="fw-semibold text-uppercase small text-light-emphasis tracking-wider">{label}</span>
      <span class="badge {hasActiveFilter ? 'bg-primary text-white' : 'bg-secondary-subtle text-secondary'} small">
        {rangeSummary}
      </span>
    </div>
    {#if hasActiveFilter}
      <button
        type="button"
        class="btn btn-sm btn-link text-secondary p-0 text-decoration-none small hover-light"
        onclick={handleReset}
        title="Reset range"
      >
        <span aria-hidden="true">&times;</span> Clear
      </button>
    {/if}
  </div>

  <div class="d-flex align-items-center gap-2 mb-2">
    <div class="input-group input-group-sm">
      {#if unit === '$'}
        <span class="input-group-text bg-dark-subtle border-secondary text-secondary">$</span>
      {/if}
      <input
        type="number"
        class="form-control form-control-sm bg-dark text-light border-secondary"
        placeholder={String(min)}
        {min}
        {max}
        {step}
        value={localMinStr}
        oninput={handleMinInput}
        aria-label="{label} minimum"
      />
    </div>

    <span class="text-secondary small">–</span>

    <div class="input-group input-group-sm">
      {#if unit === '$'}
        <span class="input-group-text bg-dark-subtle border-secondary text-secondary">$</span>
      {/if}
      <input
        type="number"
        class="form-control form-control-sm bg-dark text-light border-secondary"
        placeholder={String(max)}
        {min}
        {max}
        {step}
        value={localMaxStr}
        oninput={handleMaxInput}
        aria-label="{label} maximum"
      />
      {#if unit && unit !== '$'}
        <span class="input-group-text bg-dark-subtle border-secondary text-secondary small">{unit}</span>
      {/if}
    </div>
  </div>

  <!-- Dual interactive range sliders -->
  <div class="range-sliders-wrapper position-relative pt-1 pb-1">
    <div class="range-track-bg"></div>
    <input
      type="range"
      class="form-range custom-slider slider-min"
      {min}
      {max}
      {step}
      value={currentMinNum}
      oninput={handleSliderMin}
      aria-label="{label} slider min"
    />
    <input
      type="range"
      class="form-range custom-slider slider-max"
      {min}
      {max}
      {step}
      value={currentMaxNum}
      oninput={handleSliderMax}
      aria-label="{label} slider max"
    />
  </div>
</div>

<style>
  .tracking-wider {
    letter-spacing: 0.05em;
  }
  .hover-light:hover {
    color: #f8f9fa !important;
  }
  .range-sliders-wrapper {
    position: relative;
    height: 24px;
    display: flex;
    align-items: center;
  }
  .range-track-bg {
    position: absolute;
    width: 100%;
    height: 4px;
    background-color: #373b3e;
    border-radius: 2px;
    top: 50%;
    transform: translateY(-50%);
  }
  .custom-slider {
    position: absolute;
    width: 100%;
    pointer-events: none;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    margin: 0;
    z-index: 2;
  }
  .custom-slider::-webkit-slider-thumb {
    pointer-events: auto;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background-color: #0d6efd;
    border: 2px solid #fff;
    cursor: pointer;
    -webkit-appearance: none;
  }
  .custom-slider::-moz-range-thumb {
    pointer-events: auto;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background-color: #0d6efd;
    border: 2px solid #fff;
    cursor: pointer;
  }
  .custom-slider:focus {
    outline: none;
  }
</style>
