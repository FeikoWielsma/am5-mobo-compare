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

// Field-specific comparison rules
const FIELD_RULES = {
    // Fields to ignore in diff highlighting (never highlight these)
    'ignored_fields': [
        'release',
        'notes',
        'details',
        'color',
        'heatsink',
        'pcb',
        'primary',
        'accent',
        'textaccent',
        'superiocontroller'
    ],

    // Lower is better
    'lower_is_better': [
        'amsrpusd',  // Price field
    ],

    // Custom rankings (best to worst) - exact text match
    'custom_rank': {
        'debug': {  // Matches any field with "debug" in name
            'LCD Display': 15,
            'LCD': 15,
            'Debug LEDs': 10,
            'Debug LED': 10,
            'POST code': 5,
            'POST': 5,
            'Power LED': 1,
            'None': 0,
            '-': 0,
            '': 0
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const hideSameToggle = document.getElementById('hideSameToggle');
    const highlightDiffToggle = document.getElementById('highlightDiffToggle');
    const table = document.getElementById('compareTable');

    if (!hideSameToggle || !highlightDiffToggle || !table) return;

    // Load collapsed state from localStorage
    loadCollapsedState();

    // Analyze table on load
    analyzeTable();

    // Initial Apply (without animations for page load)
    applySectionCollapse(false);
    applySubsectionCollapse(false);

    // Add event listeners for toggles
    hideSameToggle.addEventListener('change', updateVisibility);
    highlightDiffToggle.addEventListener('change', updateHighlights);

    // Add event listeners for section headers
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (!e.target.classList.contains('subsection-badge')) {
                const section = header.getAttribute('data-section');
                toggleSection(section);
            }
        });
    });

    // Add event listeners for subsection headers
    document.querySelectorAll('.subsection-header').forEach(header => {
        header.addEventListener('click', () => {
            const subsection = header.getAttribute('data-subsection');
            toggleSubsection(subsection); // Animate toggle
        });
    });

    // Initialize Bootstrap tooltips for comment indicators
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    [...tooltipTriggerList].map(el => new bootstrap.Tooltip(el, {
        placement: 'top',
        trigger: 'hover focus'
    }));
});

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

/**
 * Parse a value and extract numeric info for comparison
 */
function parseValue(text) {
    if (!text || text === '-' || text === '') return null;

    const numbers = text.match(/\d+/g);
    if (!numbers) return { text, score: 0, isNumeric: false };

    if (numbers.length === 1 && /^\d+$/.test(text.trim())) {
        return { text, score: parseInt(numbers[0]), isNumeric: true };
    }

    if (/^\d+\+\d+/.test(text)) {
        const sum = numbers.reduce((a, b) => a + parseInt(b), 0);
        return { text, score: sum, isNumeric: true };
    }

    if (/\d+x\d+/.test(text)) {
        return { text, score: parseInt(numbers[0]), isNumeric: true };
    }

    if (/\d+\*\d+x\d+/.test(text)) {
        const matches = text.match(/(\d+)\*\d+x\d+/g);
        if (matches) {
            const totalSlots = matches.reduce((sum, match) => {
                const count = parseInt(match.match(/^(\d+)/)[1]);
                return sum + count;
            }, 0);
            return { text, score: totalSlots, isNumeric: true };
        }
    }

    return { text, score: parseInt(numbers[0]), isNumeric: numbers.length > 0 };
}



/**
 * Check if a field should use "lower is better" logic
 */
function isLowerBetter(fieldName) {
    return FIELD_RULES.lower_is_better.some(field =>
        fieldName.toLowerCase().includes(field.toLowerCase())
    );
}

/**
 * Get custom rank for a value in a specific field
 */
function getCustomRank(fieldName, value) {
    const normalizedFieldName = fieldName.toLowerCase();
    const normalizedValue = value.trim();

    for (const [field, rankings] of Object.entries(FIELD_RULES.custom_rank)) {
        if (normalizedFieldName.includes(field.toLowerCase())) {
            // Try exact match first
            if (rankings[normalizedValue] !== undefined) {
                return rankings[normalizedValue];
            }

            // Try case-insensitive match
            for (const [rankKey, rankValue] of Object.entries(rankings)) {
                if (rankKey.toLowerCase() === normalizedValue.toLowerCase()) {
                    return rankValue;
                }
            }
        }
    }
    return null;
}

/**
 * Parse VRM configuration strings like "2x10+2+2" into total phase count
 */
function parseVRM(text) {
    if (!text || text === '-' || text === '') return null;

    // Pattern: "2x10+2+2" or "16+2+1" or just "16"
    const vrmPattern = /^(\d+)x(\d+)([+\d]+)?$/;
    const simplePattern = /^(\d+)([+\d]+)?$/;

    let match = text.match(vrmPattern);
    if (match) {
        const [, multiplier, base, additional] = match;
        let total = parseInt(multiplier) * parseInt(base);

        if (additional) {
            const extras = additional.match(/\d+/g);
            if (extras) {
                total += extras.reduce((sum, n) => sum + parseInt(n), 0);
            }
        }

        return { text, score: total, isNumeric: true, isVRM: true };
    }

    match = text.match(simplePattern);
    if (match) {
        const [, base, additional] = match;
        let total = parseInt(base);

        if (additional) {
            const extras = additional.match(/\d+/g);
            if (extras) {
                total += extras.reduce((sum, n) => sum + parseInt(n), 0);
            }
        }

        return { text, score: total, isNumeric: true, isVRM: true };
    }

    return null;
}

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
        const fieldName = firstCell.textContent.trim().toLowerCase();
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
            const isVRMField = fieldName.includes('phase') || fieldName.includes('vrm') || fieldName.includes('vcore');

            const parsedValues = values.map(v => {
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
                return parseValue(v.text);
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

                    // Empty/missing values get marked as differs
                    if (!parsed || parsed.text === '' || parsed.text === '-') {
                        cell.setAttribute('data-differs', 'true');
                        cell.setAttribute('data-gradient', 'missing');
                        return;
                    }

                    if (parsed.isNumeric) {
                        const score = parsed.score;

                        // Only check if outlier when there's a clear majority
                        if (useMajorityFiltering) {
                            const isOutlier = score !== majorityScore;
                            if (!isOutlier) {
                                // Don't highlight majority values
                                return;
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
                            const position = (score - minScore) / (maxScore - minScore);

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
