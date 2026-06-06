const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../admin_UI/stitch_bookstore_management_sales_ui');
const targetDir = path.join(__dirname, 'views/admin');

// Mapping folder names to ejs file names and activePage values
const pageMapping = {
    'ng_nh_p_admin_website_qu_n_tr': { file: 'login.ejs', activePage: 'login' },
    'dashboard_website_qu_n_tr': { file: 'dashboard.ejs', activePage: 'dashboard' },
    'qu_n_l_s_ch_website_qu_n_tr': { file: 'books.ejs', activePage: 'books' },
    'th_m_s_a_s_ch_website_qu_n_tr': { file: 'book-form.ejs', activePage: 'books' },
    'qu_n_l_khuy_n_m_i_website_qu_n_tr': { file: 'promotions.ejs', activePage: 'promotions' },
    'qu_n_l_n_h_ng_website_qu_n_tr': { file: 'orders.ejs', activePage: 'orders' },
    'qu_n_l_kh_ch_h_ng_website_qu_n_tr': { file: 'customers.ejs', activePage: 'customers' },
    'qu_n_l_t_n_kho_website_qu_n_tr': { file: 'inventory.ejs', activePage: 'inventory' },
    'nh_p_h_ng_website_qu_n_tr': { file: 'import.ejs', activePage: 'import' },
    'qu_n_l_nh_n_vi_n_website_qu_n_tr': { file: 'staff.ejs', activePage: 'staff' },
    'b_o_c_o_th_ng_k_website_qu_n_tr': { file: 'reports.ejs', activePage: 'reports' }
};

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

for (const [folder, config] of Object.entries(pageMapping)) {
    const sourceFile = path.join(sourceDir, folder, 'code.html');
    if (fs.existsSync(sourceFile)) {
        let content = fs.readFileSync(sourceFile, 'utf8');

        // Replace <head>...</head> with include
        content = content.replace(/<head>[\s\S]*?<\/head>/i, '<%- include(\'partials/head\', { title: "Admin" }) %>');
        
        // If not login page, replace <aside>...</aside> with include
        if (config.activePage !== 'login') {
            content = content.replace(/<aside[\s\S]*?<\/aside>/i, `<%- include('partials/sidebar', { activePage: '${config.activePage}' }) %>`);
        }

        // Add some mock scripts for UI logic
        if (config.activePage === 'promotions') {
            content = content.replace('</form>', `</form>\n<script>\ndocument.querySelector('form').addEventListener('submit', function(e) {\ne.preventDefault();\nalert('Đã thêm mã khuyến mãi thành công (Mock)!');\n});\n</script>`);
        } else if (config.activePage === 'books' && config.file === 'book-form.ejs') {
            content = content.replace('</form>', `</form>\n<script>\ndocument.querySelector('form').addEventListener('submit', function(e) {\ne.preventDefault();\nalert('Đã lưu sách thành công (Mock)!');\n});\n</script>`);
        } else if (config.activePage === 'login') {
             // Attach mock login logic
             content = content.replace('</form>', `</form>\n<script>\ndocument.querySelector('form').addEventListener('submit', function(e) {\ne.preventDefault();\n// Form submission handled by backend in reality, but we can let it post\nthis.submit();\n});\n</script>`);
             // Ensure login form has action and method
             content = content.replace('<form ', '<form action="/admin/login" method="POST" ');
             // Find inputs and add name attributes
             content = content.replace(/type="email"/i, 'type="email" name="email"');
             content = content.replace(/type="password"/i, 'type="password" name="password"');
        }

        fs.writeFileSync(path.join(targetDir, config.file), content);
        console.log(`Converted ${folder} to ${config.file}`);
    } else {
        console.log(`File not found: ${sourceFile}`);
    }
}
console.log('Conversion complete!');
