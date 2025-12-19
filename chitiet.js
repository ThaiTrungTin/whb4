

import { sb, cache, viewStates, currentUser, showLoading, showToast, debounce, renderPagination, filterButtonDefaultTexts, showView } from './app.js';
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
            _user_role: currentUser.phan_quyen,
            _user_ho_ten: currentUser.ho_ten
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
        showToast("Lỗi khi tải dữ liệu tổng hợp chi tiết.", 'error');
        [nhapEl, xuatEl].forEach(el => el.textContent = '(lỗi)');
    }
}


function buildChiTietQuery() {
    const state = viewStates['view-chi-tiet'];
    let query = sb.from('chi_tiet').select('*', { count: 'exact' });

    if (currentUser.phan_quyen === 'View') {
        query = query.eq('phu_trach', currentUser.ho_ten);
    }

    if (state.searchTerm) query = query.or(`ma_kho.ilike.%${state.searchTerm}%,ma_nx.ilike.%${state.searchTerm}%,ma_vach.ilike.%${state.searchTerm}%,ma_vt.ilike.%${state.searchTerm}%,ten_vt.ilike.%${state.searchTerm}%,lot.ilike.%${state.searchTerm}%,loai.ilike.%${state.searchTerm}%,yeu_cau.ilike.%${state.searchTerm}%,muc_dich.ilike.%${state.searchTerm}%,nganh.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%`);
    if (state.filters.from_date) query = query.gte('thoi_gian', state.filters.from_date);
    if (state.filters.to_date) query = query.lte('thoi_gian', state.filters.to_date);
    if (state.filters.ma_kho?.length > 0) query = query.in('ma_kho', state.filters.ma_kho);
    if (state.filters.ma_nx?.length > 0) query = query.in('ma_nx', state.filters.ma_nx);
    if (state.filters.ma_vt?.length > 0) query = query.in('ma_vt', state.filters.ma_vt);
    if (state.filters.lot?.length > 0) query = query.in('lot', state.filters.lot);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    
    return query;
}

export async function fetchChiTiet(page = viewStates['view-chi-tiet'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-chi-tiet'].currentPage = page;
        const state = viewStates['view-chi-tiet'];
        
        const { itemsPerPage } = state;
        const from = (page - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        const query = buildChiTietQuery().order('thoi_gian', { ascending: false }).order('ma_nx', { ascending: true }).order('stt', { ascending: true }).range(from, to);
        
        const [queryResult, _] = await Promise.all([
            query,
            updateChiTietHeaderCounts()
        ]);

        const { data, error, count } = queryResult;
        
        if (error) {
            showToast("Không thể tải dữ liệu chi tiết.", 'error');
        } else {
            state.totalFilteredCount = count;
            cache.chiTietList = data;
            
            renderChiTietTable(data);
            applyChiTietColumnState();
            renderPagination('chi-tiet', count, from, to);
        }
    } finally {
        if (showLoader) showLoading(false);
    }
}


function renderChiTietTable(data) {
    const tableBody = document.getElementById('chi-tiet-table-body');
    if (!tableBody) return;

    if (data && data.length > 0) {
        tableBody.innerHTML = data.map(ct => {
            const maNxClass = ct.ma_nx ? (ct.ma_nx.endsWith('-') ? 'text-yellow-600 font-semibold' : 'text-green-600 font-semibold') : '';
            return `
            <tr class="hover:bg-gray-50">
                <td class="px-1 py-2 border border-gray-300 text-center">${formatDateToDDMMYYYY(ct.thoi_gian)}</td>
                <td class="px-1 py-2 border border-gray-300 text-center cursor-pointer text-blue-600 hover:underline ma-kho-cell">${ct.ma_kho}</td>
                <td class="px-1 py-2 border border-gray-300 text-center ${maNxClass}">${ct.ma_nx}</td>
                <td class="px-1 py-2 border border-gray-300 text-left">${ct.ma_vach}</td>
                <td class="px-1 py-2 border border-gray-300 text-left cursor-pointer text-blue-600 hover:underline ma-vt-cell">${ct.ma_vt}</td>
                <td class="px-1 py-2 border border-gray-300 text-left break-words">${ct.ten_vt}</td>
                <td class="px-1 py-2 border border-gray-300 text-center">${ct.lot || ''}</td>
                <td class="px-1 py-2 border border-gray-300 text-center">${ct.date || ''}</td>
                <td class="px-1 py-2 border border-gray-300 text-center font-bold">${ct.yc_sl || 0}</td>
                <td class="px-1 py-2 border border-gray-300 text-center text-green-600 font-bold">${ct.nhap || 0}</td>
                <td class="px-1 py-2 border border-gray-300 text-center text-red-600 font-bold">${ct.xuat || 0}</td>
                <td class="px-1 py-2 border border-gray-300 text-center">${ct.loai || ''}</td>
                <td class="px-1 py-2 border border-gray-300 text-center">${ct.yeu_cau || ''}</td>
                <td class="px-1 py-2 border border-gray-300 text-left break-words">${ct.muc_dich || ''}</td>
                <td class="chi-tiet-col-nganh px-1 py-2 border border-gray-300 text-center">${ct.nganh || ''}</td>
                <td class="chi-tiet-col-phu-trach px-1 py-2 border border-gray-300 text-center">${ct.phu_trach || ''}</td>
            </tr>
        `}).join('');
    } else {
        tableBody.innerHTML = '<tr><td colspan="16" class="text-center py-4">Không có dữ liệu</td></tr>';
    }
}

async function handleExcelExport() {
    const modal = document.getElementById('excel-export-modal');
    modal.classList.remove('hidden');

    const exportAndClose = async (exportAll) => {
        modal.classList.add('hidden');
        showLoading(true);
        try {
            const query = exportAll ? sb.from('chi_tiet').select('*') : buildChiTietQuery().select('*');
            const { data, error } = await query.order('thoi_gian', { ascending: false }).limit(50000);
            
            if (error) throw error;
            if (!data || data.length === 0) {
                showToast("Không có dữ liệu để xuất.", 'info');
                return;
            }

            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "ChiTiet");
            XLSX.writeFile(workbook, `ChiTietGiaoDich_${new Date().toISOString().slice(0,10)}.xlsx`);
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


async function openChiTietFilterPopover(button, view) {
    const filterKey = button.dataset.filterKey;
    const state = viewStates[view];

    const template = document.getElementById('filter-popover-template');
    if (!template) return;
    const popoverContent = template.content.cloneNode(true);
    const popover = popoverContent.querySelector('.filter-popover');
    document.body.appendChild(popover);

    const rect = button.getBoundingClientRect();
    popover.style.left = `${rect.left}px`;
    popover.style.top = `${rect.bottom + window.scrollY + 5}px`;

    const optionsList = popover.querySelector('.filter-options-list');
    const applyBtn = popover.querySelector('.filter-apply-btn');
    const searchInput = popover.querySelector('.filter-search-input');
    const selectionCountEl = popover.querySelector('.filter-selection-count');
    const toggleAllBtn = popover.querySelector('.filter-toggle-all-btn');
    
    const tempSelectedOptions = new Set(state.filters[filterKey] || []);

    const updateSelectionCount = () => {
        const count = tempSelectedOptions.size;
        selectionCountEl.textContent = count > 0 ? `Đã chọn: ${count}` : '';
    };

    const updateToggleAllButtonState = () => {
        const visibleCheckboxes = optionsList.querySelectorAll('.filter-option-cb');
        if (visibleCheckboxes.length === 0) {
            toggleAllBtn.textContent = 'Tất cả';
            toggleAllBtn.disabled = true;
            return;
        }
        toggleAllBtn.disabled = false;
        const allVisibleSelected = [...visibleCheckboxes].every(cb => cb.checked);
        toggleAllBtn.textContent = allVisibleSelected ? 'Bỏ chọn' : 'Tất cả';
    };

    const renderOptions = (options) => {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredOptions = options.filter(option => 
            option && String(option).toLowerCase().includes(searchTerm)
        );
        optionsList.innerHTML = filteredOptions.length > 0 ? filteredOptions.map(option => `
            <label class="flex items-center space-x-2 px-2 py-1 hover:bg-gray-100 rounded">
                <input type="checkbox" value="${option}" class="filter-option-cb" ${tempSelectedOptions.has(String(option)) ? 'checked' : ''}>
                <span class="text-sm">${option}</span>
            </label>
        `).join('') : '<div class="text-center p-4 text-sm text-gray-500">Không có tùy chọn.</div>';
        updateToggleAllButtonState();
    };
    
    const setupEventListeners = (allOptions) => {
        searchInput.addEventListener('input', () => renderOptions(allOptions));
        
        optionsList.addEventListener('change', e => {
            const cb = e.target;
            if (cb.type === 'checkbox' && cb.classList.contains('filter-option-cb')) {
                if (cb.checked) {
                    tempSelectedOptions.add(cb.value);
                } else {
                    tempSelectedOptions.delete(cb.value);
                }
                updateSelectionCount();
                updateToggleAllButtonState();
            }
        });
        
        toggleAllBtn.onclick = () => {
            const searchTerm = searchInput.value.toLowerCase();
            const visibleOptions = allOptions.filter(option => 
                option && String(option).toLowerCase().includes(searchTerm)
            );
            
            const isSelectAllAction = toggleAllBtn.textContent === 'Tất cả';
            
            visibleOptions.forEach(option => {
                if (isSelectAllAction) {
                    tempSelectedOptions.add(String(option));
                } else {
                    tempSelectedOptions.delete(String(option));
                }
            });

            renderOptions(allOptions);
            updateSelectionCount();
        };
    };

    updateSelectionCount();
    
    optionsList.innerHTML = '<div class="text-center p-4 text-sm text-gray-500">Đang tải...</div>';
    applyBtn.disabled = true;

    try {
        const { data, error } = await sb.rpc('get_chi_tiet_filter_options', {
            filter_key: filterKey,
            _search_term: state.searchTerm || '',
            _from_date: state.filters.from_date || null,
            _to_date: state.filters.to_date || null,
            _ma_kho_filter: state.filters.ma_kho || [],
            _ma_nx_filter: state.filters.ma_nx || [],
            _ma_vt_filter: state.filters.ma_vt || [],
            _lot_filter: state.filters.lot || [],
            _nganh_filter: state.filters.nganh || [],
            _phu_trach_filter: state.filters.phu_trach || [],
            _user_role: currentUser.phan_quyen,
            _user_ho_ten: currentUser.ho_ten
        });
        if (error) throw error;
        
        const uniqueOptions = Array.isArray(data) ? data.map(item => item.option) : [];
        renderOptions(uniqueOptions);
        setupEventListeners(uniqueOptions);
        applyBtn.disabled = false;
    } catch (error) {
        optionsList.innerHTML = '<div class="text-center p-4 text-sm text-red-500">Lỗi tải bộ lọc.</div>';
        showToast(`Lỗi tải bộ lọc cho ${filterKey}.`, 'error');
    }

    const closePopover = (e) => {
        if (!popover.contains(e.target) && e.target !== button) {
            popover.remove();
            document.removeEventListener('click', closePopover);
        }
    };

    applyBtn.onclick = () => {
        state.filters[filterKey] = [...tempSelectedOptions];
        
        const defaultText = filterButtonDefaultTexts[button.id] || button.id;
        button.textContent = tempSelectedOptions.size > 0 ? `${defaultText} (${tempSelectedOptions.size})` : defaultText;
        
        if(view === 'view-chi-tiet') fetchChiTiet(1);
        
        popover.remove();
        document.removeEventListener('click', closePopover);
    };
    
    setTimeout(() => document.addEventListener('click', closePopover), 0);
}

function applyChiTietColumnState() {
    const table = document.getElementById('view-chi-tiet').querySelector('table');
    const btn = document.getElementById('chi-tiet-toggle-cols');
    if (!table || !btn) return;

    const isCollapsed = sessionStorage.getItem('chiTietColsCollapsed') !== 'false';

    table.querySelectorAll('.chi-tiet-col-nganh, .chi-tiet-col-phu-trach').forEach(el => {
        el.classList.toggle('hidden', isCollapsed);
    });

    btn.textContent = isCollapsed ? '[+]' : '[-]';
}

export function initChiTietView() {
    const viewContainer = document.getElementById('view-chi-tiet');
    
    applyChiTietColumnState();

    document.getElementById('chi-tiet-search').addEventListener('input', debounce(() => {
        viewStates['view-chi-tiet'].searchTerm = document.getElementById('chi-tiet-search').value;
        fetchChiTiet(1);
    }, 500));

    viewContainer.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (btn) openChiTietFilterPopover(btn, 'view-chi-tiet');
    });
    
    document.getElementById('chi-tiet-filter-from-date').addEventListener('change', e => {
        viewStates['view-chi-tiet'].filters.from_date = e.target.value; fetchChiTiet(1); });
    document.getElementById('chi-tiet-filter-to-date').addEventListener('change', e => {
        viewStates['view-chi-tiet'].filters.to_date = e.target.value; fetchChiTiet(1); });

    document.getElementById('chi-tiet-reset-filters').addEventListener('click', () => {
        document.getElementById('chi-tiet-search').value = '';
        document.getElementById('chi-tiet-filter-from-date').value = '';
        document.getElementById('chi-tiet-filter-to-date').value = '';
        viewStates['view-chi-tiet'].searchTerm = '';
        viewStates['view-chi-tiet'].filters = { from_date: '', to_date: '', ma_kho: [], ma_nx: [], ma_vt: [], lot: [], nganh: [], phu_trach: [] };
        document.querySelectorAll('#view-chi-tiet .filter-btn').forEach(btn => {
            btn.textContent = filterButtonDefaultTexts[btn.id];
        });
        fetchChiTiet(1);
    });
    
    document.getElementById('chi-tiet-btn-excel').addEventListener('click', handleExcelExport);

    document.getElementById('chi-tiet-table-body').addEventListener('click', async (e) => {
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
            tonKhoState.filters = { ma_vt: [ma_vt], lot: [], date: [], ton_cuoi: [], tinh_trang: [], nganh: [], phu_trach: [] };
            
            await showView('view-ton-kho');
        }
    });

    document.getElementById('chi-tiet-items-per-page').addEventListener('change', (e) => {
        viewStates['view-chi-tiet'].itemsPerPage = parseInt(e.target.value, 10);
        fetchChiTiet(1);
    });
    document.getElementById('chi-tiet-prev-page').addEventListener('click', () => fetchChiTiet(viewStates['view-chi-tiet'].currentPage - 1));
    document.getElementById('chi-tiet-next-page').addEventListener('click', () => fetchChiTiet(viewStates['view-chi-tiet'].currentPage + 1));
    
    const pageInput = document.getElementById('chi-tiet-page-input');
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

    document.getElementById('chi-tiet-toggle-cols').addEventListener('click', () => {
        const isCurrentlyCollapsed = sessionStorage.getItem('chiTietColsCollapsed') !== 'false';
        sessionStorage.setItem('chiTietColsCollapsed', !isCurrentlyCollapsed);
        applyChiTietColumnState();
    });
}