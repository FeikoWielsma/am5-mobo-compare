/**
 * Compare page functionality
 * - Collapsible sections and subsections with localStorage persistence
 * - Hide rows where all values are identical
 * - Highlight cells: green for "better", yellow for "different"
 */

// Collapsed state
let collapsedSections = new Set();
let collapsedSubsections = new Set();

document.addEventListener('DOMContentLoaded', () => {
    const hideSameToggle = document.getElementById('hideSameToggle');
    const highlightDiffToggle = document.getElementById('highlightDiffToggle');
    const table = document.getElementById('compareTable');

    if (!hideSameToggle || !highlightDiffToggle || !table) return;

    // Load collapsed state from localStorage
    loadCollapsedState();

    // Analyze table on load
    analyzeTable();

    // Apply collapsed state
    applySectionCollapse();
    applySubsectionCollapse();

    // Add event listeners for toggles
    hideSameToggle.addEventListener('change', updateVisibility);
    highlightDiffToggle.addEventListener('change', updateHighlights);

    // Add event listeners for section headers
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', (e) => {
            // Don't toggle if clicking on a badge
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
            toggleSubsection(subsection);
        });
    });
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

/**
 * Save collapsed state to localStorage
 */
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
    applySectionCollapse();
}

/**
 * Toggle a subsection's collapse state
 */
function toggleSubsection(subsectionName) {
    if (collapsedSubsections.has(subsectionName)) {
        collapsedSubsections.delete(subsectionName);
    } else {
        collapsedSubsections.add(subsectionName);
    }

    saveCollapsedState();
    applySubsectionCollapse();
}

/**
 * Apply collapsed state to all sections
 */
function applySectionCollapse() {
    document.querySelectorAll('.section-header').forEach(header => {
        const section = header.getAttribute('data-section');
        const icon = header.querySelector('i');
        const isCollapsed = collapsedSections.has(section);

        // Update icon
        if (icon) {
            icon.className = isCollapsed ? 'bi bi-chevron-right' : 'bi bi-chevron-down';
        }

        // Hide/show all rows under this section until next section header
        let currentRow = header.nextElementSibling;
        while (currentRow && !currentRow.classList.contains('section-header')) {
            if (isCollapsed) {
                currentRow.style.display = 'none';
            } else {
                // Only show if not hidden by other filters
                if (!currentRow.getAttribute('data-hidden-by-filter')) {
                    currentRow.style.display = '';
                }
            }
            currentRow = currentRow.nextElementSibling;
        }
    });
}

/**
 * Apply collapsed state to subsections and update parent badges
 */
function applySubsectionCollapse() {
    // First, apply collapse to all subsections
    document.querySelectorAll('.subsection-header').forEach(header => {
        const subsection = header.getAttribute('data-subsection');
        const icon = header.querySelector('i');
        const isCollapsed = collapsedSubsections.has(subsection);

        // Update icon
        if (icon) {
            icon.className = isCollapsed ? 'bi bi-chevron-right' : 'bi bi-chevron-down';
        }

        if (isCollapsed) {
            // Hide the subsection header itself
            header.style.display = 'none';

            // Hide all content rows until next subsection or section
            let currentRow = header.nextElementSibling;
            while (currentRow &&
                !currentRow.classList.contains('subsection-header') &&
                !currentRow.classList.contains('section-header')) {
                currentRow.style.display = 'none';
                currentRow = currentRow.nextElementSibling;
            }
        } else {
            // Show the subsection header
            header.style.display = '';

            // Show content rows
            let currentRow = header.nextElementSibling;
            while (currentRow &&
                !currentRow.classList.contains('subsection-header') &&
                !currentRow.classList.contains('section-header')) {
                if (!currentRow.getAttribute('data-hidden-by-filter')) {
                    currentRow.style.display = '';
                }
                currentRow = currentRow.nextElementSibling;
            }
        }
    });

    // Update parent section badges
    updateParentSectionBadges();
}

/**
 * Update badges in parent sections showing collapsed subsections
 */
function updateParentSectionBadges() {
    // Get all parent badge containers
    document.querySelectorAll('.collapsed-subsections-badge').forEach(badgeContainer => {
        const parentSection = badgeContainer.getAttribute('data-parent');

        // Find all collapsed subsections under this parent
        const collapsedSubs = [...collapsedSubsections].filter(sub => sub.startsWith(parentSection + '-'));

        // Create badges
        badgeContainer.innerHTML = '';
        collapsedSubs.forEach(subsectionId => {
            // Extract subsection name (e.g., "general-market" -> "Market")
            const subsectionName = subsectionId.split('-').slice(1).map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');

            const badge = document.createElement('span');
            badge.className = 'badge bg-secondary subsection-badge ms-2';
            badge.textContent = `+ ${subsectionName}`;
            badge.style.fontSize = '0.7em';
            badge.style.cursor = 'pointer';
            badge.title = `Click to expand ${subsectionName}`;

            // Click to expand this specific subsection
            badge.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger parent section toggle
                toggleSubsection(subsectionId);
            });

            badgeContainer.appendChild(badge);
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
 * Analyze table and mark rows/cells based on better/worse values
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

        const dataCells = Array.from(row.querySelectorAll('td'));
        if (dataCells.length === 0) return;

        const values = dataCells.map(cell => ({
            text: cell.textContent.trim(),
            cell: cell
        }));

        const normalizedTexts = values.map(v =>
            v.text === '' || v.text === '-' ? '___EMPTY___' : v.text
        );

        const allSame = normalizedTexts.every(v => v === normalizedTexts[0]);

        if (allSame) {
            row.setAttribute('data-all-same', 'true');
        } else {
            row.setAttribute('data-has-diff', 'true');

            const parsedValues = values.map(v => parseValue(v.text));
            const hasNumeric = parsedValues.some(pv => pv && pv.isNumeric);

            if (hasNumeric) {
                const scores = parsedValues.map(pv => pv && pv.isNumeric ? pv.score : -Infinity);
                const maxScore = Math.max(...scores);

                dataCells.forEach((cell, index) => {
                    const parsed = parsedValues[index];
                    if (!parsed || parsed.text === '' || parsed.text === '-') return;

                    if (parsed.isNumeric) {
                        if (parsed.score === maxScore) {
                            cell.setAttribute('data-best', 'true');
                        } else {
                            cell.setAttribute('data-differs', 'true');
                        }
                    } else {
                        cell.setAttribute('data-differs', 'true');
                    }
                });
            } else {
                const referenceValue = normalizedTexts[0];
                dataCells.forEach((cell, index) => {
                    if (normalizedTexts[index] !== referenceValue) {
                        cell.setAttribute('data-differs', 'true');
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

    if (highlightDiffToggle.checked) {
        table.classList.add('highlight-diffs');
    } else {
        table.classList.remove('highlight-diffs');
    }
}
