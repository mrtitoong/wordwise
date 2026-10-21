/**
 * Lemmatizer tiếng Anh dựa trên WordNet (wink-lemmatizer, MIT). Dữ liệu ~3 MB nên chỉ
 * dùng ở máy chủ (Edge Function, script), không đưa vào bundle trình duyệt.
 */
import wink from "wink-lemmatizer";
import type { Lemmatizer } from "./lemma";

export const englishLemmatizer: Lemmatizer = {
  verb: (word) => wink.verb(word),
  noun: (word) => wink.noun(word),
  adjective: (word) => wink.adjective(word),
};
