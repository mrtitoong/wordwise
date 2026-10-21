"use client";

import Link from "next/link";
import { ImageIcon, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { AudioButton } from "@/components/audio-button";
import { Button } from "@/components/ui/button";
import { useUserImageUrl } from "@/features/media/user-images";
import { MineBadge, useCard } from "./parts";

export function CardHeader() {
  const t = useTranslations("wordCard");
  const { view, owner, open, addSense } = useCard();
  const { content } = view;

  const customRef = view.image?.kind === "custom" ? view.image.path : null;
  const customUrl = useUserImageUrl(customRef, owner);
  const primary = view.senses.find((s) => s.senseId === view.primarySenseId) ?? view.senses[0]!;
  // Ảnh tự đặt chưa tải được (offline) thì hiện ảnh gốc của nghĩa.
  const stock =
    view.image?.kind === "stock"
      ? view.image
      : (primary.stockImage ?? view.senses.find((s) => s.stockImage)?.stockImage ?? null);
  const imageUrl = customUrl ?? stock?.url ?? null;
  const showingCustom = !!customUrl;

  const meta = [
    t(`pos.${content.pos}`),
    content.cefr,
    content.register !== "neutral" ? t(`register.${content.register}`) : null,
  ].filter(Boolean);

  return (
    <section className="flex flex-col gap-3 pt-2" aria-labelledby="word-lemma">
      <div className="flex flex-col gap-1">
        <h1 id="word-lemma" className="text-3xl font-semibold break-words" lang={content.language}>
          {content.lemma}
        </h1>
        <p className="text-sm text-muted-foreground">{meta.join(" · ")}</p>
        {view.inflections.length > 0 && (
          <p className="text-sm" lang={content.language}>
            {view.inflections.join(" · ")}
          </p>
        )}
        {content.forms.variants.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {content.forms.variants
              .map((v) => t("variant", { region: t(`region.${v.region}`), form: v.form }))
              .join(" · ")}
          </p>
        )}
      </div>

      {imageUrl && (
        <figure className="flex flex-col gap-1">
          <div className="relative overflow-hidden rounded-xl bg-muted">
            {/* Ảnh từ Pexels/Unsplash hoặc signed URL: không qua next/image (ảnh ngoài, URL đổi). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={t("imageAlt", { word: content.lemma })}
              className="aspect-[16/9] w-full object-cover"
              loading="lazy"
            />
            {showingCustom && (
              <span className="absolute top-2 left-2">
                <MineBadge />
              </span>
            )}
          </div>
          {!showingCustom && stock && (
            <figcaption className="text-xs text-muted-foreground">
              <a
                href={stock.credit.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
              >
                {t("imageCredit", {
                  author: stock.credit.author,
                  provider: stock.credit.provider === "pexels" ? "Pexels" : "Unsplash",
                })}
              </a>
            </figcaption>
          )}
        </figure>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {(["us", "uk"] as const).map((voice) =>
          content.ipa[voice] ? (
            <div key={voice} className="flex items-center gap-0.5">
              <AudioButton
                text={content.lemma}
                voice={voice}
                url={view.audio[voice]}
                className="-ml-2"
              />
              <span className="text-xs font-semibold text-muted-foreground">
                {voice.toUpperCase()}
              </span>
              <span className="ml-1 font-mono text-sm" lang="en-fonipa">
                /{content.ipa[voice]}/
              </span>
            </div>
          ) : null,
        )}
      </div>

      {view.notebooks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("inNotebooks")}</span>
          {view.notebooks.map((n) => (
            <Link
              key={n.id}
              href="/notebooks"
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-3 text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {n.name}
            </Link>
          ))}
        </div>
      )}

      {view.inNotebook ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => open({ kind: "image" })}
          >
            <ImageIcon aria-hidden />
            {t("changeImage")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl bg-muted p-3">
          <p className="text-sm">{t("notInNotebook")}</p>
          <Button
            type="button"
            className="min-h-11"
            disabled={!owner}
            onClick={() => addSense(view.primarySenseId)}
          >
            <Plus aria-hidden />
            {t("addToNotebook")}
          </Button>
        </div>
      )}
    </section>
  );
}
