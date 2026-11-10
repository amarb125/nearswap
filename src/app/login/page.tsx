"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/components/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { useMe } from "@/components/useMe";

function Login() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const { refresh } = useMe();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ devCode?: string }>("/api/auth/otp", { body: { phone } });
      setDevCode(r.devCode);
      setStep("code");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ user: { needsProfile: boolean } }>("/api/auth/verify", { body: { phone, code } });
      await refresh();
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.replace(r.user.needsProfile ? `/account?setup=1&next=${encodeURIComponent(safeNext)}` : safeNext);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="mb-1 text-2xl font-bold">Log in or sign up</h1>
      <p className="mb-6 text-sm text-stone-600">We&apos;ll text you a code. Your number is never shown to other users.</p>
      <Card>
        {step === "phone" ? (
          <form onSubmit={sendCode} className="space-y-3">
            <label htmlFor="phone">Mobile number</label>
            <input id="phone" className="w-full" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <ErrorText>{error}</ErrorText>
            <Button className="w-full" loading={busy}>Send code</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <label htmlFor="code">Enter the 6-digit code sent to {phone}</label>
            <input id="code" className="w-full text-center text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus />
            {devCode && <p className="text-xs text-amber-700">Dev mode: your code is <b>{devCode}</b></p>}
            <ErrorText>{error}</ErrorText>
            <Button className="w-full" loading={busy} disabled={code.length !== 6}>Verify</Button>
            <button type="button" className="w-full text-sm text-stone-600 underline" onClick={() => { setStep("phone"); setCode(""); }}>Use a different number</button>
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-xs text-stone-500">By continuing you agree to our <a className="underline" href="/terms">Terms</a> and <a className="underline" href="/privacy">Privacy Policy</a>.</p>
    </div>
  );
}

export default function Page() {
  return <Suspense><Login /></Suspense>;
}
