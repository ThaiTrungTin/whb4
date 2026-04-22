
import { sb, cache, viewStates, showLoading, showToast, showConfirm, debounce, renderPagination, sanitizeFileName, filterButtonDefaultTexts, currentUser, openAutocomplete, addJobToOfflineQueue, openPrintPreviewModal } from './app.js';

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
    if(ma_kho_orig && ma_kho === ma_kho_orig) {
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
    let classes = 'text-[10px] font-semibold px-1 py-0.5 rounded-full ';
    switch (tinh_trang) {
        case 'Hết hạn sử dụng': classes += 'text-red-800 bg-red-100'; break;
        case 'Cận date': classes += 'text-blue-800 bg-blue-100'; break;
        case 'Còn sử dụng': classes += 'text-green-800 bg-green-100'; break;
        case 'Hàng hư': classes += 'text-yellow-800 bg-yellow-100'; break;
        default: classes += 'text-gray-800 bg-gray-100';
    }
    return classes;
}

function closeActiveLotPopover() {
    if (activeLotPopover) {
        activeLotPopover.element.remove();
        document.removeEventListener('click', activeLotPopover.closeHandler);
        activeLotPopover = null;
    }
}


async function openDonHangFilterPopover(button, view) {
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

    const updateToggleAllButtonState = (allOptions) => {
        if (!allOptions || allOptions.length === 0) {
            toggleAllBtn.textContent = 'Tất cả';
            toggleAllBtn.disabled = true;
            return;
        }
        toggleAllBtn.disabled = false;
        const allVisibleSelected = allOptions.every(opt => tempSelectedOptions.has(opt));
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
        updateToggleAllButtonState(filteredOptions);
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
                updateToggleAllButtonState(allOptions.filter(opt => opt.toLowerCase().includes(searchInput.value.toLowerCase())));
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

    if (filterKey === 'loai') {
        searchInput.classList.add('hidden');
        const options = ['Nhập', 'Xuất'];
        renderOptions(options);
        setupEventListeners(options);
    } else if (filterKey === 'trang_thai_xu_ly') {
        searchInput.classList.add('hidden');
        const options = ['Đang xử lý', 'Đã xử lý'];
        renderOptions(options);
        setupEventListeners(options);
    } else {
        optionsList.innerHTML = '<div class="text-center p-4 text-sm text-gray-500">Đang tải...</div>';
        applyBtn.disabled = true;
        try {
            let query = sb.from('don_hang').select(filterKey);
            
            const otherFilters = { ...state.filters };
            
            if (state.searchTerm) {
                 const st = `%${state.searchTerm}%`;
                 query = query.or(`ma_kho.ilike.${st},ma_nx.ilike.${st},yeu_cau.ilike.${st},nganh.ilike.${st},muc_dich.ilike.${st},ghi_chu.ilike.${st}`);
            }

            if (otherFilters.from_date) query = query.gte('thoi_gian', otherFilters.from_date);
            if (otherFilters.to_date) query = query.lte('thoi_gian', otherFilters.to_date);

            if (filterKey !== 'loai' && otherFilters.loai?.length === 1) {
                const loaiPrefix = otherFilters.loai[0] === 'Nhập' ? 'IN.%' : 'OUT.%';
                query = query.ilike('ma_kho', loaiPrefix);
            }

             if (filterKey !== 'trang_thai_xu_ly' && otherFilters.trang_thai_xu_ly?.length === 1) {
                if (otherFilters.trang_thai_xu_ly[0] === 'Đang xử lý') {
                    query = query.like('ma_nx', '%-');
                } else if (otherFilters.trang_thai_xu_ly[0] === 'Đã xử lý') {
                    query = query.not('ma_nx', 'like', '%-');
                }
            }
            if (filterKey !== 'ma_kho' && otherFilters.ma_kho?.length > 0) query = query.in('ma_kho', otherFilters.ma_kho);
            if (filterKey !== 'ma_nx' && otherFilters.ma_nx?.length > 0) query = query.in('ma_nx', otherFilters.ma_nx);
            if (filterKey !== 'yeu_cau' && otherFilters.yeu_cau?.length > 0) query = query.in('yeu_cau', otherFilters.yeu_cau);
            if (filterKey !== 'nganh' && otherFilters.nganh?.length > 0) query = query.in('nganh', otherFilters.nganh);

            const { data, error } = await query.limit(1000);
            if (error) throw error;
            
            const uniqueOptions = [...new Set(data.map(item => item[filterKey]).filter(Boolean))].sort();
            renderOptions(uniqueOptions);
            setupEventListeners(uniqueOptions);
            applyBtn.disabled = false;

        } catch (error) {
            console.error("Filter error:", error);
            optionsList.innerHTML = '<div class="text-center p-4 text-sm text-red-500">Lỗi tải dữ liệu.</div>';
            showToast(`Lỗi tải bộ lọc cho: ${filterKey}.`, 'error');
        }
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
        
        fetchDonHang(1);
        
        popover.remove();
        document.removeEventListener('click', closePopover);
    };

    setTimeout(() => document.addEventListener('click', closePopover), 0);
}

function buildDonHangQuery() {
    const state = viewStates['view-don-hang'];
    let query = sb.from('don_hang').select('*', { count: 'exact' });

    if (currentUser.phan_quyen === 'View') {
        query = query.eq('yeu_cau', currentUser.ho_ten);
    }

    if (state.filters.from_date) query = query.gte('thoi_gian', state.filters.from_date);
    if (state.filters.to_date) query = query.lte('thoi_gian', state.filters.to_date);

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
    if (state.filters.ma_nx?.length > 0) query = query.in('ma_nx', state.filters.ma_nx);
    if (state.filters.yeu_cau?.length > 0) query = query.in('yeu_cau', state.filters.yeu_cau);
    if (state.filters.nganh?.length > 0) query = query.in('nganh', state.filters.nganh);

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
        
        const { data, error, count } = await queryBuilder.order('thoi_gian', { ascending: false }).range(from, to);
        
        if (error) {
            console.error(error);
            showToast("Lỗi khi tải dữ liệu đơn hàng.", 'error');
        } else {
            state.totalFilteredCount = count; 
            cache.donHangList = data;
            
            renderDonHangTable(data);
            renderPagination('don-hang', count, from, to);
            updateDonHangSelectionInfo(); 
        }
    } catch(err) {
        console.error("Fetch Don Hang failed:", err);
    } finally {
        if (showLoader) showLoading(false);
    }
}

function renderDonHangTable(data) {
    const tableBody = document.getElementById('don-hang-table-body');
    if (!tableBody) return;

    if (data && data.length > 0) {
        tableBody.innerHTML = data.map(dh => {
            const isSelected = viewStates['view-don-hang'].selected.has(dh.ma_kho);
            const thoi_gian = formatDateToDDMMYYYY(dh.thoi_gian);
            const filesAsArray = parseFileArray(dh.file);
            const fileCount = filesAsArray.length;

            const fileIcon = fileCount > 0 ? 
                `<div class="relative cursor-pointer w-8 h-8 mx-auto">
                    <svg class="w-8 h-8 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                    <span class="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">${fileCount}</span>
                 </div>` : '';
            
            let maKhoIcon = '';
            if (dh.ma_kho.includes('OUT')) {
                maKhoIcon = `<svg class="w-4 h-4 inline-block ml-1 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>`;
            } else if (dh.ma_kho.includes('IN')) {
                maKhoIcon = `<svg class="w-4 h-4 inline-block ml-1 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>`;
            }
            const maKhoHtml = `<div class="flex items-center justify-center">
                <span class="text-blue-600 hover:underline">${dh.ma_kho}</span>
                ${maKhoIcon}
            </div>`;

            let maNxClass = '';
            if (dh.ma_nx) {
                if (dh.ma_nx.endsWith('-')) {
                    maNxClass = 'text-yellow-600 font-semibold';
                } else {
                    maNxClass = 'text-green-600 font-semibold';
                }
            }

            return `
                <tr data-id="${dh.ma_kho}" class="hover:bg-gray-50 ${isSelected ? 'bg-blue-100' : ''}">
                    <td class="px-1 py-2 border border-gray-300 text-center"><input type="checkbox" class="don-hang-select-row" data-id="${dh.ma_kho}" ${isSelected ? 'checked' : ''}></td>
                    <td class="px-1 py-2 text-sm font-medium border border-gray-300 text-center cursor-pointer ma-kho-cell">${maKhoHtml}</td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center whitespace-nowrap">${thoi_gian}</td>
                    <td class="px-1 py-2 text-sm border border-gray-300 text-center right-click-edit-cell" data-field="ma_nx">
                        <div class="cell-content ${maNxClass} cursor-help font-bold" title="Chuột phải để sửa">${dh.ma_nx || ''}</div>
                    </td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center">${dh.yeu_cau || ''}</td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-center">${dh.nganh || ''}</td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-left whitespace-pre-wrap min-w-[80px]">${dh.muc_dich || ''}</td>
                    <td class="px-1 py-2 text-sm text-gray-600 border border-gray-300 text-left right-click-edit-cell" data-field="ghi_chu">
                        <div class="cell-content cursor-help whitespace-pre-wrap min-w-[550px]" title="Chuột phải để sửa">${dh.ghi_chu || ''}</div>
                    </td>
                    <td class="px-3 py-2 border border-gray-300 text-center file-cell relative group dropzone-cell outline-none focus:ring-2 focus:ring-blue-300" tabindex="0">
                        <div class="inline-file-upload-overlay absolute inset-0 bg-blue-500 bg-opacity-5 hidden group-hover:flex items-center justify-center pointer-events-none">
                            <svg class="w-4 h-4 text-blue-500 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                        </div>
                        ${fileIcon}
                    </td>
                </tr>
            `;
        }).join('');
    } else {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4">Không có dữ liệu</td></tr>';
    }
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

    const label = loaiDon === 'Nhap' ? 'Thực Nhập' : 'Thực Xuất';

    summaryEl.innerHTML = `
        <span class="font-bold">Tổng cộng</span> ${label} / YCSL: 
        <span class="font-bold text-blue-600">${totalSL.toLocaleString()}</span> / 
        <span class="font-bold text-gray-800">${totalYCSL.toLocaleString()}</span>
    `;
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

    document.getElementById('don-hang-chi-tiet-loai-header')?.classList.toggle('hidden', isNhap);
    document.querySelectorAll('.chi-tiet-loai-cell').forEach(cell => cell.classList.toggle('hidden', isNhap));
    
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

        const trayInfo = item.tonKhoData ? `Tray: <span class="font-bold text-indigo-600">${item.tonKhoData.tray || '?'}</span>` : '';
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

        return `
            <tr data-id="${item.id}" class="chi-tiet-row group">
                <td class="p-1 border text-center align-top ${isViewMode ? '' : 'drag-handle cursor-move'}">${index + 1}</td>
                <td class="p-1 border align-top relative">
                    <input type="text" value="${item.ma_vt || ''}" class="w-full p-1 border rounded chi-tiet-input" data-field="ma_vt" data-col="ma_vt" autocomplete="off" ${isViewMode ? 'disabled' : ''}>
                </td>
                <td class="p-1 border align-top break-words">${item.ten_vt || ''}</td>
                <td class="p-1 border align-top">
                    <div class="relative">
                        <input type="text" value="${item.lot || ''}" class="w-full p-1 border rounded chi-tiet-lot-input" data-col="lot" readonly placeholder="Chọn LOT..." ${isViewMode ? 'disabled' : ''}>
                        <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </td>
                <td class="p-1 border align-top text-center">${item.date || ''}</td>
                <td class="p-1 border align-top">
                    <input type="number" value="${item.yc_sl || ''}" min="1" class="w-full p-1 border rounded chi-tiet-input" data-field="yc_sl" data-col="yc_sl" ${isViewMode ? 'disabled' : ''}>
                </td>
                <td class="p-1 border align-top">
                    <input type="number" value="${(item.sl === null || item.sl === undefined) ? '' : item.sl}" min="0" class="w-full p-1 border rounded chi-tiet-input ${slColorClass}" data-field="sl" data-col="sl" ${isViewMode ? 'disabled' : ''}>
                </td>
                <td class="p-1 border align-top chi-tiet-loai-cell">
                    <select class="w-full p-1 border rounded chi-tiet-input" data-field="loai" ${isViewMode ? 'disabled' : ''}>
                        <option value="" disabled ${!item.loai ? 'selected' : ''}>-- Chọn --</option>
                        <option value="Tiêu Hao" ${item.loai === 'Tiêu Hao' ? 'selected' : ''}>Tiêu Hao</option>
                        <option value="Trưng Bày" ${item.loai === 'Trưng Bày' ? 'selected' : ''}>Trưng Bày</option>
                    </select>
                </td>
                <td class="p-1 border align-top text-center font-mono ${barcodeColorClass}">${generatedBarcode || ''}</td>
                <td class="p-1 border text-center align-top">
                    ${!isViewMode ? `<button type="button" class="text-red-500 hover:text-red-700 chi-tiet-delete-btn text-xl font-bold">&times;</button>` : ''}
                </td>
            </tr>
            <tr data-info-id="${item.id}" class="bg-blue-50">
                 <td colspan="10" class="px-2 py-1.5 text-xs text-gray-800 border border-t-0 border-blue-200">
                    <div class="flex justify-between items-center">
                        <div>
                            <span class="font-semibold">${tonKhoInfo}</span>${pendingInfo} | <span class="font-semibold">${projectedStockText}</span>
                        </div>
                        <div>
                            <span class="font-semibold">${trayInfo}</span>
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
 * 1. Nhấn Tab khi có gợi ý: Chọn cái đầu tiên.
 * 2. Điều hướng theo cột (xuống dòng) cho Ma VT, LOT, Y/c, Nhập.
 */
function handleSmartTabNavigation(event) {
    if (event.key !== 'Tab') return;

    const input = event.target;
    const isShift = event.shiftKey;
    if (isShift) return; // Để mặc định cho Shift+Tab

    const lotPopover = document.getElementById('lot-selector-popover');
    const autocompletePopover = document.querySelector('.absolute.z-40.bg-white.border'); 

    if (lotPopover) {
        const firstOption = lotPopover.querySelector('.lot-option');
        if (firstOption) {
            event.preventDefault();
            firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            focusNextRowInput(input);
            return;
        }
    }

    if (autocompletePopover) {
        const firstOption = autocompletePopover.querySelector('.autocomplete-option');
        if (firstOption) {
            event.preventDefault();
            firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            
            if (input.dataset.col) {
                focusNextRowInput(input);
            } else {
                focusNextFormField(input);
            }
            return;
        }
    }

    const specialCols = ['ma_vt', 'lot', 'yc_sl', 'sl'];
    const currentCol = input.dataset.col;

    if (specialCols.includes(currentCol)) {
        event.preventDefault();
        focusNextRowInput(input);
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

function focusNextRowInput(currentInput) {
    const currentCol = currentInput.dataset.col;
    const currentRow = currentInput.closest('tr.chi-tiet-row');
    if (!currentRow) return;

    const nextRow = currentRow.nextElementSibling?.nextElementSibling; 
    if (nextRow && nextRow.classList.contains('chi-tiet-row')) {
        const nextInput = nextRow.querySelector(`[data-col="${currentCol}"]`);
        if (nextInput) {
            nextInput.focus();
            if (nextInput.select) nextInput.select();
        }
    } else {
        document.getElementById('don-hang-them-vat-tu-btn').focus();
    }
}

function openLotSelectorPopover(inputElement, item) {
    closeActiveLotPopover();

    const popoverTemplate = document.getElementById('autocomplete-popover-template');
    if (!popoverTemplate) return;

    const popoverContent = popoverTemplate.content.cloneNode(true);
    const popover = popoverContent.querySelector('div');
    popover.id = 'lot-selector-popover';
    popover.style.width = `380px`;
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
    optionsList.classList.add('max-h-64', 'overflow-y-auto');

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
                // const pnd = opt.pendingData || { nhap: 0, xuat: 0 }; // Không hiển thị pending nữa

                return `
                    <div class="px-3 py-2 cursor-pointer hover:bg-gray-100 border-b last:border-b-0 lot-option" data-ma-vach="${opt.ma_vach}">
                        <div class="flex justify-between items-center text-sm font-medium gap-2">
                            <span class="flex-1 text-left">LOT: ${opt.lot || 'Chưa có LOT'}</span>
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
            optionsList.innerHTML = '<div class="p-4 text-center text-sm text-gray-500 italic">Không tìm thấy LOT nào phù hợp.</div>';
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
                item.sl = Math.min(availableStock, requestedQty);
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
    const selectedCount = viewStates['view-don-hang'].selected.size;
    const editBtn = document.getElementById('don-hang-btn-edit');
    const deleteBtn = document.getElementById('don-hang-btn-delete');
    const printBtn = document.getElementById('don-hang-btn-print');
    const msgBtn = document.getElementById('don-hang-btn-msg');
    const shipBtn = document.getElementById('don-hang-btn-shipping');
    
    if (editBtn) editBtn.disabled = selectedCount !== 1;
    if (deleteBtn) deleteBtn.disabled = selectedCount === 0;
    if (msgBtn) msgBtn.disabled = selectedCount === 0;
    if (shipBtn) shipBtn.disabled = selectedCount === 0;
    
    const isPrintDisabled = selectedCount !== 1;
    if (printBtn) printBtn.disabled = isPrintDisabled;

    if (!isPrintDisabled && currentUser.phan_quyen === 'View') {
        const selectedId = [...viewStates['view-don-hang'].selected][0];
        const selectedOrder = cache.donHangList.find(dh => dh.ma_kho === selectedId);
        const isDisabledForView = !selectedOrder || selectedOrder.yeu_cau !== currentUser.ho_ten;
        if (printBtn) printBtn.disabled = isDisabledForView;
    }
}

async function handleExportMessage() {
    const state = viewStates['view-don-hang'];
    const selectedIds = Array.from(state.selected);
    if (selectedIds.length === 0) return;

    // Lấy dữ liệu đầy đủ của các đơn hàng đã chọn từ cache
    const selectedOrders = cache.donHangList.filter(dh => selectedIds.includes(dh.ma_kho));
    
    // Sắp xếp theo mã kho hoặc thời gian nếu cần (ở đây giữ nguyên thứ tự chọn/cache)
    let messageText = '';
    let counter = 1;

    selectedOrders.forEach(order => {
        const nganh = order.nganh || '';
        const yeu_cau = order.yeu_cau || '';
        const ghi_chu = order.ghi_chu || '';
        const ma_nx = order.ma_nx || order.ma_kho || '';
        const muc_dich = order.muc_dich || '';

        // Tách ghi chú theo đường kẻ phân cách (ít nhất 5 dấu gạch dưới)
        const parts = ghi_chu.split(/_{5,}/).map(p => p.trim()).filter(p => p.length > 0);
        
        if (parts.length === 0 && ghi_chu.trim().length > 0) {
            parts.push(ghi_chu.trim());
        }

        parts.forEach(part => {
            // Header: (1) Mã NX | WHB4 - Ngành - Yêu Cầu
            messageText += `(${counter}) ${ma_nx} | WHB4 - ${nganh} - ${yeu_cau}\n`;
            
            // Tìm số lượng kiện: "Số Lượng : [X] Kiện"
            const slRegex = /Số Lượng\s*:\s*([\d\s\u2026\.]+)\s*Kiện/i;
            const slMatch = part.match(slRegex);
            
            let slText = '... Kiện';
            let guiText = part;

            if (slMatch) {
                slText = slMatch[1].trim() + ' Kiện';
                guiText = part.replace(slMatch[0], '').trim();
                guiText = guiText.replace(/^[\s\-\n\r:]+|[\s\-\n\r:]+$/g, '');
            }

            messageText += `Gửi : ${guiText}\n`;
            messageText += `Số Lượng : ${slText}\n`;
            messageText += `-------\n\n`;
            counter++;
        });
    });

    if (!messageText) {
        showToast('Không có nội dung ghi chú nào để xuất.', 'info');
        return;
    }

    const modal = document.getElementById('msg-export-modal');
    const contentArea = document.getElementById('msg-export-content');
    contentArea.value = messageText.trim();
    modal.classList.remove('hidden');
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

    document.getElementById('don-hang-file-drop-area').style.display = isViewMode ? 'none' : 'flex';
    document.getElementById('don-hang-them-vat-tu-btn').classList.toggle('hidden', !isEditOrAdd || !(currentUser.phan_quyen === 'Admin' || currentUser.phan_quyen === 'User'));

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
        uniqueNganhList = Array.from(nganhMap, ([nganh, phu_trach]) => ({ nganh, phu_trach })).sort((a,b) => a.nganh.localeCompare(b.nganh));
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

    if (mode === 'add') {
        document.getElementById('don-hang-modal-title').textContent = 'Thêm Đơn Hàng Mới';
        document.getElementById('don-hang-edit-mode-ma-kho').value = '';
        maKhoInput.readOnly = true;

        const today = new Date();
        document.getElementById('don-hang-modal-thoi-gian').valueAsDate = today;
        document.getElementById('don-hang-modal-loai-don').value = ''; 
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

    } else {
        document.getElementById('don-hang-modal-title').textContent = isViewMode ? 'Xem Chi Tiết Đơn Hàng' : 'Sửa Đơn Hàng';
        document.getElementById('don-hang-edit-mode-ma-kho').value = dh.ma_kho;
        maKhoInput.readOnly = true;
        
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
        initialChiTietItems = JSON.parse(JSON.stringify(chiTietItems));
    }

    renderFileList();
    renderChiTietTable();
    modal.classList.remove('hidden');
}

async function syncChiTietDonHang(ma_kho_don_hang, donHangInfo) {
    const itemsToAdd = [];
    const itemsToUpdate = [];
    
    for (const item of chiTietItems) {
        if (!item) continue;
        if (!item.nganh && item.tonKhoData) item.nganh = item.tonKhoData.nganh;
        if (!item.phu_trach && item.tonKhoData) item.phu_trach = item.tonKhoData.phu_trach;
    }

    chiTietItems.forEach((item, index) => {
        if (!item) return;
        const baseData = {
            stt: index + 1,
            id: item.id.toString().startsWith('new-') ? crypto.randomUUID() : item.id, 
            ma_kho: ma_kho_don_hang,
            thoi_gian: donHangInfo.thoi_gian,
            ma_nx: donHangInfo.ma_nx,
            ma_vt: item.ma_vt,
            ma_vach: item.ma_vach,
            ten_vt: item.ten_vt,
            lot: item.lot,
            date: item.date,
            yc_sl: item.yc_sl,
            nhap: donHangInfo.loai_don === 'Nhap' ? item.sl : 0,
            xuat: donHangInfo.loai_don === 'Xuat' ? item.sl : 0,
            loai: item.loai,
            yeu_cau: donHangInfo.yeu_cau,
            muc_dich: donHangInfo.muc_dich,
            nganh: item.nganh, 
            phu_trach: item.phu_trach,
        };
        if (item.id.toString().startsWith('new-')) {
            itemsToAdd.push(baseData);
        } else {
            itemsToUpdate.push(baseData);
        }
    });

    const initialIds = new Set(initialChiTietItems.map(item => item.id));
    const currentIds = new Set(chiTietItems.map(item => item.id).filter(id => !id.toString().startsWith('new-')));
    const idsToDelete = [...initialIds].filter(id => !currentIds.has(id));

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
            if(filePathsToRemove.length > 0) await sb.storage.from('file_don_hang').remove(filePathsToRemove);
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

        await syncChiTietDonHang(donHangData.ma_kho, { ...donHangData, loai_don });

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

async function handleDeleteMultipleDonHang() {
    const selectedIds = [...viewStates['view-don-hang'].selected];
    if (selectedIds.length === 0) return;
    
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa ${selectedIds.length} đơn hàng? Thao tác này sẽ xóa vĩnh viễn cả chi tiết và file đính kèm.`);
    if (!confirmed) return;

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
        const { data: sanPham } = await sb.from('san_pham').select('ten_vt').eq('ma_vt', ma_vt).single();
        item.ten_vt = sanPham?.ten_vt || 'Không rõ';
        showToast(`Không có tồn kho cho Mã VT: ${ma_vt}`, 'info');
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
    } catch(e) {
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
    const isAdminOrUser = currentUser.phan_quyen === 'Admin' || currentUser.phan_quyen === 'User';
    viewContainer.querySelectorAll('.dh-admin-only').forEach(el => el.classList.toggle('hidden', !isAdminOrUser));
    
    const triggerFetch = debounce(() => fetchDonHang(1), 500);
    
    document.getElementById('don-hang-search').addEventListener('input', e => {
        viewStates['view-don-hang'].searchTerm = e.target.value; triggerFetch(); });
    document.getElementById('don-hang-filter-from-date').addEventListener('change', e => {
        viewStates['view-don-hang'].filters.from_date = e.target.value; fetchDonHang(1); });
    document.getElementById('don-hang-filter-to-date').addEventListener('change', e => {
        viewStates['view-don-hang'].filters.to_date = e.target.value; fetchDonHang(1); });

     viewContainer.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (btn) openDonHangFilterPopover(btn, 'view-don-hang'); });

    document.getElementById('don-hang-reset-filters').addEventListener('click', () => {
        const state = viewStates['view-don-hang'];
        document.getElementById('don-hang-search').value = '';
        document.getElementById('don-hang-filter-from-date').value = '';
        document.getElementById('don-hang-filter-to-date').value = '';
        state.searchTerm = '';
        state.filters = { from_date: '', to_date: '', loai: [], trang_thai_xu_ly: [], ma_kho: [], ma_nx: [], yeu_cau: [], nganh: [] };
        viewContainer.querySelectorAll('#view-don-hang .filter-btn').forEach(btn => {
            btn.textContent = filterButtonDefaultTexts[btn.id]; });
        fetchDonHang(1);
    });

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

    // Chức năng cho cột Ghi Chú: Tự động điền 'Số Lượng :  ... Kiện' và chèn ngăn cách Shift + Enter
    const ghiChuInput = document.getElementById('don-hang-modal-ghi-chu');
    if (ghiChuInput) {
        ghiChuInput.addEventListener('focus', function() {
            if (!this.value.trim()) {
                this.value = 'Số Lượng :  ... Kiện';
                // Đưa cursor về trước dấu ...
                const pos = 13; // "Số Lượng :  ".length
                setTimeout(() => {
                    this.setSelectionRange(pos, pos + 3);
                }, 0);
            }
        });

        ghiChuInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                const text = this.value;
                const before = text.substring(0, start);
                const after = text.substring(end);
                const separator = '\n_____________\nSố Lượng :  ... Kiện';
                this.value = before + separator + after;
                
                // Di chuyển cursor đến vị trí mới
                const newPos = start + separator.length - 8; // Vị trí dấu ...
                this.setSelectionRange(newPos, newPos + 3);
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
            const contentArea = document.getElementById('msg-export-content');
            if (!contentArea.value) return;
            
            contentArea.select();
            navigator.clipboard.writeText(contentArea.value).then(() => {
                showToast('Đã copy tin nhắn vào clipboard!', 'success');
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

    document.getElementById('don-hang-modal-loai-don').addEventListener('change', () => {
        updateGeneratedCodes();
        toggleDonHangModalColumns();
        chiTietItems.forEach(item => {
            if (item) item.sl = 0;
        });
        renderChiTietTable();
    });
    document.getElementById('don-hang-modal-nganh').addEventListener('input', debounce(updateGeneratedCodes, 300));

    const dropArea = document.getElementById('don-hang-file-drop-area');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, e => {e.preventDefault(); e.stopPropagation();}));
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
    if(chiTietBody) {
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
            const pastedValues = pasteData.split(/[\r\n]+/).filter(val => val.trim() !== '');
            if (pastedValues.length === 0) return;

            const targetRow = targetInput.closest('tr.chi-tiet-row');
            const targetId = targetRow.dataset.id;
            const targetField = targetInput.dataset.field;
            
            const startIndex = chiTietItems.findIndex(item => item && item.id == targetId);
            if (startIndex === -1) {
                return;
            }

            showLoading(true);
            showToast(`Đang dán ${pastedValues.length} mục...`, 'info');

            try {
                const maVtUpdatePromises = [];

                for (let i = 0; i < pastedValues.length; i++) {
                    const targetIndex = startIndex + i;
                    let value = pastedValues[i].trim();

                    let currentItem = chiTietItems[targetIndex];

                    if (!currentItem) {
                        currentItem = { id: `new-${Date.now()}-${Math.random()}`, loai: null, sl: 0, yc_sl: 1, pendingData: { nhap: 0, xuat: 0 } };
                        chiTietItems.push(currentItem);
                    }

                    if (targetField === 'yc_sl' || targetField === 'sl') {
                        const numValue = parseInt(value, 10);
                        currentItem[targetField] = isNaN(numValue) ? null : numValue;
                    } else {
                        currentItem[targetField] = value;
                    }

                    if (targetField === 'ma_vt') {
                        maVtUpdatePromises.push(updateItemFromMaVt(currentItem, value));
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
        chiTietItems.push({ id: `new-${Date.now()}-${Math.random()}`, loai: null, sl: 0, yc_sl: 1, pendingData: { nhap: 0, xuat: 0 } });
        renderChiTietTable();
    });

    document.getElementById('don-hang-chi-tiet-fill-loai-all').addEventListener('click', () => {
        if (chiTietItems.length < 1) return;
        const firstItemLoai = chiTietItems[0]?.loai;
        if (!firstItemLoai) {
            showToast('Vui lòng chọn "Loại" cho dòng đầu tiên trước khi áp dụng cho tất cả.', 'error');
            return;
        }

        chiTietItems.forEach(item => {
            if (item) {
                item.loai = firstItemLoai;
            }
        });

        renderChiTietTable();
        showToast(`Đã áp dụng "${firstItemLoai}" cho tất cả các dòng.`, 'success');
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
            if(item) {
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
        const item = chiTietItems.find(i => i && i.id == id);

        if (item) {
            const oldValue = item[field];
            item[field] = value;
            
            if (field === 'yc_sl') {
                if(value <= 0) {
                    showToast('Yêu cầu (Y/c) phải lớn hơn 0.', 'error');
                    item.yc_sl = oldValue || 1;
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
                 } else if (loaiDon === 'Xuat' && currentTotalInUI > stockBeforeThisOrder) {
                    showToast(`Tổng số lượng xuất (${currentTotalInUI}) vượt quá tồn kho (${stockBeforeThisOrder}).`, 'error');
                    item.sl = oldValue !== undefined ? oldValue : 0;
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
    
    chiTietBody.addEventListener('focusin', async (e) => {
        const input = e.target;
        if (input.classList.contains('chi-tiet-input') && input.dataset.field === 'ma_vt') {
            await handleMaVtAutocomplete(input);
        }
    });

    chiTietBody.addEventListener('keydown', handleSmartTabNavigation);

    document.getElementById('don-hang-items-per-page').addEventListener('change', (e) => {
        viewStates['view-don-hang'].itemsPerPage = parseInt(e.target.value, 10); fetchDonHang(1); });
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
    pageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handlePageJump(); e.target.blur(); }});
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
        if(filePathsToRemove.length > 0) await sb.storage.from('file_don_hang').remove(filePathsToRemove);
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
}async function updateDonHangField(ma_kho, field, value) {
    const dh = cache.donHangList.find(item => item.ma_kho === ma_kho);
    if (!dh || dh[field] === value) {
        renderDonHangTable(cache.donHangList);
        return;
    }

    showLoading(true);
    try {
        const { error } = await sb.from('don_hang').update({ [field]: value }).eq('ma_kho', ma_kho);
        if (error) throw error;
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
        inputHtml = `<input type="text" class="w-full p-2 border-2 border-blue-400 rounded text-center font-bold text-sm" value="${currentValue || ''}">`;
    } else {
        inputHtml = `<textarea class="w-full p-2 border-2 border-blue-400 rounded text-sm" rows="4">${currentValue || ''}</textarea>`;
    }

    cell.innerHTML = `
        <div class="flex flex-col gap-2 p-1 min-w-[200px]">
            ${inputHtml}
            <div class="flex justify-end gap-2">
                <button class="save-inline-btn bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 shadow-md flex items-center gap-1 font-bold text-xs" title="Lưu và Khóa">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    XÁC NHẬN
                </button>
                <button class="cancel-inline-btn bg-gray-500 text-white px-3 py-1.5 rounded hover:bg-gray-600 shadow-md font-bold text-xs" title="Hủy">
                    HỦY
                </button>
            </div>
        </div>
    `;

    const input = cell.querySelector('input, textarea');
    
    // NÂNG CẤP: Logic thông minh cho Ghi chú (giống trong form)
    if (field === 'ghi_chu') {
        input.addEventListener('focus', function() {
            if (!this.value.trim()) {
                this.value = 'Số Lượng :  ... Kiện';
                const pos = 13;
                setTimeout(() => this.setSelectionRange(pos, pos + 3), 0);
            }
        });

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                const text = this.value;
                const before = text.substring(0, start);
                const after = text.substring(end);
                const separator = '\n_____________\nSố Lượng :  ... Kiện';
                this.value = before + separator + after;
                const newPos = start + separator.length - 8;
                this.setSelectionRange(newPos, newPos + 3);
            }
        });
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
