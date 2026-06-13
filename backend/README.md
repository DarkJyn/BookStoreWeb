# NodeJS & MongoDB Backend

Thư mục này chứa mã nguồn Backend của dự án sàn thương mại điện tử BookStore.

## Cấu trúc thư mục
- `/config`: Cấu hình kết nối Database (MongoDB)
- `/controllers`: Xử lý logic nghiệp vụ
- `/middlewares`: Các bộ lọc (Authentication, Error handlers)
- `/models`: Định nghĩa các Schemas Mongoose (User, Product, Order, Cart)
- `/routes`: Định nghĩa các endpoints API
- `server.js`: Tệp cấu hình chạy chính của ứng dụng
- `test-api.js`: Kịch bản test tự động các API

## Cách chạy
1. Sửa tệp `.env` để cấu hình đường dẫn MongoDB Atlas thực tế
2. Mở terminal tại thư mục này và gõ:
   ```bash
   npm install
   npm run dev
   ```
