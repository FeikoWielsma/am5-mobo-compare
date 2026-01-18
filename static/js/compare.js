/**
 * Compare page functionality
 * - Collapsible sections and subsections with localStorage persistence
 * - Advanced Animations: Fold + Fly Badge + Fly Back
 * - Hide rows where all values are identical
 * - Highlight cells: green for "better", yellow for "different"
 */

// Collapsed state
let collapsedSections = new Set();
let collapsedSubsections = new Set();

// Field-specific comparison rules are now in parsers.js (FIELD_RULES)

let allMobos = []; // Store fetched mobos for search

document.addEventListener('DOMContentLoaded', () => {
    initStandardMode();
});


function initStandardMode() {
    // Initial Bind
    bindEvents();

    // Fetch Mobo List for Search
    fetch('/api/mobos')
        .then(response => response.json())
        .then(data => {
            allMobos = data;
            initSearch();
        })
        .catch(err => console.error('Failed to fetch mobos for search', err));
}

function initSearch() {
    const sInput = document.getElementById('moboSearch');
    const sDropdown = document.getElementById('searchDropdown');

    if (sInput && sDropdown) {
        sInput.addEventListener('input', (e) => {
            const queryWords = e.target.value.toLowerCase().split(/\s+/).filter(w => w.length > 0);
            if (queryWords.length === 0) {
                sDropdown.style.display = 'none';
                return;
            }

            const currentIds = new URLSearchParams(window.location.search).get('ids')?.split(',') || [];
            const matches = allMobos.filter(m => {
                const brand = (m.Brand || m.brand || "").toLowerCase();
                const model = (m.Model || m.model || "").toLowerCase();
                const chipset = (m.Chipset || m.chipset || "").toLowerCase();
                const combined = `${brand} ${model} ${chipset}`;
                return queryWords.every(word => combined.includes(word)) && !currentIds.includes(String(m.id));
            }).slice(0, 10);

            if (matches.length > 0) {
                sDropdown.innerHTML = '';
                matches.forEach(m => {
                    const item = document.createElement('div');
                    item.className = 'dropdown-item p-2 border-bottom';
                    const brand = m.Brand || m.brand;
                    const model = m.Model || m.model;
                    const chipset = m.Chipset || m.chipset;
                    const ff = m.FormFactor || m.form_factor;

                    const getChipsetClass = (c) => {
                        if (!c) return '';
                        const clean = c.toLowerCase().replace(/[ ()]/g, '');
                        return `badge-chipset badge-chipset-${clean}`;
                    };
                    const getFFClass = (f) => {
                        if (!f) return '';
                        let normalized = f.toLowerCase();
                        normalized = normalized.replace(/atx-b$/i, 'atx');
                        normalized = normalized.replace(/bkb itx/i, 'mini-itx');
                        normalized = normalized.replace(/[μu]-atx-b/i, 'matx');
                        normalized = normalized.replace(/[μu]-atx/i, 'matx');
                        normalized = normalized.replace(/e-atx/i, 'eatx');
                        const clean = normalized.replace(/[ -]/g, '');
                        return `badge-ff badge-ff-${clean}`;
                    };

                    item.innerHTML = `
                        <div class="fw-bold">${brand} ${model}</div>
                        <div class="mt-1">
                            <span class="badge ${getChipsetClass(chipset)}">${chipset}</span>
                            <span class="badge ${getFFClass(ff)}">${ff || '-'}</span>
                        </div>
                    `;
                    item.addEventListener('click', () => {
                        addMobo(m.id);
                        sInput.value = '';
                        sDropdown.style.display = 'none';
                    });
                    sDropdown.appendChild(item);
                });
                sDropdown.style.display = 'block';
            } else {
                sDropdown.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!sInput.contains(e.target) && !sDropdown.contains(e.target)) {
                sDropdown.style.display = 'none';
            }
        });
    }
}

/**
 * Bind all event listeners to static and dynamic elements
 */
function bindEvents() {
    const hideSameToggle = document.getElementById('hideSameToggle');
    const highlightDiffToggle = document.getElementById('highlightDiffToggle');
    const table = document.getElementById('compareTable');

    if (!table) return;

    // Re-bind Toggle Listeners (remove old ones first to allow re-binding safely if we were not replacing the toolbar)
    // Actually, toolbar is outside table container, so it persists? 
    // Wait, the HTML structure shows toolbar is outside .table-container. 
    // So we don't need to re-bind toolbar toggles if we only replace table.

    // HOWEVER, we do need to re-analyze table for highlights and hiding same rows
    analyzeTable();
    applySectionCollapse(false);
    applySubsectionCollapse(false);

    // If toggles were checked, re-apply their effects
    if (hideSameToggle && hideSameToggle.checked) updateVisibility();
    if (highlightDiffToggle && highlightDiffToggle.checked) updateHighlights();

    // Re-bind Toggle Events
    hideSameToggle.addEventListener('change', updateVisibility);
    highlightDiffToggle.addEventListener('change', updateHighlights);

    // Section Headers (delegation or re-bind)
    // Since we replace the table, we need to Re-bind these.
    // Cleanest way is to just find them again.
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (!e.target.classList.contains('subsection-badge')) {
                const section = header.getAttribute('data-section');
                toggleSection(section);
            }
        });
    });

    // Subsection Headers
    document.querySelectorAll('.subsection-header').forEach(header => {
        header.addEventListener('click', () => {
            const subsection = header.getAttribute('data-subsection');
            toggleSubsection(subsection);
        });
    });

    // Remove Buttons
    document.querySelectorAll('.remove-mobo-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-mobo-id');
            removeMobo(id);
        });
    });

    // Tooltips
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el, {
        placement: 'top',
        trigger: 'hover focus'
    }));
}

/**
 * Add a motherboard ID to the comparison
 */
function addMobo(id) {
    const params = new URLSearchParams(window.location.search);
    let ids = params.get('ids') ? params.get('ids').split(',') : [];

    if (!ids.includes(id.toString())) {
        ids.push(id);
        updateComparison(ids);
    }
}

/**
 * Remove a motherboard ID from the comparison
 */
function removeMobo(id) {
    const params = new URLSearchParams(window.location.search);
    let ids = params.get('ids') ? params.get('ids').split(',') : [];

    ids = ids.filter(x => x !== id.toString());
    updateComparison(ids);
}

/**
 * Update URL and Fetch new table
 */
function updateComparison(ids) {
    const params = new URLSearchParams(window.location.search);
    params.set('ids', ids.join(','));
    const newUrl = `${window.location.pathname}?${params.toString()}`;

    // Push State
    history.pushState({ ids: ids }, '', newUrl);

    // Fetch
    fetchTable(newUrl);
}

window.addEventListener('popstate', (e) => {
    fetchTable(window.location.href);
});

/**
 * Fetch the compare page HTML and extract the table to replace
 */
function fetchTable(url) {
    const tableContainer = document.querySelector('.table-container');
    tableContainer.style.opacity = '0.5'; // Loading indicator

    fetch(url)
        .then(response => response.text())
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const newTable = doc.getElementById('compareTable');

            if (newTable) {
                const currentTable = document.getElementById('compareTable');
                if (currentTable) {
                    currentTable.replaceWith(newTable);
                    bindEvents(); // Re-bind everything
                }
            }
            tableContainer.style.opacity = '1';
        })
        .catch(err => {
            console.error('Failed to update table', err);
            tableContainer.style.opacity = '1';
        });
}

/**
 * Load collapsed state from localStorage
 */

/**
 * Load collapsed state from localStorage
 */
function loadCollapsedState() {
    try {
        const savedSections = localStorage.getItem('collapsedSections');
        const savedSubsections = localStorage.getItem('collapsedSubsections');

        if (savedSections) collapsedSections = new Set(JSON.parse(savedSections));
        if (savedSubsections) collapsedSubsections = new Set(JSON.parse(savedSubsections));
    } catch (e) {
        console.error('Failed to load collapsed state:', e);
        collapsedSections = new Set();
        collapsedSubsections = new Set();
    }
}

function saveCollapsedState() {
    localStorage.setItem('collapsedSections', JSON.stringify([...collapsedSections]));
    localStorage.setItem('collapsedSubsections', JSON.stringify([...collapsedSubsections]));
}

/**
 * Toggle a section's collapse state
 */
function toggleSection(sectionName) {
    if (collapsedSections.has(sectionName)) {
        collapsedSections.delete(sectionName);
    } else {
        collapsedSections.add(sectionName);
    }

    saveCollapsedState();
    applySectionCollapse(true); // Animate
    applySubsectionCollapse(false);
}

/**
 * Toggle a subsection's collapse state with ANIMATION
 */
function toggleSubsection(subsectionId) {
    const header = document.querySelector(`.subsection-header[data-subsection="${subsectionId}"]`);
    if (!header) return;

    // Determine action: collapsing or expanding
    const isCollapsing = !collapsedSubsections.has(subsectionId);

    if (isCollapsing) {
        // Capture coordinates BEFORE folding
        const titleCell = header.querySelector('th');
        const startRect = titleCell.getBoundingClientRect();

        // 1. Fold rows
        animateFold(header, () => {
            // 2. Add to state
            collapsedSubsections.add(subsectionId);
            saveCollapsedState();

            // 3. Fly Badge
            animateFlyBadge(header, subsectionId, startRect, () => {
                applySubsectionCollapse(false);
            });
        });

    } else {
        // EXPANDING

        // 1. Auto-expand Parent first
        const parentId = header.getAttribute('data-parent');

        if (collapsedSections.has(parentId)) {
            collapsedSections.delete(parentId);
            saveCollapsedState();
            applySectionCollapse(true);
        }

        // 2. Find badge for Fly Back
        const parentBadgeContainer = document.querySelector(`.collapsed-subsections-badge[data-parent="${parentId}"]`);
        const badge = parentBadgeContainer ? parentBadgeContainer.querySelector(`[data-subsection-id="${subsectionId}"]`) : null;

        if (badge) {
            animateFlyBack(badge, header, () => {
                collapsedSubsections.delete(subsectionId);
                saveCollapsedState();
                applySubsectionCollapse(false);
            });
        } else {
            collapsedSubsections.delete(subsectionId);
            saveCollapsedState();
            applySubsectionCollapse(false);
        }
    }
}

/**
 * Animate the folding of a subsection (header + content)
 */
function animateFold(headerRow, callback) {
    const rowsToAnimate = [headerRow];
    let next = headerRow.nextElementSibling;
    while (next && !next.classList.contains('subsection-header') && !next.classList.contains('section-header')) {
        rowsToAnimate.push(next);
        next = next.nextElementSibling;
    }

    // Add class to force styles for transition
    rowsToAnimate.forEach(row => {
        row.classList.add('row-fold-transition');
    });

    // Force reflow
    void headerRow.offsetWidth;

    // Add fold class to trigger CSS transition
    rowsToAnimate.forEach(row => {
        row.classList.add('row-folded');
    });

    // Wait for transition end
    setTimeout(() => {
        rowsToAnimate.forEach(row => {
            row.classList.remove('row-fold-transition', 'row-folded'); // Cleanup classes
            row.style.display = 'none'; // Actually hide
        });
        if (callback) callback();
    }, 300); // Match CSS duration
}


/**
 * Fly a badge from the subsection header to the parent container
 */
function animateFlyBadge(headerRow, subsectionId, startRect, callback) {
    // Determine subsection name for the badge
    const subsectionName = subsectionId.split('-').slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const flyer = document.createElement('span');
    flyer.className = 'badge bg-secondary flying-badge';
    flyer.textContent = `+ ${subsectionName}`;
    flyer.style.fontSize = '0.7em';
    flyer.style.position = 'fixed';
    flyer.style.zIndex = '9999';
    flyer.style.transition = 'all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    flyer.style.pointerEvents = 'none';

    // Initial Position (from captured rect)
    const startTop = startRect.top + (startRect.height / 2) - 10;
    const startLeft = startRect.left + 30; // Offset for chevron

    flyer.style.top = `${startTop}px`;
    flyer.style.left = `${startLeft}px`;

    document.body.appendChild(flyer);

    // Get Target position
    const parentId = headerRow.getAttribute('data-parent');
    const parentBadgeContainer = document.querySelector(`.collapsed-subsections-badge[data-parent="${parentId}"]`);

    if (!parentBadgeContainer) {
        flyer.remove();
        if (callback) callback();
        return;
    }

    let targetLeft, targetTop;

    // Calculate Target Position
    if (parentBadgeContainer.children.length > 0) {
        // If badges exist, aim after the last one
        const lastBadge = parentBadgeContainer.lastElementChild;
        const lastRect = lastBadge.getBoundingClientRect();
        targetLeft = lastRect.right + 5;
        targetTop = lastRect.top + (lastRect.height / 2) - 10;
    } else {
        // If empty, use Range API to measure text node
        const parentHeaderTh = parentBadgeContainer.closest('th');
        const icon = parentHeaderTh.querySelector('i');

        if (icon && icon.nextSibling) {
            const range = document.createRange();
            range.selectNode(icon.nextSibling);
            const textRect = range.getBoundingClientRect();

            targetLeft = textRect.right + 10;
            targetTop = textRect.top + (textRect.height / 2) - 10;

            if (targetLeft === 0 || textRect.width === 0) {
                const cRect = parentBadgeContainer.getBoundingClientRect();
                targetLeft = cRect.left;
                targetTop = cRect.top;
            }
        } else {
            const cRect = parentBadgeContainer.getBoundingClientRect();
            targetLeft = cRect.left;
            targetTop = cRect.top;
        }
    }

    // Force reflow
    void flyer.offsetWidth;

    // Move to Target
    flyer.style.top = `${targetTop}px`;
    flyer.style.left = `${targetLeft}px`;
    flyer.style.opacity = '1';

    // Cleanup
    setTimeout(() => {
        flyer.remove();
        if (callback) callback();
    }, 600);
}

/**
 * Animate badge flying back to header (Expand)
 */
function animateFlyBack(badgeElement, headerRow, callback) {
    const sourceRect = badgeElement.getBoundingClientRect();

    // Temporarily measure target
    headerRow.style.display = '';
    headerRow.style.visibility = 'hidden';

    const titleCell = headerRow.querySelector('th');
    const targetRect = titleCell.getBoundingClientRect();

    headerRow.style.display = 'none';
    headerRow.style.visibility = '';

    const flyer = badgeElement.cloneNode(true);
    flyer.classList.remove('badge-pop-in');
    flyer.classList.add('flying-badge');
    flyer.style.position = 'fixed';
    flyer.style.zIndex = '9999';
    flyer.style.margin = '0';
    flyer.style.transition = 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)';

    flyer.style.top = `${sourceRect.top}px`;
    flyer.style.left = `${sourceRect.left}px`;
    flyer.style.width = `${sourceRect.width}px`;
    flyer.style.height = `${sourceRect.height}px`;
    flyer.style.display = 'flex';
    flyer.style.alignItems = 'center';
    flyer.style.justifyContent = 'center';

    document.body.appendChild(flyer);

    badgeElement.style.opacity = '0';

    const targetTop = targetRect.top + (targetRect.height / 2) - (sourceRect.height / 2);
    const targetLeft = targetRect.left + 30;

    void flyer.offsetWidth;

    flyer.style.top = `${targetTop}px`;
    flyer.style.left = `${targetLeft}px`;
    flyer.style.opacity = '0';
    flyer.style.transform = 'scale(1.1)';

    setTimeout(() => {
        flyer.remove();
        if (callback) callback();
    }, 500);
}


/**
 * Apply collapsed state to all sections
 */
function applySectionCollapse(animate = false) {
    document.querySelectorAll('.section-header').forEach(header => {
        const section = header.getAttribute('data-section');
        const icon = header.querySelector('i');
        const isCollapsed = collapsedSections.has(section);

        if (icon) {
            icon.className = isCollapsed ? 'bi bi-chevron-right' : 'bi bi-chevron-down';
        }

        let currentRow = header.nextElementSibling;
        while (currentRow && !currentRow.classList.contains('section-header')) {
            if (isCollapsed) {
                currentRow.style.display = 'none';
            } else {
                if (!currentRow.getAttribute('data-hidden-by-filter')) {
                    currentRow.style.display = '';
                }
            }
            currentRow = currentRow.nextElementSibling;
        }
    });
}

/**
 * Apply collapsed state to subsections + Diff-based Badge Update
 */
function applySubsectionCollapse(animate = false) {
    document.querySelectorAll('.subsection-header').forEach(header => {
        const subsection = header.getAttribute('data-subsection');
        const icon = header.querySelector('i');
        const isCollapsed = collapsedSubsections.has(subsection);

        if (icon) {
            icon.className = isCollapsed ? 'bi bi-chevron-right' : 'bi bi-chevron-down';
        }

        const parentSection = header.getAttribute('data-parent');
        const parentIsCollapsed = collapsedSections.has(parentSection);

        if (parentIsCollapsed) {
            // Keep hidden
        } else {
            if (isCollapsed) {
                header.style.display = 'none';

                let next = header.nextElementSibling;
                while (next && !next.classList.contains('subsection-header') && !next.classList.contains('section-header')) {
                    next.style.display = 'none';
                    next = next.nextElementSibling;
                }
            } else {
                header.style.display = '';

                let next = header.nextElementSibling;
                while (next && !next.classList.contains('subsection-header') && !next.classList.contains('section-header')) {
                    if (!next.getAttribute('data-hidden-by-filter')) {
                        next.style.display = '';
                    }
                    next = next.nextElementSibling;
                }
            }
        }
    });

    updateParentSectionBadges();
}

/**
 * Smart Badge Update to avoid blinking
 */
function updateParentSectionBadges() {
    document.querySelectorAll('.collapsed-subsections-badge').forEach(badgeContainer => {
        const parentSection = badgeContainer.getAttribute('data-parent');

        const expectedSubsections = [...collapsedSubsections]
            .filter(sub => sub.startsWith(parentSection + '-'))
            .sort();

        const currentBadges = Array.from(badgeContainer.children);

        currentBadges.forEach(badge => {
            const id = badge.getAttribute('data-subsection-id');
            if (!expectedSubsections.includes(id)) {
                badge.remove();
            }
        });

        expectedSubsections.forEach(subId => {
            if (!badgeContainer.querySelector(`[data-subsection-id="${subId}"]`)) {
                const subsectionName = subId.split('-').slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                const badge = document.createElement('span');
                badge.className = 'badge bg-secondary subsection-badge ms-2';
                badge.setAttribute('data-subsection-id', subId);
                badge.textContent = `+ ${subsectionName}`;
                badge.style.fontSize = '0.7em';
                badge.style.cursor = 'pointer';
                badge.title = `Click to expand ${subsectionName}`;
                badge.classList.add('badge-pop-in');

                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSubsection(subId);
                });

                badgeContainer.appendChild(badge);
            }
        });
    });
}

// Parsing functions (parseValue, parseVRM, etc.) are moved to parsers.js

/**
 * Analyze table and mark rows/cells based on better/worse values with gradient coloring
 */
function analyzeTable() {
    const table = document.getElementById('compareTable');
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        const firstCell = row.querySelector('th, td');
        if (!firstCell || firstCell.hasAttribute('colspan')) {
            return;
        }

        // Get field name from first cell to check if it should be ignored
        const headerText = firstCell.textContent.trim();
        const fieldName = headerText.toLowerCase();
        const shouldIgnore = FIELD_RULES.ignored_fields.some(ignored =>
            fieldName.includes(ignored)
        );

        const dataCells = Array.from(row.querySelectorAll('td'));

        if (dataCells.length === 0) return;

        const values = dataCells.map(cell => ({
            text: cell.textContent.trim(),
            cell: cell
        }));

        // Normalize: treat empty and '-' as distinct empty value (not ignored)
        const normalizedTexts = values.map(v =>
            v.text === '' || v.text === '-' ? '___EMPTY___' : v.text
        );

        // Check if all values are the same
        const allSame = normalizedTexts.every(v => v === normalizedTexts[0]);

        if (allSame) {
            row.setAttribute('data-all-same', 'true');
        } else {
            row.setAttribute('data-has-diff', 'true');

            // Skip highlighting if this field is ignored
            if (shouldIgnore) {
                return;
            }

            // Count occurrences of each value to find majority vs minority
            const valueCounts = {};
            normalizedTexts.forEach(v => {
                valueCounts[v] = (valueCounts[v] || 0) + 1;
            });

            // Find the most common value (majority)
            let majorityValue = null;
            let maxCount = 0;
            for (const [value, count] of Object.entries(valueCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    majorityValue = value;
                }
            }

            // Try VRM parsing first for phase config fields
            // Explicitly exclude "vcore" to let parseValue handle component scoring
            const isVRMField = (fieldName.includes('phase') || fieldName.includes('vrm')) && !fieldName.includes('vcore');

            const parsedValues = values.map(v => {
                // 1. Check for Server-Side Score (HTML attribute)
                const serverScoreEl = v.cell.querySelector('[data-server-score]');
                if (serverScoreEl) {
                    const score = parseFloat(serverScoreEl.getAttribute('data-score'));
                    // If score is 0, it might be non-numeric or just 0, but we treat as number for sorting
                    return { text: v.text, score: score, isNumeric: true };
                }

                // Try VRM parser first if it's a VRM-related field
                if (isVRMField) {
                    const vrmParsed = parseVRM(v.text);
                    if (vrmParsed) return vrmParsed;
                }

                // Check for custom rank
                const customRank = getCustomRank(fieldName, v.text);
                if (customRank !== null) {
                    return { text: v.text, score: customRank, isNumeric: true, isCustomRank: true };
                }

                // Fall back to default parser
                return parseValue(v.text, headerText);
            });
            const hasNumeric = parsedValues.some(pv => pv && pv.isNumeric);

            if (hasNumeric) {
                // Extract numeric scores (treat non-numeric as -Infinity)
                const scores = parsedValues.map(pv => pv && pv.isNumeric ? pv.score : -Infinity);

                // Check if lower is better for this field (e.g., price)
                const lowerIsBetter = isLowerBetter(fieldName);

                const maxScore = lowerIsBetter ? Math.min(...scores.filter(s => s !== -Infinity)) : Math.max(...scores);
                const minScore = lowerIsBetter ? Math.max(...scores) : Math.min(...scores.filter(s => s !== -Infinity));

                // For numeric fields, find majority based on SCORES, not text
                const scoreCounts = {};
                scores.forEach(s => {
                    if (s !== -Infinity) {
                        scoreCounts[s] = (scoreCounts[s] || 0) + 1;
                    }
                });

                let majorityScore = null;
                let maxScoreCount = 0;
                for (const [score, count] of Object.entries(scoreCounts)) {
                    if (count > maxScoreCount) {
                        maxScoreCount = count;
                        majorityScore = parseFloat(score);
                    }
                }

                // Only apply outlier detection if there's a clear majority (count > 1)
                const useMajorityFiltering = maxScoreCount > 1;

                // Calculate gradient color for each cell
                dataCells.forEach((cell, index) => {
                    const parsed = parsedValues[index];
                    const normalized = normalizedTexts[index];

                    // Format LAN Display if applicable
                    if (fieldName.includes('lan controller') && parsed && parsed.isNumeric && typeof LAN_SCORES !== 'undefined') {
                        formatLANDisplay(cell, parsed.text);
                    }

                    // Empty/missing values get marked as differs
                    if (!parsed || parsed.text === '' || parsed.text === '-') {
                        cell.setAttribute('data-differs', 'true');
                        cell.setAttribute('data-gradient', 'missing');
                        return;
                    }

                    if (parsed.isNumeric) {
                        const score = parsed.score;

                        // Only check if outlier when there's a clear majority AND the majority is either best or worst.
                        // If majority is a "middle" value, we want to show its color relative to others.
                        if (useMajorityFiltering) {
                            const majorityIsExtreme = (majorityScore === minScore || majorityScore === maxScore);

                            if (majorityIsExtreme) {
                                const isOutlier = score !== majorityScore;
                                if (!isOutlier) {
                                    // Don't highlight majority values
                                    return;
                                }
                            }
                        }

                        if (score === maxScore) {
                            // Best value - green
                            cell.setAttribute('data-best', 'true');
                            cell.setAttribute('data-gradient', 'custom');
                            cell.setAttribute('data-bg-color', 'rgba(184, 243, 184, 0.5)');
                            cell.setAttribute('data-border-color', '3px solid #28a745');
                            cell.setAttribute('data-font-weight', '700');
                        } else if (maxScore === minScore) {
                            // All values are the same (edge case)
                            cell.setAttribute('data-differs', 'true');
                            cell.setAttribute('data-gradient', 'custom');
                            cell.setAttribute('data-bg-color', 'rgba(255, 249, 230, 0.5)');
                            cell.setAttribute('data-border-color', '3px solid #ffc107');
                            cell.setAttribute('data-font-weight', '500');
                        } else {
                            // Excel-style dynamic color gradient

                            // Use RANK-based interpolation instead of LINEAR interpolation
                            // This ensures that "tiers" of values are visually distinct even if numeric gaps are tiny
                            // (e.g. 5x16+5x8 vs 5x16+3x2) or huge.
                            const uniqueScores = [...new Set(scores.filter(s => s !== -Infinity))].sort((a, b) => a - b);
                            const rankIndex = uniqueScores.indexOf(score);
                            const maxRank = uniqueScores.length - 1;

                            // Avoid division by zero if only one unique value exists (though handled by maxScore===minScore above)
                            const position = maxRank > 0 ? rankIndex / maxRank : 1;

                            // Interpolate colors: Red (0) -> Yellow (0.5) -> Green (1)
                            let r, g, b;
                            if (position < 0.5) {
                                // Red to Yellow
                                const t = position * 2; // 0 to 1
                                r = 255;
                                g = Math.round(100 + (255 - 100) * t);
                                b = Math.round(100 + (150 - 100) * t);
                            } else {
                                // Yellow to Green
                                const t = (position - 0.5) * 2; // 0 to 1
                                r = Math.round(255 - (255 - 150) * t);
                                g = 255;
                                b = Math.round(150 + (200 - 150) * t);
                            }

                            // Subtle background color (40% opacity)
                            cell.setAttribute('data-bg-color', `rgba(${r}, ${g}, ${b}, 0.4)`);

                            // Border color based on position
                            const borderR = Math.round(r * 0.7);
                            const borderG = Math.round(g * 0.7);
                            const borderB = Math.round(b * 0.7);
                            cell.setAttribute('data-border-color', `3px solid rgb(${borderR}, ${borderG}, ${borderB})`);
                            cell.setAttribute('data-font-weight', position > 0.7 ? '600' : '500');

                            cell.setAttribute('data-gradient', 'custom');
                            cell.setAttribute('data-differs', 'true');
                        }
                    } else {
                        cell.setAttribute('data-differs', 'true');
                        cell.setAttribute('data-gradient', 'custom');
                    }
                });
            } else {
                // Non-numeric: mark different values (outliers only)
                dataCells.forEach((cell, index) => {
                    const normalized = normalizedTexts[index];
                    const isOutlier = normalized !== majorityValue;

                    if (isOutlier) {
                        cell.setAttribute('data-differs', 'true');
                        if (normalizedTexts[index] === '___EMPTY___') {
                            cell.setAttribute('data-gradient', 'missing');
                        } else {
                            cell.setAttribute('data-gradient', 'custom');
                        }
                    }
                });
            }
        }
    });
}

// LAN helpers (normalizeLANText, getLanControllers) are moved to parsers.js

/**
 * Format LAN Controller cell to show badges and split lines per controller
 */
/**
 * Format LAN Controller cell to show badges and split lines per controller
 */
function formatLANDisplay(cell, text) {
    // 1. Try Server-Side IDs first (Canonical) for BADGES
    const lanIdsRaw = cell.getAttribute('data-lan-ids');
    let foundControllers = [];

    if (lanIdsRaw) {
        try {
            const ids = JSON.parse(lanIdsRaw);
            // Map IDs to objects with speed from global lookup
            if (ids && ids.length > 0) {
                foundControllers = ids.map(id => {
                    return {
                        name: id,
                        speed: (typeof LAN_SCORES !== 'undefined') ? (LAN_SCORES[id] || 0) : 0
                    };
                });
            }
        } catch (e) {
            console.error('Failed to parse data-lan-ids', e);
        }
    }

    // Sort by speed desc for badge order
    if (foundControllers.length > 0) {
        foundControllers.sort((a, b) => b.speed - a.speed);
    }

    // Build Badges HTML
    let badgesHtml = '';

    // Helper for specific text label if needed
    const getLabel = (speed) => {
        if (speed >= 10000) return '10G';
        if (speed >= 5000) return '5G';
        if (speed >= 2500) return '2.5G';
        return '1G';
    };

    foundControllers.forEach(c => {
        const speedLabel = getLabel(c.speed);
        let badgeClass = 'bg-secondary';

        if (c.speed >= 10000) badgeClass = 'bg-danger';
        else if (c.speed >= 5000) badgeClass = 'bg-warning text-dark';
        else if (c.speed >= 2500) badgeClass = 'bg-info text-dark';

        let displayLabel = speedLabel;
        if (c.speed > 10000 && c.speed !== 20000 && c.speed !== 10000) displayLabel = 'Fast'; // Guard for weird speeds

        // Add badge with tooltip showing canonical name
        badgesHtml += `<span class="badge ${badgeClass}" title="${c.name}">${displayLabel}</span>`;
    });

    // Final HTML: Original Text + Canonical Badges (Inline)
    // Using flex-wrap to handle long text gracefully
    let finalHtml = `
        <div class="d-flex align-items-center justify-content-center flex-wrap gap-2">
            <span class="small">${text}</span>
            ${badgesHtml}
        </div>
    `;

    // If no controllers found, just return (keeps original text)
    if (foundControllers.length === 0) return;

    cell.innerHTML = finalHtml;
}

/**
 * Update visibility based on "Hide Identical" toggle
 */
function updateVisibility() {
    const hideSameToggle = document.getElementById('hideSameToggle');
    const table = document.getElementById('compareTable');
    const tbody = table.querySelector('tbody');

    if (hideSameToggle.checked) {
        tbody.querySelectorAll('tr[data-all-same="true"]').forEach(row => {
            row.style.display = 'none';
            row.setAttribute('data-hidden-by-filter', 'true');
        });

        const sectionRows = tbody.querySelectorAll('tr.table-secondary, tr.table-light');
        sectionRows.forEach(sectionRow => {
            let nextRow = sectionRow.nextElementSibling;
            let hasVisibleChildren = false;

            while (nextRow && !nextRow.classList.contains('table-secondary') && !nextRow.classList.contains('table-light')) {
                if (nextRow.style.display !== 'none') {
                    hasVisibleChildren = true;
                    break;
                }
                nextRow = nextRow.nextElementSibling;
            }

            if (!hasVisibleChildren && !sectionRow.classList.contains('section-header')) {
                sectionRow.style.display = 'none';
            }
        });
    } else {
        tbody.querySelectorAll('tr').forEach(row => {
            row.removeAttribute('data-hidden-by-filter');
        });

        applySectionCollapse();
        applySubsectionCollapse();
    }
}

/**
 * Update highlights based on "Highlight Differences" toggle
 */
function updateHighlights() {
    const highlightDiffToggle = document.getElementById('highlightDiffToggle');
    const table = document.getElementById('compareTable');
    const tbody = table.querySelector('tbody');
    const cells = tbody.querySelectorAll('td');

    if (highlightDiffToggle.checked) {
        table.classList.add('highlight-diffs');

        // Apply stored color data to cells
        cells.forEach(cell => {
            const bgColor = cell.getAttribute('data-bg-color');
            const borderColor = cell.getAttribute('data-border-color');
            const fontWeight = cell.getAttribute('data-font-weight');

            if (bgColor) cell.style.backgroundColor = bgColor;
            if (borderColor) cell.style.borderLeft = borderColor;
            if (fontWeight) cell.style.fontWeight = fontWeight;
        });
    } else {
        table.classList.remove('highlight-diffs');

        // Clear all inline styles
        cells.forEach(cell => {
            cell.style.backgroundColor = '';
            cell.style.borderLeft = '';
            cell.style.fontWeight = '';
        });
    }
}
