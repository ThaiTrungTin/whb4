import { sb, currentUser, cache, viewStates, showLoading, showToast, showConfirm, debounce, renderPagination, filterButtonDefaultTexts, openAutocomplete, updateTonKhoToggleUI, openTonKhoFilterPopover, updateFilterButtonTexts, initResizableTable, showView, getTonKhoTinhTrangTextColor, getTonKhoTinhTrangWeight, compareTonKhoTinhTrang } from './app.js';
import { fetchSanPham } from './sanpham.js';
import { fetchChiTiet } from './chitiet.js';

const sanPhamLookupCache = new Map();

const debouncedValidateMaVach = debounce(async (ma_vach) => {
    const statusEl = document.getElementById('ton-kho-modal-ma-vach-status');
    const saveBtn = document.getElementById('save-ton-kho-btn');
    if (!ma_vach) {
        statusEl.textContent = '';
        saveBtn.disabled = true;
        return;
    }

    const { data, error } = await sb.from('ton_kho').select('ma_vach').eq('ma_vach', ma_vach).single();
    
    if (data) {
        statusEl.textContent = 'Mã vạch đã tồn tại';
        statusEl.classList.remove('text-green-600');
        statusEl.classList.add('text-red-600');
        saveBtn.disabled = true;
    } else {
        statusEl.textContent = 'Hợp lệ';
        statusEl.classList.remove('text-red-600');
        statusEl.classList.add('text-green-600');
        saveBtn.disabled = false;
    }
}, 500);


function updateGeneratedMaVach() {
    const ma_vt = document.getElementById('ton-kho-modal-ma-vt').value.trim();
    const lot = document.getElementById('ton-kho-modal-lot').value.trim();
    const dateInput = document.getElementById('ton-kho-modal-date').value.trim();

    const dateParts = dateInput.split('/');
    const formattedDate = dateParts.length === 3 ? `${dateParts[0]}.${dateParts[1]}.${dateParts[2]}` : dateInput;

    const generatedMaVach = [ma_vt, lot, formattedDate].filter(Boolean).join('');
    
    document.getElementById('ton-kho-modal-ma-vach').value = generatedMaVach;
    document.getElementById('ton-kho-modal-ma-vach-display').textContent = generatedMaVach || '...';
    
    if (!document.getElementById('ton-kho-edit-mode-ma-vach').value) {
        debouncedValidateMaVach(generatedMaVach);
    }
}


function parseDate(dateString) { 
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


function updateTinhTrangField() {
    const dateInput = document.getElementById('ton-kho-modal-date').value;
    const container = document.getElementById('ton-kho-modal-tinh-trang-container');
    const dateValue = parseDate(dateInput);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    let newElement;
    if (dateValue && dateValue <= today) {
        newElement = `<input type="text" id="ton-kho-modal-tinh-trang" value="Hết hạn sử dụng" readonly class="block w-full border rounded-md p-2 bg-gray-200">`;
    } else if (dateValue && dateValue > today && dateValue <= threeMonthsFromNow) {
        newElement = `<input type="text" id="ton-kho-modal-tinh-trang" value="Cận date" readonly class="block w-full border rounded-md p-2 bg-gray-200">`;
    } else { 
        newElement = `
            <select id="ton-kho-modal-tinh-trang" required class="block w-full border rounded-md p-2">
                <option value="Còn sử dụng">Còn sử dụng</option>
                <option value="Hàng hư">Hàng hư</option>
            </select>`;
    }
    container.innerHTML = newElement;
}

async function updateTonKhoHeaderCounts() {
    const state = viewStates['view-ton-kho'];
    const dauEl = document.getElementById('ton-kho-header-dau-count');
    const nhapEl = document.getElementById('ton-kho-header-nhap-count');
    const xuatEl = document.getElementById('ton-kho-header-xuat-count');
    const cuoiEl = document.getElementById('ton-kho-header-cuoi-count');

    if (!dauEl || !nhapEl || !xuatEl || !cuoiEl) return;

    [dauEl, nhapEl, xuatEl, cuoiEl].forEach(el => el.textContent = '(...)');

    try {
        const { data, error } = await sb.rpc('get_ton_kho_summary', {
            _search_term: state.searchTerm || '',
            _ma_vt_filter: state.filters.ma_vt || [],
            _lot_filter: state.filters.lot || [],
            _date_filter: state.filters.date || [],
            _tinh_trang_filter: state.filters.tinh_trang || [],
            _nganh_filter: state.filters.nganh || [],
            _phu_trach_filter: state.filters.phu_trach || [],
            _ton_cuoi_filter: state.stockAvailability === 'available' ? ['Còn Hàng'] : [],
            _user_role: currentUser?.phan_quyen || '',
            _user_ho_ten: currentUser?.ho_ten || ''
        });

        if (error) {
            console.error("Error fetching ton kho summary:", error);
            [dauEl, nhapEl, xuatEl, cuoiEl].forEach(el => el.textContent = '(lỗi)');
            return;
        }

        if (data && data.length > 0) {
            const totals = data[0];
            dauEl.textContent = `(${(totals.total_ton_dau || 0).toLocaleString()})`;
            nhapEl.textContent = `(${(totals.total_nhap || 0).toLocaleString()})`;
            xuatEl.textContent = `(${(totals.total_xuat || 0).toLocaleString()})`;
            
            const totalTonCuoi = totals.total_ton_cuoi || 0;
            cuoiEl.textContent = `(${totalTonCuoi.toLocaleString()})`;
            cuoiEl.classList.toggle('text-red-600', totalTonCuoi > 0);
            cuoiEl.classList.toggle('text-green-600', totalTonCuoi <= 0);
        } else {
             [dauEl, nhapEl, xuatEl, cuoiEl].forEach(el => el.textContent = '(0)');
             cuoiEl.classList.remove('text-red-600');
             cuoiEl.classList.add('text-green-600');
        }

    } catch (err) {
        console.error("updateTonKhoHeaderCounts exception:", err);
        [dauEl, nhapEl, xuatEl, cuoiEl].forEach(el => el.textContent = '(lỗi)');
    }
}

function buildTonKhoQuery() {
    const state = viewStates['view-ton-kho'];
    let query = sb.from('ton_kho_update').select('*', { count: 'exact' });

    if (currentUser?.phan_quyen === 'View') {
        query = query.eq('phu_trach', currentUser.ho_ten);
    }

    if (state.searchTerm) {
        query = query.or(`ma_vach.ilike.%${state.searchTerm}%,ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,lot.ilike.%${state.searchTerm}%,tinh_trang.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%,note.ilike.%${state.searchTerm}%`);
    }

    if (state.stockAvailability === 'available') {
        query = query.gt('ton_cuoi', 0);
    }

    if (state.filters.ma_vach?.length > 0) query = query.in('ma_vach', state.filters.ma_vach);
    if (state.filters.ma_vt?.length > 0) query = query.in('ma_vt', state.filters.ma_vt);
    if (state.filters.ten_vt?.length > 0) query = query.in('ten_vt', state.filters.ten_vt);
    if (state.filters.lot?.length > 0) query = query.in('lot', state.filters.lot);
    if (state.filters.date?.length > 0) query = query.in('date', state.filters.date);
    if (state.filters.ton_dau?.length > 0) query = query.in('ton_dau', state.filters.ton_dau);
    if (state.filters.nhap?.length > 0) query = query.in('nhap', state.filters.nhap);
    if (state.filters.xuat?.length > 0) query = query.in('xuat', state.filters.xuat);
    if (state.filters.ton_cuoi?.length > 0) query = query.in('ton_cuoi', state.filters.ton_cuoi);
    if (state.filters.tinh_trang?.length > 0) query = query.in('tinh_trang', state.filters.tinh_trang);
    if (state.filters.tray?.length > 0) query = query.in('tray', state.filters.tray);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    if (state.filters.note?.length > 0) query = query.in('note', state.filters.note);
    
    return query;
}

export async function fetchTonKho(page = viewStates['view-ton-kho'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-ton-kho'].currentPage = page;
        const state = viewStates['view-ton-kho'];
        state.selected.clear();
        updateTonKhoActionButtonsState();
        updateTonKhoSelectionInfo();
        updateTonKhoToggleUI();

        const { itemsPerPage } = state;
        const from = (page - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        let sortBy = state.sortBy || 'ma_vach';
        let sortAsc = state.sortAsc !== false;

        let transData = [];
        if (state.dateTo) {
            const { data: transactions, error: transError } = await sb
                .from('chi_tiet')
                .select('ma_vach, nhap, xuat, thoi_gian')
                .gt('thoi_gian', state.dateTo + 'T23:59:59');
            
            if (!transError && transactions) transData = transactions;
        }

        updateTonKhoHeaderCounts().catch(e => console.warn("Header count error:", e));

        let data = [];
        let count = 0;
        let error = null;

        if (sortBy === 'tinh_trang') {
            // Khi sắp xếp theo Tình Trạng, cần lấy toàn bộ dữ liệu lọc để sắp xếp theo đúng chu kỳ nghiệp vụ trước khi phân trang
            const res = await buildTonKhoQuery().limit(10000);
            error = res.error;
            count = res.count || (res.data ? res.data.length : 0);
            const allData = res.data || [];

            if (allData.length > 0) {
                // Tính toán tồn đến ngày trước khi sắp xếp (nếu có)
                if (state.dateTo) {
                    const transMap = {};
                    transData.forEach(tr => {
                        if (!transMap[tr.ma_vach]) transMap[tr.ma_vach] = { nhap: 0, xuat: 0 };
                        transMap[tr.ma_vach].nhap += (tr.nhap || 0);
                        transMap[tr.ma_vach].xuat += (tr.xuat || 0);
                    });

                    allData.forEach(item => {
                        const diff = transMap[item.ma_vach] || { nhap: 0, xuat: 0 };
                        item.ton_den_ngay = (item.ton_cuoi || 0) - diff.nhap + diff.xuat;
                    });
                }

                // Sắp xếp toàn bộ dữ liệu theo đúng chuẩn nghiệp vụ hạn sử dụng
                allData.sort((a, b) => {
                    const comp = compareTonKhoTinhTrang(a.tinh_trang, b.tinh_trang, sortAsc);
                    if (comp !== 0) return comp;
                    return (a.ma_vt || '').localeCompare(b.ma_vt || '');
                });

                data = allData.slice(from, to + 1);
            }
        } else {
            let query = buildTonKhoQuery().order(sortBy, { ascending: sortAsc, nullsFirst: false }).range(from, to);
            const res = await query;
            error = res.error;
            count = res.count || 0;
            data = res.data || [];

            // Tính toán tồn đến ngày nếu có yêu cầu
            if (state.dateTo && data.length > 0) {
                const transMap = {};
                transData.forEach(tr => {
                    if (!transMap[tr.ma_vach]) transMap[tr.ma_vach] = { nhap: 0, xuat: 0 };
                    transMap[tr.ma_vach].nhap += (tr.nhap || 0);
                    transMap[tr.ma_vach].xuat += (tr.xuat || 0);
                });

                data.forEach(item => {
                    const diff = transMap[item.ma_vach] || { nhap: 0, xuat: 0 };
                    item.ton_den_ngay = (item.ton_cuoi || 0) - diff.nhap + diff.xuat;
                });
            }
        }

        if (error) {
            console.error("fetchTonKho error:", error);
            showToast("Không thể tải dữ liệu tồn kho: " + error.message, 'error');
            renderTonKhoTable([]);
        } else {
            state.totalFilteredCount = count || 0;
            cache.tonKhoList = data || [];
            
            renderTonKhoTable(data || []);
            const table = document.getElementById('ton-kho-table');
            if (table) applyTonKhoColumnOrder(table);
            applyTonKhoColumnState();
            updateSortButtonUI();
            renderPagination('ton-kho', count || 0, from, to);
            updateTonKhoSelectionInfo();
            updateFilterButtonTexts('ton-kho');
        }
    } catch (globalErr) {
        console.error("fetchTonKho critical exception:", globalErr);
        showToast("Lỗi khi tải dữ liệu tồn kho", 'error');
        renderTonKhoTable([]);
    } finally {
        if (showLoader) showLoading(false);
    }
}

export const tonKhoTreeExpanded = new Set();
export const tonKhoTreeCollapsed = new Set();
export let isAllBranchesExpanded = true;

export function isTonKhoGroupOpen(maVt) {
    if (isAllBranchesExpanded) {
        return !tonKhoTreeCollapsed.has(maVt);
    } else {
        return tonKhoTreeExpanded.has(maVt);
    }
}

export function groupTonKhoByMaVT(data) {
    const groups = [];
    const groupMap = new Map();

    data.forEach(tk => {
        const maVt = tk.ma_vt || '(Chưa có mã)';
        if (!groupMap.has(maVt)) {
            const groupObj = {
                ma_vt: maVt,
                ten_vt: tk.ten_vt || '',
                nganh: tk.nganh || '',
                phu_trach: tk.phu_trach || '',
                items: [],
                ton_dau: 0,
                nhap: 0,
                xuat: 0,
                ton_cuoi: 0,
                ton_den_ngay: 0
            };
            groupMap.set(maVt, groupObj);
            groups.push(groupObj);
        }
        const g = groupMap.get(maVt);
        g.items.push(tk);
        g.ton_dau += (Number(tk.ton_dau) || 0);
        g.nhap += (Number(tk.nhap) || 0);
        g.xuat += (Number(tk.xuat) || 0);
        g.ton_cuoi += (Number(tk.ton_cuoi) || 0);
        if (tk.ton_den_ngay !== undefined) {
            g.ton_den_ngay += (Number(tk.ton_den_ngay) || 0);
        }
    });

    const state = viewStates['view-ton-kho'];
    const sortAsc = state ? state.sortAsc !== false : true;
    const isSortingTinhTrang = state && state.sortBy === 'tinh_trang';

    // 1. Sắp xếp các LOT con bên trong từng nhóm:
    // Mặc định (khi không ấn sắp xếp hoặc sắp xếp A-Z): date gần nằm TRÊN, date xa nằm DƯỚI CÙNG
    groups.forEach(g => {
        g.items.sort((a, b) => {
            if (isSortingTinhTrang) {
                return compareTonKhoTinhTrang(a.tinh_trang, b.tinh_trang, sortAsc);
            }
            // Mặc định trong nhánh: date gần lên trên, date xa xuống dưới cùng
            return compareTonKhoTinhTrang(a.tinh_trang, b.tinh_trang, true);
        });
    });

    if (isSortingTinhTrang) {
        // 2. Sắp xếp thứ tự các nhóm Mã VT theo trạng thái ưu tiên nhất của nhóm
        groups.sort((ga, gb) => {
            const minWeightA = ga.items.length > 0 ? Math.min(...ga.items.map(item => getTonKhoTinhTrangWeight(item.tinh_trang, sortAsc))) : 999;
            const minWeightB = gb.items.length > 0 ? Math.min(...gb.items.map(item => getTonKhoTinhTrangWeight(item.tinh_trang, sortAsc))) : 999;
            if (minWeightA !== minWeightB) return minWeightA - minWeightB;
            return (ga.ma_vt || '').localeCompare(gb.ma_vt || '');
        });
    }

    return groups;
}

function renderTonKhoTable(data) {
    const tkTableBody = document.getElementById('ton-kho-table-body') || document.querySelector('#view-ton-kho #ton-kho-table-body') || document.querySelector('#ton-kho-table tbody');
    if (!tkTableBody) {
        console.error("❌ Không tìm thấy phần tử #ton-kho-table-body trong DOM!");
        return;
    }

    const table = document.getElementById('ton-kho-table');
    if (table) {
        const thead = table.querySelector('thead');
        if (thead && thead.offsetHeight > 0) {
            table.style.setProperty('--thead-height', `${thead.offsetHeight}px`);
        }
    }

    const state = viewStates['view-ton-kho'];
    const hasDateTo = !!state.dateTo;
    const viewMode = state.viewMode || localStorage.getItem('tonKhoViewMode') || 'tree';
    state.viewMode = viewMode;
    
    // Cập nhật Header
    const dateToHeader = document.getElementById('ton-kho-col-date-to-header');
    const dateToHeaderText = document.getElementById('ton-kho-header-date-to-text');
    const dateToHeaderCount = document.getElementById('ton-kho-header-date-to-count');
    
    if (dateToHeader && dateToHeaderText) {
        dateToHeader.classList.toggle('hidden', !hasDateTo);
        if (hasDateTo) {
            const formattedDate = state.dateTo.split('-').reverse().join('/');
            dateToHeaderText.textContent = `(${formattedDate})`;
            
            (async () => {
                try {
                    const { data: summaryData } = await sb.rpc('get_chi_tiet_summary', {
                        _search_term: state.searchTerm || '',
                        _from_date: state.dateTo + 'T23:59:59',
                        _to_date: null,
                        _ma_kho_filter: [],
                        _ma_nx_filter: [],
                        _ma_vt_filter: state.filters.ma_vt || [],
                        _lot_filter: state.filters.lot || [],
                        _nganh_filter: state.filters.nganh || [],
                        _phu_trach_filter: state.filters.phu_trach || [],
                        _user_role: currentUser.phan_quyen,
                        _user_ho_ten: currentUser.ho_ten
                    });

                    let totalAdjNhap = 0;
                    let totalAdjXuat = 0;
                    if (summaryData && summaryData.length > 0) {
                        totalAdjNhap = summaryData[0].total_nhap || 0;
                        totalAdjXuat = summaryData[0].total_xuat || 0;
                    }

                    const cuoiText = document.getElementById('ton-kho-header-cuoi-count')?.textContent || '(0)';
                    const totalCuoi = parseInt(cuoiText.replace(/[^\d]/g, ''), 10) || 0;
                    
                    const globalTotalTonDenNgay = totalCuoi - totalAdjNhap + totalAdjXuat;
                    if (dateToHeaderCount) dateToHeaderCount.textContent = `(${(globalTotalTonDenNgay).toLocaleString()})`;
                } catch (err) {
                    console.error("Error calculating global ton_den_ngay:", err);
                    if (dateToHeaderCount) dateToHeaderCount.textContent = '(lỗi)';
                }
            })();
        } else {
            if (dateToHeaderCount) dateToHeaderCount.textContent = '';
        }
    }

    if (!data || data.length === 0) {
        const colSpan = hasDateTo ? 16 : 15;
        tkTableBody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center py-4 text-gray-500">Không có dữ liệu tồn kho</td></tr>`;
        applyTonKhoColumnOrder(document.getElementById('ton-kho-table'));
        applyTonKhoColumnState();
        return;
    }

    if (viewMode === 'tree') {
        const groups = groupTonKhoByMaVT(data);
        
        // Cập nhật trạng thái nút Thu gọn / Mở tất cả
        const toggleText = document.getElementById('ton-kho-toggle-all-text');
        const toggleIcon = document.getElementById('ton-kho-toggle-all-icon');
        if (toggleText) toggleText.textContent = isAllBranchesExpanded ? 'Thu gọn tất cả' : 'Mở tất cả';
        if (toggleIcon) toggleIcon.style.transform = isAllBranchesExpanded ? 'rotate(180deg)' : 'rotate(0deg)';

        let fullHtml = '';

        groups.forEach(g => {
            const isOpen = isTonKhoGroupOpen(g.ma_vt);
            const allItemsSelected = g.items.length > 0 && g.items.every(item => state.selected.has(item.ma_vach));
            const someItemsSelected = !allItemsSelected && g.items.some(item => state.selected.has(item.ma_vach));
            const tonCuoiGroupClass = g.ton_cuoi > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
            const tonDenNgayGroupHtml = hasDateTo ? `<td class="px-2 py-2 text-sm font-bold border border-gray-300 text-center bg-blue-50 text-blue-900" data-col="ton_den_ngay">${g.ton_den_ngay.toLocaleString()}</td>` : '';

            // 1. Group Header Row (Mã VT Chính - Nổi Bật & In Đậm)
            fullHtml += `
                <tr data-group-mavt="${g.ma_vt}" class="ton-kho-group-header cursor-pointer select-none bg-slate-200 hover:bg-slate-300 transition-colors">
                    <td class="px-1 py-2 border-t-2 border-b-2 border-gray-400 text-center" data-col="select">
                        <input type="checkbox" class="ton-kho-group-select cursor-pointer w-4 h-4 rounded" data-group-mavt="${g.ma_vt}" ${allItemsSelected ? 'checked' : ''} ${someItemsSelected ? 'data-indeterminate="true"' : ''}>
                    </td>
                    <td class="px-1.5 py-2 text-sm border-t-2 border-b-2 border-gray-400 text-left font-black" data-col="ma_vach">
                        <div class="flex items-center gap-1.5 ton-kho-group-toggle" data-group-mavt="${g.ma_vt}">
                            <span class="tree-chevron-icon ${isOpen ? 'is-open' : ''} text-teal-800 pointer-events-none">
                                <svg class="w-4 h-4 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
                            </span>
                            <span class="bg-teal-700 text-white text-[11px] px-2.5 py-0.5 rounded-full font-black shadow-sm tracking-wide whitespace-nowrap">${g.items.length} LOT</span>
                        </div>
                    </td>
                    <td class="px-2 py-2 text-sm border-t-2 border-b-2 border-gray-400 text-left font-black" data-col="ma_vt">
                        <div class="flex items-center justify-between group">
                            <span class="cursor-pointer text-blue-900 hover:underline ton-kho-view-details-btn font-black text-[13px] tracking-wide" data-ma-vt="${g.ma_vt}">${g.ma_vt}</span>
                            <div class="flex items-center">
                                <button class="ton-kho-copy-ma-vt-btn p-1 text-gray-500 hover:text-blue-700" data-ma-vt="${g.ma_vt}" title="Copy mã VT">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                            </div>
                        </div>
                    </td>
                    <td class="px-2 py-2 text-sm text-gray-950 font-black truncate border-t-2 border-b-2 border-gray-400 text-left" title="${g.ten_vt}" data-col="ten_vt">${g.ten_vt}</td>
                    <td class="px-1 py-2 text-xs text-gray-800 font-extrabold border-t-2 border-b-2 border-gray-400 text-center" data-col="lot">Tổng (${g.items.length} LOT)</td>
                    <td class="px-1 py-2 text-xs text-gray-400 border-t-2 border-b-2 border-gray-400 text-center font-bold" data-col="date">-</td>
                    <td class="px-2 py-2 text-sm font-black border-t-2 border-b-2 border-gray-400 text-center" style="color: #000000 !important;" data-col="ton_dau">${g.ton_dau.toLocaleString()}</td>
                    <td class="px-2 py-2 text-sm font-black border-t-2 border-b-2 border-gray-400 text-center" style="color: #16a34a !important;" data-col="nhap">${g.nhap.toLocaleString()}</td>
                    <td class="px-2 py-2 text-sm font-black border-t-2 border-b-2 border-gray-400 text-center" style="color: #dc2626 !important;" data-col="xuat">${g.xuat.toLocaleString()}</td>
                    <td class="px-2 py-2 text-sm border-t-2 border-b-2 border-gray-400 text-center font-black" style="color: ${g.ton_cuoi > 0 ? '#dc2626' : '#16a34a'} !important;" data-col="ton_cuoi">${g.ton_cuoi.toLocaleString()}</td>
                    ${hasDateTo ? `<td class="px-2 py-2 text-sm font-black border-t-2 border-b-2 border-gray-400 text-center" style="color: #1e40af !important;" data-col="ton_den_ngay">${g.ton_den_ngay.toLocaleString()}</td>` : ''}
                    <td class="px-1 py-2 border-t-2 border-b-2 border-gray-400 text-center text-xs text-gray-400 font-bold" data-col="tinh_trang">-</td>
                    <td class="px-1 py-2 text-xs text-gray-400 border-t-2 border-b-2 border-gray-400 text-center font-bold" data-col="tray">-</td>
                    <td class="ton-kho-col-nganh px-1 py-2 text-sm font-bold text-gray-800 border-t-2 border-b-2 border-gray-400 text-center" data-col="nganh">${g.nganh || ''}</td>
                    <td class="ton-kho-col-phu-trach px-1 py-2 text-sm font-bold text-gray-800 border-t-2 border-b-2 border-gray-400 text-center" data-col="phu_trach">${g.phu_trach || ''}</td>
                    <td class="px-1 py-2 border-t-2 border-b-2 border-gray-400 text-center text-xs text-gray-400 font-bold" data-col="note">-</td>
                </tr>
            `;

            // 2. Child Rows (Các nhánh LOT con)
            g.items.forEach(tk => {
                const isSelected = state.selected.has(tk.ma_vach);
                const tonCuoiClass = tk.ton_cuoi > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
                const tonDenNgayHtml = hasDateTo ? `<td class="px-2 py-2 text-sm border border-gray-300 text-center font-bold bg-blue-50 text-blue-800" data-col="ton_den_ngay">${tk.ton_den_ngay ?? 0}</td>` : '';
                
                const tinhTrangTextColor = getTonKhoTinhTrangTextColor(tk.tinh_trang);

                const noteHtml = tk.note ? `
                    <div class="group relative flex justify-center items-center h-full">
                        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                        <div class="absolute bottom-full right-full mb-2 mr-2 w-max max-w-xs scale-0 transform rounded bg-gray-800 p-2 text-sm text-white transition-all group-hover:scale-100 origin-bottom-right pointer-events-none z-20 whitespace-pre-wrap">
                            ${tk.note}
                        </div>
                    </div>
                ` : '';

                fullHtml += `
                    <tr data-id="${tk.ma_vach}" data-parent-mavt="${g.ma_vt}" class="ton-kho-child-row hover:bg-teal-50/50 ${isSelected ? 'bg-blue-100' : ''} ${isOpen ? '' : 'hidden'}">
                        <td class="px-1 py-2 border border-gray-300 text-center" data-col="select"><input type="checkbox" class="ton-kho-select-row cursor-pointer" data-id="${tk.ma_vach}" data-parent-mavt="${g.ma_vt}" ${isSelected ? 'checked' : ''}></td>
                        <td class="px-1 py-2 text-sm font-medium text-gray-900 border border-gray-300 text-left" data-col="ma_vach">
                            <div class="flex items-center pl-2">
                                <span class="tree-branch-icon">└──</span>
                                <span class="cursor-pointer text-blue-600 hover:underline ma-vach-cell font-mono font-medium">${tk.ma_vach}</span>
                            </div>
                        </td>
                        <td class="px-1 py-2 text-xs font-normal text-gray-500 border border-gray-300 text-left" data-col="ma_vt">
                            <div class="flex items-center justify-between group pl-2">
                                <span class="cursor-pointer hover:underline ton-kho-view-details-btn text-gray-600" data-ma-vt="${tk.ma_vt}">↳ ${tk.ma_vt}</span>
                                <div class="flex items-center">
                                    <button class="ton-kho-print-label-btn p-1 text-gray-400 hover:text-purple-600" data-ma-vach="${tk.ma_vach}" title="In nhãn">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                    </button>
                                </div>
                            </div>
                        </td>
                        <td class="px-2 py-2 text-xs text-gray-500 truncate border border-gray-300 text-left" title="${tk.ten_vt}" data-col="ten_vt">${tk.ten_vt}</td>
                        <td class="px-1 py-2 text-sm text-gray-700 border border-gray-300 text-center font-semibold" data-col="lot">
                            <div class="flex items-center justify-center group gap-1">
                                <span class="cursor-pointer text-blue-600 hover:underline ton-kho-view-lot-details-btn" data-ma-vt="${tk.ma_vt}" data-lot="${tk.lot || ''}">${tk.lot || ''}</span>
                                ${tk.lot ? `
                                <button class="ton-kho-copy-lot-btn p-1 text-gray-400 hover:text-blue-600" data-lot="${tk.lot}" title="Copy LOT">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                                ` : ''}
                            </div>
                        </td>
                        <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center" data-col="date">${tk.date || ''}</td>
                        <td class="px-2 py-2 text-sm text-black font-medium border border-gray-300 text-center" data-col="ton_dau">${tk.ton_dau}</td>
                        <td class="px-2 py-2 text-sm text-green-600 border border-gray-300 text-center" data-col="nhap">${tk.nhap}</td>
                        <td class="px-2 py-2 text-sm text-red-600 border border-gray-300 text-center" data-col="xuat">${tk.xuat}</td>
                        <td class="px-2 py-2 text-sm border border-gray-300 text-center ${tonCuoiClass}" data-col="ton_cuoi">${tk.ton_cuoi}</td>
                        ${tonDenNgayHtml}
                        <td class="px-1 py-2 border border-gray-300 text-center whitespace-nowrap text-xs ${tinhTrangTextColor}" data-col="tinh_trang">${tk.tinh_trang || ''}</td>
                        <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center" data-col="tray">${tk.tray || ''}</td>
                        <td class="ton-kho-col-nganh px-1 py-2 text-sm text-gray-500 border border-gray-300 text-center" data-col="nganh">${tk.nganh || ''}</td>
                        <td class="ton-kho-col-phu-trach px-1 py-2 text-sm text-gray-500 border border-gray-300 text-center" data-col="phu_trach">${tk.phu_trach || ''}</td>
                        <td class="px-1 py-2 border border-gray-300 text-center" data-col="note">${noteHtml}</td>
                    </tr>
                `;
            });
        });

        tkTableBody.innerHTML = fullHtml;

        // Apply indeterminate states to parent checkboxes
        tkTableBody.querySelectorAll('input.ton-kho-group-select[data-indeterminate="true"]').forEach(cb => {
            cb.indeterminate = true;
        });

    } else {
        // Flat List View
        const html = data.map(tk => {
            const isSelected = state.selected.has(tk.ma_vach);
            const tonCuoiClass = tk.ton_cuoi > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
            const tonDenNgayHtml = hasDateTo ? `<td class="px-2 py-2 text-sm border border-gray-300 text-center font-bold bg-blue-50 text-blue-800" data-col="ton_den_ngay">${tk.ton_den_ngay ?? 0}</td>` : '';
            
            const tinhTrangTextColor = getTonKhoTinhTrangTextColor(tk.tinh_trang);

            const noteHtml = tk.note ? `
                <div class="group relative flex justify-center items-center h-full">
                    <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    <div class="absolute bottom-full right-full mb-2 mr-2 w-max max-w-xs scale-0 transform rounded bg-gray-800 p-2 text-sm text-white transition-all group-hover:scale-100 origin-bottom-right pointer-events-none z-20 whitespace-pre-wrap">
                        ${tk.note}
                    </div>
                </div>
            ` : '';
            
            return `
                <tr data-id="${tk.ma_vach}" class="hover:bg-gray-50 ${isSelected ? 'bg-blue-100' : ''}">
                    <td class="px-1 py-2 border border-gray-300 text-center" data-col="select"><input type="checkbox" class="ton-kho-select-row" data-id="${tk.ma_vach}" ${isSelected ? 'checked' : ''}></td>
                    <td class="px-1 py-2 text-sm font-medium text-gray-900 border border-gray-300 text-left cursor-pointer text-blue-600 hover:underline ma-vach-cell" data-col="ma_vach">${tk.ma_vach}</td>
                    <td class="px-1 py-2 text-sm font-medium text-gray-900 border border-gray-300 text-left" data-col="ma_vt">
                        <div class="flex items-center justify-between group">
                            <span class="cursor-pointer text-blue-600 font-bold hover:underline ton-kho-view-details-btn" data-ma-vt="${tk.ma_vt}">${tk.ma_vt}</span>
                            <div class="flex items-center">
                                <button class="ton-kho-print-label-btn p-1 text-gray-400 hover:text-purple-600" data-ma-vach="${tk.ma_vach}" title="In nhãn">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                                </button>
                                <button class="ton-kho-copy-ma-vt-btn p-1 text-gray-400 hover:text-blue-600" data-ma-vt="${tk.ma_vt}" title="Copy mã">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                </button>
                            </div>
                        </div>
                    </td>
                    <td class="px-2 py-2 text-sm text-gray-700 truncate border border-gray-300 text-left" title="${tk.ten_vt}" data-col="ten_vt">${tk.ten_vt}</td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center" data-col="lot">
                        <div class="flex items-center justify-center group gap-1">
                            <span class="cursor-pointer text-blue-600 hover:underline ton-kho-view-lot-details-btn" data-ma-vt="${tk.ma_vt}" data-lot="${tk.lot || ''}">${tk.lot || ''}</span>
                            ${tk.lot ? `
                            <button class="ton-kho-copy-lot-btn p-1 text-gray-400 hover:text-blue-600" data-lot="${tk.lot}" title="Copy LOT">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                            ` : ''}
                        </div>
                    </td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center" data-col="date">${tk.date || ''}</td>
                    <td class="px-2 py-2 text-sm text-black font-bold border border-gray-300 text-center" data-col="ton_dau">${tk.ton_dau}</td>
                    <td class="px-2 py-2 text-sm text-green-600 border border-gray-300 text-center" data-col="nhap">${tk.nhap}</td>
                    <td class="px-2 py-2 text-sm text-red-600 border border-gray-300 text-center" data-col="xuat">${tk.xuat}</td>
                    <td class="px-2 py-2 text-sm border border-gray-300 text-center ${tonCuoiClass}" data-col="ton_cuoi">${tk.ton_cuoi}</td>
                    ${tonDenNgayHtml}
                    <td class="px-1 py-2 border border-gray-300 text-center whitespace-nowrap text-xs ${tinhTrangTextColor}" data-col="tinh_trang">${tk.tinh_trang || ''}</td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center" data-col="tray">${tk.tray || ''}</td>
                    <td class="ton-kho-col-nganh px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center" data-col="nganh">${tk.nganh || ''}</td>
                    <td class="ton-kho-col-phu-trach px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center" data-col="phu_trach">${tk.phu_trach || ''}</td>
                    <td class="px-1 py-2 border border-gray-300 text-center" data-col="note">${noteHtml}</td>
                </tr>
            `;
        }).join('');
        tkTableBody.innerHTML = html;
    }

    applyTonKhoColumnOrder(document.getElementById('ton-kho-table'));
    applyTonKhoColumnState();
}

function updateTonKhoSelectionInfo() {
    const state = viewStates['view-ton-kho'];
    const selectedCount = state.selected.size;
    const totalCount = state.totalFilteredCount;
    const selectionText = `${selectedCount} / ${totalCount} hàng được chọn`;
    
    const selectionInfoEl = document.getElementById('ton-kho-selection-info');
    if (selectionInfoEl) {
        selectionInfoEl.textContent = selectionText;
    }
}

function updateTonKhoActionButtonsState() {
    const selectedCount = viewStates['view-ton-kho'].selected.size;
    document.getElementById('ton-kho-btn-edit').disabled = selectedCount !== 1;
    document.getElementById('ton-kho-btn-delete').disabled = selectedCount === 0;
}

async function openTonKhoModal(tk = null, mode = 'add') {
    const modal = document.getElementById('ton-kho-modal');
    const form = document.getElementById('ton-kho-form');
    form.reset();
    document.getElementById('ton-kho-modal-date').classList.remove('border-red-500');

    if (cache.sanPhamList.length === 0) await fetchSanPham(1, false);
    
    const isViewMode = mode === 'view';
    form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = isViewMode);

    document.getElementById('save-ton-kho-btn').classList.toggle('hidden', isViewMode);
    document.getElementById('cancel-ton-kho-btn').classList.toggle('hidden', isViewMode);
    document.getElementById('close-ton-kho-view-btn').classList.toggle('hidden', !isViewMode);
    document.getElementById('ton-kho-modal-ma-vach-display-container').classList.toggle('hidden', mode === 'edit');
    
    const maVachStatusEl = document.getElementById('ton-kho-modal-ma-vach-status');
    maVachStatusEl.textContent = '';

    if (mode === 'add') {
        document.getElementById('ton-kho-modal-title').textContent = 'Thêm Tồn Kho Mới';
        document.getElementById('ton-kho-edit-mode-ma-vach').value = '';
        updateGeneratedMaVach();
        updateTinhTrangField(); 
    } else { 
        document.getElementById('ton-kho-modal-title').textContent = isViewMode ? 'Xem Chi Tiết Tồn Kho' : 'Sửa Tồn Kho';
        document.getElementById('ton-kho-edit-mode-ma-vach').value = tk.ma_vach;
        Object.keys(tk).forEach(key => {
            const input = document.getElementById(`ton-kho-modal-${key.replace(/_/g, '-')}`);
            if (input) input.value = tk[key] || '';
        });
        updateTinhTrangField(); 
        document.getElementById('ton-kho-modal-tinh-trang').value = tk.tinh_trang;
    }

    modal.classList.remove('hidden');
}

async function handleSaveTonKho(e) {
    e.preventDefault();
    const ma_vach_orig = document.getElementById('ton-kho-edit-mode-ma-vach').value;
    const isEdit = !!ma_vach_orig;
    
    const tonKhoData = {
        ma_vach: document.getElementById('ton-kho-modal-ma-vach').value.trim(),
        ma_vt: document.getElementById('ton-kho-modal-ma-vt').value.trim(),
        ten_vt: document.getElementById('ton-kho-modal-ten-vt').value.trim(),
        lot: document.getElementById('ton-kho-modal-lot').value.trim(),
        date: document.getElementById('ton-kho-modal-date').value.trim(),
        ton_dau: parseInt(document.getElementById('ton-kho-modal-ton-dau').value, 10) || 0,
        nhap: parseInt(document.getElementById('ton-kho-modal-nhap').value, 10) || 0,
        xuat: parseInt(document.getElementById('ton-kho-modal-xuat').value, 10) || 0,
        tinh_trang: document.getElementById('ton-kho-modal-tinh-trang').value.trim(),
        tray: document.getElementById('ton-kho-modal-tray').value.trim(),
        nganh: document.getElementById('ton-kho-modal-nganh').value.trim(),
        phu_trach: document.getElementById('ton-kho-modal-phu-trach').value.trim(),
        note: document.getElementById('ton-kho-modal-note').value.trim(),
    };

    if (!tonKhoData.ma_vt || !tonKhoData.ten_vt || !tonKhoData.tinh_trang || tonKhoData.ton_dau === null) {
        showToast("Mã VT, Tên VT, Tình Trạng và Tồn Đầu là bắt buộc.", 'error');
        return;
    }
     if (!isEdit && !tonKhoData.ma_vach) {
        showToast("Mã vạch không được để trống.", 'error');
        return;
    }

    showLoading(true);
    try {
        const { error } = isEdit
            ? await sb.from('ton_kho').update(tonKhoData).eq('ma_vach', ma_vach_orig)
            : await sb.from('ton_kho').insert(tonKhoData);

        if (error) throw error;
        showToast(`Lưu tồn kho thành công!`, 'success');
        document.getElementById('ton-kho-modal').classList.add('hidden');
        fetchTonKho(viewStates['view-ton-kho'].currentPage, false);
    } catch (error) {
        if (error.code === '23505') showToast(`Mã vạch "${tonKhoData.ma_vach}" đã tồn tại.`, 'error');
        else showToast(`Lỗi: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

async function handleDeleteMultipleTonKho() {
    const selectedIds = [...viewStates['view-ton-kho'].selected];
    if (selectedIds.length === 0) return;

    showLoading(true);
    try {
        const { count, error: checkError } = await sb
            .from('chi_tiet')
            .select('ma_vach', { count: 'exact', head: true })
            .in('ma_vach', selectedIds);

        if (checkError) throw checkError;

        if (count > 0) {
            showToast('Không thể xóa. Một hoặc nhiều mã tồn kho đã có giao dịch Nhập/Xuất.', 'error');
            return; 
        }
        
        showLoading(false); 
        const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selectedIds.length} mục tồn kho?`);
        if (!confirmed) return;

        showLoading(true); 
        const { error } = await sb.from('ton_kho').delete().in('ma_vach', selectedIds);
        if (error) throw error;
        showToast(`Đã xóa ${selectedIds.length} mục.`, 'success');
        fetchTonKho(1, false);

    } catch (error) {
        showToast(`Lỗi khi xóa: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

async function handleTonKhoExcelExport() {
    const modal = document.getElementById('excel-export-modal');
    modal.classList.remove('hidden');

    const exportAndClose = async (exportAll) => {
        modal.classList.add('hidden');
        showLoading(true);
        try {
            const state = viewStates['view-ton-kho'];
            const query = exportAll ? sb.from('ton_kho_update').select('*') : buildTonKhoQuery().select('*');
            const { data, error } = await query.order('ma_vach').limit(50000);
            
            if (error) throw error;
            if (!data || data.length === 0) {
                showToast("Không có dữ liệu để xuất.", 'info');
                return;
            }

            const dateTo = state.dateTo;
            const formattedDateHeader = dateTo ? dateTo.split('-').reverse().join('/') : new Date().toLocaleDateString('vi-VN');
            const dateSuffix = dateTo ? dateTo.split('-').reverse().join('_') : new Date().toISOString().slice(0, 10).split('-').reverse().join('_');

            // Nếu có lọc ngày, cần tính toán tồn tại ngày đó
            let finalData = data;
            if (dateTo) {
                const { data: transData, error: transError } = await sb
                    .from('chi_tiet')
                    .select('ma_vach, nhap, xuat')
                    .gt('thoi_gian', dateTo + 'T23:59:59');
                
                if (!transError && transData) {
                    const transMap = {};
                    transData.forEach(tr => {
                        if (!transMap[tr.ma_vach]) transMap[tr.ma_vach] = { nhap: 0, xuat: 0 };
                        transMap[tr.ma_vach].nhap += (tr.nhap || 0);
                        transMap[tr.ma_vach].xuat += (tr.xuat || 0);
                    });

                    finalData = data.map(item => {
                        const adj = transMap[item.ma_vach] || { nhap: 0, xuat: 0 };
                        const tonDenNgay = (item.ton_cuoi || 0) - adj.nhap + adj.xuat;
                        const newItem = { ...item };
                        newItem[`Tồn đến (${formattedDateHeader})`] = tonDenNgay;
                        return newItem;
                    });
                }
            } else {
                // Nếu không có ngày lọc, vẫn thêm cột "Tồn đến (Ngày hiện tại)" là chính số tồn cuối
                finalData = data.map(item => {
                    const newItem = { ...item };
                    newItem[`Tồn đến (${formattedDateHeader})`] = item.ton_cuoi || 0;
                    return newItem;
                });
            }

            const worksheet = XLSX.utils.json_to_sheet(finalData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "TonKho");

            // Xây dựng tên file
            let filename = `TonKho_${dateSuffix}`;
            if (!exportAll) {
                const f = state.filters;
                let suffix = "";
                if (state.searchTerm) suffix += `_${state.searchTerm}`;
                ['ma_vt', 'lot', 'nganh', 'phu_trach', 'tinh_trang'].forEach(k => {
                    if (f[k] && f[k].length > 0) suffix += `_${f[k].join('-')}`;
                });
                if (suffix) filename += suffix.substring(0, 150);
            }
            
            const safeFilename = filename.replace(/[^a-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\s\-_]/gi, '_');
            XLSX.writeFile(workbook, `${safeFilename}.xlsx`);
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

const TON_KHO_COLUMNS = [
    { key: 'select', label: 'Chọn (Checkbox)', default: true, locked: true },
    { key: 'ma_vach', label: 'Code + Lot + EXP', default: true },
    { key: 'ma_vt', label: 'Mã VT', default: true },
    { key: 'ten_vt', label: 'Tên VT', default: true },
    { key: 'lot', label: 'Lot', default: true },
    { key: 'date', label: 'Date', default: true },
    { key: 'ton_dau', label: 'Tồn Đầu', default: true },
    { key: 'nhap', label: 'Nhập', default: true },
    { key: 'xuat', label: 'Xuất', default: true },
    { key: 'ton_cuoi', label: 'Tồn Cuối', default: true },
    { key: 'tinh_trang', label: 'Tình Trạng', default: true },
    { key: 'tray', label: 'Tray', default: true },
    { key: 'nganh', label: 'Ngành', default: false },
    { key: 'phu_trach', label: 'Phụ Trách', default: false },
    { key: 'note', label: 'Ghi Chú', default: true }
];

export function getTonKhoColumnVisibility() {
    try {
        const stored = localStorage.getItem('tonKhoColumnVisibility');
        if (stored) {
            const parsed = JSON.parse(stored);
            const visibility = {};
            TON_KHO_COLUMNS.forEach(col => {
                visibility[col.key] = parsed[col.key] !== undefined ? parsed[col.key] : col.default;
            });
            return visibility;
        }
    } catch (e) {
        console.error("Error reading column visibility:", e);
    }
    const defaultVis = {};
    TON_KHO_COLUMNS.forEach(col => {
        defaultVis[col.key] = col.default;
    });
    return defaultVis;
}

export function saveTonKhoColumnVisibility(visibility) {
    try {
        localStorage.setItem('tonKhoColumnVisibility', JSON.stringify(visibility));
    } catch (e) {
        console.error("Error saving column visibility:", e);
    }
}

export function applyTonKhoColumnState() {
    const table = document.getElementById('ton-kho-table') || document.querySelector('#view-ton-kho table');
    if (!table) return;

    const visibility = getTonKhoColumnVisibility();

    TON_KHO_COLUMNS.forEach(col => {
        if (col.locked) return;
        const isVisible = visibility[col.key] !== false;
        const thElements = table.querySelectorAll(`th[data-col="${col.key}"]`);
        const tdElements = table.querySelectorAll(`td[data-col="${col.key}"]`);

        thElements.forEach(el => el.classList.toggle('hidden', !isVisible));
        tdElements.forEach(el => el.classList.toggle('hidden', !isVisible));
    });

    const btn = document.getElementById('ton-kho-toggle-cols');
    if (btn) btn.remove();
}

export function updateSortButtonUI() {
    const state = viewStates['view-ton-kho'];
    if (!state) return;
    const currentSort = state.sortBy || 'ma_vach';
    const isAsc = state.sortAsc !== false;

    const table = document.getElementById('ton-kho-table') || document.querySelector('#view-ton-kho table');
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

function initTonKhoColumnsModal() {
    const modal = document.getElementById('ton-kho-columns-modal');
    const openBtn = document.getElementById('ton-kho-btn-columns');
    const closeBtn = document.getElementById('ton-kho-columns-modal-close');
    const cancelBtn = document.getElementById('ton-kho-columns-cancel-btn');
    const applyBtn = document.getElementById('ton-kho-columns-apply-btn');
    const selectAllBtn = document.getElementById('ton-kho-columns-select-all');
    const resetDefaultBtn = document.getElementById('ton-kho-columns-reset-default');
    const listContainer = document.getElementById('ton-kho-columns-checkbox-list');

    if (!modal || !openBtn) return;

    const renderCheckboxes = (visibility) => {
        if (!listContainer) return;
        listContainer.innerHTML = TON_KHO_COLUMNS.filter(c => !c.locked).map(col => `
            <label class="flex items-center gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer border border-transparent hover:border-gray-200 transition-all select-none">
                <input type="checkbox" data-col-key="${col.key}" ${visibility[col.key] !== false ? 'checked' : ''} class="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer">
                <span class="font-medium text-gray-800">${col.label}</span>
            </label>
        `).join('');
    };

    openBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentVis = getTonKhoColumnVisibility();
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
            TON_KHO_COLUMNS.forEach(c => defaults[c.key] = c.default);
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
            TON_KHO_COLUMNS.filter(c => c.locked).forEach(c => {
                newVis[c.key] = true;
            });
            saveTonKhoColumnVisibility(newVis);
            applyTonKhoColumnState();
            closeModal();
            showToast('Đã lưu cấu hình cột hiển thị!', 'success');
        };
    }
}

export function getTonKhoColumnOrder() {
    const userKey = currentUser?.gmail || currentUser?.ho_ten || 'default';
    try {
        const stored = localStorage.getItem('tonKhoColOrder_' + userKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        console.error("Error reading col order:", e);
    }
    return null;
}

export function saveTonKhoColumnOrder(colOrder) {
    const userKey = currentUser?.gmail || currentUser?.ho_ten || 'default';
    try {
        localStorage.setItem('tonKhoColOrder_' + userKey, JSON.stringify(colOrder));
    } catch (e) {
        console.error("Error saving col order:", e);
    }
}

export function reorderTableBodyCells(table, colOrder) {
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

export function applyTonKhoColumnOrder(table) {
    if (!table) table = document.getElementById('ton-kho-table') || document.querySelector('#view-ton-kho table');
    if (!table) return;

    const colOrder = getTonKhoColumnOrder();
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

    reorderTableBodyCells(table, colOrder);
}

export function initSortableColumns(table) {
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
            saveTonKhoColumnOrder(colOrder);
            reorderTableBodyCells(table, colOrder);
            showToast('Đã lưu thứ tự cột cho tài khoản ' + (currentUser?.ho_ten || ''), 'success');
        }
    });
}

export function initTonKhoView() {
    const viewContainer = document.getElementById('view-ton-kho');
    const role = currentUser?.phan_quyen;
    const isAdminOrUser = role === 'Admin' || role === 'User';
    viewContainer.querySelectorAll('.tk-admin-only').forEach(el => el.classList.toggle('hidden', !isAdminOrUser));
    
    const table = document.getElementById('ton-kho-table');
    applyTonKhoColumnOrder(table);
    initTonKhoColumnsModal();
    applyTonKhoColumnState();
    updateSortButtonUI();
    initResizableTable(table, 'ton_kho_col_widths');
    initSortableColumns(table);

    const searchInput = document.getElementById('ton-kho-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            viewStates['view-ton-kho'].searchTerm = searchInput.value;
            updateFilterButtonTexts('ton-kho');
            fetchTonKho(1);
        }, 500));
    }
    
    if (viewContainer) {
        viewContainer.addEventListener('click', e => {
            const filterBtn = e.target.closest('.filter-btn');
            if (filterBtn) {
                e.stopPropagation();
                openTonKhoFilterPopover(filterBtn, 'view-ton-kho');
                return;
            }

            const sortBtn = e.target.closest('.sort-btn');
            if (sortBtn) {
                e.stopPropagation();
                const sortKey = sortBtn.dataset.sortKey;
                if (!sortKey) return;

                const state = viewStates['view-ton-kho'];
                if (state.sortBy === sortKey) {
                    if (state.sortAsc === true) {
                        state.sortAsc = false;
                    } else {
                        state.sortBy = 'ma_vach';
                        state.sortAsc = true;
                    }
                } else {
                    state.sortBy = sortKey;
                    state.sortAsc = true;
                }
                updateSortButtonUI();
                fetchTonKho(1);
                return;
            }
        });
    }

    const toggleAvailableBtn = document.getElementById('ton-kho-toggle-available');
    const toggleAllBtn = document.getElementById('ton-kho-toggle-all');
    const state = viewStates['view-ton-kho'];

    const handleToggleClick = (e) => {
        const mode = e.currentTarget.dataset.stockMode;
        if (state.stockAvailability !== mode) {
            state.stockAvailability = mode;
            sessionStorage.setItem('tonKhoStockAvailability', mode);
            updateTonKhoToggleUI();
            fetchTonKho(1);
        }
    };
    
    if (toggleAvailableBtn) toggleAvailableBtn.addEventListener('click', handleToggleClick);
    if (toggleAllBtn) toggleAllBtn.addEventListener('click', handleToggleClick);
    
    state.stockAvailability = sessionStorage.getItem('tonKhoStockAvailability') || 'available';
    updateTonKhoToggleUI();

    // --- TREE VIEW (NHÁNH LOT) CONTROLS ---
    function updateTonKhoViewModeUI() {
        const mode = state.viewMode || localStorage.getItem('tonKhoViewMode') || 'tree';
        state.viewMode = mode;
        const btnTree = document.getElementById('ton-kho-mode-tree');
        const btnFlat = document.getElementById('ton-kho-mode-flat');
        const btnToggleAll = document.getElementById('ton-kho-btn-toggle-all-branches');

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

    const btnModeTree = document.getElementById('ton-kho-mode-tree');
    if (btnModeTree) {
        btnModeTree.addEventListener('click', () => {
            if (state.viewMode !== 'tree') {
                state.viewMode = 'tree';
                localStorage.setItem('tonKhoViewMode', 'tree');
                updateTonKhoViewModeUI();
                renderTonKhoTable(cache.tonKhoList || []);
            }
        });
    }

    const btnModeFlat = document.getElementById('ton-kho-mode-flat');
    if (btnModeFlat) {
        btnModeFlat.addEventListener('click', () => {
            if (state.viewMode !== 'flat') {
                state.viewMode = 'flat';
                localStorage.setItem('tonKhoViewMode', 'flat');
                updateTonKhoViewModeUI();
                renderTonKhoTable(cache.tonKhoList || []);
            }
        });
    }

    const btnToggleAllBranches = document.getElementById('ton-kho-btn-toggle-all-branches');
    if (btnToggleAllBranches) {
        btnToggleAllBranches.addEventListener('click', () => {
            isAllBranchesExpanded = !isAllBranchesExpanded;
            tonKhoTreeExpanded.clear();
            tonKhoTreeCollapsed.clear();

            const allChildRows = document.querySelectorAll('tr.ton-kho-child-row');
            const allChevronIcons = document.querySelectorAll('.tree-chevron-icon');
            const toggleText = document.getElementById('ton-kho-toggle-all-text');
            const toggleIcon = document.getElementById('ton-kho-toggle-all-icon');

            if (isAllBranchesExpanded) {
                allChildRows.forEach(r => r.classList.remove('hidden'));
                allChevronIcons.forEach(icon => icon.classList.add('is-open'));
                if (toggleText) toggleText.textContent = 'Thu gọn tất cả';
                if (toggleIcon) toggleIcon.style.transform = 'rotate(180deg)';
            } else {
                allChildRows.forEach(r => r.classList.add('hidden'));
                allChevronIcons.forEach(icon => icon.classList.remove('is-open'));
                if (toggleText) toggleText.textContent = 'Mở tất cả';
                if (toggleIcon) toggleIcon.style.transform = 'rotate(0deg)';
            }
        });
    }

    updateTonKhoViewModeUI();
    // --- END TREE VIEW CONTROLS ---

    const resetFiltersBtn = document.getElementById('ton-kho-reset-filters');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            const searchInput = document.getElementById('ton-kho-search');
            if (searchInput) searchInput.value = '';
            state.searchTerm = '';
            state.filters = { ma_vach: [], ma_vt: [], ten_vt: [], lot: [], date: [], ton_dau: [], nhap: [], xuat: [], ton_cuoi: [], tinh_trang: [], tray: [], nganh: [], phu_trach: [], note: [] };
            updateFilterButtonTexts('ton-kho');
            const dateToInput = document.getElementById('ton-kho-date-to');
            if (dateToInput) dateToInput.value = '';
            state.dateTo = '';
            
            state.stockAvailability = 'available';
            sessionStorage.setItem('tonKhoStockAvailability', 'available');
            updateTonKhoToggleUI();
            fetchTonKho(1);
        });
    }

    const dateToInput = document.getElementById('ton-kho-date-to');
    if (dateToInput) {
        dateToInput.addEventListener('change', (e) => {
            viewStates['view-ton-kho'].dateTo = e.target.value;
            fetchTonKho(1);
        });
    }

    const tableBody = document.getElementById('ton-kho-table-body');
    if (tableBody) {
        tableBody.addEventListener('click', async e => {
            // 1. Group Select Checkbox
            const groupSelectCb = e.target.closest('.ton-kho-group-select');
            if (groupSelectCb) {
                e.stopPropagation();
                const maVt = groupSelectCb.dataset.groupMavt;
                const isChecked = groupSelectCb.checked;
                const childRows = tableBody.querySelectorAll(`tr.ton-kho-child-row[data-parent-mavt="${CSS.escape(maVt)}"]`);
                childRows.forEach(row => {
                    const rowId = row.dataset.id;
                    const cb = row.querySelector('.ton-kho-select-row');
                    if (cb) cb.checked = isChecked;
                    row.classList.toggle('bg-blue-100', isChecked);
                    if (isChecked) {
                        state.selected.add(rowId);
                    } else {
                        state.selected.delete(rowId);
                    }
                });
                groupSelectCb.indeterminate = false;
                updateTonKhoActionButtonsState();
                updateTonKhoSelectionInfo();
                return;
            }

            // 2. Group Expand / Collapse Toggle
            const groupRow = e.target.closest('.ton-kho-group-header');
            if (groupRow && (e.target.closest('.ton-kho-group-toggle') || e.target.closest('td[data-col="ma_vach"]') || (!e.target.closest('button') && !e.target.closest('a') && !e.target.closest('input')))) {
                e.stopPropagation();
                const maVt = groupRow.dataset.groupMavt;
                if (!maVt) return;

                const isOpen = isTonKhoGroupOpen(maVt);
                const chevron = groupRow.querySelector('.tree-chevron-icon');
                const childRows = tableBody.querySelectorAll(`tr.ton-kho-child-row[data-parent-mavt="${CSS.escape(maVt)}"]`);

                if (isOpen) {
                    if (isAllBranchesExpanded) {
                        tonKhoTreeCollapsed.add(maVt);
                    } else {
                        tonKhoTreeExpanded.delete(maVt);
                    }
                    if (chevron) chevron.classList.remove('is-open');
                    childRows.forEach(r => r.classList.add('hidden'));
                } else {
                    if (isAllBranchesExpanded) {
                        tonKhoTreeCollapsed.delete(maVt);
                    } else {
                        tonKhoTreeExpanded.add(maVt);
                    }
                    if (chevron) chevron.classList.add('is-open');
                    childRows.forEach(r => r.classList.remove('hidden'));
                }
                return;
            }

            // Copy Mã VT
            const copyBtn = e.target.closest('.ton-kho-copy-ma-vt-btn');
            if (copyBtn) {
                e.stopPropagation();
                const maVt = copyBtn.dataset.maVt;
                navigator.clipboard.writeText(maVt).then(() => {
                    showToast(`Đã copy mã VT: ${maVt}`, 'success');
                });
                return;
            }

            // Copy LOT
            const copyLotBtn = e.target.closest('.ton-kho-copy-lot-btn');
            if (copyLotBtn) {
                e.stopPropagation();
                const lot = copyLotBtn.dataset.lot;
                navigator.clipboard.writeText(lot).then(() => {
                    showToast(`Đã copy LOT: ${lot}`, 'success');
                });
                return;
            }

            // Xem thẻ kho (Cửa sổ Chi Tiết -> Lọc Mã VT)
            const viewDetailsBtn = e.target.closest('.ton-kho-view-details-btn');
            if (viewDetailsBtn) {
                e.stopPropagation();
                const ma_vt = viewDetailsBtn.dataset.maVt;
                if (!ma_vt) return;

                const chiTietState = viewStates['view-chi-tiet'];
                chiTietState.searchTerm = '';
                chiTietState.currentPage = 1;
                chiTietState.filters = { from_date: '', to_date: '', ma_kho: [], ma_nx: [], ma_vt: [ma_vt], lot: [], nganh: [], phu_trach: [] };
                
                await showView('view-chi-tiet');
                updateFilterButtonTexts('chi-tiet');
                fetchChiTiet(1);
                return;
            }

            // Xem chi tiết LOT (Cửa sổ Chi Tiết -> Lọc Mã VT + LOT)
            const viewLotDetailsBtn = e.target.closest('.ton-kho-view-lot-details-btn');
            if (viewLotDetailsBtn) {
                e.stopPropagation();
                const ma_vt = viewLotDetailsBtn.dataset.maVt;
                const lot = viewLotDetailsBtn.dataset.lot;
                if (!ma_vt) return;

                const chiTietState = viewStates['view-chi-tiet'];
                chiTietState.searchTerm = '';
                chiTietState.currentPage = 1;
                chiTietState.filters = { 
                    from_date: '', to_date: '', ma_kho: [], ma_nx: [], 
                    ma_vt: [ma_vt], 
                    lot: lot ? [lot] : [], 
                    nganh: [], phu_trach: [] 
                };
                
                await showView('view-chi-tiet');
                updateFilterButtonTexts('chi-tiet');
                fetchChiTiet(1);
                return;
            }

            // In nhãn tồn kho
            const printBtn = e.target.closest('.ton-kho-print-label-btn');
            if (printBtn) {
                e.stopPropagation();
                handleTonKhoPrintIndividual(printBtn.dataset.maVach);
                return;
            }

            const row = e.target.closest('tr');
            if (!row || !row.dataset.id) return;
            const id = row.dataset.id;
            
            if (e.target.closest('.ma-vach-cell')) {
                const { data } = await sb.from('ton_kho').select('*').eq('ma_vach', id).single();
                if(data) openTonKhoModal(data, 'view');
                return;
            }

            const checkbox = row.querySelector('.ton-kho-select-row');
            if (checkbox) {
                if (e.target.type !== 'checkbox') {
                    checkbox.checked = !checkbox.checked;
                }
                
                viewStates['view-ton-kho'].selected[checkbox.checked ? 'add' : 'delete'](id);
                row.classList.toggle('bg-blue-100', checkbox.checked);

                // Update parent group checkbox state if in tree mode
                const parentMavt = row.dataset.parentMavt;
                if (parentMavt) {
                    const parentGroupRow = tableBody.querySelector(`tr.ton-kho-group-header[data-group-mavt="${CSS.escape(parentMavt)}"]`);
                    const parentCb = parentGroupRow?.querySelector('.ton-kho-group-select');
                    if (parentCb) {
                        const siblingRows = tableBody.querySelectorAll(`tr.ton-kho-child-row[data-parent-mavt="${CSS.escape(parentMavt)}"]`);
                        const allChecked = Array.from(siblingRows).every(r => r.querySelector('.ton-kho-select-row')?.checked);
                        const someChecked = !allChecked && Array.from(siblingRows).some(r => r.querySelector('.ton-kho-select-row')?.checked);
                        parentCb.checked = allChecked;
                        parentCb.indeterminate = someChecked;
                    }
                }

                updateTonKhoActionButtonsState();
                updateTonKhoSelectionInfo();
            }
        });
    }

    const selectAllCb = document.getElementById('ton-kho-select-all');
    if (selectAllCb) {
        selectAllCb.addEventListener('click', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.ton-kho-select-row').forEach(cb => {
            if(cb.checked !== isChecked) {
                 const row = cb.closest('tr');
                 const id = row.dataset.id;
                 viewStates['view-ton-kho'].selected[isChecked ? 'add' : 'delete'](id);
                 row.classList.toggle('bg-blue-100', isChecked);
                 cb.checked = isChecked;
            }
        });
        document.querySelectorAll('.ton-kho-group-select').forEach(cb => {
            cb.checked = isChecked;
            cb.indeterminate = false;
        });
        updateTonKhoActionButtonsState();
        updateTonKhoSelectionInfo();
    });
    }
    
    const btnAdd = document.getElementById('ton-kho-btn-add');
    if (btnAdd) btnAdd.addEventListener('click', () => openTonKhoModal(null, 'add'));
    
    const btnEdit = document.getElementById('ton-kho-btn-edit');
    if (btnEdit) {
        btnEdit.addEventListener('click', async () => {
            const ma_vach = [...viewStates['view-ton-kho'].selected][0];
            const { data } = await sb.from('ton_kho').select('*').eq('ma_vach', ma_vach).single();
            if(data) openTonKhoModal(data, 'edit');
        });
    }

    const btnDelete = document.getElementById('ton-kho-btn-delete');
    if (btnDelete) btnDelete.addEventListener('click', handleDeleteMultipleTonKho);

    const btnExcel = document.getElementById('ton-kho-btn-excel');
    if (btnExcel) btnExcel.addEventListener('click', handleTonKhoExcelExport);

    const formTonKho = document.getElementById('ton-kho-form');
    if (formTonKho) formTonKho.addEventListener('submit', handleSaveTonKho);
    
    const closeModal = () => {
        const modal = document.getElementById('ton-kho-modal');
        if(modal) modal.classList.add('hidden');
    };
    
    const cancelBtn = document.getElementById('cancel-ton-kho-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    const closeViewBtn = document.getElementById('close-ton-kho-view-btn');
    if (closeViewBtn) closeViewBtn.addEventListener('click', closeModal);
    
    const tkModalMaVt = document.getElementById('ton-kho-modal-ma-vt');
    if (tkModalMaVt) {
        async function autoFillSanPhamFields(selectedMaVt) {
            if (!selectedMaVt) return;
            let sanPham = sanPhamLookupCache.get(selectedMaVt);
            if (!sanPham) {
                const { data } = await sb.from('san_pham')
                    .select('ma_vt, ten_vt, nganh, phu_trach')
                    .eq('ma_vt', selectedMaVt)
                    .maybeSingle();
                if (data) {
                    sanPham = data;
                    sanPhamLookupCache.set(selectedMaVt, data);
                }
            }

            const tenVtInput = document.getElementById('ton-kho-modal-ten-vt');
            const nganhInput = document.getElementById('ton-kho-modal-nganh');
            const phuTrachInput = document.getElementById('ton-kho-modal-phu-trach');
            
            if (tenVtInput) tenVtInput.value = sanPham?.ten_vt || '';
            if (nganhInput) nganhInput.value = sanPham?.nganh || '';
            if (phuTrachInput) phuTrachInput.value = sanPham?.phu_trach || '';
            updateGeneratedMaVach();
        }

        const handleMaVtInput = async () => {
            const inputValue = tkModalMaVt.value.trim();
            let query = sb.from('san_pham').select('ma_vt, ten_vt, nganh, phu_trach');
            
            if (inputValue) {
                query = query.or(`ma_vt.ilike.%${inputValue}%,ten_vt.ilike.%${inputValue}%`);
            }
            
            query = query.order('ma_vt', { ascending: true }).limit(50);
            
            const { data, error } = await query;
            if (error) {
                console.error("Lỗi tìm kiếm sản phẩm:", error);
                return;
            }

            if (data) {
                data.forEach(p => {
                    sanPhamLookupCache.set(p.ma_vt, p);
                });
            }

            openAutocomplete(tkModalMaVt, data || [], {
                valueKey: 'ma_vt',
                primaryTextKey: 'ma_vt',
                secondaryTextKey: 'ten_vt',
                width: '450px',
                onSelect: async (selectedValue) => {
                    tkModalMaVt.value = selectedValue;
                    await autoFillSanPhamFields(selectedValue);
                }
            });
        };
        
        tkModalMaVt.addEventListener('focus', handleMaVtInput);
        tkModalMaVt.addEventListener('input', debounce(handleMaVtInput, 200)); 
        
        tkModalMaVt.addEventListener('change', () => { 
            autoFillSanPhamFields(tkModalMaVt.value.trim());
        });
    }

    const lotInput = document.getElementById('ton-kho-modal-lot');
    if (lotInput) lotInput.addEventListener('input', updateGeneratedMaVach);

    const dateInput = document.getElementById('ton-kho-modal-date');
    if (dateInput) {
        dateInput.addEventListener('input', updateGeneratedMaVach);
        dateInput.addEventListener('change', (e) => {
            const input = e.target;
            const dateValue = parseDate(input.value);
            if (input.value && !dateValue) {
                showToast('Ngày không hợp lệ. Vui lòng nhập đúng dd/mm/yyyy.', 'error');
                input.classList.add('border-red-500');
                input.value = '';
                updateGeneratedMaVach();
            } else {
                input.classList.remove('border-red-500');
            }
            updateTinhTrangField();
        });
    }

    const itemsPerPageSelect = document.getElementById('ton-kho-items-per-page');
    if (itemsPerPageSelect) {
        itemsPerPageSelect.addEventListener('change', (e) => {
            viewStates['view-ton-kho'].itemsPerPage = parseInt(e.target.value, 10);
            fetchTonKho(1);
        });
    }

    const prevPageBtn = document.getElementById('ton-kho-prev-page');
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => fetchTonKho(viewStates['view-ton-kho'].currentPage - 1));

    const nextPageBtn = document.getElementById('ton-kho-next-page');
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => fetchTonKho(viewStates['view-ton-kho'].currentPage + 1));
    
    const pageInput = document.getElementById('ton-kho-page-input');
    if (pageInput) {
        const handlePageJump = () => {
            const state = viewStates['view-ton-kho'];
            let targetPage = parseInt(pageInput.value, 10);
            const totalPages = Math.ceil(state.totalFilteredCount / state.itemsPerPage);

            if (isNaN(targetPage) || targetPage < 1) targetPage = 1;
            else if (targetPage > totalPages && totalPages > 0) targetPage = totalPages;
            else if (totalPages === 0) targetPage = 1;
            
            pageInput.value = targetPage;
            if (targetPage !== state.currentPage) fetchTonKho(targetPage);
        };
        pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handlePageJump(); e.target.blur(); }
        });
        pageInput.addEventListener('change', handlePageJump);
    }
}

async function handleTonKhoPrintIndividual(maVach) {
    const tk = cache.tonKhoList.find(t => t.ma_vach === maVach);
    if (!tk) return;

    const modal = document.getElementById('ton-kho-print-modal');
    const qtyInput = document.getElementById('ton-kho-print-custom-qty');
    const allBtn = document.getElementById('ton-kho-print-all-btn');
    const customBtn = document.getElementById('ton-kho-print-custom-btn');
    const cancelBtn = document.getElementById('ton-kho-print-cancel-btn');

    qtyInput.value = tk.ton_cuoi;
    modal.classList.remove('hidden');
    setTimeout(() => qtyInput.select(), 100);

    const doPrint = (qty) => {
        modal.classList.add('hidden');
        printSingleTonKhoLabel(tk, qty);
    };

    allBtn.onclick = () => doPrint(tk.ton_cuoi);
    customBtn.onclick = () => doPrint(qtyInput.value);
    qtyInput.onkeydown = (e) => { if (e.key === 'Enter') doPrint(qtyInput.value); };
    cancelBtn.onclick = () => modal.classList.add('hidden');
}

function printSingleTonKhoLabel(tk, sl) {
    const labelArea = document.getElementById('label-area');
    if (!labelArea) return;

    const logoUrl = "https://mondialbrand.com/wp-content/uploads/2024/01/Mau_thiet_ke_logo_thuong_hieu_cong_ty_JOHNSON-JOHNSON-3.jpg";
    const pad = (n) => n.toString().padStart(2, '0');
    const d = new Date();
    const formattedPrintTime = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

    const ma_vt_len = (tk.ma_vt || '').length;
    const maVtFontSize = Math.min(36, Math.max(14, Math.floor(280 / ma_vt_len)));

    labelArea.innerHTML = `
        <div class="label-item">
            <div class="absolute inset-0 border border-black z-50 pointer-events-none"></div>
            
            <img src="${logoUrl}" class="absolute -top-4 left-1.5 w-40 h-auto object-contain z-0" alt="Logo">
            
            <div class="relative z-10 h-full flex flex-col">
                <div class="flex justify-between items-start border-b border-black pb-1 mb-2">
                    <div class="flex flex-col flex-grow overflow-hidden">
                        <div class="h-10 w-full"></div> 
                        <span class="font-black tracking-tight leading-none whitespace-nowrap text-black" style="font-size: ${maVtFontSize}px;">${tk.ma_vt}</span>
                    </div>
                    <div class="text-right text-xs leading-tight min-w-[50px] mt-1 bg-white uppercase">
                        <div>SL: <span class="font-bold text-base text-black">${sl}</span></div>
                        <div class="flex items-center justify-end gap-1 mt-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
                            </svg>
                            <span class="font-bold text-sm text-black">${tk.tray || ''}</span>
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 font-bold mb-2 pb-1 border-b border-black border-dashed text-black">
                    <div class="text-left whitespace-nowrap overflow-hidden text-ellipsis pr-1 text-lg">LOT: ${tk.lot || ''}</div>
                    <div class="text-right whitespace-nowrap overflow-hidden text-ellipsis pl-1 text-xs mt-1">DATE: ${tk.date || ''}</div>
                </div>
                
                <!-- Ô Tên vật tư: Giảm xuống h-6 (~1.1-1.2 lần font), giới hạn 2 dòng, căn giữa dọc -->
                <div class="flex items-center text-left text-black h-6 mb-1">
                    <div class="text-sm font-semibold leading-tight line-clamp-2 overflow-hidden">
                        ${tk.ten_vt}
                    </div>
                </div>
                
                <!-- Nội dung (Hàng Mẫu): Tối đa 4 dòng, tự động co dãn nhưng giới hạn 4 dòng -->
                <div class="mt-1 pt-1 text-black border-t border-black line-clamp-4 overflow-hidden text-center flex flex-col justify-center items-center text-[11px] font-bold not-italic flex-grow mb-2">
                    <div class="w-full flex flex-col justify-center items-center gap-1.5 mt-1.5 text-black">
                        <div class="text-[9.8px] font-black uppercase tracking-tight leading-none whitespace-nowrap">HÀNG MẪU KHÔNG BÁN - KHÔNG DÙNG TRÊN NGƯỜI</div>
                        <div class="text-[9.8px] font-black uppercase tracking-tight leading-none whitespace-nowrap mt-0.5">SAMPLE NOT FOR SALE - NOT FOR HUMAN USE</div>
                    </div>
                </div>

                <!-- Thời gian in & Text ghép -->
                <div class="absolute bottom-1 left-2 right-2 flex justify-between items-end text-[10px] italic text-black">
                    <span>1/1</span>
                    <span>${formattedPrintTime}</span>
                </div>
            </div>
        </div>
    `;

    document.body.classList.add('printing-labels');
    window.print();
    document.body.classList.remove('printing-labels');
    labelArea.innerHTML = '';
}
