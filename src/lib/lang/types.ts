import type { Voice } from "@/lib/media/tts-azure";
import type { Language } from "@/lib/schema/word";
import type { Skill } from "@/lib/srs/cards";

export const ENTRY_TABS = ["typed", "voice", "photo", "url", "file"] as const;
export type EntryTab = (typeof ENTRY_TABS)[number];

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
  /** Kỹ năng ôn được; thẻ của kỹ năng khác (nếu có) không vào phiên, Luyện tập, Thống kê. */
  reviewSkills: readonly Skill[];
  /**
   * Từ mức thuộc này, mặt câu hỏi ẩn cách đọc và không tự phát âm cho tới khi trả lời, để người học
   * phải nhận mặt chữ. null = luôn hiện (chữ cái đã cho biết cách đọc).
   */
  hideReadingFromLevel: number | null;
  /** Tập phát âm chỉ để luyện: không có thẻ, không ghi lượt ôn (chưa chấm được thanh điệu). */
  speakingPracticeOnly: boolean;
  /** Thẻ Chính tả là viết chữ theo nét (không gõ, không nghe → gõ). */
  writesStrokes: boolean;
  /** Công tắc trong Cài đặt của thẻ Chính tả. */
  spellingSetting: "practice_spelling" | "practice_hanzi";
  /** Thẻ Chính tả mở tối đa mỗi ngày; null = bằng số từ mới/ngày. */
  newSpellingPerDay: number | null;
  /** Các tab ở màn Thêm từ. */
  entryTabs: readonly EntryTab[];
  /** Chữ này có thể là một từ của ngôn ngữ không (tiếng Trung phải có chữ Hán). */
  isWordText(text: string): boolean;
  /** Có chữ phồn thể phải đổi sang giản thể khi nhập. */
  hasTraditional: boolean;
  /** Tìm được bằng pinyin. */
  searchesPinyin: boolean;
  /** Tác vụ AI gợi ý từ theo nghĩa tiếng Việt. */
  reverseTask: "reverse-lookup" | "reverse-lookup-zh";
  /** Tên ngôn ngữ trong prompt của luồng Admin. */
  promptName: string;
  /** Danh sách Admin: AI xem trước chính tả, CEFR, độ hiếm của từ chưa có trong kho. */
  listTriage: boolean;
  /** Danh sách Admin nhận bài đọc (AI trích từ). */
  listDocuments: boolean;
  /** Admin tạo lại được từng tab của thẻ từ. */
  adminRegenerate: boolean;
  /** Kiểm tra đầu vào khi thêm danh sách (cần số liệu độ khó của từ). */
  placementTest: boolean;
  /** Từ có nhiều âm đọc phải có người duyệt: danh sách Admin gắn cảnh báo. */
  multiReadings: boolean;
}
