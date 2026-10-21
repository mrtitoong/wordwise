/**
 * Tìm ảnh gợi nhớ cho một nghĩa theo image_query (do LLM viết). Dùng thẳng URL của nhà
 * cung cấp (hotlink, đúng hướng dẫn của Pexels/Unsplash) và lưu thông tin ghi nguồn.
 * Pexels trước (không cần xét duyệt), Unsplash dự phòng; thiếu khóa thì bỏ qua nhà đó.
 */
import type { Pos } from "@/lib/schema/word";

export type ImageProviderId = "pexels" | "unsplash";

export interface ImageCredit {
  provider: ImageProviderId;
  author: string;
  author_url: string;
  source_url: string;
}

export interface FoundImage {
  url: string;
  credit: ImageCredit;
}

export class ImageSearchError extends Error {
  constructor(
    message: string,
    readonly provider: ImageProviderId,
    readonly rateLimited: boolean,
  ) {
    super(message);
    this.name = "ImageSearchError";
  }
}

export interface ImageProvider {
  id: ImageProviderId;
  /** null: không có ảnh phù hợp. */
  search(query: string): Promise<FoundImage | null>;
}

/** Ảnh không giúp nhớ các từ chức năng (the, of, and, she…). */
const NO_IMAGE_POS = new Set<Pos>(["determiner", "preposition", "conjunction", "pronoun"]);

export function wantsImage(pos: Pos, imageQuery: string | null): boolean {
  return !NO_IMAGE_POS.has(pos) && Boolean(imageQuery?.trim());
}

type Fetch = typeof fetch;

async function getJson(
  provider: ImageProviderId,
  url: string,
  headers: Record<string, string>,
  doFetch: Fetch,
): Promise<unknown> {
  const response = await doFetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (response.status === 429) throw new ImageSearchError(`${provider} 429`, provider, true);
  if (!response.ok) throw new ImageSearchError(`${provider} ${response.status}`, provider, false);
  return response.json();
}

export function createPexelsProvider(options: { key: string; fetch?: Fetch }): ImageProvider {
  const doFetch = options.fetch ?? fetch;
  return {
    id: "pexels",
    async search(query) {
      const url =
        "https://api.pexels.com/v1/search?per_page=1&orientation=landscape&query=" +
        encodeURIComponent(query.trim());
      const data = (await getJson("pexels", url, { Authorization: options.key }, doFetch)) as {
        photos?: {
          url?: string;
          photographer?: string;
          photographer_url?: string;
          src?: { medium?: string };
        }[];
      };
      const photo = data.photos?.[0];
      if (!photo?.src?.medium || !photo.photographer) return null;
      return {
        url: photo.src.medium,
        credit: {
          provider: "pexels",
          author: photo.photographer,
          author_url: photo.photographer_url ?? "https://www.pexels.com",
          source_url: photo.url ?? "https://www.pexels.com",
        },
      };
    },
  };
}

/** Unsplash yêu cầu gắn utm_source vào link ghi nguồn và báo lượt dùng ảnh (download_location). */
const UNSPLASH_UTM = "utm_source=wordwise&utm_medium=referral";

export function createUnsplashProvider(options: { key: string; fetch?: Fetch }): ImageProvider {
  const doFetch = options.fetch ?? fetch;
  const headers = { Authorization: `Client-ID ${options.key}`, "Accept-Version": "v1" };
  return {
    id: "unsplash",
    async search(query) {
      const url =
        "https://api.unsplash.com/search/photos?per_page=1&content_filter=high&orientation=landscape&query=" +
        encodeURIComponent(query.trim());
      const data = (await getJson("unsplash", url, headers, doFetch)) as {
        results?: {
          urls?: { small?: string };
          links?: { html?: string; download_location?: string };
          user?: { name?: string; links?: { html?: string } };
        }[];
      };
      const photo = data.results?.[0];
      if (!photo?.urls?.small || !photo.user?.name) return null;
      if (photo.links?.download_location) {
        // Không chặn kết quả nếu lượt báo dùng ảnh lỗi.
        await doFetch(photo.links.download_location, { headers }).catch(() => undefined);
      }
      const withUtm = (link: string | undefined, fallback: string) =>
        `${link ?? fallback}${(link ?? fallback).includes("?") ? "&" : "?"}${UNSPLASH_UTM}`;
      return {
        url: photo.urls.small,
        credit: {
          provider: "unsplash",
          author: photo.user.name,
          author_url: withUtm(photo.user.links?.html, "https://unsplash.com"),
          source_url: withUtm(photo.links?.html, "https://unsplash.com"),
        },
      };
    },
  };
}

/** Nhà cung cấp có khóa, theo thứ tự ưu tiên. */
export function createImageProviders(keys: {
  pexels?: string | undefined;
  unsplash?: string | undefined;
  fetch?: Fetch;
}): ImageProvider[] {
  const providers: ImageProvider[] = [];
  const { fetch } = keys;
  if (keys.pexels) providers.push(createPexelsProvider({ key: keys.pexels, fetch }));
  if (keys.unsplash) providers.push(createUnsplashProvider({ key: keys.unsplash, fetch }));
  return providers;
}
