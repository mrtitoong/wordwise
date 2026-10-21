import { describe, expect, it, vi } from "vitest";
import { createPlayer, type AudioLike, type PlayerEnv, type UtteranceLike } from "./player";

function fakeEnv(options: { playFails?: boolean; speech?: boolean } = {}) {
  const audios: (AudioLike & { url: string; paused: boolean })[] = [];
  const spoken: (UtteranceLike & { text: string })[] = [];
  const cancel = vi.fn();
  const env: PlayerEnv = {
    createAudio(url) {
      const listeners: (() => void)[] = [];
      const audio = {
        url,
        paused: true,
        playbackRate: 1,
        preservesPitch: false,
        play: async () => {
          if (options.playFails) throw new Error("NotSupportedError");
          audio.paused = false;
        },
        pause: () => {
          audio.paused = true;
        },
        addEventListener: (_: "ended", fn: () => void) => listeners.push(fn),
      };
      audios.push(audio);
      return audio;
    },
    ...(options.speech === false
      ? {}
      : {
          speech: {
            speak: (u: UtteranceLike) => spoken.push(u as UtteranceLike & { text: string }),
            cancel,
          },
          createUtterance: (text: string) => ({
            text,
            lang: "",
            rate: 1,
            addEventListener: () => {},
          }),
        }),
  };
  return { env, audios, spoken, cancel };
}

describe("createPlayer", () => {
  it("phát file MP3 với tốc độ đã chọn, giữ cao độ giọng", async () => {
    const { env, audios } = fakeEnv();
    const result = await createPlayer(env).play({
      url: "https://a.mp3",
      text: "run",
      voice: "us",
      rate: 0.75,
    });
    expect(result).toBe("audio");
    expect(audios[0]).toMatchObject({
      url: "https://a.mp3",
      playbackRate: 0.75,
      preservesPitch: true,
    });
  });

  it("chưa có URL thì gọi resolveUrl (audio câu tạo khi nghe lần đầu)", async () => {
    const { env, audios } = fakeEnv();
    const resolveUrl = vi.fn().mockResolvedValue("https://s.mp3");
    await createPlayer(env).play({ resolveUrl, text: "I run.", voice: "uk", rate: 1 });
    expect(resolveUrl).toHaveBeenCalledOnce();
    expect(audios[0]!.url).toBe("https://s.mp3");
  });

  it("file lỗi hoặc không lấy được URL → đọc bằng giọng trình duyệt đúng vùng", async () => {
    const failing = fakeEnv({ playFails: true });
    expect(
      await createPlayer(failing.env).play({ url: "x", text: "run", voice: "uk", rate: 0.75 }),
    ).toBe("speech");
    expect(failing.spoken[0]).toMatchObject({ text: "run", lang: "en-GB", rate: 0.75 });

    const noUrl = fakeEnv();
    const resolveUrl = vi.fn().mockRejectedValue(new Error("offline"));
    expect(
      await createPlayer(noUrl.env).play({ resolveUrl, text: "I run.", voice: "us", rate: 1 }),
    ).toBe("speech");
    expect(noUrl.spoken[0]!.lang).toBe("en-US");
  });

  it("trình duyệt không có Web Speech → none", async () => {
    const { env } = fakeEnv({ speech: false, playFails: true });
    expect(await createPlayer(env).play({ url: "x", text: "run", voice: "us", rate: 1 })).toBe(
      "none",
    );
  });

  it("bấm phát lần nữa thì dừng lần trước", async () => {
    const { env, audios, cancel } = fakeEnv();
    const player = createPlayer(env);
    await player.play({ url: "https://1.mp3", text: "a", voice: "us", rate: 1 });
    await player.play({ url: "https://2.mp3", text: "b", voice: "us", rate: 1 });
    expect(audios[0]!.paused).toBe(true);
    expect(audios[1]!.paused).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });
});
