
import { sb, cache, viewStates, showLoading, showToast, showConfirm, debounce, renderPagination, sanitizeFileName, filterButtonDefaultTexts, currentUser, openAutocomplete, addJobToOfflineQueue, openPrintPreviewModal, formatMaNxHtml, initResizableTable, openTonKhoFilterPopover, updateFilterButtonTexts } from './app.js';

let selectedDonHangFiles = [];
let initialExistingFiles = [];
let currentExistingFiles = [];
let chiTietItems = [];
let initialChiTietItems = [];
let initialDonHangData = {};
let chiTietSortable = null;
let activeLotPopover = null;
let saveDonHangBtn, saveAndPrintBtn;
let currentPrintChoiceMaKho = null;
export let isNhapTraMode = false;
let unreturnedMaNxCache = null;
let trayListCache = null;
let currentExportBlocks = [];

async function getTrayList() {
    if (trayListCache) return trayListCache;
    const { data } = await sb.from('ton_kho').select('tray').not('tray', 'is', null).neq('tray', '');
    const unique = [...new Set((data || []).map(r => r.tray).filter(Boolean))].sort();
    trayListCache = unique.map(t => ({ tray: t }));
    return trayListCache;
}

async function getUnreturnedMaNxList() {
    if (unreturnedMaNxCache) return unreturnedMaNxCache;
    showLoading(true);
    try {
        const { data: returnChiTietNotes } = await sb.from('chi_tiet').select('muc_dich').gt('nhap', 0);
        const { data: returnDonHangNotes } = await sb.from('don_hang').select('ghi_chu, muc_dich').ilike('ma_kho', 'IN.%');
        const allReturnStrings = [];
        (returnChiTietNotes || []).forEach(n => { if (n.muc_dich) allReturnStrings.push(n.muc_dich.toLowerCase()); });
        (returnDonHangNotes || []).forEach(n => {
            if (n.muc_dich) allReturnStrings.push(n.muc_dich.toLowerCase());
            if (n.ghi_chu) allReturnStrings.push(n.ghi_chu.toLowerCase());
        });

        const { data: displayExports } = await sb.from('chi_tiet')
            .select('ma_kho, ma_nx, muc_dich, yeu_cau, nganh, thoi_gian')
            .gt('xuat', 0)
            .eq('loai', 'Trưng Bày');

        const unreturnedItems = (displayExports || []).filter(exportItem => {
            if (!exportItem.ma_nx) return false;
            const maNxToSearch = exportItem.ma_nx.trim().toLowerCase();
            const isReturned = allReturnStrings.some(returnString => returnString.includes(maNxToSearch));
            return !isReturned;
        });

        const uniqueMap = new Map();
        unreturnedItems.forEach(item => {
            if (!uniqueMap.has(item.ma_nx)) {
                uniqueMap.set(item.ma_nx, {
                    ma_nx: item.ma_nx,
                    muc_dich: item.muc_dich,
                    yeu_cau: item.yeu_cau,
                    nganh: item.nganh,
                    ma_kho: item.ma_kho,
                    thoi_gian: item.thoi_gian,
                    display_text: `${item.muc_dich || ''} - Yêu cầu: ${item.yeu_cau || ''}`
                });
            }
        });
        unreturnedMaNxCache = Array.from(uniqueMap.values());
        unreturnedMaNxCache.sort((a, b) => new Date(b.thoi_gian || 0) - new Date(a.thoi_gian || 0));
        return unreturnedMaNxCache;
    } catch (e) {
        console.error("Error getUnreturnedMaNxList", e);
        return [];
    } finally {
        showLoading(false);
    }
}

// Helper function to safely get an element's value
const getElValue = (id, trim = false) => {
    const el = document.getElementById(id);
    if (!el) {
        console.error(`Lỗi nghiêm trọng: Không tìm thấy phần tử với ID "${id}".`);
        return `__MISSING_ELEMENT_${id}__`;
    }
    const value = el.value;
    return trim ? value.trim() : value;
};


function showPrintChoiceModal(ma_kho) {
    currentPrintChoiceMaKho = ma_kho;
    const modal = document.getElementById('print-choice-modal');
    modal.classList.remove('hidden');
}

function hidePrintChoiceModal() {
    currentPrintChoiceMaKho = null;
    const modal = document.getElementById('print-choice-modal');
    modal.classList.add('hidden');
}

/**
 * Lấy số lượng chờ nhập và chờ xuất của các mã vạch từ các đơn hàng "Đang xử lý" (Mã NX kết thúc bằng '-')
 * Loại trừ đơn hàng hiện tại đang được xử lý (currentMaKho)
 */
async function getPendingAmountsByMaVach(maVachList, currentMaKho) {
    const pendingMap = new Map(); // Key: ma_vach, Value: { nhap: 0, xuat: 0 }
    if (!maVachList || maVachList.length === 0) return pendingMap;

    // Khởi tạo map
    maVachList.forEach(mv => pendingMap.set(mv, { nhap: 0, xuat: 0 }));

    // Lấy danh sách ma_kho của các đơn hàng đang xử lý (trừ đơn hiện tại)
    let pendingOrdersQuery = sb.from('don_hang')
        .select('ma_kho')
        .like('ma_nx', '%-');

    if (currentMaKho) {
        pendingOrdersQuery = pendingOrdersQuery.neq('ma_kho', currentMaKho);
    }

    const { data: pendingOrders, error: ordersError } = await pendingOrdersQuery;
    if (ordersError || !pendingOrders || pendingOrders.length === 0) {
        return pendingMap;
    }

    const pendingMaKhoList = pendingOrders.map(o => o.ma_kho);

    // Lấy chi tiết của các đơn hàng đó
    const { data: pendingChiTiet, error: chiTietError } = await sb.from('chi_tiet')
        .select('ma_vach, nhap, xuat')
        .in('ma_kho', pendingMaKhoList)
        .in('ma_vach', maVachList);

    if (chiTietError) {
        console.error("Error fetching pending details:", chiTietError);
        return pendingMap;
    }

    (pendingChiTiet || []).forEach(item => {
        if (pendingMap.has(item.ma_vach)) {
            const current = pendingMap.get(item.ma_vach);
            current.nhap += (item.nhap || 0);
            current.xuat += (item.xuat || 0);
        }
    });

    return pendingMap;
}


const debouncedValidateMaKho = debounce(async (ma_kho) => {
    if (!saveDonHangBtn) saveDonHangBtn = document.getElementById('save-don-hang-btn');
    if (!saveAndPrintBtn) saveAndPrintBtn = document.getElementById('save-and-print-btn');
    const statusEl = document.getElementById('don-hang-modal-ma-kho-status');
    const inputEl = document.getElementById('don-hang-modal-ma-kho');
    const ma_kho_orig = document.getElementById('don-hang-edit-mode-ma-kho').value;

    if (!ma_kho) {
        statusEl.textContent = '';
        saveDonHangBtn.disabled = true;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = true;
        return;
    }

    let query = sb.from('don_hang').select('ma_kho', { count: 'exact', head: true }).eq('ma_kho', ma_kho);
    if (ma_kho_orig && ma_kho === ma_kho_orig) {
        statusEl.textContent = 'Hợp lệ';
        statusEl.className = 'text-xs mt-1 h-4 text-green-600';
        inputEl.classList.remove('text-red-600');
        inputEl.classList.add('text-green-600');
        saveDonHangBtn.disabled = false;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = false;
        return;
    }

    const { count, error } = await query;

    inputEl.classList.remove('text-red-600', 'text-green-600');
    if (error) {
        statusEl.textContent = 'Lỗi kiểm tra';
        statusEl.className = 'text-xs mt-1 h-4 text-red-600';
        saveDonHangBtn.disabled = true;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = true;
    } else if (count > 0) {
        statusEl.textContent = 'Mã Kho bị trùng';
        statusEl.className = 'text-xs mt-1 h-4 text-red-600';
        inputEl.classList.add('text-red-600');
        saveDonHangBtn.disabled = true;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = true;
    } else {
        statusEl.textContent = 'Hợp lệ';
        statusEl.className = 'text-xs mt-1 h-4 text-green-600';
        inputEl.classList.add('text-green-600');
        const isDisabled = document.getElementById('don-hang-modal-ma-nx').classList.contains('text-red-600');
        saveDonHangBtn.disabled = isDisabled;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = isDisabled;
    }
}, 500);

const debouncedValidateMaNx = debounce(async (ma_nx) => {
    if (!saveDonHangBtn) saveDonHangBtn = document.getElementById('save-don-hang-btn');
    if (!saveAndPrintBtn) saveAndPrintBtn = document.getElementById('save-and-print-btn');
    const statusEl = document.getElementById('don-hang-modal-ma-nx-status');
    const inputEl = document.getElementById('don-hang-modal-ma-nx');
    const ma_kho_orig = document.getElementById('don-hang-edit-mode-ma-kho').value;

    if (!ma_nx) {
        statusEl.textContent = '';
        inputEl.classList.remove('text-red-600', 'text-yellow-600', 'text-green-600');
        inputEl.dataset.suggestion = '';
        saveDonHangBtn.disabled = true;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = true;
        return;
    }

    inputEl.classList.remove('text-red-600', 'text-yellow-600', 'text-green-600');

    // Fetch suggestion for the current input structure
    const suggestion = await fetchNextMaNxSuggestion(ma_nx);
    inputEl.dataset.suggestion = suggestion || '';

    if (ma_nx.endsWith('-')) {
        statusEl.textContent = `Đang xử lý ${suggestion ? `- Gợi ý: ${suggestion}` : ''}`;
        statusEl.className = 'text-xs mt-1 h-4 text-orange-600 font-medium';
        inputEl.classList.add('text-yellow-600');
        const isDisabled = document.getElementById('don-hang-modal-ma-kho').classList.contains('text-red-600');
        saveDonHangBtn.disabled = isDisabled;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = isDisabled;
        return;
    }

    // Nếu không kết thúc bằng '-', tức là đã xử lý xong số thứ tự -> Kiểm tra tính duy nhất
    let query = sb.from('don_hang').select('ma_nx', { count: 'exact', head: true }).eq('ma_nx', ma_nx);
    if (ma_kho_orig) {
        query = query.neq('ma_kho', ma_kho_orig);
    }
    const { count, error } = await query;

    if (error) {
        statusEl.textContent = 'Lỗi kiểm tra';
        statusEl.className = 'text-xs mt-1 h-4 text-red-600';
        saveDonHangBtn.disabled = true;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = true;
    } else if (count > 0) {
        statusEl.textContent = 'Mã NX bị trùng';
        statusEl.className = 'text-xs mt-1 h-4 text-red-600';
        inputEl.classList.add('text-red-600');
        saveDonHangBtn.disabled = true;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = true;
    } else {
        // YÊU CẦU: Đã xử lý thì không hiện dòng gợi ý nữa
        statusEl.textContent = 'Đã xử lý';
        statusEl.className = 'text-xs mt-1 h-4 text-green-600';
        inputEl.classList.add('text-green-600');
        const isDisabled = document.getElementById('don-hang-modal-ma-kho').classList.contains('text-red-600');
        saveDonHangBtn.disabled = isDisabled;
        if (saveAndPrintBtn) saveAndPrintBtn.disabled = isDisabled;
    }
}, 500);


function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}

function parseFileArray(fileData) {
    if (Array.isArray(fileData)) return fileData;
    if (typeof fileData === 'string' && fileData.startsWith('[') && fileData.endsWith(']')) {
        try {
            const parsed = JSON.parse(fileData);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("Failed to parse file data string:", fileData, e);
            return [];
        }
    }
    return [];
}

function getTinhTrangClass(tinh_trang) {
    if (!tinh_trang) return 'text-slate-400 font-normal';
    const tt = String(tinh_trang).trim();
    if (tt === 'Hết hạn sử dụng' || tt.toLowerCase().includes('hết hạn')) return 'text-red-600 font-bold';
    if (tt.includes('1-30')) return 'text-rose-600 font-bold';
    if (tt.includes('31-60')) return 'text-orange-600 font-bold';
    if (tt.includes('61-90')) return 'text-amber-600 font-semibold';
    if (tt.includes('91-120')) return 'text-amber-500 font-semibold';
    if (tt.includes('121-150')) return 'text-yellow-600 font-semibold';
    if (tt.includes('151-180')) return 'text-yellow-500 font-semibold';
    if (tt.includes('Trên 180') || tt.includes('Còn sử dụng')) return 'text-emerald-600 font-semibold';
    if (tt.includes('Cận date')) return 'text-rose-500 font-bold';
    if (tt === 'Không có date' || tt.toLowerCase().includes('không')) return 'text-slate-400 font-normal';
    if (tt === 'Hàng hư') return 'text-purple-600 font-semibold';
    return 'text-slate-700 font-medium';
}

function closeActiveLotPopover() {
    if (activeLotPopover) {
        activeLotPopover.element.remove();
        document.removeEventListener('click', activeLotPopover.closeHandler);
        activeLotPopover = null;
    }
}


export const DON_HANG_COLUMNS = [
    { key: 'ma_kho', label: 'Mã Kho', default: true },
    { key: 'thoi_gian', label: 'Thời Gian', default: true },
    { key: 'ma_nx', label: 'Mã NX', default: true },
    { key: 'yeu_cau', label: 'Yêu Cầu', default: true },
    { key: 'nganh', label: 'Ngành', default: true },
    { key: 'muc_dich', label: 'Mục Đích', default: true },
    { key: 'ghi_chu', label: 'Ghi Chú', default: true },
    { key: 'file', label: 'File', default: true }
];

export function getDonHangColumnOrder() {
    const userKey = currentUser?.gmail || currentUser?.ho_ten || 'default';
    try {
        const stored = localStorage.getItem('donHangColOrder_' + userKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.error("Error reading DonHang col order:", e);
    }
    return null;
}

export function saveDonHangColumnOrder(colOrder) {
    const userKey = currentUser?.gmail || currentUser?.ho_ten || 'default';
    try {
        localStorage.setItem('donHangColOrder_' + userKey, JSON.stringify(colOrder));
    } catch (e) {
        console.error("Error saving DonHang col order:", e);
    }
}

export function reorderDonHangTableBodyCells(table, colOrder) {
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

        // Cố định cột select ở đầu
        if (cellsMap['select']) {
            tr.appendChild(cellsMap['select']);
        }

        colOrder.forEach(colKey => {
            if (colKey !== 'select' && colKey !== 'file' && cellsMap[colKey]) {
                tr.appendChild(cellsMap[colKey]);
            }
        });

        // Cố định cột file ở cuối bên phải
        if (cellsMap['file']) {
            tr.appendChild(cellsMap['file']);
        }
    });
}

export function applyDonHangColumnOrder(table) {
    if (!table) table = document.getElementById('don-hang-table') || document.querySelector('#view-don-hang table');
    if (!table) return;

    const colOrder = getDonHangColumnOrder();
    if (!colOrder) return;

    const theadTr = table.querySelector('thead tr');
    if (theadTr) {
        const thsMap = {};
        theadTr.querySelectorAll('th').forEach(th => {
            if (th.dataset.col) thsMap[th.dataset.col] = th;
        });

        // Cố định cột select ở đầu
        if (thsMap['select']) {
            theadTr.appendChild(thsMap['select']);
        }

        colOrder.forEach(colKey => {
            if (colKey !== 'select' && colKey !== 'file' && thsMap[colKey]) {
                theadTr.appendChild(thsMap[colKey]);
            }
        });

        // Cố định cột file ở cuối bên phải
        if (thsMap['file']) {
            theadTr.appendChild(thsMap['file']);
        }
    }

    reorderDonHangTableBodyCells(table, colOrder);
}

export function initSortableDonHangColumns(table) {
    if (!table || typeof Sortable === 'undefined') return;
    const theadTr = table.querySelector('thead tr');
    if (!theadTr) return;

    if (theadTr._sortableInstance) {
        theadTr._sortableInstance.destroy();
    }

    theadTr._sortableInstance = Sortable.create(theadTr, {
        animation: 200,
        draggable: 'th:not(.no-drag)',
        filter: '.col-resizer, .filter-btn, .sort-btn, input, .no-drag, [data-col="select"], [data-col="file"]',
        preventOnFilter: false,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onEnd: function () {
            const colOrder = Array.from(theadTr.querySelectorAll('th')).map(th => th.dataset.col).filter(Boolean);
            saveDonHangColumnOrder(colOrder);
            reorderDonHangTableBodyCells(table, colOrder);
            showToast('Đã lưu thứ tự cột Đơn Hàng', 'success');
        }
    });
}

export function getDonHangColumnVisibility() {
    try {
        const stored = localStorage.getItem('donHangColumnVisibility');
        if (stored) {
            const parsed = JSON.parse(stored);
            const visibility = {};
            DON_HANG_COLUMNS.forEach(col => {
                visibility[col.key] = parsed[col.key] !== undefined ? parsed[col.key] : col.default;
            });
            return visibility;
        }
    } catch (e) {
        console.error("Error reading DonHang column visibility:", e);
    }
    const defaultVis = {};
    DON_HANG_COLUMNS.forEach(col => {
        defaultVis[col.key] = col.default;
    });
    return defaultVis;
}

export function saveDonHangColumnVisibility(visibility) {
    try {
        localStorage.setItem('donHangColumnVisibility', JSON.stringify(visibility));
    } catch (e) {
        console.error("Error saving DonHang column visibility:", e);
    }
}

export function applyDonHangColumnState() {
    const table = document.getElementById('don-hang-table') || document.querySelector('#view-don-hang table');
    if (!table) return;

    const visibility = getDonHangColumnVisibility();

    DON_HANG_COLUMNS.forEach(col => {
        const isVisible = visibility[col.key] !== false;
        const thElements = table.querySelectorAll(`th[data-col="${col.key}"]`);
        const tdElements = table.querySelectorAll(`td[data-col="${col.key}"]`);

        thElements.forEach(el => el.classList.toggle('hidden', !isVisible));
        tdElements.forEach(el => el.classList.toggle('hidden', !isVisible));
    });
}

export function updateDonHangSortButtonUI() {
    const state = viewStates['view-don-hang'];
    if (!state) return;
    const currentSort = state.sortBy;
    const isAsc = state.sortAsc;

    const table = document.getElementById('don-hang-table') || document.querySelector('#view-don-hang table');
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

export function initDonHangColumnsModal() {
    const modal = document.getElementById('don-hang-columns-modal');
    const openBtn = document.getElementById('don-hang-btn-columns');
    const closeBtn = document.getElementById('don-hang-columns-modal-close');
    const cancelBtn = document.getElementById('don-hang-columns-cancel-btn');
    const applyBtn = document.getElementById('don-hang-columns-apply-btn');
    const selectAllBtn = document.getElementById('don-hang-columns-select-all');
    const resetDefaultBtn = document.getElementById('don-hang-columns-reset-default');
    const listContainer = document.getElementById('don-hang-columns-checkbox-list');

    if (!modal || !openBtn) return;

    const renderCheckboxes = (visibility) => {
        if (!listContainer) return;
        listContainer.innerHTML = DON_HANG_COLUMNS.map(col => `
            <label class="flex items-center gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer border border-transparent hover:border-gray-200 transition-all select-none">
                <input type="checkbox" data-col-key="${col.key}" ${visibility[col.key] !== false ? 'checked' : ''} class="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer">
                <span class="font-medium text-gray-800">${col.label}</span>
            </label>
        `).join('');
    };

    openBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentVis = getDonHangColumnVisibility();
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
            DON_HANG_COLUMNS.forEach(c => defaults[c.key] = c.default);
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
            saveDonHangColumnVisibility(newVis);
            applyDonHangColumnState();
            closeModal();
            showToast('Đã lưu cấu hình cột hiển thị!', 'success');
        };
    }
}

function buildDonHangQuery() {
    const state = viewStates['view-don-hang'];
    let query = sb.from('don_hang').select('*', { count: 'exact' });

    if (currentUser?.phan_quyen === 'View') {
        query = query.eq('yeu_cau', currentUser.ho_ten);
    }

    if (state.filters.from_date) query = query.gte('thoi_gian', state.filters.from_date);
    if (state.filters.to_date) query = query.lte('thoi_gian', state.filters.to_date + 'T23:59:59');

    if (state.filters.loai?.length === 1) {
        const loaiPrefix = state.filters.loai[0] === 'Nhập' ? 'IN.%' : 'OUT.%';
        query = query.ilike('ma_kho', loaiPrefix);
    }

    const trangThaiFilter = state.filters.trang_thai_xu_ly || [];
    if (trangThaiFilter.length === 1) {
        if (trangThaiFilter[0] === 'Đang xử lý') {
            query = query.like('ma_nx', '%-');
        } else if (trangThaiFilter[0] === 'Đã xử lý') {
            query = query.not('ma_nx', 'like', '%-').not('ma_nx', 'is', null);
        }
    }
    if (state.filters.ma_kho?.length > 0) query = query.in('ma_kho', state.filters.ma_kho);
    if (state.filters.thoi_gian?.length > 0) query = query.in('thoi_gian', state.filters.thoi_gian);
    if (state.filters.ma_nx?.length > 0) query = query.in('ma_nx', state.filters.ma_nx);
    if (state.filters.yeu_cau?.length > 0) query = query.in('yeu_cau', state.filters.yeu_cau);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);
    if (state.filters.muc_dich?.length > 0) query = query.in('muc_dich', state.filters.muc_dich);
    if (state.filters.ghi_chu?.length > 0) query = query.in('ghi_chu', state.filters.ghi_chu);

    if (state.searchTerm) {
        const st = `%${state.searchTerm}%`;
        query = query.or(`ma_kho.ilike.${st},ma_nx.ilike.${st},yeu_cau.ilike.${st},nganh.ilike.${st},muc_dich.ilike.${st},ghi_chu.ilike.${st}`);
    }

    return query;
}

export async function fetchDonHang(page = viewStates['view-don-hang'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-don-hang'].currentPage = page;
        const state = viewStates['view-don-hang'];
        state.selected.clear();
        updateDonHangActionButtonsState();
        updateDonHangSelectionInfo();

        const { itemsPerPage } = state;
        const from = (page - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        const queryBuilder = buildDonHangQuery();
        if (!queryBuilder || typeof queryBuilder.order !== 'function') {
            console.error('Lỗi truy vấn đơn hàng. Đối tượng trả về không hợp lệ.', queryBuilder);
            showToast('Lỗi nghiêm trọng khi tạo truy vấn đơn hàng.', 'error');
            throw new Error('Invalid query builder');
        }

        const sortBy = state.sortBy || 'thoi_gian';
        const sortAsc = state.sortAsc !== undefined ? state.sortAsc : false;
        const { data, error, count } = await queryBuilder.order(sortBy, { ascending: sortAsc, nullsFirst: false }).range(from, to);

        if (error) {
            console.error(error);
            showToast("Lỗi khi tải dữ liệu đơn hàng.", 'error');
        } else {
            state.totalFilteredCount = count;
            cache.donHangList = data;

            renderDonHangTable(data);
            renderPagination('don-hang', count, from, to);
            updateDonHangSelectionInfo();
            updateFilterButtonTexts('don-hang');
        }
    } catch (err) {
        console.error("Fetch Don Hang failed:", err);
    } finally {
        if (showLoader) showLoading(false);
    }
}

function renderDonHangTable(data) {
    const tableBody = document.getElementById('don-hang-table-body');
    if (!tableBody) return;
    const table = document.getElementById('don-hang-table') || document.querySelector('#view-don-hang table');

    if (data && data.length > 0) {
        tableBody.innerHTML = data.map(dh => {
            const isSelected = viewStates['view-don-hang'].selected.has(dh.ma_kho);
            const thoi_gian = formatDateToDDMMYYYY(dh.thoi_gian);
            const filesAsArray = parseFileArray(dh.file);
            const fileCount = filesAsArray.length;

            const fileIcon = fileCount > 0 ?
                `<div class="relative cursor-pointer w-8 h-8 mx-auto flex items-center justify-center">
                    <svg class="w-7 h-7 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                    <span class="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center leading-none shadow-sm">${fileCount}</span>
                 </div>` : '';

            let maKhoIcon = '';
            if (dh.ma_kho.includes('OUT')) {
                maKhoIcon = `<svg class="w-4 h-4 inline-block ml-1 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>`;
            } else if (dh.ma_kho.includes('IN')) {
                maKhoIcon = `<svg class="w-4 h-4 inline-block ml-1 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>`;
            }
            const maKhoHtml = `<div class="flex items-center justify-center">
                <span class="text-blue-600 hover:underline font-semibold">${dh.ma_kho}</span>
                ${maKhoIcon}
            </div>`;

            return `
                <tr data-id="${dh.ma_kho}" class="hover:bg-gray-50 ${isSelected ? 'bg-blue-100' : ''}">
                    <td class="px-1 py-2 border border-gray-300 text-center select-none" data-col="select"><input type="checkbox" class="don-hang-select-row cursor-pointer" data-id="${dh.ma_kho}" ${isSelected ? 'checked' : ''}></td>
                    <td class="px-2 py-2 text-sm font-medium border border-gray-300 text-center cursor-pointer ma-kho-cell" data-col="ma_kho">${maKhoHtml}</td>
                    <td class="px-2 py-2 text-sm text-gray-600 border border-gray-300 text-center whitespace-nowrap" data-col="thoi_gian">${thoi_gian}</td>
                    <td class="px-2 py-2 text-sm border border-gray-300 text-center right-click-edit-cell" data-col="ma_nx" data-field="ma_nx">
                        <div class="cell-content cursor-help font-bold" title="Chuột phải để sửa">${formatMaNxHtml(dh.ma_nx)}</div>
                    </td>
                    <td class="px-2 py-2 text-sm text-gray-600 border border-gray-300 text-center" data-col="yeu_cau">${dh.yeu_cau || ''}</td>
                    <td class="px-2 py-2 text-sm text-gray-600 border border-gray-300 text-center" data-col="nganh">${dh.nganh || ''}</td>
                    <td class="px-2 py-2 text-sm text-gray-600 border border-gray-300 text-left" data-col="muc_dich" title="${(dh.muc_dich || '').replace(/"/g, '&quot;')}">
                        <div class="muc-dich-content line-clamp-2">${dh.muc_dich || ''}</div>
                    </td>
                    <td class="px-2 py-2 text-sm text-gray-600 border border-gray-300 text-left right-click-edit-cell" data-col="ghi_chu" data-field="ghi_chu" title="${(dh.ghi_chu || '').replace(/"/g, '&quot;')}">
                        <div class="note-container flex flex-col justify-center">
                            <div class="cell-content cursor-help" title="Chuột phải để sửa">${dh.ghi_chu || ''}</div>
                            <div class="note-footer flex items-center gap-2 mt-0.5">
                                ${calculateTotalKien(dh.ghi_chu) > 0 ? `<span class="font-black text-black text-xs">Tổng : ${calculateTotalKien(dh.ghi_chu)} Kiện</span>` : ''}
                                ${dh.ghi_chu ? `
                                    <button type="button" class="toggle-note-btn text-blue-600 font-bold hover:underline text-xs" onclick="event.stopPropagation(); window.toggleNote(this)">Xem thêm</button>
                                ` : ''}
                            </div>
                        </div>
                    </td>
                    <td class="px-2 py-2 border border-gray-300 text-center file-cell relative group dropzone-cell outline-none focus:ring-2 focus:ring-blue-300" data-col="file" tabindex="0">
                        <div class="inline-file-upload-overlay absolute inset-0 bg-blue-500 bg-opacity-5 hidden group-hover:flex items-center justify-center pointer-events-none">
                            <svg class="w-4 h-4 text-blue-500 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                        </div>
                        ${fileIcon}
                    </td>
                </tr>
            `;
        }).join('');

        if (table) {
            applyDonHangColumnOrder(table);
            applyDonHangColumnState();
            updateDonHangSortButtonUI();
            initResizableTable(table, 'don_hang_col_widths');
        }

        checkNotesOverflow();
        setTimeout(checkNotesOverflow, 100);
    } else {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-gray-500">Không có dữ liệu đơn hàng</td></tr>';
    }
}

function checkNotesOverflow() {
    const tableBody = document.getElementById('don-hang-table-body');
    if (!tableBody) return;
    const containers = tableBody.querySelectorAll('.note-container');
    containers.forEach(container => {
        const content = container.querySelector('.cell-content');
        const btn = container.querySelector('.toggle-note-btn');
        if (!btn || !content) return;
        
        if (container.classList.contains('expanded')) {
            btn.style.display = 'inline-block';
            return;
        }

        const isOverflowing = content.scrollHeight > content.clientHeight + 2 || (content.textContent && content.textContent.split('\n').length > 2);
        btn.style.display = isOverflowing ? 'inline-block' : 'none';
    });
}

function updateChiTietSummary() {
    const summaryEl = document.getElementById('don-hang-chi-tiet-summary');
    if (!summaryEl) return;

    const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
    if (!loaiDon) {
        summaryEl.innerHTML = '';
        return;
    }

    const totalYCSL = chiTietItems.reduce((sum, item) => sum + (parseFloat(item.yc_sl) || 0), 0);
    const totalSL = chiTietItems.reduce((sum, item) => sum + (parseFloat(item.sl) || 0), 0);

    if (loaiDon === 'Xuat') {
        const totalTB = chiTietItems.reduce((sum, item) => sum + (parseFloat(item.tb) || 0), 0);
        const totalTH = chiTietItems.reduce((sum, item) => sum + (parseFloat(item.th) || 0), 0);
        summaryEl.innerHTML = `
            <span class="font-bold">Tổng cộng</span> Thực Xuất / YCSL: 
            <span class="font-bold text-green-600">${totalSL.toLocaleString()}</span> 
            (<span class="font-bold text-indigo-600">${totalTB.toLocaleString()} TB</span> / 
            <span class="font-bold text-amber-600">${totalTH.toLocaleString()} TH</span>) / 
            <span class="font-bold text-gray-800">${totalYCSL.toLocaleString()}</span>
        `;
    } else {
        summaryEl.innerHTML = `
            <span class="font-bold">Tổng cộng</span> Thực Nhập / YCSL: 
            <span class="font-bold text-green-600">${totalSL.toLocaleString()}</span> / 
            <span class="font-bold text-gray-800">${totalYCSL.toLocaleString()}</span>
        `;
    }
}

async function fetchChiTietDonHang(ma_kho_don_hang) {
    showLoading(true);
    const { data, error } = await sb.from('chi_tiet').select('*').eq('ma_kho', ma_kho_don_hang).order('stt', { ascending: true });
    showLoading(false);
    if (error) {
        showToast("Lỗi khi tải chi tiết đơn hàng.", "error");
        return [];
    }
    return data || [];
}

function toggleDonHangModalColumns() {
    const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
    const isNhap = loaiDon === 'Nhap';

    document.getElementById('don-hang-chi-tiet-tb-header')?.classList.toggle('hidden', isNhap);
    document.getElementById('don-hang-chi-tiet-th-header')?.classList.toggle('hidden', isNhap);
    document.querySelectorAll('.chi-tiet-tb-cell').forEach(cell => cell.classList.toggle('hidden', isNhap));
    document.querySelectorAll('.chi-tiet-th-cell').forEach(cell => cell.classList.toggle('hidden', isNhap));

    document.getElementById('don-hang-fill-sl-all-btn')?.classList.toggle('hidden', !isNhap);

    const slHeaderTextEl = document.getElementById('don-hang-sl-header-text');
    if (slHeaderTextEl) {
        slHeaderTextEl.textContent = isNhap ? 'Nhập' : 'SL';
    }
}


function renderChiTietTable() {
    const tbody = document.getElementById('don-hang-chi-tiet-body');
    const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
    const isViewMode = document.getElementById('save-don-hang-btn').classList.contains('hidden');

    const runningTotalsMap = new Map();
    const seenCountsMap = new Map();

    tbody.innerHTML = chiTietItems.filter(Boolean).map((item, index) => {
        const maVach = item.ma_vach;
        const actualStock = item.tonKhoData?.ton_cuoi || 0;

        const initialTotalForThisMaVach = initialChiTietItems
            .filter(initItem => initItem.ma_vach === maVach && maVach)
            .reduce((sum, initItem) => sum + (parseFloat(initItem.sl) || 0), 0);

        let stockBeforeThisOrder;
        if (loaiDon === 'Nhap') {
            stockBeforeThisOrder = actualStock - initialTotalForThisMaVach;
        } else {
            stockBeforeThisOrder = actualStock + initialTotalForThisMaVach;
        }

        const currentSlInput = isNaN(parseFloat(item.sl)) ? 0 : parseFloat(item.sl);
        const previousTotalInUI = runningTotalsMap.get(maVach) || 0;
        const newRunningTotalInUI = previousTotalInUI + currentSlInput;
        runningTotalsMap.set(maVach, newRunningTotalInUI);

        const currentSeenCount = (seenCountsMap.get(maVach) || 0) + 1;
        seenCountsMap.set(maVach, currentSeenCount);
        const isDuplicateRow = currentSeenCount > 1 && maVach;
        const star = isDuplicateRow ? '<span class="text-red-600 font-bold ml-0.5">*</span>' : '';

        let projectedStock;
        let projectedStockText;
        if (loaiDon === 'Nhap') {
            projectedStock = stockBeforeThisOrder + newRunningTotalInUI;
            projectedStockText = `Sau Nhập: <span class="font-bold text-green-600">${projectedStock.toLocaleString()}</span>${star}`;
        } else {
            projectedStock = stockBeforeThisOrder - newRunningTotalInUI;
            projectedStockText = `Sau Xuất: <span class="font-bold ${projectedStock < 0 ? 'text-red-600' : 'text-green-600'}">${projectedStock.toLocaleString()}</span>${star}`;
        }

        const pendingNhap = item.pendingData?.nhap || 0;
        const pendingXuat = item.pendingData?.xuat || 0;
        const pendingInfo = ` | <span class="text-yellow-600 font-bold">Chờ Nhập: ${pendingNhap.toLocaleString()}</span> | <span class="text-yellow-600 font-bold">Chờ Xuất: ${pendingXuat.toLocaleString()}</span>`;
        const tonKhoInfo = `Tồn: <span class="font-bold text-blue-600">${stockBeforeThisOrder.toLocaleString()}</span>`;

        const barcodeColorClass = item.ma_vach_valid === true ? 'text-green-600' : 'text-red-600';
        const generatedBarcode = item.ma_vach;

        let slColorClass = '';
        const slNum = parseFloat(item.sl);
        const ycs_Num = parseFloat(item.yc_sl);
        if (!isNaN(slNum) && !isNaN(ycs_Num)) {
            if (slNum === ycs_Num) {
                slColorClass = 'text-green-600 font-bold';
            } else {
                slColorClass = 'text-red-600 font-bold';
            }
        }

        let tbColorClass = 'text-red-600 font-bold';
        let thColorClass = 'text-red-600 font-bold';
        if (loaiDon === 'Xuat') {
            const tbVal = parseFloat(item.tb) || 0;
            const thVal = parseFloat(item.th) || 0;
            const slVal = parseFloat(item.sl) || 0;
            if (tbVal + thVal === slVal) {
                tbColorClass = 'text-blue-600 font-bold';
                thColorClass = 'text-yellow-600 font-bold';
            }
        }

        const isNhapMode = loaiDon === 'Nhap';
        const trayValue = item.tray !== undefined ? item.tray : (item.tonKhoData?.tray || '');
        const trayInfo = (isNhapMode && !isViewMode)
            ? `<label class="text-xs text-gray-500 mr-1">Tray:</label><input type="text" value="${trayValue}" placeholder="Nhập tray..." class="chi-tiet-tray-input border rounded px-1 py-0.5 text-xs w-20 text-indigo-700 font-bold" data-id="${item.id}">`
            : `Tray: <span class="font-bold text-indigo-600">${trayValue || '?'}</span>`;

        return `
            <tr data-id="${item.id}" class="chi-tiet-row group">
                <td class="p-1 border text-center align-top ${isViewMode || isNhapTraMode ? '' : 'drag-handle cursor-move'}">${index + 1}</td>
                <td class="p-1 border align-top relative">
                    <input type="text" value="${item.ma_vt || ''}" class="w-full p-1 border rounded chi-tiet-input" data-field="ma_vt" data-col="ma_vt" autocomplete="off" ${isViewMode || isNhapTraMode ? 'disabled' : ''}>
                </td>
                <td class="p-1 border align-top break-words chi-tiet-ten-vt-cell">
                    <div class="relative flex items-start gap-1 justify-between">
                        <div class="name-text line-clamp-2 text-xs text-gray-700 leading-normal flex-1">
                            ${item.ten_vt || ''}
                        </div>
                        ${item.ten_vt && item.ten_vt.length > 20 ? `
                        <button type="button" class="toggle-name-btn p-0.5 text-gray-400 hover:text-gray-600 focus:outline-none flex-shrink-0" title="Xem thêm/Ẩn bớt">
                            <svg class="w-4 h-4 eye-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                            </svg>
                            <svg class="w-4 h-4 eye-off-icon hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"></path>
                            </svg>
                        </button>
                        ` : ''}
                    </div>
                </td>
                <td class="p-1 border align-top">
                    <div class="relative">
                        <input type="text" value="${item.lot || ''}" class="w-full p-1 border rounded chi-tiet-lot-input" data-col="lot" readonly placeholder="Ch\u1ecdn LOT..." ${isViewMode || isNhapTraMode ? 'disabled' : ''}>
                        <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </td>
                <td class="p-1 border align-top text-center">${item.date || ''}</td>
                <td class="p-1 border align-top">
                    <input type="number" value="${item.yc_sl || ''}" min="1" class="w-full p-1 border rounded chi-tiet-input" data-field="yc_sl" data-col="yc_sl" ${isViewMode || isNhapTraMode ? 'disabled' : ''}>
                </td>
                <td class="p-1 border align-top">
                    <input type="number" value="${(item.sl === null || item.sl === undefined) ? '' : item.sl}" min="0" class="w-full p-1 border rounded chi-tiet-input ${slColorClass}" data-field="sl" data-col="sl" ${isViewMode ? 'disabled' : ''}>
                </td>
                <td class="p-1 border align-top chi-tiet-tb-cell">
                    <input type="number" value="${(item.tb === null || item.tb === undefined) ? '' : item.tb}" min="0" class="w-full p-1 border rounded chi-tiet-input ${tbColorClass}" data-field="tb" data-col="tb" ${isViewMode ? 'disabled' : ''}>
                </td>
                <td class="p-1 border align-top chi-tiet-th-cell">
                    <input type="number" value="${(item.th === null || item.th === undefined) ? '' : item.th}" min="0" class="w-full p-1 border rounded chi-tiet-input ${thColorClass}" data-field="th" data-col="th" ${isViewMode ? 'disabled' : ''}>
                </td>
                <td class="p-1 border align-top text-center font-mono ${barcodeColorClass}">${generatedBarcode || ''}</td>
                <td class="p-1 border text-center align-top">
                    ${!isViewMode && (!isNhapTraMode || (isNhapTraMode && (parseFloat(item.yc_sl) || 0) === 0)) ? `<button type="button" class="text-red-500 hover:text-red-700 chi-tiet-delete-btn text-xl font-bold">&times;</button>` : ''}
                </td>
            </tr>
            <tr data-info-id="${item.id}" class="bg-blue-50">
                 <td colspan="11" class="px-2 py-1.5 text-xs text-gray-800 border border-t-0 border-blue-200">
                    <div class="flex justify-between items-center">
                        <div>
                            <span class="font-semibold">${tonKhoInfo}</span>${pendingInfo} | <span class="font-semibold">${projectedStockText}</span>
                        </div>
                        <div class="flex items-center gap-1">
                            ${trayInfo}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    toggleDonHangModalColumns();
    updateChiTietSummary();
}

/**
 * Điều hướng thông minh:
 * 1. Nhấn Tab/Enter khi có gợi ý: Chọn cái đầu tiên.
 * 2. Nhấn Tab để dịch chuyển qua các ô có thể sửa được trong cùng dòng, hết dòng sẽ xuống dòng tiếp theo.
 * 3. Nhấn Enter để di chuyển xuống ô cùng cột ở dòng tiếp theo.
 */
function getEditableInputs() {
    const container = document.getElementById('don-hang-chi-tiet-body');
    if (!container) return [];
    
    return Array.from(container.querySelectorAll('input')).filter(input => {
        return !input.disabled && (input.offsetWidth > 0 || input.offsetHeight > 0);
    });
}

function focusNextHorizontalInput(currentInput, isShift = false) {
    const allInputs = getEditableInputs();
    if (allInputs.length === 0) return;
    
    const index = allInputs.indexOf(currentInput);
    if (index === -1) return;
    
    if (isShift) {
        if (index > 0) {
            allInputs[index - 1].focus();
            if (allInputs[index - 1].select) allInputs[index - 1].select();
        }
    } else {
        if (index < allInputs.length - 1) {
            allInputs[index + 1].focus();
            if (allInputs[index + 1].select) allInputs[index + 1].select();
        } else {
            document.getElementById('don-hang-them-vat-tu-btn').focus();
        }
    }
}

function focusNextRowInput(currentInput) {
    let currentCol = currentInput.dataset.col;
    let currentRow = currentInput.closest('tr.chi-tiet-row');
    
    if (currentInput.classList.contains('chi-tiet-tray-input')) {
        currentCol = 'tray';
        const infoRow = currentInput.closest('tr');
        currentRow = infoRow ? infoRow.previousElementSibling : null;
    }
    
    if (!currentRow) return;

    const nextRow = currentRow.nextElementSibling?.nextElementSibling;
    if (nextRow && nextRow.classList.contains('chi-tiet-row')) {
        let nextInput;
        if (currentCol === 'tray') {
            const nextInfoRow = nextRow.nextElementSibling;
            nextInput = nextInfoRow?.querySelector('.chi-tiet-tray-input');
        } else {
            nextInput = nextRow.querySelector(`[data-col="${currentCol}"]`);
        }
        if (nextInput) {
            nextInput.focus();
            if (nextInput.select) nextInput.select();
        }
    } else {
        document.getElementById('don-hang-them-vat-tu-btn').focus();
    }
}

function focusNextFormField(currentInput) {
    const focusable = Array.from(document.querySelectorAll('#don-hang-form input, #don-hang-form select, #don-hang-form textarea'))
        .filter(el => !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null);
    const index = focusable.indexOf(currentInput);
    if (index > -1 && index < focusable.length - 1) {
        focusable[index + 1].focus();
    }
}

function handleSmartTabNavigation(event) {
    if (event.key !== 'Tab' && event.key !== 'Enter') return;

    const input = event.target;
    const isShift = event.shiftKey;

    const lotPopover = document.getElementById('lot-selector-popover');
    const autocompletePopover = document.querySelector('.absolute.z-40.bg-white.border');

    if (lotPopover) {
        if (!input.value.trim()) {
            const firstOption = lotPopover.querySelector('.lot-option');
            if (firstOption) {
                event.preventDefault();
                firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                
                setTimeout(() => {
                    if (event.key === 'Enter') {
                        focusNextRowInput(input);
                    } else {
                        focusNextHorizontalInput(input, isShift);
                    }
                }, 50);
                return;
            }
        } else {
            closeActiveLotPopover();
            if (event.key === 'Tab') {
                event.preventDefault();
                focusNextHorizontalInput(input, isShift);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                focusNextRowInput(input);
            }
            return;
        }
    }

    if (autocompletePopover) {
        const firstOption = autocompletePopover.querySelector('.autocomplete-option');
        if (firstOption) {
            event.preventDefault();
            firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

            setTimeout(() => {
                const isDetailRow = input.classList.contains('chi-tiet-input') || input.classList.contains('chi-tiet-tray-input') || input.classList.contains('chi-tiet-lot-input');
                if (event.key === 'Enter') {
                    if (isDetailRow || input.dataset.col) {
                        focusNextRowInput(input);
                    } else {
                        focusNextFormField(input);
                    }
                } else {
                    if (isDetailRow) {
                        focusNextHorizontalInput(input, isShift);
                    } else {
                        focusNextFormField(input);
                    }
                }
            }, 50);
            return;
        }
    }

    const isDetailRow = input.classList.contains('chi-tiet-input') || input.classList.contains('chi-tiet-tray-input') || input.classList.contains('chi-tiet-lot-input');
    if (isDetailRow) {
        if (event.key === 'Tab') {
            event.preventDefault();
            focusNextHorizontalInput(input, isShift);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            focusNextRowInput(input);
        }
    }
}

function parseDateDDMMYYYY(dateString) {
    if (!dateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return null;
    const parts = dateString.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (year < 1000 || year > 9999 || month === 0 || month > 12) return null;
    const monthLength = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0)) {
        monthLength[1] = 29;
    }
    if (day <= 0 || day > monthLength[month - 1]) return null;
    const date = new Date(year, month - 1, day);
    return isNaN(date.getTime()) ? null : date;
}

function calculateTinhTrangFromDate(dateStr) {
    const dateValue = parseDateDDMMYYYY(dateStr);
    if (!dateValue) return 'Còn sử dụng';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    if (dateValue <= today) {
        return 'Hết hạn sử dụng';
    } else if (dateValue > today && dateValue <= threeMonthsFromNow) {
        return 'Cận date';
    }
    return 'Còn sử dụng';
}

function openLotSelectorPopover(inputElement, item) {
    closeActiveLotPopover();

    const popoverTemplate = document.getElementById('autocomplete-popover-template');
    if (!popoverTemplate) return;

    const popoverContent = popoverTemplate.content.cloneNode(true);
    const popover = popoverContent.querySelector('div');
    popover.id = 'lot-selector-popover';
    popover.style.width = `390px`;
    popover.classList.remove('max-h-60');

    const rect = inputElement.getBoundingClientRect();
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${rect.bottom + window.scrollY}px`;
    document.body.appendChild(popover);

    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'p-2 border-b bg-gray-50 sticky top-0 z-20';
    searchWrapper.innerHTML = `
        <div class="relative">
            <input type="text" class="lot-search-input w-full p-2 pr-8 text-sm border rounded shadow-sm focus:ring-2 focus:ring-blue-400 outline-none" placeholder="Tìm LOT hoặc Date (dd/mm/yyyy)...">
            <div class="absolute inset-y-0 right-0 flex items-center pr-2 text-gray-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
        </div>
    `;
    popover.prepend(searchWrapper);

    const searchInput = searchWrapper.querySelector('.lot-search-input');
    const optionsList = popover.querySelector('.autocomplete-options-list');
    optionsList.classList.add('max-h-60', 'overflow-y-auto');

    // Tạo phần chân Popover: Cho phép thêm LOT & Date mới ngay tại đây
    const addSection = document.createElement('div');
    addSection.className = 'p-2.5 border-t border-slate-200 bg-slate-50 sticky bottom-0 z-20 rounded-b-lg';
    addSection.innerHTML = `
        <div id="lot-add-toggle-container">
            <button type="button" id="lot-show-add-form-btn" class="w-full py-2 px-3 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50/80 hover:bg-blue-100/80 rounded-lg border border-blue-200/80 flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98]">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                + Thêm LOT &amp; Date mới
            </button>
        </div>
        <div id="lot-add-form" class="hidden space-y-2.5 pt-1">
            <div class="text-xs font-bold text-slate-700 flex justify-between items-center">
                <span>Nhập LOT &amp; Hạn dùng mới:</span>
                <button type="button" id="lot-hide-add-form-btn" class="text-slate-400 hover:text-slate-600 text-sm font-bold px-1 rounded hover:bg-slate-200 transition-colors">&times;</button>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <div>
                    <label class="block text-[10px] font-semibold text-slate-600 mb-0.5">LOT <span class="text-rose-500">*</span></label>
                    <input type="text" id="new-lot-val-input" placeholder="VD: LOT123" class="w-full p-2 text-xs border border-slate-300 rounded-lg uppercase font-medium focus:ring-2 focus:ring-blue-400 outline-none">
                </div>
                <div>
                    <label class="block text-[10px] font-semibold text-slate-600 mb-0.5">Date <span class="text-rose-500">*</span> (dd/mm/yyyy)</label>
                    <input type="text" id="new-date-val-input" placeholder="dd/mm/yyyy" maxlength="10" class="w-full p-2 text-xs border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-blue-400 outline-none">
                </div>
            </div>
            <button type="button" id="new-lot-confirm-btn" class="w-full py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 text-xs font-semibold rounded-lg shadow-sm hover:shadow flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]">
                <svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                Xác nhận dùng LOT mới này
            </button>
        </div>
    `;
    popover.appendChild(addSection);

    const showAddFormBtn = addSection.querySelector('#lot-show-add-form-btn');
    const hideAddFormBtn = addSection.querySelector('#lot-hide-add-form-btn');
    const addFormEl = addSection.querySelector('#lot-add-form');
    const toggleContainer = addSection.querySelector('#lot-add-toggle-container');
    const newLotInput = addSection.querySelector('#new-lot-val-input');
    const newDateInput = addSection.querySelector('#new-date-val-input');
    const newLotConfirmBtn = addSection.querySelector('#new-lot-confirm-btn');

    const toggleNewLotForm = (show) => {
        if (show) {
            toggleContainer.classList.add('hidden');
            addFormEl.classList.remove('hidden');
            if (searchInput.value.trim() && !newLotInput.value.trim()) {
                newLotInput.value = searchInput.value.trim().toUpperCase();
            }
            setTimeout(() => newLotInput.focus(), 50);
        } else {
            toggleContainer.classList.remove('hidden');
            addFormEl.classList.add('hidden');
        }
    };

    showAddFormBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleNewLotForm(true);
    });

    hideAddFormBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleNewLotForm(false);
    });

    // Validation khi thay đổi ngày giống hệt ở Tồn Kho
    newDateInput.addEventListener('change', (e) => {
        const input = e.target;
        const val = input.value.trim();
        const dateValue = parseDateDDMMYYYY(val);
        if (val && !dateValue) {
            showToast('Ngày không hợp lệ. Vui lòng nhập đúng dd/mm/yyyy.', 'error');
            input.classList.add('border-red-500');
        } else {
            input.classList.remove('border-red-500');
        }
    });

    const handleConfirmNewLot = async () => {
        const lotVal = (newLotInput.value || '').trim().toUpperCase();
        const dateVal = (newDateInput.value || '').trim();

        if (!item.ma_vt) {
            showToast('Vui lòng nhập Mã VT trước khi thêm LOT.', 'error');
            return;
        }

        if (!lotVal) {
            showToast('Vui lòng nhập LOT.', 'error');
            newLotInput.focus();
            return;
        }

        const parsedDate = parseDateDDMMYYYY(dateVal);
        if (!parsedDate) {
            showToast('Ngày hết hạn không hợp lệ. Vui lòng nhập định dạng dd/mm/yyyy (ví dụ: 31/12/2026).', 'error');
            newDateInput.focus();
            return;
        }

        const dateParts = dateVal.split('/');
        const formattedDate = `${dateParts[0]}.${dateParts[1]}.${dateParts[2]}`;
        const newMaVach = [item.ma_vt, lotVal, formattedDate].join('');

        // Lấy ngành đang chọn trong form
        const currentNganh = document.getElementById('don-hang-modal-nganh')?.value?.trim() || '';

        // Đối chiếu view sản phẩm để lấy tên người phụ trách và tên vật tư
        let phuTrach = item.phu_trach || '';
        let tenVt = item.ten_vt || '';

        try {
            let spQuery = sb.from('san_pham').select('ten_vt, phu_trach, nganh').eq('ma_vt', item.ma_vt);
            if (currentNganh) {
                spQuery = spQuery.eq('nganh', currentNganh);
            }
            const { data: spList } = await spQuery.limit(1);
            if (spList && spList.length > 0) {
                phuTrach = spList[0].phu_trach || '';
                tenVt = spList[0].ten_vt || tenVt;
            } else {
                const { data: fallbackSp } = await sb.from('san_pham').select('ten_vt, phu_trach, nganh').eq('ma_vt', item.ma_vt).limit(1);
                if (fallbackSp && fallbackSp.length > 0) {
                    phuTrach = fallbackSp[0].phu_trach || '';
                    tenVt = fallbackSp[0].ten_vt || tenVt;
                }
            }
        } catch (err) {
            console.error("Lỗi tra cứu san_pham cho LOT mới:", err);
        }

        const tinhTrang = calculateTinhTrangFromDate(dateVal);

        const newLotOptionData = {
            ma_vach: newMaVach,
            ma_vt: item.ma_vt,
            lot: lotVal,
            date: dateVal,
            ten_vt: tenVt,
            tinh_trang: tinhTrang,
            ton_cuoi: 0,
            ton_dau: 0,
            nhap: 0,
            xuat: 0,
            tray: '',
            nganh: currentNganh,
            phu_trach: phuTrach,
            pendingData: { nhap: 0, xuat: 0 },
            isNewLot: true
        };

        if (!item.lotOptions) item.lotOptions = [];
        if (!item.lotOptions.some(o => o.ma_vach === newMaVach)) {
            item.lotOptions.unshift(newLotOptionData);
        }

        item.ma_vach = newMaVach;
        item.date = dateVal;
        item.lot = lotVal;
        item.ten_vt = tenVt;
        item.nganh = currentNganh;
        item.phu_trach = phuTrach;
        item.tonKhoData = newLotOptionData;
        item.pendingData = { nhap: 0, xuat: 0 };
        item.ma_vach_valid = true;
        item.isNewLot = true;

        const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
        const requestedQty = parseFloat(item.yc_sl) || 0;
        const isTbChecked = document.getElementById('don-hang-chi-tiet-tb-checkbox')?.checked;
        const isThChecked = document.getElementById('don-hang-chi-tiet-th-checkbox')?.checked;

        item.sl = requestedQty;
        if (isTbChecked) item.tb = requestedQty;
        if (isThChecked) item.th = requestedQty;

        closeActiveLotPopover();
        renderChiTietTable();
        showToast(`Đã áp dụng LOT mới: ${lotVal} (${dateVal})`, 'success');
    };

    newLotConfirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleConfirmNewLot();
    });

    [newLotInput, newDateInput].forEach(inp => {
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleConfirmNewLot();
            }
        });
    });

    const renderOptions = (searchTerm = '') => {
        const lowerSearch = searchTerm.toLowerCase();
        const filteredOptions = (item.lotOptions || []).filter(opt =>
            (opt.lot || '').toLowerCase().includes(lowerSearch) ||
            (opt.date || '').toLowerCase().includes(lowerSearch)
        );

        if (filteredOptions.length > 0) {
            filteredOptions.sort((a, b) => {
                // 1. Ưu tiên có tồn kho lên trước
                const aHasStock = a.ton_cuoi > 0 ? 1 : 0;
                const bHasStock = b.ton_cuoi > 0 ? 1 : 0;
                if (aHasStock !== bHasStock) return bHasStock - aHasStock;

                // 2. Ưu tiên Date gần lên trước (FEFO)
                const parseDateStr = (d) => {
                    if (!d) return "99999999";
                    const p = d.split('/');
                    if (p.length !== 3) return d;
                    return p[2] + p[1].padStart(2, '0') + p[0].padStart(2, '0');
                };
                const dateA = parseDateStr(a.date);
                const dateB = parseDateStr(b.date);
                if (dateA !== dateB) return dateA < dateB ? -1 : 1;

                // 3. Nếu trùng date, ưu tiên SL xuất lớn hơn
                return (b.xuat || 0) - (a.xuat || 0);
            });

            optionsList.innerHTML = filteredOptions.map(opt => {
                const tonKhoClass = opt.ton_cuoi > 0 ? 'text-green-600' : 'text-red-600';
                const tinhTrangClass = getTinhTrangClass(opt.tinh_trang);

                return `
                    <div class="px-3 py-2 cursor-pointer hover:bg-gray-100 border-b last:border-b-0 lot-option" data-ma-vach="${opt.ma_vach}">
                        <div class="flex justify-between items-center text-sm font-medium gap-2">
                            <span class="flex-1 text-left font-semibold">LOT: ${opt.lot || 'Chưa có LOT'}</span>
                            <div class="flex-1 flex justify-center items-center gap-2">
                                <span class="text-green-600 font-semibold" title="Tổng Nhập">N:${opt.nhap || 0}</span>
                                <span class="text-red-600 font-semibold" title="Tổng Xuất">X:${opt.xuat || 0}</span>
                            </div>
                            <span class="flex-1 text-right ${tonKhoClass} font-bold">Tồn:${opt.ton_cuoi}</span>
                        </div>
                        <div class="flex justify-between items-center text-xs text-gray-500 mt-1">
                            <span>${opt.date || 'No Date'}</span>
                            <span class="${tinhTrangClass}">${opt.tinh_trang || 'N/A'}</span>
                            <span>Tray: ${opt.tray || '?'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            optionsList.innerHTML = `
                <div class="p-4 text-center text-sm text-gray-500">
                    <p class="italic mb-2">Không tìm thấy LOT nào phù hợp.</p>
                    <button type="button" class="lot-quick-add-btn text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-100 inline-flex items-center gap-1 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        Thêm LOT &amp; Date mới
                    </button>
                </div>
            `;
            const quickBtn = optionsList.querySelector('.lot-quick-add-btn');
            if (quickBtn) {
                quickBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleNewLotForm(true);
                });
            }
        }
    };

    renderOptions('');

    searchInput.addEventListener('input', (e) => renderOptions(e.target.value));

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            const firstOption = optionsList.querySelector('.lot-option');
            if (firstOption) {
                e.preventDefault();
                firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                focusNextRowInput(inputElement);
            }
        }
    });

    setTimeout(() => searchInput.focus(), 50);

    const onSelect = (selectedMaVach) => {
        const selectedOptionData = item.lotOptions.find(opt => opt.ma_vach === selectedMaVach);
        if (selectedOptionData) {
            item.ma_vach = selectedOptionData.ma_vach;
            item.date = selectedOptionData.date;
            item.lot = selectedOptionData.lot;
            item.tonKhoData = selectedOptionData;
            item.ten_vt = selectedOptionData.ten_vt;
            item.nganh = selectedOptionData.nganh;
            item.phu_trach = selectedOptionData.phu_trach;
            item.pendingData = selectedOptionData.pendingData;
            item.ma_vach_valid = true;

            const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
            if (loaiDon === 'Xuat') {
                const availableStock = item.tonKhoData?.ton_cuoi || 0;
                const requestedQty = parseFloat(item.yc_sl) || 0;

                const isTbChecked = document.getElementById('don-hang-chi-tiet-tb-checkbox')?.checked;
                const isThChecked = document.getElementById('don-hang-chi-tiet-th-checkbox')?.checked;

                const actualSl = Math.min(availableStock, requestedQty);
                item.sl = actualSl;

                if (isTbChecked) {
                    item.tb = actualSl;
                }
                if (isThChecked) {
                    item.th = actualSl;
                }
            }
        }
        closeActiveLotPopover();
        renderChiTietTable();
    };

    optionsList.addEventListener('mousedown', (e) => {
        const optionEl = e.target.closest('.lot-option');
        if (optionEl) {
            e.preventDefault();
            onSelect(optionEl.dataset.maVach);
        }
    });

    const closeHandler = (e) => {
        if (!inputElement.contains(e.target) && !popover.contains(e.target)) {
            closeActiveLotPopover();
        }
    };

    setTimeout(() => document.addEventListener('click', closeHandler), 0);

    activeLotPopover = { element: popover, closeHandler: closeHandler };
}

function updateDonHangSelectionInfo() {
    const selectionInfoEl = document.getElementById('don-hang-selection-info');
    if (!selectionInfoEl) return;
    const state = viewStates['view-don-hang'];
    const selectedCount = state.selected.size;
    const totalCount = state.totalFilteredCount;
    selectionInfoEl.textContent = `${selectedCount} / ${totalCount} hàng được chọn`;
}

function updateDonHangActionButtonsState() {
    const state = viewStates['view-don-hang'];
    const selectedIds = Array.from(state.selected);
    const selectedCount = selectedIds.length;
    const editBtn = document.getElementById('don-hang-btn-edit');
    const deleteBtn = document.getElementById('don-hang-btn-delete');
    const printBtn = document.getElementById('don-hang-btn-print');
    const msgBtn = document.getElementById('don-hang-btn-msg');
    const shipBtn = document.getElementById('don-hang-btn-shipping');

    // Kiểm tra xem có đơn nào đã hoàn thành trong số các đơn đã chọn không
    const selectedOrders = cache.donHangList.filter(dh => selectedIds.includes(dh.ma_kho));
    const hasCompletedOrder = selectedOrders.some(dh => dh.ma_nx && !dh.ma_nx.endsWith('-'));

    if (editBtn) editBtn.disabled = selectedCount !== 1;
    if (deleteBtn) deleteBtn.disabled = selectedCount === 0 || hasCompletedOrder;
    if (msgBtn) msgBtn.disabled = selectedCount === 0;
    if (shipBtn) shipBtn.disabled = selectedCount === 0;

    const isPrintDisabled = selectedCount !== 1;
    if (printBtn) printBtn.disabled = isPrintDisabled;

    if (!isPrintDisabled && currentUser.phan_quyen === 'View') {
        const selectedId = selectedIds[0];
        const selectedOrder = cache.donHangList.find(dh => dh.ma_kho === selectedId);
        const isDisabledForView = !selectedOrder || selectedOrder.yeu_cau !== currentUser.ho_ten;
        if (printBtn) printBtn.disabled = isDisabledForView;
    }
}

async function handleExportMessage() {
    const state = viewStates['view-don-hang'];
    const selectedIds = Array.from(state.selected);
    if (selectedIds.length === 0) return;

    const selectedOrders = cache.donHangList.filter(dh => selectedIds.includes(dh.ma_kho));

    currentExportBlocks = [];
    let counter = 1;

    selectedOrders.forEach(order => {
        const nganh = order.nganh || '';
        const yeu_cau = order.yeu_cau || '';
        const ghi_chu = order.ghi_chu || '';
        const ma_nx = order.ma_nx || order.ma_kho || '';
        const muc_dich = order.muc_dich || '';

        const parts = ghi_chu.split(/_{5,}/).map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length === 0 && ghi_chu.trim().length > 0) parts.push(ghi_chu.trim());

        parts.forEach(part => {
            const slRegex = /Số Lượng\s*:\s*([\d\s\u2026\.]+)\s*Kiện/i;
            const slMatch = part.match(slRegex);

            let slText = '... Kiện';
            let guiText = part;

            if (slMatch) {
                slText = slMatch[1].trim() + ' Kiện';
                guiText = part.replace(slMatch[0], '').trim();
                guiText = guiText.replace(/^[\s\-\n\r:]+|[\s\-\n\r:]+$/g, '');
            }

            currentExportBlocks.push({
                checked: true,
                ma_nx,
                team: `${nganh} - ${removeVietnameseTones(yeu_cau)}`,
                nganh,
                yeu_cau,
                muc_dich,
                guiText,
                slText,
                isEditing: false
            });
        });
    });

    if (currentExportBlocks.length === 0) {
        showToast('Không có nội dung ghi chú nào để xuất.', 'info');
        return;
    }

    renderExportBlocks();
    document.getElementById('msg-export-select-all').checked = true;
    document.getElementById('msg-export-modal').classList.remove('hidden');
}

function renderExportBlocks() {
    const listContainer = document.getElementById('msg-export-list');
    if (!listContainer) return;

    let displayCounter = 1;
    listContainer.innerHTML = currentExportBlocks.map((block, index) => {
        const currentDisplayIndex = block.checked ? displayCounter++ : '-';
        const isEditing = block.isEditing || false;

        if (isEditing) {
            return `
                <div class="bg-blue-50 p-3 rounded-md shadow-sm border border-blue-400 mb-3 flex gap-3 items-start" onclick="event.stopPropagation()">
                    <div class="flex-grow space-y-2">
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-bold text-blue-700 text-xs">Đang sửa #${index + 1}</span>
                            <div class="flex gap-1">
                                <button type="button" class="text-green-600 hover:text-green-800 p-1 bg-green-50 rounded" title="Lưu" onclick="saveExportBlock(${index})">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                                </button>
                                <button type="button" class="text-gray-400 hover:text-gray-600 p-1 bg-gray-100 rounded" title="Hủy" onclick="cancelEditExportBlock(${index})">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div class="grid grid-cols-[80px_1fr] items-center gap-2">
                                <span class="text-[10px] font-bold text-gray-500 uppercase">Mã NX:</span>
                                <input type="text" id="edit-ma-nx-${index}" class="w-full p-1 text-xs border rounded focus:ring-1 focus:ring-blue-400 outline-none" value="${block.ma_nx || ''}">
                            </div>
                            ${block.ma_nx === 'CUSTOM' ? `
                            <div class="grid grid-cols-[80px_1fr] items-center gap-2">
                                <span class="text-[10px] font-bold text-gray-500 uppercase">Team:</span>
                                <input type="text" id="edit-team-${index}" class="w-full p-1 text-xs border rounded focus:ring-1 focus:ring-blue-400 outline-none" value="${block.team || ''}" placeholder="Nhập Team (nếu có)">
                            </div>
                            ` : `<input type="hidden" id="edit-team-${index}" value="${block.team || ''}">`}
                            <div class="grid grid-cols-[80px_1fr] items-start gap-2">
                                <span class="text-[10px] font-bold text-gray-500 uppercase mt-1">Nội dung:</span>
                                <textarea id="edit-muc-dich-${index}" class="w-full p-1 text-xs border rounded h-16 focus:ring-1 focus:ring-blue-400 outline-none" placeholder="Nội dung">${block.muc_dich || ''}</textarea>
                            </div>
                            <div class="grid grid-cols-[80px_1fr] items-start gap-2">
                                <span class="text-[10px] font-bold text-gray-500 uppercase mt-1">Địa chỉ:</span>
                                <textarea id="edit-guiText-${index}" class="w-full p-1 text-xs border rounded h-16 focus:ring-1 focus:ring-blue-400 outline-none" placeholder="Địa chỉ">${block.guiText || ''}</textarea>
                            </div>
                            <div class="grid grid-cols-[80px_1fr] items-center gap-2">
                                <span class="text-[10px] font-bold text-gray-500 uppercase">Số lượng:</span>
                                <input type="text" id="edit-slText-${index}" class="w-full p-1 text-xs border rounded focus:ring-1 focus:ring-blue-400 outline-none" 
                                    placeholder="Số lượng" 
                                    value="${(block.slText || '').replace(/\D/g, '')}" 
                                    onfocus="this.select()"
                                    oninput="this.value = this.value.replace(/[^0-9.]/g, '')">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="bg-white p-3 rounded-md shadow-sm border mb-3 flex gap-3 items-start cursor-pointer transition-all hover:shadow-md ${block.checked ? 'border-blue-300 hover:bg-blue-50' : 'opacity-60 grayscale hover:opacity-100'}" onclick="toggleExportBlock(${index})">
                <input type="checkbox" class="msg-block-cb mt-1 w-5 h-5 cursor-pointer accent-blue-600" data-index="${index}" ${block.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleExportBlock(${index})">
                <div class="flex-grow">
                    <div class="flex justify-between items-start mb-1">
                        <span class="font-bold text-blue-700">
                            ${block.checked ? `(${currentDisplayIndex})` : '(Bỏ)'} ${block.ma_nx}
                        </span>
                        <div class="flex items-center gap-0.5">
                            <button type="button" class="text-blue-400 hover:text-blue-600 p-1 rounded hover:bg-blue-100 transition-colors" title="Sửa tem này" onclick="event.stopPropagation(); startEditExportBlock(${index})">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            <button type="button" class="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors" title="Xóa tem này" onclick="event.stopPropagation(); removeExportBlock(${index})">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div class="text-[11px] text-gray-700 space-y-0.5 select-none" ondblclick="event.stopPropagation(); startEditExportBlock(${index})">
                        ${block.ma_nx === 'CUSTOM' && block.team ? `<p><strong>Team:</strong> ${block.team}</p>` : ''}
                        <p><strong>Nội dung:</strong> ${block.muc_dich || '...'}</p>
                        <p><strong>Gửi:</strong> ${block.guiText || '...'}</p>
                        <p><strong>Số lượng:</strong> ${block.slText || '...'}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    updateExportTextarea();
}

window.startEditExportBlock = function (index) {
    currentExportBlocks[index].isEditing = true;
    renderExportBlocks();
};

window.cancelEditExportBlock = function (index) {
    currentExportBlocks[index].isEditing = false;
    renderExportBlocks();
};

window.saveExportBlock = function (index) {
    const ma_nx = document.getElementById(`edit-ma-nx-${index}`).value.trim();
    const team = document.getElementById(`edit-team-${index}`).value.trim();
    const muc_dich = document.getElementById(`edit-muc-dich-${index}`).value.trim();
    const guiText = document.getElementById(`edit-guiText-${index}`).value.trim();
    let slRaw = document.getElementById(`edit-slText-${index}`).value.trim();

    // Tự động thêm "Kiện" nếu là số
    let slText = slRaw;
    if (slRaw && !isNaN(slRaw)) {
        slText = slRaw + ' Kiện';
    } else if (!slRaw) {
        slText = '1 Kiện';
    }

    currentExportBlocks[index] = {
        ...currentExportBlocks[index],
        ma_nx,
        team,
        muc_dich,
        guiText,
        slText,
        isEditing: false
    };
    renderExportBlocks();
};

window.removeExportBlock = function (index) {
    currentExportBlocks.splice(index, 1);
    renderExportBlocks();
};

window.addExportBlock = function () {
    currentExportBlocks.push({
        checked: true,
        isEditing: true, // Mở chế độ sửa ngay lập tức
        ma_nx: 'CUSTOM',
        team: '', // Mặc định trống
        nganh: 'WHB4',
        yeu_cau: currentUser.ho_ten || 'Admin',
        muc_dich: '',
        guiText: '',
        slText: '1 Kiện'
    });
    renderExportBlocks();
    const listContainer = document.getElementById('msg-export-list');
    setTimeout(() => listContainer.scrollTop = listContainer.scrollHeight, 50);
};

window.toggleExportBlock = function (index) {
    currentExportBlocks[index].checked = !currentExportBlocks[index].checked;
    renderExportBlocks();

    // Cập nhật trạng thái nút "Chọn tất cả"
    const allChecked = currentExportBlocks.every(b => b.checked);
    document.getElementById('msg-export-select-all').checked = allChecked;
};

function updateExportTextarea() {
    const contentArea = document.getElementById('msg-export-content');
    const checkedBlocks = currentExportBlocks.filter(b => b.checked);

    let counter = 1;
    const text = checkedBlocks.map(block => {
        let cleanGuiText = (block.guiText || '').trim();
        cleanGuiText = cleanGuiText.replace(/^(Gửi\s*:\s*)+/i, '').trim();

        let lines = [];
        lines.push(`(${counter}) ${block.ma_nx} | WHB4 - ${block.nganh} - ${block.yeu_cau}`);
        if (block.muc_dich) lines.push(`Nội dung:${block.muc_dich.trim()}`);
        lines.push(`Gửi:${cleanGuiText}`);
        lines.push(`Số Lượng:${block.slText.trim()}`);
        
        let blockText = lines.join('\n') + '\n-------\n\n';
        counter++;
        return blockText;
    }).join('');

    contentArea.value = text.trim();
}


function calculateTotalKien(text) {
    if (!text) return 0;
    // Regex tìm kiếm tất cả các cụm "Số Lượng : [số] Kiện" (không phân biệt hoa thường)
    const slRegex = /Số Lượng\s*:\s*([\d\s\u2026\.,]+)\s*Kiện/gi;
    let total = 0;
    let match;
    while ((match = slRegex.exec(text)) !== null) {
        const numStr = match[1].trim().replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(numStr);
        if (!isNaN(num)) {
            total += num;
        }
    }
    return total;
}

function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    str = str.replace(/đ/g, "d").replace(/Đ/g, "D");
    return str;
}

function generateMaKho(loai) {
    const prefix = loai === 'Nhap' ? 'IN' : 'OUT';
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}.JNJ.${randomNum}`;
}

/**
 * Tạo tiền tố Mã NX bao gồm: RO/DO - Năm hiện tại - Tên ngành đầy đủ -
 * Ví dụ: RO-2026-GM-ESC-
 */
function generateMaNx(loai, nganh) {
    if (!loai) return '';
    const prefix = loai === 'Nhap' ? 'RO' : 'DO';
    const year = new Date().getFullYear();
    const nganhPart = nganh ? `${nganh}-` : '';
    return `${prefix}-${year}-${nganhPart}`;
}

/**
 * Tìm số thứ tự tiếp theo cho một cấu trúc Mã NX cụ thể
 */
async function fetchNextMaNxSuggestion(prefixPattern) {
    if (!prefixPattern || prefixPattern.length < 5) return null;

    // Tìm mã lớn nhất bắt đầu bằng prefixPattern (không tính mã đang xử lý có gạch ngang cuối cùng nếu pattern không chứa gạch đó)
    const { data, error } = await sb
        .from('don_hang')
        .select('ma_nx')
        .like('ma_nx', `${prefixPattern}%`)
        .not('ma_nx', 'like', '%-')
        .order('ma_nx', { ascending: false })
        .limit(1);

    if (error) {
        console.error("Lỗi fetch suggestion:", error);
        return null;
    }

    if (!data || data.length === 0) return `${prefixPattern}001`;

    const lastCode = data[0].ma_nx;
    // Tách phần số cuối cùng
    const parts = lastCode.split('-');
    const lastPart = parts[parts.length - 1];
    const lastNum = parseInt(lastPart, 10);

    if (isNaN(lastNum)) return `${prefixPattern}001`;

    const nextNumStr = String(lastNum + 1).padStart(3, '0');
    return `${prefixPattern}${nextNumStr}`;
}


async function generateUniqueMaKho(loai) {
    const maKhoInput = document.getElementById('don-hang-modal-ma-kho');
    const statusEl = document.getElementById('don-hang-modal-ma-kho-status');
    let isUnique = false;
    let generatedMaKho;
    let attempts = 0;

    statusEl.textContent = 'Đang tạo mã kho...';
    statusEl.className = 'text-xs mt-1 h-4 text-gray-500';

    while (!isUnique && attempts < 10) {
        generatedMaKho = generateMaKho(loai);
        const { count, error } = await sb.from('don_hang').select('ma_kho', { count: 'exact', head: true }).eq('ma_kho', generatedMaKho);

        if (error) {
            statusEl.textContent = 'Lỗi kiểm tra';
            statusEl.className = 'text-xs mt-1 h-4 text-red-600';
            maKhoInput.classList.add('text-red-600');
            return;
        }
        isUnique = count === 0;
        attempts++;
    }

    maKhoInput.value = generatedMaKho;
    maKhoInput.classList.remove('text-red-600', 'bg-gray-200');
    maKhoInput.classList.add('text-green-600');
    if (isUnique) {
        statusEl.textContent = 'Hợp lệ';
        statusEl.className = 'text-xs mt-1 h-4 text-green-600';
        maKhoInput.classList.add('text-green-600');
    } else {
        statusEl.textContent = 'Không thể tạo mã duy nhất!';
        statusEl.className = 'text-xs mt-1 h-4 text-red-600';
        maKhoInput.classList.add('text-red-600');
    }
    debouncedValidateMaKho(generatedMaKho);
}

function updateGeneratedCodes() {
    const loai = document.getElementById('don-hang-modal-loai-don').value;
    const nganh = document.getElementById('don-hang-modal-nganh').value;
    const maNxInput = document.getElementById('don-hang-modal-ma-nx');

    if (!document.getElementById('don-hang-edit-mode-ma-kho').value) {
        if (loai) {
            generateUniqueMaKho(loai);
        }
    }

    const newMaNx = generateMaNx(loai, nganh);
    if (maNxInput.value !== newMaNx) {
        maNxInput.value = newMaNx;
        debouncedValidateMaNx(newMaNx);
    }
}

function renderFileList() {
    const fileListContainer = document.getElementById('don-hang-file-list');
    const isViewMode = document.getElementById('save-don-hang-btn').classList.contains('hidden');

    fileListContainer.innerHTML = '';

    currentExistingFiles.forEach(url => {
        const fileName = decodeURIComponent(url.split('/').pop().split('?')[0].split('-').slice(1).join('-'));
        fileListContainer.innerHTML += `
            <div class="flex items-center justify-between bg-gray-100 p-2 rounded-md text-sm">
                <a href="${url}" target="_blank" class="truncate hover:underline text-blue-600">${fileName}</a>
                ${isViewMode ? '' : `<button type="button" data-url="${url}" class="remove-file-btn text-red-500 hover:text-red-700 font-bold text-lg px-2">&times;</button>`}
            </div>
        `;
    });

    selectedDonHangFiles.forEach((file, index) => {
        fileListContainer.innerHTML += `
             <div class="flex items-center justify-between bg-blue-50 p-2 rounded-md text-sm">
                <span class="truncate">${file.name}</span>
                ${isViewMode ? '' : `<button type="button" data-index="${index}" class="remove-file-btn text-red-500 hover:text-red-700 font-bold text-lg px-2">&times;</button>`}
            </div>
        `;
    });
}

function handleFileSelection(files) {
    if (!files || files.length === 0) return;
    selectedDonHangFiles.push(...Array.from(files));
    renderFileList();
}

export async function openDonHangModal(dh = null, mode = 'add') {
    isNhapTraMode = mode === 'nhap-tra';
    const modal = document.getElementById('don-hang-modal');
    const form = document.getElementById('don-hang-form');
    form.reset();
    selectedDonHangFiles = [];
    initialExistingFiles = [];
    currentExistingFiles = [];
    chiTietItems = [];
    initialChiTietItems = [];
    initialDonHangData = {};

    const maKhoInput = document.getElementById('don-hang-modal-ma-kho');
    const maNxInput = document.getElementById('don-hang-modal-ma-nx');
    [maKhoInput, maNxInput].forEach(el => el.classList.remove('text-red-600', 'text-green-600', 'text-yellow-600'));
    document.getElementById('don-hang-modal-ma-kho-status').textContent = '';
    document.getElementById('don-hang-modal-ma-nx-status').textContent = '';


    const isViewMode = mode === 'view';
    const isEditOrAdd = !isViewMode;

    form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = isViewMode);
    maNxInput.disabled = false;

    const quickSearchInput = document.getElementById('don-hang-quick-search-stock');
    if (quickSearchInput) {
        quickSearchInput.value = '';
        quickSearchInput.disabled = isViewMode;
    }
    document.getElementById('don-hang-quick-search-clear')?.classList.add('hidden');
    document.getElementById('don-hang-quick-search-dropdown')?.classList.add('hidden');

    document.getElementById('don-hang-file-drop-area').style.display = isViewMode ? 'none' : 'flex';
    document.getElementById('don-hang-them-vat-tu-btn').classList.toggle('hidden', isViewMode || isNhapTraMode || !(currentUser.phan_quyen === 'Admin' || currentUser.phan_quyen === 'User'));

    saveDonHangBtn = document.getElementById('save-don-hang-btn');
    saveAndPrintBtn = document.getElementById('save-and-print-btn');
    const printViewBtn = document.getElementById('print-don-hang-view-btn');

    saveDonHangBtn.classList.toggle('hidden', isViewMode);
    if (saveAndPrintBtn) saveAndPrintBtn.classList.toggle('hidden', isViewMode);
    if (printViewBtn) printViewBtn.classList.toggle('hidden', !isViewMode);

    saveDonHangBtn.disabled = true;
    if (saveAndPrintBtn) saveAndPrintBtn.disabled = true;

    document.getElementById('cancel-don-hang-btn').classList.toggle('hidden', isViewMode);
    document.getElementById('close-don-hang-view-btn').classList.toggle('hidden', !isViewMode);

    let uniqueNganhList = [];
    let uniqueYeuCauList = [];

    const [nganhRes, yeuCauRes] = await Promise.all([
        sb.from('san_pham').select('nganh, phu_trach').neq('nganh', null).neq('nganh', ''),
        sb.from('don_hang').select('yeu_cau').neq('yeu_cau', null).neq('yeu_cau', '')
    ]);

    if (!nganhRes.error && nganhRes.data) {
        const nganhMap = new Map();
        nganhRes.data.forEach(item => {
            if (!nganhMap.has(item.nganh)) {
                nganhMap.set(item.nganh, item.phu_trach || '');
            }
        });
        uniqueNganhList = Array.from(nganhMap, ([nganh, phu_trach]) => ({ nganh, phu_trach })).sort((a, b) => a.nganh.localeCompare(b.nganh));
    }

    if (!yeuCauRes.error && yeuCauRes.data) {
        uniqueYeuCauList = [...new Set(yeuCauRes.data.map(item => item.yeu_cau))].sort().map(name => ({ yeu_cau: name }));
    }

    const nganhInput = document.getElementById('don-hang-modal-nganh');
    const handleNganhAutocomplete = () => {
        const inputValue = nganhInput.value.toLowerCase();
        const suggestions = uniqueNganhList.filter(item =>
            item.nganh.toLowerCase().includes(inputValue) ||
            (item.phu_trach && item.phu_trach.toLowerCase().includes(inputValue))
        );
        openAutocomplete(nganhInput, suggestions, {
            valueKey: 'nganh',
            primaryTextKey: 'nganh',
            secondaryTextKey: 'phu_trach',
            width: `${nganhInput.offsetWidth}px`,
            onSelect: (selectedValue) => {
                nganhInput.value = selectedValue;
                updateGeneratedCodes();
            }
        });
    };
    nganhInput.addEventListener('focus', handleNganhAutocomplete);
    nganhInput.addEventListener('input', debounce(handleNganhAutocomplete, 200));

    nganhInput.addEventListener('input', (e) => {
        let val = e.target.value;
        val = val.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        val = val.replace(/đ/g, "d").replace(/Đ/g, "D");
        e.target.value = val.toUpperCase();
    });

    nganhInput.addEventListener('keydown', handleSmartTabNavigation);

    const yeuCauInput = document.getElementById('don-hang-modal-yeu-cau');
    const handleYeuCauAutocomplete = () => {
        const inputValue = yeuCauInput.value.toLowerCase();
        const suggestions = uniqueYeuCauList.filter(item =>
            item.yeu_cau.toLowerCase().includes(inputValue)
        );
        openAutocomplete(yeuCauInput, suggestions, {
            valueKey: 'yeu_cau',
            primaryTextKey: 'yeu_cau',
            onSelect: (selectedValue) => {
                yeuCauInput.value = selectedValue;
            }
        });
    };
    yeuCauInput.addEventListener('focus', handleYeuCauAutocomplete);
    yeuCauInput.addEventListener('input', debounce(handleYeuCauAutocomplete, 200));
    yeuCauInput.addEventListener('keydown', handleSmartTabNavigation);

    if (mode === 'add' || isNhapTraMode) {
        document.getElementById('don-hang-modal-title').textContent = isNhapTraMode ? 'Nhập Trả Hàng Trưng Bày' : 'Thêm Đơn Hàng Mới';
        document.getElementById('don-hang-edit-mode-ma-kho').value = '';
        maKhoInput.readOnly = true;

        const today = new Date();
        document.getElementById('don-hang-modal-thoi-gian').valueAsDate = today;
        document.getElementById('don-hang-modal-loai-don').value = isNhapTraMode ? 'Nhap' : '';
        if (isNhapTraMode) document.getElementById('don-hang-modal-loai-don').disabled = true;
        updateGeneratedCodes();

        initialDonHangData = {
            thoi_gian: today.toISOString().split('T')[0],
            loai_don: document.getElementById('don-hang-modal-loai-don').value,
            yeu_cau: document.getElementById('don-hang-modal-yeu-cau').value,
            nganh: document.getElementById('don-hang-modal-nganh').value,
            ma_nx: document.getElementById('don-hang-modal-ma-nx').value,
            muc_dich: document.getElementById('don-hang-modal-muc-dich').value,
            ghi_chu: getElValue('don-hang-modal-ghi-chu'),
        };
        initialChiTietItems = [];

        // UI changes for Nhập Trả Mode
        const loaiDonLabel = document.getElementById('don-hang-modal-loai-don-label');
        const loaiDonSelect = document.getElementById('don-hang-modal-loai-don');
        const maNxOldInput = document.getElementById('don-hang-modal-ma-nx-old');

        if (maNxOldInput._nhapTraFocus) {
            maNxOldInput.removeEventListener('focus', maNxOldInput._nhapTraFocus);
            maNxOldInput.removeEventListener('input', maNxOldInput._nhapTraInput);
        }

        if (isNhapTraMode) {
            loaiDonLabel.innerHTML = 'Mã Xuất Cũ <span class="text-red-500 font-bold">*</span>';
            loaiDonSelect.classList.add('hidden');
            maNxOldInput.classList.remove('hidden');
            maNxOldInput.value = '';
            maNxOldInput.disabled = false;
            maNxInput.placeholder = ""; // Normal ma_nx input

            unreturnedMaNxCache = null; // force refresh
            const handleMaNxAutocomplete = async () => {
                const inputValue = maNxOldInput.value.trim().toLowerCase();
                if (!inputValue) {
                    document.getElementById('don-hang-modal-yeu-cau').value = '';
                    document.getElementById('don-hang-modal-nganh').value = '';
                    document.getElementById('don-hang-modal-muc-dich').value = '';
                    chiTietItems = [];
                    renderChiTietTable();
                    updateGeneratedCodes();
                }

                const list = await getUnreturnedMaNxList();
                const suggestions = list.filter(i => i.ma_nx.toLowerCase().includes(inputValue) || (i.muc_dich || '').toLowerCase().includes(inputValue) || (i.yeu_cau || '').toLowerCase().includes(inputValue));

                openAutocomplete(maNxOldInput, suggestions, {
                    valueKey: 'ma_nx',
                    customHtml: (item) => `
                        <div class="flex flex-col pointer-events-none">
                            <p class="text-sm font-medium text-gray-900">${item.ma_nx}</p>
                            <p class="text-xs text-gray-500 mt-1">${item.muc_dich || ''}</p>
                            <p class="text-xs text-blue-600 mt-0.5 italic">Yêu cầu: ${item.yeu_cau || ''} - ${formatDateToDDMMYYYY(item.thoi_gian)}</p>
                        </div>
                    `,
                    width: `350px`,
                    onSelect: async (selectedValue) => {
                        const selectedItem = list.find(i => i.ma_nx === selectedValue);
                        if (selectedItem) {
                            maNxOldInput.value = selectedItem.ma_nx; // fill visually
                            document.getElementById('don-hang-modal-yeu-cau').value = selectedItem.yeu_cau || '';
                            document.getElementById('don-hang-modal-nganh').value = selectedItem.nganh || '';
                            document.getElementById('don-hang-modal-muc-dich').value = `Nhập trả từ ${selectedItem.ma_nx} - ${selectedItem.muc_dich || ''}`;

                            showLoading(true);
                            try {
                                const { data: ctData } = await sb.from('chi_tiet').select('*').eq('ma_kho', selectedItem.ma_kho).eq('loai', 'Trưng Bày').order('stt', { ascending: true });
                                chiTietItems = [];

                                for (const ct of (ctData || [])) {
                                    const newItem = {
                                        id: `new-${Date.now()}-${Math.random()}`,
                                        ma_vt: ct.ma_vt,
                                        ten_vt: ct.ten_vt,
                                        ma_vach: ct.ma_vach,
                                        lot: ct.lot,
                                        date: ct.date,
                                        yc_sl: ct.xuat,
                                        sl: 0,
                                        loai: 'Trưng Bày',
                                        pendingData: { nhap: 0, xuat: 0 },
                                        ma_vach_valid: true
                                    };
                                    const { data: tonKhoData } = await sb.from('ton_kho_update').select('*').eq('ma_vach', ct.ma_vach).single();
                                    if (tonKhoData) {
                                        newItem.tonKhoData = tonKhoData;
                                        newItem.lotOptions = [tonKhoData];
                                        newItem.nganh = tonKhoData.nganh;
                                        newItem.phu_trach = tonKhoData.phu_trach;
                                    }
                                    chiTietItems.push(newItem);
                                }
                                updateGeneratedCodes();
                                renderChiTietTable();
                            } finally {
                                showLoading(false);
                            }
                        }
                    }
                });
            };
            maNxOldInput._nhapTraFocus = handleMaNxAutocomplete;
            maNxOldInput._nhapTraInput = debounce(handleMaNxAutocomplete, 200);
            maNxOldInput.addEventListener('focus', maNxOldInput._nhapTraFocus);
            maNxOldInput.addEventListener('keydown', handleSmartTabNavigation);
            maNxOldInput.addEventListener('input', (e) => {
                if (!e.target.value.trim()) {
                    document.getElementById('don-hang-modal-yeu-cau').value = '';
                    document.getElementById('don-hang-modal-nganh').value = '';
                    document.getElementById('don-hang-modal-muc-dich').value = '';
                    chiTietItems = [];
                    renderChiTietTable();
                    updateGeneratedCodes();
                }
                maNxOldInput._nhapTraInput(e);
            });
        } else {
            loaiDonLabel.innerHTML = 'Loại Đơn <span class="text-red-500 font-bold">*</span>';
            loaiDonSelect.classList.remove('hidden');
            maNxOldInput.classList.add('hidden');
            maNxInput.placeholder = "";
        }

    } else {
        document.getElementById('don-hang-modal-title').textContent = isViewMode ? 'Xem Chi Tiết Đơn Hàng' : 'Sửa Đơn Hàng';
        document.getElementById('don-hang-edit-mode-ma-kho').value = dh.ma_kho;
        maKhoInput.readOnly = true;

        const loaiDonLabel = document.getElementById('don-hang-modal-loai-don-label');
        const loaiDonSelect = document.getElementById('don-hang-modal-loai-don');
        const maNxOldInput = document.getElementById('don-hang-modal-ma-nx-old');
        loaiDonLabel.innerHTML = 'Loại Đơn <span class="text-red-500 font-bold">*</span>';
        loaiDonSelect.classList.remove('hidden');
        maNxOldInput.classList.add('hidden');
        maNxInput.placeholder = "";

        Object.keys(dh).forEach(key => {
            const input = document.getElementById(`don-hang-modal-${key.replace(/_/g, '-')}`);
            if (input) {
                if (key === 'thoi_gian' && dh[key]) {
                    input.value = new Date(dh[key]).toISOString().split('T')[0];
                } else if (key !== 'file') {
                    input.value = dh[key] || '';
                }
            }
        });
        document.getElementById('don-hang-modal-loai-don').value = dh.ma_kho.startsWith('IN') ? 'Nhap' : 'Xuat';

        debouncedValidateMaKho(dh.ma_kho);
        debouncedValidateMaNx(dh.ma_nx);

        initialDonHangData = {
            thoi_gian: dh.thoi_gian ? new Date(dh.thoi_gian).toISOString().split('T')[0] : '',
            loai_don: dh.ma_kho.startsWith('IN') ? 'Nhap' : 'Xuat',
            yeu_cau: dh.yeu_cau || '',
            nganh: dh.nganh || '',
            ma_nx: dh.ma_nx || '',
            muc_dich: dh.muc_dich || '',
            ghi_chu: dh.ghi_chu || ''
        };

        const filesFromDB = parseFileArray(dh.file);
        initialExistingFiles = [...filesFromDB];
        currentExistingFiles = [...filesFromDB];

        const fetchedChiTiet = await fetchChiTietDonHang(dh.ma_kho);

        const maVtsInOrder = [...new Set(fetchedChiTiet.map(item => item.ma_vt).filter(Boolean))];
        let allMaVachsInOrder = [];
        if (maVtsInOrder.length > 0) {
            const { data: vachData } = await sb.from('ton_kho_update').select('ma_vach').in('ma_vt', maVtsInOrder);
            if (vachData) {
                allMaVachsInOrder = vachData.map(v => v.ma_vach);
            }
        }

        const pendingAmounts = await getPendingAmountsByMaVach(allMaVachsInOrder, dh.ma_kho);

        const chiTietPromises = fetchedChiTiet.map(async (item) => {
            let lotOptions = [];
            let tonKhoData = null;
            let currentPending = pendingAmounts.get(item.ma_vach) || { nhap: 0, xuat: 0 };

            if (item.ma_vt) {
                const { data: lotData, error: lotError } = await sb.from('ton_kho_update')
                    .select('ma_vach, lot, date, ten_vt, tinh_trang, ton_cuoi, nganh, phu_trach, tray, nhap, xuat')
                    .eq('ma_vt', item.ma_vt);

                if (!lotError && lotData) {
                    const adjustedLotData = lotData.map(lot => {
                        return { ...lot, pendingData: pendingAmounts.get(lot.ma_vach) || { nhap: 0, xuat: 0 } };
                    });

                    lotOptions = adjustedLotData;
                    tonKhoData = adjustedLotData.find(opt => opt.ma_vach === item.ma_vach);
                }
            }
            return {
                ...item,
                sl: item.nhap || item.xuat,
                originalQty: item.nhap || item.xuat,
                ma_vach_valid: true,
                lotOptions: lotOptions,
                tonKhoData: tonKhoData,
                pendingData: currentPending
            };
        });

        chiTietItems = await Promise.all(chiTietPromises);

        // Gộp các dòng trùng ma_vt và lot đối với đơn Xuất
        const loaiDon = dh.ma_kho.startsWith('IN') ? 'Nhap' : 'Xuat';
        if (loaiDon === 'Xuat') {
            const mergedMap = new Map();
            chiTietItems.forEach(item => {
                if (!item) return;
                const key = `${item.ma_vt || ''}_${item.lot || ''}`;
                if (mergedMap.has(key)) {
                    const existing = mergedMap.get(key);
                    if (item.loai === 'Trưng Bày') {
                        existing.tb = (existing.tb || 0) + (item.xuat || 0);
                        existing.tbId = item.id;
                    } else if (item.loai === 'Tiêu Hao') {
                        existing.th = (existing.th || 0) + (item.xuat || 0);
                        existing.thId = item.id;
                    }
                    existing.sl = (existing.sl || 0) + (item.xuat || 0);
                    existing.yc_sl = (existing.yc_sl || 0) + (item.yc_sl || 0);
                } else {
                    const newItem = { ...item };
                    newItem.tb = item.loai === 'Trưng Bày' ? (item.xuat || 0) : 0;
                    newItem.th = item.loai === 'Tiêu Hao' ? (item.xuat || 0) : 0;
                    if (item.loai === 'Trưng Bày') {
                        newItem.tbId = item.id;
                    } else if (item.loai === 'Tiêu Hao') {
                        newItem.thId = item.id;
                    }
                    newItem.sl = item.xuat || 0;
                    // Bỏ thuộc tính loai để tránh nhầm lẫn trên UI
                    delete newItem.loai;
                    mergedMap.set(key, newItem);
                }
            });
            chiTietItems = Array.from(mergedMap.values());
        } else {
            // Đối với đơn Nhập
            chiTietItems.forEach(item => {
                if (item) {
                    item.tb = 0;
                    item.th = 0;
                    item.sl = item.nhap || 0;
                }
            });
        }

        initialChiTietItems = JSON.parse(JSON.stringify(chiTietItems));
    }

    renderFileList();
    renderChiTietTable();
    modal.classList.remove('hidden');
}

async function syncChiTietDonHang(ma_kho_don_hang, donHangInfo) {
    const itemsToAdd = [];
    const itemsToUpdate = [];

    // Lấy danh sách ID các dòng hiện đang có trong DB của đơn hàng này
    const { data: existingRows, error: fetchError } = await sb
        .from('chi_tiet')
        .select('id')
        .eq('ma_kho', ma_kho_don_hang);
    if (fetchError) throw fetchError;
    const dbRowIds = (existingRows || []).map(r => r.id);

    for (const item of chiTietItems) {
        if (!item) continue;
        if (!item.nganh && item.tonKhoData) item.nganh = item.tonKhoData.nganh;
        if (!item.phu_trach && item.tonKhoData) item.phu_trach = item.tonKhoData.phu_trach;
    }

    let currentStt = 1;
    chiTietItems.forEach((item) => {
        if (!item) return;

        const createRowData = (loaiVal, slVal, ycVal, rowId) => {
            const finalRowId = (rowId && !rowId.toString().startsWith('new-')) 
                ? rowId 
                : crypto.randomUUID();
                
            return {
                stt: currentStt++,
                id: finalRowId,
                ma_kho: ma_kho_don_hang,
                thoi_gian: donHangInfo.thoi_gian,
                ma_nx: donHangInfo.ma_nx,
                ma_vt: item.ma_vt,
                ma_vach: item.ma_vach,
                ten_vt: item.ten_vt,
                lot: item.lot,
                date: item.date,
                yc_sl: ycVal,
                nhap: donHangInfo.loai_don === 'Nhap' ? slVal : 0,
                xuat: donHangInfo.loai_don === 'Xuat' ? slVal : 0,
                loai: loaiVal,
                yeu_cau: donHangInfo.yeu_cau,
                muc_dich: donHangInfo.muc_dich,
                nganh: item.nganh,
                phu_trach: item.phu_trach,
            };
        };

        if (donHangInfo.loai_don === 'Xuat') {
            const tbVal = parseFloat(item.tb) || 0;
            const thVal = parseFloat(item.th) || 0;
            const ycVal = parseFloat(item.yc_sl) || 0;

            if (tbVal > 0 && thVal > 0) {
                let yc_th = thVal;
                let yc_tb = ycVal - yc_th;
                if (yc_tb < tbVal) {
                    yc_tb = tbVal;
                    yc_th = ycVal - yc_tb;
                }

                const rowTB = createRowData('Trưng Bày', tbVal, yc_tb, item.tbId);
                const rowTH = createRowData('Tiêu Hao', thVal, yc_th, item.thId);

                if (item.tbId && !item.tbId.toString().startsWith('new-')) {
                    itemsToUpdate.push(rowTB);
                } else {
                    itemsToAdd.push(rowTB);
                }

                if (item.thId && !item.thId.toString().startsWith('new-')) {
                    itemsToUpdate.push(rowTH);
                } else {
                    itemsToAdd.push(rowTH);
                }
            } else if (tbVal > 0) {
                const rowTB = createRowData('Trưng Bày', tbVal, ycVal, item.tbId);
                if (item.tbId && !item.tbId.toString().startsWith('new-')) {
                    itemsToUpdate.push(rowTB);
                } else {
                    itemsToAdd.push(rowTB);
                }
            } else if (thVal > 0) {
                const rowTH = createRowData('Tiêu Hao', thVal, ycVal, item.thId);
                if (item.thId && !item.thId.toString().startsWith('new-')) {
                    itemsToUpdate.push(rowTH);
                } else {
                    itemsToAdd.push(rowTH);
                }
            } else {
                const defaultId = item.thId || item.tbId;
                const rowDefault = createRowData('Tiêu Hao', 0, ycVal, defaultId);
                if (defaultId && !defaultId.toString().startsWith('new-')) {
                    itemsToUpdate.push(rowDefault);
                } else {
                    itemsToAdd.push(rowDefault);
                }
            }
        } else {
            const rowNhap = createRowData(null, parseFloat(item.sl) || 0, parseFloat(item.yc_sl) || 0, item.id);
            if (item.id && !item.id.toString().startsWith('new-')) {
                itemsToUpdate.push(rowNhap);
            } else {
                itemsToAdd.push(rowNhap);
            }
        }
    });

    const currentIds = new Set();
    itemsToUpdate.forEach(row => currentIds.add(row.id));
    itemsToAdd.forEach(row => currentIds.add(row.id));

    const idsToDelete = dbRowIds.filter(id => !currentIds.has(id));

    const promises = [];
    if (idsToDelete.length > 0) {
        promises.push(sb.from('chi_tiet').delete().in('id', idsToDelete));
    }
    if (itemsToUpdate.length > 0) {
        promises.push(sb.from('chi_tiet').upsert(itemsToUpdate));
    }
    if (itemsToAdd.length > 0) {
        promises.push(sb.from('chi_tiet').insert(itemsToAdd));
    }

    const results = await Promise.all(promises);
    for (const result of results) {
        if (result.error) throw result.error;
    }
}

const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

async function saveOrderForOfflineSync() {
    showLoading(true);
    try {
        const ma_kho_orig = document.getElementById('don-hang-edit-mode-ma-kho').value;
        const isEdit = !!ma_kho_orig;

        const donHangData = {
            ma_kho: getElValue('don-hang-modal-ma-kho', true),
            thoi_gian: getElValue('don-hang-modal-thoi-gian'),
            ma_nx: getElValue('don-hang-modal-ma-nx', true),
            yeu_cau: getElValue('don-hang-modal-yeu-cau', true),
            nganh: getElValue('don-hang-modal-nganh', true),
            muc_dich: getElValue('don-hang-modal-muc-dich', true),
            ghi_chu: getElValue('don-hang-modal-ghi-chu', true),
            file: []
        };

        const newFilesPromises = selectedDonHangFiles.map(async file => ({
            name: file.name,
            type: file.type,
            base64: await fileToBase64(file)
        }));
        const newFiles = await Promise.all(newFilesPromises);

        const jobPayload = {
            isEdit,
            ma_kho_orig,
            donHangData,
            chiTietItems: JSON.parse(JSON.stringify(chiTietItems)),
            initialChiTietItems: JSON.parse(JSON.stringify(initialChiTietItems)),
            newFiles,
            initialExistingFiles,
            currentExistingFiles
        };

        addJobToOfflineQueue({
            type: 'save-don-hang',
            payload: jobPayload
        });

        showToast('Mất kết nối. Đơn hàng đã được lưu tạm và sẽ tự động đồng bộ.', 'info');
        forceCloseDonHangModal();
    } catch (error) {
        showToast(`Lỗi khi lưu offline: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}


async function handleSaveDonHang(e, printAction = null) {
    e.preventDefault();

    const requiredFields = {
        'don-hang-modal-thoi-gian': "Thời Gian",
        'don-hang-modal-yeu-cau': "Yêu Cầu",
        'don-hang-modal-nganh': "Ngành",
        'don-hang-modal-ma-nx': "Mã NX",
        'don-hang-modal-muc-dich': "Mục Đích"
    };

    for (const [id, name] of Object.entries(requiredFields)) {
        const el = document.getElementById(id);
        if (!el) {
            showToast(`Lỗi cấu hình: Thiếu trường "${name}" (id: ${id}).`, 'error');
            return;
        }
        if (!el.value) {
            showToast(`Trường "${name}" là bắt buộc.`, 'error');
            return;
        }
    }

    if (chiTietItems.filter(Boolean).length === 0) {
        showToast('Phải có ít nhất một vật tư trong đơn hàng.', 'error');
        return;
    }

    if (isNhapTraMode) {
        const hasMismatch = chiTietItems.some(item => parseFloat(item.sl) !== parseFloat(item.yc_sl));
        if (hasMismatch) {
            showToast('Số lượng thực nhập (SL) phải bằng Yêu Cầu (Y/c) đối với đơn Nhập Trả.', 'error');
            return;
        }
    }

    const loai_don = document.getElementById('don-hang-modal-loai-don').value;
    if (loai_don === 'Xuat') {
        for (let i = 0; i < chiTietItems.length; i++) {
            const item = chiTietItems[i];
            if (!item) continue;
            const tbVal = parseFloat(item.tb) || 0;
            const thVal = parseFloat(item.th) || 0;
            const slVal = parseFloat(item.sl) || 0;
            if (tbVal + thVal !== slVal) {
                showToast(`Dòng ${i + 1} (${item.ten_vt || item.ma_vt || ''}): Tổng TB (${tbVal}) và TH (${thVal}) phải bằng SL xuất (${slVal}).`, 'error');
                return;
            }
        }
    }

    if (!navigator.onLine) {
        await saveOrderForOfflineSync();
        return;
    }

    if (document.getElementById('save-don-hang-btn').disabled) {
        showToast('Mã Kho hoặc Mã NX không hợp lệ hoặc đang được kiểm tra.', 'error');
        return;
    }

    showLoading(true);
    try {
        const ma_kho_orig = getElValue('don-hang-edit-mode-ma-kho');
        const isEdit = !!ma_kho_orig;

        const donHangData = {
            ma_kho: getElValue('don-hang-modal-ma-kho', true),
            thoi_gian: getElValue('don-hang-modal-thoi-gian'),
            ma_nx: getElValue('don-hang-modal-ma-nx', true),
            yeu_cau: getElValue('don-hang-modal-yeu-cau', true),
            nganh: getElValue('don-hang-modal-nganh', true),
            muc_dich: getElValue('don-hang-modal-muc-dich', true),
            ghi_chu: getElValue('don-hang-modal-ghi-chu', true),
        };

        // Kiểm tra số lượng kiện trống trong ghi chú nếu Mã NX đã hoàn tất (không có dấu gạch ngang cuối)
        if (donHangData.ma_nx && !donHangData.ma_nx.endsWith('-')) {
            if (donHangData.ghi_chu.includes("... Kiện") || donHangData.ghi_chu.includes("...Kiện")) {
                showToast('Mã NX đã xử lý xong, vui lòng điền số lượng kiện vào phần Ghi Chú.', 'error');
                const ghiChuEl = document.getElementById('don-hang-modal-ghi-chu');
                ghiChuEl.focus();
                return;
            }
        }

        for (const key in donHangData) {
            if (typeof donHangData[key] === 'string' && donHangData[key].startsWith('__MISSING_ELEMENT_')) {
                throw new Error(`Không thể lưu: Thiếu phần tử DOM cho trường ${key}.`);
            }
        }

        const loai_don = getElValue('don-hang-modal-loai-don');

        const filesToRemove = initialExistingFiles.filter(url => !currentExistingFiles.includes(url));
        if (filesToRemove.length > 0) {
            const filePathsToRemove = filesToRemove.map(url => {
                try {
                    const path = new URL(url).pathname.split('/file_don_hang/')[1];
                    return path ? decodeURIComponent(path) : null;
                } catch (e) { console.error("Invalid URL for file deletion:", url, e); return null; }
            }).filter(Boolean);
            if (filePathsToRemove.length > 0) await sb.storage.from('file_don_hang').remove(filePathsToRemove);
        }

        let uploadedFileUrls = [];
        if (selectedDonHangFiles.length > 0) {
            const uploadPromises = selectedDonHangFiles.map(file => {
                const safeFileName = sanitizeFileName(file.name);
                const filePath = `${donHangData.ma_kho}/${Date.now()}-${safeFileName}`;
                return sb.storage.from('file_don_hang').upload(filePath, file);
            });
            const uploadResults = await Promise.all(uploadPromises);
            for (const result of uploadResults) {
                if (result.error) throw new Error(`Lỗi tải file: ${result.error.message}`);
                const { data: urlData } = sb.storage.from('file_don_hang').getPublicUrl(result.data.path);
                uploadedFileUrls.push(urlData.publicUrl);
            }
        }
        donHangData.file = [...currentExistingFiles, ...uploadedFileUrls];

        const { error: donHangError } = isEdit
            ? await sb.from('don_hang').update(donHangData).eq('ma_kho', ma_kho_orig)
            : await sb.from('don_hang').insert(donHangData);
        if (donHangError) throw donHangError;

        // Tự động kiểm tra và lưu các LOT mới vào bảng tồn kho (ton_kho) nếu chưa tồn tại
        const allMaVachs = [...new Set(chiTietItems.filter(i => i && i.ma_vach).map(i => i.ma_vach))];
        if (allMaVachs.length > 0) {
            const { data: existingRows } = await sb.from('ton_kho').select('ma_vach').in('ma_vach', allMaVachs);
            const existingMaVachSet = new Set((existingRows || []).map(r => r.ma_vach));

            const newTonKhoToInsert = [];
            for (const item of chiTietItems) {
                if (!item || !item.ma_vach || existingMaVachSet.has(item.ma_vach)) continue;

                existingMaVachSet.add(item.ma_vach);

                let phuTrach = item.phu_trach || '';
                let tenVt = item.ten_vt || '';
                let nganh = item.nganh || donHangData.nganh || '';

                if (!phuTrach || !tenVt) {
                    let spQuery = sb.from('san_pham').select('ten_vt, phu_trach, nganh').eq('ma_vt', item.ma_vt);
                    if (nganh) {
                        spQuery = spQuery.eq('nganh', nganh);
                    }
                    const { data: spData } = await spQuery.limit(1);
                    if (spData && spData.length > 0) {
                        if (!phuTrach) phuTrach = spData[0].phu_trach || '';
                        if (!tenVt) tenVt = spData[0].ten_vt || '';
                        if (!nganh) nganh = spData[0].nganh || '';
                    } else {
                        const { data: fallbackSp } = await sb.from('san_pham').select('ten_vt, phu_trach, nganh').eq('ma_vt', item.ma_vt).limit(1);
                        if (fallbackSp && fallbackSp.length > 0) {
                            if (!phuTrach) phuTrach = fallbackSp[0].phu_trach || '';
                            if (!tenVt) tenVt = fallbackSp[0].ten_vt || '';
                            if (!nganh) nganh = fallbackSp[0].nganh || '';
                        }
                    }
                }

                const tinhTrang = calculateTinhTrangFromDate(item.date);

                newTonKhoToInsert.push({
                    ma_vach: item.ma_vach,
                    ma_vt: item.ma_vt,
                    ten_vt: tenVt,
                    lot: item.lot,
                    date: item.date,
                    ton_dau: 0,
                    nhap: 0,
                    xuat: 0,
                    ton_cuoi: 0,
                    tinh_trang: tinhTrang,
                    tray: item.tray || '',
                    nganh: nganh,
                    phu_trach: phuTrach,
                    note: ''
                });
            }

            if (newTonKhoToInsert.length > 0) {
                const { error: insertTonKhoError } = await sb.from('ton_kho').upsert(newTonKhoToInsert, { onConflict: 'ma_vach', ignoreDuplicates: true });
                if (insertTonKhoError) {
                    console.error("Lỗi khi lưu LOT mới vào tồn kho:", insertTonKhoError);
                }
            }
        }

        await syncChiTietDonHang(donHangData.ma_kho, { ...donHangData, loai_don });

        // Nếu là đơn Nhập/Nhập Trả: cập nhật Tray vào tồn kho theo ma_vach
        // Đọc thẳng từ DOM để lấy cả giá trị tray đã có sẵn (không chỉ những ô người dùng vừa đổi)
        if (loai_don === 'Nhap') {
            const trayInputEls = document.querySelectorAll('.chi-tiet-tray-input');
            const trayMap = new Map();
            trayInputEls.forEach(el => {
                const itemId = el.dataset.id;
                const trayVal = el.value.trim();
                if (trayVal) trayMap.set(itemId, trayVal);
            });

            if (trayMap.size > 0) {
                const trayPromises = [];
                chiTietItems.forEach(item => {
                    if (!item || !item.ma_vach) return;
                    const trayVal = trayMap.get(String(item.id));
                    if (trayVal !== undefined) {
                        // Lưu vào bảng thật ton_kho theo ma_vach (Code + Lot + EXP)
                        trayPromises.push(
                            sb.from('ton_kho').update({ tray: trayVal }).eq('ma_vach', item.ma_vach)
                        );
                    }
                });
                if (trayPromises.length > 0) await Promise.all(trayPromises);
            }
        }

        showToast('Lưu đơn hàng thành công!', 'success');

        if (printAction === 'print') {
            const isXuat = donHangData.ma_kho.startsWith('OUT');
            if (isXuat) {
                showPrintChoiceModal(donHangData.ma_kho);
            } else {
                openPrintPreviewModal(`print.html?ma_kho=${donHangData.ma_kho}`, `Phiếu Nhập Kho - ${donHangData.ma_kho}`);
            }
        }

        forceCloseDonHangModal();
        const pageToFetch = isEdit ? viewStates['view-don-hang'].currentPage : 1;
        fetchDonHang(pageToFetch, false);
    } catch (error) {
        if (error.code === '23505') showToast(`Mã kho "${getElValue('don-hang-modal-ma-kho')}" đã tồn tại.`, 'error');
        else showToast(`Lỗi: ${error.message}`, 'error');
        console.error("Save error:", error);
    } finally {
        if (!printAction) showLoading(false);
    }
}

// --- DELETE VERIFICATION MODAL ---
async function showDeleteVerifyModal() {
    return new Promise(resolve => {
        const modal = document.getElementById('delete-verify-modal');
        if (!modal) {
            console.error("delete-verify-modal not found");
            resolve(false);
            return;
        }

        const emailInput = document.getElementById('delete-verify-email');
        const passwordInput = document.getElementById('delete-verify-password');
        const confirmBtn = document.getElementById('delete-verify-confirm-btn');
        const cancelBtn1 = document.getElementById('delete-verify-cancel-btn');
        const cancelBtn2 = document.getElementById('delete-verify-cancel-btn-2');

        // Reset inputs
        emailInput.value = '';
        passwordInput.value = '';

        const cleanup = (result) => {
            modal.classList.add('hidden');
            confirmBtn.onclick = null;
            cancelBtn1.onclick = null;
            cancelBtn2.onclick = null;
            passwordInput.onkeydown = null;
            resolve(result);
        };

        const handleConfirm = async () => {
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                showToast("Vui lòng nhập đầy đủ thông tin.", "error");
                return;
            }

            // Kiểm tra xem có đúng là user hiện tại không
            if (email !== currentUser.gmail) {
                showToast("Tên đăng nhập không đúng với tài khoản hiện tại.", "error");
                return;
            }

            showLoading(true);
            try {
                // Kiểm tra mật khẩu trực tiếp từ bảng user để tránh làm mới session_id gây đăng xuất
                const { data: userFromDb, error } = await sb
                    .from('user')
                    .select('mat_khau')
                    .eq('gmail', email)
                    .single();

                if (error || !userFromDb || userFromDb.mat_khau !== password) {
                    showToast("Xác thực thất bại: Mật khẩu không chính xác.", "error");
                    return;
                }

                // Thành công
                cleanup(true);
            } catch (err) {
                showToast("Lỗi xác thực: " + err.message, "error");
            } finally {
                showLoading(false);
            }
        };

        cancelBtn1.onclick = () => cleanup(false);
        cancelBtn2.onclick = () => cleanup(false);
        confirmBtn.onclick = handleConfirm;

        passwordInput.onkeydown = (e) => {
            if (e.key === 'Enter') handleConfirm();
        };

        modal.classList.remove('hidden');
        passwordInput.focus();
    });
}

async function handleDeleteMultipleDonHang() {
    const selectedIds = [...viewStates['view-don-hang'].selected];
    if (selectedIds.length === 0) return;

    // Kiểm tra bảo mật: Không cho phép xóa đơn đã hoàn thành
    const selectedOrders = cache.donHangList.filter(dh => selectedIds.includes(dh.ma_kho));
    const hasCompletedOrder = selectedOrders.some(dh => dh.ma_nx && !dh.ma_nx.endsWith('-'));

    if (hasCompletedOrder) {
        showToast("Không thể xóa đơn hàng đã hoàn thành.", "error");
        return;
    }

    // Yêu cầu xác thực mật khẩu trước khi xóa
    const verified = await showDeleteVerifyModal();
    if (!verified) return;

    showLoading(true);
    try {
        await sb.from('chi_tiet').delete().in('ma_kho', selectedIds);
        for (const ma_kho of selectedIds) {
            const { data: list, error } = await sb.storage.from('file_don_hang').list(ma_kho);
            if (list && list.length > 0) {
                const filesToRemove = list.map(x => `${ma_kho}/${x.name}`);
                await sb.storage.from('file_don_hang').remove(filesToRemove);
            }
        }
        const { error: deleteError } = await sb.from('don_hang').delete().in('ma_kho', selectedIds);
        if (deleteError) throw deleteError;

        showToast(`Đã xóa ${selectedIds.length} đơn hàng.`, 'success');
        fetchDonHang(1, false);
    } catch (error) {
        showToast(`Lỗi khi xóa: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

async function updateItemFromMaVt(item, ma_vt) {
    if (!item || !ma_vt) return item;

    item.ma_vt = ma_vt;
    item.lot = null;
    item.date = null;
    item.ma_vach = null;
    item.tonKhoData = null;
    item.lotOptions = [];
    item.pendingData = { nhap: 0, xuat: 0 };
    item.ma_vach_valid = false;
    item.ten_vt = 'Đang tải...';

    const { data: lotData, error: lotError } = await sb.from('ton_kho_update')
        .select('ma_vach, lot, date, ten_vt, tinh_trang, ton_cuoi, nganh, phu_trach, tray, nhap, xuat')
        .eq('ma_vt', ma_vt);

    if (lotError) {
        showToast(`Lỗi khi tải LOT cho ${ma_vt}.`, 'error');
        item.ten_vt = 'Lỗi tải dữ liệu';
    } else if (lotData && lotData.length > 0) {
        const ma_kho_orig = document.getElementById('don-hang-edit-mode-ma-kho').value;
        const allMaVachs = lotData.map(l => l.ma_vach);

        const pendingAmounts = await getPendingAmountsByMaVach(allMaVachs, ma_kho_orig);

        const adjustedLotData = lotData.map(lot => {
            return { ...lot, pendingData: pendingAmounts.get(lot.ma_vach) || { nhap: 0, xuat: 0 } };
        });

        item.lotOptions = adjustedLotData;
        item.ten_vt = adjustedLotData[0]?.ten_vt || '';
    } else {
        const currentNganh = document.getElementById('don-hang-modal-nganh')?.value || '';
        let spQuery = sb.from('san_pham').select('ten_vt, phu_trach, nganh').eq('ma_vt', ma_vt);
        if (currentNganh) spQuery = spQuery.eq('nganh', currentNganh);
        const { data: sanPhamList } = await spQuery.limit(1);
        let sanPham = sanPhamList && sanPhamList[0];
        if (!sanPham) {
            const { data: fallbackList } = await sb.from('san_pham').select('ten_vt, phu_trach, nganh').eq('ma_vt', ma_vt).limit(1);
            sanPham = fallbackList && fallbackList[0];
        }
        item.ten_vt = sanPham?.ten_vt || 'Không rõ';
        item.nganh = sanPham?.nganh || currentNganh;
        item.phu_trach = sanPham?.phu_trach || '';
        showToast(`Chưa có LOT trong tồn kho cho Mã VT: ${ma_vt}. Bạn có thể chọn ô LOT để thêm LOT mới.`, 'info');
    }
    return item;
}

async function handleMaVtAutocomplete(input) {
    const row = input.closest('tr');
    const id = row.dataset.id;
    const item = chiTietItems.find(i => i && i.id == id);
    const nganh = document.getElementById('don-hang-modal-nganh').value;
    if (!item || !nganh) {
        if (!nganh) showToast('Vui lòng chọn Ngành trong Thông Tin Chung trước.', 'info');
        return;
    }

    item.ma_vt = input.value;
    const { data, error } = await sb.from('san_pham')
        .select('ma_vt, ten_vt')
        .eq('nganh', nganh)
        .or(`ma_vt.ilike.%${input.value}%,ten_vt.ilike.%${input.value}%`)
        .limit(10);

    if (error) { console.error(error); return; }

    openAutocomplete(input, data || [], {
        valueKey: 'ma_vt',
        primaryTextKey: 'ma_vt',
        secondaryTextKey: 'ten_vt',
        width: '350px',
        onSelect: async (selectedValue) => {
            input.value = selectedValue;
            await updateItemFromMaVt(item, selectedValue);
            renderChiTietTable();
        }
    });
}

function hasDonHangChanges() {
    const currentData = {
        thoi_gian: getElValue('don-hang-modal-thoi-gian'),
        loai_don: getElValue('don-hang-modal-loai-don'),
        yeu_cau: getElValue('don-hang-modal-yeu-cau', true),
        nganh: getElValue('don-hang-modal-nganh', true),
        ma_nx: getElValue('don-hang-modal-ma-nx', true),
        muc_dich: getElValue('don-hang-modal-muc-dich', true),
        ghi_chu: getElValue('don-hang-modal-ghi-chu', true),
    };

    for (const key in initialDonHangData) {
        if (initialDonHangData[key] !== currentData[key] && !String(currentData[key]).startsWith('__MISSING_ELEMENT_')) {
            return true;
        }
    }

    if (selectedDonHangFiles.length > 0) return true;
    if (initialExistingFiles.length !== currentExistingFiles.length) return true;

    if (chiTietItems.length !== initialChiTietItems.length) return true;

    const getComparableItem = ({ ma_vt, lot, yc_sl, sl, loai }) => ({ ma_vt, lot, yc_sl, sl, loai });
    try {
        const initialChiTietItemsFiltered = initialChiTietItems.map(getComparableItem);
        const currentChiTietItemsFiltered = chiTietItems.map(getComparableItem);
        if (JSON.stringify(initialChiTietItemsFiltered) !== JSON.stringify(currentChiTietItemsFiltered)) return true;
    } catch (e) {
        console.error("Error comparing chi tiet items:", e);
        return true;
    }

    return false;
}

function forceCloseDonHangModal() {
    document.getElementById('don-hang-modal').classList.add('hidden');
}

async function closeDonHangModalWithConfirm() {
    if (document.getElementById('save-don-hang-btn').classList.contains('hidden')) {
        forceCloseDonHangModal();
        return;
    }
    if (!hasDonHangChanges()) {
        forceCloseDonHangModal();
        return;
    }

    const confirmed = await showConfirm('Bạn có chắc muốn đóng? Mọi thay đổi chưa lưu sẽ bị mất.');
    if (confirmed) {
        forceCloseDonHangModal();
    }
}

export function initDonHangView() {
    const viewContainer = document.getElementById('view-don-hang');
    const role = currentUser?.phan_quyen;
    const isAdminOrUser = role === 'Admin' || role === 'User';
    if (viewContainer) {
        viewContainer.querySelectorAll('.dh-admin-only').forEach(el => el.classList.toggle('hidden', !isAdminOrUser));
    }

    initDonHangQuickStockSearch();

    const table = document.getElementById('don-hang-table') || document.querySelector('#view-don-hang table');
    if (table) {
        applyDonHangColumnOrder(table);
        initDonHangColumnsModal();
        applyDonHangColumnState();
        updateDonHangSortButtonUI();
        initResizableTable(table, 'don_hang_col_widths');
        initSortableDonHangColumns(table);
    }

    const triggerFetch = debounce(() => fetchDonHang(1), 500);

    const searchInput = document.getElementById('don-hang-search');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            viewStates['view-don-hang'].searchTerm = e.target.value;
            updateFilterButtonTexts('don-hang');
            triggerFetch();
        });
    }

    const fromDateInput = document.getElementById('don-hang-filter-from-date');
    if (fromDateInput) {
        fromDateInput.addEventListener('change', e => {
            viewStates['view-don-hang'].filters.from_date = e.target.value;
            updateFilterButtonTexts('don-hang');
            fetchDonHang(1);
        });
    }

    const toDateInput = document.getElementById('don-hang-filter-to-date');
    if (toDateInput) {
        toDateInput.addEventListener('change', e => {
            viewStates['view-don-hang'].filters.to_date = e.target.value;
            updateFilterButtonTexts('don-hang');
            fetchDonHang(1);
        });
    }

    if (viewContainer) {
        viewContainer.addEventListener('click', e => {
            const filterBtn = e.target.closest('.filter-btn');
            if (filterBtn) {
                e.stopPropagation();
                openTonKhoFilterPopover(filterBtn, 'view-don-hang');
                return;
            }

            const sortBtn = e.target.closest('.sort-btn');
            if (sortBtn) {
                e.stopPropagation();
                const sortKey = sortBtn.dataset.sortKey;
                if (!sortKey) return;

                const state = viewStates['view-don-hang'];
                if (state.sortBy === sortKey) {
                    if (state.sortAsc === true) {
                        state.sortAsc = false;
                    } else {
                        state.sortBy = 'thoi_gian';
                        state.sortAsc = false;
                    }
                } else {
                    state.sortBy = sortKey;
                    state.sortAsc = true;
                }
                updateDonHangSortButtonUI();
                fetchDonHang(1);
                return;
            }
        });
    }

    const resetFiltersBtn = document.getElementById('don-hang-reset-filters');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            const state = viewStates['view-don-hang'];
            if (searchInput) searchInput.value = '';
            if (fromDateInput) fromDateInput.value = '';
            if (toDateInput) toDateInput.value = '';
            state.searchTerm = '';
            state.filters = {
                from_date: '',
                to_date: '',
                loai: [],
                trang_thai_xu_ly: [],
                ma_kho: [],
                thoi_gian: [],
                ma_nx: [],
                yeu_cau: [],
                nganh: [],
                muc_dich: [],
                ghi_chu: []
            };
            state.sortBy = 'thoi_gian';
            state.sortAsc = false;
            updateDonHangSortButtonUI();
            updateFilterButtonTexts('don-hang');
            fetchDonHang(1);
        });
    }

    document.getElementById('don-hang-table-body').addEventListener('click', async e => {
        const row = e.target.closest('tr'); if (!row || !row.dataset.id) return;
        const id = row.dataset.id;

        if (e.target.closest('.ma-kho-cell')) {
            const optimisticData = cache.donHangList.find(dh => dh.ma_kho === id);
            if (!optimisticData) return;

            if (currentUser.phan_quyen === 'View' && currentUser.ho_ten !== optimisticData.yeu_cau) {
                showToast("Bạn không có quyền xem chi tiết đơn hàng này.", 'error');
                return;
            }

            openDonHangModal(optimisticData, 'view');

            sb.from('don_hang').select('*').eq('ma_kho', id).single().then(({ data: freshData }) => {
                if (freshData && document.getElementById('don-hang-edit-mode-ma-kho').value === id) {
                    openDonHangModal(freshData, 'view');
                }
            });
            return;
        }

        const checkbox = row.querySelector('.don-hang-select-row');
        if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
        viewStates['view-don-hang'].selected[checkbox.checked ? 'add' : 'delete'](id);
        row.classList.toggle('bg-blue-100', checkbox.checked);
        updateDonHangActionButtonsState();
        updateDonHangSelectionInfo();
    });

    document.getElementById('don-hang-select-all').addEventListener('click', e => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.don-hang-select-row').forEach(cb => {
            const row = cb.closest('tr');
            if (row && cb.checked !== isChecked) {
                cb.checked = isChecked;
                const id = row.dataset.id;
                viewStates['view-don-hang'].selected[isChecked ? 'add' : 'delete'](id);
                row.classList.toggle('bg-blue-100', isChecked);
            }
        });
        updateDonHangActionButtonsState();
        updateDonHangSelectionInfo();
    });

    document.getElementById('don-hang-btn-add').addEventListener('click', () => openDonHangModal(null, 'add'));
    document.getElementById('don-hang-btn-nhap-tra').addEventListener('click', () => openDonHangModal(null, 'nhap-tra'));
    document.getElementById('don-hang-btn-edit').addEventListener('click', () => {
        const ma_kho = [...viewStates['view-don-hang'].selected][0];
        const optimisticData = cache.donHangList.find(dh => dh.ma_kho === ma_kho);
        if (optimisticData) {
            openDonHangModal(optimisticData, 'edit');
        }
    });
    document.getElementById('don-hang-btn-delete').addEventListener('click', handleDeleteMultipleDonHang);

    document.getElementById('don-hang-btn-print').addEventListener('click', () => {
        const selectedIds = [...viewStates['view-don-hang'].selected];
        if (selectedIds.length === 1) {
            const ma_kho = selectedIds[0];
            if (ma_kho.startsWith('IN')) {
                openPrintPreviewModal(`print.html?ma_kho=${ma_kho}`, `Phiếu Nhập Kho - ${ma_kho}`);
            } else {
                showPrintChoiceModal(ma_kho);
            }
        }
    });

    const printViewBtn = document.getElementById('print-don-hang-view-btn');
    if (printViewBtn) {
        printViewBtn.addEventListener('click', () => {
            const ma_kho = document.getElementById('don-hang-edit-mode-ma-kho').value;
            if (ma_kho) {
                if (ma_kho.startsWith('IN')) {
                    openPrintPreviewModal(`print.html?ma_kho=${ma_kho}`, `Phiếu Nhập Kho - ${ma_kho}`);
                } else {
                    showPrintChoiceModal(ma_kho);
                }
            }
        });
    }

    document.getElementById('print-choice-do-btn').addEventListener('click', () => {
        if (currentPrintChoiceMaKho) {
            openPrintPreviewModal(`print.html?ma_kho=${currentPrintChoiceMaKho}`, `Phiếu Xuất Kho - ${currentPrintChoiceMaKho}`);
            hidePrintChoiceModal();
        }
    });

    document.getElementById('print-choice-pkl-btn').addEventListener('click', () => {
        if (currentPrintChoiceMaKho) {
            openPrintPreviewModal(`print-pkl.html?ma_kho=${currentPrintChoiceMaKho}`, `Phiếu Lấy Hàng - ${currentPrintChoiceMaKho}`);
            hidePrintChoiceModal();
        }
    });

    document.getElementById('print-choice-cancel-btn').addEventListener('click', hidePrintChoiceModal);


    document.getElementById('cancel-don-hang-btn').addEventListener('click', closeDonHangModalWithConfirm);
    document.getElementById('close-don-hang-view-btn').addEventListener('click', closeDonHangModalWithConfirm);

    document.getElementById('save-don-hang-btn').addEventListener('click', (e) => handleSaveDonHang(e, null));
    document.getElementById('save-and-print-btn').addEventListener('click', (e) => handleSaveDonHang(e, 'print'));

    const maNxInput = document.getElementById('don-hang-modal-ma-nx');
    maNxInput.addEventListener('input', (e) => {
        debouncedValidateMaNx(e.target.value);
    });

    // YÊU CẦU: Nhấn Enter để tự điền mã gợi ý
    maNxInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const suggestion = e.target.dataset.suggestion;
            if (suggestion) {
                e.preventDefault();
                e.target.value = suggestion;
                // Gọi lại validation ngay lập tức để cập nhật trạng thái
                debouncedValidateMaNx(suggestion);
            }
        }
    });

    // Chức năng cho cột Ghi Chú: Tự động điền 'Số Lượng : ' và thông minh hóa việc điền
    const ghiChuInput = document.getElementById('don-hang-modal-ghi-chu');
    if (ghiChuInput) {
        ghiChuInput.addEventListener('focus', function () {
            const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
            if (loaiDon === 'Nhap') return;
            if (!this.value.trim()) {
                this.value = 'Số Lượng : ';
                const pos = this.value.length;
                setTimeout(() => this.setSelectionRange(pos, pos), 0);
            }
        });

        ghiChuInput.addEventListener('keydown', function (e) {
            const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
            if (loaiDon === 'Nhap') return;

            if (e.key === 'Enter' && !e.shiftKey) {
                const start = this.selectionStart;
                const text = this.value;
                const lastLineStart = text.lastIndexOf('\n', start - 1) + 1;
                const currentLine = text.substring(lastLineStart, start);

                if (currentLine.startsWith('Số Lượng :')) {
                    e.preventDefault();
                    let slRaw = currentLine.replace('Số Lượng :', '').trim();
                    let slText = slRaw || '1';
                    if (slRaw && !isNaN(slRaw.replace(',', '.'))) {
                        slText = slRaw + ' Kiện';
                    } else if (slRaw && !slRaw.endsWith('Kiện')) {
                        slText = slRaw + ' Kiện';
                    } else if (!slRaw) {
                        slText = '1 Kiện';
                    }

                    const before = text.substring(0, lastLineStart);
                    const after = text.substring(start);
                    const newLine = `Số Lượng : ${slText}\nGửi : `;
                    this.value = before + newLine + after;

                    const newPos = before.length + newLine.length;
                    this.setSelectionRange(newPos, newPos);
                }
            } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                const start = this.selectionStart;
                const text = this.value;
                const before = text.substring(0, start);
                const after = text.substring(this.selectionEnd);
                const separator = '\n_____________\nSố Lượng : ';
                this.value = before + separator + after;
                const newPos = before.length + separator.length;
                this.setSelectionRange(newPos, newPos);
            }
        });

        ghiChuInput.addEventListener('input', function () {
            const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
            if (loaiDon === 'Nhap') return;

            const start = this.selectionStart;
            const text = this.value;
            const lastLineStart = text.lastIndexOf('\n', start - 1) + 1;
            const currentLine = text.substring(lastLineStart, start);

            if (currentLine.startsWith('Số Lượng :')) {
                const slPart = currentLine.replace('Số Lượng :', '').trim();
                // Nếu người dùng "lì" - gõ ký tự không phải số/dấu phẩy/chấm sau Số Lượng
                if (slPart.length > 0 && !/^[0-9.,]*$/.test(slPart) && !slPart.endsWith('Kiện')) {
                    const lastChar = slPart.slice(-1);
                    const slNum = slPart.slice(0, -1).trim() || '1';

                    const before = text.substring(0, lastLineStart);
                    const after = text.substring(start);
                    const newLine = `Số Lượng : ${slNum} Kiện\nGửi : ${lastChar}`;
                    this.value = before + newLine + after;
                    const newPos = before.length + newLine.length;
                    this.setSelectionRange(newPos, newPos);
                }
            }
        });
    }

    // Logic cho Modal Xuất Tin Nhắn
    const msgBtn = document.getElementById('don-hang-btn-msg');
    if (msgBtn) {
        msgBtn.addEventListener('click', handleExportMessage);
    }

    const shipBtn = document.getElementById('don-hang-btn-shipping');
    if (shipBtn) {
        shipBtn.addEventListener('click', () => {
            const selectedIds = [...viewStates['view-don-hang'].selected];
            if (selectedIds.length > 0) {
                const ma_kho_list = selectedIds.join(',');
                // Nạp URL vào iframe ẩn để hiện hộp thoại in mà không cần mở tab mới
                const printIframe = document.getElementById('print-iframe');
                if (printIframe) {
                    printIframe.src = `print-pkl.html?ma_kho=${ma_kho_list}&mode=shipping&t=${Date.now()}`;
                }
            }
        });
    }

    const closeMsgBtn = document.getElementById('close-msg-modal-btn');
    const cancelMsgBtn = document.getElementById('cancel-msg-modal-btn');
    const msgModal = document.getElementById('msg-export-modal');
    [closeMsgBtn, cancelMsgBtn].forEach(btn => {
        if (btn) btn.addEventListener('click', () => msgModal.classList.add('hidden'));
    });

    const copyMsgBtn = document.getElementById('copy-msg-btn');
    if (copyMsgBtn) {
        copyMsgBtn.addEventListener('click', () => {
            const checkedBlocks = currentExportBlocks.filter(b => b.checked);
            if (checkedBlocks.length === 0) {
                showToast('Vui lòng chọn ít nhất một địa chỉ để copy.', 'info');
                return;
            }

            let counter = 1;
            const copyText = checkedBlocks.map(block => {
                let blockText = `(${counter}) ${block.ma_nx} | WHB4 - ${block.nganh} - ${block.yeu_cau}\n`;
                // KHÔNG bao gồm Nội dung khi copy theo yêu cầu người dùng
                blockText += ` ${block.guiText}\n`;
                blockText += `Số Lượng : ${block.slText}\n`;
                blockText += `-------\n\n`;
                counter++;
                return blockText;
            }).join('').trim();

            navigator.clipboard.writeText(copyText).then(() => {
                showToast('Đã copy tin nhắn !', 'success');
            }).catch(err => {
                showToast('Lỗi khi copy: ' + err, 'error');
            });
        });
    }

    const modalPrintBtn = document.getElementById('don-hang-modal-print-btn');
    if (modalPrintBtn) {
        modalPrintBtn.addEventListener('click', () => {
            const contentArea = document.getElementById('msg-export-content');
            if (!contentArea.value) return;

            sessionStorage.setItem('custom_shipping_info_text', contentArea.value);

            // Nạp URL vào iframe ẩn để hiện hộp thoại in mà không cần mở tab mới
            const printIframe = document.getElementById('print-iframe');
            if (printIframe) {
                printIframe.src = `print-pkl.html?mode=custom_shipping&t=${Date.now()}`;
            }
        });
    }

    const msgSelectAllCb = document.getElementById('msg-export-select-all');
    if (msgSelectAllCb) {
        msgSelectAllCb.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            currentExportBlocks.forEach(b => b.checked = isChecked);
            renderExportBlocks();
        });
    }

    const msgAddBtn = document.getElementById('msg-export-add-btn');
    if (msgAddBtn) {
        msgAddBtn.addEventListener('click', window.addExportBlock);
    }

    document.getElementById('don-hang-modal-loai-don').addEventListener('change', () => {
        updateGeneratedCodes();
        toggleDonHangModalColumns();
        chiTietItems.forEach(item => {
            if (item) item.sl = 0;
        });
        renderChiTietTable();
    });
    document.getElementById('don-hang-modal-nganh').addEventListener('input', debounce(updateGeneratedCodes, 300));

    const tbCheckbox = document.getElementById('don-hang-chi-tiet-tb-checkbox');
    const thCheckbox = document.getElementById('don-hang-chi-tiet-th-checkbox');
    if (tbCheckbox && thCheckbox) {
        tbCheckbox.addEventListener('change', () => {
            if (tbCheckbox.checked) {
                thCheckbox.checked = false;
            }
        });
        thCheckbox.addEventListener('change', () => {
            if (thCheckbox.checked) {
                tbCheckbox.checked = false;
            }
        });
    }

    const dropArea = document.getElementById('don-hang-file-drop-area');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }));
    ['dragenter', 'dragover'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.add('border-indigo-500', 'bg-gray-100')));
    ['dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.remove('border-indigo-500', 'bg-gray-100')));
    dropArea.addEventListener('drop', e => handleFileSelection(e.dataTransfer.files));
    dropArea.addEventListener('paste', e => handleFileSelection(e.clipboardData.files));
    document.getElementById('don-hang-file-upload').addEventListener('change', e => handleFileSelection(e.target.files));
    document.getElementById('don-hang-file-list').addEventListener('click', e => {
        const button = e.target.closest('.remove-file-btn');
        if (button) {
            if (button.dataset.url) {
                currentExistingFiles = currentExistingFiles.filter(url => url !== button.dataset.url);
            } else if (button.dataset.index) {
                selectedDonHangFiles.splice(parseInt(button.dataset.index, 10), 1);
            }
            renderFileList();
        }
    });

    const chiTietBody = document.getElementById('don-hang-chi-tiet-body');
    if (chiTietBody) {
        if (chiTietSortable) chiTietSortable.destroy();
        chiTietSortable = new Sortable(chiTietBody, {
            animation: 150,
            handle: '.drag-handle',
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            forceFallback: true,
            onEnd: (evt) => {
                const { oldIndex: domOldIndex, newIndex: domNewIndex } = evt;
                if (domOldIndex === domNewIndex) return;

                const arrayOldIndex = Math.floor(domOldIndex / 2);
                const arrayNewIndex = Math.floor(domNewIndex / 2);

                if (arrayOldIndex === arrayNewIndex) return;

                const movedItem = chiTietItems.splice(arrayOldIndex, 1)[0];
                if (movedItem) {
                    chiTietItems.splice(arrayNewIndex, 0, movedItem);
                }
                renderChiTietTable();
            }
        });

        chiTietBody.addEventListener('paste', async (e) => {
            const targetInput = e.target;
            if (!targetInput || !targetInput.closest('tr.chi-tiet-row') || !targetInput.dataset.field) {
                return;
            }

            e.preventDefault();
            const pasteData = e.clipboardData.getData('text');
            let pastedValues = pasteData.split(/\r?\n/);
            if (pastedValues.length > 0 && pastedValues[pastedValues.length - 1].trim() === '') {
                pastedValues.pop();
            }
            if (pastedValues.length === 0) return;

            const targetRow = targetInput.closest('tr.chi-tiet-row');
            const targetId = targetRow.dataset.id;
            const targetField = targetInput.dataset.field;

            const startIndex = chiTietItems.findIndex(item => item && item.id == targetId);
            if (startIndex === -1) {
                return;
            }

            showLoading(true);
            showToast(`Đang dán ${pastedValues.length} dòng...`, 'info');

            try {
                const maVtUpdatePromises = [];
                const fieldsOrder = ['ma_vt', 'ten_vt', 'lot', 'date', 'yc_sl', 'sl', 'tb', 'th'];

                for (let i = 0; i < pastedValues.length; i++) {
                    const targetIndex = startIndex + i;
                    const line = pastedValues[i];
                    const cells = line.split('\t');

                    let currentItem = chiTietItems[targetIndex];
                    if (!currentItem) {
                        currentItem = { id: `new-${Date.now()}-${Math.random()}`, tb: 0, th: 0, sl: 0, yc_sl: 1, pendingData: { nhap: 0, xuat: 0 } };
                        chiTietItems.push(currentItem);
                    }

                    const startFieldIndex = fieldsOrder.indexOf(targetField);

                    for (let c = 0; c < cells.length; c++) {
                        const cellVal = cells[c].trim();
                        const fieldIndex = startFieldIndex + c;
                        if (fieldIndex >= fieldsOrder.length) break;

                        const currentField = fieldsOrder[fieldIndex];

                        if (currentField === 'yc_sl' || currentField === 'sl' || currentField === 'tb' || currentField === 'th') {
                            const numValue = parseInt(cellVal, 10);
                            currentItem[currentField] = isNaN(numValue) ? 0 : numValue;
                        } else {
                            currentItem[currentField] = cellVal;
                        }

                        if (currentField === 'ma_vt') {
                            maVtUpdatePromises.push(updateItemFromMaVt(currentItem, cellVal));
                        }
                    }


                }

                if (maVtUpdatePromises.length > 0) {
                    await Promise.all(maVtUpdatePromises);
                }

                renderChiTietTable();
                showToast(`Đã dán thành công!`, 'success');

            } catch (err) {
                showToast(`Lỗi khi dán: ${err.message}`, 'error');
                console.error("Paste error:", err);
            } finally {
                showLoading(false);
            }
        });
    }

    document.getElementById('don-hang-them-vat-tu-btn').addEventListener('click', () => {
        chiTietItems.push({ id: `new-${Date.now()}-${Math.random()}`, tb: 0, th: 0, sl: 0, yc_sl: 1, pendingData: { nhap: 0, xuat: 0 } });
        renderChiTietTable();
    });

    document.getElementById('don-hang-fill-sl-all-btn').addEventListener('click', () => {
        const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
        if (loaiDon !== 'Nhap' || chiTietItems.length === 0) return;

        chiTietItems.forEach(item => {
            if (item) {
                item.sl = item.yc_sl || 0;
            }
        });
        renderChiTietTable();
        showToast('Đã điền tất cả số lượng Nhập bằng Yêu cầu.', 'success');
    });

    chiTietBody.addEventListener('click', (e) => {
        const toggleNameBtn = e.target.closest('.toggle-name-btn');
        if (toggleNameBtn) {
            const cell = toggleNameBtn.closest('.chi-tiet-ten-vt-cell');
            if (cell) {
                cell.classList.toggle('expanded');
                const eyeIcon = toggleNameBtn.querySelector('.eye-icon');
                const eyeOffIcon = toggleNameBtn.querySelector('.eye-off-icon');
                if (eyeIcon && eyeOffIcon) {
                    eyeIcon.classList.toggle('hidden');
                    eyeOffIcon.classList.toggle('hidden');
                }
            }
            return;
        }

        const deleteBtn = e.target.closest('.chi-tiet-delete-btn');
        if (deleteBtn) {
            const row = e.target.closest('tr');
            const id = row.dataset.id;
            chiTietItems = chiTietItems.filter(item => item && item.id != id);
            renderChiTietTable();
            return;
        }

        const lotInput = e.target.closest('.chi-tiet-lot-input');
        if (lotInput) {
            const row = lotInput.closest('tr');
            const id = row.dataset.id;
            const item = chiTietItems.find(i => i && i.id == id);
            if (item) {
                openLotSelectorPopover(lotInput, item);
            }
        }
    });

    chiTietBody.addEventListener('change', (e) => {
        const input = e.target;
        if (!input.classList.contains('chi-tiet-input')) return;

        const row = input.closest('tr');
        if (!row) return;
        const id = row.dataset.id;
        const field = input.dataset.field;
        let value = input.type === 'number' ? parseFloat(input.value) : input.value;
        if (input.type === 'number' && isNaN(value)) {
            value = 0;
        }
        const item = chiTietItems.find(i => i && i.id == id);

        if (item) {
            const oldValue = item[field];
            item[field] = value;

            if (field === 'yc_sl') {
                if (value < 0) {
                    showToast('Yêu cầu (Y/c) không được âm.', 'error');
                    item.yc_sl = oldValue || 0;
                }
            } else if (field === 'sl') {
                const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
                const actualStock = item.tonKhoData?.ton_cuoi || 0;

                const initialTotalForThisMaVach = initialChiTietItems
                    .filter(initItem => initItem.ma_vach === item.ma_vach && item.ma_vach)
                    .reduce((sum, initItem) => sum + (parseFloat(initItem.sl) || 0), 0);

                let stockBeforeThisOrder;
                if (loaiDon === 'Nhap') {
                    stockBeforeThisOrder = actualStock - initialTotalForThisMaVach;
                } else {
                    stockBeforeThisOrder = actualStock + initialTotalForThisMaVach;
                }

                const currentTotalInUI = chiTietItems
                    .filter(i => i && i.ma_vach === item.ma_vach && item.ma_vach)
                    .reduce((sum, i) => sum + (parseFloat(i.sl) || 0), 0);

                if (value < 0) {
                    showToast('Số lượng (SL) không được âm.', 'error');
                    item.sl = oldValue || 0;
                } else if (item.yc_sl && value > item.yc_sl) {
                    showToast('Số lượng (SL) không được lớn hơn Yêu cầu (Y/c).', 'error');
                    item.sl = oldValue || item.yc_sl;
                } else if (loaiDon === 'Xuat' && !item.isNewLot && currentTotalInUI > stockBeforeThisOrder) {
                    showToast(`Tổng số lượng xuất (${currentTotalInUI}) vượt quá tồn kho (${stockBeforeThisOrder}).`, 'error');
                    item.sl = oldValue !== undefined ? oldValue : 0;
                }
            } else if (field === 'tb' || field === 'th') {
                if (value < 0) {
                    showToast('Số lượng không được âm.', 'error');
                    item[field] = oldValue || 0;
                } else {
                    const loaiDon = document.getElementById('don-hang-modal-loai-don').value;
                    if (loaiDon === 'Xuat') {
                        const tbVal = field === 'tb' ? value : (item.tb || 0);
                        const thVal = field === 'th' ? value : (item.th || 0);
                        const rowTotal = tbVal + thVal;
                        if (item.yc_sl && rowTotal > item.yc_sl) {
                            showToast('Tổng TB và TH không được lớn hơn Yêu cầu (Y/c).', 'warning');
                        }
                    }
                }
            }
            renderChiTietTable();
        }
    });

    chiTietBody.addEventListener('input', debounce(async (e) => {
        const input = e.target;
        if (input.classList.contains('chi-tiet-input') && input.dataset.field === 'ma_vt') {
            await handleMaVtAutocomplete(input);
        }
    }, 300));

    chiTietBody.addEventListener('mousedown', async (e) => {
        const input = e.target;
        if (input.classList.contains('chi-tiet-tray-input')) {
            // Ngăn chặn sự kiện click lan lên document làm đóng popover vừa mở
            e.stopPropagation();

            const list = await getTrayList();
            const inputVal = input.value.toLowerCase();
            const suggestions = list.filter(t => t.tray.toLowerCase().includes(inputVal));

            if (suggestions.length) {
                openAutocomplete(input, suggestions, {
                    valueKey: 'tray',
                    primaryTextKey: 'tray',
                    width: `${Math.max(input.offsetWidth, 150)}px`,
                    // Thiết lập chiều cao để hiển thị tầm 5 mục và cho phép cuộn
                    customStyles: {
                        maxHeight: '180px',
                        overflowY: 'auto'
                    },
                    onSelect: (val) => {
                        input.value = val;
                        const itemId = input.dataset.id;
                        const item = chiTietItems.find(i => i && String(i.id) === String(itemId));
                        if (item) item.tray = val;
                    }
                });
            }
        }
    });

    chiTietBody.addEventListener('focusin', async (e) => {
        const input = e.target;
        if (input.classList.contains('chi-tiet-input') && input.dataset.field === 'ma_vt') {
            await handleMaVtAutocomplete(input);
        }
        
        if (input.classList.contains('chi-tiet-lot-input')) {
            const row = input.closest('tr');
            if (row) {
                const id = row.dataset.id;
                const item = chiTietItems.find(i => i && i.id == id);
                if (item && !input.value.trim()) {
                    openLotSelectorPopover(input, item);
                }
            }
        }
        // Chúng ta đã dùng mousedown cho tray để nhạy hơn, nhưng vẫn giữ focusin đề phòng dùng phím Tab
        if (input.classList.contains('chi-tiet-tray-input')) {
            const list = await getTrayList();
            const inputVal = input.value.toLowerCase();
            const suggestions = list.filter(t => t.tray.toLowerCase().includes(inputVal));
            if (suggestions.length) {
                openAutocomplete(input, suggestions, {
                    valueKey: 'tray',
                    primaryTextKey: 'tray',
                    width: `${Math.max(input.offsetWidth, 150)}px`,
                    customStyles: { maxHeight: '180px', overflowY: 'auto' },
                    onSelect: (val) => {
                        input.value = val;
                        const itemId = input.dataset.id;
                        const item = chiTietItems.find(i => i && String(i.id) === String(itemId));
                        if (item) item.tray = val;
                    }
                });
            }
        }
    });

    chiTietBody.addEventListener('input', debounce(async (e) => {
        const input = e.target;
        if (input.classList.contains('chi-tiet-tray-input')) {
            const list = await getTrayList();
            const inputVal = input.value.toLowerCase();
            const suggestions = list.filter(t => t.tray.toLowerCase().includes(inputVal));
            openAutocomplete(input, suggestions, {
                valueKey: 'tray',
                primaryTextKey: 'tray',
                width: `${Math.max(input.offsetWidth, 150)}px`,
                customStyles: { maxHeight: '180px', overflowY: 'auto' },
                onSelect: (val) => {
                    input.value = val;
                    const itemId = input.dataset.id;
                    const item = chiTietItems.find(i => i && String(i.id) === String(itemId));
                    if (item) item.tray = val;
                }
            });
        }
        if (input.classList.contains('chi-tiet-input') && input.dataset.field === 'ma_vt') {
            await handleMaVtAutocomplete(input);
        }
    }, 250));

    chiTietBody.addEventListener('keydown', handleSmartTabNavigation);

    document.getElementById('don-hang-items-per-page').addEventListener('change', (e) => {
        viewStates['view-don-hang'].itemsPerPage = parseInt(e.target.value, 10); fetchDonHang(1);
    });
    document.getElementById('don-hang-prev-page').addEventListener('click', () => fetchDonHang(viewStates['view-don-hang'].currentPage - 1));
    document.getElementById('don-hang-next-page').addEventListener('click', () => fetchDonHang(viewStates['view-don-hang'].currentPage + 1));
    const pageInput = document.getElementById('don-hang-page-input');
    const handlePageJump = () => {
        const state = viewStates['view-don-hang'];
        const totalPages = Math.ceil(state.totalFilteredCount / state.itemsPerPage) || 1;
        let targetPage = parseInt(pageInput.value, 10);
        if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
        else if (targetPage > totalPages) targetPage = totalPages;
        pageInput.value = targetPage;
        if (targetPage !== state.currentPage) fetchDonHang(targetPage);
    };
    pageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handlePageJump(); e.target.blur(); } });
    pageInput.addEventListener('change', handlePageJump);

    attachDonHangTableListeners();
}

export async function executeSaveOrderJob(payload) {
    const { isEdit, ma_kho_orig, donHangData, newFiles, initialExistingFiles, currentExistingFiles } = payload;

    chiTietItems = payload.chiTietItems;
    initialChiTietItems = payload.initialChiTietItems;

    const filesToRemove = initialExistingFiles.filter(url => !currentExistingFiles.includes(url));
    if (filesToRemove.length > 0) {
        const filePathsToRemove = filesToRemove.map(url => {
            try {
                const path = new URL(url).pathname.split('/file_don_hang/')[1];
                return path ? decodeURIComponent(path) : null;
            } catch (e) { console.error("Invalid URL for file deletion:", url, e); return null; }
        }).filter(Boolean);
        if (filePathsToRemove.length > 0) await sb.storage.from('file_don_hang').remove(filePathsToRemove);
    }

    let uploadedFileUrls = [];
    if (newFiles.length > 0) {
        const uploadPromises = newFiles.map(async (fileData) => {
            const response = await fetch(fileData.base64);
            const blob = await response.blob();
            const file = new File([blob], fileData.name, { type: fileData.type });

            const safeFileName = sanitizeFileName(file.name);
            const filePath = `${donHangData.ma_kho}/${Date.now()}-${safeFileName}`;
            return sb.storage.from('file_don_hang').upload(filePath, file);
        });
        const uploadResults = await Promise.all(uploadPromises);
        for (const result of uploadResults) {
            if (result.error) throw new Error(`Lỗi tải file: ${result.error.message}`);
            const { data: urlData } = sb.storage.from('file_don_hang').getPublicUrl(result.data.path);
            uploadedFileUrls.push(urlData.publicUrl);
        }
    }
    donHangData.file = [...currentExistingFiles, ...uploadedFileUrls];

    const { error: donHangError } = isEdit
        ? await sb.from('don_hang').update(donHangData).eq('ma_kho', ma_kho_orig)
        : await sb.from('don_hang').insert(donHangData);
    if (donHangError) throw donHangError;

    const loai_don = donHangData.ma_kho.startsWith('IN') ? 'Nhap' : 'Xuat';
    await syncChiTietDonHang(donHangData.ma_kho, { ...donHangData, loai_don });
} async function updateDonHangField(ma_kho, field, value) {
    const dh = cache.donHangList.find(item => item.ma_kho === ma_kho);
    if (!dh || dh[field] === value) {
        renderDonHangTable(cache.donHangList);
        return;
    }

    showLoading(true);
    try {
        const { error } = await sb.from('don_hang').update({ [field]: value }).eq('ma_kho', ma_kho);
        if (error) throw error;

        if (field === 'ma_nx') {
            const { error: chiTietError } = await sb.from('chi_tiet').update({ ma_nx: value }).eq('ma_kho', ma_kho);
            if (chiTietError) console.error("Lỗi cập nhật mã nx trong chi tiết:", chiTietError);
        }

        dh[field] = value;
        showToast(`Đã cập nhật ${field === 'ma_nx' ? 'Mã NX' : 'Ghi chú'} cho đơn ${ma_kho}`, 'success');
        renderDonHangTable(cache.donHangList);
    } catch (error) {
        showToast(`Lỗi cập nhật: ${error.message}`, 'error');
        fetchDonHang(viewStates['view-don-hang'].currentPage, false);
    } finally {
        showLoading(false);
    }
}

function enterInlineEditMode(cell) {
    const field = cell.dataset.field;
    const ma_kho = cell.closest('tr').dataset.id;
    const dh = cache.donHangList.find(item => item.ma_kho === ma_kho);
    const currentValue = dh ? dh[field] : '';

    cell.classList.add('bg-blue-50', 'z-10');

    let inputHtml = '';
    if (field === 'ma_nx') {
        inputHtml = `
            <input type="text" class="w-full p-2 border-2 border-blue-400 rounded text-center font-bold text-sm inline-ma-nx-input" value="${currentValue || ''}">
            <div class="inline-ma-nx-status text-xs mt-1 h-4 font-medium text-center"></div>
        `;
    } else {
        inputHtml = `<textarea class="w-full p-2 border-2 border-blue-400 rounded text-sm" rows="4">${currentValue || ''}</textarea>`;
    }

    cell.innerHTML = `
        <div class="flex flex-col gap-2 p-1 min-w-[200px]">
            ${inputHtml}
            <div class="flex justify-end gap-2">
                <button class="cancel-inline-btn bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm hover:shadow flex items-center gap-1 transition-all active:scale-[0.98]" title="Hủy">
                    <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    <span>Hủy</span>
                </button>
                <button class="save-inline-btn bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm hover:shadow flex items-center gap-1 transition-all active:scale-[0.98]" title="Lưu và Khóa">
                    <svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    <span>Xác nhận</span>
                </button>
            </div>
        </div>
    `;

    const input = cell.querySelector('input, textarea');

    // NÂNG CẤP: Logic thông minh cho Ghi chú (giống trong form)
    if (field === 'ghi_chu') {
        input.addEventListener('focus', function () {
            if (dh && dh.loai_don === 'Nhap') return;
            if (!this.value.trim()) {
                this.value = 'Số Lượng : ';
                const pos = this.value.length;
                setTimeout(() => this.setSelectionRange(pos, pos), 0);
            }
        });

        input.addEventListener('keydown', function (e) {
            if (dh && dh.loai_don === 'Nhap') return;
            if (e.key === 'Enter' && !e.shiftKey) {
                const start = this.selectionStart;
                const text = this.value;
                const lastLineStart = text.lastIndexOf('\n', start - 1) + 1;
                const currentLine = text.substring(lastLineStart, start);

                if (currentLine.startsWith('Số Lượng :')) {
                    e.preventDefault();
                    let slRaw = currentLine.replace('Số Lượng :', '').trim();
                    let slText = slRaw || '1';
                    if (slRaw && !isNaN(slRaw.replace(',', '.'))) slText = slRaw + ' Kiện';
                    else if (slRaw && !slRaw.endsWith('Kiện')) slText = slRaw + ' Kiện';
                    else if (!slRaw) slText = '1 Kiện';

                    const before = text.substring(0, lastLineStart);
                    const after = text.substring(start);
                    const newLine = `Số Lượng : ${slText}\nGửi : `;
                    this.value = before + newLine + after;
                    const newPos = before.length + newLine.length;
                    this.setSelectionRange(newPos, newPos);
                }
            } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                const start = this.selectionStart;
                const text = this.value;
                const before = text.substring(0, start);
                const after = text.substring(this.selectionEnd);
                const separator = '\n_____________\nSố Lượng : ';
                this.value = before + separator + after;
                const newPos = before.length + separator.length;
                this.setSelectionRange(newPos, newPos);
            }
        });

        input.addEventListener('input', function () {
            if (dh && dh.loai_don === 'Nhap') return;
            const start = this.selectionStart;
            const text = this.value;
            const lastLineStart = text.lastIndexOf('\n', start - 1) + 1;
            const currentLine = text.substring(lastLineStart, start);

            if (currentLine.startsWith('Số Lượng :')) {
                const slPart = currentLine.replace('Số Lượng :', '').trim();
                if (slPart.length > 0 && !/^[0-9.,]*$/.test(slPart) && !slPart.endsWith('Kiện')) {
                    const lastChar = slPart.slice(-1);
                    const slNum = slPart.slice(0, -1).trim() || '1';
                    const before = text.substring(0, lastLineStart);
                    const after = text.substring(start);
                    const newLine = `Số Lượng : ${slNum} Kiện\nGửi : ${lastChar}`;
                    this.value = before + newLine + after;
                    const newPos = before.length + newLine.length;
                    this.setSelectionRange(newPos, newPos);
                }
            }
        });
    } else if (field === 'ma_nx') {
        const statusEl = cell.querySelector('.inline-ma-nx-status');

        const fetchSuggestion = debounce(async (val) => {
            if (!val || !val.endsWith('-')) {
                statusEl.textContent = '';
                input.dataset.suggestion = '';
                return;
            }
            statusEl.textContent = 'Đang tìm gợi ý...';
            statusEl.className = 'inline-ma-nx-status text-xs mt-1 h-4 font-medium text-center text-gray-500';
            const suggestion = await fetchNextMaNxSuggestion(val);
            input.dataset.suggestion = suggestion || '';
            if (suggestion) {
                statusEl.textContent = `Gợi ý: ${suggestion} (Enter để điền)`;
                statusEl.className = 'inline-ma-nx-status text-xs mt-1 h-4 font-medium text-center text-orange-600';
            } else {
                statusEl.textContent = '';
            }
        }, 300);

        input.addEventListener('input', (e) => {
            fetchSuggestion(e.target.value);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const suggestion = e.target.dataset.suggestion;
                if (suggestion && e.target.value.endsWith('-')) {
                    e.preventDefault();
                    e.target.value = suggestion;
                    statusEl.textContent = 'Đã điền gợi ý';
                    statusEl.className = 'inline-ma-nx-status text-xs mt-1 h-4 font-medium text-center text-green-600';
                    input.dataset.suggestion = '';
                } else if (!e.shiftKey) {
                    e.preventDefault();
                    cell.querySelector('.save-inline-btn').click();
                }
            }
        });

        fetchSuggestion(input.value);
    }

    input.focus();
    if (input.select && field !== 'ghi_chu') input.select(); // Không select hết nếu là ghi chú để focus vào đúng chỗ ...

    cell.querySelector('.save-inline-btn').onclick = (e) => {
        e.stopPropagation();
        const newValue = input.value.trim();
        updateDonHangField(ma_kho, field, newValue);
    };

    cell.querySelector('.cancel-inline-btn').onclick = (e) => {
        e.stopPropagation();
        renderDonHangTable(cache.donHangList);
    };

    // Chặn sự kiện click để không bị chọn dòng khi đang sửa
    cell.onclick = (e) => e.stopPropagation();
}

async function handleInlineFileDrop(files, ma_kho) {
    if (!files || files.length === 0) return;

    showLoading(true);
    try {
        const { data: currentDh, error: fetchError } = await sb.from('don_hang').select('file').eq('ma_kho', ma_kho).single();
        if (fetchError) throw fetchError;

        const existingFiles = parseFileArray(currentDh.file);
        const uploadedUrls = [];

        for (const file of Array.from(files)) {
            const safeFileName = sanitizeFileName(file.name);
            const filePath = `${ma_kho}/${Date.now()}-${safeFileName}`;
            const { data, error: uploadError } = await sb.storage.from('file_don_hang').upload(filePath, file);
            if (uploadError) throw uploadError;

            const { data: urlData } = sb.storage.from('file_don_hang').getPublicUrl(data.path);
            uploadedUrls.push(urlData.publicUrl);
        }

        const newFiles = [...existingFiles, ...uploadedUrls];
        const { error: updateError } = await sb.from('don_hang').update({ file: newFiles }).eq('ma_kho', ma_kho);
        if (updateError) throw updateError;

        showToast(`Đã tải lên ${files.length} file cho đơn ${ma_kho}`, 'success');

        const dh = cache.donHangList.find(item => item.ma_kho === ma_kho);
        if (dh) dh.file = newFiles;

        renderDonHangTable(cache.donHangList);
    } catch (error) {
        showToast(`Lỗi tải file: ${error.message}`, 'error');
        console.error("Drop upload error:", error);
    } finally {
        showLoading(false);
    }
}

// Gán sự kiện cho bảng để hỗ trợ sửa nhanh và kéo thả
export function attachDonHangTableListeners() {
    const tableBody = document.getElementById('don-hang-table-body');
    if (!tableBody) return;

    // Chuột phải để sửa
    tableBody.oncontextmenu = (e) => {
        const cell = e.target.closest('.right-click-edit-cell');
        if (cell) {
            e.preventDefault();
            e.stopPropagation();
            enterInlineEditMode(cell);
        }
    };

    // Kéo thả file trực tiếp vào dòng
    tableBody.ondragenter = (e) => {
        const cell = e.target.closest('.dropzone-cell');
        if (cell) cell.classList.add('bg-blue-100');
    };

    tableBody.ondragover = (e) => {
        const cell = e.target.closest('.dropzone-cell');
        if (cell) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    tableBody.ondragleave = (e) => {
        const cell = e.target.closest('.dropzone-cell');
        if (cell) cell.classList.remove('bg-blue-100');
    };

    tableBody.ondrop = (e) => {
        const cell = e.target.closest('.dropzone-cell');
        if (cell) {
            e.preventDefault();
            e.stopPropagation();
            cell.classList.remove('bg-blue-100');

            const ma_kho = cell.closest('tr').dataset.id;
            const files = e.dataTransfer.files;
            handleInlineFileDrop(files, ma_kho);
        }
    };

    // Paste file trực tiếp vào ô
    tableBody.onpaste = (e) => {
        const cell = e.target.closest('.dropzone-cell');
        if (cell && e.clipboardData.files.length > 0) {
            e.preventDefault();
            const ma_kho = cell.closest('tr').dataset.id;
            handleInlineFileDrop(e.clipboardData.files, ma_kho);
        }
    };
}

// Tự động gọi khi load module
setTimeout(attachDonHangTableListeners, 500);

window.toggleNote = function (btn) {
    const container = btn.closest('.note-container');
    const tr = btn.closest('tr');
    if (!container) return;
    const isExpanded = container.classList.toggle('expanded');
    if (tr) {
        tr.classList.toggle('row-expanded', isExpanded);
    }
    btn.textContent = isExpanded ? 'Ẩn bớt' : 'Xem thêm';

    // Nếu thu gọn lại, cuộn dòng đó lên đầu tầm mắt nếu cần
    if (!isExpanded && tr) {
        tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};

let allStockForQuickSearch = null;
let isFetchingQuickStock = false;

export async function fetchAllStockForQuickSearch(forceRefresh = false) {
    if (allStockForQuickSearch && !forceRefresh) return allStockForQuickSearch;
    if (isFetchingQuickStock) return allStockForQuickSearch || [];
    isFetchingQuickStock = true;
    try {
        const { data, error } = await sb.from('ton_kho_update')
            .select('ma_vach, ma_vt, ten_vt, lot, date, ton_cuoi, nganh, phu_trach, tray, tinh_trang, nhap, xuat')
            .order('ton_cuoi', { ascending: false })
            .limit(3000);
        if (!error && data) {
            allStockForQuickSearch = data;
        }
    } catch (err) {
        console.error("Lỗi tải tồn kho cho tìm kiếm nhanh:", err);
    } finally {
        isFetchingQuickStock = false;
    }
    return allStockForQuickSearch || [];
}

export function initDonHangQuickStockSearch() {
    const searchInput = document.getElementById('don-hang-quick-search-stock');
    const clearBtn = document.getElementById('don-hang-quick-search-clear');
    const dropdown = document.getElementById('don-hang-quick-search-dropdown');
    const resultsContainer = document.getElementById('don-hang-quick-search-results');
    const countEl = document.getElementById('don-hang-quick-search-count');

    if (!searchInput || !dropdown || !resultsContainer) return;

    if (searchInput.dataset.initialized) return;
    searchInput.dataset.initialized = 'true';

    const closeDropdown = () => {
        dropdown.classList.add('hidden');
    };

    const openDropdown = () => {
        dropdown.classList.remove('hidden');
    };

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.classList.add('hidden');
            closeDropdown();
            searchInput.focus();
        });
    }

    const clearAndCloseQuickSearch = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        searchInput.value = '';
        if (clearBtn) clearBtn.classList.add('hidden');
        closeDropdown();
    };

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            clearAndCloseQuickSearch(e);
        }
    });

    // Capture phase on document to intercept Escape before global modal handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const isDropdownOpen = !dropdown.classList.contains('hidden');
            const hasInputValue = searchInput.value.trim().length > 0;
            const isFocused = document.activeElement === searchInput;

            if (isDropdownOpen || hasInputValue || isFocused) {
                clearAndCloseQuickSearch(e);
            }
        }
    }, true);

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
            closeDropdown();
        }
    });

    const renderSearchResults = (groupedList, currentOrderNganh, totalLotCount) => {
        if (!groupedList || groupedList.length === 0) {
            countEl.innerHTML = `<span class="text-red-500 font-bold">Không tìm thấy vật tư phù hợp</span>`;
            resultsContainer.innerHTML = `
                <div class="p-6 text-center text-slate-400">
                    <p class="mb-1 font-medium text-slate-600">Không tìm thấy sản phẩm tồn kho nào khớp với từ khóa.</p>
                    <p class="text-[11px] text-slate-400">Thử tìm theo Mã VT, Tên viết tắt không dấu, số LOT hoặc Ngành.</p>
                </div>
            `;
            openDropdown();
            return;
        }

        countEl.innerHTML = `
            <span class="text-slate-700">
                Tìm thấy <strong class="text-blue-600 font-bold">${groupedList.length}</strong> loại vật tư 
                <span class="text-slate-400 font-normal">(${totalLotCount} LOT)</span>
                ${currentOrderNganh ? `<span class="ml-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">⭐ Ưu tiên: <strong>${currentOrderNganh}</strong></span>` : ''}
            </span>
        `;
        
        let html = '';
        let globalLotIndex = 0;
        const allLotsFlattened = [];

        const getTinhTrangTextColor = (tinhTrang) => {
            if (!tinhTrang) return 'text-slate-400';
            const tt = tinhTrang.trim();
            if (tt === 'Hết hạn sử dụng' || tt.toLowerCase().includes('hết hạn')) {
                return 'text-red-600 font-bold';
            }
            if (tt.includes('1-30')) {
                return 'text-rose-600 font-bold';
            }
            if (tt.includes('31-60')) {
                return 'text-orange-600 font-bold';
            }
            if (tt.includes('61-90')) {
                return 'text-amber-600 font-semibold';
            }
            if (tt.includes('91-120')) {
                return 'text-amber-500 font-semibold';
            }
            if (tt.includes('121-150')) {
                return 'text-yellow-600 font-semibold';
            }
            if (tt.includes('151-180')) {
                return 'text-yellow-500 font-semibold';
            }
            if (tt.includes('Trên 180') || tt.includes('Còn sử dụng')) {
                return 'text-emerald-600 font-semibold';
            }
            if (tt.includes('Cận date')) {
                return 'text-rose-500 font-bold';
            }
            if (tt === 'Không có date' || tt.toLowerCase().includes('không')) {
                return 'text-slate-400 font-normal';
            }
            return 'text-slate-600 font-medium';
        };

        groupedList.slice(0, 40).forEach((group, grpIdx) => {
            const isSameNganh = currentOrderNganh && group.nganh && group.nganh.toLowerCase() === currentOrderNganh.toLowerCase();
            const groupTon = group.tong_ton || 0;
            const groupHasStock = groupTon > 0;

            html += `
                <div class="product-group-section border-b border-slate-200 last:border-b-0">
                    <!-- Tiêu đề Sản phẩm (Mã VT / Tên VT bên trái mở rộng tối đa, Ngành + Tồn bên phải) -->
                    <div class="px-3.5 py-2 ${isSameNganh ? 'bg-amber-50/70 border-l-4 border-l-amber-500' : 'bg-slate-50/80 border-l-4 border-l-blue-500'} border-b border-slate-100 flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2 flex-grow min-w-0">
                            <span class="font-mono font-bold ${isSameNganh ? 'text-amber-800' : 'text-blue-700'} text-xs md:text-sm flex-shrink-0">${group.ma_vt || 'N/A'}</span>
                            <span class="text-slate-300 font-light flex-shrink-0">|</span>
                            <span class="font-bold text-slate-800 text-xs md:text-sm truncate" title="${group.ten_vt || ''}">${group.ten_vt || 'Chưa có tên'}</span>
                        </div>
                        <div class="flex items-center gap-2.5 flex-shrink-0">
                            ${group.nganh ? `<span class="text-[11px] font-semibold ${isSameNganh ? 'text-amber-700 bg-amber-100/80 border border-amber-200 px-1.5 py-0.5 rounded' : 'text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded'}">🏷️ ${group.nganh}</span>` : ''}
                            <span class="text-xs font-semibold text-slate-600">
                                Tổng tồn: <strong class="${groupHasStock ? 'text-emerald-600' : 'text-rose-600'} font-bold">${groupTon.toLocaleString()}</strong>
                            </span>
                            <span class="text-[11px] text-slate-400 font-normal">(${group.lots.length} LOT)</span>
                        </div>
                    </div>

                    <!-- Header các cột thông tin LOT (thụt lề sang phải) -->
                    <div class="pl-7 pr-3 py-1.5 bg-slate-100/90 border-b border-slate-300 text-[11px] font-bold text-slate-900 flex items-center select-none">
                        <span class="w-5 pl-1 flex-shrink-0 text-center text-slate-500 font-bold">#</span>
                        <span class="w-32 flex-shrink-0 text-left pl-1">LOT</span>
                        <span class="w-20 flex-shrink-0 text-center">Date</span>
                        <span class="w-44 flex-shrink-0 text-center">Tình trạng</span>
                        <span class="w-36 flex-shrink-0 text-left pl-2">Phụ trách</span>
                        <span class="w-16 flex-shrink-0 text-center">Tray</span>
                        <span class="w-16 flex-shrink-0 text-right pr-2">Tồn</span>
                        <span class="w-10 flex-shrink-0 text-center pr-2 ml-auto">Thêm</span>
                    </div>

                    <!-- Danh sách các LOT theo dạng cột thẳng hàng không khung màu (thụt lề sang phải) -->
                    <div class="bg-white divide-y divide-slate-100 py-0.5">
            `;

            group.lots.forEach((stock, lotIdx) => {
                const isLast = lotIdx === group.lots.length - 1;
                const branchSymbol = isLast ? '└──' : '├──';
                const hasStock = (stock.ton_cuoi || 0) > 0;
                
                const lotId = globalLotIndex++;
                allLotsFlattened.push(stock);

                html += `
                    <div class="pl-7 pr-3 py-1.5 hover:bg-blue-50/70 transition-colors flex items-center group cursor-pointer quick-stock-lot-row border-b border-slate-50 last:border-b-0" data-lot-id="${lotId}">
                        <!-- 1. Nhánh -->
                        <span class="w-5 font-mono text-slate-400 font-bold text-xs select-none pl-1 flex-shrink-0 text-center">${branchSymbol}</span>
                        
                        <!-- 2. LOT -->
                        <div class="w-32 flex-shrink-0 pl-1 truncate" title="${stock.lot || ''}">
                            <span class="font-mono font-bold text-slate-800 text-xs">${stock.lot || '-'}</span>
                        </div>

                        <!-- 3. Date -->
                        <div class="w-20 flex-shrink-0 text-center truncate">
                            <span class="font-mono text-slate-600 text-xs">${stock.date || '-'}</span>
                        </div>

                        <!-- 4. Tình trạng -->
                        <div class="w-44 flex-shrink-0 text-center truncate" title="${stock.tinh_trang || ''}">
                            <span class="text-xs ${getTinhTrangTextColor(stock.tinh_trang)}">${stock.tinh_trang || '-'}</span>
                        </div>

                        <!-- 5. Phụ trách -->
                        <div class="w-36 flex-shrink-0 pl-2 truncate" title="${stock.phu_trach || ''}">
                            <span class="text-xs text-slate-600">${stock.phu_trach || '-'}</span>
                        </div>

                        <!-- 6. Tray -->
                        <div class="w-16 flex-shrink-0 text-center truncate" title="${stock.tray || ''}">
                            <span class="text-xs font-semibold ${stock.tray ? 'text-indigo-600' : 'text-slate-400'}">${stock.tray || '-'}</span>
                        </div>

                        <!-- 7. Số tồn -->
                        <div class="w-16 flex-shrink-0 text-right pr-2">
                            <span class="text-xs font-bold ${hasStock ? 'text-emerald-600' : 'text-rose-500'}">
                                ${(stock.ton_cuoi || 0).toLocaleString()}
                            </span>
                        </div>

                        <!-- 8. Thêm (+) sát bên phải -->
                        <div class="w-10 flex-shrink-0 text-center pr-2 ml-auto">
                            <button type="button" title="Thêm vào đơn hàng" class="quick-add-lot-btn w-6 h-6 bg-blue-600 hover:bg-blue-700 active:scale-90 text-white rounded-md shadow-xs transition-all flex items-center justify-center mx-auto">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        resultsContainer.innerHTML = html;
        openDropdown();

        // Gán sự kiện click thêm cho từng LOT
        resultsContainer.querySelectorAll('.quick-stock-lot-row').forEach((rowEl) => {
            const lotId = parseInt(rowEl.dataset.lotId, 10);
            const stock = allLotsFlattened[lotId];
            if (!stock) return;

            const addBtn = rowEl.querySelector('.quick-add-lot-btn');

            const handleAdd = async (e) => {
                e.stopPropagation();
                
                const loaiDon = document.getElementById('don-hang-modal-loai-don')?.value || '';
                const requestedQty = 1;
                const availableStock = stock.ton_cuoi || 0;
                let actualSl = 0;
                if (loaiDon === 'Nhap') {
                    actualSl = requestedQty;
                } else if (loaiDon === 'Xuat') {
                    actualSl = Math.min(availableStock, requestedQty);
                }

                const isTbChecked = document.getElementById('don-hang-chi-tiet-tb-checkbox')?.checked;
                const isThChecked = document.getElementById('don-hang-chi-tiet-th-checkbox')?.checked;

                const newItem = {
                    id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
                    ma_vt: stock.ma_vt,
                    ten_vt: stock.ten_vt,
                    lot: stock.lot || '',
                    date: stock.date || '',
                    ma_vach: stock.ma_vach || '',
                    tray: stock.tray || '',
                    nganh: stock.nganh || '',
                    phu_trach: stock.phu_trach || '',
                    yc_sl: requestedQty,
                    sl: actualSl,
                    tb: (loaiDon === 'Xuat' && isTbChecked) ? actualSl : 0,
                    th: (loaiDon === 'Xuat' && isThChecked) ? actualSl : 0,
                    pendingData: { nhap: 0, xuat: 0 },
                    tonKhoData: stock,
                    lotOptions: [stock],
                    ma_vach_valid: true
                };

                // Nếu có dòng rỗng chưa nhập gì ở bảng chi tiết thì thay thế, nếu không thì push vào
                const emptyRowIndex = chiTietItems.findIndex(item => item && !item.ma_vt && (!item.lot || item.lot === '') && (!item.yc_sl || item.yc_sl === 1) && (!item.sl || item.sl === 0));
                if (emptyRowIndex !== -1) {
                    chiTietItems[emptyRowIndex] = newItem;
                } else {
                    chiTietItems.push(newItem);
                }

                renderChiTietTable();
                
                // Fetch full LOT options cho mã VT này
                try {
                    const ma_kho_orig = document.getElementById('don-hang-edit-mode-ma-kho')?.value || '';
                    const { data: lotData } = await sb.from('ton_kho_update')
                        .select('ma_vach, lot, date, ten_vt, tinh_trang, ton_cuoi, nganh, phu_trach, tray, nhap, xuat')
                        .eq('ma_vt', stock.ma_vt);
                    if (lotData && lotData.length > 0) {
                        const allMaVachs = lotData.map(l => l.ma_vach);
                        const pendingAmounts = await getPendingAmountsByMaVach(allMaVachs, ma_kho_orig);
                        newItem.lotOptions = lotData.map(l => ({
                            ...l,
                            pendingData: pendingAmounts.get(l.ma_vach) || { nhap: 0, xuat: 0 }
                        }));
                        const found = newItem.lotOptions.find(opt => opt.ma_vach === newItem.ma_vach);
                        if (found) {
                            newItem.tonKhoData = found;
                            newItem.pendingData = found.pendingData;
                        }
                        renderChiTietTable();
                    }
                } catch (err) {}

                // Hiệu ứng nút đã thêm
                if (addBtn) {
                    addBtn.className = 'w-6 h-6 bg-emerald-600 text-white rounded-md shadow-xs transition-all flex items-center justify-center pointer-events-none';
                    addBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>`;
                    setTimeout(() => {
                        addBtn.className = 'quick-add-lot-btn w-6 h-6 bg-blue-600 hover:bg-blue-700 active:scale-90 text-white rounded-md shadow-xs transition-all flex items-center justify-center';
                        addBtn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>`;
                    }, 1500);
                }

                showToast(`Đã thêm ${stock.ma_vt} (${stock.lot || 'No LOT'}) vào đơn hàng`, 'success');
                searchInput.focus();
            };

            rowEl.addEventListener('click', handleAdd);
        });
    };

    const handleSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) {
            if (clearBtn) clearBtn.classList.add('hidden');
            closeDropdown();
            return;
        }

        if (clearBtn) clearBtn.classList.remove('hidden');
        resultsContainer.innerHTML = `<div class="p-6 text-center text-slate-400">Đang tìm kiếm tồn kho...</div>`;
        openDropdown();

        const currentNganh = document.getElementById('don-hang-modal-nganh')?.value?.trim() || '';

        // Tải hoặc lấy từ cache
        const allStock = await fetchAllStockForQuickSearch();
        const tokens = removeVietnameseTones(query.toLowerCase()).split(/\s+/).filter(Boolean);

        const filtered = allStock.filter(item => {
            const searchable = removeVietnameseTones(`${item.ma_vt || ''} ${item.ten_vt || ''} ${item.lot || ''} ${item.date || ''} ${item.nganh || ''} ${item.tray || ''} ${item.tinh_trang || ''} ${item.phu_trach || ''} ${item.ma_vach || ''}`.toLowerCase());
            return tokens.every(token => searchable.includes(token));
        });

        // Gom nhóm theo Mã VT để hiển thị dạng cây (Tree)
        const groupMap = new Map();
        filtered.forEach(item => {
            const key = (item.ma_vt || 'KHONG_MA').toUpperCase();
            if (!groupMap.has(key)) {
                groupMap.set(key, {
                    ma_vt: item.ma_vt,
                    ten_vt: item.ten_vt,
                    nganh: item.nganh,
                    phu_trach: item.phu_trach,
                    tong_ton: 0,
                    lots: []
                });
            }
            const grp = groupMap.get(key);
            grp.lots.push(item);
            grp.tong_ton += (Number(item.ton_cuoi) || 0);
        });

        const groupedList = Array.from(groupMap.values());

        // Sắp xếp các nhóm: ƯU TIÊN NGÀNH CỦA ĐƠN HÀNG LÊN TRƯỚC
        const qUpper = query.toUpperCase();
        groupedList.sort((a, b) => {
            const aIsSameNganh = currentNganh && a.nganh && a.nganh.toLowerCase() === currentNganh.toLowerCase() ? 1 : 0;
            const bIsSameNganh = currentNganh && b.nganh && b.nganh.toLowerCase() === currentNganh.toLowerCase() ? 1 : 0;
            
            const aHasStock = a.tong_ton > 0 ? 1 : 0;
            const bHasStock = b.tong_ton > 0 ? 1 : 0;

            // 1. Trùng ngành và có tồn kho lên đầu tiên
            const aRank = (aIsSameNganh * 2) + aHasStock;
            const bRank = (bIsSameNganh * 2) + bHasStock;
            if (bRank !== aRank) return bRank - aRank;

            // 2. Khớp chính xác mã VT
            const aExact = (a.ma_vt || '').toUpperCase() === qUpper ? 1 : 0;
            const bExact = (b.ma_vt || '').toUpperCase() === qUpper ? 1 : 0;
            if (bExact !== aExact) return bExact - aExact;

            // 3. Bắt đầu bằng mã VT
            const aStarts = (a.ma_vt || '').toUpperCase().startsWith(qUpper) ? 1 : 0;
            const bStarts = (b.ma_vt || '').toUpperCase().startsWith(qUpper) ? 1 : 0;
            if (bStarts !== aStarts) return bStarts - aStarts;

            // 4. Tổng tồn cao hơn
            if (b.tong_ton !== a.tong_ton) return b.tong_ton - a.tong_ton;

            // 5. Thứ tự mã VT
            return (a.ma_vt || '').localeCompare(b.ma_vt || '');
        });

        // Sắp xếp các LOT trong từng nhóm: LOT còn tồn trước, sau đó theo date/lot
        groupedList.forEach(grp => {
            grp.lots.sort((la, lb) => {
                const laHas = (la.ton_cuoi || 0) > 0 ? 1 : 0;
                const lbHas = (lb.ton_cuoi || 0) > 0 ? 1 : 0;
                if (lbHas !== laHas) return lbHas - laHas;
                return (lb.ton_cuoi || 0) - (la.ton_cuoi || 0);
            });
        });

        renderSearchResults(groupedList, currentNganh, filtered.length);
    };

    searchInput.addEventListener('input', debounce(handleSearch, 200));
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim()) {
            handleSearch();
        } else {
            fetchAllStockForQuickSearch(); // Preload data
        }
    });
}

setTimeout(initDonHangQuickStockSearch, 600);
