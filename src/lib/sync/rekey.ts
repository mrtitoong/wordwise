import { cardId, defaultNotebookId, notebookEntryId, userWordId, type Skill } from "@/lib/db/ids";
import type {
  CardRow,
  NotebookEntryRow,
  NotebookRow,
  ReviewLogRow,
  UserSettingsRow,
  UserWordRow,
} from "@/lib/db/types";

/**
 * Chuyển dữ liệu khách sang tài khoản (hàm thuần): đổi chủ và tính lại các ID
 * cố định theo chủ mới. Nhờ vậy từ khách trùng với từ đã có trong tài khoản sẽ
 * có cùng ID và được gộp khi đồng bộ, không tạo bản trùng.
 */
export type OwnedData = {
  settings: UserSettingsRow | null;
  notebooks: NotebookRow[];
  userWords: UserWordRow[];
  entries: NotebookEntryRow[];
  cards: CardRow[];
  logs: ReviewLogRow[];
};

export function rekeyOwnedData(
  data: OwnedData,
  fromOwner: string,
  toOwner: string,
  { keepSettings }: { keepSettings: boolean },
): OwnedData {
  const notebookIds = new Map<string, string>();
  const notebooks = data.notebooks.map((nb) => {
    const id = nb.id === defaultNotebookId(fromOwner) ? defaultNotebookId(toOwner) : nb.id;
    notebookIds.set(nb.id, id);
    return { ...nb, id, user_id: toOwner };
  });

  const userWordIds = new Map<string, string>();
  const userWords = data.userWords.map((uw) => {
    const id = userWordId(toOwner, uw.sense_id);
    userWordIds.set(uw.id, id);
    return { ...uw, id, user_id: toOwner };
  });

  const entries = data.entries.map((entry) => {
    const notebook_id = notebookIds.get(entry.notebook_id) ?? entry.notebook_id;
    const user_word_id = userWordIds.get(entry.user_word_id) ?? entry.user_word_id;
    return {
      ...entry,
      id: notebookEntryId(notebook_id, user_word_id),
      user_id: toOwner,
      notebook_id,
      user_word_id,
    };
  });

  const cardIds = new Map<string, string>();
  const cards = data.cards.map((card) => {
    const user_word_id = userWordIds.get(card.user_word_id) ?? card.user_word_id;
    const id = cardId(user_word_id, card.skill as Skill);
    cardIds.set(card.id, id);
    return { ...card, id, user_id: toOwner, user_word_id };
  });

  const logs = data.logs.map((log) => ({
    ...log,
    user_id: toOwner,
    card_id: cardIds.get(log.card_id) ?? log.card_id,
  }));

  const settings = keepSettings && data.settings ? { ...data.settings, user_id: toOwner } : null;

  return { settings, notebooks, userWords, entries, cards, logs };
}
