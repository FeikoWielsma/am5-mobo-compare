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
            dyn2: new Set()
        };
        let dynamicFeatureKeys = {
            1: '',
            2: ''
        };

        // Helper: Access nested property
        function getNestedValue(obj, path) {
            if (!path) return '-';
            if (path in obj) return obj[path];
            const parts = path.split('|');
            let current = obj;
            for (const part of parts) {
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    return '-';
                }
            }
            return (current === null || current === undefined) ? '-' : current;
        }

        function getChipsetClass(c) {
            if (!c) return '';
            const clean = c.toLowerCase().replace(/[ ()]/g, '');
            return `badge-chipset badge-chipset-${clean}`;
        }

        function getFFClass(f) {
            if (!f) return '';
            const clean = f.toLowerCase().replace(/[ μu-]/g, 'm').replace(/m+/g, 'm');
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
                return true;
            });

            tableBody.innerHTML = '';
            filtered.forEach(m => {
                const tr = document.createElement('tr');
                tr.className = 'mobo-row';
                const dynVal1 = dynamicFeatureKeys[1] ? getNestedValue(m, dynamicFeatureKeys[1]) : '-';
                const dynVal2 = dynamicFeatureKeys[2] ? getNestedValue(m, dynamicFeatureKeys[2]) : '-';

                tr.innerHTML = `
                <td>
                    <input type="checkbox" class="mobo-select form-check-input" value="${m.id}" ${selectedIds.has(String(m.id)) ? 'checked' : ''}>
                </td>
                <td>${m.brand}</td>
                <td><span class="badge ${getChipsetClass(m.chipset)}">${m.chipset}</span></td>
                <td class="fw-bold">${m.model}</td>
                <td><span class="badge ${getFFClass(m.form_factor)}">${m.form_factor}</span></td>
                <td class="small text-muted">${dynVal1}</td>
                <td class="small text-muted">${dynVal2}</td>
            `;
                tableBody.appendChild(tr);
            });

            countDisplay.innerText = `${filtered.length} motherboards visible`;
            updateButtonLabels();
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
                    else val = m[col];
                    if (val !== null && val !== undefined) values.add(String(val));
                });

                const sortedValues = Array.from(values).sort();
                menu.innerHTML = `
                <div class="filter-search-container px-2">
                    <input type="text" class="form-control form-control-sm filter-search" placeholder="Search...">
                </div>
                <div class="filter-options-list px-2" style="max-height: 250px; overflow-y: auto;">
                    ${sortedValues.map(v => `
                        <label class="filter-option">
                            <input type="checkbox" class="filter-cb" value="${v}" ${currentFilters[col].has(v) ? 'checked' : ''}>
                            <span class="ms-2">${v}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="filter-actions px-2 border-top pt-2 mt-2">
                    <button class="btn btn-link btn-sm p-0 text-decoration-none filter-clear">Clear</button>
                    <button class="btn btn-link btn-sm p-0 text-decoration-none filter-all">All</button>
                </div>
            `;

                // Search Logic
                const search = menu.querySelector('.filter-search');
                search.addEventListener('input', (e) => {
                    const term = e.target.value.toLowerCase();
                    menu.querySelectorAll('.filter-option').forEach(opt => {
                        opt.style.display = opt.textContent.toLowerCase().includes(term) ? '' : 'none';
                    });
                });

                // Actions
                menu.querySelector('.filter-clear').onclick = (e) => {
                    e.stopPropagation();
                    currentFilters[col].clear();
                    menu.querySelectorAll('.filter-cb').forEach(cb => cb.checked = false);
                    renderTable();
                };
                menu.querySelector('.filter-all').onclick = (e) => {
                    e.stopPropagation();
                    sortedValues.forEach(v => currentFilters[col].add(v));
                    menu.querySelectorAll('.filter-cb').forEach(cb => cb.checked = true);
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

        // Initial Bootstrap
        initFilterMenus();
        renderTable();
    }
});
