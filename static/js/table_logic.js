/**
 * table_logic.js - Pure logic behind the index table.
 *
 * Filtering, sorting, value lookup, badge class names and view-state
 * encoding, with no DOM access. main.js keeps the rendering and event
 * wiring and calls into here for the decisions.
 *
 * Everything used to live inside main.js's initApp() closure, which meant
 * none of it could be exercised without driving a browser through the whole
 * page. These functions are unit-tested directly (tests/test_table_logic.py).
 */

/**
 * Read a value out of a motherboard record by path.
 *
 * Accepts dot or pipe notation, tries the record root first and then its
 * `specs` sub-object, which is where dynamic column keys usually point.
 * Returns '-' when nothing matches, which is what the table renders.
 */
function getNestedValue(obj, path) {
    if (!path) return '-';

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

    if (obj && obj.specs) {
        val = tryAccess(obj.specs, path);
        if (val !== undefined) return val;
    }

    return '-';
}

function chipsetBadgeClass(chipset) {
    if (!chipset) return '';
    const clean = chipset.toLowerCase().replace(/[ ()]/g, '');
    return `badge-chipset badge-chipset-${clean}`;
}

function formFactorBadgeClass(formFactor) {
    if (!formFactor) return '';
    let normalized = formFactor.toLowerCase();
    normalized = normalized.replace(/atx-b$/i, 'atx');          // ATX-B -> atx
    normalized = normalized.replace(/bkb itx/i, 'mini-itx');     // BKB ITX -> mini-itx
    normalized = normalized.replace(/[μu]-atx-b/i, 'matx');      // μ-ATX-B -> matx
    normalized = normalized.replace(/[μu]-atx/i, 'matx');        // μ-ATX -> matx
    normalized = normalized.replace(/e-atx/i, 'eatx');           // E-ATX -> eatx
    const clean = normalized.replace(/[ -]/g, '');
    return `badge-ff badge-ff-${clean}`;
}

/**
 * Free-text search over brand, chipset and model.
 *
 * Every whitespace-separated word must appear, so word order doesn't matter.
 * The filter dropdowns previously used a whole-string substring test here
 * while the table used this one, so a search like "x870 asus" narrowed the
 * table but not the dropdown options. Both now call this.
 */
function matchesGlobalSearch(mobo, search) {
    const words = String(search || '').toLowerCase().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return true;
    const combined = `${mobo.brand} ${mobo.chipset} ${mobo.model}`.toLowerCase();
    return words.every(word => combined.includes(word));
}

/** The value a given filter column reads off a record. */
function filterValue(mobo, column, dynamicKeys) {
    if (column.startsWith('dyn')) {
        const idx = column.substring(3);
        return dynamicKeys[idx] ? String(getNestedValue(mobo, dynamicKeys[idx])) : null;
    }
    return String(mobo[column]);
}

/**
 * Apply the search box and every active filter.
 *
 * `filters` maps column -> Set of accepted values; an empty Set means the
 * column is unfiltered.
 */
function filterMobos(mobos, { search = '', filters = {}, dynamicKeys = {} } = {}) {
    return mobos.filter(m => {
        if (!matchesGlobalSearch(m, search)) return false;

        for (const column of ['brand', 'chipset', 'model', 'form_factor']) {
            const set = filters[column];
            if (set && set.size > 0 && !set.has(String(m[column]))) return false;
        }

        for (const k in dynamicKeys) {
            const set = filters[`dyn${k}`];
            if (set && set.size > 0) {
                if (!set.has(String(getNestedValue(m, dynamicKeys[k])))) return false;
            }
        }
        return true;
    });
}

/**
 * Sort a copy of `mobos`. Natural (numeric-aware) ordering; blanks and '-'
 * collapse to empty so they group together.
 */
function sortMobos(mobos, sort, dynamicKeys = {}) {
    if (!sort || !sort.column) return mobos.slice();

    const read = (m) => {
        if (sort.column.startsWith('dyn')) {
            const idx = sort.column.replace('dyn', '');
            return dynamicKeys[idx] ? getNestedValue(m, dynamicKeys[idx]) : '';
        }
        return m[sort.column];
    };

    return mobos.slice().sort((a, b) => {
        let aVal = read(a);
        let bVal = read(b);
        aVal = (aVal === null || aVal === undefined || aVal === '-') ? '' : String(aVal);
        bVal = (bVal === null || bVal === undefined || bVal === '-') ? '' : String(bVal);
        const result = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
        return sort.direction === 'asc' ? result : -result;
    });
}

/**
 * Values still selectable in `targetCol`, given the other active filters.
 *
 * The target column is excluded from its own narrowing, so ticking one brand
 * doesn't hide the remaining brands.
 */
function availableValuesFor(mobos, targetCol, { search = '', filters = {}, dynamicKeys = {} } = {}) {
    const columns = ['brand', 'chipset', 'model', 'form_factor']
        .concat(Object.keys(dynamicKeys).map(k => `dyn${k}`));

    const subset = mobos.filter(m => {
        if (!matchesGlobalSearch(m, search)) return false;
        for (const col of columns) {
            if (col === targetCol) continue;
            const set = filters[col];
            if (!set || set.size === 0) continue;
            if (!set.has(filterValue(m, col, dynamicKeys))) return false;
        }
        return true;
    });

    const values = new Set();
    subset.forEach(m => {
        const val = filterValue(m, targetCol, dynamicKeys);
        if (val !== null && val !== undefined) values.add(val);
    });
    return values;
}

/* --- view state, shared with the ?v= URL parameter ---------------------- */

/** base64url so the value survives a query string without escaping. */
function encodeViewState(state) {
    return btoa(JSON.stringify(state))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function decodeViewState(encoded) {
    let base64 = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return JSON.parse(atob(base64));
}

/** Collapse the live view into the compact shape stored in the URL. */
function buildViewState({ filters = {}, dynamicKeys = {}, search = '', sort = null } = {}) {
    const state = {};

    const activeFilters = {};
    for (const key in filters) {
        if (filters[key] instanceof Set && filters[key].size > 0) {
            activeFilters[key] = Array.from(filters[key]);
        }
    }
    if (Object.keys(activeFilters).length > 0) state.f = activeFilters;

    const keys = {};
    for (const i in dynamicKeys) {
        if (dynamicKeys[i]) keys[i] = dynamicKeys[i];
    }
    if (Object.keys(keys).length > 0) state.k = keys;

    if (search) state.s = search;
    if (sort && sort.column) state.o = { c: sort.column, d: sort.direction };

    return state;
}
