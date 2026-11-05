import type { Voice } from "@/lib/media/tts-azure";
import type { Language } from "@/lib/schema/word";

/** Những gì app cần biết về một ngôn ngữ học. Khác biệt giữa các ngôn ngữ khai báo ở đây. */
export interface LanguagePack {
  code: Language;
  /** Có phải bật cờ theo tài khoản mới tạo được từ mới không (ngôn ngữ đang làm dở). */
  requiresFlag: boolean;
  /** Tác vụ AI tạo thẻ từ. */
  contentTask: "word-content" | "word-content-zh";
  /**
   * Giọng tạo sẵn audio của từ; rỗng = chưa tạo audio. Ngôn ngữ chỉ có một giọng dùng "us" làm giọng
   * mặc định (lưu ở cột audio_us_url) để không phải thêm cột và đổi mọi chỗ dùng Voice.
   */
  wordAudioVoices: readonly Voice[];
  /** Giọng Azure đọc ngôn ngữ này, theo giọng trong Cài đặt. */
  ttsVoice(voice: Voice): { locale: string; name: string };
  /** Mã ngôn ngữ cho đọc và nhận dạng giọng nói, theo giọng trong Cài đặt. */
  speechLocale(voice: Voice): string;
  /** Đưa từ về từ gốc được không (tiếng Trung không có từ gốc). */
  lemmatizes: boolean;
  /** Tra Free Dictionary API để lấy nghĩa tham khảo khi tạo nội dung. */
  usesDictionaryApi: boolean;
  /** Nội dung từ bắt buộc có IPA. */
  requiresIpa: boolean;
  /** Đã có phiên ôn; chưa có thì từ nằm yên ở Sắp học. */
  hasReview: boolean;
}
