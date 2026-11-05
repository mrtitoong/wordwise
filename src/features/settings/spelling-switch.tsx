"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getLocalDb } from "@/lib/db/local";
import { languagePack } from "@/lib/lang";
import { learningLanguage } from "@/lib/lang/filter";
import { useOwner } from "@/lib/sync/owner";
import { SettingSwitch } from "./setting-switch";

/** Công tắc của thẻ Chính tả theo ngôn ngữ đang học: tiếng Trung là "Luyện viết chữ". */
export function SpellingSwitch() {
  const owner = useOwner();
  const language = useLiveQuery(
    async () =>
      learningLanguage(
        owner ? (await getLocalDb().user_settings.get(owner))?.target_language : undefined,
      ),
    [owner],
  );
  return language && languagePack(language).writesStrokes ? (
    <SettingSwitch field="practice_hanzi" label="practiceHanzi" hint="practiceHanziHint" />
  ) : (
    <SettingSwitch field="practice_spelling" label="practiceSpelling" hint="practiceSpellingHint" />
  );
}
