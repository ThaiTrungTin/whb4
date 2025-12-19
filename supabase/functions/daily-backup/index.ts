import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend';
import * as XLSX from 'npm:xlsx';

const SUPABASE_URL = Deno.env.get('FUNC_SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('FUNC_SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')!;

/**
 * Converts a Uint8Array to a Base64 string.
 * This is required for the Resend API attachment content.
 */
function uint8ArrayToBase64(uint8Array) {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

Deno.serve(async (_req) => {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const resend = new Resend(RESEND_API_KEY);

    console.log("Starting daily backup process...");

    const tablesToBackup = ['user', 'san_pham', 'ton_kho', 'don_hang', 'chi_tiet'];
    
    const results = await Promise.all(
        tablesToBackup.map(table => sb.from(table).select('*').limit(50000))
    );

    console.log("Data fetched successfully. Creating Excel file...");

    const workbook = XLSX.utils.book_new();

    for (let i = 0; i < tablesToBackup.length; i++) {
        const tableName = tablesToBackup[i];
        const { data, error } = results[i];

        if (error) {
            throw new Error(`Error fetching data from table ${tableName}: ${error.message}`);
        }

        if (data && data.length > 0) {
            const worksheet = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, tableName);
        }
    }
    
    if (workbook.SheetNames.length === 0) {
        console.log("No data found in any tables. Aborting backup email.");
        return new Response(JSON.stringify({ message: 'No data to back up.' }), { status: 200 });
    }
    
    const excelUint8Array = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    
    // *** SỬA LỖI "The attachment content is empty" ***
    // Chuyển đổi tệp Excel sang định dạng Base64 mà Resend yêu cầu.
    const excelBase64 = uint8ArrayToBase64(new Uint8Array(excelUint8Array));

    const today = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }); 
    const fileName = `JNJ_Backup_${today.replace(/\//g, '-')}.xlsx`;

    console.log(`Backup file created: ${fileName}. Sending email...`);

    const { data, error } = await resend.emails.send({
        from: 'JNJ Backup Service <onboarding@resend.dev>', 
        to: [ADMIN_EMAIL],
        subject: `[JNJ Backup] Sao lưu dữ liệu hàng ngày - ${today}`,
        html: `
          <p>Xin chào,</p>
          <p>Tệp sao lưu dữ liệu tự động hàng ngày của bạn đã được đính kèm.</p>
          <p><strong>Ngày sao lưu:</strong> ${today}</p>
          <p>Trân trọng,<br>Hệ thống tự động JNJ</p>
        `,
        attachments: [
            {
                filename: fileName,
                content: excelBase64, // Gửi đi nội dung đã được mã hóa Base64
            },
        ],
    });

    if (error) {
        console.error("Resend API error:", JSON.stringify(error));
        throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log("Email sent successfully!", data);

    return new Response(JSON.stringify({ message: 'Backup created and sent successfully!' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Backup failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});