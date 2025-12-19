





import { sb, cache, viewStates, showLoading, showToast, showConfirm, debounce, renderPagination, sanitizeFileName, filterButtonDefaultTexts, PLACEHOLDER_IMAGE_URL, currentUser, showView } from './app.js';

let selectedSanPhamImageFile = null;

function buildSanPhamQuery() {
    const state = viewStates['view-san-pham'];
    let query = sb.from('san_pham').select('*', { count: 'exact' });

    if (currentUser.phan_quyen === 'View') {
        query = query.eq('phu_trach', currentUser.ho_ten);
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
        
        let query = buildSanPhamQuery();

        const { data: sanPhamData, error, count } = await query.order('ma_vt', { ascending: true }).range(from, to);
        
        if (error) {
            showToast("Không thể tải dữ liệu sản phẩm.", 'error');
        } else {
            state.totalFilteredCount = count; 
            
            let dataWithStock = sanPhamData;
            if (sanPhamData && sanPhamData.length > 0) {
                const maVts = sanPhamData.map(p => p.ma_vt);
                const { data: stockData, error: stockError } = await sb
                    .from('ton_kho_update')
                    .select('ma_vt, ton_cuoi')
                    .in('ma_vt', maVts);
                
                if (stockError) {
                    showToast("Lỗi khi tải dữ liệu tồn kho.", 'error');
                } else {
                    const stockMap = new Map();
                    (stockData || []).forEach(item => {
                        const currentStock = stockMap.get(item.ma_vt) || 0;
                        stockMap.set(item.ma_vt, currentStock + (item.ton_cuoi || 0));
                    });

                    dataWithStock = sanPhamData.map(sp => ({
                        ...sp,
                        total_ton_cuoi: stockMap.get(sp.ma_vt) || 0
                    }));
                }
            }

            cache.sanPhamList = dataWithStock;
            
            renderSanPhamTable(dataWithStock);
            renderPagination('san-pham', count, from, to);
            updateSanPhamSelectionInfo(); 
        }
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
                ? `<img src="${sp.url_hinh_anh}" alt="${sp.ten_vt}" class="w-12 h-12 object-cover rounded-md thumbnail-image" data-large-src="${sp.url_hinh_anh}">`
                : `<div class="w-12 h-12 bg-gray-200 rounded-md flex items-center justify-center text-gray-400">...</div>`;
            
            const tonCuoiText = sp.total_ton_cuoi.toLocaleString();
            const tonCuoiClass = sp.total_ton_cuoi > 0 ? 'text-green-600' : 'text-red-500';

            return `
                <tr data-id="${sp.ma_vt}" class="cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-100' : ''}">
                    <td class="px-4 py-1 border border-gray-300 text-center"><input type="checkbox" class="san-pham-select-row" data-id="${sp.ma_vt}" ${isSelected ? 'checked' : ''}></td>
                    <td class="px-4 py-1 border border-gray-300 flex justify-center items-center">${imageHtml}</td>
                    <td class="px-6 py-1 text-sm font-medium text-gray-900 border border-gray-300">
                        <div class="flex justify-between items-center">
                            <a href="#" data-ma-vt="${sp.ma_vt}" class="san-pham-ma-vt-link text-blue-600 hover:underline">${sp.ma_vt}</a>
                            <span class="text-xs font-semibold ${tonCuoiClass}">Tồn: ${tonCuoiText}</span>
                        </div>
                    </td>
                    <td class="px-6 py-1 text-sm text-gray-600 break-words border border-gray-300">${sp.ten_vt}</td>
                    <td class="px-6 py-1 text-sm text-gray-600 border border-gray-300 text-center">${sp.nganh || ''}</td>
                    <td class="px-6 py-1 text-sm text-gray-600 border border-gray-300 text-center">${sp.phu_trach || ''}</td>
                </tr>
            `;
        }).join('');
        spTableBody.innerHTML = html;
    } else {
        spTableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4">Không có dữ liệu</td></tr>';
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

function openSanPhamModal(sp = null) {
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
        document.getElementById('san-pham-modal-nganh').value = sp.nganh || '';
        document.getElementById('san-pham-modal-phu-trach').value = sp.phu_trach || '';
        currentImageUrlInput.value = sp.url_hinh_anh || '';
        imagePreview.src = sp.url_hinh_anh || PLACEHOLDER_IMAGE_URL;
    } else {
        currentImageUrlInput.value = '';
        imagePreview.src = PLACEHOLDER_IMAGE_URL;
    }

    removeImageBtn.classList.toggle('hidden', !currentImageUrlInput.value);
    
    const datalist = document.getElementById('phu-trach-list');
    datalist.innerHTML = '';
    const phuTrachSet = new Set(cache.userList.map(u => u.ho_ten).filter(Boolean));
    phuTrachSet.forEach(name => datalist.innerHTML += `<option value="${name}">`);

    modal.classList.remove('hidden');
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

    if (!sanPhamData.ma_vt || !sanPhamData.ten_vt) {
        showToast("Mã và Tên vật tư là bắt buộc.", 'error');
        return;
    }

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

        const { error: deleteError } = await sb.from('san_pham').delete().in('ma_vt', selectedIds);
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

async function openFilterPopover(button, view) {
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
        const { data, error } = await sb.rpc('get_san_pham_filter_options', {
            filter_key: filterKey,
            _ma_vt_filter: state.filters.ma_vt || [],
            _ten_vt_filter: state.filters.ten_vt || [],
            _nganh_filter: state.filters.nganh || [],
            _phu_trach_filter: state.filters.phu_trach || [],
            _search_term: state.searchTerm || '',
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

    const closeHandler = (e) => {
        if (!popover.contains(e.target) && e.target !== button) {
            popover.remove();
            document.removeEventListener('click', closeHandler);
        }
    };

    applyBtn.onclick = () => {
        state.filters[filterKey] = [...tempSelectedOptions];
        
        const defaultText = filterButtonDefaultTexts[button.id] || button.id;
        button.textContent = tempSelectedOptions.size > 0 ? `${defaultText} (${tempSelectedOptions.size})` : defaultText;
        
        if(view === 'view-san-pham') fetchSanPham(1);
        
        popover.remove();
        document.removeEventListener('click', closeHandler);
    };
    
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

export function initSanPhamView() {
    const viewContainer = document.getElementById('view-san-pham');
    const isAdminOrUser = currentUser.phan_quyen === 'Admin' || currentUser.phan_quyen === 'User';
    viewContainer.querySelectorAll('.sp-admin-only').forEach(el => el.classList.toggle('hidden', !isAdminOrUser));


    document.getElementById('san-pham-search').addEventListener('input', debounce(() => {
        viewStates['view-san-pham'].searchTerm = document.getElementById('san-pham-search').value;
        fetchSanPham(1);
    }, 500));
    
    viewContainer.addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (btn) openFilterPopover(btn, 'view-san-pham');
    });

    document.getElementById('san-pham-reset-filters').addEventListener('click', () => {
        document.getElementById('san-pham-search').value = '';
        viewStates['view-san-pham'].searchTerm = '';
        viewStates['view-san-pham'].filters = { ma_vt: [], ten_vt: [], nganh: [], phu_trach: [] };
        document.querySelectorAll('#view-san-pham .filter-btn').forEach(btn => {
            btn.textContent = filterButtonDefaultTexts[btn.id];
        });
        fetchSanPham(1);
    });

    document.getElementById('san-pham-table-body').addEventListener('click', e => {
        if (e.target.closest('.thumbnail-image')) {
            const imgSrc = e.target.closest('.thumbnail-image').dataset.largeSrc;
            document.getElementById('image-viewer-img').src = imgSrc;
            document.getElementById('image-viewer-modal').classList.remove('hidden');
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
        if (e.target.type !== 'checkbox') {
            checkbox.checked = !checkbox.checked;
        }
        viewStates['view-san-pham'].selected[checkbox.checked ? 'add' : 'delete'](id);
        row.classList.toggle('bg-blue-100', checkbox.checked);
        updateSanPhamActionButtonsState();
        updateSanPhamSelectionInfo(); 
    });

    document.getElementById('san-pham-select-all').addEventListener('click', (e) => {
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
    
    document.getElementById('san-pham-btn-add').addEventListener('click', () => openSanPhamModal());
    document.getElementById('san-pham-btn-edit').addEventListener('click', async () => {
        const ma_vt = [...viewStates['view-san-pham'].selected][0];
        const { data } = await sb.from('san_pham').select('*').eq('ma_vt', ma_vt).single();
        if(data) openSanPhamModal(data);
    });
    document.getElementById('san-pham-btn-delete').addEventListener('click', handleDeleteMultipleSanPham);
    document.getElementById('san-pham-btn-excel').addEventListener('click', handleExcelExport);
    document.getElementById('san-pham-form').addEventListener('submit', handleSaveSanPham);
    document.getElementById('cancel-san-pham-btn').addEventListener('click', () => 
        document.getElementById('san-pham-modal').classList.add('hidden'));
    
    document.getElementById('san-pham-items-per-page').addEventListener('change', (e) => {
        viewStates['view-san-pham'].itemsPerPage = parseInt(e.target.value, 10);
        fetchSanPham(1);
    });
    document.getElementById('san-pham-prev-page').addEventListener('click', () => fetchSanPham(viewStates['view-san-pham'].currentPage - 1));
    document.getElementById('san-pham-next-page').addEventListener('click', () => fetchSanPham(viewStates['view-san-pham'].currentPage + 1));
    
    const pageInput = document.getElementById('san-pham-page-input');
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
    
    const processSpImageFile = (file) => {
        if (file && file.type.startsWith('image/')) {
            selectedSanPhamImageFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('san-pham-modal-image-preview').src = e.target.result;
                document.getElementById('san-pham-modal-remove-image-btn').classList.remove('hidden');
                document.getElementById('san-pham-modal-hinh-anh-url-hien-tai').value = 'temp-new-image';
            };
            reader.readAsDataURL(file);
        }
    };
    document.getElementById('san-pham-modal-image-upload').addEventListener('change', (e) => processSpImageFile(e.target.files[0]));
    document.getElementById('san-pham-image-paste-area').addEventListener('paste', (e) => {
        e.preventDefault();
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                processSpImageFile(items[i].getAsFile());
                return;
            }
        }
    });
    document.getElementById('san-pham-modal-remove-image-btn').addEventListener('click', () => {
        selectedSanPhamImageFile = null;
        document.getElementById('san-pham-modal-image-upload').value = '';
        document.getElementById('san-pham-modal-image-preview').src = PLACEHOLDER_IMAGE_URL;
        document.getElementById('san-pham-modal-remove-image-btn').classList.add('hidden');
        document.getElementById('san-pham-modal-hinh-anh-url-hien-tai').value = '';
    });
}