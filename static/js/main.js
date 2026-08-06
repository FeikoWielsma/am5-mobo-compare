document.addEventListener('DOMContentLoaded', function () {
    if (typeof MOBO_DATA !== 'undefined') {
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

        // URL State Sync. State shaping and encoding live in table_logic.js;
        // this only moves it in and out of the address bar.
        function saveStateToUrl() {
            const state = buildViewState({
                filters: currentFilters,
                dynamicKeys: dynamicFeatureKeys,
                search: globalSearch.value,
                sort: currentSort
            });

            // Skip encoding if state is empty
            if (JSON.stringify(state).length === 2) {
                const url = new URL(window.location);
                url.searchParams.delete('v');
                window.history.replaceState({}, '', url);
                return;
            }

            try {
                const url = new URL(window.location);
                url.searchParams.set('v', encodeViewState(state));
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
                    const state = decodeViewState(encoded);

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

        function renderTable() {
            // Filtering and sorting live in table_logic.js.
            const filtered = sortMobos(
                filterMobos(MOBO_DATA, {
                    search: globalSearch.value,
                    filters: currentFilters,
                    dynamicKeys: dynamicFeatureKeys
                }),
                currentSort,
                dynamicFeatureKeys
            );

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
                <td><span class="badge ${chipsetBadgeClass(m.chipset)}">${m.chipset}</span></td>
                <td><span class="badge ${formFactorBadgeClass(m.form_factor)}">${m.form_factor}</span></td>
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

                const currentVal = dynamicFeatureKeys[idx] || '';
                const displayLabel = currentVal ? currentVal.split('|').pop() : 'Select...';

                th.innerHTML = `
                    <div class="d-flex align-items-center gap-2">
                        <div class="flex-grow-1 position-relative" style="min-width: 0;">
                             <!-- Visible Label (Mask) -->
                             <div class="form-select form-select-sm feature-label-mask text-truncate pe-4" 
                                  style="background-color: #fff;">${displayLabel}</div>
                             
                             <!-- Hidden Interactive Select -->
                             <select class="form-select form-select-sm feature-selector position-absolute top-0 start-0 opacity-0" 
                                     data-col-index="${idx}" style="cursor: pointer;">
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
                const label = th.querySelector('.feature-label-mask');
                sel.value = currentVal;

                // Bind Select Change
                sel.addEventListener('change', (e) => {
                    const newVal = e.target.value;
                    dynamicFeatureKeys[idx] = newVal;

                    // Update mask label
                    label.innerText = newVal ? newVal.split('|').pop() : 'Select...';

                    // Reset filter for this specific column
                    const dropdown = document.querySelector(`.filter-dropdown[data-col="${colKey}"]`);
                    if (dropdown) {
                        // Clear existing filter selection
                        if (currentFilters[colKey]) currentFilters[colKey].clear();

                        // Force re-initialization of menu
                        delete dropdown.dataset.initialized;

                        // Re-render menu content immediately
                        initFilterMenus();
                    }

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
                const availableValues = availableValuesFor(MOBO_DATA, targetCol, {
                    search: globalSearch.value,
                    filters: currentFilters,
                    dynamicKeys: dynamicFeatureKeys
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
                // Skip if already initialized (prevents resetting state/listeners on static columns)
                if (dropdown.dataset.initialized === 'true') return;

                const col = dropdown.getAttribute('data-col');
                const menu = dropdown.querySelector('.dropdown-menu');

                let values = new Set();
                MOBO_DATA.forEach(m => {
                    let val;
                    if (col.startsWith('dyn')) {
                        const idx = parseInt(col.substring(3));
                        val = dynamicFeatureKeys[idx] ? getNestedValue(m, dynamicFeatureKeys[idx]) : null;
                    } else {
                        val = m[col];
                    }
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
                        const idx = parseInt(col.replace('dyn', ''));
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
                            <input type="checkbox" class="filter-cb" value="${v}" ${currentFilters[col] && currentFilters[col].has(v) ? 'checked' : ''}>
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

                // Mark as initialized
                dropdown.dataset.initialized = 'true';
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
            const sc = m._scorecard || {};

            document.getElementById('scorecardModalLabel').innerText = `${m.brand} ${m.model}`;

            const setVal = (elmId, val) => {
                const el = document.getElementById(elmId);
                if (!el) return;
                el.innerText = val || '-';
            };

            const setHtml = (elmId, html) => {
                const el = document.getElementById(elmId);
                if (!el) return;
                el.innerHTML = html || '-';
            };

            const getBoolIcon = (val) => {
                if (val === true || val === 'True' || val === 'Yes' || val === 1) {
                    return '<i class="bi bi-check-circle-fill text-success"></i>';
                }
                return '<i class="bi bi-x-circle text-muted"></i>';
            };

            // Connectivity
            // Connectivity
            // LAN: Show badges if available, else text
            const lanEl = document.getElementById('modal-lan');
            if (lanEl) {
                if (sc.lan_badges && sc.lan_badges.length > 0) {
                    lanEl.innerHTML = `
                        <div class="d-flex flex-wrap gap-1 align-items-center">
                            <span class="small me-1">${sc.lan_text || ''}</span>
                            ${sc.lan_badges.map(b =>
                        `<span class="badge ${b.color}" title="${b.name}">${b.label}</span>`
                    ).join('')}
                        </div>
                    `;
                } else {
                    lanEl.innerText = sc.lan_text || '-';
                }
            }

            setVal('modal-wifi', sc.wireless);
            setVal('modal-audio', sc.audio);
            setHtml('modal-usbc', getBoolIcon(sc.usbc_header));
            setHtml('modal-usbc', getBoolIcon(sc.usbc_header));

            // Diagnostics & Flash
            const diagEl = document.getElementById('modal-bios'); // Reusing the element ID, label changed in HTML
            if (diagEl) {
                let diagHtml = '';

                // BIOS Flash Button
                if (sc.bios_flash_btn) {
                    diagHtml += '<i class="bi bi-lightning-charge-fill text-warning me-2" title="BIOS Flash Button"></i>';
                }

                // Debug Features
                // Score: 1=Power LED, 2=Debug LED, 3=POST Code, 4=LCD
                const dScore = sc.debug_score || 0;

                if (dScore >= 4) {
                    diagHtml += '<i class="bi bi-display text-info me-2" title="LCD Display"></i>';
                } else if (dScore === 3) {
                    diagHtml += '<i class="bi bi-card-text text-primary me-2" title="POST Code"></i>';
                } else if (dScore === 2) {
                    diagHtml += '<i class="bi bi-lightbulb-fill text-danger me-2" title="Debug LED(s)"></i>';
                } else if (dScore === 1) {
                    diagHtml += '<i class="bi bi-power text-secondary me-2" title="Power LED"></i>';
                }

                if (!diagHtml) diagHtml = '<span class="text-muted">-</span>';
                diagEl.innerHTML = diagHtml;
            }

            // Power & Cooling
            setVal('modal-vrm', sc.vrm_text);
            setVal('modal-vcore', sc.vcore_text);
            setVal('modal-fans', sc.fan_count);
            setVal('modal-argb', sc.argb_count);

            // Storage (M.2)
            const m2List = document.getElementById('modal-m2-list');
            if (m2List) {
                const details = sc.m2_details || [];
                m2List.innerHTML = details.length > 0
                    ? `<div class="fw-bold mb-1">${sc.m2_total} Total</div>` + details.map(d => `<div class="text-muted">• ${d}</div>`).join('')
                    : '<span class="text-muted">No details available</span>';
            }

            // Expansion (PCIe)
            const pcieList = document.getElementById('modal-pcie-list');
            if (pcieList) {
                const details = sc.pcie_x16_details || [];
                pcieList.innerHTML = details.length > 0
                    ? `<div class="fw-bold mb-1">${sc.pcie_x16_total} Total</div>` + details.map(d => `<div class="text-muted">• ${d}</div>`).join('')
                    : '<span class="text-muted">No details available</span>';
            }

            // USB Configuration
            setVal('modal-usb-total', sc.usb_ports_total);
            const usbBadgeCont = document.getElementById('modal-usb-badges');
            if (usbBadgeCont) {
                usbBadgeCont.innerHTML = '';
                const usb = sc.usb_details || {};

                // Colours, labels, tooltips and order all come from
                // USB_SPEED_BADGES (services/spec_display.py), shared with the
                // compare table. The "(C)" suffix is added here because this
                // modal lists both connector types in one row; the compare
                // table splits them into labelled A:/C: rows and so has no
                // need for it.
                const badgeSpec = (key) =>
                    (typeof USB_SPEED_BADGES !== 'undefined' ? USB_SPEED_BADGES : [])
                        .find(b => b.key === key);

                const addBadge = (count, key, suffix = '') => {
                    if (!count) return;
                    const spec = badgeSpec(key);
                    if (!spec) return;
                    const span = document.createElement('span');
                    span.className = `badge ${spec.class}`;
                    span.title = spec.title;
                    span.innerText = `${count}x ${spec.label}${suffix}`;
                    usbBadgeCont.appendChild(span);
                };

                const ta = usb.type_a || {};
                USB_TYPE_A_KEYS.forEach(key => addBadge(ta[key], key));

                const tc = usb.type_c || {};
                USB_TYPE_C_KEYS.forEach(key => addBadge(tc[key], key, ' (C)'));
            }

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
