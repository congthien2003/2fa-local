# 2FA Local

Web tiện ích cho tài khoản test: nhập email và secret key, lưu ngay trong trình duyệt và lấy mã TOTP. Giao diện một trang, danh sách `email | key đầy đủ | OTP`, bấm mã để copy, có sửa/hủy sửa và xác nhận xóa.

## Yêu cầu

- Khuyến nghị **Node.js 24.15+ trong nhánh 24 LTS**. Các dải được bộ dependencies hiện tại hỗ trợ: `^22.22.2 || ^24.15.0 || >=26.0.0`.
- npm; trình duyệt hiện đại hỗ trợ Web Crypto, localStorage và Clipboard API.
- Dùng HTTPS khi deploy hoặc localhost khi chạy local.

Dependencies được pin trong `package.json` và `package-lock.json`: Vite 8.3.5, TypeScript 7.0.2, Vitest 5.0.5, jsdom 30.1.3, Wrangler 4.152.0, @types/node 26.6.5. Không có runtime dependency.

Trong phiên triển khai ban đầu, máy đang dùng Node 25.9.0 nên npm báo engine warning cho Vitest/jsdom. Hãy chuyển sang Node được hỗ trợ trước khi chạy các bước dưới đây. Phiên cài đặt cũng báo 3 dependency vulnerabilities (2 moderate, 1 high); chưa phân tích audit và không chạy cập nhật tự động.

## Cài và chạy

Chạy tại thư mục project, sau khi chọn đúng phiên bản Node:

```powershell
npm ci
npm run dev
```

Mở địa chỉ localhost Vite in ra. Không cần `.env`, tài khoản đăng nhập hay database. Dừng server bằng Ctrl+C.

## Sử dụng

1. Nhập một email hợp lệ và secret **Base32** rồi chọn **Thêm tài khoản**.
2. Key hiển thị đầy đủ. Mã TOTP hiển thị theo dạng `123 456`; bấm để copy `123456`.
3. Chọn **Sửa** để đưa tài khoản lên form, sau đó **Lưu thay đổi** hoặc **Hủy**.
4. Chọn **Xóa** và xác nhận để bỏ tài khoản.

Secret được bỏ khoảng trắng, chuyển sang chữ hoa và bỏ padding Base32 hợp lệ khi lưu. Cùng email có thể có nhiều key khác nhau; cùng cặp email/key sẽ bị chặn. Tài khoản mới nằm cuối danh sách. Hỗ trợ TOTP HMAC-SHA1, 6 chữ số, chu kỳ 30 giây; chưa nhận QR, `otpauth://`, HOTP hoặc tham số OTP tùy chỉnh.

## Các lệnh kiểm tra

Các regression tests đã được viết nhưng **chưa chạy trong phiên triển khai**. Build, typecheck, giao diện browser và Cloudflare runtime cũng chưa được kiểm chứng. Tự chạy:

```powershell
npm run typecheck
npm run test
npm run build
npm run preview
```

Tests có vectors TOTP chuẩn, Base32 không hợp lệ, dữ liệu storage lỗi, CRUD, lỗi ghi storage/copy và kết quả OTP bất đồng bộ đã cũ. Test vectors chứa secret minh họa công khai, không phải tài khoản thực.

Nếu chỉ cần một nhóm regression tests:

```powershell
npm run test -- tests/totp.test.ts
npm run test -- tests/accounts.test.ts
npm run test -- tests/app.test.ts
```

Kiểm tra thủ công trên desktop và viewport khoảng 390px:

- Thêm tài khoản, reload để kiểm tra dữ liệu/thứ tự; sửa/hủy và xóa/hủy.
- Đối chiếu với authenticator cùng secret; thử copy sát lúc đổi mã và quay lại tab sau một thời gian.
- Mở hai tab cùng origin, sửa ở một tab để thấy tab kia nạp lại và hủy form đang sửa.
- Kiểm tra key không bị cắt, bảng cuộn ngang được; kiểm tra thao tác bàn phím.
- Nếu cần kiểm tra lỗi, chặn clipboard/storage bằng công cụ trình duyệt; không dùng secret thật trong ảnh hoặc log.

Project không cấu hình lint riêng. Không có pre/post script tự chạy build hoặc verify.

## Cloudflare Workers Static Assets

`wrangler.jsonc` phục vụ `dist` trực tiếp, không có Worker xử lý secret hoặc API. Có thể đổi `name` trước lần deploy đầu tiên. Sau khi build, xem bằng runtime Wrangler:

```powershell
npm run build
npm run worker:dev
```

Để publish, tự đăng nhập Cloudflare và deploy:

```powershell
npx wrangler login
npm run build
npm run deploy
```

Script deploy chỉ chạy Wrangler và **không build lại**. Sau mỗi lần sửa code cần build lại trước deploy. Nếu dùng Cloudflare Workers Builds, đặt build command `npm run build` và deploy command `npm run deploy`, với phiên bản Node tương thích.

## Dữ liệu local

- Key lưu trữ: `2fa-local.accounts.v1`, payload `{ "version": 1, "accounts": [{ "id", "email", "secret" }] }`. OTP được tính theo thời gian hiện tại và không lưu vào storage.
- Dữ liệu thuộc từng origin và hồ sơ trình duyệt. `localhost`, Worker URL và custom domain là các kho riêng, kể cả cùng máy. Các thiết bị không đồng bộ.
- Secret lưu plaintext và hiển thị đầy đủ, phù hợp mục đích test đã chọn. Xóa dữ liệu website sẽ mất tài khoản; MVP chưa có import/export.
- Không gửi email, secret hoặc OTP lên Cloudflare hay dịch vụ bên thứ ba. Đồng hồ thiết bị sai có thể khiến OTP sai; app không đồng bộ giờ từ server.
- Tab khác cùng origin cập nhật sẽ khiến danh sách nạp lại và hủy chế độ sửa. Trường hợp ghi đồng thời dùng cơ chế ghi cuối cùng thắng, không có khóa giao dịch giữa tab.
- Ghi storage lỗi thì thao tác không thành công và giữ nguyên dữ liệu hiện có. Payload lỗi hoặc version chưa hỗ trợ sẽ khóa ghi thay vì tự xóa/ghi đè.

### Khi dữ liệu lỗi

Mở DevTools → Application/Storage → Local Storage → chọn đúng origin. **Sao chép nguyên giá trị** của `2fa-local.accounts.v1` ra file local để giữ bản dự phòng trước khi làm gì khác. File đó có secret; tự giữ ở nơi phù hợp.

Nếu muốn bắt đầu lại, chỉ xóa key `2fa-local.accounts.v1` rồi reload trang. Không xóa toàn bộ storage của domain nếu còn dữ liệu khác cần giữ. App không tự phục hồi hoặc tự reset payload lỗi.

## Cấu trúc

- `src/totp.ts`: Base32 và TOTP qua Web Crypto.
- `src/accounts.ts`: validation, CRUD và schema localStorage.
- `src/app.ts`: DOM, form, đồng hồ, clipboard và sự kiện tab.
- `src/styles.css`: bố cục đã duyệt, padding gọn và responsive.
- `tests/`: regression tests; `docs/superpowers/`: thiết kế và plan.

## Tham chiếu

- [RFC 6238 — TOTP](https://www.rfc-editor.org/rfc/rfc6238.html)
- [RFC 4648 — Base32](https://www.rfc-editor.org/rfc/rfc4648.html)
- [Vite](https://vite.dev/guide/)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/get-started/)
