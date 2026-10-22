# Mô phỏng lịch ôn 365 ngày (Prompt 3.1)

Sinh bởi `npm run srs:simulate` (src/lib/srs/simulate.ts). Mỗi ngày người học thêm N từ mới và
ôn hết thẻ đến hạn; nhớ hay quên theo đúng khả năng nhớ R của mô hình FSRS (tỉ lệ nhớ mục tiêu
90%, bước học 1 phút / 10 phút, khoảng cách tối đa 365 ngày, có fuzz). Từ mới lần đầu: 80% Được.

## Tải ôn trung bình mỗi ngày theo tháng

| Tháng | 5 từ/ngày | 10 từ/ngày | 20 từ/ngày | Biểu đồ (10 từ/ngày)           |
| ----- | --------- | ---------- | ---------- | ------------------------------ |
| 1     | 23        | 46         | 93         | ████████████                   |
| 2     | 31        | 62         | 124        | ████████████████               |
| 3     | 38        | 76         | 148        | ████████████████████           |
| 4     | 41        | 80         | 161        | █████████████████████          |
| 5     | 43        | 87         | 166        | ███████████████████████        |
| 6     | 44        | 90         | 180        | ████████████████████████       |
| 7     | 44        | 87         | 185        | ███████████████████████        |
| 8     | 50        | 98         | 195        | ██████████████████████████     |
| 9     | 55        | 106        | 209        | ████████████████████████████   |
| 10    | 56        | 115        | 221        | ██████████████████████████████ |
| 11    | 55        | 110        | 219        | █████████████████████████████  |
| 12    | 58        | 114        | 227        | ██████████████████████████████ |

## Tóm tắt

- **5 từ/ngày**: quý 2 ~43 lượt/ngày, quý 4 ~56 (tăng 1.31× trong khi số thẻ tăng ~2,35×), ngày cao nhất 72, tỉ lệ nhớ thực tế 88.6%, ước tính ~7 phút/ngày cuối năm (8 giây/câu).
- **10 từ/ngày**: quý 2 ~85 lượt/ngày, quý 4 ~112 (tăng 1.32× trong khi số thẻ tăng ~2,35×), ngày cao nhất 139, tỉ lệ nhớ thực tế 89.0%, ước tính ~15 phút/ngày cuối năm (8 giây/câu).
- **20 từ/ngày**: quý 2 ~169 lượt/ngày, quý 4 ~223 (tăng 1.32× trong khi số thẻ tăng ~2,35×), ngày cao nhất 252, tỉ lệ nhớ thực tế 89.0%, ước tính ~30 phút/ngày cuối năm (8 giây/câu).

Tải tăng chậm dần vì mỗi lần nhớ đúng, khoảng cách tới lần ôn sau dài ra. Tải không đi ngang hẳn:
chạy thử 2 năm (10 từ/ngày) cho quý 4 ~113 lượt/ngày, quý 8 ~143 (+27% trong khi số thẻ gấp đôi).
Muốn giữ tải ổn định lâu dài thì giảm số từ mới/ngày khi tải vượt thời gian người học có.
