"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { importProgress } from "@/lib/entry/import-record";
import { getSyncEngine } from "@/lib/sync/client";
import { runImports, setImportMessages } from "./import-runner";

/** Chạy tiếp việc nhập file còn dở khi mở app, đổi tài khoản hoặc có mạng lại. */
export function ImportProvider() {
  const t = useTranslations("addWord.file");

  useEffect(() => {
    setImportMessages({
      done: (record) =>
        t("doneToast", { notebook: record.notebookName, added: importProgress(record).added }),
      waiting: (record) =>
        t("waitingToast", {
          notebook: record.notebookName,
          pending: importProgress(record).pending,
        }),
    });
  }, [t]);

  useEffect(() => {
    const engine = getSyncEngine();
    if (!engine) return;
    const resume = () => {
      const owner = engine.getOwner();
      if (owner && navigator.onLine) void runImports(owner);
    };
    resume();
    const unsubscribe = engine.subscribe(resume);
    window.addEventListener("online", resume);
    // Việc đang chờ sang ngày mới: kiểm tra lại mỗi 15 phút khi app mở.
    const timer = setInterval(resume, 15 * 60 * 1000);
    return () => {
      unsubscribe();
      window.removeEventListener("online", resume);
      clearInterval(timer);
    };
  }, []);

  return null;
}
