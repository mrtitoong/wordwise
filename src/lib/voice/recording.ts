/**
 * Thu âm (Prompt 5.1): chọn định dạng theo trình duyệt và tự dừng khi im lặng. Hàm thuần; phần
 * dùng MediaRecorder/AudioContext ở src/features/voice/recorder.ts.
 */

/** Tập phát âm: mỗi lần đọc một từ tối đa chừng này giây. */
export const WORD_RECORD_SECONDS = 5;
/** Im lặng chừng này sau khi đã nói thì tự dừng. */
export const SILENCE_STOP_MS = 1200;
/** Âm lượng (RMS 0–1) coi là có tiếng nói. Micro điện thoại ở phòng yên tĩnh thường < 0,01. */
export const SPEECH_LEVEL = 0.02;
/** Có tiếng liên tục chừng này mới tính là đã bắt đầu nói (bỏ qua tiếng lạch cạch). */
export const MIN_SPEECH_MS = 150;

/**
 * Định dạng thu ưu tiên: Chrome/Firefox/Android ra WebM Opus, Safari (iOS) chỉ có MP4/AAC. Trả
 * chuỗi rỗng khi không định dạng nào được báo là hỗ trợ (để trình duyệt tự chọn).
 */
export const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

export function pickMimeType(isTypeSupported: (type: string) => boolean): string {
  for (const type of PREFERRED_MIME_TYPES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // Trình duyệt cũ ném lỗi với chuỗi lạ: thử định dạng sau.
    }
  }
  return "";
}

export type SilenceDetector = {
  /** Đưa một mức âm lượng đo lúc `atMs`; trả true khi nên dừng (đã nói rồi im lặng đủ lâu). */
  push(level: number, atMs: number): boolean;
  /** Đã nghe thấy tiếng nói chưa. */
  heardSpeech(): boolean;
};

export function createSilenceDetector({
  threshold = SPEECH_LEVEL,
  silenceMs = SILENCE_STOP_MS,
  minSpeechMs = MIN_SPEECH_MS,
} = {}): SilenceDetector {
  let speechStart: number | null = null;
  let spoke = false;
  let quietSince: number | null = null;
  return {
    push(level, atMs) {
      if (level >= threshold) {
        speechStart ??= atMs;
        if (atMs - speechStart >= minSpeechMs) spoke = true;
        quietSince = null;
        return false;
      }
      speechStart = null;
      if (!spoke) return false;
      quietSince ??= atMs;
      return atMs - quietSince >= silenceMs;
    },
    heardSpeech: () => spoke,
  };
}

/** Giữ chừng này mức âm lượng gần nhất để vẽ sóng âm. */
export const LEVEL_HISTORY = 28;

/** Thêm mức âm lượng mới vào lịch sử (cũ bị đẩy ra), đổi sang 0–1 để vẽ cột (tăng độ nhạy). */
export function pushLevel(history: readonly number[], level: number): number[] {
  const scaled = Math.min(1, Math.sqrt(Math.max(0, level)) * 3);
  return [...history.slice(-(LEVEL_HISTORY - 1)), scaled];
}
