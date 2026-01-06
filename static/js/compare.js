const collapsedNodes = new Set();
const childrenMap = {};
let hideIdentical = false;
let highlightDiff = true;

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('tr[data-parent]').forEach(tr => {
        const pid = tr.getAttribute('data-parent');
        if (pid) {
            if (!childrenMap[pid]) childrenMap[pid] = [];
            childrenMap[pid].push(tr);
        }
    });
    calculateSubtreeDiffs();
    updateVisibility();
});

function calculateSubtreeDiffs() {
    document.querySelectorAll('.diff-row').forEach(row => {
        let pid = row.getAttribute('data-parent');
        while (pid && pid !== 'root') {
            const header = document.getElementById('header_' + pid);
            const summary = document.getElementById('summary_' + pid);
            if (header) header.setAttribute('data-has-diff', 'true');
            if (summary) summary.setAttribute('data-has-diff', 'true');
            const parentRow = document.getElementById('header_' + pid);
            pid = parentRow ? parentRow.getAttribute('data-parent') : null;
        }
    });
}

function toggleHighlight() {
    highlightDiff = !highlightDiff;
    const btn = document.getElementById('btn-highlight');
    const table = document.getElementById('compareTable');
    if (highlightDiff) {
        btn.textContent = "Highlight Diff: ON";
        btn.classList.replace('btn-outline-secondary', 'btn-outline-danger');
        table.classList.remove('no-highlight');
    } else {
        btn.textContent = "Highlight Diff: OFF";
        btn.classList.replace('btn-outline-danger', 'btn-outline-secondary');
        table.classList.add('no-highlight');
    }
}

function toggleHideIdentical() {
    hideIdentical = !hideIdentical;
    const btn = document.getElementById('btn-hide-identical');
    const table = document.getElementById('compareTable');

    if (hideIdentical) {
        btn.textContent = "Hide Identical: ON";
        btn.classList.replace('btn-outline-dark', 'btn-dark');
        table.classList.add('hide-identical');
    } else {
        btn.textContent = "Hide Identical: OFF";
        btn.classList.replace('btn-dark', 'btn-outline-dark');
        table.classList.remove('hide-identical');
    }
    updateVisibility();
}

function toggleNode(nodeId) {
    if (collapsedNodes.has(nodeId)) {
        collapsedNodes.delete(nodeId);
    } else {
        collapsedNodes.add(nodeId);
    }
    updateVisibility();
}

function expandAll() {
    collapsedNodes.clear();
    updateVisibility();
}

function collapseAll() {
    document.querySelectorAll('[data-id]').forEach(el => {
        if (el.id.startsWith('header_')) {
            collapsedNodes.add(el.getAttribute('data-id'));
        }
    });
    updateVisibility();
}

function updateVisibility() {
    const roots = childrenMap['root'] || [];
    roots.forEach(r => {
        const id = r.getAttribute('data-id');
        if (r.id.startsWith('header_')) {
            processNode(id, false);
        }
    });
}

function processNode(nodeId, hiddenByAncestor) {
    const isCollapsed = collapsedNodes.has(nodeId);
    const headerRow = document.getElementById('header_' + nodeId);
    const summaryRow = document.getElementById('summary_' + nodeId);

    let hidesEntirely = false;
    if (hideIdentical && headerRow && !headerRow.hasAttribute('data-has-diff')) {
        hidesEntirely = true;
    }

    if (hiddenByAncestor || hidesEntirely) {
        if (headerRow) headerRow.style.display = 'none';
        if (summaryRow) summaryRow.style.display = 'none';

        const children = childrenMap[nodeId] || [];
        children.forEach(childRow => {
            if (childRow.id.startsWith('summary_')) return;
            const childId = childRow.getAttribute('data-id');
            if (childId && childRow.id.startsWith('header_')) {
                processNode(childId, true);
            } else {
                childRow.style.display = 'none';
            }
        });
    } else {
        if (isCollapsed) {
            if (summaryRow) {
                if (headerRow) headerRow.style.display = 'none';
                summaryRow.style.display = '';
            } else {
                if (headerRow) {
                    headerRow.style.display = '';
                    const icon = headerRow.querySelector('i');
                    if (icon) { icon.className = 'bi bi-caret-right-fill'; }
                }
            }

            const children = childrenMap[nodeId] || [];
            children.forEach(childRow => {
                if (childRow.id.startsWith('summary_')) return;
                const childId = childRow.getAttribute('data-id');
                if (childId && childRow.id.startsWith('header_')) {
                    processNode(childId, true);
                } else {
                    childRow.style.display = 'none';
                }
            });
        } else {
            if (headerRow) {
                headerRow.style.display = '';
                const icon = headerRow.querySelector('i');
                if (icon) { icon.className = 'bi bi-caret-down-fill'; }
            }
            if (summaryRow) summaryRow.style.display = 'none';

            const children = childrenMap[nodeId] || [];
            children.forEach(childRow => {
                if (childRow.id.startsWith('summary_')) return;
                const childId = childRow.getAttribute('data-id');
                if (childId && childRow.id.startsWith('header_')) {
                    processNode(childId, false);
                } else {
                    childRow.style.display = '';
                }
            });
        }
    }
}
