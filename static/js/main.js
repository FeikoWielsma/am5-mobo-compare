document.addEventListener('DOMContentLoaded', function () {
    // Static Mode Fallback
    if (window.IS_STATIC && !window.MOBO_DATA) {
        console.log("Static mode: Fetching mobos.json...");
        fetch('static/data/mobos.json')
            .then(res => res.json())
            .then(data => {
                window.MOBO_DATA = data;
                initApp();
            })
            .catch(err => console.error("Failed to load static data:", err));
        return;
    } else if (typeof MOBO_DATA !== 'undefined') {
        initApp();
    }

    function initApp() {
        const tableBody = document.getElementById('moboTableBody');
        const globalSearch = document.getElementById('globalSearch');
        const featureSelectors = document.querySelectorAll('.feature-selector');
        const countDisplay = document.getElementById('countDisplay');

        const compareBar = document.getElementById('compareBar');
        const selectedCountSpan = document.getElementById('selectedCount');
        const selectedCountTop = document.getElementById('selectedCountTop');
        const compareBtn = document.getElementById('compareBtn');
        const compareBtnTop = document.getElementById('compareBtnTop');
        const clearSelectionBtn = document.getElementById('clearSelection');

        let selectedIds = new Set();
        let currentFilters = {
            global: '',
            brand: new Set(),
            chipset: new Set(),
            model: new Set(),
            form_factor: new Set(),
            dyn1: new Set(),
            dyn2: new Set(),
            dyn3: new Set(),
            dyn4: new Set()
        };
        // Initialize dynamicFeatureKeys empty - will be populated by URL or defaults
        let dynamicFeatureKeys = {};

        // Defaults if no URL state
        const DEFAULT_DYNAMIC_COLS = {
            1: 'General|Market|A-MSRP (USD)',
            2: 'Power|VRM configuration|Phase config',
            3: 'General|Audio|Audio Codec+DAC',
            4: 'Rear I/O|USB|Total USB'
        };
        let currentSort = {
            column: null,
            direction: 'asc' // 'asc' or 'desc'
        };

        // URL State Sync
        function saveStateToUrl() {
            const state = {};

            // Only include non-empty filters with short keys
            const filters = {};
            for (const key in currentFilters) {
                if (currentFilters[key] instanceof Set && currentFilters[key].size > 0) {
                    filters[key] = Array.from(currentFilters[key]);
                }
            }
            if (Object.keys(filters).length > 0) state.f = filters;

            // Only include dynamic keys that are set
            const keys = {};
            for (const i in dynamicFeatureKeys) {
                if (dynamicFeatureKeys[i]) keys[i] = dynamicFeatureKeys[i];
            }
            if (Object.keys(keys).length > 0) state.k = keys;

            // Only include search if non-empty
            if (globalSearch.value) state.s = globalSearch.value;

            // Only include sort if set
            if (currentSort.column) {
                state.o = { c: currentSort.column, d: currentSort.direction };
            }

            // Skip encoding if state is empty
            if (JSON.stringify(state).length === 2) {
                const url = new URL(window.location);
                url.searchParams.delete('v');
                window.history.replaceState({}, '', url);
                return;
            }

            try {
                const encoded = btoa(JSON.stringify(state)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                const url = new URL(window.location);
                url.searchParams.set('v', encoded);
                window.history.replaceState({}, '', url);
            } catch (e) { console.error("Failed to save state:", e); }
        }

        function loadStateFromUrl() {
            const params = new URLSearchParams(window.location.search);
            const encoded = params.get('v');

            if (!encoded) {
                // Load defaults if no URL state
                dynamicFeatureKeys = { ...DEFAULT_DYNAMIC_COLS };
            } else {
                try {
                    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
                    while (base64.length % 4) base64 += '=';
                    const state = JSON.parse(atob(base64));

                    if (state.s) globalSearch.value = state.s;
                    if (state.k && Object.keys(state.k).length > 0) {
                        dynamicFeatureKeys = state.k;
                    } else {
                        // Fallback to defaults if k is empty in state
                        dynamicFeatureKeys = { ...DEFAULT_DYNAMIC_COLS };
                    }

                    if (state.f) {
                        for (const key in state.f) {
                            if (currentFilters[key]) {
                                currentFilters[key] = new Set(state.f[key]);
                            }
                        }
                    }
                    if (state.o) {
                        currentSort.column = state.o.c;
                        currentSort.direction = state.o.d;
                    }
                } catch (e) { console.error("Failed to load state:", e); }
            }

            // ALWAYS update UI (whether from URL or defaults)
            syncFilterKeys();
            rebuildDynamicColumnsUI();
        }

        // Helper: Access nested property
        function getNestedValue(obj, path) {
            if (!path) return '-';

            // 1. Try direct or dot notation on root
            // 2. Try pipe notation on root
            // 3. Try pipe notation inside 'specs' (most common for dynamic cols)

            const tryAccess = (target, p) => {
                if (!target) return undefined;
                if (p in target) return target[p];

                const sep = p.includes('|') ? '|' : '.';
                const parts = p.split(sep);
                let current = target;
                for (const part of parts) {
                    if (current && typeof current === 'object' && part in current) {
                        current = current[part];
                    } else {
                        return undefined;
                    }
                }
                return current;
            };

            let val = tryAccess(obj, path);
            if (val !== undefined) return val;

            // Try inside specs
            if (obj.specs) {
                val = tryAccess(obj.specs, path);
                if (val !== undefined) return val;
            }

            return '-';
        }

        function getChipsetClass(c) {
            if (!c) return '';
            const clean = c.toLowerCase().replace(/[ ()]/g, '');
            return `badge-chipset badge-chipset-${clean}`;
        }

        function getFFClass(f) {
            if (!f) return '';
            // Normalize form factor for CSS class
            let normalized = f.toLowerCase();
            // Handle special cases
            normalized = normalized.replace(/atx-b$/i, 'atx'); // ATX-B -> atx
            normalized = normalized.replace(/bkb itx/i, 'mini-itx'); // BKB ITX -> mini-itx
            normalized = normalized.replace(/[μu]-atx-b/i, 'matx'); // μ-ATX-B -> matx
            normalized = normalized.replace(/[μu]-atx/i, 'matx'); // μ-ATX -> matx
            normalized = normalized.replace(/e-atx/i, 'eatx'); // E-ATX -> eatx
            // Clean up remaining special chars
            const clean = normalized.replace(/[ -]/g, '');
            return `badge-ff badge-ff-${clean}`;
        }

        function renderTable() {
            const filtered = MOBO_DATA.filter(m => {
                const g = globalSearch.value.toLowerCase();
                if (g) {
                    const combined = `${m.brand} ${m.chipset} ${m.model}`.toLowerCase();
                    if (!combined.includes(g)) return false;
                }

                if (currentFilters.brand.size > 0 && !currentFilters.brand.has(String(m.brand))) return false;
                if (currentFilters.chipset.size > 0 && !currentFilters.chipset.has(String(m.chipset))) return false;
                if (currentFilters.model.size > 0 && !currentFilters.model.has(String(m.model))) return false;
                if (currentFilters.form_factor.size > 0 && !currentFilters.form_factor.has(String(m.form_factor))) return false;

                if (dynamicFeatureKeys[1] && currentFilters.dyn1.size > 0) {
                    const val = String(getNestedValue(m, dynamicFeatureKeys[1]));
                    if (!currentFilters.dyn1.has(val)) return false;
                }
                if (dynamicFeatureKeys[2] && currentFilters.dyn2.size > 0) {
                    const val = String(getNestedValue(m, dynamicFeatureKeys[2]));
                    if (!currentFilters.dyn2.has(val)) return false;
                }
                if (dynamicFeatureKeys[3] && currentFilters.dyn3.size > 0) {
                    const val = String(getNestedValue(m, dynamicFeatureKeys[3]));
                    if (!currentFilters.dyn3.has(val)) return false;
                }
                if (dynamicFeatureKeys[4] && currentFilters.dyn4.size > 0) {
                    const val = String(getNestedValue(m, dynamicFeatureKeys[4]));
                    if (!currentFilters.dyn4.has(val)) return false;
                }
                return true;
            });

            // Apply sorting if a column is selected
            if (currentSort.column) {
                filtered.sort((a, b) => {
                    let aVal, bVal;

                    if (currentSort.column.startsWith('dyn')) {
                        const idx = currentSort.column.replace('dyn', '');
                        aVal = dynamicFeatureKeys[idx] ? getNestedValue(a, dynamicFeatureKeys[idx]) : '';
                        bVal = dynamicFeatureKeys[idx] ? getNestedValue(b, dynamicFeatureKeys[idx]) : '';
                    } else {
                        aVal = a[currentSort.column];
                        bVal = b[currentSort.column];
                    }

                    // Handle nulls and convert to strings for comparison
                    aVal = (aVal === null || aVal === undefined || aVal === '-') ? '' : String(aVal);
                    bVal = (bVal === null || bVal === undefined || bVal === '-') ? '' : String(bVal);

                    // Natural sort for strings
                    const result = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
                    return currentSort.direction === 'asc' ? result : -result;
                });
            }

            tableBody.innerHTML = '';
            filtered.forEach(m => {
                const tr = document.createElement('tr');
                tr.className = 'mobo-row';
                const dynValues = [];
                // Sort keys to match header order
                const sortedKeys = Object.keys(dynamicFeatureKeys).sort((a, b) => parseInt(a) - parseInt(b));
                sortedKeys.forEach(i => {
                    dynValues.push(dynamicFeatureKeys[i] ? getNestedValue(m, dynamicFeatureKeys[i]) : '-');
                });

                tr.innerHTML = `
                <td>
                    <input type="checkbox" class="mobo-select form-check-input" value="${m.id}" ${selectedIds.has(String(m.id)) ? 'checked' : ''}>
                </td>
                <td>${m.brand}</td>
                <td><span class="badge ${getChipsetClass(m.chipset)}">${m.chipset}</span></td>
                <td><span class="badge ${getFFClass(m.form_factor)}">${m.form_factor}</span></td>
                <td>
                    <span class="fw-bold text-primary model-click" role="button" data-id="${m.id}">${m.model}</span>
                </td>
                ${dynValues.map(v => `<td class="small text-muted">${v}</td>`).join('')}
            `;
                tr.addEventListener('click', (e) => {
                    // Ignore clicks on links, inputs, or the model name (handled separately)
                    if (e.target.type !== 'checkbox' && e.target.tagName !== 'A' && !e.target.closest('.feature-selector') && !e.target.closest('.model-click')) {
                        const cb = tr.querySelector('.mobo-select');
                        cb.checked = !cb.checked;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });

                // Model Click Handler
                const modelSpan = tr.querySelector('.model-click');
                if (modelSpan) {
                    modelSpan.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent row selection
                        showScorecard(m.id);
                    });
                }

                tableBody.appendChild(tr);
            });

            countDisplay.innerText = `${filtered.length} motherboards visible`;
            updateButtonLabels();
            updateFilterOptionsUI();
            saveStateToUrl();
        }

        function syncFilterKeys() {
            for (const k in dynamicFeatureKeys) {
                const fid = `dyn${k}`;
                if (!currentFilters[fid]) currentFilters[fid] = new Set();
            }
        }

        function rebuildDynamicColumnsUI() {
            // Remove existing dynamic headers and filter cells (except the fixed ones)
            document.querySelectorAll('.dynamic-col-header').forEach(el => el.remove());
            document.querySelectorAll('.dynamic-filter-cell').forEach(el => el.remove());

            const addHeader = document.getElementById('addColumnHeader');
            const addFilter = document.getElementById('addColumnFilterCell');
            const template = document.getElementById('featureSelectorTemplate');

            // Sort keys to maintain order 1, 2, 3...
            const keys = Object.keys(dynamicFeatureKeys).sort((a, b) => parseInt(a) - parseInt(b));

            keys.forEach(idx => {
                const colKey = `dyn${idx}`;

                // 1. Create Header
                const th = document.createElement('th');
                th.className = 'dynamic-col-header';
                th.dataset.colIndex = idx;
                th.innerHTML = `
                    <div class="d-flex align-items-center gap-2">
                        <div class="flex-grow-1">
                             <select class="form-select form-select-sm feature-selector" data-col-index="${idx}">
                                ${template.innerHTML}
                             </select>
                        </div>
                        <span class="sortable-icon" data-sort="${colKey}" style="cursor: pointer; font-size: 1.2rem;" title="Sort">⇅</span>
                        <span class="sort-indicator" data-col="${colKey}"></span>
                        <button class="btn btn-link text-danger p-0 ms-1 remove-col-btn" data-index="${idx}" title="Remove Column">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                `;
                addHeader.parentNode.insertBefore(th, addHeader);

                // Set selected value
                const sel = th.querySelector('select');
                sel.value = dynamicFeatureKeys[idx] || '';

                // Bind Select Change
                sel.addEventListener('change', (e) => {
                    dynamicFeatureKeys[idx] = e.target.value;
                    renderTable();
                });

                // Bind Remove Click
                th.querySelector('.remove-col-btn').addEventListener('click', () => {
                    removeColumn(idx);
                });

                // 2. Create Filter Cell
                const td = document.createElement('td');
                td.className = 'dynamic-filter-cell';
                td.innerHTML = `
                    <div class="dropdown filter-dropdown" data-col="${colKey}">
                        <button class="btn btn-sm btn-outline-light w-100 dropdown-toggle filter-btn" type="button"
                            data-bs-toggle="dropdown" data-bs-auto-close="outside">All</button>
                        <div class="dropdown-menu p-2 shadow"></div>
                    </div>
                `;
                addFilter.parentNode.insertBefore(td, addFilter);
            });

            // Re-bind sort icons
            document.querySelectorAll('.sortable-icon').forEach(icon => {
                icon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const sortCol = icon.dataset.sort;
                    if (currentSort.column === sortCol) {
                        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                    } else {
                        currentSort.column = sortCol;
                        currentSort.direction = 'asc';
                    }
                    saveStateToUrl(); // Ensure state is saved when sort changes
                    renderTable(); // Re-render to apply sort
                });
            });
        }

        function addColumn() {
            const keys = Object.keys(dynamicFeatureKeys).map(k => parseInt(k));
            const nextIdx = keys.length > 0 ? Math.max(...keys) + 1 : 1;
            dynamicFeatureKeys[nextIdx] = ''; // Default empty
            syncFilterKeys();
            rebuildDynamicColumnsUI();
            initFilterMenus(); // Re-init filters for new column
            renderTable();
        }

        function removeColumn(idx) {
            delete dynamicFeatureKeys[idx];
            delete currentFilters[`dyn${idx}`];

            // If empty, standard says we might want at least one? User said "amount... simple defaults". 
            // If user removes all, that's fine.

            saveStateToUrl();
            rebuildDynamicColumnsUI();
            initFilterMenus(); // Re-init to remove old filter handlers
            renderTable();
        }

        // Add Button Listener
        const addBtn = document.getElementById('addDynamicColBtn');
        if (addBtn) addBtn.addEventListener('click', addColumn);

        function updateFilterOptionsUI() {
            const filterCols = ['brand', 'chipset', 'model', 'form_factor'];
            // Add dynamic filter keys
            for (const k in dynamicFeatureKeys) {
                filterCols.push(`dyn${k}`);
            }

            filterCols.forEach(targetCol => {
                const subset = MOBO_DATA.filter(m => {
                    const g = globalSearch.value.toLowerCase();
                    if (g) {
                        const combined = `${m.brand} ${m.chipset} ${m.model}`.toLowerCase();
                        if (!combined.includes(g)) return false;
                    }

                    for (const col of filterCols) {
                        if (col === targetCol) continue;
                        const filterSet = currentFilters[col];
                        if (filterSet.size === 0) continue;

                        let val;
                        if (col === 'dyn1') val = dynamicFeatureKeys[1] ? String(getNestedValue(m, dynamicFeatureKeys[1])) : null;
                        else if (col === 'dyn2') val = dynamicFeatureKeys[2] ? String(getNestedValue(m, dynamicFeatureKeys[2])) : null;
                        else if (col === 'dyn3') val = dynamicFeatureKeys[3] ? String(getNestedValue(m, dynamicFeatureKeys[3])) : null;
                        else if (col === 'dyn4') val = dynamicFeatureKeys[4] ? String(getNestedValue(m, dynamicFeatureKeys[4])) : null;
                        else val = String(m[col]);

                        if (!filterSet.has(val)) return false;
                    }
                    return true;
                });

                const availableValues = new Set();
                subset.forEach(m => {
                    let val;
                    if (targetCol === 'dyn1') val = dynamicFeatureKeys[1] ? String(getNestedValue(m, dynamicFeatureKeys[1])) : null;
                    else if (targetCol === 'dyn2') val = dynamicFeatureKeys[2] ? String(getNestedValue(m, dynamicFeatureKeys[2])) : null;
                    else if (targetCol === 'dyn3') val = dynamicFeatureKeys[3] ? String(getNestedValue(m, dynamicFeatureKeys[3])) : null;
                    else if (targetCol === 'dyn4') val = dynamicFeatureKeys[4] ? String(getNestedValue(m, dynamicFeatureKeys[4])) : null;
                    else val = String(m[targetCol]);
                    if (val !== null && val !== undefined) availableValues.add(val);
                });

                const dropdown = document.querySelector(`.filter-dropdown[data-col="${targetCol}"]`);
                if (dropdown) {
                    const searchInput = dropdown.querySelector('.filter-search');
                    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

                    dropdown.querySelectorAll('.filter-option').forEach(opt => {
                        const cb = opt.querySelector('.filter-cb');
                        if (cb) {
                            const isAvailable = availableValues.has(cb.value);
                            const matchesSearch = opt.textContent.toLowerCase().includes(searchTerm);

                            opt.setAttribute('data-available', isAvailable);
                            // We show item if it is available AND matches search, OR if it is currently CHECKED (to avoid disappearing state)
                            const shouldShow = (isAvailable && matchesSearch) || cb.checked;
                            opt.style.display = shouldShow ? '' : 'none';
                        }
                    });
                }
            });
        }

        function updateButtonLabels() {
            document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
                const col = dropdown.getAttribute('data-col');
                const btn = dropdown.querySelector('.filter-btn');
                const selectedSize = currentFilters[col].size;
                if (selectedSize === 0) {
                    btn.innerText = 'All';
                } else if (selectedSize === 1) {
                    btn.innerText = Array.from(currentFilters[col])[0];
                } else {
                    btn.innerText = `${selectedSize} Selected`;
                }
            });
        }

        function initFilterMenus() {
            document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
                const col = dropdown.getAttribute('data-col');
                const menu = dropdown.querySelector('.dropdown-menu');

                let values = new Set();
                MOBO_DATA.forEach(m => {
                    let val;
                    if (col === 'dyn1') val = dynamicFeatureKeys[1] ? getNestedValue(m, dynamicFeatureKeys[1]) : null;
                    else if (col === 'dyn2') val = dynamicFeatureKeys[2] ? getNestedValue(m, dynamicFeatureKeys[2]) : null;
                    else if (col === 'dyn3') val = dynamicFeatureKeys[3] ? getNestedValue(m, dynamicFeatureKeys[3]) : null;
                    else if (col === 'dyn4') val = dynamicFeatureKeys[4] ? getNestedValue(m, dynamicFeatureKeys[4]) : null;
                    else val = m[col];
                    if (val !== null && val !== undefined) values.add(String(val));
                });

                // Custom sorting logic
                let sortedValues;
                if (col === 'brand') {
                    // Count occurrences of each brand
                    const counts = new Map();
                    values.forEach(v => {
                        counts.set(v, MOBO_DATA.filter(m => String(m.brand) === v).length);
                    });

                    // Define priority tiers (case-insensitive matching)
                    const tier1 = ['ASRock', 'Asus', 'ASUS', 'Gigabyte', 'MSI'];
                    const tier2 = ['Biostar', 'Sapphire'];

                    const tier1Values = [];
                    const tier2Values = [];
                    const otherValues = [];

                    values.forEach(v => {
                        if (tier1.some(t => t.toLowerCase() === v.toLowerCase())) {
                            tier1Values.push(v);
                        } else if (tier2.some(t => t.toLowerCase() === v.toLowerCase())) {
                            tier2Values.push(v);
                        } else {
                            otherValues.push(v);
                        }
                    });

                    // Sort others by count descending
                    otherValues.sort((a, b) => counts.get(b) - counts.get(a));

                    sortedValues = [...tier1Values, ...tier2Values, ...otherValues];
                } else if (col === 'form_factor') {
                    // Sort by size: biggest first
                    const sizeOrder = ['E-ATX', 'ATX', 'ATX-B', 'μ-ATX', 'μ-ATX-B', 'Mini-ITX', 'BKB ITX', 'm-ITX'];
                    sortedValues = Array.from(values).sort((a, b) => {
                        const aIdx = sizeOrder.findIndex(s => s.toLowerCase() === a.toLowerCase());
                        const bIdx = sizeOrder.findIndex(s => s.toLowerCase() === b.toLowerCase());
                        if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
                        if (aIdx === -1) return 1;
                        if (bIdx === -1) return -1;
                        return aIdx - bIdx;
                    });
                } else if (col === 'chipset') {
                    // Sort by tier: fanciest first
                    const chipsetTiers = [
                        // AMD X series (high-end)
                        'X870E', 'X870', 'X670E', 'X670',
                        // AMD B series (mid-range)
                        'B850', 'B650E', 'B650',
                        // AMD A series (budget)
                        'A620',
                        // Intel Z series (high-end)
                        'Z890', 'Z790', 'Z690',
                        // Intel B/H series (mid-range)
                        'B860', 'B760', 'B660', 'H870', 'H770', 'H670'
                    ];
                    sortedValues = Array.from(values).sort((a, b) => {
                        const aIdx = chipsetTiers.findIndex(c => c.toLowerCase() === a.toLowerCase());
                        const bIdx = chipsetTiers.findIndex(c => c.toLowerCase() === b.toLowerCase());
                        if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
                        if (aIdx === -1) return 1;
                        if (bIdx === -1) return -1;
                        return aIdx - bIdx;
                    });
                } else {
                    sortedValues = Array.from(values).sort();
                }

                // Calculate counts for each value
                const counts = new Map();
                sortedValues.forEach(v => {
                    let count = 0;
                    if (col.startsWith('dyn')) {
                        const idx = col.replace('dyn', '');
                        count = MOBO_DATA.filter(m => String(getNestedValue(m, dynamicFeatureKeys[idx])) === v).length;
                    } else {
                        count = MOBO_DATA.filter(m => String(m[col]) === v).length;
                    }
                    counts.set(v, count);
                });

                menu.innerHTML = `
                <div class="filter-search-container px-2">
                    <input type="text" class="form-control form-control-sm filter-search" placeholder="Search...">
                </div>
                <div class="filter-options-list px-2" style="max-height: 250px; overflow-y: auto;">
                    ${sortedValues.map(v => `
                        <label class="filter-option" style="display: flex; align-items: center;">
                            <input type="checkbox" class="filter-cb" value="${v}" ${currentFilters[col].has(v) ? 'checked' : ''}>
                            <span class="ms-2 flex-grow-1">${v}</span>
                            <span class="badge bg-secondary bg-opacity-25 text-muted ms-2" style="font-size: 0.7rem;">${counts.get(v)}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="filter-actions px-2 border-top pt-2 mt-2">
                    <button class="btn btn-link btn-sm p-0 text-decoration-none filter-clear">Clear</button>
                    <button class="btn btn-link btn-sm p-0 text-decoration-none filter-all">All</button>
                </div>
            `;

                // Search Logic - filter options directly
                const search = menu.querySelector('.filter-search');
                search.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    const options = menu.querySelectorAll('.filter-option');
                    options.forEach(opt => {
                        const text = opt.textContent.toLowerCase();
                        const cb = opt.querySelector('.filter-cb');
                        // Show if matches search OR is currently checked
                        const shouldShow = text.includes(searchTerm) || (cb && cb.checked);
                        opt.style.display = shouldShow ? '' : 'none';
                    });
                });

                // Add Enter key listener to search box
                search.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const allBtn = menu.querySelector('.filter-all');
                        if (allBtn) allBtn.click();
                        // Optional: close dropdown? Bootstrap dropdowns typically close on blur or explicit call.
                    }
                });

                // Actions
                menu.querySelector('.filter-clear').onclick = (e) => {
                    e.stopPropagation();
                    currentFilters[col].clear();
                    menu.querySelectorAll('.filter-cb').forEach(cb => cb.checked = false);
                    // Clear search box and reset visibility
                    const searchInput = menu.querySelector('.filter-search');
                    if (searchInput) {
                        searchInput.value = '';
                        menu.querySelectorAll('.filter-option').forEach(opt => opt.style.display = '');
                    }
                    renderTable();
                };
                menu.querySelector('.filter-all').onclick = (e) => {
                    e.stopPropagation();
                    menu.querySelectorAll('.filter-option').forEach(opt => {
                        if (opt.style.display !== 'none') {
                            const cb = opt.querySelector('.filter-cb');
                            if (cb) {
                                currentFilters[col].add(cb.value);
                                cb.checked = true;
                            }
                        }
                    });
                    renderTable();
                };
            });
        }

        // Delegation for checkbox clicks
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('filter-cb')) {
                const dropdown = e.target.closest('.filter-dropdown');
                const col = dropdown.getAttribute('data-col');
                const val = e.target.value;
                if (e.target.checked) currentFilters[col].add(val);
                else currentFilters[col].delete(val);
                renderTable();
            }

            if (e.target.classList.contains('mobo-select')) {
                const id = String(e.target.value);
                if (e.target.checked) selectedIds.add(id);
                else selectedIds.delete(id);
                updateCompareUI();
            }
        });

        if (globalSearch) globalSearch.addEventListener('input', renderTable);

        featureSelectors.forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = e.target.getAttribute('data-col-index');
                dynamicFeatureKeys[idx] = e.target.value;
                currentFilters[`dyn${idx}`].clear();
                initFilterMenus(); // Rebuild menus for dynamic column
                renderTable();
            });
        });

        // Add click handlers for sortable headers
        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', () => {
                const column = header.getAttribute('data-sort');

                // Toggle direction if same column, otherwise default to asc
                if (currentSort.column === column) {
                    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.column = column;
                    currentSort.direction = 'asc';
                }

                // Update visual indicators
                document.querySelectorAll('.sort-indicator').forEach(ind => ind.textContent = '');
                const indicator = header.querySelector('.sort-indicator');
                if (indicator) {
                    indicator.textContent = currentSort.direction === 'asc' ? ' ▲' : ' ▼';
                }

                renderTable();
                saveStateToUrl();
            });
        });

        function updateCompareUI() {
            const count = selectedIds.size;
            if (selectedCountSpan) selectedCountSpan.innerText = count;
            if (selectedCountTop) selectedCountTop.innerText = count;
            if (compareBar) compareBar.style.display = count > 0 ? 'block' : 'none';
            if (compareBtnTop) compareBtnTop.disabled = count < 2;
        }

        const startCompare = () => {
            if (selectedIds.size < 2) {
                alert("Please select at least 2 motherboards to compare.");
                return;
            }
            window.location.href = '/compare?ids=' + Array.from(selectedIds).join(',');
        };

        if (compareBtn) compareBtn.addEventListener('click', startCompare);
        if (compareBtnTop) compareBtnTop.addEventListener('click', startCompare);

        if (clearSelectionBtn) {
            clearSelectionBtn.addEventListener('click', () => {
                selectedIds.clear();
                document.querySelectorAll('.mobo-select').forEach(cb => cb.checked = false);
                updateCompareUI();
            });
        }

        // New Helper Buttons
        const selectAllVisibleBtn = document.getElementById('selectAllVisibleBtn');
        const clearSelectionTopBtn = document.getElementById('clearSelectionTopBtn');

        if (selectAllVisibleBtn) {
            selectAllVisibleBtn.addEventListener('click', () => {
                document.querySelectorAll('.mobo-select').forEach(cb => {
                    cb.checked = true;
                    selectedIds.add(cb.value);
                });
                updateCompareUI();
            });
        }

        if (clearSelectionTopBtn) {
            clearSelectionTopBtn.addEventListener('click', () => {
                selectedIds.clear();
                document.querySelectorAll('.mobo-select').forEach(cb => cb.checked = false);
                updateCompareUI();
            });
        }

        // Modal Logic
        let bsModal = null;
        try {
            bsModal = new bootstrap.Modal(document.getElementById('scorecardModal'));
        } catch (e) {
            console.warn("Bootstrap Modal not found/loaded", e);
        }

        function showScorecard(id) {
            const m = MOBO_DATA.find(x => String(x.id) === String(id));
            if (!m) return;
            const sc = (m.specs && m.specs._scorecard) ? m.specs._scorecard : {};

            document.getElementById('scorecardModalLabel').innerText = `${m.brand} ${m.model}`;

            // Helper for boolean/check
            const setVal = (elmId, val) => {
                const el = document.getElementById(elmId);
                if (!el) return;
                el.innerText = val || '-';
            };
            const setBool = (elmId, val) => {
                const el = document.getElementById(elmId);
                if (!el) return;
                if (val === true || val === 'True' || val === 'Yes') {
                    el.innerHTML = '<i class="bi bi-check-lg text-success h5"></i>';
                } else {
                    el.innerHTML = '<i class="bi bi-x-lg text-muted h5"></i>';
                }
            };

            setVal('modal-lan', sc.lan_text);
            setVal('modal-wifi', sc.wireless);
            setVal('modal-audio', sc.audio);
            setBool('modal-usbc', sc.usbc_header);

            setVal('modal-vrm', sc.vrm_text + (sc.vrm_note ? ` (${sc.vrm_note})` : ''));
            setVal('modal-fans', sc.fan_count);
            setVal('modal-argb', sc.argb_count);
            setBool('modal-bios', sc.bios_flash_btn);

            if (bsModal) bsModal.show();
        }

        // Add click handlers for dynamic column sort icons
        document.querySelectorAll('.sortable-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                const column = icon.getAttribute('data-sort');

                if (currentSort.column === column) {
                    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.column = column;
                    currentSort.direction = 'asc';
                }

                document.querySelectorAll('.sort-indicator').forEach(ind => ind.textContent = '');
                const indicator = icon.nextElementSibling;
                if (indicator && indicator.classList.contains('sort-indicator')) {
                    indicator.textContent = currentSort.direction === 'asc' ? ' ▲' : ' ▼';
                }

                renderTable();
            });
        });

        // Initial Bootstrap
        loadStateFromUrl();
        initFilterMenus();
        renderTable();
    }
});
