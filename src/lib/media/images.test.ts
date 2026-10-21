import { describe, expect, it, vi } from "vitest";
import {
  ImageSearchError,
  createImageProviders,
  createPexelsProvider,
  createUnsplashProvider,
  wantsImage,
} from "./images";

const pexelsBody = {
  photos: [
    {
      url: "https://www.pexels.com/photo/1",
      photographer: "An Nguyen",
      photographer_url: "https://www.pexels.com/@an",
      src: { medium: "https://images.pexels.com/1-medium.jpg" },
    },
  ],
};

const unsplashBody = {
  results: [
    {
      urls: { small: "https://images.unsplash.com/1-small.jpg" },
      links: {
        html: "https://unsplash.com/photos/1",
        download_location: "https://api.unsplash.com/photos/1/download",
      },
      user: { name: "Binh Tran", links: { html: "https://unsplash.com/@binh" } },
    },
  ],
};

describe("wantsImage", () => {
  it("bỏ qua từ chức năng và nghĩa không có gợi ý ảnh", () => {
    expect(wantsImage("noun", "red apple")).toBe(true);
    expect(wantsImage("preposition", "box on table")).toBe(false);
    expect(wantsImage("determiner", "a cat")).toBe(false);
    expect(wantsImage("verb", "  ")).toBe(false);
    expect(wantsImage("verb", null)).toBe(false);
  });
});

describe("Pexels", () => {
  it("lấy ảnh đầu tiên và thông tin ghi nguồn", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(pexelsBody));
    const image = await createPexelsProvider({ key: "pk", fetch }).search("red apple");
    expect(fetch.mock.calls[0]![0]).toContain("query=red%20apple");
    expect(fetch.mock.calls[0]![1].headers.Authorization).toBe("pk");
    expect(image).toEqual({
      url: "https://images.pexels.com/1-medium.jpg",
      credit: {
        provider: "pexels",
        author: "An Nguyen",
        author_url: "https://www.pexels.com/@an",
        source_url: "https://www.pexels.com/photo/1",
      },
    });
  });

  it("không có kết quả → null; 429 → lỗi giới hạn lượt", async () => {
    const empty = vi.fn().mockResolvedValue(Response.json({ photos: [] }));
    expect(await createPexelsProvider({ key: "k", fetch: empty }).search("x")).toBeNull();
    const limited = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    await expect(
      createPexelsProvider({ key: "k", fetch: limited }).search("x"),
    ).rejects.toMatchObject({
      rateLimited: true,
    });
    const down = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(
      createPexelsProvider({ key: "k", fetch: down }).search("x"),
    ).rejects.toBeInstanceOf(ImageSearchError);
  });
});

describe("Unsplash", () => {
  it("báo lượt dùng ảnh và gắn utm vào link ghi nguồn", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(unsplashBody))
      .mockResolvedValueOnce(new Response("{}"));
    const image = await createUnsplashProvider({ key: "uk", fetch }).search("cat");
    expect(fetch.mock.calls[0]![1].headers.Authorization).toBe("Client-ID uk");
    expect(fetch.mock.calls[1]![0]).toBe("https://api.unsplash.com/photos/1/download");
    expect(image?.credit).toEqual({
      provider: "unsplash",
      author: "Binh Tran",
      author_url: "https://unsplash.com/@binh?utm_source=wordwise&utm_medium=referral",
      source_url: "https://unsplash.com/photos/1?utm_source=wordwise&utm_medium=referral",
    });
  });
});

describe("createImageProviders", () => {
  it("Pexels trước, Unsplash sau; thiếu khóa thì bỏ", () => {
    expect(createImageProviders({ pexels: "a", unsplash: "b" }).map((p) => p.id)).toEqual([
      "pexels",
      "unsplash",
    ]);
    expect(createImageProviders({ unsplash: "b" }).map((p) => p.id)).toEqual(["unsplash"]);
    expect(createImageProviders({})).toEqual([]);
  });
});
