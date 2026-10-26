# 2FA Local — thiết kế

Trạng thái: Người dùng đã duyệt thiết kế và plan ngày 2026-10-26; đã triển khai source bằng Native. Build, tests, typecheck, UI và Cloudflare runtime chưa được kiểm chứng theo yêu cầu không tự chạy verify.

## Mục đích

Web tiện ích cho tài khoản môi trường test: lưu secret key và lấy mã TOTP nhanh trong trình duyệt. Deploy bằng Cloudflare Workers Static Assets; toàn bộ dữ liệu tài khoản nằm trong localStorage, không gửi secret hoặc OTP lên server.

## Các quyết định người dùng đã chọn

- HTML + TypeScript + Vite.
- Nhập từng tài khoản, gồm email và key.
- Danh sách xếp dọc: `email | key | mã OTP`.
- Hiện đầy đủ key.
- Bố cục bản phác thứ hai, với padding gọn hơn, đã được duyệt.
- Không commit nếu chưa được yêu cầu. Không tự chạy build, test, lint hoặc lệnh verify; bàn giao command để người dùng chạy.
- Trước khi chỉnh sửa code ứng dụng: lập plan và chờ duyệt riêng.

## Các hướng đã cân nhắc

1. **HTML + TypeScript + Vite (đã chọn):** ít phụ thuộc, phù hợp một màn hình và trạng thái đơn giản. Khi giao diện lớn hơn sẽ cần tổ chức thêm.
2. **React + TypeScript + Vite:** thuận tiện với nhiều thành phần tương tác, nhưng thêm runtime và phụ thuộc chưa cần cho phạm vi hiện tại.

## Phạm vi và giao diện

Một trang tiếng Việt, nền sáng, khung nội dung tối đa khoảng 1080px. Form ở trên, bảng ở dưới. Desktop: email, key và nút Thêm tài khoản nằm cùng hàng. Mobile: form xếp dọc; bảng được cuộn ngang để giữ nguyên cấu trúc và hiển thị đầy đủ key.

Tham chiếu: `.superpowers/brainstorm/476-1792986925/content/account-list-v2.html`. Đây là bản phác với dữ liệu minh họa, không phải ứng dụng hoàn chỉnh.

- Padding form: 16px; padding dòng bảng: 13px theo chiều dọc, 16px theo chiều ngang.
- Cột email, key đầy đủ, mã OTP; cuối dòng có Sửa và Xóa như bản phác đã duyệt.
- Mã OTP hiển thị theo dạng `123 456`; bấm để copy sáu chữ số không có khoảng trắng. Chỉ báo copy thành công khi clipboard API thành công; có thông báo khi thất bại.
- Bộ đếm chung cho biết thời gian còn lại trước khi đổi mã.
- Sửa đưa dữ liệu lên form, đổi sang chế độ lưu/cancel; giữ vị trí dòng khi lưu và không ghi đè tài khoản khác.
- Xóa cần xác nhận.
- Khi danh sách rỗng, hiển thị lời nhắc thêm tài khoản đầu tiên.
- Dữ liệu người dùng được render như văn bản, không chèn vào HTML.
- Không có dữ liệu demo trong ứng dụng thật.

## Các mặc định kỹ thuật do người triển khai đề xuất

Các mặc định dưới đây chưa được chốt riêng trong hội thoại; duyệt tài liệu này sẽ chốt chúng cho MVP.

### TOTP và nhập liệu

- Chỉ hỗ trợ TOTP với secret Base32, HMAC-SHA1, 6 chữ số, chu kỳ 30 giây, epoch Unix. Không hỗ trợ HOTP hoặc tham số tùy chỉnh trong MVP.
- Nhập secret trực tiếp; chưa hỗ trợ QR hoặc URI `otpauth://`.
- Email bắt buộc và hợp lệ về định dạng, trim khoảng trắng đầu/cuối. Không dùng email làm khóa định danh.
- Chuẩn hóa secret bằng cách bỏ khoảng trắng, chuyển chữ sang hoa, chấp nhận padding Base32 hợp lệ; từ chối secret không decode được hoặc rỗng. Báo lỗi tại form, không thêm bản ghi lỗi.
- Cho phép cùng email với các secret khác nhau; chặn cặp email và secret đã tồn tại, kể cả khi sửa. So sánh email đã trim không phân biệt hoa thường, secret theo giá trị đã chuẩn hóa.
- Tính TOTP trong trình duyệt bằng Web Crypto, có thể dùng thư viện nhỏ xử lý Base32/TOTP nếu tương thích browser và không yêu cầu dịch vụ ngoài. Lựa chọn cụ thể nằm trong plan.
- Tính counter từ thời gian hệ thống hiện tại, không giảm đếm tích lũy. Cập nhật sau khi tab được focus/hiện lại, không copy mã đã hết hạn. Các tác vụ tính bất đồng bộ phải tránh ghi kết quả cũ sau thao tác sửa/xóa hoặc đổi counter.
- Nếu đồng hồ máy sai, mã có thể sai; không gọi server để đồng bộ giờ.

### Lưu trữ

- Một key localStorage riêng, ví dụ `2fa-local.accounts.v1`, chứa schema version và danh sách `{ id, email, secret }`. ID sinh trong browser; tài khoản mới thêm ở cuối danh sách, giữ thứ tự sau reload.
- Chỉ lưu thông tin tài khoản, không lưu mã OTP đang hiển thị.
- Không mã hóa, không mật khẩu mở khóa, không đăng nhập và không đồng bộ thiết bị.
- Khi thêm/sửa/xóa, chỉ báo thành công và cập nhật danh sách khi ghi storage thành công. Nếu bị chặn hoặc hết dung lượng, giữ dữ liệu hiện tại và báo lỗi.
- Khi đọc dữ liệu hỏng hoặc schema không hỗ trợ, giữ nguyên nội dung storage, báo lỗi và chặn thao tác ghi để không âm thầm ghi đè. Có thể xóa key qua công cụ trình duyệt để bắt đầu lại; chưa xây luồng phục hồi trong MVP.
- Khi có thay đổi storage từ tab khác cùng domain, tải lại danh sách. Nếu đang sửa, hủy chế độ sửa và thông báo để tránh ghi bằng form đã cũ. Các thay đổi ghi đồng thời sử dụng cơ chế ghi cuối cùng thắng; không xây khóa giao dịch giữa tab.
- Dữ liệu tách biệt theo origin và hồ sơ trình duyệt; xóa dữ liệu website sẽ mất key.

### Triển khai

- Vite xuất static assets; cấu hình Wrangler phục vụ thư mục output bằng Workers Static Assets. Không cần API, D1, KV hoặc Worker xử lý secret.
- Dependency và asset phục vụ cùng ứng dụng; không analytics hoặc dịch vụ bên thứ ba nhận dữ liệu tài khoản.
- README hướng dẫn cài đặt, chạy local, deploy và các command kiểm tra để người dùng tự chạy. Không tự deploy ở bước triển khai code.
- Loại `.superpowers/` khỏi Git trong plan triển khai; giữ bản phác local làm tham chiếu.

## Ngoài phạm vi

Import/export, thêm hàng loạt, tìm kiếm, nhóm tài khoản, QR, OTP cấu hình tùy ý, offline PWA, dark mode, đồng bộ cloud và tính năng quản lý tài khoản production. Những nội dung từng được gợi ý nhưng chưa được người dùng chọn không mặc nhiên đưa vào MVP.

## Tiêu chí nghiệm thu

1. Thêm một email và secret hợp lệ tạo một dòng đúng thứ tự cột, hiển thị đầy đủ secret.
2. Reload trang vẫn giữ tài khoản và thứ tự; không có dữ liệu demo tự thêm.
3. TOTP khớp vector TOTP SHA1 6 chữ số cho timestamp cố định; mã có số 0 ở đầu vẫn đủ sáu chữ số; thay đổi đúng ở ranh giới 30 giây.
4. Sau khi tab được khôi phục, mã và bộ đếm phản ánh thời gian hiện tại; copy không lấy mã của counter cũ.
5. Sửa, hủy sửa, xác nhận/hủy xóa, chặn dữ liệu không hợp lệ và bản ghi trùng hoạt động như mô tả.
6. Lỗi storage/clipboard không hiển thị thành công giả và không âm thầm làm mất dữ liệu.
7. Layout bám bản phác đã duyệt, padding gọn; mobile thao tác được và không cắt mất key.
8. Có cấu hình deploy Workers Static Assets và hướng dẫn lệnh cho người dùng tự kiểm tra. Chưa chạy lệnh không được báo là đã đạt kiểm chứng runtime.

## Việc còn lại

Plan đã được duyệt và source đã được triển khai. Người dùng tự chạy các command trong README để kiểm chứng trước deploy. Không có commit hoặc deploy trong phiên triển khai.
