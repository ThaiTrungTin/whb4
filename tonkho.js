import { sb, currentUser, cache, viewStates, showLoading, showToast, showConfirm, debounce, renderPagination, filterButtonDefaultTexts, openAutocomplete, updateTonKhoToggleUI, openTonKhoFilterPopover } from './app.js';
import { fetchSanPham } from './sanpham.js';

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
            _user_role: currentUser.phan_quyen,
            _user_ho_ten: currentUser.ho_ten
        });

        if (error) {
            console.error("Error fetching ton kho summary:", error);
            showToast("Lỗi khi tải dữ liệu tổng hợp tồn kho.", 'error');
            throw error;
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
        [dauEl, nhapEl, xuatEl, cuoiEl].forEach(el => el.textContent = '(lỗi)');
    }
}

function buildTonKhoQuery() {
    const state = viewStates['view-ton-kho'];
    let query = sb.from('ton_kho_update').select('*', { count: 'exact' });

    if (currentUser.phan_quyen === 'View') {
        query = query.eq('phu_trach', currentUser.ho_ten);
    }

    if (state.searchTerm) {
        query = query.or(`ma_vach.ilike.%${state.searchTerm}%,ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,lot.ilike.%${state.searchTerm}%,tinh_trang.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%,note.ilike.%${state.searchTerm}%`);
    }

    if (state.stockAvailability === 'available') {
        query = query.gt('ton_cuoi', 0);
    }

    if (state.filters.ma_vt?.length > 0) query = query.in('ma_vt', state.filters.ma_vt);
    if (state.filters.lot?.length > 0) query = query.in('lot', state.filters.lot);
    if (state.filters.date?.length > 0) query = query.in('date', state.filters.date);
    if (state.filters.tinh_trang?.length > 0) query = query.in('tinh_trang', state.filters.tinh_trang);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    
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

        let query = buildTonKhoQuery().order('ma_vach', { ascending: true }).range(from, to);

        const [queryResult, _] = await Promise.all([
            query,
            updateTonKhoHeaderCounts()
        ]);
        
        const { data, error, count } = queryResult;

        if (error) {
            showToast("Không thể tải dữ liệu tồn kho.", 'error');
        } else {
            state.totalFilteredCount = count;
            cache.tonKhoList = data;
            
            renderTonKhoTable(data);
            applyTonKhoColumnState();
            renderPagination('ton-kho', count, from, to);
            updateTonKhoSelectionInfo();
            updateFilterButtonTexts('ton-kho');
        }
    } finally {
        if (showLoader) showLoading(false);
    }
}

function renderTonKhoTable(data) {
    const tkTableBody = document.getElementById('ton-kho-table-body');
    if (!tkTableBody) return;

    if (data && data.length > 0) {
        const html = data.map(tk => {
            const isSelected = viewStates['view-ton-kho'].selected.has(tk.ma_vach);
            const tonCuoiClass = tk.ton_cuoi > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
            
            let tinhTrangClass = 'text-[10px] font-semibold px-1 py-0.5 rounded-full ';
            switch (tk.tinh_trang) {
                case 'Hết hạn sử dụng':
                    tinhTrangClass += 'text-red-800 bg-red-100';
                    break;
                case 'Cận date':
                    tinhTrangClass += 'text-blue-800 bg-blue-100';
                    break;
                case 'Còn sử dụng':
                    tinhTrangClass += 'text-green-800 bg-green-100';
                    break;
                case 'Hàng hư':
                    tinhTrangClass += 'text-yellow-800 bg-yellow-100';
                    break;
                default:
                    tinhTrangClass += 'text-gray-800 bg-gray-100';
            }

            const noteHtml = tk.note ? `
                <div class="group relative flex justify-center items-center h-full">
                    <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                    <div class="absolute bottom-full right-full mb-2 mr-2 w-max max-w-xs scale-0 transform rounded bg-gray-800 p-2 text-sm text-white transition-all group-hover:scale-100 origin-bottom-right pointer-events-none z-20 whitespace-pre-wrap">
                        ${tk.note}
                    </div>
                </div>
            ` : '';
            
            return `
                <tr data-id="${tk.ma_vach}" class="hover:bg-gray-50 ${isSelected ? 'bg-blue-100' : ''}">
                    <td class="px-1 py-2 border border-gray-300 text-center"><input type="checkbox" class="ton-kho-select-row" data-id="${tk.ma_vach}" ${isSelected ? 'checked' : ''}></td>
                    <td class="px-1 py-2 text-sm font-medium text-gray-900 border border-gray-300 text-left cursor-pointer text-blue-600 hover:underline ma-vach-cell">${tk.ma_vach}</td>
                    <td class="px-1 py-2 text-sm font-medium text-gray-900 border border-gray-300 text-left">${tk.ma_vt}</td>
                    <td class="px-1 py-2 text-sm text-gray-600 break-words border border-gray-300 text-left">${tk.ten_vt}</td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center">${tk.lot || ''}</td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center">${tk.date || ''}</td>
                    <td class="px-2 py-2 text-sm text-black font-bold border border-gray-300 text-center">${tk.ton_dau}</td>
                    <td class="px-2 py-2 text-sm text-green-600 border border-gray-300 text-center">${tk.nhap}</td>
                    <td class="px-2 py-2 text-sm text-red-600 border border-gray-300 text-center">${tk.xuat}</td>
                    <td class="px-2 py-2 text-sm border border-gray-300 text-center ${tonCuoiClass}">${tk.ton_cuoi}</td>
                    <td class="px-1 py-2 border border-gray-300 text-center whitespace-nowrap"><span class="${tinhTrangClass}">${tk.tinh_trang || ''}</span></td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center">${tk.tray || ''}</td>
                    <td class="ton-kho-col-nganh px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center">${tk.nganh || ''}</td>
                    <td class="ton-kho-col-phu-trach px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center">${tk.phu_trach || ''}</td>
                    <td class="px-1 py-2 border border-gray-300 text-center">${noteHtml}</td>
                </tr>
            `;
        }).join('');
        tkTableBody.innerHTML = html;
    } else {
        tkTableBody.innerHTML = '<tr><td colspan="15" class="text-center py-4">Không có dữ liệu</td></tr>';
    }
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
            const query = exportAll ? sb.from('ton_kho_update').select('*') : buildTonKhoQuery().select('*');
            const { data, error } = await query.order('ma_vach').limit(50000);
            
            if (error) throw error;
            if (!data || data.length === 0) {
                showToast("Không có dữ liệu để xuất.", 'info');
                return;
            }

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "TonKho");
            XLSX.writeFile(workbook, `TonKho_${new Date().toISOString().slice(0,10)}.xlsx`);
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

function applyTonKhoColumnState() {
    const table = document.getElementById('view-ton-kho').querySelector('table');
    const btn = document.getElementById('ton-kho-toggle-cols');
    if (!table || !btn) return;

    const isCollapsed = sessionStorage.getItem('tonKhoColsCollapsed') !== 'false';

    table.querySelectorAll('.ton-kho-col-nganh, .ton-kho-col-phu-trach').forEach(el => {
        el.classList.toggle('hidden', isCollapsed);
    });

    btn.textContent = isCollapsed ? '[+]' : '[-]';
}

function updateFilterButtonTexts(viewPrefix) {
    const state = viewStates[`view-${viewPrefix}`];
    if (!state) return;
    
    const viewContainer = document.getElementById(`view-${viewPrefix}`);
    if (!viewContainer) return;

    viewContainer.querySelectorAll('.filter-btn').forEach(btn => {
        const filterKey = btn.dataset.filterKey;
        if (filterKey && state.filters.hasOwnProperty(filterKey)) {
            const selectedOptions = state.filters[filterKey] || [];
            const defaultText = filterButtonDefaultTexts[btn.id] || 'Filter';
            
            if (filterKey.includes('date') && selectedOptions) {
                 btn.textContent = defaultText; 
            } else if (Array.isArray(selectedOptions)) {
                btn.textContent = selectedOptions.length > 0 ? `${defaultText} (${selectedOptions.length})` : defaultText;
            }
        }
    });
}

export function initTonKhoView() {
    const viewContainer = document.getElementById('view-ton-kho');
    const isAdminOrUser = currentUser.phan_quyen === 'Admin' || currentUser.phan_quyen === 'User';
    viewContainer.querySelectorAll('.tk-admin-only').forEach(el => el.classList.toggle('hidden', !isAdminOrUser));
    
    applyTonKhoColumnState();

    document.getElementById('ton-kho-search').addEventListener('input', debounce(() => {
        viewStates['view-ton-kho'].searchTerm = document.getElementById('ton-kho-search').value;
        fetchTonKho(1);
    }, 500));
    
    viewContainer.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (btn) openTonKhoFilterPopover(btn, 'view-ton-kho');
    });

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
    
    toggleAvailableBtn.addEventListener('click', handleToggleClick);
    toggleAllBtn.addEventListener('click', handleToggleClick);
    
    state.stockAvailability = sessionStorage.getItem('tonKhoStockAvailability') || 'available';
    updateTonKhoToggleUI();

    document.getElementById('ton-kho-reset-filters').addEventListener('click', () => {
        document.getElementById('ton-kho-search').value = '';
        viewStates['view-ton-kho'].searchTerm = '';
        viewStates['view-ton-kho'].filters = { ma_vt: [], lot: [], date: [], tinh_trang: [], nganh: [], phu_trach: [] };
        document.querySelectorAll('#view-ton-kho .filter-btn').forEach(btn => {
            btn.textContent = filterButtonDefaultTexts[btn.id];
        });
        state.stockAvailability = 'available';
        sessionStorage.setItem('tonKhoStockAvailability', 'available');
        updateTonKhoToggleUI();
        fetchTonKho(1);
    });

    document.getElementById('ton-kho-table-body').addEventListener('click', async e => {
        const row = e.target.closest('tr');
        if (!row || !row.dataset.id) return;
        const id = row.dataset.id;
        
        if (e.target.closest('.ma-vach-cell')) {
            const { data } = await sb.from('ton_kho').select('*').eq('ma_vach', id).single();
            if(data) openTonKhoModal(data, 'view');
            return;
        }

        const checkbox = row.querySelector('.ton-kho-select-row');
        if (e.target.type !== 'checkbox') {
            checkbox.checked = !checkbox.checked;
        }
        
        viewStates['view-ton-kho'].selected[checkbox.checked ? 'add' : 'delete'](id);
        row.classList.toggle('bg-blue-100', checkbox.checked);
        updateTonKhoActionButtonsState();
        updateTonKhoSelectionInfo();
    });

    document.getElementById('ton-kho-select-all').addEventListener('click', (e) => {
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
        updateTonKhoActionButtonsState();
        updateTonKhoSelectionInfo();
    });
    
    document.getElementById('ton-kho-btn-add').addEventListener('click', () => openTonKhoModal(null, 'add'));
    document.getElementById('ton-kho-btn-edit').addEventListener('click', async () => {
        const ma_vach = [...viewStates['view-ton-kho'].selected][0];
        const { data } = await sb.from('ton_kho').select('*').eq('ma_vach', ma_vach).single();
        if(data) openTonKhoModal(data, 'edit');
    });
    document.getElementById('ton-kho-btn-delete').addEventListener('click', handleDeleteMultipleTonKho);
    document.getElementById('ton-kho-btn-excel').addEventListener('click', handleTonKhoExcelExport);
    document.getElementById('ton-kho-form').addEventListener('submit', handleSaveTonKho);
    
    const closeModal = () => {
        document.getElementById('ton-kho-modal').classList.add('hidden');
        // This was closing the lot popover, but since it's not managed here, we remove it.
        // closeActiveAutocompletePopover(); 
    };
    document.getElementById('cancel-ton-kho-btn').addEventListener('click', closeModal);
    document.getElementById('close-ton-kho-view-btn').addEventListener('click', closeModal);
    
    const tkModalMaVt = document.getElementById('ton-kho-modal-ma-vt');
    
    const handleMaVtInput = async () => {
        if (cache.sanPhamList.length === 0) await fetchSanPham(1, false);
        const inputValue = tkModalMaVt.value.toLowerCase().trim();
        const suggestions = inputValue 
            ? cache.sanPhamList.filter(p => 
                p.ma_vt.toLowerCase().includes(inputValue) || 
                p.ten_vt.toLowerCase().includes(inputValue)
              ).slice(0, 10)
            : cache.sanPhamList.slice(0, 10);
            
        openAutocomplete(tkModalMaVt, suggestions, {
            valueKey: 'ma_vt',
            primaryTextKey: 'ma_vt',
            secondaryTextKey: 'ten_vt',
            onSelect: (selectedValue) => {
                tkModalMaVt.value = selectedValue;
                tkModalMaVt.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    };
    
    tkModalMaVt.addEventListener('focus', handleMaVtInput);
    tkModalMaVt.addEventListener('input', debounce(handleMaVtInput, 200)); 
    
    tkModalMaVt.addEventListener('change', () => { 
        // closeActiveAutocompletePopover(); 
        const selectedMaVt = tkModalMaVt.value;
        const sanPham = cache.sanPhamList.find(p => p.ma_vt === selectedMaVt);
        document.getElementById('ton-kho-modal-ten-vt').value = sanPham?.ten_vt || '';
        document.getElementById('ton-kho-modal-nganh').value = sanPham?.nganh || '';
        document.getElementById('ton-kho-modal-phu-trach').value = sanPham?.phu_trach || '';
        updateGeneratedMaVach();
    });

    document.getElementById('ton-kho-modal-lot').addEventListener('input', updateGeneratedMaVach);
    const dateInput = document.getElementById('ton-kho-modal-date');
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

    document.getElementById('ton-kho-items-per-page').addEventListener('change', (e) => {
        viewStates['view-ton-kho'].itemsPerPage = parseInt(e.target.value, 10);
        fetchTonKho(1);
    });
    document.getElementById('ton-kho-prev-page').addEventListener('click', () => fetchTonKho(viewStates['view-ton-kho'].currentPage - 1));
    document.getElementById('ton-kho-next-page').addEventListener('click', () => fetchTonKho(viewStates['view-ton-kho'].currentPage + 1));
    
    const pageInput = document.getElementById('ton-kho-page-input');
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
    
    document.getElementById('ton-kho-toggle-cols').addEventListener('click', () => {
        const isCurrentlyCollapsed = sessionStorage.getItem('tonKhoColsCollapsed') !== 'false';
        sessionStorage.setItem('tonKhoColsCollapsed', !isCurrentlyCollapsed);
        applyTonKhoColumnState();
    });
}
