/**
 * Animate badge flying back to header (Expand)
 */
function animateFlyBack(badgeElement, headerRow, callback) {
    // 1. Get Source Position (Badge)
    const sourceRect = badgeElement.getBoundingClientRect();
    
    // 2. Get Target Position (Header Text)
    // We need to briefly make the header visible (but transparent) to measure it
    // because it's currently display: none
    headerRow.style.display = '';
    headerRow.style.visibility = 'hidden';
    
    const titleCell = headerRow.querySelector('th');
    const targetRect = titleCell.getBoundingClientRect();
    
    // Restore hidden state immediately
    headerRow.style.display = 'none';
    headerRow.style.visibility = '';

    // 3. Create Flyer
    const flyer = badgeElement.cloneNode(true);
    flyer.classList.remove('badge-pop-in'); // Remove animation class if present
    flyer.classList.add('flying-badge');
    flyer.style.position = 'fixed';
    flyer.style.zIndex = '9999';
    flyer.style.margin = '0'; // Reset margins
    flyer.style.transition = 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)'; // Smooth easing
    
    flyer.style.top = `${sourceRect.top}px`;
    flyer.style.left = `${sourceRect.left}px`;
    // Match width/height initially to look exactly like the badge
    flyer.style.width = `${sourceRect.width}px`;
    flyer.style.height = `${sourceRect.height}px`;
    flyer.style.display = 'flex';
    flyer.style.alignItems = 'center';
    flyer.style.justifyContent = 'center';
    
    document.body.appendChild(flyer);
    
    // Hide original badge immediately so it looks like it moved
    badgeElement.style.opacity = '0';

    // 4. Calculate Target Styles
    // We want it to land roughly where the text starts
    const targetTop = targetRect.top + (targetRect.height / 2) - (sourceRect.height / 2);
    const targetLeft = targetRect.left + 30; // Offset for chevron

    // Force reflow
    void flyer.offsetWidth;

    // 5. Animate
    flyer.style.top = `${targetTop}px`;
    flyer.style.left = `${targetLeft}px`;
    flyer.style.opacity = '0'; // Fade out as it arrives (revealing the header)
    flyer.style.transform = 'scale(1.1)'; // Slight expansion

    setTimeout(() => {
        flyer.remove();
        if (callback) callback();
    }, 500);
}

/**
 * Animate badge flying back to header (Expand)
 */
function animateFlyBack(badgeElement, headerRow, callback) {
    // 1. Get Source Position (Badge)
    const sourceRect = badgeElement.getBoundingClientRect();
    
    // 2. Get Target Position (Header Text)
    // We need to briefly make the header visible (but transparent) to measure it
    // because it's currently display: none
    headerRow.style.display = '';
    headerRow.style.visibility = 'hidden';
    
    const titleCell = headerRow.querySelector('th');
    const targetRect = titleCell.getBoundingClientRect();
    
    // Restore hidden state immediately
    headerRow.style.display = 'none';
    headerRow.style.visibility = '';

    // 3. Create Flyer
    const flyer = badgeElement.cloneNode(true);
    flyer.classList.remove('badge-pop-in'); // Remove animation class if present
    flyer.classList.add('flying-badge');
    flyer.style.position = 'fixed';
    flyer.style.zIndex = '9999';
    flyer.style.margin = '0'; // Reset margins
    flyer.style.transition = 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)'; // Smooth easing
    
    flyer.style.top = `${sourceRect.top}px`;
    flyer.style.left = `${sourceRect.left}px`;
    // Match width/height initially to look exactly like the badge
    flyer.style.width = `${sourceRect.width}px`;
    flyer.style.height = `${sourceRect.height}px`;
    flyer.style.display = 'flex';
    flyer.style.alignItems = 'center';
    flyer.style.justifyContent = 'center';
    
    document.body.appendChild(flyer);
    
    // Hide original badge immediately so it looks like it moved
    badgeElement.style.opacity = '0';

    // 4. Calculate Target Styles
    // We want it to land roughly where the text starts
    const targetTop = targetRect.top + (targetRect.height / 2) - (sourceRect.height / 2);
    const targetLeft = targetRect.left + 30; // Offset for chevron

    // Force reflow
    void flyer.offsetWidth;

    // 5. Animate
    flyer.style.top = `${targetTop}px`;
    flyer.style.left = `${targetLeft}px`;
    flyer.style.opacity = '0'; // Fade out as it arrives (revealing the header)
    flyer.style.transform = 'scale(1.1)'; // Slight expansion

    setTimeout(() => {
        flyer.remove();
        if (callback) callback();
    }, 500);
}

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
        // If empty, we need to find the text node of the parent header "General", "Power" etc.
        // Structure: <th> <i class="bi..."></i> TextNode <span class="badge-container"></span> </th>
        const parentHeaderTh = parentBadgeContainer.closest('th');
        const icon = parentHeaderTh.querySelector('i');
        
        if (icon && icon.nextSibling) {
            // Measure the text node using Range
            const range = document.createRange();
            range.selectNode(icon.nextSibling); // The text node after icon
            const textRect = range.getBoundingClientRect();
            
            targetLeft = textRect.right + 10; // 10px after text
            targetTop = textRect.top + (textRect.height / 2) - 10;
            
            // Fallback validity check
            if (targetLeft === 0 || textRect.width === 0) {
                 // Try container rect as fallback
                 const cRect = parentBadgeContainer.getBoundingClientRect();
                 targetLeft = cRect.left;
                 targetTop = cRect.top;
            }
        } else {
            // Fallback if no icon/text found
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

function applySectionCollapse(animate = false) {
    document.querySelectorAll('.section-header').forEach(header => {
        const section = header.getAttribute('data-section');
        const icon = header.querySelector('i');
        const isCollapsed = collapsedSections.has(section);

        // Update icon
        if (icon) {
            icon.className = isCollapsed ? 'bi bi-chevron-right' : 'bi bi-chevron-down';
        }

        let currentRow = header.nextElementSibling;
        while (currentRow && !currentRow.classList.contains('section-header')) {
            if (isCollapsed) {
                currentRow.style.display = 'none';
            } else {
                if (!currentRow.getAttribute('data-hidden-by-filter')) {
                    // Logic to check subsection visibility handled by applySubsectionCollapse
                    // But effectively we unhide here, and subsection apply will re-hide specific parts
                    currentRow.style.display = '';
                }
            }
            currentRow = currentRow.nextElementSibling;
        }
    });
}

/**
 * Apply collapsed state to subsections + Diff-based Badge Update (NO BLINK)
 */
function applySubsectionCollapse(animate = false) {
    // 1. Row Visibility
    document.querySelectorAll('.subsection-header').forEach(header => {
        const subsection = header.getAttribute('data-subsection');
        const icon = header.querySelector('i');
        const isCollapsed = collapsedSubsections.has(subsection);

        if (icon) {
            icon.className = isCollapsed ? 'bi bi-chevron-right' : 'bi bi-chevron-down';
        }

        // Only modify display if not handled by animation (i.e. not during exact moment of toggle)
        // But for bulk updates (load, parent interaction), we do it here.

        const parentSection = header.getAttribute('data-parent');
        const parentIsCollapsed = collapsedSections.has(parentSection);

        if (parentIsCollapsed) {
            // Keep everything hidden
            // (Assuming applySectionCollapse already hid them, but good to be safe)
        } else {
            if (isCollapsed) {
                // Hide header (unless we are just starting animation? No, this function assumes state is settled)
                header.style.display = 'none';

                let next = header.nextElementSibling;
                while (next && !next.classList.contains('subsection-header') && !next.classList.contains('section-header')) {
                    next.style.display = 'none';
                    next = next.nextElementSibling;
                }
            } else {
                // Show header
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

    // 2. Update Badges (Diff-based)
    updateParentSectionBadges();
}

/**
 * Smart Badge Update to avoid blinking
 */
function updateParentSectionBadges() {
    document.querySelectorAll('.collapsed-subsections-badge').forEach(badgeContainer => {
        const parentSection = badgeContainer.getAttribute('data-parent');

        // Get expected badge IDs
        const expectedSubsections = [...collapsedSubsections]
            .filter(sub => sub.startsWith(parentSection + '-'))
            .sort(); // Consistent order

        // Get currently displayed badges
        const currentBadges = Array.from(badgeContainer.children);

        // 1. Remove badges not in expected list
        currentBadges.forEach(badge => {
            const id = badge.getAttribute('data-subsection-id');
            if (!expectedSubsections.includes(id)) {
                badge.remove();
            }
        });

        // 2. Add badges not yet present
        expectedSubsections.forEach(subId => {
            if (!badgeContainer.querySelector(`[data-subsection-id="${subId}"]`)) {
                // Create badge
                const subsectionName = subId.split('-').slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

                const badge = document.createElement('span');
                badge.className = 'badge bg-secondary subsection-badge ms-2';
                badge.setAttribute('data-subsection-id', subId);
                badge.textContent = `+ ${subsectionName}`;
                badge.style.fontSize = '0.7em';
                badge.style.cursor = 'pointer';
                badge.title = `Click to expand ${subsectionName}`;

                // Add pop-in class for new badges
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

// ... (Existing helper functions: parseValue, analyzeTable, updateVisibility, updateHighlights) ...
/**
 * Parse a value and extract numeric info for comparison
 */
function parseValue(text) {
    if (!text || text === '-' || text === '') return null;

    // Extract all numbers from the string
    const numbers = text.match(/\d+/g);
    if (!numbers) return { text, score: 0, isNumeric: false };

    // For simple numbers, use the number itself
    if (numbers.length === 1 && /^\d+$/.test(text.trim())) {
        return { text, score: parseInt(numbers[0]), isNumeric: true };
    }

    // For VRM configs like "16+2+1", sum them
    if (/^\d+\+\d+/.test(text)) {
        const sum = numbers.reduce((a, b) => a + parseInt(b), 0);
        return { text, score: sum, isNumeric: true };
    }

    // For PCIe configs like "5x16,5x8", take the first number (lanes)
    if (/\d+x\d+/.test(text)) {
        return { text, score: parseInt(numbers[0]), isNumeric: true };
    }

    // For M.2 slots like "2*5x4 2*4x4", count total slots
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

    // Default: use first number if available
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
        // Skip header/section rows (those with colspan)
        const firstCell = row.querySelector('th, td');
        if (!firstCell || firstCell.hasAttribute('colspan')) {
            return;
        }

        // Get all data cells (skip first cell which is the label)
        const dataCells = Array.from(row.querySelectorAll('td'));

        if (dataCells.length === 0) return;

        // Get text content and parsed values
        const values = dataCells.map(cell => ({
            text: cell.textContent.trim(),
            cell: cell
        }));

        // Normalize empty values
        const normalizedTexts = values.map(v =>
            v.text === '' || v.text === '-' ? '___EMPTY___' : v.text
        );

        // Check if all values are the same
        const allSame = normalizedTexts.every(v => v === normalizedTexts[0]);

        if (allSame) {
            row.setAttribute('data-all-same', 'true');
        } else {
            row.setAttribute('data-has-diff', 'true');

            // Parse values for comparison
            const parsedValues = values.map(v => parseValue(v.text));

            // Check if values are comparable (at least one is numeric)
            const hasNumeric = parsedValues.some(pv => pv && pv.isNumeric);

            if (hasNumeric) {
                // Find the best score (highest)
                const scores = parsedValues.map(pv => pv && pv.isNumeric ? pv.score : -Infinity);
                const maxScore = Math.max(...scores);

                // Mark cells
                dataCells.forEach((cell, index) => {
                    const parsed = parsedValues[index];

                    if (!parsed || parsed.text === '' || parsed.text === '-') {
                        return;
                    }

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
                // Non-numeric comparison: just mark as different
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
        // Hide rows where all values are the same
        tbody.querySelectorAll('tr[data-all-same="true"]').forEach(row => {
            row.style.display = 'none';
            row.setAttribute('data-hidden-by-filter', 'true');
        });

        // Also hide section headers that have no visible children
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
        // Show all rows (unless collapsed)
        tbody.querySelectorAll('tr').forEach(row => {
            row.removeAttribute('data-hidden-by-filter');
        });

        // Re-apply section collapse (respects collapsed state)
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
