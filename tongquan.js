
import { sb, viewStates, showView, currentUser, cache, showToast } from './app.js';

let activityChart = null;
let inventoryStatusChart = null;
let currentStats = {}; // Store stats for conditional navigation
let chartMode = 'quantity'; // 'quantity' or 'transaction'
let last30DaysChiTiet = []; // Store chart data to avoid re-fetching
let allAlertsData = null;
let allNganhOptions = []; // Cache for inventory filter
let unreturnedItemsCache = []; // To store the full list for searching

const tongQuanState = {
    alerts: {
        loai: [],
        nganh: [],
        phu_trach: []
    },
    inventory: {
        nganh: []
    }
};

function updateTQFilterButtonTexts() {
    const defaultTexts = {
        'tq-alert-filter-loai-btn': 'Loại',
        'tq-alert-filter-nganh-btn': 'Ngành',
        'tq-alert-filter-phu-trach-btn': 'Phụ Trách',
        'tq-inventory-nganh-filter-btn': 'Ngành'
    };
    
    document.querySelectorAll('#view-phat-trien .filter-btn').forEach(btn => {
        const context = btn.dataset.context || 'alerts';
        const filterKey = btn.dataset.filterKey;
        const state = tongQuanState[context];
        if (state && state[filterKey]) {
            const selectedCount = state[filterKey].length;
            const defaultText = defaultTexts[btn.id] || 'Filter';
            btn.textContent = selectedCount > 0 ? `${defaultText} (${selectedCount})` : defaultText;
        }
    });
}

async function openTongQuanFilterPopover(button) {
    const filterKey = button.dataset.filterKey;
    const context = button.dataset.context || 'alerts';
    const state = tongQuanState[context];

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

    const tempSelectedOptions = new Set(state[filterKey] || []);

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
            if (e.target.classList.contains('filter-option-cb')) {
                if (e.target.checked) tempSelectedOptions.add(e.target.value);
                else tempSelectedOptions.delete(e.target.value);
                updateSelectionCount();
                updateToggleAllButtonState(allOptions.filter(opt => opt.toLowerCase().includes(searchInput.value.toLowerCase())));
            }
        });
        toggleAllBtn.onclick = () => {
            const visibleOptions = allOptions.filter(opt => opt.toLowerCase().includes(searchInput.value.toLowerCase()));
            const isSelectAllAction = toggleAllBtn.textContent === 'Tất cả';
            visibleOptions.forEach(option => {
                if (isSelectAllAction) tempSelectedOptions.add(String(option));
                else tempSelectedOptions.delete(String(option));
            });
            renderOptions(allOptions);
            updateSelectionCount();
        };
    };

    updateSelectionCount();
    
    let options = [];
    if (context === 'alerts') {
        if (filterKey === 'loai') {
            options = ['Sắp hết hàng', 'Tồn kho lâu', 'Cận date', 'Đơn hàng trễ'];
        } else {
             const allItems = [];
             Object.values(allAlertsData).forEach(arr => allItems.push(...arr));
             const keyToExtract = filterKey === 'phu_trach' ? 'phu_trach' : 'nganh';
             const altKey = filterKey === 'phu_trach' ? 'yeu_cau' : null;
             options = [...new Set(allItems.map(item => item[keyToExtract] || item[altKey]).filter(Boolean))].sort();
        }
    } else if (context === 'inventory' && filterKey === 'nganh') {
        options = allNganhOptions;
    }

    renderOptions(options);
    setupEventListeners(options);

    const closePopover = (e) => {
        if (!popover.contains(e.target) && e.target !== button) {
            popover.remove();
            document.removeEventListener('click', closePopover);
        }
    };

    applyBtn.onclick = () => {
        state[filterKey] = [...tempSelectedOptions];
        updateTQFilterButtonTexts();
        if (context === 'alerts') updateAlertFiltersAndRender();
        else if (context === 'inventory') renderInventoryStatusChart();
        popover.remove();
        document.removeEventListener('click', closePopover);
    };

    setTimeout(() => document.addEventListener('click', closePopover), 0);
}


async function fetchAlerts() {
    const isViewRole = currentUser.phan_quyen === 'View';
    const userName = currentUser.ho_ten;
    const lowStockThreshold = 10;
    const slowMovingDays = 60;
    const overdueDays = 3;
    const urgentExpiryDays = 30;

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - slowMovingDays);

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - overdueDays);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + urgentExpiryDays);

    // 1 & 2. Data for Low Stock & Slow Moving Items
    let allStockQuery = sb.from('ton_kho_update')
        .select('ma_vach, ma_vt, ten_vt, ton_cuoi, nganh, phu_trach')
        .gt('ton_cuoi', 0);
        
    // Sub-query for Slow Moving
    let recentMovementQuery = sb.from('chi_tiet')
        .select('ma_vach')
        .eq('loai', 'Xuat')
        .gte('thoi_gian', sixtyDaysAgo.toISOString());
        
    // 3. Urgent Expiry
    let urgentExpiryQuery = sb.from('ton_kho_update')
        .select('ma_vt, ten_vt, lot, date, nganh, phu_trach')
        .eq('tinh_trang', 'Cận date')
        .gt('ton_cuoi', 0);

    // 4. Overdue Orders
    let overdueOrdersQuery = sb.from('don_hang')
        .select('ma_kho, yeu_cau, thoi_gian, nganh, ma_nx')
        .like('ma_nx', '%-')
        .lte('thoi_gian', threeDaysAgo.toISOString())
        .order('thoi_gian', { ascending: true })
        .limit(5);

    if (isViewRole) {
        allStockQuery = allStockQuery.eq('phu_trach', userName);
        urgentExpiryQuery = urgentExpiryQuery.eq('phu_trach', userName);
        overdueOrdersQuery = overdueOrdersQuery.eq('yeu_cau', userName);
    }
    
    const [
        allStockRes,
        recentMovementRes,
        urgentExpiryRes,
        overdueOrdersRes
    ] = await Promise.all([
        allStockQuery,
        recentMovementQuery,
        urgentExpiryQuery,
        overdueOrdersQuery
    ]);

    // Process Low Stock
    const stockByProduct = new Map();
    (allStockRes.data || []).forEach(item => {
        if (!stockByProduct.has(item.ma_vt)) {
            stockByProduct.set(item.ma_vt, {
                ma_vt: item.ma_vt,
                ten_vt: item.ten_vt,
                nganh: item.nganh,
                phu_trach: item.phu_trach,
                total_ton_cuoi: 0,
            });
        }
        stockByProduct.get(item.ma_vt).total_ton_cuoi += item.ton_cuoi;
    });

    const lowStockItems = [...stockByProduct.values()].filter(
        item => item.total_ton_cuoi > 0 && item.total_ton_cuoi <= lowStockThreshold
    );

    // Process Slow Moving
    const recentlyMovedMaVach = new Set((recentMovementRes.data || []).map(i => i.ma_vach));
    const slowMovingItems = (allStockRes.data || []).filter(item => !recentlyMovedMaVach.has(item.ma_vach)).slice(0, 5);
    
    // Process Urgent Expiry
    const parseDate = (dateString) => {
        if (!dateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return null;
        const [day, month, year] = dateString.split('/').map(Number);
        const date = new Date(year, month - 1, day);
        return isNaN(date.getTime()) ? null : date;
    };

    const urgentExpiryItems = (urgentExpiryRes.data || []).filter(item => {
        const expiryDate = parseDate(item.date);
        return expiryDate && expiryDate >= today && expiryDate <= sevenDaysFromNow;
    }).slice(0, 5);

    return {
        lowStock: lowStockItems,
        slowMoving: slowMovingItems,
        urgentExpiry: urgentExpiryItems,
        overdueOrders: overdueOrdersRes.data || [],
    };
}

function renderAlerts(alerts) {
    const listEl = document.getElementById('tq-alerts-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    let alertCount = 0;

    const createAlertItem = (icon, text, info, action, data) => {
        const li = document.createElement('li');
        li.className = 'flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer alert-item';
        li.dataset.action = action;
        li.dataset.value = data;

        const infoHtml = `
            <div class="flex-shrink-0 text-right text-xs text-gray-500 ml-4 w-28">
                <p class="truncate" title="${info.nganh || ''}">${info.nganh || 'N/A'}</p>
                <p class="font-medium truncate" title="${info.phu_trach || ''}">${info.phu_trach || 'N/A'}</p>
            </div>
        `;

        li.innerHTML = `
            ${icon}
            <div class="flex-grow">
                <span class="text-sm text-gray-700">${text}</span>
            </div>
            ${infoHtml}
        `;
        listEl.appendChild(li);
        alertCount++;
    };
    
    const icons = {
        lowStock: `<div class="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center"><svg class="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2a1 1 0 011 1v8a1 1 0 01-1 1h-2a1 1 0 01-1-1z"></path></svg></div>`,
        slowMoving: `<div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>`,
        urgentExpiry: `<div class="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></div>`,
        overdueOrders: `<div class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center"><svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg></div>`
    };

    (alerts.lowStock || []).forEach(item => {
        const text = `Sắp hết hàng: <strong>${item.ten_vt} (${item.ma_vt})</strong> chỉ còn tồn <strong class="text-red-600">${item.total_ton_cuoi}</strong>.`;
        const info = { nganh: item.nganh, phu_trach: item.phu_trach };
        createAlertItem(icons.lowStock, text, info, 'ton-kho:ma_vt', item.ma_vt);
        alertCount++;
    });
    
    (alerts.slowMoving || []).forEach(item => {
        const text = `Tồn kho lâu: <strong>${item.ten_vt} (${item.ma_vt})</strong> không có giao dịch xuất trong 60 ngày qua.`;
        const info = { nganh: item.nganh, phu_trach: item.phu_trach };
        createAlertItem(icons.slowMoving, text, info, 'ton-kho:ma_vt', item.ma_vt);
        alertCount++;
    });

    (alerts.urgentExpiry || []).forEach(item => {
        const text = `Cận date: Lô <strong>${item.lot}</strong> của <strong>${item.ten_vt}</strong> sẽ hết hạn vào <strong>${item.date}</strong>.`;
        const info = { nganh: item.nganh, phu_trach: item.phu_trach };
        createAlertItem(icons.urgentExpiry, text, info, 'ton-kho:lot', item.lot);
        alertCount++;
    });
    
    (alerts.overdueOrders || []).forEach(item => {
        const daysOverdue = Math.floor((new Date() - new Date(item.thoi_gian)) / (1000 * 60 * 60 * 24));
        const text = `Đơn hàng trễ: <strong>${item.ma_kho}</strong> của <strong>${item.yeu_cau}</strong> đã quá hạn xử lý ${daysOverdue} ngày.`;
        const info = { nganh: item.nganh, phu_trach: item.yeu_cau };
        createAlertItem(icons.overdueOrders, text, info, 'don-hang:ma_kho', item.ma_kho);
        alertCount++;
    });


    if (alertCount === 0) {
        listEl.innerHTML = `
            <li class="flex items-center space-x-3 p-3">
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <span class="text-sm text-gray-700 font-medium">Mọi thứ đều ổn! Không có cảnh báo nào.</span>
            </li>
        `;
    }
}

function renderActivityChart() {
    const ctxEl = document.getElementById('tq-activity-chart');
    if (!ctxEl) return;
    const ctx = ctxEl.getContext('2d');
    
    const last30Days = {};
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        last30Days[key] = { nhap: 0, xuat: 0 };
    }

    last30DaysChiTiet.forEach(item => {
        const key = item.thoi_gian.split('T')[0];
        if (last30Days[key]) {
            if (chartMode === 'quantity') {
                last30Days[key].nhap += item.nhap || 0;
                last30Days[key].xuat += item.xuat || 0;
            } else { // transaction mode
                if (item.nhap > 0) last30Days[key].nhap++;
                if (item.xuat > 0) last30Days[key].xuat++;
            }
        }
    });

    const labels = Object.keys(last30Days).map(dateStr => {
        const date = new Date(dateStr);
        return `${date.getDate()}/${date.getMonth() + 1}`;
    });
    const nhapData = Object.values(last30Days).map(d => d.nhap);
    const xuatData = Object.values(last30Days).map(d => d.xuat);
    const netData = nhapData.map((nhap, i) => nhap - xuatData[i]);

    if (activityChart) {
        activityChart.destroy();
    }

    activityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Nhập',
                    data: nhapData,
                    backgroundColor: 'rgba(54, 162, 235, 0.6)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    type: 'bar',
                    yAxisID: 'y'
                },
                {
                    label: 'Xuất',
                    data: xuatData,
                    backgroundColor: 'rgba(255, 99, 132, 0.6)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1,
                    type: 'bar',
                    yAxisID: 'y'
                },
                {
                    label: 'Thay Đổi Ròng',
                    data: netData,
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    type: 'line',
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            if (chartMode === 'quantity' && value >= 1000) return (value / 1000) + 'k';
                            if (Number.isInteger(value)) return value;
                        }
                    }
                },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            interaction: { mode: 'index', intersect: false },
        }
    });
}

async function renderInventoryStatusChart() {
    const ctxEl = document.getElementById('tq-inventory-chart');
    if (!ctxEl) return;
    const ctx = ctxEl.getContext('2d');

    const selectedNganhArr = tongQuanState.inventory.nganh;

    let query = sb.from('ton_kho_update').select('tinh_trang, ton_cuoi');
    if (currentUser.phan_quyen === 'View') {
        query = query.eq('phu_trach', currentUser.ho_ten);
    }
    if (selectedNganhArr.length > 0) {
        query = query.in('nganh', selectedNganhArr);
    }

    const { data, error } = await query;
    if (error) {
        console.error("Error fetching inventory status:", error);
        return;
    }
    
    const labels = ['Còn sử dụng', 'Cận date', 'Hết hạn sử dụng', 'Hàng hư'];
    const statusCounts = {
        'Còn sử dụng': 0,
        'Cận date': 0,
        'Hết hạn sử dụng': 0,
        'Hàng hư': 0
    };

    (data || []).forEach(item => {
        if (statusCounts.hasOwnProperty(item.tinh_trang)) {
            statusCounts[item.tinh_trang] += (item.ton_cuoi || 0);
        }
    });

    const chartData = labels.map(label => statusCounts[label]);

    if (inventoryStatusChart) {
        inventoryStatusChart.destroy();
    }

    inventoryStatusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Số Lượng',
                data: chartData,
                backgroundColor: [
                    'rgba(49, 209, 52, 0.93)',  // Green for Còn sử dụng
                    'rgba(54, 162, 235, 0.7)',  // Blue for Cận date
                    'rgba(251, 3, 3, 0.7)',   // Red for Hết hạn sử dụng
                    'rgba(242, 242, 8, 1)'   // Yellow for Hàng hư
                ],
                borderColor: [
                    'rgba(49, 209, 52, 0.93)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(251, 3, 3, 0.7)',
                    'rgba(242, 242, 8, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += context.parsed.toLocaleString();
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function renderRecentOrders(orders) {
    const listEl = document.getElementById('tq-recent-orders-list');
    if (!listEl) return;
    if (!orders || orders.length === 0) {
        listEl.innerHTML = '<li class="text-center text-gray-500">Không có đơn hàng nào.</li>';
        return;
    }

    listEl.innerHTML = orders.map(order => {
        const isXuat = order.ma_kho.startsWith('OUT');
        const icon = isXuat
            ? `<svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>`
            : `<svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16l-4-4m0 0l4-4m-4 4h18"></path></svg>`;

        const date = new Date(order.thoi_gian);
        const formattedDate = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

        const isProcessing = order.ma_nx && order.ma_nx.endsWith('-');
        const statusText = isProcessing ? 'Đang xử lý' : 'Đã xử lý';
        const statusClass = isProcessing ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800';
        const statusHtml = `<span class="px-2 py-0.5 text-xs font-medium rounded-full ${statusClass}">${statusText}</span>`;

        return `
            <li class="flex items-center space-x-4 p-2 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors" data-ma-kho="${order.ma_kho}">
                <div class="p-2 bg-gray-100 rounded-full">${icon}</div>
                <div class="flex-grow">
                    <p class="font-semibold text-gray-800">${order.ma_kho} - ${order.ma_nx || ''}</p>
                    <p class="text-sm text-gray-500">${order.yeu_cau} - ${order.nganh}</p>
                </div>
                <div class="flex flex-col items-end flex-shrink-0 gap-1">
                    <p class="text-sm text-gray-500">${formattedDate}</p>
                    ${statusHtml}
                </div>
            </li>
        `;
    }).join('');
}

function updateAlertFiltersAndRender() {
    if (!allAlertsData) return;
    
    const loaiMap = {
        'Sắp hết hàng': 'lowStock',
        'Tồn kho lâu': 'slowMoving',
        'Cận date': 'urgentExpiry',
        'Đơn hàng trễ': 'overdueOrders'
    };
    const selectedLoaiKeys = tongQuanState.alerts.loai.map(l => loaiMap[l]);
    const selectedNganh = tongQuanState.alerts.nganh;
    const selectedPhuTrach = tongQuanState.alerts.phu_trach;

    const allItems = [];
    Object.keys(allAlertsData).forEach(key => {
        if(Array.isArray(allAlertsData[key])) {
             allItems.push(...allAlertsData[key].map(item => ({ ...item, _type: key })));
        }
    });

    const itemsToDisplay = allItems.filter(item => {
        const matchesLoai = selectedLoaiKeys.length === 0 || selectedLoaiKeys.includes(item._type);
        const matchesNganh = selectedNganh.length === 0 || selectedNganh.includes(item.nganh || (item._type === 'overdueOrders' ? item.nganh : null));
        const phu_trach = item.phu_trach || (item._type === 'overdueOrders' ? item.yeu_cau : null);
        const matchesPhuTrach = selectedPhuTrach.length === 0 || selectedPhuTrach.includes(phu_trach);
        return matchesLoai && matchesNganh && matchesPhuTrach;
    });
    
    const displayedAlerts = {};
    itemsToDisplay.forEach(item => {
        if (!displayedAlerts[item._type]) {
            displayedAlerts[item._type] = [];
        }
        displayedAlerts[item._type].push(item);
    });

    renderAlerts(displayedAlerts);
}

async function fetchAndRenderUnreturnedItems() {
    const tableBody = document.getElementById('tq-unreturned-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="10" class="text-center p-4 text-gray-500">Đang tải dữ liệu...</td></tr>';

    try {
        const { data: returnChiTietNotes, error: returnChiTietError } = await sb.from('chi_tiet')
            .select('muc_dich')
            .gt('nhap', 0);
        if (returnChiTietError) throw returnChiTietError;

        const { data: returnDonHangNotes, error: returnDonHangError } = await sb.from('don_hang')
            .select('ghi_chu, muc_dich')
            .ilike('ma_kho', 'IN.%');
        if (returnDonHangError) throw returnDonHangError;
        
        const allReturnStrings = [];
        (returnChiTietNotes || []).forEach(n => {
            if (n.muc_dich) allReturnStrings.push(n.muc_dich.toLowerCase());
        });
        (returnDonHangNotes || []).forEach(n => {
            if (n.muc_dich) allReturnStrings.push(n.muc_dich.toLowerCase());
            if (n.ghi_chu) allReturnStrings.push(n.ghi_chu.toLowerCase());
        });

        let displayExportQuery = sb.from('chi_tiet')
            .select('stt, thoi_gian, ma_nx, ma_vt, ten_vt, lot, date, xuat, yeu_cau, muc_dich, nganh')
            .gt('xuat', 0)
            .eq('loai', 'Trưng Bày')
            .order('thoi_gian', { ascending: false })
            .order('ma_nx', { ascending: true })
            .order('stt', { ascending: true });

        if (currentUser.phan_quyen === 'View') {
            displayExportQuery = displayExportQuery.eq('phu_trach', currentUser.ho_ten);
        }

        const { data: displayExports, error: displayExportsError } = await displayExportQuery;
        if (displayExportsError) throw displayExportsError;

        if (!displayExports || displayExports.length === 0) {
            unreturnedItemsCache = [];
            renderUnreturnedItemsTable([]);
            return;
        }

        const unreturnedItems = displayExports.filter(exportItem => {
            if (!exportItem.ma_nx) return true;
            const maNxToSearch = exportItem.ma_nx.trim().toLowerCase();
            if (!maNxToSearch) return true;
            const isReturned = allReturnStrings.some(returnString => returnString.includes(maNxToSearch));
            return !isReturned;
        });

        unreturnedItemsCache = unreturnedItems;
        renderUnreturnedItemsTable(unreturnedItems);

    } catch (error) {
        console.error("Error fetching unreturned display items:", error);
        tableBody.innerHTML = '<tr><td colspan="10" class="text-center p-4 text-red-500">Lỗi tải dữ liệu.</td></tr>';
    }
}

function renderUnreturnedItemsTable(items) {
    const tableBody = document.getElementById('tq-unreturned-table-body');
    const totalEl = document.getElementById('tq-unreturned-total-sl');
    if (!tableBody || !totalEl) return;

    if (!items || items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" class="text-center p-4 text-gray-500">Không có hàng trưng bày nào chưa trả.</td></tr>';
        totalEl.classList.add('hidden');
        return;
    }
    
    const totalSl = items.reduce((sum, item) => sum + (item.xuat || 0), 0);
    totalEl.textContent = `Tổng SL: ${totalSl.toLocaleString()}`;
    totalEl.classList.remove('hidden');

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    tableBody.innerHTML = items.map(item => `
        <tr class="hover:bg-gray-50">
            <td class="p-2 border whitespace-nowrap">${formatDate(item.thoi_gian)}</td>
            <td class="p-2 border">${item.ma_nx || ''}</td>
            <td class="p-2 border">${item.ma_vt || ''}</td>
            <td class="p-2 border">${item.ten_vt || ''}</td>
            <td class="p-2 border">${item.lot || ''}</td>
            <td class="p-2 border">${item.date || ''}</td>
            <td class="p-2 border text-center font-bold text-red-600">${item.xuat}</td>
            <td class="p-2 border">${item.yeu_cau || ''}</td>
            <td class="p-2 border">${item.muc_dich || ''}</td>
            <td class="p-2 border">${item.nganh || ''}</td>
        </tr>
    `).join('');
}

function resetStatsUI() {
    const idsToReset = ['tq-stat-don-hang', 'tq-stat-san-pham', 'tq-stat-can-date', 'tq-stat-het-han'];
    idsToReset.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '...';
    });
    
    const subIdsToReset = ['tq-sub-stat-don-hang', 'tq-sub-stat-san-pham', 'tq-sub-stat-can-date', 'tq-sub-stat-het-han'];
    subIdsToReset.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '&nbsp;';
    });
}

export async function fetchTongQuanData() {
    resetStatsUI();
    document.getElementById('tq-recent-orders-list').innerHTML = '<li class="text-center text-gray-500">Đang tải...</li>';
    document.getElementById('tq-alerts-list').innerHTML = '<li class="text-center text-gray-500 py-4">Đang kiểm tra...</li>';

    // Part 1: Fetch and render primary stats immediately
    try {
        const isViewRole = currentUser.phan_quyen === 'View';
        const userName = currentUser.ho_ten;

        // --- PROCESSING ORDERS TREND ---
        const today = new Date();
        const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1)); // Monday as start of week
        startOfWeek.setHours(0, 0, 0, 0);
        const startOfLastWeek = new Date(startOfWeek);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

        let thisWeekQuery = sb.from('don_hang').select('ma_kho', { count: 'exact', head: true }).like('ma_nx', '%-').gte('thoi_gian', startOfWeek.toISOString());
        let lastWeekQuery = sb.from('don_hang').select('ma_kho', { count: 'exact', head: true }).like('ma_nx', '%-').gte('thoi_gian', startOfLastWeek.toISOString()).lt('thoi_gian', startOfWeek.toISOString());
        
        // --- QUERIES FOR OTHER CARDS ---
        let sanPhamCountQuery = sb.from('san_pham').select('ma_vt', { count: 'exact', head: true });
        let tonKhoQuery = sb.from('ton_kho_update').select('ma_vt, date, ton_cuoi, tinh_trang');

        if (isViewRole) {
            thisWeekQuery = thisWeekQuery.eq('yeu_cau', userName);
            lastWeekQuery = lastWeekQuery.eq('yeu_cau', userName);
            sanPhamCountQuery = sanPhamCountQuery.eq('phu_trach', userName);
            tonKhoQuery = tonKhoQuery.eq('phu_trach', userName);
        }

        const [thisWeekRes, lastWeekRes, sanPhamCountRes, tonKhoRes] = await Promise.all([thisWeekQuery, lastWeekQuery, sanPhamCountQuery, tonKhoQuery]);
        
        const primaryErrors = [thisWeekRes.error, lastWeekRes.error, sanPhamCountRes.error, tonKhoRes.error].filter(Boolean);
        if (primaryErrors.length > 0) throw new Error(primaryErrors.map(e => e.message).join('; '));

        // -- Card 1: Processing Orders --
        const thisWeekCount = thisWeekRes.count ?? 0;
        const lastWeekCount = lastWeekRes.count ?? 0;
        const trend = thisWeekCount - lastWeekCount;
        document.getElementById('tq-stat-don-hang').textContent = thisWeekCount.toLocaleString();
        const trendEl = document.getElementById('tq-sub-stat-don-hang');
        if (trend > 0) {
            trendEl.innerHTML = `<span class="text-green-600 font-semibold">▲ ${trend}</span> vs. tuần trước`;
        } else if (trend < 0) {
            trendEl.innerHTML = `<span class="text-red-600 font-semibold">▼ ${Math.abs(trend)}</span> vs. tuần trước`;
        } else {
            trendEl.innerHTML = `Bằng tuần trước`;
        }
        
        // -- Card 2: Stock Stats (REVISED LOGIC) --
        const totalSanPhamCount = sanPhamCountRes.count ?? 0;
        const allStockItems = tonKhoRes.data || [];
        const khaDungStock = allStockItems
            .filter(item => (item.ton_cuoi || 0) > 0)
            .reduce((sum, item) => sum + item.ton_cuoi, 0);
            
        document.getElementById('tq-stat-san-pham').textContent = totalSanPhamCount.toLocaleString();
        document.getElementById('tq-sub-stat-san-pham').innerHTML = `<span class="text-gray-500">Khả dụng:</span> ${khaDungStock.toLocaleString()}`;

        // -- Card 3: Cận Date --
        const canDateItems = allStockItems.filter(item => item.tinh_trang === 'Cận date' && item.ton_cuoi > 0);
        const canDateProductCount = new Set(canDateItems.map(i => i.ma_vt)).size;
        const canDateQuantity = canDateItems.reduce((sum, i) => sum + i.ton_cuoi, 0);
        document.getElementById('tq-stat-can-date').textContent = `${canDateProductCount} mặt hàng`;
        document.getElementById('tq-sub-stat-can-date').innerHTML = `<span class="text-gray-500">Số lượng:</span> ${canDateQuantity.toLocaleString()}`;

        // -- Card 4: Hết Hạn this month --
        const parseDate = (dateString) => {
            if (!dateString || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return null;
            const [day, month, year] = dateString.split('/').map(Number);
            return new Date(year, month - 1, day);
        };
        const todayForExpiry = new Date(); 
        todayForExpiry.setHours(0,0,0,0);
        const currentMonth = todayForExpiry.getMonth();
        const currentYear = todayForExpiry.getFullYear();
        
        const hetHanItems = allStockItems.filter(item => {
            const expiryDate = parseDate(item.date);
            return expiryDate && expiryDate.getMonth() === currentMonth && expiryDate.getFullYear() === currentYear && expiryDate <= todayForExpiry;
        });
        const hetHanProductCount = new Set(hetHanItems.map(i => i.ma_vt)).size;
        const hetHanQuantity = hetHanItems.reduce((sum, i) => sum + i.ton_cuoi, 0);
        document.getElementById('tq-stat-het-han').textContent = `${hetHanProductCount} mặt hàng`;
        document.getElementById('tq-sub-stat-het-han').innerHTML = `<span class="text-gray-500">Số lượng:</span> ${hetHanQuantity.toLocaleString()}`;
        
        currentStats = {
            donHangCount: thisWeekCount,
            sanPhamLoai: totalSanPhamCount,
            canDateLo: canDateProductCount,
            hetHanLo: hetHanProductCount,
        };

    } catch (error) {
        console.error("Failed to fetch primary overview data:", error);
        const errorText = "Lỗi";
        ['tq-stat-don-hang', 'tq-stat-san-pham', 'tq-stat-can-date', 'tq-stat-het-han'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = errorText;
        });
    }
    
    // Part 2: Fetch and render secondary data independently
    try {
        const isViewRole = currentUser.phan_quyen === 'View';
        const userName = currentUser.ho_ten;
        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        let chiTietQuery = sb.from('chi_tiet').select('thoi_gian, nhap, xuat').gte('thoi_gian', thirtyDaysAgo.toISOString());
        let ordersQuery = sb.from('don_hang').select('*').order('thoi_gian', { ascending: false }).limit(5);
        if (isViewRole) {
            chiTietQuery = chiTietQuery.eq('phu_trach', userName);
            ordersQuery = ordersQuery.eq('yeu_cau', userName);
        }
        let nganhQuery = sb.from('ton_kho_update').select('nganh');
        if (isViewRole) nganhQuery = nganhQuery.eq('phu_trach', userName);

        const [chiTietRes, ordersRes, alertsData, nganhRes] = await Promise.all([
             chiTietQuery, ordersQuery, fetchAlerts(), nganhQuery
        ]);
        
        last30DaysChiTiet = chiTietRes.data || [];
        allAlertsData = alertsData;
        allNganhOptions = [...new Set((nganhRes.data || []).map(item => item.nganh).filter(Boolean))].sort();

        renderActivityChart();
        renderRecentOrders(ordersRes.data || []);
        updateAlertFiltersAndRender();
        renderInventoryStatusChart();
        fetchAndRenderUnreturnedItems();

    } catch (error) {
        console.error("Failed to fetch secondary overview data:", error);
        showToast("Lỗi tải một số thành phần trên trang Tổng Quan.", "error");
    }
}


export function initTongQuanView() {
    const view = document.getElementById('view-phat-trien');
    if(!view) return;

    if (!view.dataset.listenerAttached) {
        view.addEventListener('click', (e) => {
            const filterBtn = e.target.closest('.filter-btn');
            if (filterBtn) {
                openTongQuanFilterPopover(filterBtn);
                return;
            }

            const cardDonHang = e.target.closest('#tq-card-don-hang');
            const cardSanPham = e.target.closest('#tq-card-san-pham');
            const cardCanDate = e.target.closest('#tq-card-can-date');
            const cardHetHan = e.target.closest('#tq-card-het-han');
            const alertItem = e.target.closest('.alert-item');
            const recentOrderItem = e.target.closest('#tq-recent-orders-list li');

            const resetAndShow = (viewId, filters) => {
                const state = viewStates[viewId];
                if (state) {
                    state.searchTerm = '';
                    state.currentPage = 1;
                    Object.keys(state.filters).forEach(key => {
                        if (Array.isArray(state.filters[key])) state.filters[key] = [];
                        else if (typeof state.filters[key] === 'string') state.filters[key] = '';
                    });
                    Object.assign(state.filters, filters);
                    if (viewId === 'view-ton-kho') {
                        // If filtering by a status, default to 'available' view. otherwise 'all' might be better.
                        const hasStatusFilter = filters.tinh_trang && filters.tinh_trang.length > 0;
                        state.stockAvailability = hasStatusFilter ? 'available' : 'all';
                        sessionStorage.setItem('tonKhoStockAvailability', state.stockAvailability);
                    }
                    showView(viewId);
                }
            };

            if (cardDonHang && currentStats.donHangCount > 0) {
                resetAndShow('view-don-hang', { trang_thai_xu_ly: ['Đang xử lý'] });
                return;
            }
            if (cardSanPham) {
                 resetAndShow('view-ton-kho', {});
                 const tonKhoState = viewStates['view-ton-kho'];
                 tonKhoState.stockAvailability = 'available';
                 sessionStorage.setItem('tonKhoStockAvailability', 'available');
                 showView('view-ton-kho');
                return;
            }
            if (cardCanDate && currentStats.canDateLo > 0) {
                resetAndShow('view-ton-kho', { tinh_trang: ['Cận date'] });
                return;
            }
            if (cardHetHan && currentStats.hetHanLo > 0) {
                resetAndShow('view-ton-kho', { tinh_trang: ['Hết hạn sử dụng'] });
                return;
            }

            if (alertItem) {
                const { action, value } = alertItem.dataset;
                if (!action || !value) return;

                const [targetViewPrefix, filterKey] = action.split(':');
                const targetView = `view-${targetViewPrefix}`;
                
                const newFilters = { [filterKey]: [value] };
                if (targetView === 'view-don-hang') newFilters.trang_thai_xu_ly = ['Đang xử lý'];
                
                resetAndShow(targetView, newFilters);
                return;
            }
             if (recentOrderItem && recentOrderItem.dataset.maKho) {
                const ma_kho = recentOrderItem.dataset.maKho;
                resetAndShow('view-don-hang', { ma_kho: [ma_kho] });
                return;
            }
        });
        
        const unreturnedSearch = document.getElementById('tq-unreturned-search');
        const unreturnedExportBtn = document.getElementById('tq-unreturned-export-btn');

        if (unreturnedSearch) {
            unreturnedSearch.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const filteredItems = unreturnedItemsCache.filter(item => 
                    Object.values(item).some(val => 
                        String(val).toLowerCase().includes(searchTerm)
                    )
                );
                renderUnreturnedItemsTable(filteredItems);
            });
        }

        if (unreturnedExportBtn) {
            unreturnedExportBtn.addEventListener('click', () => {
                const searchTerm = unreturnedSearch.value.toLowerCase();
                const itemsToExport = unreturnedItemsCache.filter(item => 
                    Object.values(item).some(val => 
                        String(val).toLowerCase().includes(searchTerm)
                    )
                );
        
                if (itemsToExport.length === 0) {
                    showToast('Không có dữ liệu để xuất.', 'info');
                    return;
                }
        
                const worksheet = XLSX.utils.json_to_sheet(itemsToExport);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "HangTrungBayChuaTra");
                XLSX.writeFile(workbook, `HangTrungBayChuaTra_${new Date().toISOString().slice(0,10)}.xlsx`);
            });
        }

        view.dataset.listenerAttached = 'true';
    }


    const quantityBtn = document.getElementById('tq-chart-mode-quantity');
    const transactionBtn = document.getElementById('tq-chart-mode-transaction');

    if(quantityBtn && transactionBtn && !quantityBtn.dataset.listenerAttached) {
        quantityBtn.addEventListener('click', () => {
            if (chartMode === 'quantity') return;
            chartMode = 'quantity';
            quantityBtn.classList.add('bg-gray-200', 'font-semibold');
            quantityBtn.classList.remove('text-gray-600');
            transactionBtn.classList.remove('bg-gray-200', 'font-semibold');
            transactionBtn.classList.add('text-gray-600');
            renderActivityChart();
        });

        transactionBtn.addEventListener('click', () => {
            if (chartMode === 'transaction') return;
            chartMode = 'transaction';
            transactionBtn.classList.add('bg-gray-200', 'font-semibold');
            transactionBtn.classList.remove('text-gray-600');
            quantityBtn.classList.remove('bg-gray-200', 'font-semibold');
            quantityBtn.classList.add('text-gray-600');
            renderActivityChart();
        });
        quantityBtn.dataset.listenerAttached = 'true';
    }
}