/**
 * Static Renderer for Mobo-Parse
 * Replicates Jinja2 template logic in pure JavaScript for GitHub Pages compatibility.
 */

const StaticRenderer = {
    // Badge helpers
    getChipsetClass(c) {
        if (!c) return '';
        const clean = String(c).toLowerCase().replace(/[ ()]/g, '');
        return `badge-chipset badge-chipset-${clean}`;
    },

    getFFClass(f) {
        if (!f) return '';
        const clean = String(f).toLowerCase().replace(/[ μu-]/g, 'm').replace(/m+/g, 'm');
        return `badge-ff badge-ff-${clean}`;
    },

    // Recursive data access (same as main.js)
    getNestedValue(obj, path) {
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
    },

    /**
     * Renders the entire comparison table
     * @param {HTMLElement} container - The table element to populate
     * @param {Array} mobos - Selected motherboard objects
     * @param {Array} structure - The hierarchical header tree
     */
    renderCompareTable(container, mobos, structure) {
        if (!mobos.length) return;

        // 1. Clear container
        container.innerHTML = '';

        // 2. Create Header
        const thead = document.createElement('thead');
        thead.className = 'table-dark sticky-top';
        const headerRow = document.createElement('tr');

        // Label col
        const labelTh = document.createElement('th');
        labelTh.className = 'sticky-col feature-col';
        labelTh.innerText = 'Feature';
        headerRow.appendChild(labelTh);

        mobos.forEach(m => {
            const th = document.createElement('th');
            th.className = 'mobo-header-cell';
            th.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <div class="small text-uppercase opacity-75">${m.brand}</div>
                        <div class="fw-bold h5 mb-1">${m.model}</div>
                        <div class="mt-1">
                            <span class="badge ${this.getChipsetClass(m.chipset)}">${m.chipset}</span>
                            <span class="badge ${this.getFFClass(m.form_factor)}">${m.form_factor}</span>
                        </div>
                    </div>
                </div>
            `;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        container.appendChild(thead);

        // 3. Create Body
        const tbody = document.createElement('tbody');

        // Scorecard Section (Special)
        this.renderScorecardSection(tbody, mobos);

        // Hierarchical Sections
        structure.forEach(section => {
            // Section Header
            const sectionRow = document.createElement('tr');
            sectionRow.className = 'section-header clickable';
            sectionRow.innerHTML = `<td colspan="${mobos.length + 1}" class="bg-dark text-white fw-bold py-2"><i class="bi bi-chevron-down me-2"></i>${section.name}</td>`;
            tbody.appendChild(sectionRow);

            section.children.forEach(sub => {
                // Subsection Header
                const subRow = document.createElement('tr');
                subRow.className = 'subsection-header';
                subRow.innerHTML = `<td colspan="${mobos.length + 1}" class="bg-secondary text-white small fw-bold py-1 px-4">${sub.name}</td>`;
                tbody.appendChild(subRow);

                sub.children.forEach(leaf => {
                    // Feature Row
                    const row = document.createElement('tr');
                    row.className = 'feature-row';

                    const labelCell = document.createElement('td');
                    labelCell.className = 'sticky-col feature-label ps-5';
                    labelCell.innerText = leaf.name;
                    row.appendChild(labelCell);

                    const values = [];
                    mobos.forEach(m => {
                        const val = this.getNestedValue(m, leaf.key);
                        values.push(String(val));
                        const cell = document.createElement('td');
                        cell.className = 'spec-cell';
                        cell.innerText = val;
                        row.appendChild(cell);
                    });

                    // Highlight diffs if values are different
                    const unique = new Set(values);
                    if (unique.size > 1) {
                        row.classList.add('has-diff');
                    }

                    tbody.appendChild(row);
                });
            });
        });

        container.appendChild(tbody);
    },

    renderScorecardSection(tbody, mobos) {
        const header = document.createElement('tr');
        header.className = 'section-header';
        header.innerHTML = `<td colspan="${mobos.length + 1}" class="bg-primary text-white fw-bold py-2"><i class="bi bi-chevron-down me-2"></i>Scorecard Summary</td>`;
        tbody.appendChild(header);

        const scRows = [
            { label: 'LAN', key: '_scorecard|lan_text', bold: true, color: 'text-primary' },
            { label: 'Wireless', key: '_scorecard|wireless' },
            { label: 'Audio', key: '_scorecard|audio' },
            {
                label: 'VRM',
                formatter: (m) => {
                    const sc = m._scorecard || {};
                    let html = `<div class="fw-bold text-primary">${sc.vrm_text || '-'}</div>`;
                    if (sc.vcore_text && sc.vcore_text !== '-') {
                        html += `<div class="small text-muted">${sc.vcore_text}</div>`;
                    }
                    if (sc.vrm_note) {
                        html += `<i class="bi bi-info-circle text-info ms-1" title="${sc.vrm_note}"></i>`;
                    }
                    return html;
                }
            },
            { label: 'Fan Headers', key: '_scorecard|fan_count' },
            { label: 'ARGB Headers', key: '_scorecard|argb_count' },
            {
                label: 'BIOS Flash Button',
                formatter: (m) => {
                    const val = m._scorecard?.bios_flash_btn;
                    return val ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle text-danger"></i>';
                }
            },
            {
                label: 'USB-C Header',
                formatter: (m) => {
                    const val = m._scorecard?.usbc_header;
                    return val ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle text-danger"></i>';
                }
            },
            {
                label: 'USB Rear',
                formatter: (m) => {
                    const sc = m._scorecard || {};
                    const usb = sc.usb_details || { type_a: {}, type_c: {} };
                    let html = `<div class="fw-bold mb-1">${sc.usb_ports_total || '-'} Total</div>`;

                    html += `<div class="mb-1"><i class="bi bi-usb-symbol" title="Type-A"></i>`;
                    if (usb.type_a['2.0']) html += `<span class="badge bg-secondary ms-1">${usb.type_a['2.0']}x 2.0</span>`;
                    if (usb.type_a['3.2_5g']) html += `<span class="badge bg-info text-dark ms-1">5G</span>`;
                    if (usb.type_a['3.2_10g']) html += `<span class="badge bg-primary ms-1">10G</span>`;
                    html += `</div>`;

                    html += `<div><i class="bi bi-usb-c-fill" title="Type-C"></i>`;
                    if (usb.type_c['3.2_5g']) html += `<span class="badge bg-info text-dark ms-1">5G</span>`;
                    if (usb.type_c['3.2_10g']) html += `<span class="badge bg-primary ms-1">10G</span>`;
                    if (usb.type_c['3.2_20g']) html += `<span class="badge bg-success ms-1">20G</span>`;
                    if (usb.type_c['usb4_40g']) html += `<span class="badge bg-warning text-dark ms-1">40G</span>`;
                    html += `</div>`;
                    return html;
                }
            },
            {
                label: 'PCIe x16',
                formatter: (m) => {
                    const sc = m._scorecard || {};
                    let html = `<div class="fw-bold">${sc.pcie_x16_total || '-'} Total</div>`;
                    (sc.pcie_x16_details || []).forEach(d => {
                        html += `<div class="small text-muted">${d}</div>`;
                    });
                    return html;
                }
            },
            {
                label: 'M.2 Slots',
                formatter: (m) => {
                    const sc = m._scorecard || {};
                    let html = `<div class="fw-bold">${sc.m2_total || '-'} Total</div>`;
                    (sc.m2_details || []).forEach(d => {
                        html += `<div class="small text-muted">${d}</div>`;
                    });
                    return html;
                }
            }
        ];

        scRows.forEach(rowInfo => {
            const tr = document.createElement('tr');
            tr.className = 'feature-row scorecard-row';

            const labelCell = document.createElement('td');
            labelCell.className = 'sticky-col feature-label ps-4';
            labelCell.innerText = rowInfo.label;
            tr.appendChild(labelCell);

            mobos.forEach(m => {
                const cell = document.createElement('td');
                cell.className = 'spec-cell text-center';
                if (rowInfo.formatter) {
                    cell.innerHTML = rowInfo.formatter(m);
                } else {
                    const val = this.getNestedValue(m, rowInfo.key);
                    cell.innerText = val;
                    if (rowInfo.bold) cell.classList.add('fw-bold');
                    if (rowInfo.color) cell.classList.add(rowInfo.color);
                }
                tr.appendChild(cell);
            });
            tbody.appendChild(tr);
        });
    }
};
