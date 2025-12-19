

import { sb, cache, currentUser, showLoading, showToast, showConfirm, DEFAULT_AVATAR_URL, updateSidebarAvatar, sanitizeFileName, onlineUsers } from './app.js';

let selectedAvatarFile = null;

async function handleProfileUpdate(e) {
    e.preventDefault();
    const ho_ten = document.getElementById('profile-ho-ten').value;
    const old_password = document.getElementById('profile-old-password').value;
    const new_password = document.getElementById('profile-new-password').value;
    const confirm_password = document.getElementById('profile-confirm-password').value;
    let anh_dai_dien_url = document.getElementById('profile-current-avatar-url').value;
    const old_anh_dai_dien_url = currentUser.anh_dai_dien_url;

    if (currentUser.mat_khau !== old_password) {
        showToast("Mật khẩu cũ không chính xác.", 'error');
        return;
    }
    if (new_password && new_password !== confirm_password) {
        showToast("Mật khẩu mới không khớp.", 'error');
        return;
    }
    
    if (ho_ten !== currentUser.ho_ten) {
        const { count, error } = await sb
            .from('user')
            .select('ho_ten', { count: 'exact', head: true })
            .eq('ho_ten', ho_ten)
            .neq('gmail', currentUser.gmail);

        if (error) {
            showToast(`Lỗi kiểm tra tên: ${error.message}`, 'error');
            return;
        }

        if (count > 0) {
            showToast('Tên này đã được người dùng khác sử dụng.', 'error');
            return;
        }
    }


    showLoading(true);

    try {
        if (selectedAvatarFile) {
            const safeFileName = sanitizeFileName(`${currentUser.gmail}-${Date.now()}-${selectedAvatarFile.name}`);
            const filePath = `public/${safeFileName}`;

            const { error: uploadError } = await sb.storage.from('anh_dai_dien').upload(filePath, selectedAvatarFile);
            if (uploadError) throw new Error(`Lỗi tải ảnh lên: ${uploadError.message}`);

            const { data: urlData } = sb.storage.from('anh_dai_dien').getPublicUrl(filePath);
            anh_dai_dien_url = urlData.publicUrl;
        } 
        
        if ((selectedAvatarFile || !anh_dai_dien_url) && old_anh_dai_dien_url) {
             const oldFileName = old_anh_dai_dien_url.split('/').pop();
             await sb.storage.from('anh_dai_dien').remove([`public/${oldFileName}`]);
        }

        const updateData = { ho_ten, anh_dai_dien_url };
        if (new_password) {
            updateData.mat_khau = new_password;
        }

        const { data, error } = await sb.from('user').update(updateData).eq('gmail', currentUser.gmail).select().single();
        if (error) throw error;
        
        showToast("Cập nhật thông tin thành công!", "success");
        sessionStorage.setItem('loggedInUser', JSON.stringify(data));
        
        document.getElementById('user-ho-ten').textContent = data.ho_ten || 'User';
        document.getElementById('profile-form').reset();
        document.getElementById('profile-ho-ten').value = data.ho_ten;
        updateSidebarAvatar(data.anh_dai_dien_url);
        initProfileAvatarState();

    } catch (error) {
        showToast(`Cập nhật thất bại: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

export async function fetchUsers() {
    const { data, error } = await sb.from('user').select('*').order('ho_ten');
    if (error) {
        showToast("Không thể tải danh sách nhân viên.", 'error');
    } else {
        cache.userList = data;
        renderUserList(data);
    }
}

function renderUserList(users) {
    const userListContainer = document.getElementById('user-list-body');
    if (!userListContainer) return;
    userListContainer.innerHTML = '';
    if (!users || users.length === 0) {
        userListContainer.innerHTML = `<p class="text-center text-gray-500">Không có người dùng nào.</p>`;
        return;
    }
    users.forEach(user => {
        const isCurrentUser = user.gmail === currentUser.gmail;
        const presenceInfo = onlineUsers.get(user.gmail);
        const status = presenceInfo ? (presenceInfo.status || 'online') : 'offline';

        let onlineIndicatorHtml = '';
        if (status !== 'offline') {
            const statusColor = status === 'away' ? 'bg-yellow-400' : 'bg-green-500';
            onlineIndicatorHtml = `<span class="absolute bottom-0 right-0 block h-3 w-3 rounded-full ${statusColor} border-2 border-white ring-1 ring-gray-300"></span>`;
        }
        
        let gmailClass = '';
        let statusText = user.stt || 'Chờ Duyệt';
        switch (statusText) {
            case 'Đã Duyệt': 
                gmailClass = 'bg-green-100 text-green-800'; 
                break;
            case 'Khóa': 
                gmailClass = 'bg-red-100 text-red-800'; 
                break;
            default: 
                gmailClass = 'bg-yellow-100 text-yellow-800'; 
                statusText = 'Chờ Duyệt';
        }

        let statusOptionsHtml = '';
        if (user.stt === 'Khóa') {
             statusOptionsHtml += `<button class="user-status-option block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-gmail="${user.gmail}" data-status="Đã Duyệt">Mở Khóa</button>`;
        } else {
             statusOptionsHtml += `<button class="user-status-option block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-gmail="${user.gmail}" data-status="Đã Duyệt">Duyệt</button>`;
             statusOptionsHtml += `<button class="user-status-option block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" data-gmail="${user.gmail}" data-status="Khóa">Khóa</button>`;
        }
        
        userListContainer.innerHTML += `
            <div class="border rounded-lg p-4 bg-gray-50/50 shadow-sm">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div class="flex-grow flex items-center gap-4">
                         <div class="relative flex-shrink-0">
                            <img src="${user.anh_dai_dien_url || DEFAULT_AVATAR_URL}" alt="Avatar" class="w-12 h-12 rounded-full object-cover">
                            ${onlineIndicatorHtml}
                         </div>
                        <div>
                            <p class="font-semibold text-gray-900">${user.ho_ten}</p>
                            <p class="text-sm break-all px-2 py-0.5 rounded-full inline-block ${gmailClass} mt-1" title="Trạng thái: ${statusText}">${user.gmail}</p>
                        </div>
                    </div>
                    <div class="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto flex-shrink-0">
                        <select data-gmail="${user.gmail}" class="user-role-select border rounded p-2 text-sm w-full sm:w-28" ${isCurrentUser ? 'disabled' : ''}>
                            <option value="Admin" ${user.phan_quyen === 'Admin' ? 'selected' : ''}>Admin</option>
                            <option value="User" ${user.phan_quyen === 'User' ? 'selected' : ''}>User</option>
                            <option value="View" ${user.phan_quyen === 'View' ? 'selected' : ''}>View</option>
                        </select>
                        <button data-gmail="${user.gmail}" class="reset-password-btn text-sm text-indigo-600 hover:text-indigo-900 font-medium px-3 py-2 rounded-md hover:bg-indigo-50 w-full sm:w-auto text-center" ${isCurrentUser ? 'disabled' : ''}>
                            Đặt lại MK
                        </button>
                        <div class="relative">
                            <button data-gmail="${user.gmail}" class="user-options-btn p-2 rounded-full hover:bg-gray-200" ${isCurrentUser ? 'disabled' : ''}>
                                <svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path></svg>
                            </button>
                            <div id="options-popover-${user.gmail.replace(/[@.]/g, '')}" class="hidden absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20 border">
                                ${statusOptionsHtml}
                                <div class="border-t my-1"></div>
                                <button class="user-delete-option block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50" data-gmail="${user.gmail}">Xóa Tài Khoản</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

async function handleRoleChange(e) {
    const gmail = e.target.dataset.gmail;
    const newRole = e.target.value;
    const originalRole = cache.userList.find(u => u.gmail === gmail)?.phan_quyen;
    
    if (!originalRole) return;

    const confirmed = await showConfirm(`Bạn có muốn đổi quyền của ${gmail} thành ${newRole}?`);
    if (!confirmed) {
        e.target.value = originalRole; 
        return;
    }

    showLoading(true);
    const { error } = await sb.from('user').update({ phan_quyen: newRole }).eq('gmail', gmail);
    showLoading(false);
    if (error) {
        showToast("Đổi quyền thất bại.", 'error');
        e.target.value = originalRole;
    } else {
        showToast("Đổi quyền thành công.", 'success');
        fetchUsers();
    }
}

async function handleUpdateUserStatus(gmail, newStatus) {
    showLoading(true);
    const { error } = await sb.from('user').update({ stt: newStatus }).eq('gmail', gmail);
    showLoading(false);
    if (error) {
        showToast(`Thay đổi trạng thái thất bại: ${error.message}`, 'error');
    } else {
        showToast("Cập nhật trạng thái thành công.", 'success');
        fetchUsers(); // Refresh list to show new status
    }
}

async function handleDeleteUser(gmail) {
    const userToDelete = cache.userList.find(u => u.gmail === gmail);
    if (!userToDelete) return;
    
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa vĩnh viễn tài khoản của ${userToDelete.ho_ten}? Hành động này không thể hoàn tác.`);
    if (!confirmed) return;

    showLoading(true);
    try {
        if (userToDelete.anh_dai_dien_url) {
            const oldFileName = userToDelete.anh_dai_dien_url.split('/').pop();
            await sb.storage.from('anh_dai_dien').remove([`public/${oldFileName}`]);
        }
        
        const { error } = await sb.from('user').delete().eq('gmail', gmail);
        if (error) throw error;
        
        showToast("Đã xóa tài khoản thành công.", 'success');
        fetchUsers();
    } catch (error) {
        showToast(`Lỗi khi xóa tài khoản: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}


function openPasswordResetModal(gmail) {
    document.getElementById('reset-user-gmail').value = gmail;
    document.getElementById('reset-user-gmail-display').textContent = gmail;
    document.getElementById('password-reset-modal').classList.remove('hidden');
}

async function handlePasswordReset(e) {
    e.preventDefault();
    const gmail = document.getElementById('reset-user-gmail').value;
    const new_password = document.getElementById('reset-new-password').value;
    
    showLoading(true);
    const { error } = await sb.from('user').update({ mat_khau: new_password }).eq('gmail', gmail);
    showLoading(false);
    
    if (error) {
        showToast("Đặt lại mật khẩu thất bại.", 'error');
    } else {
        showToast("Đặt lại mật khẩu thành công.", 'success');
        document.getElementById('password-reset-modal').classList.add('hidden');
        document.getElementById('password-reset-form').reset();
    }
}

async function handleBackupExcel() {
    const confirmed = await showConfirm("Bạn có muốn sao lưu toàn bộ dữ liệu ra tệp Excel không? Quá trình này có thể mất một lúc.", "Xác nhận sao lưu");
    if (!confirmed) return;

    showLoading(true);
    showToast("Đang chuẩn bị dữ liệu sao lưu...", "info");

    const tablesToBackup = ['user', 'san_pham', 'ton_kho', 'don_hang', 'chi_tiet'];
    try {
        const results = await Promise.all(
            tablesToBackup.map(table => sb.from(table).select('*').limit(50000)) 
        );

        const workbook = XLSX.utils.book_new();

        for (let i = 0; i < tablesToBackup.length; i++) {
            const tableName = tablesToBackup[i];
            const { data, error } = results[i];

            if (error) {
                throw new Error(`Lỗi khi lấy dữ liệu từ bảng ${tableName}: ${error.message}`);
            }

            if(data){
                const worksheet = XLSX.utils.json_to_sheet(data);
                XLSX.utils.book_append_sheet(workbook, worksheet, tableName);
            }
        }

        const today = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(workbook, `JNJ_Backup_${today}.xlsx`);
        showToast("Sao lưu Excel thành công!", "success");

    } catch (error) {
        console.error("Backup failed:", error);
        showToast(`Sao lưu thất bại: ${error.message}`, "error");
    } finally {
        showLoading(false);
    }
}

function jsonToCsv(jsonData) {
    if (!jsonData || jsonData.length === 0) {
        return '';
    }
    const keys = Object.keys(jsonData[0]);
    const csvRows = [];
    csvRows.push(keys.join(','));

    for (const row of jsonData) {
        const values = keys.map(key => {
            let cell = row[key];
            if (typeof cell === 'object' && cell !== null) {
                cell = JSON.stringify(cell);
            }
            cell = cell === null || cell === undefined ? '' : String(cell);
            
            if (/[",\n]/.test(cell)) {
                cell = `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
}

async function handleBackupCsv() {
    const confirmed = await showConfirm("Bạn có muốn sao lưu toàn bộ dữ liệu ra tệp CSV (nén ZIP) không? Quá trình này có thể mất một lúc.", "Xác nhận sao lưu CSV");
    if (!confirmed) return;

    showLoading(true);
    showToast("Đang chuẩn bị dữ liệu CSV...", "info");

    const tablesToBackup = ['user', 'san_pham', 'ton_kho', 'don_hang', 'chi_tiet'];
    try {
        const results = await Promise.all(
            tablesToBackup.map(table => sb.from(table).select('*').limit(50000))
        );

        const zip = new JSZip();

        for (let i = 0; i < tablesToBackup.length; i++) {
            const tableName = tablesToBackup[i];
            const { data, error } = results[i];

            if (error) {
                throw new Error(`Lỗi khi lấy dữ liệu từ bảng ${tableName}: ${error.message}`);
            }

            if(data){
                const csvData = jsonToCsv(data);
                zip.file(`${tableName}.csv`, csvData);
            }
        }
        
        const zipContent = await zip.generateAsync({ type: "blob" });
        const today = new Date().toISOString().slice(0, 10);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(zipContent);
        link.download = `JNJ_Backup_CSV_${today}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast("Sao lưu CSV (ZIP) thành công!", "success");

    } catch (error) {
        console.error("CSV Backup failed:", error);
        showToast(`Sao lưu CSV thất bại: ${error.message}`, "error");
    } finally {
        showLoading(false);
    }
}

async function handleRestoreFromExcel(file) {
    if (!file) return;

    const fileNameEl = document.getElementById('restore-file-name');
    fileNameEl.textContent = `Tệp đã chọn: ${file.name}`;

    const confirmed = await showConfirm(
        "CẢNH BÁO: Hành động này sẽ XÓA TẤT CẢ dữ liệu hiện tại và thay thế bằng dữ liệu từ tệp. Hành động này không thể hoàn tác. Bạn có chắc chắn muốn tiếp tục không?",
        "XÁC NHẬN KHÔI PHỤC DỮ LIỆU"
    );
    if(confirmed) {
        const finalConfirm = await showConfirm("XÁC NHẬN LẦN CUỐI: Toàn bộ dữ liệu sẽ bị ghi đè. Vẫn tiếp tục?", "HÀNH ĐỘNG NGUY HIỂM");
        if(!finalConfirm) {
            fileNameEl.textContent = '';
            document.getElementById('restore-file-input').value = '';
            return;
        }
    } else {
        fileNameEl.textContent = '';
        document.getElementById('restore-file-input').value = '';
        return;
    }


    showLoading(true);
    showToast("Bắt đầu quá trình khôi phục...", "info");

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            
            const requiredSheets = ['user', 'san_pham', 'ton_kho', 'don_hang', 'chi_tiet'];
            const presentSheets = workbook.SheetNames;
            
            for (const sheet of requiredSheets) {
                if (!presentSheets.includes(sheet)) {
                    throw new Error(`Tệp Excel bị thiếu sheet bắt buộc: "${sheet}"`);
                }
            }

            const deleteOrder = ['chi_tiet', 'don_hang', 'ton_kho', 'san_pham', 'user'];
            const insertOrder = ['user', 'san_pham', 'ton_kho', 'don_hang', 'chi_tiet'];
            const pkMap = { user: 'gmail', san_pham: 'ma_vt', ton_kho: 'ma_vach', don_hang: 'ma_kho', chi_tiet: 'id' };

            showToast("Đang xóa dữ liệu cũ...", "info");
            for (const tableName of deleteOrder) {
                const pk = pkMap[tableName];
                if (tableName === 'user') {
                    const { error } = await sb.from('user').delete().neq('gmail', currentUser.gmail);
                    if (error) throw new Error(`Lỗi khi xóa bảng ${tableName}: ${error.message}`);
                } else {
                    const { error } = await sb.from(tableName).delete().neq(pk, 'a-value-that-does-not-exist-12345');
                    if (error) throw new Error(`Lỗi khi xóa bảng ${tableName}: ${error.message}`);
                }
            }

            for (const tableName of insertOrder) {
                showToast(`Đang khôi phục bảng: ${tableName}...`, "info");
                const worksheet = workbook.Sheets[tableName];
                let jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

                if (tableName === 'user') {
                    jsonData = jsonData.filter(user => user.gmail !== currentUser.gmail);
                }

                const cleanedData = jsonData.map(row => {
                    const newRow = {};
                    for (const key in row) {
                        newRow[key] = (row[key] === "" || row[key] === undefined) ? null : row[key];
                    }
                    return newRow;
                });

                if (cleanedData.length > 0) {
                    const CHUNK_SIZE = 500;
                    for (let i = 0; i < cleanedData.length; i += CHUNK_SIZE) {
                        const chunk = cleanedData.slice(i, i + CHUNK_SIZE);
                        const { error } = await sb.from(tableName).insert(chunk);
                        if (error) {
                             throw new Error(`Lỗi khi chèn dữ liệu vào ${tableName} (dòng ${i}): ${error.message}`);
                        }
                    }
                }
            }

            showToast("Khôi phục dữ liệu thành công! Vui lòng đăng nhập lại.", "success");
            setTimeout(() => {
                sessionStorage.clear();
                window.location.href = 'login.html';
            }, 3000);

        } catch (error) {
            console.error("Restore failed:", error);
            showToast(`Khôi phục thất bại: ${error.message}`, "error");
            showToast("Đang cố gắng tải lại dữ liệu hiện tại...", "info");
            setTimeout(() => location.reload(), 3000); 
        } finally {
            showLoading(false);
            fileNameEl.textContent = '';
            document.getElementById('restore-file-input').value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

export function initProfileAvatarState() {
    selectedAvatarFile = null;
    const currentAvatarUrl = currentUser?.anh_dai_dien_url;
    const preview = document.getElementById('profile-image-preview');
    const removeBtn = document.getElementById('profile-remove-image-btn');
    const urlInput = document.getElementById('profile-current-avatar-url');
    
    preview.src = currentAvatarUrl || DEFAULT_AVATAR_URL;
    urlInput.value = currentAvatarUrl || '';
    removeBtn.classList.toggle('hidden', !currentAvatarUrl);
}

async function fetchAndDisplayTemplates() {
    const buckets = [
        { name: 'pnk', statusElId: 'pnk-status' },
        { name: 'pxk', statusElId: 'pxk-status' }
    ];

    for (const bucket of buckets) {
        const statusEl = document.getElementById(bucket.statusElId);
        if (!statusEl) continue;

        statusEl.textContent = 'Đang kiểm tra...';
        
        try {
            const { data: fileList, error: listError } = await sb.storage.from(bucket.name).list('', {
                limit: 10,
                search: 'template.xlsx'
            });

            if (listError) throw listError;
            
            const templateFile = fileList.find(f => f.name === 'template.xlsx');

            if (templateFile) {
                const { data: urlData } = sb.storage.from(bucket.name).getPublicUrl('template.xlsx');
                if (urlData.publicUrl) {
                    statusEl.innerHTML = `<a href="${urlData.publicUrl}" target="_blank" download class="text-blue-600 hover:underline font-medium">template.xlsx</a>`;
                } else {
                    statusEl.textContent = 'Lỗi lấy URL file template.';
                }
            } else {
                statusEl.textContent = 'Chưa có file template.';
            }
        } catch (error) {
            console.error(`Error fetching template from ${bucket.name}:`, error);
            statusEl.textContent = 'Lỗi khi tải template.';
            statusEl.classList.add('text-red-500');
        }
    }
}

async function handleTemplateUpload(event, bucketName) {
    const file = event.target.files[0];
    const input = event.target;
    
    if (!file) {
        input.value = '';
        return;
    }
    
    const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel' // .xls
    ];
    if (!/\.(xlsx|xls)$/i.test(file.name) && !allowedTypes.includes(file.type)) {
        showToast('Chỉ chấp nhận file Excel (.xlsx, .xls).', 'error');
        input.value = '';
        return;
    }

    const templateName = bucketName === 'pnk' ? 'Phiếu Nhập Kho' : 'Phiếu Xuất Kho';
    const confirmed = await showConfirm(`Bạn có chắc muốn thay thế template "${templateName}" hiện tại bằng file "${file.name}"? File cũ sẽ bị ghi đè.`);

    if (!confirmed) {
        input.value = '';
        return;
    }
    
    showLoading(true);
    showToast(`Đang tải lên template cho ${templateName}...`, 'info');

    try {
        const { error } = await sb.storage
            .from(bucketName)
            .upload('template.xlsx', file, {
                cacheControl: '3600',
                upsert: true,
            });

        if (error) throw error;
        
        showToast('Tải lên template thành công!', 'success');
        await fetchAndDisplayTemplates();

    } catch (error) {
        showToast(`Tải lên thất bại: ${error.message}`, 'error');
        console.error('Template upload error:', error);
    } finally {
        showLoading(false);
        input.value = '';
    }
}

function initTemplateManagement() {
    const pnkUpload = document.getElementById('pnk-upload');
    const pxkUpload = document.getElementById('pxk-upload');
    const pnkUploadBtn = document.getElementById('pnk-upload-btn');
    const pxkUploadBtn = document.getElementById('pxk-upload-btn');

    if (pnkUploadBtn && pnkUpload) {
        pnkUploadBtn.addEventListener('click', () => pnkUpload.click());
        pnkUpload.addEventListener('change', (e) => handleTemplateUpload(e, 'pnk'));
    }
    if (pxkUploadBtn && pxkUpload) {
        pxkUploadBtn.addEventListener('click', () => pxkUpload.click());
        pxkUpload.addEventListener('change', (e) => handleTemplateUpload(e, 'pxk'));
    }
    
    fetchAndDisplayTemplates();
}

export function initCaiDatView() {
    document.getElementById('profile-form').addEventListener('submit', handleProfileUpdate);
    document.getElementById('user-list-body').addEventListener('change', e => {
        if(e.target.classList.contains('user-role-select')) handleRoleChange(e);
    });
    
    document.getElementById('user-list-body').addEventListener('click', e => {
        const resetBtn = e.target.closest('.reset-password-btn');
        if (resetBtn) {
            openPasswordResetModal(resetBtn.dataset.gmail);
            return;
        }

        const optionsBtn = e.target.closest('.user-options-btn');
        if (optionsBtn) {
            const gmail = optionsBtn.dataset.gmail;
            const popoverId = `options-popover-${gmail.replace(/[@.]/g, '')}`;
            const popover = document.getElementById(popoverId);
            if (popover) {
                // Close other popovers
                document.querySelectorAll('[id^="options-popover-"]').forEach(p => {
                    if (p.id !== popoverId) p.classList.add('hidden');
                });
                popover.classList.toggle('hidden');
            }
            return;
        }
        
        const statusBtn = e.target.closest('.user-status-option');
        if(statusBtn) {
            handleUpdateUserStatus(statusBtn.dataset.gmail, statusBtn.dataset.status);
            statusBtn.closest('[id^="options-popover-"]').classList.add('hidden');
            return;
        }

        const deleteBtn = e.target.closest('.user-delete-option');
        if(deleteBtn) {
            handleDeleteUser(deleteBtn.dataset.gmail);
            deleteBtn.closest('[id^="options-popover-"]').classList.add('hidden');
            return;
        }
    });

    document.getElementById('password-reset-form').addEventListener('submit', handlePasswordReset);
    document.getElementById('cancel-reset-btn').addEventListener('click', () => document.getElementById('password-reset-modal').classList.add('hidden'));

    const backupBtn = document.getElementById('backup-excel-btn');
    if (backupBtn) backupBtn.addEventListener('click', handleBackupExcel);
    
    const backupCsvBtn = document.getElementById('backup-csv-btn');
    if (backupCsvBtn) backupCsvBtn.addEventListener('click', handleBackupCsv);

    const restoreInput = document.getElementById('restore-file-input');
    if(restoreInput) restoreInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleRestoreFromExcel(e.target.files[0]);
        }
    });

    const processAvatarFile = (file) => {
        if (file && file.type.startsWith('image/')) {
            selectedAvatarFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('profile-image-preview').src = e.target.result;
                document.getElementById('profile-remove-image-btn').classList.remove('hidden');
                document.getElementById('profile-current-avatar-url').value = 'temp-new-image';
            };
            reader.readAsDataURL(file);
        }
    };
    document.getElementById('profile-image-upload').addEventListener('change', (e) => processAvatarFile(e.target.files[0]));
    document.getElementById('profile-image-paste-area').addEventListener('paste', (e) => {
        e.preventDefault();
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                processAvatarFile(items[i].getAsFile());
                return;
            }
        }
    });
    document.getElementById('profile-remove-image-btn').addEventListener('click', () => {
        selectedAvatarFile = null;
        document.getElementById('profile-image-upload').value = '';
        document.getElementById('profile-image-preview').src = DEFAULT_AVATAR_URL;
        document.getElementById('profile-remove-image-btn').classList.add('hidden');
        document.getElementById('profile-current-avatar-url').value = '';
    });
    
    initTemplateManagement();
}