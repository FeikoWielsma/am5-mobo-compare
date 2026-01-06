document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');
    const countDisplay = document.getElementById('countDisplay');
    const tableRows = document.querySelectorAll('.mobo-row');

    // Search Filter
    if (searchInput) {
        searchInput.addEventListener('keyup', function (e) {
            const term = e.target.value.toLowerCase();
            let visibleCount = 0;

            tableRows.forEach(row => {
                const brand = row.getAttribute('data-brand');
                const model = row.getAttribute('data-model');
                const chipset = row.getAttribute('data-chipset');

                if (brand.includes(term) || model.includes(term) || chipset.includes(term)) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });
            countDisplay.innerText = visibleCount + ' motherboards visible';
        });
    }

    // Compare Logic
    const checkboxes = document.querySelectorAll('.mobo-select');
    const compareBar = document.getElementById('compareBar');
    const selectedCountSpan = document.getElementById('selectedCount');
    const compareBtn = document.getElementById('compareBtn');

    let selectedIds = [];

    document.body.addEventListener('change', function (e) {
        if (e.target.classList.contains('mobo-select')) {
            const id = e.target.value;
            if (e.target.checked) {
                selectedIds.push(id);
            } else {
                selectedIds = selectedIds.filter(x => x !== id);
            }
            updateCompareBar();
        }
    });

    function updateCompareBar() {
        if (!selectedCountSpan) return;
        selectedCountSpan.innerText = selectedIds.length;
        if (selectedIds.length > 0) {
            compareBar.style.display = 'block';
        } else {
            compareBar.style.display = 'none';
        }
    }

    if (compareBtn) {
        compareBtn.addEventListener('click', function () {
            if (selectedIds.length < 2) {
                alert("Please select at least 2 motherboards to compare.");
                return;
            }
            window.location.href = '/compare?ids=' + selectedIds.join(',');
        });
    }
});
