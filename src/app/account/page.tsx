"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type ListingCard } from "@/components/api";
import { Badge, Button, Card, ErrorText, Spinner, TrustLine } from "@/components/ui";
import { useMe } from "@/components/useMe";
import { ListingGrid } from "@/components/ListingGrid";

function Account() {
  const router = useRouter();
  const sp = useSearchParams();
  const setup = sp.get("setup");
  const next = sp.get("next");
  const { me, loading, refresh } = useMe();
  const [profile, setProfile] = useState({ name: "", city: "" });
  const [bank, setBank] = useState({ name: "", email: "", accountNumber: "", confirm: "", ifsc: "", street: "", city: "", state: "", postalCode: "" });
  const [listings, setListings] = useState<ListingCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !me) router.replace("/login?next=/account");
    if (me) {
      setProfile({ name: me.name === "Neighbour" ? "" : me.name, city: me.city ?? "" });
      api<{ items: ListingCard[] }>("/api/listings/mine").then((r) => setListings(r.items)).catch(() => setListings([]));
    }
  }, [me, loading, router]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy("profile"); setError(null);
    try {
      await api("/api/me", { method: "PATCH", body: profile });
      await refresh();
      setSaved(true);
      if (setup) router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function saveBank(e: React.FormEvent) {
    e.preventDefault();
    if (bank.accountNumber !== bank.confirm) return setBankError("Account numbers don't match");
    setBusy("bank"); setBankError(null);
    try {
      const { confirm: _c, ...payload } = bank;
      void _c;
      await api("/api/me/payout", { body: payload });
      await refresh();
    } catch (e) { setBankError((e as Error).message); } finally { setBusy(null); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await refresh();
    router.replace("/");
  }

  if (!me) return <Spinner />;
  const b = (k: keyof typeof bank) => (e: React.ChangeEvent<HTMLInputElement>) => setBank({ ...bank, [k]: e.target.value });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">{setup ? "Welcome! Set up your profile" : "Account"}</h1>
      {!setup && <Card><TrustLine user={me} link={false} /><p className="mt-1 text-xs text-stone-500">Phone ending ••{me.phoneLast4} (never shown to others){me.strikes > 0 && <> · <span className="text-red-700">{me.strikes} strike{me.strikes > 1 ? "s" : ""}</span></>}</p></Card>}

      <Card>
        <form onSubmit={saveProfile} className="space-y-3">
          <h2 className="font-semibold">Profile</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><label htmlFor="n">Your name (shown to buyers/sellers)</label><input id="n" className="w-full" required minLength={2} maxLength={40} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
            <div className="space-y-1"><label htmlFor="c">City</label><input id="c" className="w-full" required minLength={2} value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} /></div>
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex items-center gap-3"><Button loading={busy === "profile"}>{setup ? "Continue" : "Save"}</Button>{saved && !setup && <span className="text-sm text-emerald-700">Saved ✓</span>}</div>
        </form>
      </Card>

      {!setup && (
        <>
          <Card className="space-y-3">
            <h2 id="payouts" className="flex items-center gap-2 font-semibold">Payouts {me.payoutStatus === "ACTIVE" ? <Badge tone="green">Active</Badge> : me.payoutStatus === "PENDING" ? <Badge tone="amber">Verifying</Badge> : me.payoutStatus === "FAILED" ? <Badge tone="red">Failed</Badge> : <Badge>Not set up</Badge>}</h2>
            {me.payoutStatus === "ACTIVE" ? <p className="text-sm text-stone-600">Sales are paid to your bank account ending ••{me.payoutAccountLast4}. Contact support to change it.</p>
              : me.payoutStatus === "PENDING" ? <p className="text-sm text-stone-600">Our payment partner is verifying your bank account (account ••{me.payoutAccountLast4}). This usually takes less than a day.</p>
              : (
              <form onSubmit={saveBank} className="space-y-3">
                <p className="text-sm text-stone-600">Add the bank account where you want to receive money from sales. Details are sent securely to our RBI-regulated payment partner; we don&apos;t store your full account number.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="w-full" placeholder="Account holder name" required value={bank.name} onChange={b("name")} aria-label="Account holder name" />
                  <input className="w-full" type="email" placeholder="Email" required value={bank.email} onChange={b("email")} aria-label="Email" />
                  <input className="w-full" inputMode="numeric" placeholder="Account number" required value={bank.accountNumber} onChange={b("accountNumber")} aria-label="Account number" />
                  <input className="w-full" inputMode="numeric" placeholder="Confirm account number" required value={bank.confirm} onChange={b("confirm")} aria-label="Confirm account number" />
                  <input className="w-full uppercase" placeholder="IFSC" required value={bank.ifsc} onChange={b("ifsc")} aria-label="IFSC" />
                  <input className="w-full" placeholder="Street address" required value={bank.street} onChange={b("street")} aria-label="Street address" />
                  <input className="w-full" placeholder="City" required value={bank.city} onChange={b("city")} aria-label="Address city" />
                  <input className="w-full" placeholder="State" required value={bank.state} onChange={b("state")} aria-label="State" />
                  <input className="w-full" inputMode="numeric" placeholder="PIN code" required value={bank.postalCode} onChange={b("postalCode")} aria-label="PIN code" />
                </div>
                <ErrorText>{bankError}</ErrorText>
                <Button loading={busy === "bank"}>Save bank account</Button>
              </form>
            )}
          </Card>

          <div>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">My listings</h2><Link href="/sell" className="text-sm text-brand-700">+ New</Link></div>
            {!listings ? <Spinner /> : listings.length ? <ListingGrid items={listings} /> : <p className="text-sm text-stone-600">You haven&apos;t listed anything yet.</p>}
          </div>
          <div className="flex gap-2">
            <Link href={`/u/${me.id}`}><Button variant="secondary">View public profile</Button></Link>
            <Button variant="ghost" onClick={logout}>Log out</Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><Account /></Suspense>;
}
