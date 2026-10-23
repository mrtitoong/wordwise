/**
 * Web Push (nhắc học, Prompt 6.3). Khóa công khai VAPID: trình duyệt dùng khi đăng ký nhận thông báo
 * (công khai, không phải bí mật). Khóa bí mật đi cặp nằm trong Supabase Secrets (VAPID_PRIVATE_KEY),
 * chỉ Edge Function send-reminders đọc. Đổi cặp khóa thì mọi trình duyệt phải đăng ký lại.
 */
export const VAPID_PUBLIC_KEY =
  "BI-6UMxEVZ33jLDX-evsbCgKUtd2_YaqJq6qgj5kneFSSb72krxg3yHSWpDEQEK7S6hpZ9Lu1cmhUFCC2SW4Lnw";

/** Liên hệ gửi kèm cho dịch vụ push (bắt buộc theo chuẩn VAPID). */
export const VAPID_SUBJECT = "https://github.com/mrtitoong/wordwise";
