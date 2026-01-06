# Bug Fixes Post-Refactoring

## Issues Discovered

During refactoring, two bugs were introduced due to schema changes not being fully propagated:

### 1. AttributeError: 'Motherboard' object has no attribute 'data'

**Location**: `app.py` routes

**Problem**: The old schema had a `data` column that stored everything. The new schema has individual fields (`brand`, `model`, `chipset`) and a `specs` JSON column.

**Affected Code**:
```python
# app.py - index route (OLD)
mobos = [m.data for m in service.get_all_mobos()]

# app.py - api_mobos route (OLD)
d = m.data
return {'id': d.get('id'), ...}
```

**Fix**: Access individual attributes and merge specs:
```python
# app.py - index route (FIXED)
for m in service.get_all_mobos():
    mobos.append({
        'id': m.id,
        'Brand': m.brand,
        'Model': m.model,
        'Chipset': m.chipset,
        **m.specs  # Merge nested specs
    })

# app.py - api_mobos route (FIXED)
return {
    'id': m.id,
    'Brand': m.brand,
    'Model': m.model,
    'Chipset': m.chipset
}
```

---

### 2. Form Factor Display Shows `{}`

**Location**: `templates/compare.html` line 24

**Problem**: Template was accessing `m.dot.form_factor` but the actual path is `m.dot.motherboard.general.form_factor` (based on Excel hierarchy: "Motherboard|General|Form Factor").

**Affected Code**:
```html
<!-- OLD -->
<span class="badge bg-secondary">{{ m.dot.form_factor }}</span>
```

**Data Structure**:
```json
{
  "Motherboard": {
    "General": {
      "Form Factor": "ATX"
    }
  }
}
```

**Fix**: Use correct nested path:
```html
<!-- FIXED -->
<span class="badge bg-secondary">{{ m.dot.motherboard.general.form_factor }}</span>
```

The DotWrapper correctly normalizes `form_factor` to match `Form Factor`, but it was looking at the wrong level.

---

### 3. Image Link Path Correction

**Bonus Fix**: Also corrected image link path from `rear_io_image.view` to `image.view`.

---

## Files Modified

1. **[app.py](file:///c:/Git/mobo-parse/app.py)** - Lines 26-38, 51-64
   - Fixed `index()` route to build dict from Motherboard attributes
   - Fixed `api_mobos()` route to access attributes directly

2. **[compare.html](file:///c:/Git/mobo-parse/templates/compare.html)** - Line 24, 27
   - Fixed form_factor path: `m.dot.motherboard.general.form_factor`
   - Fixed image link path: `m.dot.image.view`

---

## Testing

After fixes, both issues resolved:

```bash
# Homepage now loads without errors
✅ Index page displays all motherboards

# Compare page shows form factor correctly
✅ "ASRock X870E Taichi Lite" shows: X870E | ATX
   (instead of X870E | {})
```

---

##Root Cause

The refactoring changed the database schema from a single `data` JSON column to a split model:
- Direct columns: `id`, `brand`, `model`, `chipset`
- JSON column: `specs` (contains nested hierarchy)

The template and route code wasn't updated to match this new schema.

---

## Prevention

**For future refactoring**:
1. ✅ Search codebase for all uses of changed attributes (`grep -r "\.data" .`)
2. ✅ Test all routes after schema changes
3. ✅ Add integration tests that exercise templates
4. ✅ Test in browser, not just unit tests
