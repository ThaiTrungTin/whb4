import { sb, cache, viewStates, showLoading, showToast, showConfirm, debounce, renderPagination, sanitizeFileName, filterButtonDefaultTexts, PLACEHOLDER_IMAGE_URL, currentUser, showView, openAutocomplete, initResizableTable, openTonKhoFilterPopover, updateFilterButtonTexts } from './app.js';

let selectedSanPhamImageFile = null;

// Danh sách cột Sản Phẩm (Tồn được nhúng trực tiếp trong cột Mã VT)
export const SAN_PHAM_COLUMNS = [
    { key: 'select', label: 'Chọn', default: true, locked: true },
    { key: 'url_hinh_anh', label: 'Ảnh', default: true },
    { key: 'ma_vt', label: 'Mã VT (kèm Tồn)', default: true },
    { key: 'ten_vt', label: 'Tên Vật Tư', default: true },
    { key: 'nganh', label: 'Ngành', default: true },
    { key: 'phu_trach', label: 'Phụ Trách', default: true },
];

export function getSanPhamColumnOrder() {
    const userKey = currentUser?.gmail || currentUser?.ho_ten || 'default';
    try {
        const stored = localStorage.getItem('sanPhamColOrder_' + userKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.error("Error reading sanPham col order:", e);
    }
    return null;
}

export function saveSanPhamColumnOrder(colOrder) {
    const userKey = currentUser?.gmail || currentUser?.ho_ten || 'default';
    try {
        localStorage.setItem('sanPhamColOrder_' + userKey, JSON.stringify(colOrder));
    } catch (e) {
        console.error("Error saving sanPham col order:", e);
    }
}

export function reorderSanPhamTableBodyCells(table, colOrder) {
    if (!table || !colOrder || colOrder.length === 0) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach(tr => {
        const cellsMap = {};
        tr.querySelectorAll('td').forEach(td => {
            if (td.dataset.col) {
                cellsMap[td.dataset.col] = td;
            }
        });

        // Always keep select first
        if (cellsMap['select']) {
            tr.appendChild(cellsMap['select']);
        }

        colOrder.forEach(colKey => {
            if (colKey !== 'select' && cellsMap[colKey]) {
                tr.appendChild(cellsMap[colKey]);
            }
        });
    });
}

export function applySanPhamColumnOrder(table) {
    if (!table) table = document.getElementById('san-pham-table') || document.querySelector('#view-san-pham table');
    if (!table) return;

    const colOrder = getSanPhamColumnOrder();
    if (!colOrder) return;

    const theadTr = table.querySelector('thead tr');
    if (theadTr) {
        const thsMap = {};
        theadTr.querySelectorAll('th').forEach(th => {
            if (th.dataset.col) thsMap[th.dataset.col] = th;
        });

        // Always keep select column first
        if (thsMap['select']) {
            theadTr.appendChild(thsMap['select']);
        }

        colOrder.forEach(colKey => {
            if (colKey !== 'select' && thsMap[colKey]) {
                theadTr.appendChild(thsMap[colKey]);
            }
        });
    }

    reorderSanPhamTableBodyCells(table, colOrder);
}

export function initSortableSanPhamColumns(table) {
    if (!table || typeof Sortable === 'undefined') return;
    const theadTr = table.querySelector('thead tr');
    if (!theadTr) return;

    if (theadTr._sortableInstance) {
        theadTr._sortableInstance.destroy();
    }

    theadTr._sortableInstance = Sortable.create(theadTr, {
        animation: 200,
        draggable: 'th:not(.no-drag):not([data-col="select"])',
        filter: '.col-resizer, .filter-btn, .sort-btn, input, .no-drag, [data-col="select"]',
        preventOnFilter: false,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onEnd: function () {
            const colOrder = Array.from(theadTr.querySelectorAll('th')).map(th => th.dataset.col).filter(Boolean);
            saveSanPhamColumnOrder(colOrder);
            reorderSanPhamTableBodyCells(table, colOrder);
            showToast('Đã lưu thứ tự cột Sản Phẩm', 'success');
        }
    });
}

export function getSanPhamColumnVisibility() {
    try {
        const stored = localStorage.getItem('sanPhamColumnVisibility');
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error("Error reading sanPhamColumnVisibility:", e);
    }
    const defaults = {};
    SAN_PHAM_COLUMNS.forEach(c => defaults[c.key] = c.default);
    return defaults;
}

export function saveSanPhamColumnVisibility(visibility) {
    try {
        localStorage.setItem('sanPhamColumnVisibility', JSON.stringify(visibility));
    } catch (e) {
        console.error("Error saving sanPhamColumnVisibility:", e);
    }
}

export function applySanPhamColumnState() {
    const table = document.getElementById('san-pham-table') || document.querySelector('#view-san-pham table');
    if (!table) return;

    const visibility = getSanPhamColumnVisibility();

    SAN_PHAM_COLUMNS.forEach(col => {
        if (col.locked) return;
        const isVisible = visibility[col.key] !== false;
        const thElements = table.querySelectorAll(`th[data-col="${col.key}"]`);
        const tdElements = table.querySelectorAll(`td[data-col="${col.key}"]`);

        thElements.forEach(el => el.classList.toggle('hidden', !isVisible));
        tdElements.forEach(el => el.classList.toggle('hidden', !isVisible));
    });
}

export function updateSanPhamSortButtonUI() {
    const state = viewStates['view-san-pham'];
    if (!state) return;
    const currentSort = state.sortBy || 'ma_vt';
    const isAsc = state.sortAsc !== false;

    const table = document.getElementById('san-pham-table') || document.querySelector('#view-san-pham table');
    if (!table) return;

    table.querySelectorAll('.sort-btn').forEach(btn => {
        const sortKey = btn.dataset.sortKey;
        if (sortKey === currentSort) {
            if (isAsc) {
                btn.classList.add('sort-asc');
                btn.classList.remove('sort-desc');
            } else {
                btn.classList.add('sort-desc');
                btn.classList.remove('sort-asc');
            }
        } else {
            btn.classList.remove('sort-asc', 'sort-desc');
        }
    });
}

function initSanPhamColumnsModal() {
    const modal = document.getElementById('san-pham-columns-modal');
    const openBtn = document.getElementById('san-pham-btn-columns');
    const closeBtn = document.getElementById('san-pham-columns-modal-close');
    const cancelBtn = document.getElementById('san-pham-columns-cancel-btn');
    const applyBtn = document.getElementById('san-pham-columns-apply-btn');
    const selectAllBtn = document.getElementById('san-pham-columns-select-all');
    const resetDefaultBtn = document.getElementById('san-pham-columns-reset-default');
    const listContainer = document.getElementById('san-pham-columns-checkbox-list');

    if (!modal || !openBtn) return;

    const renderCheckboxes = (visibility) => {
        if (!listContainer) return;
        listContainer.innerHTML = SAN_PHAM_COLUMNS.filter(c => !c.locked).map(col => `
            <label class="flex items-center gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer border border-transparent hover:border-gray-200 transition-all select-none">
                <input type="checkbox" data-col-key="${col.key}" ${visibility[col.key] !== false ? 'checked' : ''} class="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer">
                <span class="font-medium text-gray-800">${col.label}</span>
            </label>
        `).join('');
    };

    openBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentVis = getSanPhamColumnVisibility();
        renderCheckboxes(currentVis);
        modal.classList.remove('hidden');
    };

    const closeModal = () => modal.classList.add('hidden');
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;

    if (selectAllBtn) {
        selectAllBtn.onclick = (e) => {
            e.preventDefault();
            listContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        };
    }

    if (resetDefaultBtn) {
        resetDefaultBtn.onclick = (e) => {
            e.preventDefault();
            const defaults = {};
            SAN_PHAM_COLUMNS.forEach(c => defaults[c.key] = c.default);
            renderCheckboxes(defaults);
        };
    }

    if (applyBtn) {
        applyBtn.onclick = (e) => {
            e.preventDefault();
            const newVis = {};
            listContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                newVis[cb.dataset.colKey] = cb.checked;
            });
            SAN_PHAM_COLUMNS.filter(c => c.locked).forEach(c => {
                newVis[c.key] = true;
            });
            saveSanPhamColumnVisibility(newVis);
            applySanPhamColumnState();
            closeModal();
            showToast('Đã lưu cấu hình cột hiển thị!', 'success');
        };
    }
}

function buildSanPhamQuery() {
    const state = viewStates['view-san-pham'];
    let query = sb.from('san_pham').select('*', { count: 'exact' });

    if (currentUser?.phan_quyen === 'View') {
        query = query.eq('phu_trach', currentUser?.ho_ten || '');
    }

    if (state.searchTerm) query = query.or(`ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%`);
    if (state.filters.ma_vt?.length > 0) query = query.in('ma_vt', state.filters.ma_vt);
    if (state.filters.ten_vt?.length > 0) query = query.in('ten_vt', state.filters.ten_vt);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    
    return query;
}

export async function fetchSanPham(page = viewStates['view-san-pham'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-san-pham'].currentPage = page;
        const state = viewStates['view-san-pham'];
        state.selected.clear();
        updateSanPhamActionButtonsState();
        updateSanPhamSelectionInfo(); 

        const { itemsPerPage } = state;
        const from = (page - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;
        
        let sortBy = state.sortBy || 'ma_vt';
        let sortAsc = state.sortAsc !== false;
        
        let query = buildSanPhamQuery().order(sortBy, { ascending: sortAsc, nullsFirst: false }).range(from, to);

        const { data: sanPhamData, error, count } = await query;
        
        if (error) {
            console.error("fetchSanPham error:", error);
            showToast("Không thể tải dữ liệu sản phẩm: " + error.message, 'error');
            renderSanPhamTable([]);
        } else {
            state.totalFilteredCount = count || 0; 
            
            let dataWithStock = (sanPhamData || []).map(sp => ({
                ...sp,
                total_ton_cuoi: 0
            }));

            if (sanPhamData && sanPhamData.length > 0) {
                const maVts = sanPhamData.map(p => p.ma_vt);
                try {
                    const { data: stockData, error: stockError } = await sb
                        .from('ton_kho_update')
                        .select('ma_vt, ton_cuoi')
                        .in('ma_vt', maVts);
                    
                    if (stockError) {
                        console.warn("Lỗi khi tải dữ liệu tồn kho cho sản phẩm:", stockError);
                    } else if (stockData) {
                        const stockMap = new Map();
                        stockData.forEach(item => {
                            const currentStock = stockMap.get(item.ma_vt) || 0;
                            stockMap.set(item.ma_vt, currentStock + (item.ton_cuoi || 0));
                        });

                        dataWithStock = sanPhamData.map(sp => ({
                            ...sp,
                            total_ton_cuoi: stockMap.get(sp.ma_vt) || 0
                        }));
                    }
                } catch (stockEx) {
                    console.warn("Lỗi ngoại lệ khi tính tồn kho:", stockEx);
                }
            }

            cache.sanPhamList = dataWithStock;
            
            renderSanPhamTable(dataWithStock);
            const table = document.getElementById('san-pham-table');
            if (table) applySanPhamColumnOrder(table);
            applySanPhamColumnState();
            updateSanPhamSortButtonUI();
            renderPagination('san-pham', count || 0, from, to);
            updateSanPhamSelectionInfo(); 
            updateFilterButtonTexts('san-pham');
        }
    } catch (err) {
        console.error("fetchSanPham unexpected exception:", err);
        renderSanPhamTable([]);
    } finally {
        if (showLoader) showLoading(false);
    }
}

function renderSanPhamTable(data) {
    const spTableBody = document.getElementById('san-pham-table-body');
    if (!spTableBody) return;

    if (data && data.length > 0) {
        const html = data.map(sp => {
            const isSelected = viewStates['view-san-pham'].selected.has(sp.ma_vt);
            const imageHtml = sp.url_hinh_anh
                ? `<img src="${sp.url_hinh_anh}" alt="${sp.ten_vt || ''}" class="w-10 h-10 object-cover rounded-md thumbnail-image" data-large-src="${sp.url_hinh_anh}">`
                : `<div class="w-10 h-10 bg-gray-200 rounded-md flex items-center justify-center text-gray-400 text-xs">Ảnh</div>`;
            
            const tonCuoi = typeof sp.total_ton_cuoi === 'number' ? sp.total_ton_cuoi : (Number(sp.total_ton_cuoi) || 0);
            const tonCuoiText = tonCuoi.toLocaleString();
            const tonCuoiClass = tonCuoi > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold';

            return `
                <tr data-id="${sp.ma_vt}" class="cursor-pointer hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-100' : ''}">
                    <td class="px-1 py-1 border border-gray-300 text-center" data-col="select">
                        <input type="checkbox" class="san-pham-select-row cursor-pointer" data-id="${sp.ma_vt}" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td class="px-2 py-1 border border-gray-300 text-center" data-col="url_hinh_anh">
                        <div class="flex justify-center items-center">${imageHtml}</div>
                    </td>
                    <td class="px-3 py-1 text-sm font-medium text-gray-900 border border-gray-300" data-col="ma_vt">
                        <div class="flex justify-between items-center gap-2">
                            <a href="#" data-ma-vt="${sp.ma_vt}" class="san-pham-ma-vt-link text-blue-600 hover:underline font-semibold">${sp.ma_vt}</a>
                            <span class="text-xs ${tonCuoiClass} whitespace-nowrap bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">Tồn: ${tonCuoiText}</span>
                        </div>
                    </td>
                    <td class="px-3 py-1 text-sm text-gray-700 break-words border border-gray-300" data-col="ten_vt">${sp.ten_vt || ''}</td>
                    <td class="px-3 py-1 text-sm text-gray-600 border border-gray-300 text-center" data-col="nganh">${sp.nganh || ''}</td>
                    <td class="px-3 py-1 text-sm text-gray-600 border border-gray-300 text-center" data-col="phu_trach">${sp.phu_trach || ''}</td>
                </tr>
            `;
        }).join('');
        spTableBody.innerHTML = html;
    } else {
        spTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-500 font-medium">Không có dữ liệu sản phẩm</td></tr>';
    }
}

function updateSanPhamSelectionInfo() {
    const state = viewStates['view-san-pham'];
    const selectedCount = state.selected.size;
    const totalCount = state.totalFilteredCount;
    const selectionText = `${selectedCount} / ${totalCount} hàng được chọn`;
    
    const selectionInfoEl = document.getElementById('san-pham-selection-info');
    if (selectionInfoEl) {
        selectionInfoEl.textContent = selectionText;
    }
}

function updateSanPhamActionButtonsState() {
    const selectedCount = viewStates['view-san-pham'].selected.size;
    const editBtn = document.getElementById('san-pham-btn-edit');
    const deleteBtn = document.getElementById('san-pham-btn-delete');
    if (editBtn) editBtn.disabled = selectedCount !== 1;
    if (deleteBtn) deleteBtn.disabled = selectedCount === 0;
}

// Biến lưu trữ danh sách duy nhất để dùng cho autocomplete
let uniqueNganhList = [];
let uniquePhuTrachList = [];
let nganhOwnerMap = new Map();

async function openSanPhamModal(sp = null) {
    const modal = document.getElementById('san-pham-modal');
    const form = document.getElementById('san-pham-form');
    form.reset();
    selectedSanPhamImageFile = null;

    document.getElementById('san-pham-modal-title').textContent = sp ? 'Sửa Sản Phẩm' : 'Thêm Sản Phẩm Mới';
    document.getElementById('san-pham-modal-ma-vt').readOnly = !!sp;
    document.getElementById('san-pham-modal-ma-vt').classList.toggle('bg-gray-200', !!sp);
    document.getElementById('san-pham-edit-mode-ma-vt').value = sp ? sp.ma_vt : '';

    const imagePreview = document.getElementById('san-pham-modal-image-preview');
    const removeImageBtn = document.getElementById('san-pham-modal-remove-image-btn');
    const currentImageUrlInput = document.getElementById('san-pham-modal-hinh-anh-url-hien-tai');

    if (sp) {
        document.getElementById('san-pham-modal-ma-vt').value = sp.ma_vt;
        document.getElementById('san-pham-modal-ten-vt').value = sp.ten_vt;
        document.getElementById('san-pham-modal-phu-trach').value = sp.phu_trach || '';
        document.getElementById('san-pham-modal-nganh').value = sp.nganh || '';
        currentImageUrlInput.value = sp.url_hinh_anh || '';
        imagePreview.src = sp.url_hinh_anh || PLACEHOLDER_IMAGE_URL;
    } else {
        currentImageUrlInput.value = '';
        imagePreview.src = PLACEHOLDER_IMAGE_URL;
    }

    removeImageBtn.classList.toggle('hidden', !currentImageUrlInput.value);
    
    // Tải dữ liệu duy nhất cho gợi ý
    try {
        const { data: uniqueData, error } = await sb.from('san_pham').select('nganh, phu_trach');
        if (!error && uniqueData) {
            nganhOwnerMap.clear();
            const nganhSet = new Set();
            const phuTrachSetInSp = new Set();
            
            uniqueData.forEach(item => {
                if (item.nganh) {
                    nganhSet.add(item.nganh);
                    if (item.phu_trach) nganhOwnerMap.set(item.nganh, item.phu_trach);
                }
                if (item.phu_trach) phuTrachSetInSp.add(item.phu_trach);
            });
            
            uniqueNganhList = Array.from(nganhSet).sort();
            const phuTrachSetFromUsers = new Set(cache.userList.map(u => u.ho_ten).filter(Boolean));
            uniquePhuTrachList = Array.from(new Set([...phuTrachSetInSp, ...phuTrachSetFromUsers])).sort();
        }
    } catch (err) {
        console.error("Lỗi khi tải gợi ý Ngành/Phụ trách:", err);
    }

    modal.classList.remove('hidden');
}

function setupSanPhamAutocomplete() {
    const nganhInput = document.getElementById('san-pham-modal-nganh');
    const phuTrachInput = document.getElementById('san-pham-modal-phu-trach');
    if (!nganhInput || !phuTrachInput) return;

    const handleNganhSuggest = () => {
        const val = nganhInput.value.toLowerCase();
        const selectedPhuTrach = phuTrachInput.value;
        
        let suggestions = uniqueNganhList
            .filter(n => n.toLowerCase().includes(val))
            .map(n => {
                const owner = nganhOwnerMap.get(n) || '';
                return {
                    value: n,
                    owner: owner,
                    isOwned: selectedPhuTrach && owner === selectedPhuTrach
                };
            });
        
        suggestions.sort((a, b) => {
            if (a.isOwned && !b.isOwned) return -1;
            if (!a.isOwned && b.isOwned) return 1;
            return a.value.localeCompare(b.value);
        });

        openAutocomplete(nganhInput, suggestions, {
            valueKey: 'value',
            primaryTextKey: 'value',
            secondaryTextKey: 'owner', 
            itemClass: (item) => {
                return item.isOwned ? 'bg-green-50 hover:bg-green-100' : 'bg-yellow-50 hover:bg-yellow-100';
            },
            onSelect: (v) => { nganhInput.value = v; }
        });
    };

    const handlePhuTrachSuggest = () => {
        const val = phuTrachInput.value.toLowerCase();
        const suggestions = uniquePhuTrachList
            .filter(p => p.toLowerCase().includes(val))
            .map(p => ({ value: p }));
        
        openAutocomplete(phuTrachInput, suggestions, {
            valueKey: 'value',
            primaryTextKey: 'value',
            onSelect: (v) => { 
                const isChanged = phuTrachInput.value !== v;
                phuTrachInput.value = v;
                if (isChanged) {
                    nganhInput.value = '';
                }
                if (nganhInput.value) handleNganhSuggest();
            }
        });
    };

    nganhInput.addEventListener('focus', handleNganhSuggest);
    nganhInput.addEventListener('input', debounce(handleNganhSuggest, 200));

    phuTrachInput.addEventListener('focus', handlePhuTrachSuggest);
    phuTrachInput.addEventListener('input', (e) => {
        nganhInput.value = '';
        debounce(handlePhuTrachSuggest, 200)();
    });
}

async function handleSaveSanPham(e) {
    e.preventDefault();
    const ma_vt_orig = document.getElementById('san-pham-edit-mode-ma-vt').value;
    const isEdit = !!ma_vt_orig;
    let url_hinh_anh = document.getElementById('san-pham-modal-hinh-anh-url-hien-tai').value;
    const old_url_hinh_anh = isEdit ? (cache.sanPhamList.find(p => p.ma_vt === ma_vt_orig)?.url_hinh_anh || null) : null;
    
    const sanPhamData = {
        ma_vt: document.getElementById('san-pham-modal-ma-vt').value.trim(),
        ten_vt: document.getElementById('san-pham-modal-ten-vt').value.trim(),
        nganh: document.getElementById('san-pham-modal-nganh').value.trim(),
        phu_trach: document.getElementById('san-pham-modal-phu-trach').value.trim()
    };

    if (!sanPhamData.ma_vt) { showToast("Vui lòng nhập Mã vật tư.", 'error'); return; }
    if (!sanPhamData.ten_vt) { showToast("Vui lòng nhập Tên vật tư.", 'error'); return; }
    if (!sanPhamData.nganh) { showToast("Vui lòng nhập/chọn Ngành.", 'error'); return; }
    if (!sanPhamData.phu_trach) { showToast("Vui lòng nhập/chọn Phụ trách.", 'error'); return; }

    showLoading(true);
    try {
        if (selectedSanPhamImageFile) {
            const safeFileName = sanitizeFileName(selectedSanPhamImageFile.name);
            const filePath = `san_pham/${Date.now()}-${safeFileName}`;

            const { error: uploadError } = await sb.storage.from('anh_dai_dien').upload(filePath, selectedSanPhamImageFile);
            if (uploadError) throw new Error(`Lỗi tải ảnh lên: ${uploadError.message}`);

            const { data: urlData } = sb.storage.from('anh_dai_dien').getPublicUrl(filePath);
            url_hinh_anh = urlData.publicUrl;
        } 
        
        if ((selectedSanPhamImageFile || !url_hinh_anh) && old_url_hinh_anh) {
             const oldFileName = old_url_hinh_anh.split('/').pop();
             await sb.storage.from('anh_dai_dien').remove([`san_pham/${oldFileName}`]);
        }

        sanPhamData.url_hinh_anh = url_hinh_anh;

        const { error } = isEdit
            ? await sb.from('san_pham').update(sanPhamData).eq('ma_vt', ma_vt_orig)
            : await sb.from('san_pham').insert(sanPhamData);

        if (error) throw error;
        showToast(`Lưu sản phẩm thành công!`, 'success');
        document.getElementById('san-pham-modal').classList.add('hidden');
        fetchSanPham(isEdit ? viewStates['view-san-pham'].currentPage : 1, false);
    } catch (error) {
        if (error.code === '23505') showToast(`Mã vật tư "${sanPhamData.ma_vt}" đã tồn tại.`, 'error');
        else showToast(`Lỗi: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

async function handleDeleteMultipleSanPham() {
    const selectedIds = [...viewStates['view-san-pham'].selected];
    if (selectedIds.length === 0) return;

    showLoading(true);
    try {
        const { count, error: checkError } = await sb
            .from('chi_tiet')
            .select('ma_vt', { count: 'exact', head: true })
            .in('ma_vt', selectedIds);

        if (checkError) throw checkError;

        if (count > 0) {
            showToast('Không thể xóa. Một hoặc nhiều sản phẩm đã có giao dịch Nhập/Xuất.', 'error');
            return; 
        }

        showLoading(false); 
        const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selectedIds.length} sản phẩm?`);
        if (!confirmed) return;

        showLoading(true); 
        const { data: productsToDelete, error: selectError } = await sb.from('san_pham').select('url_hinh_anh').in('ma_vt', selectedIds);
        if (selectError) throw selectError;

        const filesToRemove = productsToDelete
            .map(p => p.url_hinh_anh)
            .filter(Boolean)
            .map(url => `san_pham/${url.split('/').pop()}`);
            
        if (filesToRemove.length > 0) await sb.storage.from('anh_dai_dien').remove(filesToRemove);

        const { error: deleteError = null } = await sb.from('san_pham').delete().in('ma_vt', selectedIds);
        if (deleteError) throw deleteError;

        showToast(`Đã xóa ${selectedIds.length} sản phẩm.`, 'success');
        fetchSanPham(1, false);
    } catch (error) {
        showToast(`Lỗi khi xóa: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

async function handleExcelExport() {
    const modal = document.getElementById('excel-export-modal');
    modal.classList.remove('hidden');

    const exportAndClose = async (exportAll) => {
        modal.classList.add('hidden');
        showLoading(true);

        try {
            let query;
            if (exportAll) {
                query = sb.from('san_pham').select('ma_vt, ten_vt, nganh, phu_trach').limit(50000);
            } else {
                query = buildSanPhamQuery().select('ma_vt, ten_vt, nganh, phu_trach').limit(50000);
            }

            const { data, error } = await query.order('ma_vt');
            if (error) throw error;

            if (!data || data.length === 0) {
                showToast("Không có dữ liệu để xuất.", 'info');
                return;
            }

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Sản Phẩm");
            XLSX.writeFile(workbook, `SanPham_${new Date().toISOString().slice(0,10)}.xlsx`);
            showToast("Xuất Excel thành công!", 'success');
        } catch (err) {
            showToast(`Lỗi khi xuất Excel: ${err.message}`, 'error');
        } finally {
            showLoading(false);
        }
    };

    document.getElementById('excel-export-filtered-btn').onclick = () => exportAndClose(false);
    document.getElementById('excel-export-all-btn').onclick = () => exportAndClose(true);
    document.getElementById('excel-export-cancel-btn').onclick = () => modal.classList.add('hidden');
}

export function initSanPhamView() {
    const viewContainer = document.getElementById('view-san-pham');
    if (!viewContainer) return;

    const role = currentUser?.phan_quyen;
    const isAdminOrUser = role === 'Admin' || role === 'User';
    viewContainer.querySelectorAll('.sp-admin-only').forEach(el => el.classList.toggle('hidden', !isAdminOrUser));

    setupSanPhamAutocomplete();

    const table = document.getElementById('san-pham-table');
    if (table) {
        applySanPhamColumnOrder(table);
        initSortableSanPhamColumns(table);
        initResizableTable(table, 'san_pham_col_widths');
    }
    initSanPhamColumnsModal();
    applySanPhamColumnState();
    updateSanPhamSortButtonUI();

    const searchInput = document.getElementById('san-pham-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            viewStates['view-san-pham'].searchTerm = searchInput.value;
            updateFilterButtonTexts('san-pham');
            fetchSanPham(1);
        }, 500));
    }
    
    viewContainer.addEventListener('click', e => {
        const filterBtn = e.target.closest('.filter-btn');
        if (filterBtn) {
            e.stopPropagation();
            openTonKhoFilterPopover(filterBtn, 'view-san-pham');
            return;
        }

        const sortBtn = e.target.closest('.sort-btn');
        if (sortBtn) {
            e.stopPropagation();
            const sortKey = sortBtn.dataset.sortKey;
            if (!sortKey) return;

            const state = viewStates['view-san-pham'];
            if (state.sortBy === sortKey) {
                if (state.sortAsc === true) {
                    state.sortAsc = false;
                } else {
                    state.sortBy = 'ma_vt';
                    state.sortAsc = true;
                }
            } else {
                state.sortBy = sortKey;
                state.sortAsc = true;
            }
            updateSanPhamSortButtonUI();
            fetchSanPham(1);
            return;
        }
    });

    const resetFiltersBtn = document.getElementById('san-pham-reset-filters');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            viewStates['view-san-pham'].searchTerm = '';
            viewStates['view-san-pham'].filters = { ma_vt: [], ten_vt: [], nganh: [], phu_trach: [] };
            viewStates['view-san-pham'].sortBy = 'ma_vt';
            viewStates['view-san-pham'].sortAsc = true;
            updateFilterButtonTexts('san-pham');
            updateSanPhamSortButtonUI();
            fetchSanPham(1);
        });
    }

    const tableBody = document.getElementById('san-pham-table-body');
    if (tableBody) {
        tableBody.addEventListener('click', e => {
            if (e.target.closest('.thumbnail-image')) {
                const imgSrc = e.target.closest('.thumbnail-image').dataset.largeSrc;
                const viewerImg = document.getElementById('image-viewer-img');
                const viewerModal = document.getElementById('image-viewer-modal');
                if (viewerImg) viewerImg.src = imgSrc;
                if (viewerModal) viewerModal.classList.remove('hidden');
                return;
            }

            const maVtLink = e.target.closest('.san-pham-ma-vt-link');
            if (maVtLink) {
                e.preventDefault();
                const ma_vt = maVtLink.dataset.maVt;
                if (ma_vt) {
                    const tonKhoState = viewStates['view-ton-kho'];
                    tonKhoState.searchTerm = '';
                    tonKhoState.filters = { ma_vt: [ma_vt], lot: [], date: [], tinh_trang: [], nganh: [], phu_trach: [] };
                    tonKhoState.stockAvailability = 'all';
                    sessionStorage.setItem('tonKhoStockAvailability', 'all');
                    showView('view-ton-kho');
                }
                return; 
            }

            const row = e.target.closest('tr');
            if (!row || !row.dataset.id) return;
            const id = row.dataset.id;
            const checkbox = row.querySelector('.san-pham-select-row');
            if (checkbox) {
                if (e.target.type !== 'checkbox') {
                    checkbox.checked = !checkbox.checked;
                }
                viewStates['view-san-pham'].selected[checkbox.checked ? 'add' : 'delete'](id);
                row.classList.toggle('bg-blue-100', checkbox.checked);
                updateSanPhamActionButtonsState();
                updateSanPhamSelectionInfo(); 
            }
        });
    }

    const selectAllCb = document.getElementById('san-pham-select-all');
    if (selectAllCb) {
        selectAllCb.addEventListener('click', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.san-pham-select-row').forEach(cb => {
                const row = cb.closest('tr');
                if (row && cb.checked !== isChecked) {
                     cb.checked = isChecked;
                     const id = row.dataset.id;
                     viewStates['view-san-pham'].selected[isChecked ? 'add' : 'delete'](id);
                     row.classList.toggle('bg-blue-100', isChecked);
                }
            });
            updateSanPhamActionButtonsState();
            updateSanPhamSelectionInfo(); 
        });
    }
    
    const addBtn = document.getElementById('san-pham-btn-add');
    if (addBtn) addBtn.addEventListener('click', () => openSanPhamModal());

    const editBtn = document.getElementById('san-pham-btn-edit');
    if (editBtn) {
        editBtn.addEventListener('click', async () => {
            const ma_vt = [...viewStates['view-san-pham'].selected][0];
            if (!ma_vt) return;
            const { data } = await sb.from('san_pham').select('*').eq('ma_vt', ma_vt).single();
            if (data) openSanPhamModal(data);
        });
    }

    const deleteBtn = document.getElementById('san-pham-btn-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteMultipleSanPham);

    const excelBtn = document.getElementById('san-pham-btn-excel');
    if (excelBtn) excelBtn.addEventListener('click', handleExcelExport);

    const spForm = document.getElementById('san-pham-form');
    if (spForm) spForm.addEventListener('submit', handleSaveSanPham);

    const cancelSpBtn = document.getElementById('cancel-san-pham-btn');
    if (cancelSpBtn) {
        cancelSpBtn.addEventListener('click', () => {
            const spModal = document.getElementById('san-pham-modal');
            if (spModal) spModal.classList.add('hidden');
        });
    }
    
    const itemsPerPageEl = document.getElementById('san-pham-items-per-page');
    if (itemsPerPageEl) {
        itemsPerPageEl.addEventListener('change', (e) => {
            viewStates['view-san-pham'].itemsPerPage = parseInt(e.target.value, 10);
            fetchSanPham(1);
        });
    }

    const prevPageBtn = document.getElementById('san-pham-prev-page');
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => fetchSanPham(viewStates['view-san-pham'].currentPage - 1));

    const nextPageBtn = document.getElementById('san-pham-next-page');
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => fetchSanPham(viewStates['view-san-pham'].currentPage + 1));
    
    const pageInput = document.getElementById('san-pham-page-input');
    if (pageInput) {
        const handlePageJump = () => {
            const state = viewStates['view-san-pham'];
            let targetPage = parseInt(pageInput.value, 10);
            const totalPages = Math.ceil(state.totalFilteredCount / state.itemsPerPage);

            if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
            else if (targetPage > totalPages && totalPages > 0) targetPage = totalPages;
            else if (totalPages === 0) targetPage = 1;
            
            pageInput.value = targetPage;
            if (targetPage !== state.currentPage) fetchSanPham(targetPage);
        };
        pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handlePageJump(); e.target.blur(); }
        });
        pageInput.addEventListener('change', handlePageJump);
    }
    
    const processSpImageFile = (file) => {
        if (file && file.type.startsWith('image/')) {
            selectedSanPhamImageFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('san-pham-modal-image-preview');
                const removeBtn = document.getElementById('san-pham-modal-remove-image-btn');
                const urlInput = document.getElementById('san-pham-modal-hinh-anh-url-hien-tai');
                if (preview) preview.src = e.target.result;
                if (removeBtn) removeBtn.classList.remove('hidden');
                if (urlInput) urlInput.value = 'temp-new-image';
            };
            reader.readAsDataURL(file);
        }
    };

    const imageUploadInput = document.getElementById('san-pham-modal-image-upload');
    if (imageUploadInput) imageUploadInput.addEventListener('change', (e) => processSpImageFile(e.target.files[0]));

    const imagePasteArea = document.getElementById('san-pham-image-paste-area');
    if (imagePasteArea) {
        imagePasteArea.addEventListener('paste', (e) => {
            e.preventDefault();
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    processSpImageFile(items[i].getAsFile());
                    return;
                }
            }
        });
    }

    const removeImageBtn = document.getElementById('san-pham-modal-remove-image-btn');
    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', () => {
            selectedSanPhamImageFile = null;
            const uploadEl = document.getElementById('san-pham-modal-image-upload');
            const previewEl = document.getElementById('san-pham-modal-image-preview');
            const urlInputEl = document.getElementById('san-pham-modal-hinh-anh-url-hien-tai');
            if (uploadEl) uploadEl.value = '';
            if (previewEl) previewEl.src = PLACEHOLDER_IMAGE_URL;
            removeImageBtn.classList.add('hidden');
            if (urlInputEl) urlInputEl.value = '';
        });
    }
}