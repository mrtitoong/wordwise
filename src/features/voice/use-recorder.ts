"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pushLevel, SILENCE_STOP_MS, WORD_RECORD_SECONDS } from "@/lib/voice/recording";
import {
  RecorderFailure,
  hasRecorder,
  startRecording,
  type ActiveRecording,
  type Recording,
  type RecorderError,
} from "./recorder";

/** Đã giải thích vì sao cần micro (chỉ hỏi một lần trên máy này). */
const EXPLAINED_KEY = "ww_mic_explained";

function explained(): boolean {
  try {
    return localStorage.getItem(EXPLAINED_KEY) === "1";
  } catch {
    return false;
  }
}

function markExplained() {
  try {
    localStorage.setItem(EXPLAINED_KEY, "1");
  } catch {
    // Không lưu được: lần sau giải thích lại, không sao.
  }
}

export type RecorderState =
  | { status: "idle" }
  /** Cần giải thích trước khi trình duyệt hỏi quyền micro. */
  | { status: "explain" }
  | { status: "requesting" }
  | { status: "recording"; startedAt: number }
  | { status: "done"; recording: Recording & { url: string } }
  | { status: "error"; error: RecorderError };

/**
 * Thu âm cho tập phát âm (Prompt 5.1): lần đầu giải thích vì sao cần micro rồi mới xin quyền;
 * tối đa 5 giây, tự dừng khi im lặng 1,2 giây sau khi đã nói; mức âm lượng để vẽ sóng âm. Bản thu
 * giữ trong bộ nhớ (URL blob để nghe lại), đổi bản thu mới thì bản cũ bị giải phóng.
 */
export function useRecorder({
  maxSeconds = WORD_RECORD_SECONDS,
  stopOnSilence = true,
}: { maxSeconds?: number; stopOnSilence?: boolean } = {}) {
  const [state, setState] = useState<RecorderState>({ status: "idle" });
  const [levels, setLevels] = useState<number[]>([]);
  const active = useRef<ActiveRecording | null>(null);
  const url = useRef<string | null>(null);

  const release = useCallback(() => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }, []);

  const begin = useCallback(async () => {
    release();
    setLevels([]);
    setState({ status: "requesting" });
    try {
      const recording = await startRecording({
        maxSeconds,
        stopOnSilence,
        onLevel: (level) => setLevels((history) => pushLevel(history, level)),
      });
      markExplained();
      active.current = recording;
      setState({ status: "recording", startedAt: Date.now() });
      const result = await recording.done;
      active.current = null;
      if (!result) {
        setState({ status: "idle" });
        return;
      }
      url.current = URL.createObjectURL(result.blob);
      setState({ status: "done", recording: { ...result, url: url.current } });
    } catch (error) {
      setState({
        status: "error",
        error: error instanceof RecorderFailure ? error.code : "not-allowed",
      });
    }
  }, [maxSeconds, stopOnSilence, release]);

  /** Bắt đầu thu (lần đầu: hiện giải thích, người dùng đồng ý thì gọi `confirm`). */
  const start = useCallback(() => {
    if (!hasRecorder()) return setState({ status: "error", error: "unsupported" });
    if (!explained()) return setState({ status: "explain" });
    void begin();
  }, [begin]);

  const confirm = useCallback(() => void begin(), [begin]);
  const stop = useCallback(() => active.current?.stop(), []);
  const reset = useCallback(() => {
    active.current?.cancel();
    release();
    setLevels([]);
    setState({ status: "idle" });
  }, [release]);

  useEffect(
    () => () => {
      active.current?.cancel();
      release();
    },
    [release],
  );

  return { state, levels, start, confirm, stop, reset, maxSeconds, silenceMs: SILENCE_STOP_MS };
}
