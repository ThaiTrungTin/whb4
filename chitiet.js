import { sb, cache, viewStates, currentUser, showLoading, showToast, debounce, renderPagination, filterButtonDefaultTexts, showView, initResizableTable, openTonKhoFilterPopover, updateFilterButtonTexts, formatMaNxHtml, formatMaNxBadgeHtml } from './app.js';
import { openDonHangModal } from './don-hang.js';

function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

async function updateChiTietHeaderCounts() {
    const state = viewStates['view-chi-tiet'];
    const nhapEl = document.getElementById('chi-tiet-header-nhap-count');
    const xuatEl = document.getElementById('chi-tiet-header-xuat-count');
    if (!nhapEl || !xuatEl) return;
    
    [nhapEl, xuatEl].forEach(el => el.textContent = '(...)');

    try {
        const { data, error } = await sb.rpc('get_chi_tiet_summary', {
            _search_term: state.searchTerm || '',
            _from_date: state.filters.from_date || null,
            _to_date: state.filters.to_date || null,
            _ma_kho_filter: state.filters.ma_kho || [],
            _ma_nx_filter: state.filters.ma_nx || [],
            _ma_vt_filter: state.filters.ma_vt || [],
            _lot_filter: state.filters.lot || [],
            _nganh_filter: state.filters.nganh || [],
            _phu_trach_filter: state.filters.phu_trach || [],
            _user_role: currentUser?.phan_quyen || 'View',
            _user_ho_ten: currentUser?.ho_ten || ''
        });
        if (error) throw error;
        
        if (data && data.length > 0) {
            const totals = data[0];
            nhapEl.textContent = `(${(totals.total_nhap || 0).toLocaleString()})`;
            xuatEl.textContent = `(${(totals.total_xuat || 0).toLocaleString()})`;
        } else {
            [nhapEl, xuatEl].forEach(el => el.textContent = '(0)');
        }
    } catch (err) {
        console.error("Error fetching chi tiet summary:", err);
        [nhapEl, xuatEl].forEach(el => el.textContent = '(lỗi)');
    }
}

export const CHI_TIET_COLUMNS = [
    { key: 'thoi_gian', label: 'Thời Gian', default: true },
    { key: 'ma_kho', label: 'Mã Kho', default: true },
    { key: 'ma_nx', label: 'Mã NX', default: true },
    { key: 'ma_vach', label: 'Code + Lot + EXP', default: true },
    { key: 'ma_vt', label: 'Mã VT', default: true },
    { key: 'ten_vt', label: 'Tên VT', default: true },
    { key: 'lot', label: 'LOT', default: true },
    { key: 'date', label: 'Date', default: true },
    { key: 'yc_sl', label: 'Y/C', default: true },
    { key: 'nhap', label: 'Nhập', default: true },
    { key: 'xuat', label: 'Xuất', default: true },
    { key: 'loai', label: 'Loại', default: true },
    { key: 'yeu_cau', label: 'Yêu Cầu', default: true },
    { key: 'muc_dich', label: 'Mục Đích', default: true },
    { key: 'nganh', label: 'Ngành', default: false },
    { key: 'phu_trach', label: 'Phụ Trách', default: false }
];

export function getChiTietColumnOrder() {
    const userKey = currentUser?.gmail || currentUser?.ho_ten || 'default';
    try {
        const stored = localStorage.getItem('chiTietColOrder_' + userKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.error("Error reading ChiTiet col order:", e);
    }
    return null;
}

export function saveChiTietColumnOrder(colOrder) {
    const userKey = currentUser?.gmail || currentUser?.ho_ten || 'default';
    try {
        localStorage.setItem('chiTietColOrder_' + userKey, JSON.stringify(colOrder));
    } catch (e) {
        console.error("Error saving ChiTiet col order:", e);
    }
}

export function reorderChiTietTableBodyCells(table, colOrder) {
    if (!table || !colOrder || colOrder.length === 0) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    tbody.querySelectorAll('tr').forEach(tr => {
        // Skip group header rows — they use colspan and must not be reordered
        if (tr.dataset.groupMakho) return;

        const cellsMap = {};
        tr.querySelectorAll('td').forEach(td => {
            if (td.dataset.col) {
                cellsMap[td.dataset.col] = td;
            }
        });

        colOrder.forEach(colKey => {
            if (cellsMap[colKey]) {
                tr.appendChild(cellsMap[colKey]);
            }
        });
    });
}

export function applyChiTietColumnOrder(table) {
    if (!table) table = document.getElementById('chi-tiet-table') || document.querySelector('#view-chi-tiet table');
    if (!table) return;

    const colOrder = getChiTietColumnOrder();
    if (!colOrder) return;

    const theadTr = table.querySelector('thead tr');
    if (theadTr) {
        const thsMap = {};
        theadTr.querySelectorAll('th').forEach(th => {
            if (th.dataset.col) thsMap[th.dataset.col] = th;
        });

        colOrder.forEach(colKey => {
            if (thsMap[colKey]) {
                theadTr.appendChild(thsMap[colKey]);
            }
        });
    }

    reorderChiTietTableBodyCells(table, colOrder);
}

export function initSortableChiTietColumns(table) {
    if (!table || typeof Sortable === 'undefined') return;
    const theadTr = table.querySelector('thead tr');
    if (!theadTr) return;

    if (theadTr._sortableInstance) {
        theadTr._sortableInstance.destroy();
    }

    theadTr._sortableInstance = Sortable.create(theadTr, {
        animation: 200,
        draggable: 'th:not(.no-drag)',
        filter: '.col-resizer, .filter-btn, .sort-btn, input, .no-drag',
        preventOnFilter: false,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onEnd: function () {
            const colOrder = Array.from(theadTr.querySelectorAll('th')).map(th => th.dataset.col).filter(Boolean);
            saveChiTietColumnOrder(colOrder);
            reorderChiTietTableBodyCells(table, colOrder);
            showToast('Đã lưu thứ tự cột Chi Tiết', 'success');
        }
    });
}

export function getChiTietColumnVisibility() {
    try {
        const stored = localStorage.getItem('chiTietColumnVisibility');
        if (stored) {
            const parsed = JSON.parse(stored);
            const visibility = {};
            CHI_TIET_COLUMNS.forEach(col => {
                visibility[col.key] = parsed[col.key] !== undefined ? parsed[col.key] : col.default;
            });
            return visibility;
        }
    } catch (e) {
        console.error("Error reading ChiTiet column visibility:", e);
    }
    const defaultVis = {};
    CHI_TIET_COLUMNS.forEach(col => {
        defaultVis[col.key] = col.default;
    });
    return defaultVis;
}

export function saveChiTietColumnVisibility(visibility) {
    try {
        localStorage.setItem('chiTietColumnVisibility', JSON.stringify(visibility));
    } catch (e) {
        console.error("Error saving ChiTiet column visibility:", e);
    }
}

export function applyChiTietColumnState() {
    const table = document.getElementById('chi-tiet-table') || document.querySelector('#view-chi-tiet table');
    if (!table) return;

    const visibility = getChiTietColumnVisibility();

    CHI_TIET_COLUMNS.forEach(col => {
        const isVisible = visibility[col.key] !== false;
        const thElements = table.querySelectorAll(`th[data-col="${col.key}"]`);
        const tdElements = table.querySelectorAll(`td[data-col="${col.key}"]`);

        thElements.forEach(el => el.classList.toggle('hidden', !isVisible));
        tdElements.forEach(el => el.classList.toggle('hidden', !isVisible));
    });
}

export function updateChiTietSortButtonUI() {
    const state = viewStates['view-chi-tiet'];
    if (!state) return;
    const currentSort = state.sortBy;
    const isAsc = state.sortAsc;

    const table = document.getElementById('chi-tiet-table') || document.querySelector('#view-chi-tiet table');
    if (!table) return;

    table.querySelectorAll('.sort-btn').forEach(btn => {
        const sortKey = btn.dataset.sortKey;
        if (sortKey === currentSort && (isAsc === true || isAsc === false)) {
            if (isAsc === true) {
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

function initChiTietColumnsModal() {
    const modal = document.getElementById('chi-tiet-columns-modal');
    const openBtn = document.getElementById('chi-tiet-btn-columns');
    const closeBtn = document.getElementById('chi-tiet-columns-modal-close');
    const cancelBtn = document.getElementById('chi-tiet-columns-cancel-btn');
    const applyBtn = document.getElementById('chi-tiet-columns-apply-btn');
    const selectAllBtn = document.getElementById('chi-tiet-columns-select-all');
    const resetDefaultBtn = document.getElementById('chi-tiet-columns-reset-default');
    const listContainer = document.getElementById('chi-tiet-columns-checkbox-list');

    if (!modal || !openBtn) return;

    const renderCheckboxes = (visibility) => {
        if (!listContainer) return;
        listContainer.innerHTML = CHI_TIET_COLUMNS.map(col => `
            <label class="flex items-center gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer border border-transparent hover:border-gray-200 transition-all select-none">
                <input type="checkbox" data-col-key="${col.key}" ${visibility[col.key] !== false ? 'checked' : ''} class="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer">
                <span class="font-medium text-gray-800">${col.label}</span>
            </label>
        `).join('');
    };

    openBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentVis = getChiTietColumnVisibility();
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
            CHI_TIET_COLUMNS.forEach(c => defaults[c.key] = c.default);
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
            saveChiTietColumnVisibility(newVis);
            applyChiTietColumnState();
            closeModal();
            showToast('Đã lưu cấu hình cột hiển thị!', 'success');
        };
    }
}

function buildChiTietQuery() {
    const state = viewStates['view-chi-tiet'];
    let query = sb.from('chi_tiet').select('*', { count: 'exact' });

    if (currentUser?.phan_quyen === 'View') {
        query = query.eq('phu_trach', currentUser.ho_ten);
    }

    if (state.searchTerm) {
        query = query.or(`ma_kho.ilike.%${state.searchTerm}%,ma_nx.ilike.%${state.searchTerm}%,ma_vach.ilike.%${state.searchTerm}%,ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,lot.ilike.%${state.searchTerm}%,loai.ilike.%${state.searchTerm}%,yeu_cau.ilike.%${state.searchTerm}%,muc_dich.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%`);
    }

    if (state.filters.from_date) query = query.gte('thoi_gian', state.filters.from_date);
    if (state.filters.to_date) query = query.lte('thoi_gian', state.filters.to_date + 'T23:59:59');
    if (state.filters.thoi_gian?.length > 0) query = query.in('thoi_gian', state.filters.thoi_gian);
    if (state.filters.ma_kho?.length > 0) query = query.in('ma_kho', state.filters.ma_kho);
    if (state.filters.ma_nx?.length > 0) query = query.in('ma_nx', state.filters.ma_nx);
    if (state.filters.ma_vach?.length > 0) query = query.in('ma_vach', state.filters.ma_vach);
    if (state.filters.ma_vt?.length > 0) query = query.in('ma_vt', state.filters.ma_vt);
    if (state.filters.ten_vt?.length > 0) query = query.in('ten_vt', state.filters.ten_vt);
    if (state.filters.lot?.length > 0) query = query.in('lot', state.filters.lot);
    if (state.filters.date?.length > 0) query = query.in('date', state.filters.date);
    if (state.filters.yc_sl?.length > 0) query = query.in('yc_sl', state.filters.yc_sl);
    if (state.filters.nhap?.length > 0) query = query.in('nhap', state.filters.nhap);
    if (state.filters.xuat?.length > 0) query = query.in('xuat', state.filters.xuat);
    if (state.filters.loai?.length > 0) query = query.in('loai', state.filters.loai);
    if (state.filters.yeu_cau?.length > 0) query = query.in('yeu_cau', state.filters.yeu_cau);
    if (state.filters.muc_dich?.length > 0) query = query.in('muc_dich', state.filters.muc_dich);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    
    return query;
}

// ── Tree state for Chi Tiết grouped by Mã Kho ──────────────────────────
export const chiTietTreeExpanded = new Set();
export const chiTietTreeCollapsed = new Set();
export let isChiTietAllExpanded = true;

export function isChiTietGroupOpen(maKho) {
    if (isChiTietAllExpanded) {
        return !chiTietTreeCollapsed.has(maKho);
    } else {
        return chiTietTreeExpanded.has(maKho);
    }
}

export function groupChiTietByMaKho(data) {
    const groups = [];
    const groupMap = new Map();
    data.forEach(ct => {
        const maKho = ct.ma_kho || '(Chưa có mã kho)';
        if (!groupMap.has(maKho)) {
            const g = {
                ma_kho: maKho,
                items: [],
                nhap: 0,
                xuat: 0,
                yc_sl: 0,
                maNxSet: new Set(),
                yeuCauSet: new Set(),
                muc_dich: ''
            };
            groupMap.set(maKho, g);
            groups.push(g);
        }
        const g = groupMap.get(maKho);
        g.items.push(ct);
        g.nhap  += (Number(ct.nhap)  || 0);
        g.xuat  += (Number(ct.xuat)  || 0);
        g.yc_sl += (Number(ct.yc_sl) || 0);
        if (ct.ma_nx)  g.maNxSet.add(ct.ma_nx);
        if (ct.yeu_cau) g.yeuCauSet.add(ct.yeu_cau);
        if (!g.muc_dich && ct.muc_dich) g.muc_dich = ct.muc_dich;
    });
    // Convert sets to display strings & sort child items by stt ascending
    const state = viewStates['view-chi-tiet'];
    const isDefaultSort = !state.sortBy || state.sortBy === 'thoi_gian';
    groups.forEach(g => {
        g.ma_nx_display  = [...g.maNxSet].join(', ');
        g.yeu_cau_display = [...g.yeuCauSet].join(', ');
        if (isDefaultSort) {
            g.items.sort((a, b) => (Number(a.stt) || 0) - (Number(b.stt) || 0));
        }
    });
    return groups;
}

export function updateChiTietToggleUI() {
    const toggleText = document.getElementById('chi-tiet-toggle-all-text');
    const toggleIcon = document.getElementById('chi-tiet-toggle-all-icon');
    if (toggleText) toggleText.textContent = isChiTietAllExpanded ? 'Thu gọn tất cả' : 'Mở tất cả';
    if (toggleIcon) toggleIcon.style.transform = isChiTietAllExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
}

export function updateChiTietViewModeUI() {
    const state = viewStates['view-chi-tiet'];
    const mode = state.viewMode || localStorage.getItem('chiTietViewMode') || 'tree';
    state.viewMode = mode;
    const btnTree = document.getElementById('chi-tiet-mode-tree');
    const btnFlat = document.getElementById('chi-tiet-mode-flat');
    const btnToggleAll = document.getElementById('chi-tiet-toggle-all');

    if (btnTree && btnFlat) {
        if (mode === 'tree') {
            btnTree.className = 'px-3 py-1 rounded-full font-bold transition-all bg-teal-700 text-white shadow-sm flex items-center gap-1';
            btnFlat.className = 'px-3 py-1 rounded-full font-medium transition-all text-teal-800 hover:text-black flex items-center gap-1';
            if (btnToggleAll) btnToggleAll.classList.remove('hidden');
        } else {
            btnFlat.className = 'px-3 py-1 rounded-full font-bold transition-all bg-teal-700 text-white shadow-sm flex items-center gap-1';
            btnTree.className = 'px-3 py-1 rounded-full font-medium transition-all text-teal-800 hover:text-black flex items-center gap-1';
            if (btnToggleAll) btnToggleAll.classList.add('hidden');
        }
    }
}

export async function fetchChiTiet(page = viewStates['view-chi-tiet'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-chi-tiet'].currentPage = page;
        const state = viewStates['view-chi-tiet'];
        const viewMode = state.viewMode || localStorage.getItem('chiTietViewMode') || 'tree';
        
        const { itemsPerPage } = state;
        // In tree mode, fetch many more rows per page so we always have enough distinct
        // ma_kho groups to fill the page (avoids empty space when groups are collapsed).
        // 8× multiplier: 50 groups × ~8 rows/group ≈ 400 rows per page.
        const rawBatch = (viewMode === 'tree') ? Math.max(itemsPerPage * 8, 400) : itemsPerPage;
        const from = (page - 1) * rawBatch;
        const to = from + rawBatch - 1;

        const sortBy = state.sortBy;
        const sortAsc = state.sortAsc;
        
        let query = buildChiTietQuery();
        if (!sortBy || sortAsc === null) {
            // Default sort: newest first, stt asc
            query = query
                .order('thoi_gian', { ascending: false, nullsFirst: false })
                .order('ma_kho', { ascending: true })
                .order('stt', { ascending: true, nullsFirst: false });
        } else if (sortBy === 'thoi_gian') {
            // User explicitly sorted thoi_gian: asc (cũ->mới) or desc (mới->cũ)
            query = query
                .order('thoi_gian', { ascending: sortAsc, nullsFirst: false })
                .order('ma_kho', { ascending: true })
                .order('stt', { ascending: true, nullsFirst: false });
        } else {
            // User sorted by another column (ma_vt, ten_vt, etc.)
            query = query
                .order(sortBy, { ascending: sortAsc, nullsFirst: false })
                .order('stt', { ascending: true, nullsFirst: false });
        }
        query = query.range(from, to);
        
        const [queryResult, _] = await Promise.all([
            query,
            updateChiTietHeaderCounts()
        ]);

        const { data, error, count } = queryResult;
        
        if (error) {
            console.error("fetchChiTiet error:", error);
            showToast("Không thể tải dữ liệu chi tiết.", 'error');
            renderChiTietTable([]);
        } else {
            state.totalFilteredCount = count || 0;
            cache.chiTietList = data || [];
            
            renderChiTietTable(data || []);
            const table = document.getElementById('chi-tiet-table');
            if (table) applyChiTietColumnOrder(table);
            applyChiTietColumnState();
            updateChiTietSortButtonUI();
            const actualTo = Math.min(from + (data?.length || 0) - 1, (count || 1) - 1);
            renderPagination('chi-tiet', count || 0, from, actualTo, rawBatch);
            updateFilterButtonTexts('chi-tiet');
        }
    } catch (err) {
        console.error("fetchChiTiet unexpected exception:", err);
        renderChiTietTable([]);
    } finally {
        if (showLoader) showLoading(false);
    }
}

function renderChiTietTable(data) {
    const tableBody = document.getElementById('chi-tiet-table-body');
    if (!tableBody) return;

    const table = document.getElementById('chi-tiet-table');
    if (table) {
        const thead = table.querySelector('thead');
        if (thead && thead.offsetHeight > 0) {
            table.style.setProperty('--thead-height', `${thead.offsetHeight}px`);
        }
    }

    const state = viewStates['view-chi-tiet'];
    const viewMode = state.viewMode || localStorage.getItem('chiTietViewMode') || 'tree';
    state.viewMode = viewMode;

    updateChiTietViewModeUI();
    updateChiTietToggleUI();

    // Helper to build a single flat row (used in both modes)
    function buildFlatRow(ct, indent = false) {
        return `
            <tr class="hover:bg-gray-50 transition-colors" data-id="${ct.id || ''}" data-parent-makho="${ct.ma_kho || ''}">
                <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="thoi_gian">${formatDateToDDMMYYYY(ct.thoi_gian)}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center cursor-pointer text-blue-600 hover:underline ma-kho-cell font-medium" data-col="ma_kho">${indent ? `<span class="pl-5 block">${ct.ma_kho || ''}</span>` : (ct.ma_kho || '')}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="ma_nx">${formatMaNxHtml(ct.ma_nx)}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-left" data-col="ma_vach">${ct.ma_vach || ''}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-left cursor-pointer text-blue-600 hover:underline ma-vt-cell font-semibold" data-col="ma_vt">${ct.ma_vt || ''}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-left break-words" data-col="ten_vt">${ct.ten_vt || ''}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="lot">${ct.lot || ''}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="date">${ct.date || ''}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center font-bold" data-col="yc_sl">${(ct.yc_sl || 0).toLocaleString()}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center text-green-600 font-bold" data-col="nhap">${(ct.nhap || 0).toLocaleString()}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center text-red-600 font-bold" data-col="xuat">${(ct.xuat || 0).toLocaleString()}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="loai">${ct.loai || ''}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="yeu_cau">${ct.yeu_cau || ''}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-left" style="max-width:0;overflow:hidden;" data-col="muc_dich"><span class="block truncate whitespace-nowrap" title="${ct.muc_dich || ''}">${ct.muc_dich || ''}</span></td>
                <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="nganh">${ct.nganh || ''}</td>
                <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="phu_trach">${ct.phu_trach || ''}</td>
            </tr>`;
    }

    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="16" class="text-center py-6 text-slate-500 font-medium">Không có dữ liệu chi tiết</td></tr>';
        return;
    }

    if (viewMode === 'tree') {
        const groups = groupChiTietByMaKho(data);
        let html = '';

        // Compute colspan based on visible columns (recalculated each render so hide/show is respected)
        const vis = getChiTietColumnVisibility();
        // Cols merged into the main info cell (ma_kho + everything before yc_sl)
        const _mergeMain = ['ma_kho','ma_nx','ma_vach','ma_vt','ten_vt','lot','date'];
        const spanMain = Math.max(1, _mergeMain.filter(k => vis[k] !== false).length);
        // Cols merged into the trailing empty cell (after xuat)
        const _mergeTail = ['loai','yeu_cau','muc_dich','nganh','phu_trach'];
        const spanTail = _mergeTail.filter(k => vis[k] !== false).length;
        const showThoi = vis['thoi_gian'] !== false;
        const showYcSl = vis['yc_sl']    !== false;
        const showNhap = vis['nhap']     !== false;
        const showXuat = vis['xuat']     !== false;

        groups.forEach(g => {
            const isOpen = isChiTietGroupOpen(g.ma_kho);
            html += `
                <tr data-group-makho="${g.ma_kho}" class="chi-tiet-group-header cursor-pointer select-none bg-slate-300 hover:bg-slate-400 transition-colors font-black">
                    ${showThoi ? `<td class="px-1 py-2 border-t-2 border-b-2 border-gray-500 text-center text-xs text-gray-500 font-bold" data-col="thoi_gian">-</td>` : ''}
                    <td class="px-1.5 py-2 border-t-2 border-b-2 border-gray-500 text-left font-black" colspan="${spanMain}">
                        <div class="flex items-center gap-1.5 chi-tiet-group-toggle overflow-hidden" data-group-makho="${g.ma_kho}">
                            <span class="tree-chevron-icon ${isOpen ? 'is-open' : ''} text-teal-800 pointer-events-none flex-shrink-0">
                                <svg class="w-4 h-4 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                            </span>
                            <span class="cursor-pointer text-blue-900 hover:underline chi-tiet-makho-open-btn font-black text-[13px] whitespace-nowrap flex-shrink-0" data-ma-kho="${g.ma_kho}">${g.ma_kho}</span>
                            <span class="bg-teal-700 text-white text-[11px] px-2 py-0.5 rounded-full font-black shadow-sm tracking-wide whitespace-nowrap flex-shrink-0">${g.items.length} dòng</span>
                            ${formatMaNxBadgeHtml(g.ma_nx_display)}
                            ${g.yeu_cau_display ? `<span class="bg-blue-100 text-blue-800 text-[11px] px-2 py-0.5 rounded font-semibold whitespace-nowrap flex-shrink-0" title="${g.yeu_cau_display}">${g.yeu_cau_display.length > 20 ? g.yeu_cau_display.substring(0,20)+'…' : g.yeu_cau_display}</span>` : ''}
                            ${g.muc_dich ? `<span class="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 rounded font-semibold min-w-0 truncate whitespace-nowrap" title="${g.muc_dich}">${g.muc_dich}</span>` : ''}
                        </div>
                    </td>
                    ${showYcSl ? `<td class="px-1 py-2 text-sm font-black border-t-2 border-b-2 border-gray-500 text-center text-gray-800" data-col="yc_sl">${g.yc_sl.toLocaleString()}</td>` : ''}
                    ${showNhap ? `<td class="px-1 py-2 text-sm font-black border-t-2 border-b-2 border-gray-500 text-center" style="color:#16a34a!important" data-col="nhap">${g.nhap.toLocaleString()}</td>` : ''}
                    ${showXuat ? `<td class="px-1 py-2 text-sm font-black border-t-2 border-b-2 border-gray-500 text-center" style="color:#dc2626!important" data-col="xuat">${g.xuat.toLocaleString()}</td>` : ''}
                    ${spanTail > 0 ? `<td colspan="${spanTail}" class="border-t-2 border-b-2 border-gray-500"></td>` : ''}
                </tr>`;

            g.items.forEach(ct => {
                html += `
                    <tr data-id="${ct.id || ''}" data-parent-makho="${g.ma_kho}" class="chi-tiet-child-row hover:bg-teal-50/50 ${isOpen ? '' : 'hidden'}">
                        <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="thoi_gian">${formatDateToDDMMYYYY(ct.thoi_gian)}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="ma_kho">
                            <div class="flex items-center pl-2">
                                <span class="tree-branch-icon text-gray-400 mr-1">└──</span>
                                <span class="cursor-pointer text-blue-600 hover:underline ma-kho-cell font-medium">${ct.ma_kho || ''}</span>
                            </div>
                        </td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="ma_nx">${formatMaNxHtml(ct.ma_nx)}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-left" data-col="ma_vach">${ct.ma_vach || ''}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-left cursor-pointer text-blue-600 hover:underline ma-vt-cell font-semibold" data-col="ma_vt">${ct.ma_vt || ''}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-left break-words" data-col="ten_vt">${ct.ten_vt || ''}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="lot">${ct.lot || ''}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="date">${ct.date || ''}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center font-bold" data-col="yc_sl">${(ct.yc_sl || 0).toLocaleString()}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center text-green-600 font-bold" data-col="nhap">${(ct.nhap || 0).toLocaleString()}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center text-red-600 font-bold" data-col="xuat">${(ct.xuat || 0).toLocaleString()}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="loai">${ct.loai || ''}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="yeu_cau">${ct.yeu_cau || ''}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-left" style="max-width:0;overflow:hidden;" data-col="muc_dich"><span class="block truncate whitespace-nowrap" title="${ct.muc_dich || ''}">${ct.muc_dich || ''}</span></td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="nganh">${ct.nganh || ''}</td>
                        <td class="px-1 py-1.5 border border-gray-300 text-center" data-col="phu_trach">${ct.phu_trach || ''}</td>
                    </tr>`;
            });
        });

        tableBody.innerHTML = html;
    } else {
        // Flat list view
        tableBody.innerHTML = data.map(ct => buildFlatRow(ct, false)).join('');
    }
}

async function handleExcelExport() {
    const modal = document.getElementById('excel-export-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const exportAndClose = async (exportAll) => {
        modal.classList.add('hidden');
        showLoading(true);
        try {
            const query = exportAll ? sb.from('chi_tiet').select('*') : buildChiTietQuery().select('*');
            const { data, error } = await query.order('thoi_gian', { ascending: true })
                                               .order('ma_kho', { ascending: true })
                                               .order('stt', { ascending: true })
                                               .limit(50000);
            
            if (error) throw error;
            if (!data || data.length === 0) {
                showToast("Không có dữ liệu để xuất.", 'info');
                return;
            }

            const formattedData = data.map((item, index) => {
                const maNx = item.ma_nx || '';
                const loai = item.loai || '';
                const nhapVal = parseFloat(item.nhap) || 0;
                const xuatVal = parseFloat(item.xuat) || 0;

                let maNhap = '';
                let maXuat = '';

                if (maNx.includes('RO')) {
                    maNhap = maNx;
                } else if (maNx.includes('DO')) {
                    maXuat = maNx;
                } else if (loai === 'Nhập') {
                    maNhap = maNx;
                } else if (loai === 'Xuất') {
                    maXuat = maNx;
                } else if (nhapVal > 0) {
                    maNhap = maNx;
                } else if (xuatVal > 0) {
                    maXuat = maNx;
                }
                
                return {
                    id: item.id,
                    thoi_gian: formatDateToDDMMYYYY(item.thoi_gian),
                    ma_kho: item.ma_kho,
                    ma_nx: maNx,
                    ma_nhap: maNhap,
                    ma_xuat: maXuat,
                    ma_vach: item.ma_vach,
                    ma_vt: item.ma_vt,
                    ten_vt: item.ten_vt,
                    lot: item.lot,
                    date: item.date,
                    yc_sl: item.yc_sl,
                    nhap: item.nhap,
                    xuat: item.xuat,
                    loai: loai,
                    yeu_cau: item.yeu_cau,
                    muc_dich: item.muc_dich,
                    nganh: item.nganh,
                    stt: item.stt || (index + 1)
                };
            });

            const boldColumns = ['thoi_gian', 'ma_nx', 'ma_nhap', 'ma_xuat', 'ma_vt', 'lot', 'date', 'nhap', 'xuat', 'yeu_cau', 'muc_dich'];
            const headerKeys = Object.keys(formattedData[0]);
            const headers = headerKeys.map(k => boldColumns.includes(k) ? k.toUpperCase() : k);
            const dataRows = formattedData.map(item => headerKeys.map(k => item[k]));

            const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "ChiTiet");

            let filename = `ChiTiet_${new Date().toISOString().slice(0, 10)}`;
            if (!exportAll) {
                const state = viewStates['view-chi-tiet'];
                const f = state.filters;
                let suffix = "";
                if (state.searchTerm) suffix += `_${state.searchTerm}`;
                if (f.from_date) suffix += `_${f.from_date}`;
                if (f.to_date) suffix += `_${f.to_date}`;
                
                ['loai', 'ma_kho', 'ma_nx', 'ma_vt', 'lot', 'nganh', 'yeu_cau'].forEach(k => {
                    if (f[k] && f[k].length > 0) {
                        suffix += `_${f[k].join('-')}`;
                    }
                });
                if (suffix) filename += suffix.substring(0, 150);
            }
            
            const safeFilename = filename.replace(/[^a-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s\-_]/gi, '_');
            XLSX.writeFile(workbook, `${safeFilename.endsWith('.xlsx') ? safeFilename : safeFilename + '.xlsx'}`);
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

export function initChiTietView() {
    const viewContainer = document.getElementById('view-chi-tiet');
    if (!viewContainer) return;
    
    const table = document.getElementById('chi-tiet-table');
    if (table) {
        applyChiTietColumnOrder(table);
        initSortableChiTietColumns(table);
        initResizableTable(table, 'chi_tiet_col_widths');
    }

    applyChiTietColumnState();
    initChiTietColumnsModal();

    // ── View Mode Toggle (Nhánh Mã Kho / Tất Cả Mã Kho) ───────────────────
    updateChiTietViewModeUI();

    const btnModeTree = document.getElementById('chi-tiet-mode-tree');
    if (btnModeTree) {
        btnModeTree.addEventListener('click', () => {
            const state = viewStates['view-chi-tiet'];
            if (state.viewMode !== 'tree') {
                state.viewMode = 'tree';
                localStorage.setItem('chiTietViewMode', 'tree');
                updateChiTietViewModeUI();
                fetchChiTiet(1);
            }
        });
    }

    const btnModeFlat = document.getElementById('chi-tiet-mode-flat');
    if (btnModeFlat) {
        btnModeFlat.addEventListener('click', () => {
            const state = viewStates['view-chi-tiet'];
            if (state.viewMode !== 'flat') {
                state.viewMode = 'flat';
                localStorage.setItem('chiTietViewMode', 'flat');
                updateChiTietViewModeUI();
                fetchChiTiet(1);
            }
        });
    }

    // ── Toggle All (Thu gọn / Mở tất cả) ──────────────────────────────────
    const toggleAllBtn = document.getElementById('chi-tiet-toggle-all');
    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', () => {
            isChiTietAllExpanded = !isChiTietAllExpanded;
            chiTietTreeExpanded.clear();
            chiTietTreeCollapsed.clear();
            updateChiTietToggleUI();
            // Re-show/hide child rows without a full re-render
            const tbody = document.getElementById('chi-tiet-table-body');
            if (tbody) {
                tbody.querySelectorAll('.chi-tiet-child-row').forEach(row => {
                    row.classList.toggle('hidden', !isChiTietAllExpanded);
                });
                tbody.querySelectorAll('.chi-tiet-group-header .tree-chevron-icon').forEach(icon => {
                    icon.classList.toggle('is-open', isChiTietAllExpanded);
                });
            }
        });
    }

    // ── Per-group toggle (click on group header row) ───────────────────────
    const tableBody = document.getElementById('chi-tiet-table-body');

    const searchInput = document.getElementById('chi-tiet-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            viewStates['view-chi-tiet'].searchTerm = searchInput.value.trim();
            updateFilterButtonTexts('chi-tiet');
            fetchChiTiet(1);
        }, 400));
    }

    // Filter popover & Sorting delegation
    viewContainer.addEventListener('click', e => {
        const filterBtn = e.target.closest('.filter-btn');
        if (filterBtn) {
            e.preventDefault();
            e.stopPropagation();
            openTonKhoFilterPopover(filterBtn, 'view-chi-tiet');
            return;
        }

        const sortBtn = e.target.closest('.sort-btn');
        if (sortBtn) {
            e.preventDefault();
            e.stopPropagation();
            const sortKey = sortBtn.dataset.sortKey;
            if (!sortKey) return;
            const state = viewStates['view-chi-tiet'];
            if (state.sortBy === sortKey) {
                if (state.sortAsc === true) {
                    // 1st was AZ (asc) -> 2nd is ZA (desc)
                    state.sortAsc = false;
                } else if (state.sortAsc === false) {
                    // 2nd was ZA (desc) -> 3rd is RESET to default
                    state.sortBy = null;
                    state.sortAsc = null;
                } else {
                    // was null -> 1st is AZ (asc)
                    state.sortAsc = true;
                }
            } else {
                // New column -> 1st is AZ (asc)
                state.sortBy = sortKey;
                state.sortAsc = true;
            }
            updateChiTietSortButtonUI();
            fetchChiTiet(1);
            return;
        }
    });
    
    const fromDateInput = document.getElementById('chi-tiet-filter-from-date');
    if (fromDateInput) {
        fromDateInput.addEventListener('change', e => {
            viewStates['view-chi-tiet'].filters.from_date = e.target.value;
            updateFilterButtonTexts('chi-tiet');
            fetchChiTiet(1);
        });
    }

    const toDateInput = document.getElementById('chi-tiet-filter-to-date');
    if (toDateInput) {
        toDateInput.addEventListener('change', e => {
            viewStates['view-chi-tiet'].filters.to_date = e.target.value;
            updateFilterButtonTexts('chi-tiet');
            fetchChiTiet(1);
        });
    }

    const resetFiltersBtn = document.getElementById('chi-tiet-reset-filters');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (fromDateInput) fromDateInput.value = '';
            if (toDateInput) toDateInput.value = '';
            const state = viewStates['view-chi-tiet'];
            state.searchTerm = '';
            state.sortBy = null;
            state.sortAsc = null;
            state.filters = {
                from_date: '', to_date: '', thoi_gian: [], ma_kho: [], ma_nx: [], ma_vach: [],
                ma_vt: [], ten_vt: [], lot: [], date: [], yc_sl: [], nhap: [], xuat: [],
                loai: [], yeu_cau: [], muc_dich: [], nganh: [], phu_trach: []
            };
            updateFilterButtonTexts('chi-tiet');
            updateChiTietSortButtonUI();
            fetchChiTiet(1);
            showToast("Đã xóa tất cả bộ lọc", 'info');
        });
    }
    
    const excelBtn = document.getElementById('chi-tiet-btn-excel');
    if (excelBtn) excelBtn.addEventListener('click', handleExcelExport);

    if (tableBody) {
        // Group header toggle
        tableBody.addEventListener('click', (e) => {
            const toggleEl = e.target.closest('.chi-tiet-group-toggle');
            if (toggleEl) {
                e.stopPropagation();
                const maKho = toggleEl.dataset.groupMakho;
                if (!maKho) return;
                const currentlyOpen = isChiTietGroupOpen(maKho);
                if (isChiTietAllExpanded) {
                    if (currentlyOpen) chiTietTreeCollapsed.add(maKho);
                    else chiTietTreeCollapsed.delete(maKho);
                } else {
                    if (currentlyOpen) chiTietTreeExpanded.delete(maKho);
                    else chiTietTreeExpanded.add(maKho);
                }
                const nowOpen = !currentlyOpen;
                // Toggle child rows
                tableBody.querySelectorAll(`.chi-tiet-child-row[data-parent-makho="${maKho}"]`).forEach(row => {
                    row.classList.toggle('hidden', !nowOpen);
                });
                // Toggle chevron
                const chevron = toggleEl.querySelector('.tree-chevron-icon');
                if (chevron) chevron.classList.toggle('is-open', nowOpen);
                return;
            }
        });

        tableBody.addEventListener('click', async (e) => {
            const maKhoCell = e.target.closest('.ma-kho-cell');
            const maVtCell = e.target.closest('.ma-vt-cell');

            if (maKhoCell) {
                const ma_kho = maKhoCell.textContent.trim();
                if (!ma_kho) return;

                showLoading(true);
                const { data: donHang, error } = await sb.from('don_hang').select('*').eq('ma_kho', ma_kho).single();
                showLoading(false);

                if (error || !donHang) {
                    showToast('Không tìm thấy đơn hàng tương ứng.', 'error');
                    return;
                }
                openDonHangModal(donHang, 'view');
            }

            if (maVtCell) {
                const ma_vt = maVtCell.textContent.trim();
                if (!ma_vt) return;

                const tonKhoState = viewStates['view-ton-kho'];
                tonKhoState.searchTerm = '';
                tonKhoState.filters = { ma_vach: [], ma_vt: [ma_vt], ten_vt: [], lot: [], date: [], ton_dau: [], nhap: [], xuat: [], ton_cuoi: [], tinh_trang: [], tray: [], nganh: [], phu_trach: [], note: [] };
                
                await showView('view-ton-kho');
            }
        });
    }

    const itemsPerPageEl = document.getElementById('chi-tiet-items-per-page');
    if (itemsPerPageEl) {
        itemsPerPageEl.addEventListener('change', (e) => {
            viewStates['view-chi-tiet'].itemsPerPage = parseInt(e.target.value, 10);
            fetchChiTiet(1);
        });
    }

    const prevPageBtn = document.getElementById('chi-tiet-prev-page');
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => fetchChiTiet(viewStates['view-chi-tiet'].currentPage - 1));

    const nextPageBtn = document.getElementById('chi-tiet-next-page');
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => fetchChiTiet(viewStates['view-chi-tiet'].currentPage + 1));
    
    const pageInput = document.getElementById('chi-tiet-page-input');
    if (pageInput) {
        const handlePageJump = () => {
            const state = viewStates['view-chi-tiet'];
            let targetPage = parseInt(pageInput.value, 10);
            const totalPages = Math.ceil(state.totalFilteredCount / state.itemsPerPage);
            if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
            else if (targetPage > totalPages && totalPages > 0) targetPage = totalPages;
            else if (totalPages === 0) targetPage = 1;
            pageInput.value = targetPage;
            if (targetPage !== state.currentPage) fetchChiTiet(targetPage);
        };
        pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handlePageJump(); e.target.blur(); }
        });
        pageInput.addEventListener('change', handlePageJump);
    }
}