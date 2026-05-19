/**
 * Script chuyển đổi 6 file HTML gốc thành EJS
 * Tự động: tách <main>, thêm include partials, ghi ra views/
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'stitch_bookstore_management_sales_ui (1)', 'stitch_bookstore_management_sales_ui');
const DEST = path.join(__dirname, 'views');

const pages = [
  { src: 'trang_ch_website_kh_ch_h_ng', dest: 'index.ejs', title: 'Trang chủ', active: 'home' },
  { src: 'danh_s_ch_s_ch_website_kh_ch_h_ng', dest: 'products.ejs', title: 'Danh sách sách', active: 'browse' },
  { src: 'chi_ti_t_s_ch_website_kh_ch_h_ng', dest: 'product-detail.ejs', title: 'Chi tiết sách', active: 'browse' },
  { src: 'gi_h_ng_website_kh_ch_h_ng', dest: 'cart.ejs', title: 'Giỏ hàng', active: 'cart' },
  { src: 'thanh_to_n_website_kh_ch_h_ng', dest: 'checkout.ejs', title: 'Thanh toán', active: 'cart' },
  { src: 't_i_kho_n_website_kh_ch_h_ng', dest: 'account.ejs', title: 'Tài khoản', active: 'account' },
];

pages.forEach(page => {
  const srcFile = path.join(SRC, page.src, 'code.html');
  const destFile = path.join(DEST, page.dest);

  if (!fs.existsSync(srcFile)) {
    console.log(`❌ Not found: ${srcFile}`);
    return;
  }

  let html = fs.readFileSync(srcFile, 'utf-8');

  // Extract <main> content (or everything between </header> and <footer)
  let mainContent = '';

  // Try to extract <main>...</main>
  const mainMatch = html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    mainContent = `<main${html.match(/<main([^>]*)>/i)?.[1] || ''}>\n${mainMatch[1]}\n</main>`;
  } else {
    // Fallback: extract between </header> and <footer
    const headerEnd = html.indexOf('</header>');
    const footerStart = html.indexOf('<footer');
    if (headerEnd !== -1 && footerStart !== -1) {
      mainContent = html.substring(headerEnd + '</header>'.length, footerStart).trim();
    }
  }

  // Fix internal links
  mainContent = mainContent.replace(/href="#"/g, 'href="/products"');

  // Build EJS file
  const ejsContent = `<%- include('partials/head', { title }) %>
<%- include('partials/header', { activePage }) %>

${mainContent}

<%- include('partials/footer') %>
`;

  fs.writeFileSync(destFile, ejsContent, 'utf-8');
  console.log(`✅ ${page.dest} created (${(ejsContent.length / 1024).toFixed(1)} KB)`);
});

console.log('\n🎉 All pages converted!');
