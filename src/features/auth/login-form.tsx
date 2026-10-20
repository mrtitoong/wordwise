"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/** Khóa nút Gửi lại 60 giây (docs/ux-flows.md §3.1, khớp giới hạn của Supabase). */
const RESEND_SECONDS = 60;

type Step = "email" | "code";
type Busy = "sending" | "verifying" | null;
type ErrorKey =
  "link_expired" | "oauth" | "rateLimited" | "sendFailed" | "invalidCode" | "notConfigured";

type LoginFormProps = {
  next: string;
  initialError: "link_expired" | "oauth" | null;
  configured: boolean;
};

export function LoginForm({ next, initialError, configured }: LoginFormProps) {
  const t = useTranslations("login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<ErrorKey | null>(configured ? initialError : "notConfigured");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const finishUrl = `/auth/finish?next=${encodeURIComponent(next)}`;

  async function sendEmail() {
    if (!configured) return;
    setBusy("sending");
    setError(null);
    const supabase = createClient();
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(null);
    if (sendError) {
      setError(sendError.status === 429 ? "rateLimited" : "sendFailed");
      return;
    }
    setStep("code");
    setCooldown(RESEND_SECONDS);
  }

  async function onSubmitEmail(event: FormEvent) {
    event.preventDefault();
    await sendEmail();
  }

  async function onSubmitCode(event: FormEvent) {
    event.preventDefault();
    setBusy("verifying");
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (verifyError) {
      setBusy(null);
      setError("invalidCode");
      return;
    }
    router.push(finishUrl);
  }

  async function signInWithGoogle() {
    if (!configured) return;
    setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) setError("oauth");
  }

  const errorText = error && (
    <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {t(`errors.${error}`)}
    </p>
  );

  if (step === "code") {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("checkInbox")}</h2>
          <p className="text-muted-foreground">{t("sentTo", { email: email.trim() })}</p>
        </div>
        {errorText}
        <form onSubmit={onSubmitCode} className="flex flex-col gap-3">
          <label htmlFor="otp" className="text-sm font-medium">
            {t("codeLabel")}
          </label>
          <input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="h-12 rounded-xl border border-input bg-background px-4 text-center text-xl tracking-[0.4em] focus-visible:outline-2 focus-visible:outline-ring"
          />
          <Button type="submit" size="lg" disabled={busy !== null || code.length < 6}>
            {busy === "verifying" ? t("verifying") : t("verify")}
          </Button>
        </form>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={cooldown > 0 || busy !== null}
            onClick={() => void sendEmail()}
          >
            {busy === "sending"
              ? t("sending")
              : cooldown > 0
                ? t("resendIn", { seconds: cooldown })
                : t("resend")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            {t("changeEmail")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-2">
      <p className="text-muted-foreground">{t("intro")}</p>
      {errorText}
      <form onSubmit={onSubmitEmail} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-medium">
          {t("emailLabel")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 rounded-xl border border-input bg-background px-4 text-base focus-visible:outline-2 focus-visible:outline-ring"
        />
        <Button type="submit" size="lg" disabled={!configured || busy !== null}>
          {busy === "sending" ? t("sending") : t("sendLink")}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={!configured}
        onClick={() => void signInWithGoogle()}
      >
        <GoogleIcon />
        {t("google")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">{t("privacyHint")}</p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
