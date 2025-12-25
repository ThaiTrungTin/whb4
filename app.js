
const { createClient } = supabase;
const SUPABASE_URL = "https://uefydnefprcannlviimp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlZnlkbmVmcHJjYW5ubHZpaW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNTcwMDUsImV4cCI6MjA3NjYzMzAwNX0.X274J_1_crUknJEOT1WWUD1h0HM9WdYScDW2eWWsiLk";
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export let currentUser = null;
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
        filters: { ma_vt: [], lot: [], date: [], tinh_trang: [], nganh: [], phu_trach: [] },
        stockAvailability: 'available',
        totalFilteredCount: 0,
        paginationText: '',
    },
    'view-don-hang': {
        currentPage: 1,
        itemsPerPage: 50,
        searchTerm: '',
        selected: new Set(),
        filters: { from_date: '', to_date: '', loai: [], trang_thai_xu_ly: [], ma_kho: [], ma_nx: [], yeu_cau: [], nganh: [] },
        totalFilteredCount: 0,
        paginationText: '',
    },
    'view-chi-tiet': {
        currentPage: 1,
        itemsPerPage: 50,
        searchTerm: '',
        filters: { from_date: '', to_date: '', ma_kho: [], ma_nx: [], ma_vt: [], lot: [], nganh: [], phu_trach: [] },
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
    'chi-tiet-filter-ma-kho-btn': 'Mã Kho',
    'chi-tiet-filter-ma-nx-btn': 'Mã NX',
    'chi-tiet-filter-ma-vt-btn': 'Mã VT',
    'chi-tiet-filter-lot-btn': 'LOT',
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

export function renderPagination(viewPrefix, totalItems, from, to) {
    const state = viewStates[`view-${viewPrefix}`];
    if (!state) return;
    
    const { currentPage, itemsPerPage } = state;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginationInfoEl = document.getElementById(`${viewPrefix}-pagination-info`);
    const pageInput = document.getElementById(`${viewPrefix}-page-input`);
    const totalPagesEl = document.getElementById(`${viewPrefix}-total-pages`);
    const prevBtn = document.getElementById(`${viewPrefix}-prev-page`);
    const nextBtn = document.getElementById(`${viewPrefix}-next-page`);

    const paginationText = `(Hiển thị ${from + 1} - ${to + 1} trên ${totalItems})`;
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

    optionsList.innerHTML = suggestions.map(item => `
        <div class="px-3 py-2 cursor-pointer hover:bg-gray-100 autocomplete-option" data-value="${item[config.valueKey]}">
            <div class="flex justify-between items-center pointer-events-none gap-4">
                <p class="text-sm font-medium text-gray-900 whitespace-nowrap">${item[config.primaryTextKey]}</p>
                ${config.secondaryTextKey ? `<p class="text-xs text-gray-500 whitespace-nowrap text-right ml-4">${item[config.secondaryTextKey] || ''}</p>` : ''}
            </div>
        </div>
    `).join('');

    inputElement.parentNode.appendChild(popover);
    // Cho phép popover rộng hơn input nếu nội dung dài
    popover.style.minWidth = `${inputElement.offsetWidth}px`;
    popover.style.width = 'max-content';
    popover.style.maxWidth = '400px'; // Giới hạn tối đa để không tràn màn hình quá mức
    
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

export async function openTonKhoFilterPopover(button, view) {
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

        if (filteredOptions.length > 0) {
            optionsList.innerHTML = filteredOptions.map(option => `
                <label class="flex items-center space-x-2 px-2 py-1 hover:bg-gray-100 rounded">
                    <input type="checkbox" value="${option}" class="filter-option-cb" ${tempSelectedOptions.has(String(option)) ? 'checked' : ''}>
                    <span class="text-sm">${option}</span>
                </label>
            `).join('');
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
            _user_role: currentUser.phan_quyen,
            _user_ho_ten: currentUser.ho_ten
        });
        if (error) throw error;
        
        const uniqueOptions = Array.isArray(rpcData) ? rpcData.map(item => item.option) : [];
        renderOptions(uniqueOptions);
        setupEventListeners(uniqueOptions);
        applyBtn.disabled = false;

    } catch (error) {
        console.error("Filter popover error:", error)
        optionsList.innerHTML = '<div class="text-center p-4 text-sm text-red-500">Lỗi tải dữ liệu.</div>';
        showToast(`Lỗi tải bộ lọc cho ${filterKey}.`, 'error');
    }
    
    const closePopover = (e) => {
        if (!popover.contains(e.target) && e.target !== button) {
            popover.remove();
            document.removeEventListener('click', closePopover);
        }
    };

    applyBtn.onclick = async () => {
        state.filters[filterKey] = [...tempSelectedOptions];
        
        const defaultText = filterButtonDefaultTexts[button.id] || button.id;
        button.textContent = tempSelectedOptions.size > 0 ? `${defaultText} (${tempSelectedOptions.size})` : defaultText;
        
        if(view === 'view-ton-kho') {
            const { fetchTonKho } = await import('./tonkho.js');
            fetchTonKho(1);
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
                const response = await fetch(`san-pham.html`);
                if (!response.ok) throw new Error(`Could not load san-pham.html`);
                viewContainer.innerHTML = await response.text();
                const oldTitle = viewContainer.querySelector('h1');
                if (oldTitle) oldTitle.remove();
                const { initSanPhamView } = await import('./sanpham.js');
                initSanPhamView();
                isViewInitialized['view-san-pham'] = true;
            }
            const { fetchSanPham } = await import('./sanpham.js');
            await fetchSanPham();
        } else if (viewId === 'view-ton-kho') {
            if (!isViewInitialized['view-ton-kho']) {
                const response = await fetch(`ton-kho.html`);
                if (!response.ok) throw new Error(`Could not load ton-kho.html`);
                viewContainer.innerHTML = await response.text();
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
                const { initChiTietView } = await import('./chitiet.js');
                initChiTietView();
                isViewInitialized['view-chi-tiet'] = true;
            }
            const { fetchChiTiet } = await import('./chitiet.js');
            await fetchChiTiet();
        }
    } catch (error) {
        console.error(error);
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
            // Use a valid, authenticated endpoint to avoid CORS issues.
            // A HEAD request to the base of the REST API is lightweight and effective.
            await fetch(`${SUPABASE_URL}/rest/v1/`, {
                method: 'HEAD',
                headers: {
                    'apikey': SUPABASE_KEY
                },
                cache: 'no-store',
                signal: AbortSignal.timeout(5000) // Timeout after 5s
            });
            
            const latency = Date.now() - startTime;
            
            if (latency < 400) {
                updateNetworkStatusIndicator('good', latency);
            } else { // Anything over 400ms is considered slow, not offline.
                updateNetworkStatusIndicator('slow', latency);
            }

        } catch (error) {
            // Any fetch error (CORS, network error, timeout) means we can't reach the service.
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
                        onlineUsers.set(gmail, state[gmail][0]);
                    }
                    updateOnlineStatusUI();
                })
                .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                    onlineUsers.set(key, newPresences[0]);
                    updateOnlineStatusUI();
                })
                .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                    onlineUsers.delete(key);
                    updateOnlineStatusUI();
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await presenceChannel.track({ 
                            user_ho_ten: currentUser.ho_ten, 
                            user_avatar_url: currentUser.anh_dai_dien_url,
                            status: document.visibilityState === 'visible' ? 'online' : 'away'
                        });
                    }
                });
            
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
    });
    
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
});
