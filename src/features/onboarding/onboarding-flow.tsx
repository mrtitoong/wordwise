"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CEFR_LEVELS,
  DAILY_NEW_OPTIONS,
  GOALS,
  TARGET_LANGUAGES,
  defaultOnboardingSettings,
  type CefrLevel,
  type Goal,
  type OnboardingSettings,
} from "@/lib/onboarding/settings";
import { pickStarterWords, type StarterWord } from "@/lib/onboarding/starter-words";
import { writeGuestData } from "@/lib/onboarding/guest-storage";
import { completeOnboarding } from "./actions";

const DEFAULT_REMINDER = "20:00";
const SETTING_STEPS = 3;

type Step = "language" | "level" | "daily" | "notify" | "starter";

type OnboardingFlowProps = {
  mode: "account" | "guest";
  candidates: StarterWord[];
};

export function OnboardingFlow({ mode, candidates }: OnboardingFlowProps) {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState<Step>("language");
  const [settings, setSettings] = useState<OnboardingSettings>(() =>
    defaultOnboardingSettings(Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [reminderOn, setReminderOn] = useState(true);
  const [reminderTime, setReminderTime] = useState(DEFAULT_REMINDER);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const starters = useMemo(
    () => pickStarterWords(candidates, settings.cefrLevel),
    [candidates, settings.cefrLevel],
  );

  const update = (patch: Partial<OnboardingSettings>) => setSettings((s) => ({ ...s, ...patch }));

  /** Sau bước 3: hỏi bật thông báo (nếu có giờ nhắc), rồi tới 5 từ khởi đầu. */
  function afterDaily(reminder: string | null) {
    update({ reminderTime: reminder });
    if (reminder && typeof Notification !== "undefined" && Notification.permission === "default") {
      setStep("notify");
    } else {
      setStep("starter");
    }
  }

  async function finish(withStarters: boolean) {
    setSaving(true);
    setFailed(false);
    const senseIds = withStarters ? starters.map((w) => w.senseId) : [];
    if (mode === "guest") {
      writeGuestData((current) => ({
        ...current,
        settings,
        onboardedAt: new Date().toISOString(),
        senseIds: [...new Set([...current.senseIds, ...senseIds])],
      }));
    }
    const result = await completeOnboarding({ settings, senseIds }).catch(() => null);
    if (!result?.ok) {
      setSaving(false);
      setFailed(true);
      return;
    }
    // Tải lại hẳn để proxy đọc cookie "đã onboarding".
    window.location.assign(withStarters ? "/" : "/add");
  }

  const stepNumber = { language: 1, level: 2, daily: 3, notify: 3, starter: 3 }[step];
  const showProgress = step === "language" || step === "level" || step === "daily";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[env(safe-area-inset-top,0px)] pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
      {showProgress && (
        <div className="flex flex-col gap-2 pt-4">
          <p className="text-sm text-muted-foreground">
            {t("progress", { step: stepNumber, total: SETTING_STEPS })}
          </p>
          <div
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={SETTING_STEPS}
            aria-valuenow={stepNumber}
            aria-label={t("progressLabel")}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(stepNumber / SETTING_STEPS) * 100}%` }}
            />
          </div>
        </div>
      )}

      {step === "language" && (
        <StepLayout
          title={t("language.title")}
          body={t("language.body")}
          onSkip={() => setStep("level")}
          onNext={() => setStep("level")}
        >
          <ChoiceGroup label={t("language.title")}>
            {TARGET_LANGUAGES.map((lang) => (
              <Choice
                key={lang}
                type="radio"
                selected={settings.targetLanguage === lang}
                onClick={() => update({ targetLanguage: lang })}
              >
                {t(`language.options.${lang}`)}
              </Choice>
            ))}
          </ChoiceGroup>
          <p className="text-sm text-muted-foreground">{t("language.more")}</p>
        </StepLayout>
      )}

      {step === "level" && (
        <StepLayout
          title={t("level.title")}
          body={t("level.body")}
          onSkip={() => {
            update({ cefrLevel: null, goals: [] });
            setStep("daily");
          }}
          onNext={() => setStep("daily")}
        >
          <ChoiceGroup label={t("level.title")}>
            {CEFR_LEVELS.map((level: CefrLevel) => (
              <Choice
                key={level}
                type="radio"
                selected={settings.cefrLevel === level}
                onClick={() => update({ cefrLevel: level })}
              >
                <span className="font-semibold">{level}</span>
                <span className="text-muted-foreground">{t(`level.options.${level}`)}</span>
              </Choice>
            ))}
          </ChoiceGroup>
          <h2 id="goals-heading" className="pt-2 font-semibold">
            {t("goals.title")}
          </h2>
          <div role="group" aria-labelledby="goals-heading" className="flex flex-wrap gap-2">
            {GOALS.map((goal: Goal) => {
              const selected = settings.goals.includes(goal);
              return (
                <button
                  key={goal}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    update({
                      goals: selected
                        ? settings.goals.filter((g) => g !== goal)
                        : [...settings.goals, goal],
                    })
                  }
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                    selected ? "border-primary bg-accent font-medium" : "hover:bg-muted",
                  )}
                >
                  {t(`goals.options.${goal}`)}
                </button>
              );
            })}
          </div>
        </StepLayout>
      )}

      {step === "daily" && (
        <StepLayout
          title={t("daily.title")}
          body={t("daily.body")}
          onSkip={() => {
            update({ dailyNewLimit: defaultOnboardingSettings().dailyNewLimit });
            afterDaily(null);
          }}
          onNext={() => afterDaily(reminderOn ? reminderTime : null)}
        >
          <ChoiceGroup label={t("daily.title")} columns>
            {DAILY_NEW_OPTIONS.map((n) => (
              <Choice
                key={n}
                type="radio"
                selected={settings.dailyNewLimit === n}
                onClick={() => update({ dailyNewLimit: n })}
              >
                {t("daily.option", { count: n })}
              </Choice>
            ))}
          </ChoiceGroup>
          <p className="text-sm text-muted-foreground">
            {t("daily.estimate", { minutes: Math.round(settings.dailyNewLimit * 1.5) })}
          </p>
          <h2 className="pt-2 font-semibold">{t("reminder.title")}</h2>
          <div className="flex flex-col gap-2">
            <Choice type="checkbox" selected={reminderOn} onClick={() => setReminderOn((v) => !v)}>
              {t("reminder.toggle")}
            </Choice>
            {reminderOn && (
              <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4">
                {t("reminder.at")}
                <input
                  type="time"
                  required
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value || DEFAULT_REMINDER)}
                  className="h-11 rounded-lg bg-muted px-3 text-base"
                />
              </label>
            )}
          </div>
        </StepLayout>
      )}

      {step === "notify" && (
        <StepLayout
          title={t("notify.title")}
          body={t("notify.body", { time: settings.reminderTime ?? DEFAULT_REMINDER })}
          nextLabel={t("notify.allow")}
          skipLabel={t("notify.later")}
          onSkip={() => setStep("starter")}
          onNext={async () => {
            await Notification.requestPermission().catch(() => undefined);
            setStep("starter");
          }}
        />
      )}

      {step === "starter" && (
        <div className="flex flex-1 flex-col gap-4 pt-8">
          <h1 className="text-2xl font-bold text-balance">
            {starters.length > 0 ? t("starter.title") : t("starter.emptyTitle")}
          </h1>
          <p className="text-muted-foreground">
            {starters.length > 0 ? t("starter.body") : t("starter.emptyBody")}
          </p>
          {starters.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label={t("starter.listLabel")}>
              {starters.map((word) => (
                <li key={word.senseId} className="flex flex-col rounded-xl border px-4 py-3">
                  <span className="flex items-baseline gap-2">
                    <span lang="en" className="text-lg font-semibold">
                      {word.lemma}
                    </span>
                    {word.ipa && (
                      <span className="text-sm text-muted-foreground">/{word.ipa}/</span>
                    )}
                    {word.cefr && (
                      <span className="ml-auto rounded-full bg-muted px-2 text-xs">
                        {word.cefr}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{word.meaningVi}</span>
                </li>
              ))}
            </ul>
          )}
          {failed && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {t("saveFailed")}
            </p>
          )}
          <div className="mt-auto flex flex-col gap-2 pt-4">
            {starters.length > 0 && (
              <Button size="lg" disabled={saving} onClick={() => void finish(true)}>
                {saving ? t("saving") : t("starter.learn")}
              </Button>
            )}
            <Button
              size="lg"
              variant={starters.length > 0 ? "outline" : "default"}
              disabled={saving}
              onClick={() => void finish(false)}
            >
              {t("starter.addOwn")}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

type StepLayoutProps = {
  title: string;
  body: string;
  children?: ReactNode;
  onNext: () => void | Promise<void>;
  onSkip: () => void;
  nextLabel?: string;
  skipLabel?: string;
};

function StepLayout({
  title,
  body,
  children,
  onNext,
  onSkip,
  nextLabel,
  skipLabel,
}: StepLayoutProps) {
  const t = useTranslations("onboarding");
  return (
    <div className="flex flex-1 flex-col gap-4 pt-6">
      <h1 className="text-2xl font-bold text-balance">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
      {children}
      <div className="mt-auto flex flex-col gap-2 pt-6">
        <Button size="lg" onClick={() => void onNext()}>
          {nextLabel ?? t("next")}
        </Button>
        <Button size="lg" variant="ghost" onClick={onSkip}>
          {skipLabel ?? t("skip")}
        </Button>
      </div>
    </div>
  );
}

function ChoiceGroup({
  label,
  columns,
  children,
}: {
  label: string;
  columns?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-2", columns && "grid-cols-2")}
    >
      {children}
    </div>
  );
}

function Choice({
  type,
  selected,
  onClick,
  children,
}: {
  type: "radio" | "checkbox";
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role={type}
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        selected ? "border-primary bg-accent font-medium" : "hover:bg-muted",
      )}
    >
      <span className="flex flex-1 flex-wrap items-baseline gap-x-2">{children}</span>
      {selected && <Check className="size-5 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}
