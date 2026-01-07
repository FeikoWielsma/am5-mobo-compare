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
        'superiocontroller',
        'super i/o',
        'lane-sharing',
        'bifurcation'
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

let allMobos = []; // Store fetched mobos for search

document.addEventListener('DOMContentLoaded', () => {
    // Initial Bind
    bindEvents();

    // Fetch Mobo List for Search
    fetch('/api/mobos')
        .then(response => response.json())
        .then(data => {
            allMobos = data;
        })
        .catch(err => console.error('Failed to fetch mobos for search', err));

    // Search Input Logic
    const searchInput = document.getElementById('moboSearch');
    const searchDropdown = document.getElementById('searchDropdown');

    if (searchInput && searchDropdown) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) {
                searchDropdown.style.display = 'none';
                return;
            }

            // Filter mobos (exclude ones already in URL if possible, but for now just show all matching)
            const currentIds = new URLSearchParams(window.location.search).get('ids')?.split(',') || [];

            const matches = allMobos.filter(m => {
                const text = `${m.Brand} ${m.Model} ${m.Chipset}`.toLowerCase();
                return text.includes(query) && !currentIds.includes(m.id.toString());
            }).slice(0, 10); // Limit to 10

            if (matches.length > 0) {
                searchDropdown.innerHTML = '';
                matches.forEach(m => {
                    const item = document.createElement('div');
                    item.className = 'dropdown-item p-2 border-bottom';
                    item.innerHTML = `
                        <div class="fw-bold">${m.Brand} ${m.Model}</div>
                        <div class="small text-muted">${m.Chipset}</div>
                    `;
                    item.addEventListener('click', () => {
                        addMobo(m.id);
                        searchInput.value = ''; // Clear input
                        searchDropdown.style.display = 'none';
                    });
                    searchDropdown.appendChild(item);
                });
                searchDropdown.style.display = 'block';
            } else {
                searchDropdown.style.display = 'none';
            }
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
                searchDropdown.style.display = 'none';
            }
        });
    }
});

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
    const newUrl = `${window.location.pathname}?ids=${ids.join(',')}`;

    // Push State
    history.pushState({ ids: ids }, '', newUrl);

    // Fetch
    fetchTable(newUrl);
}

// Handle Browser Back/Forward
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

/**
 * Parse a value and extract numeric info for comparison
 */
function parseValue(text, fieldName) {
    if (!text || text === '-' || text === '') return null;

    // Custom LAN Controller parsing
    // Uses global LAN_SCORES injected from backend
    if (fieldName && fieldName.includes('LAN Controller') && typeof LAN_SCORES !== 'undefined') {
        let totalSpeed = 0;
        const normalizedText = text.toUpperCase();
        let matched = false;

        // Iterate through all known controllers and check if present
        for (const [controller, speed] of Object.entries(LAN_SCORES)) {
            // Check if controller name (or part of it) is in text
            // The controller keys from Excel might be "Intel I226-V".
            // The text might be "Intel I-226V" (extra hyphen).
            // Simple approach: Check if key is substring of text (case insensitive)

            // Normalize key for search: remove special chars to be safe?
            // Actually, let's just check inclusion directly first.
            if (normalizedText.includes(controller.toUpperCase())) {
                totalSpeed += speed;
                matched = true;
            }
        }

        // If we found matches, return the sum
        if (matched) {
            return { text, score: totalSpeed, isNumeric: true };
        }

        // Fallback or if no known controller found (e.g. generic text) -> 0
    }

    // Custom Wireless parsing
    // Hierarchy: Gen 7 > 6E > 6 > 5 > Slot > None
    // Manufacturer: Intel > Qualcomm > Realtek > Mediatek > Generic
    if (fieldName && fieldName.includes('Wireless')) {
        let genScore = 0;

        if (text.includes('Wi-Fi 7')) genScore = 7000;
        else if (text.includes('Wi-Fi 6E')) genScore = 6000;
        else if (text.includes('Wi-Fi 6')) genScore = 5000; // Matches "Wi-Fi 6" but not 6E because we checked 6E first
        else if (text.includes('Wi-Fi 5')) genScore = 4000;

        if (genScore === 0) {
            if (text.includes('M.2')) return { text, score: 1000, isNumeric: true }; // Slot only
            return { text, score: 0, isNumeric: true }; // None/Unknown
        }

        let mfgBonus = 100; // Default generic
        const lower = text.toLowerCase();

        // MFR Detection
        if (lower.includes('intel') || lower.includes('killer') || lower.includes('ax2') || lower.includes('ax1') || lower.includes('be2')) {
            mfgBonus = 500;
        } else if (lower.includes('qualcomm') || lower.includes('qcn') || lower.includes('ncm')) {
            mfgBonus = 400;
        } else if (lower.includes('realtek') || lower.includes('rtl')) {
            mfgBonus = 300;
        } else if (lower.includes('mediatek') || lower.includes('mt') || lower.includes('rz') || lower.includes('amd')) {
            mfgBonus = 200;
        }

        return { text, score: genScore + mfgBonus, isNumeric: true };
    }

    // Custom VRM (VCore) parsing
    // Hierarchy: SPS (Tier 2) > DrMOS (Tier 1) > Discrete/Other (Tier 0)
    // Score = (Tier * 1000) + Amperage
    if (fieldName && fieldName.includes('VRM (VCore)')) {
        let tier = 0;
        let amps = 0;

        // Determine Tier
        if (text.includes('SPS')) {
            tier = 2;
        } else if (text.includes('DrMOS')) {
            tier = 1;
        }

        // Determine Amperage
        // Look for "XXA" or "XX A"
        const ampMatch = text.match(/(\d+)\s*A/);
        if (ampMatch) {
            amps = parseInt(ampMatch[1]);
        }

        // Fallback: If no "A" found, but there's a number and it's SPS/DrMOS, maybe the number is amps?
        // But usually it's explicit. If no amps found, amps = 0.

        // 1H/1L Handling: Usually implies discrete. Tier 0.
        // If text contains "1H" or "1L", it confirms Tier 0.

        const score = (tier * 1000) + amps;
        return { text, score: score, isNumeric: true };
    }

    // Custom "Total M.2 (M)" parsing: "5(+2)" -> 5 Onboard + 2 AIC
    // Priority: Total Count > Onboard Count
    if (fieldName && fieldName.includes('Total M.2')) {
        // Check for "X(+Y)" format
        const match = text.match(/(\d+)\(\+(\d+)\)/);
        if (match) {
            const onboard = parseInt(match[1]);
            const extra = parseInt(match[2]);
            const total = onboard + extra;

            // Score: (Total * 100) + Onboard
            // Example: 5(+2) = 7 total. Score 705.
            // Example: 5     = 5 total. Score 505.
            // Example: 3(+2) = 5 total. Score 503.
            return { text, score: (total * 100) + onboard, isNumeric: true };
        }

        // Fallback for simple numbers "5" in this field
        // Treat as "5(+0)" -> Score 505
        const simple = text.match(/^\d+$/);
        if (simple) {
            const val = parseInt(simple[0]);
            return { text, score: (val * 100) + val, isNumeric: true };
        }
    }

    // Custom M.2 parsing: "1*4x4" -> Count * Gen x Lanes
    // Priority: Total Slots > Bandwidth
    if (fieldName && (fieldName.includes('M.2') || fieldName.includes('m.2'))) {
        const m2Regex = /(\d+)\*(\d+)x(\d+)/g;
        let totalSlots = 0;
        let bandwidthScore = 0;
        let match;
        let found = false;

        while ((match = m2Regex.exec(text)) !== null) {
            found = true;
            const count = parseInt(match[1]);
            const gen = parseInt(match[2]);
            const lanes = parseInt(match[3]);

            totalSlots += count;
            // Bandwidth heuristic: Count * (Gen * 100 + Lanes)
            // e.g. 4x4 = 404, 3x4 = 304.
            bandwidthScore += count * ((gen * 100) + lanes);
        }

        if (found) {
            // Score = (Slots * 1,000,000) + Bandwidth
            // This ensures 2 slots (score > 2,000,000) always beats 1 slot (score < 1,999,999)
            // regardless of generation.
            const finalScore = (totalSlots * 1000000) + bandwidthScore;
            return { text, score: finalScore, isNumeric: true };
        }
    }

    const numbers = text.match(/\d+/g);

    // Custom USB-C header parsing: "1*20g 1*10g" -> 30
    if (/(\d+)\*\d+g/.test(text)) {
        const matches = text.match(/(\d+)\*(\d+)g/g);
        if (matches) {
            const totalSpeed = matches.reduce((sum, part) => {
                const parts = part.match(/(\d+)\*(\d+)g/);
                return sum + (parseInt(parts[1]) * parseInt(parts[2]));
            }, 0);
            return { text, score: totalSpeed, isNumeric: true };
        }
    }

    // Custom PCIe Slot parsing for "x16 Electrical"
    // Format: "5x16, 3x2" (Gen 5 x16, Gen 3 x2)
    // Logic: Hierarchical comparison. Slot 1 > Slot 2 > etc.
    // Score = Sum( (Gen * 100 + Lanes) * 1000^(MaxSlots - i) )
    if (fieldName && fieldName.toLowerCase().includes('x16 electrical')) {
        const slots = text.match(/(\d+)x(\d+)/g);
        if (slots) {
            let totalScore = 0;
            // Limit to first 4 slots to avoid overflow/complexity
            const maxSlots = 4;

            slots.slice(0, maxSlots).forEach((slot, index) => {
                const parts = slot.match(/(\d+)x(\d+)/);
                const gen = parseInt(parts[1]);
                const lanes = parseInt(parts[2]);
                const slotScore = (gen * 100) + lanes;

                // Weight: 10^9, 10^6, 10^3, 10^0
                const weight = Math.pow(1000, maxSlots - 1 - index);
                totalScore += slotScore * weight;
            });
            return { text, score: totalScore, isNumeric: true };
        }
    }

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
