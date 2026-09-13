
const { createClient } = supabase;
const SUPABASE_URL = "https://uefydnefprcannlviimp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlZnlkbmVmcHJjYW5ubHZpaW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNTcwMDUsImV4cCI6MjA3NjYzMzAwNX0.X274J_1_crUknJEOT1WWUD1h0HM9WdYScDW2eWWsiLk";
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

let initialUser = null;
try {
    const raw = sessionStorage.getItem('loggedInUser');
    if (raw) initialUser = JSON.parse(raw);
} catch (e) {}
export let currentUser = initialUser;
let currentView = 'view-phat-trien'; 
let userChannel = null; 
let adminNotificationChannel = null;
let presenceChannel = null;
let dataChannel = null; 
export const onlineUsers = new Map();
export const DEFAULT_AVATAR_URL = 'https://t4.ftcdn.net/jpg/05/49/98/39/360_F_549983970_bRCkYfk0P6PP5fKbMhZMIb07vs1cACai.jpg';
export const PLACEHOLDER_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Placeholder_view_vector.svg/681px-Placeholder_view_vector.svg.png';
export const cache = {
    userList: [],
    sanPhamList: [],
    tonKhoList: [],
    donHangList: [],
    chiTietList: [],
};
export const viewStates = {
    'view-san-pham': {
        currentPage: 1,
        itemsPerPage: 50,
        searchTerm: '',
        selected: new Set(),
        filters: { ma_vt: [], ten_vt: [], nganh: [], phu_trach: [] },
        totalFilteredCount: 0,
        paginationText: '',
    },
    'view-ton-kho': {
        currentPage: 1,
        itemsPerPage: 50,
        searchTerm: '',
        selected: new Set(),
        filters: { ma_vach: [], ma_vt: [], ten_vt: [], lot: [], date: [], ton_dau: [], nhap: [], xuat: [], ton_cuoi: [], tinh_trang: [], tray: [], nganh: [], phu_trach: [], note: [] },
        stockAvailability: 'available',
        sortBy: 'ma_vach',
        sortAsc: true,
        totalFilteredCount: 0,
        paginationText: '',
        dateTo: '',
    },
    'view-don-hang': {
        currentPage: 1,
        itemsPerPage: 50,
        searchTerm: '',
        selected: new Set(),
        filters: { from_date: '', to_date: '', loai: [], trang_thai_xu_ly: [], ma_kho: [], thoi_gian: [], ma_nx: [], yeu_cau: [], nganh: [], muc_dich: [], ghi_chu: [] },
        sortBy: 'thoi_gian',
        sortAsc: false,
        totalFilteredCount: 0,
        paginationText: '',
    },
    'view-chi-tiet': {
        currentPage: 1,
        itemsPerPage: 50,
        searchTerm: '',
        filters: { from_date: '', to_date: '', thoi_gian: [], ma_kho: [], ma_nx: [], ma_vach: [], ma_vt: [], ten_vt: [], lot: [], date: [], yc_sl: [], nhap: [], xuat: [], loai: [], yeu_cau: [], muc_dich: [], nganh: [], phu_trach: [] },
        sortBy: 'thoi_gian',
        sortAsc: false,
        totalFilteredCount: 0,
        paginationText: '',
    }
};
let isViewInitialized = {
    'view-phat-trien': false,
    'view-san-pham': false,
    'view-ton-kho': false,
    'view-don-hang': false,
    'view-chi-tiet': false,
    'view-cai-dat': false,
};
export const filterButtonDefaultTexts = {
    'san-pham-filter-ma-vt-btn': 'Mã VT', 
    'san-pham-filter-ten-vt-btn': 'Tên Vật Tư', 
    'san-pham-filter-nganh-btn': 'Ngành', 
    'san-pham-filter-phu-trach-btn': 'Phụ Trách',
    'ton-kho-filter-ma-vt-btn': 'Mã VT',
    'ton-kho-filter-lot-btn': 'Lot',
    'ton-kho-filter-date-btn': 'Date',
    'ton-kho-filter-tinh-trang-btn': 'Tình Trạng',
    'ton-kho-filter-nganh-btn': 'Ngành',
    'ton-kho-filter-phu-trach-btn': 'Phụ Trách',
    'don-hang-filter-loai-btn': 'Loại',
    'don-hang-filter-trang-thai-btn': 'Trạng Thái',
    'don-hang-filter-ma-kho-btn': 'Mã Kho',
    'don-hang-filter-ma-nx-btn': 'Mã NX',
    'don-hang-filter-yeu-cau-btn': 'Yêu Cầu',
    'don-hang-filter-nganh-btn': 'Ngành',
    'chi-tiet-filter-thoi-gian-btn': 'Thời Gian',
    'chi-tiet-filter-ma-kho-btn': 'Mã Kho',
    'chi-tiet-filter-ma-nx-btn': 'Mã NX',
    'chi-tiet-filter-ma-vach-btn': 'Code + Lot + EXP',
    'chi-tiet-filter-ma-vt-btn': 'Mã VT',
    'chi-tiet-filter-ten-vt-btn': 'Tên VT',
    'chi-tiet-filter-lot-btn': 'LOT',
    'chi-tiet-filter-date-btn': 'Date',
    'chi-tiet-filter-yc-sl-btn': 'Y/C',
    'chi-tiet-filter-nhap-btn': 'Nhập',
    'chi-tiet-filter-xuat-btn': 'Xuất',
    'chi-tiet-filter-loai-btn': 'Loại',
    'chi-tiet-filter-yeu-cau-btn': 'Yêu Cầu',
    'chi-tiet-filter-muc-dich-btn': 'Mục Đích',
    'chi-tiet-filter-nganh-btn': 'Ngành',
    'chi-tiet-filter-phu-trach-btn': 'Phụ Trách',
};
let activeAutocompletePopover = null;

// --- OFFLINE QUEUE MANAGEMENT ---
const OFFLINE_QUEUE_KEY = 'offlineQueue';
const getOfflineQueue = () => JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)) || [];
const saveOfflineQueue = (queue) => localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));

export function openPrintPreviewModal(url, title = 'Xem trước khi in') {
    const modal = document.getElementById('print-preview-modal');
    const iframe = document.getElementById('print-preview-iframe');
    const titleEl = document.getElementById('print-preview-title');
    const maximizeBtn = document.getElementById('print-preview-maximize-btn');

    if (!modal || !iframe || !titleEl || !maximizeBtn) return;
    
    modal.style.left = '10vw';
    modal.style.top = '5vh';
    modal.style.transform = '';

    iframe.src = url;
    titleEl.textContent = title;
    maximizeBtn.dataset.url = url;
    modal.classList.remove('hidden');
}

export function updateOfflineIndicator() {
    const queue = getOfflineQueue();
    const indicator = document.getElementById('offline-sync-indicator');
    const countEl = document.getElementById('offline-sync-count');
    if (indicator && countEl) {
        if (queue.length > 0) {
            indicator.classList.remove('hidden');
            countEl.textContent = queue.length;
        } else {
            indicator.classList.add('hidden');
        }
    }
}

export async function processOfflineQueue() {
    if (!navigator.onLine) return;
    let queue = getOfflineQueue();
    if (queue.length === 0) return;

    showToast(`Đang đồng bộ ${queue.length} thay đổi offline...`, 'info');
    const { executeSaveOrderJob } = await import('./don-hang.js');

    const failedJobs = [];
    for (const job of queue) {
        try {
            if (job.type === 'save-don-hang') {
                await executeSaveOrderJob(job.payload);
                showToast(`Đồng bộ thành công đơn hàng: ${job.payload.donHangData.ma_kho}`, 'success');
            }
        } catch (error) {
            console.error('Offline sync failed for job:', job.id, error);
            showToast(`Đồng bộ thất bại cho đơn hàng ${job.payload.donHangData.ma_kho}. Sẽ thử lại sau.`, 'error');
            failedJobs.push(job); 
        }
    }

    saveOfflineQueue(failedJobs);
    updateOfflineIndicator();
}

export function addJobToOfflineQueue(job) {
    const queue = getOfflineQueue();
    job.id = job.id || `job-${Date.now()}`;
    queue.push(job);
    saveOfflineQueue(queue);
    updateOfflineIndicator();
}
// --- END OF FLINE QUEUE ---


export const showLoading = (show) => document.getElementById('loading-bar').classList.toggle('hidden', !show);

// Biến lưu trữ nội dung các thông báo đang hiển thị
const activeToasts = new Set();

export function showToast(message, type = 'info') {
    // Nếu thông báo với nội dung này đang hiển thị, không hiện thêm
    if (activeToasts.has(message)) return;

    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    activeToasts.add(message);
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => {
            toast.remove();
            activeToasts.delete(message); // Xóa khỏi danh sách theo dõi sau khi biến mất hoàn toàn
        });
    }, 3000);
}

export function showConfirm(message, title = 'Xác nhận hành động') {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        titleEl.textContent = title;
        messageEl.textContent = message;

        const cleanup = (result) => {
            modal.classList.add('hidden');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(result);
        };

        okBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);

        modal.classList.remove('hidden');
    });
}

export function sanitizeFileName(fileName) {
    if (!fileName) return '';
    const lastDot = fileName.lastIndexOf('.');
    const nameWithoutExt = lastDot !== -1 ? fileName.slice(0, lastDot) : fileName;
    const ext = lastDot !== -1 ? fileName.slice(lastDot) : '';

    return nameWithoutExt
        .normalize('NFD') 
        .replace(/[\u0300-\u036f]/g, '') 
        .toLowerCase() 
        .replace(/\s+/g, '-') 
        .replace(/[^a-z0-9-.]/g, '') + 
        ext; 
}

export const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(null, args);
        }, delay);
    };
};

export function formatMaNxHtml(maNx) {
    if (!maNx) return '';
    const str = String(maNx).trim();
    if (!str) return '';

    if (str.includes(',')) {
        return str.split(',').map(part => formatMaNxHtml(part.trim())).join(', ');
    }

    const isPending = str.endsWith('-');
    const upper = str.toUpperCase();

    if (upper.startsWith('DO')) {
        if (isPending) {
            return `<span class="text-red-600 font-bold">DO</span><span class="text-amber-500 font-bold">${str.substring(2)}</span>`;
        } else {
            return `<span class="text-red-600 font-bold">${str}</span>`;
        }
    } else if (upper.startsWith('RO')) {
        if (isPending) {
            return `<span class="text-green-600 font-bold">RO</span><span class="text-amber-500 font-bold">${str.substring(2)}</span>`;
        } else {
            return `<span class="text-green-600 font-bold">${str}</span>`;
        }
    } else {
        if (isPending) {
            return `<span class="text-amber-500 font-bold">${str}</span>`;
        } else {
            return `<span class="text-green-600 font-bold">${str}</span>`;
        }
    }
}

export function formatMaNxBadgeHtml(maNxDisplay) {
    if (!maNxDisplay) return '';
    const str = String(maNxDisplay).trim();
    if (!str) return '';

    const isPending = str.endsWith('-');
    const upper = str.toUpperCase();
    const isDO = upper.startsWith('DO');

    let bgBorderClass = 'bg-green-50 text-green-800 border border-green-200';
    if (isPending) {
        bgBorderClass = 'bg-amber-50 text-amber-800 border border-amber-300';
    } else if (isDO) {
        bgBorderClass = 'bg-red-50 text-red-800 border border-red-200';
    }

    const truncated = str.length > 30 ? str.substring(0, 30) + '…' : str;
    const content = formatMaNxHtml(truncated);
    return `<span class="${bgBorderClass} text-[11px] px-2 py-0.5 rounded font-bold whitespace-nowrap flex-shrink-0" title="${str}">${content}</span>`;
}

export function renderPagination(viewPrefix, totalItems, from, to, overridePageSize = null) {
    const state = viewStates[`view-${viewPrefix}`];
    if (!state) return;
    
    const { currentPage, itemsPerPage } = state;
    const pageSize = overridePageSize || itemsPerPage;
    const totalPages = Math.ceil(totalItems / pageSize);
    const paginationInfoEl = document.getElementById(`${viewPrefix}-pagination-info`);
    const pageInput = document.getElementById(`${viewPrefix}-page-input`);
    const totalPagesEl = document.getElementById(`${viewPrefix}-total-pages`);
    const prevBtn = document.getElementById(`${viewPrefix}-prev-page`);
    const nextBtn = document.getElementById(`${viewPrefix}-next-page`);

    const actualTo = Math.min(to + 1, totalItems);
    const paginationText = `(Hiển thị ${from + 1} - ${actualTo} trên ${totalItems})`;
    state.paginationText = paginationText;

    if(paginationInfoEl) paginationInfoEl.textContent = paginationText;
    
    if (pageInput) {
        pageInput.value = currentPage;
        pageInput.max = totalPages > 0 ? totalPages : 1;
        pageInput.min = 1;
    }
    if (totalPagesEl) {
        totalPagesEl.textContent = `/ ${totalPages > 0 ? totalPages : 1}`;
    }
    
    if(prevBtn) prevBtn.disabled = currentPage <= 1;
    if(nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

export function updateSidebarAvatar(url) {
    document.getElementById('sidebar-avatar').src = url || DEFAULT_AVATAR_URL;
}

export function initResizableTable(table, storageKey = null) {
    if (!table) return;

    table.classList.add('resizable-table');
    table.style.tableLayout = 'fixed';
    const ths = table.querySelectorAll('thead th');
    if (ths.length === 0) return;

    const userKey = (currentUser && (currentUser.gmail || currentUser.ho_ten || currentUser.id)) ? (currentUser.gmail || currentUser.ho_ten || currentUser.id) : 'default';
    const fullStorageKey = storageKey ? `${storageKey}_${userKey}` : null;

    // Apply saved column widths for current account if present
    if (fullStorageKey) {
        try {
            const savedWidths = JSON.parse(localStorage.getItem(fullStorageKey));
            if (savedWidths && typeof savedWidths === 'object') {
                let totalSavedWidth = 0;
                ths.forEach(th => {
                    const col = th.dataset.col;
                    if (col && savedWidths[col]) {
                        const w = parseInt(savedWidths[col], 10);
                        if (!isNaN(w) && w > 0) {
                            th.style.width = `${w}px`;
                            th.style.minWidth = `${w}px`;
                            totalSavedWidth += w;
                        }
                    } else if (th.offsetParent !== null && !th.classList.contains('hidden')) {
                        const w = parseInt(th.style.width, 10) || Math.round(th.getBoundingClientRect().width) || 80;
                        totalSavedWidth += w;
                    }
                });
                if (totalSavedWidth > 0) {
                    const container = table.closest('.table-container') || table.parentElement;
                    const containerWidth = container ? container.clientWidth : window.innerWidth;
                    table.style.width = `${Math.max(totalSavedWidth, containerWidth)}px`;
                    table.style.minWidth = '100%';
                }
            }
        } catch (e) {
            console.warn('Error reading col widths from localStorage', e);
        }
    }

    ths.forEach((th) => {
        th.style.position = 'relative';

        if (!th.querySelector('.col-resizer') && !th.classList.contains('no-resize') && th.dataset.col !== 'select') {
            const resizer = document.createElement('div');
            resizer.className = 'col-resizer';
            th.appendChild(resizer);
            
            let startX, startWidth, startTableWidth;

            const onMouseDown = (e) => {
                e.preventDefault();
                e.stopPropagation();

                const container = table.closest('.table-container') || table.parentElement;
                const containerWidth = container ? container.clientWidth : window.innerWidth;

                // Fix pixel widths on all visible columns
                let currentTotalTableWidth = 0;
                ths.forEach(otherTh => {
                    if (!otherTh.classList.contains('hidden') && otherTh.offsetParent !== null) {
                        const currentW = Math.round(otherTh.getBoundingClientRect().width);
                        otherTh.style.width = `${currentW}px`;
                        otherTh.style.minWidth = `${currentW}px`;
                        currentTotalTableWidth += currentW;
                    }
                });

                table.style.tableLayout = 'fixed';
                table.style.minWidth = '100%';
                const initialTableW = Math.max(currentTotalTableWidth, containerWidth);
                table.style.width = `${initialTableW}px`;

                startX = e.clientX;
                startWidth = Math.round(th.getBoundingClientRect().width);
                startTableWidth = initialTableW;
                resizer.classList.add('is-resizing');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';

                const onMouseMove = (moveEvent) => {
                    const diffX = moveEvent.clientX - startX;
                    const minAllowedWidth = th.dataset.col === 'select' || th.dataset.col === 'note' ? 35 : 45;
                    const newWidth = Math.max(minAllowedWidth, startWidth + diffX);
                    const delta = newWidth - startWidth;
                    
                    th.style.width = `${newWidth}px`;
                    th.style.minWidth = `${newWidth}px`;
                    
                    // Table width never shrinks below container width (100%) so no empty white gap is created
                    const newTableW = Math.max(startTableWidth + delta, containerWidth);
                    table.style.width = `${newTableW}px`;
                    table.style.minWidth = '100%';
                };

                const onMouseUp = () => {
                    resizer.classList.remove('is-resizing');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);

                    // Persist column widths for current account
                    if (fullStorageKey) {
                        try {
                            const widths = {};
                            ths.forEach(t => {
                                const col = t.dataset.col;
                                if (col) {
                                    const w = Math.round(t.getBoundingClientRect().width);
                                    if (w > 0) {
                                        widths[col] = w;
                                    }
                                }
                            });
                            localStorage.setItem(fullStorageKey, JSON.stringify(widths));
                        } catch (e) {
                            console.warn('Error saving column widths to localStorage:', e);
                        }
                    }
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };

            resizer.addEventListener('mousedown', onMouseDown);
        }
    });
}

export function updateFilterButtonTexts(viewPrefix) {
    const state = viewStates[`view-${viewPrefix}`];
    if (!state) return;
    
    const viewContainer = document.getElementById(`view-${viewPrefix}`);
    if (!viewContainer) return;

    let hasActiveFilter = false;

    // 1. Cập nhật các nút filter-btn
    viewContainer.querySelectorAll('.filter-btn').forEach(btn => {
        const filterKey = btn.dataset.filterKey;
        if (filterKey && state.filters && state.filters.hasOwnProperty(filterKey)) {
            const selectedOptions = state.filters[filterKey] || [];
            const count = Array.isArray(selectedOptions) ? selectedOptions.length : (selectedOptions ? 1 : 0);
            if (count > 0) hasActiveFilter = true;

            const badge = btn.querySelector('.filter-badge');
            
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.classList.remove('hidden');
                    btn.classList.add('text-blue-600', 'bg-blue-100', 'font-bold');
                    btn.classList.remove('text-gray-500');
                } else {
                    badge.textContent = '';
                    badge.classList.add('hidden');
                    btn.classList.remove('text-blue-600', 'bg-blue-100', 'font-bold');
                    btn.classList.add('text-gray-500');
                }
            } else {
                const defaultText = filterButtonDefaultTexts[btn.id] || 'Filter';
                if (filterKey.includes('date') && selectedOptions) {
                     btn.textContent = defaultText; 
                } else if (Array.isArray(selectedOptions)) {
                    btn.textContent = count > 0 ? `${defaultText} (${count})` : defaultText;
                }
            }
        }
    });

    // 2. Kiểm tra các điều kiện lọc và tìm kiếm khác
    if (state.searchTerm && String(state.searchTerm).trim() !== '') {
        hasActiveFilter = true;
    }
    if (state.dateTo && String(state.dateTo).trim() !== '') {
        hasActiveFilter = true;
    }
    if (state.filters) {
        if (state.filters.from_date || state.filters.to_date) {
            hasActiveFilter = true;
        }
        for (const [k, v] of Object.entries(state.filters)) {
            if (Array.isArray(v) && v.length > 0) hasActiveFilter = true;
            else if (typeof v === 'string' && v.trim() !== '') hasActiveFilter = true;
        }
    }

    // 3. Đổi màu nút Xóa Lọc sang ĐỎ DỊU (soft pastel red) giống các nút bên cạnh nếu đang lọc / đang tìm kiếm
    const resetBtn = document.getElementById(`${viewPrefix}-reset-filters`) || viewContainer.querySelector(`[id$="-reset-filters"]`);
    if (resetBtn) {
        if (hasActiveFilter) {
            resetBtn.classList.remove('border-slate-300', 'bg-white', 'hover:bg-slate-50', 'text-slate-700');
            resetBtn.classList.add('bg-rose-50', 'hover:bg-rose-100', 'text-rose-700', 'border-rose-300', 'font-bold');
            const svg = resetBtn.querySelector('svg');
            if (svg) {
                svg.classList.remove('text-slate-500', 'text-white');
                svg.classList.add('text-rose-600');
            }
        } else {
            resetBtn.classList.remove('bg-rose-50', 'hover:bg-rose-100', 'text-rose-700', 'border-rose-300', 'font-bold');
            resetBtn.classList.add('border-slate-300', 'bg-white', 'hover:bg-slate-50', 'text-slate-700');
            const svg = resetBtn.querySelector('svg');
            if (svg) {
                svg.classList.remove('text-rose-600', 'text-white');
                svg.classList.add('text-slate-500');
            }
        }
    }
}

function closeActiveAutocompletePopover() {
    if (activeAutocompletePopover) {
        activeAutocompletePopover.element.remove();
        document.removeEventListener('click', activeAutocompletePopover.closeHandler);
        activeAutocompletePopover = null;
    }
}

export function openAutocomplete(inputElement, suggestions, config) {
    closeActiveAutocompletePopover(); 
    if (suggestions.length === 0) return;

    const popoverTemplate = document.getElementById('autocomplete-popover-template');
    if (!popoverTemplate) return;

    const popoverContent = popoverTemplate.content.cloneNode(true);
    const popover = popoverContent.querySelector('div'); 
    
    const optionsList = popover.querySelector('.autocomplete-options-list');

    // NÂNG CẤP: Hỗ trợ config.itemClass để gán màu sắc/style cho từng mục gợi ý
    optionsList.innerHTML = suggestions.map(item => {
        const itemExtraClass = config.itemClass ? config.itemClass(item) : '';
        if (config.customHtml) {
            return `
                <div class="px-3 py-2 cursor-pointer hover:bg-gray-100 autocomplete-option ${itemExtraClass}" data-value="${item[config.valueKey]}">
                    ${config.customHtml(item)}
                </div>
            `;
        }
        return `
            <div class="px-3 py-2 cursor-pointer hover:bg-gray-100 autocomplete-option ${itemExtraClass}" data-value="${item[config.valueKey]}">
                <div class="flex justify-between items-center pointer-events-none gap-4">
                    <p class="text-sm font-medium text-gray-900 whitespace-nowrap">${item[config.primaryTextKey]}</p>
                    ${config.secondaryTextKey ? `<p class="text-xs text-gray-500 whitespace-nowrap text-right ml-4">${item[config.secondaryTextKey] || ''}</p>` : ''}
                </div>
            </div>
        `;
    }).join('');

    if (config.customStyles) {
        Object.assign(optionsList.style, config.customStyles);
    }

    inputElement.parentNode.appendChild(popover);
    popover.style.top = `${inputElement.offsetTop + inputElement.offsetHeight}px`;
    popover.style.left = `${inputElement.offsetLeft}px`;
    popover.style.minWidth = `${inputElement.offsetWidth}px`;
    popover.style.width = 'max-content';
    popover.style.maxWidth = '400px'; 
    
    // Đảm bảo parent có position: relative để popover định vị đúng
    if (window.getComputedStyle(inputElement.parentNode).position === 'static') {
        inputElement.parentNode.style.position = 'relative';
    } 
    
    optionsList.addEventListener('mousedown', (e) => { 
        const option = e.target.closest('.autocomplete-option');
        if (option) {
            e.preventDefault(); 
            config.onSelect(option.dataset.value);
            closeActiveAutocompletePopover(); 
        }
    });
    
    const closeHandler = (e) => {
        if (!inputElement.contains(e.target) && !popover.contains(e.target)) {
            closeActiveAutocompletePopover();
        }
    };
    
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
    
    activeAutocompletePopover = { element: popover, closeHandler: closeHandler };
}

export function updateTonKhoToggleUI() {
    const toggleAvailableBtn = document.getElementById('ton-kho-toggle-available');
    const toggleAllBtn = document.getElementById('ton-kho-toggle-all');
    if (!toggleAvailableBtn || !toggleAllBtn) return;
    
    const state = viewStates['view-ton-kho'];
    const currentMode = state.stockAvailability || 'available';
    
    if (currentMode === 'available') {
        toggleAvailableBtn.classList.add('bg-white', 'shadow-sm', 'font-semibold');
        toggleAvailableBtn.classList.remove('text-gray-500');
        toggleAllBtn.classList.remove('bg-white', 'shadow-sm', 'font-semibold');
        toggleAllBtn.classList.add('text-gray-500');
    } else {
        toggleAllBtn.classList.add('bg-white', 'shadow-sm', 'font-semibold');
        toggleAllBtn.classList.remove('text-gray-500');
        toggleAvailableBtn.classList.remove('bg-white', 'shadow-sm', 'font-semibold');
        toggleAvailableBtn.classList.add('text-gray-500');
    }
}

// Helper hàm lấy màu chữ tình trạng tồn kho theo dải màu chuẩn (không khung, chữ màu)
export function getTonKhoTinhTrangTextColor(tinhTrang) {
    if (!tinhTrang) return 'text-slate-400';
    const tt = String(tinhTrang).trim();
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
    if (tt === 'Hàng hư') {
        return 'text-purple-600 font-semibold';
    }
    return 'text-slate-700 font-medium';
}

// Helper hàm lấy trọng số thứ tự tình trạng tồn kho
// isAsc = true (A-Z): từ nhỏ đến lớn (1-30 -> ... -> Trên 180 -> Hết hạn -> Không có date -> Hàng hư)
// isAsc = false (Z-A): từ lớn đến nhỏ (Không có date -> Hết hạn -> Hàng hư -> Trên 180 -> ... -> 1-30)
export function getTonKhoTinhTrangWeight(val, isAsc = true) {
    const v = String(val || '').toLowerCase().trim();
    if (isAsc) {
        if (v.includes('1-30')) return 1;
        if (v.includes('31-60')) return 2;
        if (v.includes('61-90')) return 3;
        if (v.includes('91-120')) return 4;
        if (v.includes('121-150')) return 5;
        if (v.includes('151-180')) return 6;
        if (v.includes('trên 180') || v.includes('tren 180') || v.includes('còn sử dụng') || v.includes('con su dung')) return 7;
        if (v.includes('cận date') || v.includes('can date')) return 8;
        if (v.includes('hết hạn') || v.includes('het han')) return 90;
        if (v.includes('không') || v.includes('khong') || !val) return 95;
        if (v.includes('hư') || v.includes('hu')) return 99;
        return 80;
    } else {
        if (v.includes('không') || v.includes('khong') || !val) return 1;
        if (v.includes('hết hạn') || v.includes('het han')) return 2;
        if (v.includes('hư') || v.includes('hu')) return 3;
        if (v.includes('trên 180') || v.includes('tren 180') || v.includes('còn sử dụng') || v.includes('con su dung')) return 4;
        if (v.includes('151-180')) return 5;
        if (v.includes('121-150')) return 6;
        if (v.includes('91-120')) return 7;
        if (v.includes('61-90')) return 8;
        if (v.includes('31-60')) return 9;
        if (v.includes('1-30')) return 10;
        if (v.includes('cận date') || v.includes('can date')) return 11;
        return 50;
    }
}

export function compareTonKhoTinhTrang(statusA, statusB, isAsc = true) {
    return getTonKhoTinhTrangWeight(statusA, isAsc) - getTonKhoTinhTrangWeight(statusB, isAsc);
}

export async function openTonKhoFilterPopover(button, view) {
    const filterKey = button.dataset.filterKey;
    const state = viewStates[view];

    const template = document.getElementById('filter-popover-template');
    if (!template) return;

    // Close any other open popovers
    document.querySelectorAll('.filter-popover').forEach(p => p.remove());

    const popoverContent = template.content.cloneNode(true);
    const popover = popoverContent.querySelector('.filter-popover');
    document.body.appendChild(popover);

    const rect = button.getBoundingClientRect();
    let left = rect.left;
    if (left + 260 > window.innerWidth) {
        left = Math.max(10, window.innerWidth - 275);
    }
    popover.style.left = `${left}px`;
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

    const formatFilterOptionLabel = (key, val) => {
        if (val === null || val === undefined) return '';
        const strVal = String(val).trim();
        if (key === 'thoi_gian' || key === 'date') {
            if (/^\d{4}-\d{2}-\d{2}/.test(strVal)) {
                const parts = strVal.split('T')[0].split('-');
                if (parts.length === 3) {
                    return `${parts[2]}/${parts[1]}/${parts[0]}`;
                }
            }
            const d = new Date(strVal);
            if (!isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return `${day}/${month}/${year}`;
            }
        }
        return strVal;
    };

    const renderOptions = (options) => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const filteredOptions = options.filter(opt => 
            opt && (opt.label.toLowerCase().includes(searchTerm) || opt.value.toLowerCase().includes(searchTerm))
        );

        if (filteredOptions.length > 0) {
            optionsList.innerHTML = filteredOptions.map(opt => {
                const colorClass = filterKey === 'tinh_trang' ? getTonKhoTinhTrangTextColor(opt.value) : 'text-gray-800';
                return `
                <label class="flex items-center space-x-2 px-2 py-1.5 hover:bg-gray-100 rounded cursor-pointer">
                    <input type="checkbox" value="${opt.value}" class="filter-option-cb rounded text-blue-600 focus:ring-blue-500" ${tempSelectedOptions.has(opt.value) ? 'checked' : ''}>
                    <span class="text-sm select-none ${colorClass}">${opt.label}</span>
                </label>
            `;
            }).join('');
        } else {
            optionsList.innerHTML = '<div class="text-center p-4 text-sm text-gray-500">Không có tùy chọn.</div>';
        }
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
            const searchTerm = searchInput.value.toLowerCase().trim();
            const visibleOptions = allOptions.filter(opt => 
                opt && (opt.label.toLowerCase().includes(searchTerm) || opt.value.toLowerCase().includes(searchTerm))
            );
            
            const visibleCheckboxes = optionsList.querySelectorAll('.filter-option-cb');
            const allVisibleSelected = visibleCheckboxes.length > 0 && [...visibleCheckboxes].every(cb => cb.checked);
            
            visibleOptions.forEach(opt => {
                if (!allVisibleSelected) {
                    tempSelectedOptions.add(opt.value);
                } else {
                    tempSelectedOptions.delete(opt.value);
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
        let uniqueOptions = [];
        const latestTimeMap = new Map();
        if (view === 'view-san-pham') {
            try {
                const { data: rpcData, error } = await sb.rpc('get_san_pham_filter_options', {
                    filter_key: filterKey,
                    _ma_vt_filter: state.filters.ma_vt || [],
                    _ten_vt_filter: state.filters.ten_vt || [],
                    _nganh_filter: state.filters.nganh || [],
                    _phu_trach_filter: state.filters.phu_trach || [],
                    _search_term: state.searchTerm || '',
                    _user_role: currentUser?.phan_quyen || 'View',
                    _user_ho_ten: currentUser?.ho_ten || ''
                });
                if (error) throw error;
                uniqueOptions = Array.isArray(rpcData) ? rpcData.map(item => item.option).filter(val => val !== null && val !== undefined) : [];
            } catch (rpcErr) {
                const { data: directData } = await sb.from('san_pham').select(filterKey).not(filterKey, 'is', null).limit(5000);
                if (directData) {
                    uniqueOptions = [...new Set(directData.map(item => item[filterKey]).filter(val => val !== null && val !== undefined && val !== ''))];
                }
            }
        } else if (view === 'view-chi-tiet') {
            try {
                const selectFields = (filterKey === 'thoi_gian') ? 'thoi_gian' : `${filterKey}, thoi_gian`;
                let q = sb.from('chi_tiet').select(selectFields).not(filterKey, 'is', null).order('thoi_gian', { ascending: false, nullsFirst: false });
                if (currentUser?.phan_quyen === 'View') {
                    q = q.eq('phu_trach', currentUser.ho_ten);
                }
                if (state.searchTerm) {
                    const st = `%${state.searchTerm}%`;
                    q = q.or(`ma_kho.ilike.${st},ma_nx.ilike.${st},ma_vach.ilike.${st},ma_vt.ilike.${st},ten_vt.ilike.${st},lot.ilike.${st},loai.ilike.${st},yeu_cau.ilike.${st},muc_dich.ilike.${st},nganh.ilike.${st},phu_trach.ilike.${st}`);
                }
                if (state.filters.from_date) q = q.gte('thoi_gian', state.filters.from_date);
                if (state.filters.to_date) q = q.lte('thoi_gian', state.filters.to_date + 'T23:59:59');

                const f = state.filters;
                if (filterKey !== 'thoi_gian' && f.thoi_gian?.length > 0) q = q.in('thoi_gian', f.thoi_gian);
                if (filterKey !== 'ma_kho' && f.ma_kho?.length > 0) q = q.in('ma_kho', f.ma_kho);
                if (filterKey !== 'ma_nx' && f.ma_nx?.length > 0) q = q.in('ma_nx', f.ma_nx);
                if (filterKey !== 'ma_vach' && f.ma_vach?.length > 0) q = q.in('ma_vach', f.ma_vach);
                if (filterKey !== 'ma_vt' && f.ma_vt?.length > 0) q = q.in('ma_vt', f.ma_vt);
                if (filterKey !== 'ten_vt' && f.ten_vt?.length > 0) q = q.in('ten_vt', f.ten_vt);
                if (filterKey !== 'lot' && f.lot?.length > 0) q = q.in('lot', f.lot);
                if (filterKey !== 'date' && f.date?.length > 0) q = q.in('date', f.date);
                if (filterKey !== 'yc_sl' && f.yc_sl?.length > 0) q = q.in('yc_sl', f.yc_sl);
                if (filterKey !== 'nhap' && f.nhap?.length > 0) q = q.in('nhap', f.nhap);
                if (filterKey !== 'xuat' && f.xuat?.length > 0) q = q.in('xuat', f.xuat);
                if (filterKey !== 'loai' && f.loai?.length > 0) q = q.in('loai', f.loai);
                if (filterKey !== 'yeu_cau' && f.yeu_cau?.length > 0) q = q.in('yeu_cau', f.yeu_cau);
                if (filterKey !== 'muc_dich' && f.muc_dich?.length > 0) q = q.in('muc_dich', f.muc_dich);
                if (filterKey !== 'nganh' && f.nganh?.length > 0) q = q.in('nganh', f.nganh);
                if (filterKey !== 'phu_trach' && f.phu_trach?.length > 0) q = q.in('phu_trach', f.phu_trach);

                const { data: directData, error: dirErr } = await q.limit(10000);
                if (dirErr) throw dirErr;
                if (directData) {
                    directData.forEach(item => {
                        const val = item[filterKey];
                        if (val !== null && val !== undefined && val !== '') {
                            const strVal = String(val);
                            const time = item.thoi_gian ? new Date(item.thoi_gian).getTime() : 0;
                            const prev = latestTimeMap.get(strVal);
                            if (prev === undefined || time > prev) {
                                latestTimeMap.set(strVal, time);
                            }
                        }
                    });
                    uniqueOptions = Array.from(latestTimeMap.keys());
                }
            } catch (err) {
                console.error("Filter options fetch error:", err);
                if (cache.chiTietList) {
                    cache.chiTietList.forEach(item => {
                        const val = item[filterKey];
                        if (val !== null && val !== undefined && val !== '') {
                            const strVal = String(val);
                            const time = item.thoi_gian ? new Date(item.thoi_gian).getTime() : 0;
                            const prev = latestTimeMap.get(strVal);
                            if (prev === undefined || time > prev) {
                                latestTimeMap.set(strVal, time);
                            }
                        }
                    });
                    uniqueOptions = Array.from(latestTimeMap.keys());
                }
            }
        } else if (view === 'view-don-hang') {
            if (filterKey === 'loai') {
                uniqueOptions = ['Nhập', 'Xuất'];
            } else if (filterKey === 'trang_thai_xu_ly') {
                uniqueOptions = ['Đang xử lý', 'Đã xử lý'];
            } else {
                try {
                    const selectFields = (filterKey === 'thoi_gian') ? 'thoi_gian' : `${filterKey}, thoi_gian`;
                    let q = sb.from('don_hang').select(selectFields).not(filterKey, 'is', null).order('thoi_gian', { ascending: false, nullsFirst: false });
                    if (currentUser?.phan_quyen === 'View') {
                        q = q.eq('yeu_cau', currentUser.ho_ten);
                    }
                    if (state.searchTerm) {
                        const st = `%${state.searchTerm}%`;
                        q = q.or(`ma_kho.ilike.${st},ma_nx.ilike.${st},yeu_cau.ilike.${st},nganh.ilike.${st},muc_dich.ilike.${st},ghi_chu.ilike.${st}`);
                    }
                    if (state.filters.from_date) q = q.gte('thoi_gian', state.filters.from_date);
                    if (state.filters.to_date) q = q.lte('thoi_gian', state.filters.to_date + 'T23:59:59');

                    const f = state.filters;
                    if (filterKey !== 'ma_kho' && f.ma_kho?.length > 0) q = q.in('ma_kho', f.ma_kho);
                    if (filterKey !== 'thoi_gian' && f.thoi_gian?.length > 0) q = q.in('thoi_gian', f.thoi_gian);
                    if (filterKey !== 'ma_nx' && f.ma_nx?.length > 0) q = q.in('ma_nx', f.ma_nx);
                    if (filterKey !== 'yeu_cau' && f.yeu_cau?.length > 0) q = q.in('yeu_cau', f.yeu_cau);
                    if (filterKey !== 'nganh' && f.nganh?.length > 0) q = q.in('nganh', f.nganh);
                    if (filterKey !== 'muc_dich' && f.muc_dich?.length > 0) q = q.in('muc_dich', f.muc_dich);
                    if (filterKey !== 'ghi_chu' && f.ghi_chu?.length > 0) q = q.in('ghi_chu', f.ghi_chu);

                    const { data: directData, error: dirErr } = await q.limit(10000);
                    if (dirErr) throw dirErr;
                    if (directData) {
                        directData.forEach(item => {
                            const val = item[filterKey];
                            if (val !== null && val !== undefined && val !== '') {
                                const strVal = String(val);
                                const time = item.thoi_gian ? new Date(item.thoi_gian).getTime() : 0;
                                const prev = latestTimeMap.get(strVal);
                                if (prev === undefined || time > prev) {
                                    latestTimeMap.set(strVal, time);
                                }
                            }
                        });
                        uniqueOptions = Array.from(latestTimeMap.keys());
                    }
                } catch (err) {
                    console.error("DonHang filter options error:", err);
                    if (cache.donHangList) {
                        cache.donHangList.forEach(item => {
                            const val = item[filterKey];
                            if (val !== null && val !== undefined && val !== '') {
                                const strVal = String(val);
                                const time = item.thoi_gian ? new Date(item.thoi_gian).getTime() : 0;
                                const prev = latestTimeMap.get(strVal);
                                if (prev === undefined || time > prev) {
                                    latestTimeMap.set(strVal, time);
                                }
                            }
                        });
                        uniqueOptions = Array.from(latestTimeMap.keys());
                    }
                }
            }
        } else {
            try {
                const { data: rpcData, error } = await sb.rpc('get_ton_kho_filter_options', {
                    filter_key: filterKey,
                    _ma_vt_filter: state.filters.ma_vt || [],
                    _lot_filter: state.filters.lot || [],
                    _date_filter: state.filters.date || [],
                    _tinh_trang_filter: state.filters.tinh_trang || [],
                    _nganh_filter: state.filters.nganh || [],
                    _phu_trach_filter: state.filters.phu_trach || [],
                    _ton_cuoi_filter: state.stockAvailability === 'available' ? ['Còn Hàng'] : [],
                    _search_term: state.searchTerm || '',
                    _user_role: currentUser?.phan_quyen || '',
                    _user_ho_ten: currentUser?.ho_ten || ''
                });
                if (error) throw error;
                uniqueOptions = Array.isArray(rpcData) ? rpcData.map(item => item.option).filter(val => val !== null && val !== undefined) : [];
            } catch (rpcErr) {
                const { data: directData } = await sb.from('ton_kho_update').select(filterKey).not(filterKey, 'is', null).limit(5000);
                if (directData) {
                    uniqueOptions = [...new Set(directData.map(item => item[filterKey]).filter(val => val !== null && val !== undefined && val !== ''))];
                }
            }
        }

        // Map to { value, label } objects
        const optionObjects = uniqueOptions.map(val => ({
            value: String(val),
            label: formatFilterOptionLabel(filterKey, val)
        }));

        // Sort options
        if (filterKey === 'thoi_gian' || filterKey === 'date') {
            // Descending sort (today / newest date first)
            optionObjects.sort((a, b) => {
                const timeA = new Date(a.value.includes('T') ? a.value : a.value + 'T00:00:00').getTime() || 0;
                const timeB = new Date(b.value.includes('T') ? b.value : b.value + 'T00:00:00').getTime() || 0;
                if (timeB !== timeA) return timeB - timeA;
                return b.value.localeCompare(a.value);
            });
        } else if (filterKey === 'ma_nx' || filterKey === 'ma_kho' || filterKey === 'muc_dich') {
            // Sort by order/export time (thời gian ra đơn / xuất gần nhất) descending, fallback to code/label descending
            optionObjects.sort((a, b) => {
                const timeA = latestTimeMap.get(a.value) || 0;
                const timeB = latestTimeMap.get(b.value) || 0;
                if (timeB !== timeA) return timeB - timeA;
                return b.value.localeCompare(a.value, undefined, { numeric: true, sensitivity: 'base' });
            });
        } else if (filterKey === 'tinh_trang') {
            // Sắp xếp tình trạng theo chu kỳ chuẩn: Từ 1-30 -> ... -> Trên 180 -> Hết hạn -> Không có date -> Hàng hư
            optionObjects.sort((a, b) => compareTonKhoTinhTrang(a.value, b.value, true));
        } else if (['nhap', 'xuat', 'yc_sl', 'ton_dau', 'ton_cuoi'].includes(filterKey)) {
            // Numeric sort
            optionObjects.sort((a, b) => (Number(a.value) || 0) - (Number(b.value) || 0));
        } else {
            // Natural alphabetical sort (A -> Z)
            optionObjects.sort((a, b) => {
                return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
            });
        }
        
        renderOptions(optionObjects);
        setupEventListeners(optionObjects);
        applyBtn.disabled = false;

    } catch (error) {
        console.error("Filter popover error:", error);
        optionsList.innerHTML = '<div class="text-center p-4 text-sm text-red-500">Lỗi tải dữ liệu.</div>';
        showToast(`Lỗi tải bộ lọc cho ${filterKey}.`, 'error');
    }
    
    const closePopover = (e) => {
        if (!popover.contains(e.target) && !button.contains(e.target)) {
            popover.remove();
            document.removeEventListener('click', closePopover);
        }
    };

    applyBtn.onclick = async () => {
        state.filters[filterKey] = [...tempSelectedOptions];
        
        const viewPrefix = view.replace('view-', '');
        updateFilterButtonTexts(viewPrefix);
        
        if(view === 'view-ton-kho') {
            const { fetchTonKho } = await import('./tonkho.js');
            fetchTonKho(1);
        } else if (view === 'view-san-pham') {
            const { fetchSanPham } = await import('./sanpham.js');
            fetchSanPham(1);
        } else if (view === 'view-chi-tiet') {
            const { fetchChiTiet } = await import('./chitiet.js');
            fetchChiTiet(1);
        } else if (view === 'view-don-hang') {
            const { fetchDonHang } = await import('./don-hang.js');
            fetchDonHang(1);
        }
        
        popover.remove();
        document.removeEventListener('click', closePopover);
    };

    setTimeout(() => document.addEventListener('click', closePopover), 0);
}

function updateNotificationBar() {
    const notificationBar = document.getElementById('notification-bar');
    if (!notificationBar || !currentUser) return;

    const now = new Date();
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayOfWeek = days[now.getDay()];
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const dateString = `${dayOfWeek}, Ngày ${day} Tháng ${month} Năm ${year}`;

    const ho_ten = currentUser.ho_ten || 'Guest';
    const phan_quyen = currentUser.phan_quyen || 'View';

    let roleMessage = '';
    switch (phan_quyen) {
        case 'Admin':
            roleMessage = 'Chúc bạn ngày làm việc hiệu quả.';
            break;
        case 'User':
            roleMessage = 'Bạn chỉ có thể xem dữ liệu. Cảm ơn.';
            break;
        case 'View':
            roleMessage = 'Bạn chỉ có thể xem đơn hàng và Sản phẩm đang phụ trách. Cảm ơn.';
            break;
        default:
            roleMessage = 'Chào mừng bạn.';
    }

    notificationBar.innerHTML = `
        <marquee behavior="scroll" direction="left" scrollamount="5">
            <span>${dateString}</span> : 
            <span>Xin chào: <b class="font-bold">${ho_ten}</b> - <b class="font-bold">${phan_quyen}</b></span>. 
            <span class="italic">${roleMessage}</span>
        </marquee>
    `;
}

async function handleLogout() {
    if (userChannel) {
        await sb.removeChannel(userChannel);
        userChannel = null;
    }
    if (adminNotificationChannel) {
        await sb.removeChannel(adminNotificationChannel);
        adminNotificationChannel = null;
    }
    if (presenceChannel) {
        await sb.removeChannel(presenceChannel);
        presenceChannel = null;
    }
    if (dataChannel) {
        await sb.removeChannel(dataChannel);
        dataChannel = null;
    }
    sessionStorage.clear();
    window.location.href = 'login.html';
}

export async function showView(viewId) {
    const viewTitles = {
        'view-phat-trien': 'Tổng Quan',
        'view-san-pham': 'Quản Lý Sản Phẩm',
        'view-ton-kho': 'Quản Lý Tồn Kho',
        'view-don-hang': 'Quản Lý Đơn Hàng',
        'view-chi-tiet': 'Chi Tiết Giao Dịch',
        'view-cai-dat': 'Cài Đặt & Quản Lý',
    };

    document.querySelectorAll('.app-view').forEach(view => view.classList.add('hidden'));
    const viewContainer = document.getElementById(viewId);
    
    if (!viewContainer) {
        console.error(`View with id ${viewId} not found.`);
        return;
    }

    const viewTitleEl = document.getElementById('view-title');
    if (viewTitleEl) {
        viewTitleEl.textContent = viewTitles[viewId] || 'Dashboard';
    }

    viewContainer.classList.remove('hidden');

    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    currentView = viewId;

    try {
        if (viewId === 'view-phat-trien') {
            if (!isViewInitialized['view-phat-trien']) {
                const { initTongQuanView } = await import('./tongquan.js');
                initTongQuanView();
                isViewInitialized['view-phat-trien'] = true;
            }
            const { fetchTongQuanData } = await import('./tongquan.js');
            await fetchTongQuanData();
        } else if (viewId === 'view-cai-dat') {
            if (!isViewInitialized['view-cai-dat']) {
                const { initCaiDatView } = await import('./caidat.js');
                initCaiDatView();
                document.getElementById('logout-btn').addEventListener('click', async () => {
                    const confirmed = await showConfirm('Bạn có chắc chắn muốn đăng xuất?', 'Xác nhận');
                    if (confirmed) {
                        handleLogout();
                    }
                });
                isViewInitialized['view-cai-dat'] = true;
            }
            const { initProfileAvatarState, fetchUsers } = await import('./caidat.js');
            document.getElementById('profile-ho-ten').value = currentUser.ho_ten || '';
            initProfileAvatarState();
            
            const isAdmin = currentUser.phan_quyen === 'Admin';
            const adminPanel = document.getElementById('admin-panel');
            const backupPanel = document.getElementById('backup-restore-panel');
            if (adminPanel) {
                adminPanel.classList.toggle('hidden', !isAdmin);
                if (isAdmin) {
                    await fetchUsers();
                }
            }
            if (backupPanel) {
                backupPanel.classList.toggle('hidden', !isAdmin);
            }
        } else if (viewId === 'view-san-pham') {
            if (!isViewInitialized['view-san-pham']) {
                if (!viewContainer.querySelector('#san-pham-table-body')) {
                    const response = await fetch(`san-pham.html`);
                    if (response.ok) {
                        viewContainer.innerHTML = await response.text();
                        const oldTitle = viewContainer.querySelector('h1');
                        if (oldTitle) oldTitle.remove();
                    }
                }
                const { initSanPhamView } = await import('./sanpham.js');
                initSanPhamView();
                isViewInitialized['view-san-pham'] = true;
            }
            const { fetchSanPham } = await import('./sanpham.js');
            await fetchSanPham();
        } else if (viewId === 'view-ton-kho') {
            if (!isViewInitialized['view-ton-kho']) {
                if (!viewContainer.querySelector('#ton-kho-table-body')) {
                    const response = await fetch(`ton-kho.html`);
                    if (response.ok) {
                        viewContainer.innerHTML = await response.text();
                    }
                }
                const { initTonKhoView } = await import('./tonkho.js');
                initTonKhoView();
                isViewInitialized['view-ton-kho'] = true;
            }
            const { fetchTonKho } = await import('./tonkho.js');
            await fetchTonKho();
        } else if (viewId === 'view-don-hang') {
            if (!isViewInitialized['view-don-hang']) {
                const { initDonHangView } = await import('./don-hang.js');
                initDonHangView();
                isViewInitialized['view-don-hang'] = true;
            }
            const { fetchDonHang } = await import('./don-hang.js');
            await fetchDonHang();
        } else if (viewId === 'view-chi-tiet') {
            if (!isViewInitialized['view-chi-tiet']) {
                if (!viewContainer.querySelector('#chi-tiet-table-body')) {
                    const response = await fetch(`chi-tiet.html`);
                    if (response.ok) {
                        viewContainer.innerHTML = await response.text();
                        const oldTitle = viewContainer.querySelector('h1');
                        if (oldTitle) oldTitle.remove();
                    }
                }
                const { initChiTietView } = await import('./chitiet.js');
                initChiTietView();
                isViewInitialized['view-chi-tiet'] = true;
            }
            const { fetchChiTiet } = await import('./chitiet.js');
            await fetchChiTiet();
        }
    } catch (error) {
        console.error("showView error:", error);
        if (viewContainer) {
             viewContainer.innerHTML = `<div class="p-8 text-center text-red-500">Error loading view content. Please try again. Details: ${error.message}</div>`;
        }
    }
}

function updateOnlineStatusUI() {
    const listEl = document.getElementById('online-users-list');
    const countEl = document.getElementById('online-user-count');
    const avatarStatusEl = document.getElementById('sidebar-avatar-status');
    if (!listEl || !countEl || !avatarStatusEl) return;

    // Update own status dot
    const selfPresence = onlineUsers.get(currentUser.gmail);
    if (selfPresence) {
        const status = selfPresence.status || 'online';
        const statusColor = status === 'away' ? 'bg-yellow-400' : 'bg-green-500';
        avatarStatusEl.className = `absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full ${statusColor} ring-2 ring-gray-900`;
    } else {
        // If for some reason self presence is not found, show as offline/gray.
        avatarStatusEl.className = 'absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full bg-gray-400 ring-2 ring-gray-900';
    }

    // Filter out current user for the list
    const otherOnlineUsers = new Map(onlineUsers);
    otherOnlineUsers.delete(currentUser.gmail);

    countEl.textContent = otherOnlineUsers.size;
    
    if (otherOnlineUsers.size === 0) {
        listEl.innerHTML = `<li class="px-2 text-xs text-gray-400 nav-text transition-opacity duration-300">Không có ai.</li>`;
    } else {
        listEl.innerHTML = '';
        const sortedUsers = [...otherOnlineUsers.values()].sort((a, b) => {
            const statusA = a.status || 'online';
            const statusB = b.status || 'online';
            if (statusA === 'online' && statusB !== 'online') return -1;
            if (statusA !== 'online' && statusB === 'online') return 1;
            return a.user_ho_ten.localeCompare(b.user_ho_ten);
        });

        for (const user of sortedUsers) {
            const status = user.status || 'online';
            const statusColor = status === 'away' ? 'bg-yellow-400' : 'bg-green-500';

            const li = document.createElement('li');
            li.innerHTML = `
                <div class="flex items-center gap-3 px-2">
                    <div class="relative flex-shrink-0">
                        <img src="${user.user_avatar_url || DEFAULT_AVATAR_URL}" alt="${user.user_ho_ten}" class="w-8 h-8 rounded-full object-cover">
                        <span class="absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full ${statusColor} ring-2 ring-gray-900"></span>
                    </div>
                    <span class="nav-text text-sm font-medium transition-opacity duration-300 truncate">${user.user_ho_ten}</span>
                </div>
            `;
            listEl.appendChild(li);
        }
    }
    
    if (currentView === 'view-cai-dat') {
        import('./caidat.js').then(({ fetchUsers }) => {
            if (fetchUsers) {
                fetchUsers();
            }
        }).catch(err => console.error("Failed to load caidat.js for presence update:", err));
    }
}

// --- REALTIME DATA SYNC ---
function setupDataRealtime() {
    if (dataChannel) {
        sb.removeChannel(dataChannel);
    }

    // Hàm refresh dữ liệu cho view hiện tại một cách "quyết liệt"
    const refreshCurrentViewData = async () => {
        showLoading(true); // Hiển thị thanh loading để báo hiệu
        
        // 1. Refresh Dashboard (luôn cần vì là tổng quan)
        if (currentView === 'view-phat-trien') {
            const { fetchTongQuanData } = await import('./tongquan.js');
            await fetchTongQuanData();
        } 
        
        // 2. Refresh các view danh sách cụ thể
        else if (currentView === 'view-san-pham') {
            const { fetchSanPham } = await import('./sanpham.js');
            // false = không hiện overlay loading toàn màn hình, chỉ thanh loading bar
            await fetchSanPham(viewStates['view-san-pham'].currentPage, false);
        } else if (currentView === 'view-don-hang') {
            const { fetchDonHang } = await import('./don-hang.js');
            await fetchDonHang(viewStates['view-don-hang'].currentPage, false);
        } else if (currentView === 'view-ton-kho') {
            const { fetchTonKho } = await import('./tonkho.js');
            await fetchTonKho(viewStates['view-ton-kho'].currentPage, false);
        } else if (currentView === 'view-chi-tiet') {
            const { fetchChiTiet } = await import('./chitiet.js');
            await fetchChiTiet(viewStates['view-chi-tiet'].currentPage, false);
        }

        showLoading(false); // Tắt loading bar
    };

    const handleRealtimeEvent = async (tableName) => {
        showToast('Phát hiện thay đổi dữ liệu...', 'info');
        
        // Đợi 1 chút để DB cập nhật hoàn tất trước khi fetch lại
        setTimeout(async () => {
            await refreshCurrentViewData();
            
            // Xử lý các phụ thuộc chéo (Cross-dependency refresh)
            // Ví dụ: Chi tiết thay đổi -> Ảnh hưởng Tồn kho và Đơn hàng
            if (tableName === 'chi_tiet') {
                if (currentView !== 'view-chi-tiet') {
                    // Nếu đang xem tồn kho, cần refresh lại dù view chính không phải chi tiết
                    if (currentView === 'view-ton-kho') {
                         const { fetchTonKho } = await import('./tonkho.js');
                         fetchTonKho(viewStates['view-ton-kho'].currentPage, false);
                    }
                }
            }
        }, 500); 
    };

    dataChannel = sb.channel('public-data-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'san_pham' }, () => handleRealtimeEvent('san_pham'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'don_hang' }, () => handleRealtimeEvent('don_hang'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ton_kho' }, () => handleRealtimeEvent('ton_kho'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chi_tiet' }, () => handleRealtimeEvent('chi_tiet'))
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Đã kết nối Realtime Dữ liệu.');
            }
        });
}

document.addEventListener('DOMContentLoaded', async () => {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content-area');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const iconOpen = document.getElementById('sidebar-toggle-icon-open');
    const iconClose = document.getElementById('sidebar-toggle-icon-close');
    const navButtons = document.querySelectorAll('.nav-button');
    const navIcons = document.querySelectorAll('.nav-button > svg');
    const navTexts = document.querySelectorAll('.nav-text');
    const sidebarHeaderContent = document.getElementById('sidebar-header-content');
    const userInfoText = document.getElementById('user-info-text');
    const sidebarFooter = document.getElementById('sidebar-footer');

    const setSidebarState = (isCollapsed) => {
        if (isCollapsed) {
            sidebar.classList.remove('w-64');
            sidebar.classList.add('w-20');
            mainContent.classList.remove('ml-64');
            mainContent.classList.add('ml-20');
            iconClose.classList.add('hidden');
            iconOpen.classList.remove('hidden');
            navTexts.forEach(text => text.classList.add('hidden'));
            sidebarFooter.classList.add('opacity-0', 'pointer-events-none');

            if (userInfoText) userInfoText.classList.add('hidden');
            if (sidebarHeaderContent) {
                sidebarHeaderContent.classList.remove('justify-between');
                sidebarHeaderContent.classList.add('flex-col', 'gap-4', 'items-center');
            }

            navButtons.forEach(btn => {
                btn.classList.remove('px-6');
                btn.classList.add('justify-center');
            });
            navIcons.forEach(icon => {
                icon.classList.remove('mr-4');
            });

        } else {
            sidebar.classList.remove('w-20');
            sidebar.classList.add('w-64');
            mainContent.classList.remove('ml-20');
            mainContent.classList.add('ml-64');
            iconOpen.classList.add('hidden');
            iconClose.classList.remove('hidden');
            navTexts.forEach(text => text.classList.remove('hidden'));
            sidebarFooter.classList.remove('opacity-0', 'pointer-events-none');

            if (userInfoText) userInfoText.classList.remove('hidden');
            if (sidebarHeaderContent) {
                sidebarHeaderContent.classList.add('justify-between');
                sidebarHeaderContent.classList.remove('flex-col', 'gap-4', 'items-center');
            }

            navButtons.forEach(btn => {
                btn.classList.add('px-6');
                btn.classList.remove('justify-center');
            });
            navIcons.forEach(icon => {
                icon.classList.add('mr-4');
            });
        }
         // Use timeout to allow CSS transition to catch up
        setTimeout(() => {
             sidebarFooter.classList.toggle('pointer-events-none', isCollapsed);
        }, 150);
    };

    const isSidebarCollapsed = sessionStorage.getItem('sidebarCollapsed') === 'true';
    setSidebarState(isSidebarCollapsed);

    sidebarToggleBtn.addEventListener('click', () => {
        const isCollapsed = sidebar.classList.contains('w-20');
        sessionStorage.setItem('sidebarCollapsed', !isCollapsed);
        setSidebarState(!isCollapsed);
    });

    // --- Global Escape Key Handler for Modals & Popovers ---
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // If quick stock search dropdown is open, don't close modal
            const quickDhDropdown = document.getElementById('don-hang-quick-search-dropdown');
            if (quickDhDropdown && !quickDhDropdown.classList.contains('hidden')) {
                return;
            }

            // Modals are checked from likely top-most to bottom-most based on z-index
            const modals = [
                { id: 'print-preview-modal', closeBtnId: 'print-preview-close-btn' },
                { id: 'image-viewer-modal', closeBtnId: 'close-image-viewer-btn' },
                { id: 'confirm-modal', closeBtnId: 'confirm-cancel-btn' },
                { id: 'print-choice-modal', closeBtnId: 'print-choice-cancel-btn' },
                { id: 'excel-export-modal', closeBtnId: 'excel-export-cancel-btn' },
                { id: 'password-reset-modal', closeBtnId: 'cancel-reset-btn' },
                { id: 'don-hang-modal', closeBtnId: 'cancel-don-hang-btn' },
                { id: 'san-pham-modal', closeBtnId: 'cancel-san-pham-btn' },
                { id: 'ton-kho-modal', closeBtnId: 'cancel-ton-kho-btn' },
            ];

            for (const modalInfo of modals) {
                const modalEl = document.getElementById(modalInfo.id);
                if (modalEl && !modalEl.classList.contains('hidden')) {
                    const closeBtn = document.getElementById(modalInfo.closeBtnId);
                    if (closeBtn) {
                        closeBtn.click();
                    } else { // Fallback just in case
                        modalEl.classList.add('hidden');
                    }
                    e.preventDefault(); 
                    return; // Stop after handling the top-most modal
                }
            }

            // Handle popovers if no modal was open
            if (activeAutocompletePopover) {
                closeActiveAutocompletePopover();
            }
        }
    });

    // --- NETWORK STATUS INDICATOR ---
    function updateNetworkStatusIndicator(status, latency = null) {
        const indicator = document.getElementById('network-status-indicator');
        const wifiIcon = document.getElementById('wifi-icon');
        const latencyText = document.getElementById('latency-text');
        const offlineGroup = document.getElementById('wifi-offline-group');
        const onlineGroup = document.getElementById('wifi-online-group');

        const bar1 = document.getElementById('wifi-bar-1');
        const bar2 = document.getElementById('wifi-bar-2');
        const bar3 = document.getElementById('wifi-bar-3');

        if (!indicator || !wifiIcon || !latencyText || !offlineGroup || !onlineGroup) return;
        
        // Reset classes
        wifiIcon.classList.remove('text-green-500', 'text-yellow-500', 'text-red-500', 'text-gray-400');
        latencyText.classList.remove('text-green-600', 'text-yellow-600', 'text-red-600', 'text-gray-500');
        [bar1, bar2, bar3].forEach(bar => bar.style.opacity = '1');

        switch (status) {
            case 'good':
                onlineGroup.classList.remove('hidden');
                offlineGroup.classList.add('hidden');
                wifiIcon.classList.add('text-green-500');
                latencyText.textContent = `${latency} ms`;
                latencyText.classList.add('text-green-600');
                indicator.title = `Kết nối tốt (${latency}ms)`;
                break;

            case 'slow':
                onlineGroup.classList.remove('hidden');
                offlineGroup.classList.add('hidden');
                wifiIcon.classList.add('text-yellow-500');
                bar3.style.opacity = '0.3'; // Dim the outer bar
                latencyText.textContent = `${latency} ms`;
                latencyText.classList.add('text-yellow-600');
                indicator.title = `Kết nối chậm (${latency}ms)`;
                break;

            case 'offline':
                onlineGroup.classList.add('hidden');
                offlineGroup.classList.remove('hidden');
                wifiIcon.classList.add('text-red-500');
                latencyText.textContent = 'offline';
                latencyText.classList.add('text-red-600');
                indicator.title = 'Mất kết nối mạng';
                break;
            
            default: // Initial state
                onlineGroup.classList.remove('hidden');
                offlineGroup.classList.add('hidden');
                wifiIcon.classList.add('text-gray-400');
                 [bar1, bar2, bar3].forEach(bar => bar.style.opacity = '0.3');
                latencyText.textContent = '-- ms';
                latencyText.classList.add('text-gray-500');
                indicator.title = 'Đang kiểm tra kết nối...';
                break;
        }
    }

    async function checkNetworkLatency() {
        if (!navigator.onLine) {
            updateNetworkStatusIndicator('offline');
            return;
        }

        const startTime = Date.now();
        try {
            const { error } = await sb.from('user').select('gmail', { head: true, count: 'exact' });
            if (error) throw error;
            
            const latency = Date.now() - startTime;
            
            if (latency < 400) {
                updateNetworkStatusIndicator('good', latency);
            } else { // Anything over 400ms is considered slow, not offline.
                updateNetworkStatusIndicator('slow', latency);
            }

        } catch (error) {
            updateNetworkStatusIndicator('offline');
        }
    }

    updateNetworkStatusIndicator('initial');
    checkNetworkLatency();
    window.addEventListener('online', () => {
        checkNetworkLatency();
        processOfflineQueue();
    });
    window.addEventListener('offline', () => updateNetworkStatusIndicator('offline'));
    setInterval(checkNetworkLatency, 10000);
    // --- END NETWORK STATUS INDICATOR ---

    try {
        const userJson = sessionStorage.getItem('loggedInUser');
        if (userJson) {
            currentUser = JSON.parse(userJson);
            
            document.getElementById('user-ho-ten').textContent = currentUser.ho_ten || 'User';
            document.getElementById('user-gmail').textContent = currentUser.gmail || '';
            updateSidebarAvatar(currentUser.anh_dai_dien_url);
            updateNotificationBar();

            document.getElementById('app-loading').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');

            document.querySelectorAll('.nav-button').forEach(btn => {
                btn.addEventListener('click', () => showView(btn.dataset.view));
            });
            
            const lastView = sessionStorage.getItem('lastViewId') || 'view-phat-trien';
            await showView(lastView);
            
            updateOfflineIndicator();
            setTimeout(processOfflineQueue, 2000);

            userChannel = sb.channel('public:user')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user', filter: 'gmail=eq.'+currentUser.gmail }, payload => {
                    const updatedUser = payload.new;

                    const newSessionId = updatedUser.active_session_id;
                    if (newSessionId && currentUser.active_session_id && newSessionId !== currentUser.active_session_id) {
                        showToast("Tài khoản của bạn đã được đăng nhập từ một thiết bị khác.", 'error');
                        setTimeout(handleLogout, 2000);
                        return;
                    }

                    if (updatedUser.stt === 'Khóa') {
                        showToast("Tài khoản của bạn đã bị quản trị viên khóa.", 'error');
                        setTimeout(handleLogout, 2000);
                        return;
                    }
                    if(updatedUser.mat_khau !== currentUser.mat_khau) {
                        showToast("Mật khẩu của bạn đã được quản trị viên thay đổi. Vui lòng đăng nhập lại.", 'info');
                        setTimeout(handleLogout, 3000);
                    } else {
                        sessionStorage.setItem('loggedInUser', JSON.stringify(updatedUser));
                        currentUser = updatedUser;
                        updateNotificationBar();
                        if (presenceChannel) {
                            presenceChannel.track({ 
                                user_ho_ten: currentUser.ho_ten, 
                                user_avatar_url: currentUser.anh_dai_dien_url,
                                status: document.visibilityState === 'visible' ? 'online' : 'away'
                            });
                        }
                        if(currentView === 'view-cai-dat') {
                             document.getElementById('profile-ho-ten').value = currentUser.ho_ten || '';
                             initProfileAvatarState();
                        }
                    }
                })
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'user', filter: 'gmail=eq.'+currentUser.gmail }, payload => {
                    showToast("Tài khoản của bạn đã bị xóa khỏi hệ thống.", 'error');
                    setTimeout(handleLogout, 2000);
                })
                .subscribe();
            
            if(currentUser.phan_quyen === 'Admin') {
                adminNotificationChannel = sb.channel('admin-notifications')
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user' }, payload => {
                        if(payload.new.stt === 'Chờ Duyệt') {
                            showToast(`Có tài khoản mới "${payload.new.ho_ten}" đang chờ duyệt.`, 'info');
                            if(currentView === 'view-cai-dat') {
                                import('./caidat.js').then(({ fetchUsers }) => fetchUsers());
                            }
                        }
                    })
                    .subscribe();
            }

            function initPresence() {
                if (presenceChannel) {
                    sb.removeChannel(presenceChannel);
                }

                presenceChannel = sb.channel('online-users', {
                    config: {
                        presence: {
                            key: currentUser.gmail,
                        },
                    },
                });

                presenceChannel
                    .on('presence', { event: 'sync' }, () => {
                        const state = presenceChannel.presenceState();
                        onlineUsers.clear();
                        for (const gmail in state) {
                            const userPresences = state[gmail];
                            if (userPresences && userPresences.length > 0) {
                                // Nếu có nhiều phiên đăng nhập, ưu tiên trạng thái 'online'
                                const activePresence = userPresences.find(p => p.status === 'online') || userPresences[0];
                                onlineUsers.set(gmail, activePresence);
                            }
                        }
                        updateOnlineStatusUI();
                    })
                    .on('broadcast', { event: 'user_offline' }, ({ payload }) => {
                        if (payload && payload.gmail) {
                            onlineUsers.delete(payload.gmail);
                            updateOnlineStatusUI();
                        }
                    })
                    .subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            await presenceChannel.track({ 
                                user_ho_ten: currentUser.ho_ten, 
                                user_avatar_url: currentUser.anh_dai_dien_url,
                                status: document.visibilityState === 'visible' ? 'online' : 'away'
                            });
                        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                            setTimeout(() => {
                                if (currentUser) initPresence(); 
                            }, 5000);
                        }
                    });
            }

            initPresence();
            
            document.addEventListener('visibilitychange', () => {
                if (!presenceChannel) return;
                const status = document.visibilityState === 'visible' ? 'online' : 'away';
                presenceChannel.track({ 
                    user_ho_ten: currentUser.ho_ten, 
                    user_avatar_url: currentUser.anh_dai_dien_url,
                    status: status
                });
            });

            // Initialize Data Realtime Subscription
            setupDataRealtime();

        } else {
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error("Initialization error:", error);
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
    
    window.addEventListener('beforeunload', () => {
        if (currentView) sessionStorage.setItem('lastViewId', currentView);
        if (presenceChannel && currentUser) {
            presenceChannel.send({
                type: 'broadcast',
                event: 'user_offline',
                payload: { gmail: currentUser.gmail }
            });
        }
    });

    // Cập nhật trạng thái định kỳ mỗi 1 phút để giữ kết nối "tươi"
    setInterval(() => {
        if (presenceChannel && currentUser && document.visibilityState === 'visible') {
            presenceChannel.track({ 
                user_ho_ten: currentUser.ho_ten, 
                user_avatar_url: currentUser.anh_dai_dien_url,
                status: 'online',
                t: Date.now()
            });
        }
    }, 60000);

    // Gán sự kiện cho nút làm mới danh sách online (nếu có)
    // Xóa listener cũ của nút làm mới nếu có
    const refreshOnlineBtn = document.getElementById('refresh-online-users');
    if (refreshOnlineBtn) {
        // Nút này sẽ bị xóa khỏi HTML, nhưng nếu còn tồn tại tạm thời thì xóa logic của nó
        refreshOnlineBtn.classList.add('hidden');
    }
    
    document.getElementById('close-image-viewer-btn').addEventListener('click', () => {
        document.getElementById('image-viewer-modal').classList.add('hidden');
        document.getElementById('image-viewer-img').src = '';
    });

    // --- Print Preview Modal Logic ---
    const printPreviewModal = document.getElementById('print-preview-modal');
    const printPreviewHeader = document.getElementById('print-preview-header');
    const printPreviewCloseBtn = document.getElementById('print-preview-close-btn');
    const printPreviewMaximizeBtn = document.getElementById('print-preview-maximize-btn');
    const printPreviewIframe = document.getElementById('print-preview-iframe');

    if (printPreviewModal && printPreviewHeader && printPreviewCloseBtn && printPreviewMaximizeBtn) {
        printPreviewCloseBtn.addEventListener('click', () => {
            printPreviewModal.classList.add('hidden');
            if (printPreviewIframe) {
                printPreviewIframe.src = 'about:blank'; // Clear iframe to stop any processes
            }
        });

        printPreviewMaximizeBtn.addEventListener('click', (e) => {
            const url = e.currentTarget.dataset.url;
            if (url) {
                window.open(url, '_blank');
            }
        });

        // Dragging logic
        let isDragging = false;
        let offset = { x: 0, y: 0 };

        printPreviewHeader.addEventListener('mousedown', (e) => {
            // Only drag with left mouse button, and not on buttons
            if (e.button !== 0 || e.target.closest('button')) return;
            
            isDragging = true;
            const rect = printPreviewModal.getBoundingClientRect();
            offset.x = e.clientX - rect.left;
            offset.y = e.clientY - rect.top;
            
            // To prevent text selection while dragging
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            let newX = e.clientX - offset.x;
            let newY = e.clientY - offset.y;

            // Constrain to viewport to prevent dragging it off-screen
            const maxX = window.innerWidth - printPreviewModal.offsetWidth;
            const maxY = window.innerHeight - printPreviewModal.offsetHeight;
            
            newX = Math.max(0, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));
            
            printPreviewModal.style.left = `${newX}px`;
            printPreviewModal.style.top = `${newY}px`;
            printPreviewModal.style.transform = 'none'; // Ensure transform is not interfering
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // --- Khởi tạo Tìm Kiếm Tổng Hợp Toàn Hệ Thống ---
    initGlobalSearch();
});

// ==========================================================================
// TÌM KIẾM TỔNG HỢP TOÀN HỆ THỐNG (GLOBAL SEARCH)
// ==========================================================================
export function initGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const clearBtn = document.getElementById('global-search-clear-btn');
    const dropdown = document.getElementById('global-search-dropdown');
    const resultsList = document.getElementById('global-search-results-list');
    const totalCountEl = document.getElementById('global-search-total-count');

    if (!input || !dropdown || !resultsList) return;

    let selectedIndex = -1;
    let allResultElements = [];

    const escapeHtml = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const formatDateDDMMYYYY = (dateString) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        } catch {
            return dateString;
        }
    };

    const highlightMatch = (text, query) => {
        if (!text) return '';
        if (!query) return escapeHtml(text);
        const str = String(text);
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return escapeHtml(str).replace(regex, '<mark class="search-highlight">$1</mark>');
    };

    const closeDropdown = () => {
        dropdown.classList.add('hidden');
        dropdown.style.display = 'none';
        selectedIndex = -1;
        allResultElements = [];
    };

    const openDropdown = () => {
        if (input.value.trim().length > 0) {
            dropdown.classList.remove('hidden');
            dropdown.style.display = '';
        }
    };

    const clearSearch = () => {
        input.value = '';
        if (clearBtn) clearBtn.classList.add('hidden');
        resultsList.innerHTML = '';
        if (totalCountEl) totalCountEl.textContent = '0';
        closeDropdown();
        input.blur();
    };

    // Global shortcut Ctrl+K / Cmd+K & Escape key
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            input.focus();
            input.select();
            if (input.value.trim().length > 0) {
                openDropdown();
            }
        }

        if (e.key === 'Escape') {
            if (!dropdown.classList.contains('hidden') || dropdown.style.display !== 'none' || document.activeElement === input || input.value.length > 0) {
                e.preventDefault();
                clearSearch();
            }
        }
    });

    // Arrow keys & Enter & Escape navigation
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            clearSearch();
            return;
        }

        if (dropdown.classList.contains('hidden') || dropdown.style.display === 'none') return;

        allResultElements = Array.from(resultsList.querySelectorAll('.search-result-item'));
        if (allResultElements.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % allResultElements.length;
            updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + allResultElements.length) % allResultElements.length;
            updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < allResultElements.length) {
                allResultElements[selectedIndex].click();
            }
        }
    });

    const updateSelection = () => {
        allResultElements.forEach((el, idx) => {
            if (idx === selectedIndex) {
                el.classList.add('search-item-selected');
                el.scrollIntoView({ block: 'nearest' });
            } else {
                el.classList.remove('search-item-selected');
            }
        });
    };

    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearSearch();
        });
    }

    // Click outside handler
    document.addEventListener('click', (e) => {
        const container = document.getElementById('global-search-container');
        if (container && !container.contains(e.target)) {
            closeDropdown();
        }
    });

    input.addEventListener('focus', () => {
        if (input.value.trim().length > 0) {
            openDropdown();
        }
    });

    let activeSearchSeq = 0;
    const globalSearchCache = new Map();

    const renderSearchResults = (kw, { donHangList = [], donHangCount = 0, sanPhamList = [], sanPhamCount = 0, tonKhoList = [], tonKhoCount = 0, chiTietList = [], chiTietCount = 0 }) => {
        openDropdown();
        const totalFound = donHangCount + sanPhamCount + tonKhoCount + chiTietCount;
        if (totalCountEl) totalCountEl.textContent = `${totalFound}`;

        if (totalFound === 0) {
            resultsList.innerHTML = `
                <div class="py-8 text-center text-gray-500 text-xs">
                    <svg class="w-8 h-8 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Không tìm thấy kết quả phù hợp với "<b class="text-gray-700">${escapeHtml(kw)}</b>"</span>
                </div>
            `;
            return;
        }

        let html = '';

        // Section 1: Đơn Hàng
        if (donHangList.length > 0) {
            html += `
                <div class="search-category-group">
                    <div class="search-category-header text-amber-800 bg-amber-100/70 rounded-lg px-3 py-1.5 flex items-center justify-between mb-1.5">
                        <span class="flex items-center gap-2 font-bold text-xs sm:text-sm">
                            <svg class="w-4 h-4 text-amber-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Đơn Hàng (${donHangCount})
                        </span>
                        <button type="button" class="view-all-category-btn text-xs text-amber-800 hover:text-amber-950 font-bold hover:underline cursor-pointer flex items-center gap-1 bg-amber-200/60 hover:bg-amber-200 px-2 py-0.5 rounded transition-colors" data-view="view-don-hang">
                            <span>Xem tất cả (${donHangCount})</span>
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                    <div class="space-y-1">
                        ${donHangList.map(dh => {
                            const isOut = (dh.ma_kho || '').includes('OUT');
                            const badgeColor = isOut ? 'bg-red-100 text-red-700 border-red-300' : 'bg-green-100 text-green-700 border-green-300';
                            return `
                                <div class="search-result-item" data-type="don-hang" data-id="${escapeHtml(dh.ma_kho)}">
                                    <div class="flex items-center gap-2.5 min-w-0 flex-1">
                                        <span class="px-2 py-0.5 text-xs font-black rounded border ${badgeColor} flex-shrink-0 whitespace-nowrap">${isOut ? 'XUẤT' : 'NHẬP'}</span>
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center justify-between gap-2 min-w-0">
                                                <div class="flex items-center gap-2 min-w-0 truncate">
                                                    <span class="font-bold text-blue-700 text-sm sm:text-base flex-shrink-0">${highlightMatch(dh.ma_kho, kw)}</span>
                                                    ${dh.ma_nx ? `<span class="text-xs sm:text-sm font-bold text-gray-800 truncate">(${highlightMatch(dh.ma_nx, kw)})</span>` : ''}
                                                </div>
                                                <span class="text-xs text-gray-500 font-medium whitespace-nowrap flex-shrink-0 ml-auto">${dh.thoi_gian ? formatDateDDMMYYYY(dh.thoi_gian) : ''}</span>
                                            </div>
                                            <div class="text-xs sm:text-sm text-gray-600 truncate mt-0.5">
                                                ${dh.yeu_cau ? `<span class="font-semibold text-gray-800">${highlightMatch(dh.yeu_cau, kw)}</span>` : ''}
                                                ${dh.muc_dich ? ` • <span>${highlightMatch(dh.muc_dich, kw)}</span>` : ''}
                                                ${dh.ghi_chu ? ` • <span class="italic text-gray-500">${highlightMatch(dh.ghi_chu, kw)}</span>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // Section 2: Tồn Kho
        if (tonKhoList.length > 0) {
            html += `
                <div class="search-category-group pt-2">
                    <div class="search-category-header text-emerald-800 bg-emerald-100/70 rounded-lg px-3 py-1.5 flex items-center justify-between mb-1.5">
                        <span class="flex items-center gap-2 font-bold text-xs sm:text-sm">
                            <svg class="w-4 h-4 text-emerald-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                            Tồn Kho (${tonKhoCount})
                        </span>
                        <button type="button" class="view-all-category-btn text-xs text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer flex items-center gap-1 bg-emerald-200/60 hover:bg-emerald-200 px-2 py-0.5 rounded transition-colors" data-view="view-ton-kho">
                            <span>Xem tất cả (${tonKhoCount})</span>
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                    <div class="space-y-1">
                        ${tonKhoList.map(tk => {
                            return `
                                <div class="search-result-item" data-type="ton-kho" data-id="${escapeHtml(tk.ma_vt)}" data-lot="${escapeHtml(tk.lot || '')}">
                                    <div class="flex items-center justify-between gap-3 min-w-0 flex-1">
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center gap-2 min-w-0">
                                                <span class="font-bold text-gray-900 text-sm sm:text-base flex-shrink-0">${highlightMatch(tk.ma_vt, kw)}</span>
                                                <span class="text-xs sm:text-sm text-gray-800 font-medium truncate min-w-0">${highlightMatch(tk.ten_vt, kw)}</span>
                                            </div>
                                            <div class="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                                ${tk.lot ? `<span>LOT: <b class="text-gray-800 font-bold">${highlightMatch(tk.lot, kw)}</b></span>` : ''}
                                                ${tk.date ? `<span>Date: <b class="text-gray-800 font-bold">${highlightMatch(tk.date, kw)}</b></span>` : ''}
                                                ${tk.tinh_trang ? `<span class="${getTonKhoTinhTrangTextColor(tk.tinh_trang)}">${tk.tinh_trang}</span>` : ''}
                                            </div>
                                        </div>
                                        <div class="flex-shrink-0 text-right whitespace-nowrap pl-2">
                                            <span class="font-black text-sm sm:text-base ${Number(tk.ton_cuoi) > 0 ? 'text-emerald-700' : 'text-rose-600'}">Tồn: ${Number(tk.ton_cuoi).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // Section 3: Chi Tiết Giao Dịch
        if (chiTietList.length > 0) {
            html += `
                <div class="search-category-group pt-2">
                    <div class="search-category-header text-purple-800 bg-purple-100/70 rounded-lg px-3 py-1.5 flex items-center justify-between mb-1.5">
                        <span class="flex items-center gap-2 font-bold text-xs sm:text-sm">
                            <svg class="w-4 h-4 text-purple-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                            Chi Tiết Giao Dịch (${chiTietCount})
                        </span>
                        <button type="button" class="view-all-category-btn text-xs text-purple-800 hover:text-purple-950 font-bold hover:underline cursor-pointer flex items-center gap-1 bg-purple-200/60 hover:bg-purple-200 px-2 py-0.5 rounded transition-colors" data-view="view-chi-tiet">
                            <span>Xem tất cả (${chiTietCount})</span>
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                    <div class="space-y-1">
                        ${chiTietList.map(ct => {
                            return `
                                <div class="search-result-item" data-type="chi-tiet" data-id="${escapeHtml(ct.ma_kho || ct.ma_vach || ct.ma_vt)}">
                                    <div class="flex items-center gap-2.5 min-w-0 flex-1">
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center justify-between gap-2 min-w-0">
                                                <div class="flex items-center gap-2 min-w-0 truncate">
                                                    <span class="font-bold text-blue-700 text-sm sm:text-base flex-shrink-0">${highlightMatch(ct.ma_kho, kw)}</span>
                                                    ${ct.ma_nx ? `<span class="text-xs sm:text-sm font-bold text-gray-800 truncate">(${highlightMatch(ct.ma_nx, kw)})</span>` : ''}
                                                </div>
                                                <span class="text-xs text-gray-500 font-medium whitespace-nowrap flex-shrink-0 ml-auto">${ct.thoi_gian ? formatDateDDMMYYYY(ct.thoi_gian) : ''}</span>
                                            </div>
                                            <div class="text-xs sm:text-sm text-gray-600 truncate mt-0.5 flex items-center gap-2">
                                                <span class="font-bold text-gray-900 flex-shrink-0">${highlightMatch(ct.ma_vt, kw)}</span>
                                                ${ct.ten_vt ? `<span class="font-medium text-gray-700 truncate">• ${highlightMatch(ct.ten_vt, kw)}</span>` : ''}
                                                ${ct.ma_vach ? `<span class="font-mono text-xs font-bold text-purple-700 whitespace-nowrap flex-shrink-0 ml-auto">Code: ${highlightMatch(ct.ma_vach, kw)}</span>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // Section 4: Sản Phẩm (DƯỚI CÙNG)
        if (sanPhamList.length > 0) {
            html += `
                <div class="search-category-group pt-2">
                    <div class="search-category-header text-blue-800 bg-blue-100/70 rounded-lg px-3 py-1.5 flex items-center justify-between mb-1.5">
                        <span class="flex items-center gap-2 font-bold text-xs sm:text-sm">
                            <svg class="w-4 h-4 text-blue-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                            Sản Phẩm (${sanPhamCount})
                        </span>
                        <button type="button" class="view-all-category-btn text-xs text-blue-800 hover:text-blue-950 font-bold hover:underline cursor-pointer flex items-center gap-1 bg-blue-200/60 hover:bg-blue-200 px-2 py-0.5 rounded transition-colors" data-view="view-san-pham">
                            <span>Xem tất cả (${sanPhamCount})</span>
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                    <div class="space-y-1">
                        ${sanPhamList.map(sp => {
                            const imgUrl = sp.url_hinh_anh || sp.hinh_anh;
                            const totalStock = typeof sp.total_ton_cuoi === 'number' ? sp.total_ton_cuoi : (Number(sp.total_ton_cuoi) || 0);
                            return `
                                <div class="search-result-item" data-type="san-pham" data-id="${escapeHtml(sp.ma_vt)}">
                                    <div class="flex items-center gap-2.5 min-w-0 flex-1">
                                        <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-200">
                                            ${imgUrl ? `<img src="${imgUrl}" class="w-full h-full object-cover">` : `<svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg>`}
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-center justify-between gap-2 min-w-0">
                                                <div class="flex items-center gap-2 min-w-0 truncate">
                                                    <span class="font-bold text-gray-900 text-sm sm:text-base flex-shrink-0">${highlightMatch(sp.ma_vt, kw)}</span>
                                                    <span class="text-xs sm:text-sm text-gray-800 font-medium truncate min-w-0">${highlightMatch(sp.ten_vt, kw)}</span>
                                                </div>
                                                <span class="font-black text-xs sm:text-sm whitespace-nowrap flex-shrink-0 pl-2 ${totalStock > 0 ? 'text-emerald-700' : 'text-rose-600'}">Tổng tồn: ${totalStock.toLocaleString()}</span>
                                            </div>
                                            <div class="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                                ${sp.nganh ? `<span class="bg-gray-100 text-gray-700 font-medium px-1.5 py-0.5 rounded">${highlightMatch(sp.nganh, kw)}</span>` : ''}
                                                ${sp.phu_trach ? `<span>Phụ trách: <b class="text-gray-700">${highlightMatch(sp.phu_trach, kw)}</b></span>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        resultsList.innerHTML = html;

        // "Xem tất cả trong trang..." buttons event handlers
        resultsList.querySelectorAll('.view-all-category-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetView = btn.dataset.view;
                closeDropdown();

                if (targetView === 'view-don-hang') {
                    await showView('view-don-hang');
                    const searchInput = document.getElementById('don-hang-search-input');
                    if (searchInput) searchInput.value = kw;
                    viewStates['view-don-hang'].searchTerm = kw;
                    const { fetchDonHang } = await import('./don-hang.js');
                    fetchDonHang(1);
                } else if (targetView === 'view-ton-kho') {
                    await showView('view-ton-kho');
                    const searchInput = document.getElementById('ton-kho-search-input');
                    if (searchInput) searchInput.value = kw;
                    viewStates['view-ton-kho'].searchTerm = kw;
                    const { fetchTonKho } = await import('./tonkho.js');
                    fetchTonKho(1);
                } else if (targetView === 'view-chi-tiet') {
                    await showView('view-chi-tiet');
                    const searchInput = document.getElementById('chi-tiet-search-input');
                    if (searchInput) searchInput.value = kw;
                    viewStates['view-chi-tiet'].searchTerm = kw;
                    const { fetchChiTiet } = await import('./chitiet.js');
                    fetchChiTiet(1);
                } else if (targetView === 'view-san-pham') {
                    await showView('view-san-pham');
                    const searchInput = document.getElementById('san-pham-search-input');
                    if (searchInput) searchInput.value = kw;
                    viewStates['view-san-pham'].searchTerm = kw;
                    const { fetchSanPham } = await import('./sanpham.js');
                    fetchSanPham(1);
                }
            });
        });

        // Item Click Event Handlers
        resultsList.querySelectorAll('.search-result-item').forEach(itemEl => {
            itemEl.addEventListener('click', async () => {
                const type = itemEl.dataset.type;
                const id = itemEl.dataset.id;

                closeDropdown();

                if (type === 'don-hang') {
                    await showView('view-don-hang');
                    const searchInput = document.getElementById('don-hang-search-input');
                    if (searchInput) searchInput.value = id;
                    viewStates['view-don-hang'].searchTerm = id;
                    const { fetchDonHang, openDonHangModal } = await import('./don-hang.js');
                    fetchDonHang(1);
                    const dhItem = donHangList.find(d => d.ma_kho === id);
                    if (dhItem) {
                        openDonHangModal(dhItem, 'view');
                    }
                } else if (type === 'san-pham') {
                    await showView('view-san-pham');
                    const searchInput = document.getElementById('san-pham-search-input');
                    if (searchInput) searchInput.value = id;
                    viewStates['view-san-pham'].searchTerm = id;
                    const { fetchSanPham, openSanPhamModal } = await import('./sanpham.js');
                    fetchSanPham(1);
                    const spItem = sanPhamList.find(s => s.ma_vt === id);
                    if (spItem) {
                        openSanPhamModal(spItem, 'view');
                    }
                } else if (type === 'ton-kho') {
                    await showView('view-ton-kho');
                    const searchInput = document.getElementById('ton-kho-search-input');
                    if (searchInput) searchInput.value = id;
                    viewStates['view-ton-kho'].searchTerm = id;
                    const { fetchTonKho } = await import('./tonkho.js');
                    fetchTonKho(1);
                } else if (type === 'chi-tiet') {
                    await showView('view-chi-tiet');
                    const searchInput = document.getElementById('chi-tiet-search-input');
                    if (searchInput) searchInput.value = id;
                    viewStates['view-chi-tiet'].searchTerm = id;
                    const { fetchChiTiet } = await import('./chitiet.js');
                    fetchChiTiet(1);
                }
            });
        });
    };

    const performSearch = debounce(async (keyword) => {
        const kw = keyword.trim();
        const searchSeq = ++activeSearchSeq;

        if (!kw) {
            if (clearBtn) clearBtn.classList.add('hidden');
            closeDropdown();
            return;
        }

        if (clearBtn) clearBtn.classList.remove('hidden');
        openDropdown();

        // Kiểm tra bộ nhớ cache trước để phản hồi siêu tốc 0ms
        const cacheKey = kw.toLowerCase();
        if (globalSearchCache.has(cacheKey)) {
            const cached = globalSearchCache.get(cacheKey);
            renderSearchResults(kw, cached);
            return;
        }

        resultsList.innerHTML = `
            <div class="py-5 text-center text-gray-500 text-xs flex items-center justify-center gap-2">
                <svg class="animate-spin h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Đang tìm kiếm dữ liệu...</span>
            </div>
        `;

        try {
            const st = `%${kw}%`;

            // 1. Query Don Hang
            let dhQuery = sb.from('don_hang').select('ma_kho, ma_nx, thoi_gian, yeu_cau, nganh, muc_dich, ghi_chu', { count: 'exact' })
                .or(`ma_kho.ilike.${st},ma_nx.ilike.${st},yeu_cau.ilike.${st},muc_dich.ilike.${st},ghi_chu.ilike.${st},nganh.ilike.${st}`)
                .order('thoi_gian', { ascending: false })
                .limit(8);
            if (currentUser?.phan_quyen === 'View') {
                dhQuery = dhQuery.eq('yeu_cau', currentUser.ho_ten);
            }

            // 2. Query San Pham (url_hinh_anh chuẩn theo cấu trúc database)
            let spQuery = sb.from('san_pham').select('ma_vt, ten_vt, nganh, phu_trach, url_hinh_anh', { count: 'exact' })
                .or(`ma_vt.ilike.${st},ten_vt.ilike.${st},nganh.ilike.${st},phu_trach.ilike.${st}`)
                .limit(8);
            if (currentUser?.phan_quyen === 'View') {
                spQuery = spQuery.eq('phu_trach', currentUser.ho_ten);
            }

            // 3. Query Ton Kho
            let tkQuery = sb.from('ton_kho_update').select('ma_vach, ma_vt, ten_vt, lot, date, ton_cuoi, nganh, tinh_trang', { count: 'exact' })
                .or(`ma_vach.ilike.${st},ma_vt.ilike.${st},ten_vt.ilike.${st},lot.ilike.${st},nganh.ilike.${st}`)
                .limit(8);
            if (currentUser?.phan_quyen === 'View') {
                tkQuery = tkQuery.eq('phu_trach', currentUser.ho_ten);
            }

            // 4. Query Chi Tiet
            let ctQuery = sb.from('chi_tiet').select('ma_kho, ma_nx, ma_vach, ma_vt, ten_vt, lot, nhap, xuat, thoi_gian', { count: 'exact' })
                .or(`ma_kho.ilike.${st},ma_nx.ilike.${st},ma_vach.ilike.${st},ma_vt.ilike.${st},ten_vt.ilike.${st},lot.ilike.${st}`)
                .order('thoi_gian', { ascending: false })
                .limit(8);
            if (currentUser?.phan_quyen === 'View') {
                ctQuery = ctQuery.eq('phu_trach', currentUser.ho_ten);
            }

            const results = await Promise.allSettled([
                dhQuery,
                spQuery,
                tkQuery,
                ctQuery
            ]);

            // Bỏ qua kết quả cũ nếu người dùng đã gõ từ khóa mới hơn
            if (searchSeq !== activeSearchSeq) return;

            const donHangList = results[0].status === 'fulfilled' && results[0].value?.data ? results[0].value.data : [];
            const donHangCount = results[0].status === 'fulfilled' && typeof results[0].value?.count === 'number' ? results[0].value.count : donHangList.length;

            let sanPhamList = results[1].status === 'fulfilled' && results[1].value?.data ? results[1].value.data : [];
            const sanPhamCount = results[1].status === 'fulfilled' && typeof results[1].value?.count === 'number' ? results[1].value.count : sanPhamList.length;

            const tonKhoList = results[2].status === 'fulfilled' && results[2].value?.data ? results[2].value.data : [];
            const tonKhoCount = results[2].status === 'fulfilled' && typeof results[2].value?.count === 'number' ? results[2].value.count : tonKhoList.length;

            const chiTietList = results[3].status === 'fulfilled' && results[3].value?.data ? results[3].value.data : [];
            const chiTietCount = results[3].status === 'fulfilled' && typeof results[3].value?.count === 'number' ? results[3].value.count : chiTietList.length;

            // Tính tổng tồn kho cho từng sản phẩm
            if (sanPhamList.length > 0) {
                const maVts = sanPhamList.map(p => p.ma_vt).filter(Boolean);
                if (maVts.length > 0) {
                    try {
                        const { data: stockData } = await sb
                            .from('ton_kho_update')
                            .select('ma_vt, ton_cuoi')
                            .in('ma_vt', maVts);

                        const stockMap = new Map();
                        (stockData || []).forEach(item => {
                            const cur = stockMap.get(item.ma_vt) || 0;
                            stockMap.set(item.ma_vt, cur + (Number(item.ton_cuoi) || 0));
                        });
                        sanPhamList = sanPhamList.map(sp => ({
                            ...sp,
                            total_ton_cuoi: stockMap.get(sp.ma_vt) || 0
                        }));
                    } catch (stockEx) {
                        console.warn("Stock calculation error in global search:", stockEx);
                    }
                }
            }

            const searchData = {
                donHangList,
                donHangCount,
                sanPhamList,
                sanPhamCount,
                tonKhoList,
                tonKhoCount,
                chiTietList,
                chiTietCount
            };

            // Lưu vào cache
            if (globalSearchCache.size > 60) {
                const firstKey = globalSearchCache.keys().next().value;
                globalSearchCache.delete(firstKey);
            }
            globalSearchCache.set(cacheKey, searchData);

            renderSearchResults(kw, searchData);

        } catch (err) {
            console.error("Global search error:", err);
            resultsList.innerHTML = `
                <div class="py-4 text-center text-red-500 text-xs">
                    Lỗi trong quá trình tìm kiếm dữ liệu.
                </div>
            `;
        }
    }, 120);

    input.addEventListener('input', (e) => {
        performSearch(e.target.value);
    });
}