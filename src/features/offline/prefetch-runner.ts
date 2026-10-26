/**
 * Tải trước audio/ảnh của thẻ đến hạn tới hết ngày mai vào bộ nhớ của Service Worker (cache media),
 * mỗi ngày học một lần. Quy tắc chọn ở src/lib/offline/prefetch.ts.
 */
import { getLocalDb } from "@/lib/db/local";
import { defaultSettingsRow } from "@/lib/db/repo";
import { studyDay } from "@/lib/review/day";
import {
  prefetchItems,
  prefetchPolicy,
  senseIdsDueBy,
  type MediaSource,
  type PrefetchItem,
} from "@/lib/offline/prefetch";
import { CACHE_NAMES, keysToTrim, MEDIA_MAX_ENTRIES } from "@/lib/offline/sw-policy";
import { sentenceAudioUrl } from "./media-cache";
import { offlineSupported } from "./offline-client";

const PARALLEL = 4;

type NetworkInformation = { saveData?: boolean; type?: string };

export async function prefetchTomorrow(
  owner: string,
  now = new Date(),
): Promise<{ saved: number } | null> {
  if (!offlineSupported() || typeof caches === "undefined") return null;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  const policy = prefetchPolicy({
    online: navigator.onLine,
    saveData: connection?.saveData,
    type: connection?.type,
  });
  if (!policy.audio && !policy.images) return null;

  const db = getLocalDb();
  const settings = (await db.user_settings.get(owner)) ?? defaultSettingsRow(owner, now);
  // Mỗi ngày học một lần; đã tải chỉ audio mà nay có Wi-Fi thì tải thêm ảnh.
  const key = `prefetch:${owner}`;
  const day = studyDay(now, settings.timezone);
  const mark = `${day}:${policy.images ? "all" : "audio"}`;
  const last = (await db.meta.get(key))?.value;
  if (last === mark || last === `${day}:all`) return null;

  const [cards, userWords] = await Promise.all([
    db.cards.where("user_id").equals(owner).toArray(),
    db.user_words.where("user_id").equals(owner).toArray(),
  ]);
  const senseIds = senseIdsDueBy(cards, userWords, now, settings.timezone);
  const senses = (await db.word_senses.bulkGet(senseIds)).filter((s) => !!s);
  const words = new Map(
    (await db.words.bulkGet([...new Set(senses.map((s) => s.word_id))]))
      .filter((w) => !!w)
      .map((w) => [w.id, w]),
  );
  const details = new Map(
    (await db.word_details.bulkGet(senses.map((s) => s.id)))
      .filter((d) => !!d)
      .map((d) => [d.sense_id, d]),
  );
  const sources: MediaSource[] = senses.flatMap((sense) => {
    const word = words.get(sense.word_id);
    if (!word) return [];
    const examples = details.get(sense.id)?.examples;
    return [
      {
        word,
        sense,
        examples: Array.isArray(examples) ? (examples as { sentence: string }[]) : [],
      },
    ];
  });
  const voice = settings.accent === "uk" ? "uk" : "us";
  const items = prefetchItems(sources, voice, policy);

  const cache = await caches.open(CACHE_NAMES.media);
  let saved = 0;
  const save = async (item: PrefetchItem) => {
    const url = item.kind === "sentence" ? await sentenceAudioUrl(item.sentence, voice) : item.url;
    if (!url || (await cache.match(url))) return;
    // Audio câu chưa có file (chưa ai nghe) thì máy chủ trả 404: bỏ qua, không tạo mới.
    const response = await fetch(url, { mode: "cors", credentials: "omit" }).catch(() => null);
    if (!response?.ok) return;
    await cache.put(url, response);
    saved++;
  };
  const queue = [...items];
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        if (!navigator.onLine) return;
        await save(item).catch(() => undefined);
      }
    }),
  );
  for (const old of keysToTrim(await cache.keys(), MEDIA_MAX_ENTRIES)) await cache.delete(old);
  await db.meta.put({ key, value: mark });
  return { saved };
}
