import type { Voice } from "@/lib/media/tts-azure";
import type { Language } from "@/lib/schema/word";

/** Những gì app cần biết về một ngôn ngữ học. Khác biệt giữa các ngôn ngữ khai báo ở đây. */
export interface LanguagePack {
  code: Language;
  /** Giọng tạo sẵn audio của từ; rỗng = chưa tạo audio cho ngôn ngữ này. */
  wordAudioVoices: readonly Voice[];
  /** Mã ngôn ngữ cho đọc và nhận dạng giọng nói, theo giọng trong Cài đặt. */
  speechLocale(voice: Voice): string;
  /** Đưa từ về từ gốc được không (tiếng Trung không có từ gốc). */
  lemmatizes: boolean;
  /** Tra Free Dictionary API để lấy nghĩa tham khảo khi tạo nội dung. */
  usesDictionaryApi: boolean;
  /** Nội dung từ bắt buộc có IPA. */
  requiresIpa: boolean;
}
