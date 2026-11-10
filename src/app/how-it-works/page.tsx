import Link from "next/link";

export const metadata = { title: "How it works" };

const steps = [
  ["📸", "Seller lists for free", "Photos, price, and your area. Your exact location and phone number are never shown."],
  ["💬", "Buyer chats & reserves", "Ask questions in the app. When ready, the buyer reserves the item and pays. The item is locked for them."],
  ["🔒", "Money goes into escrow", "The payment is held by our RBI-regulated payment partner. The seller can see it's paid, but can't touch it yet."],
  ["🤝", "Meet in a public place", "Agree a time and a busy public spot. No delivery — you meet your neighbour directly."],
  ["🔍", "Buyer inspects", "Check the item properly. Not as described? Tap Reject for a full refund. The item goes back on sale."],
  ["🔢", "Handover code", "Happy? The buyer shows a 6-digit code. The seller enters it, hands over the item, and the money is released."],
];

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Safe local buying & selling</h1>
        <p className="mt-2 text-stone-600">No delivery. No cash. No fake payment screenshots. Both sides are protected.</p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map(([icon, title, text], i) => (
          <li key={title} className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-2xl">{icon}</p>
            <p className="mt-1 font-semibold">{i + 1}. {title}</p>
            <p className="mt-1 text-sm text-stone-600">{text}</p>
          </li>
        ))}
      </ol>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Why buyers are safe</h2>
          <ul className="list-disc space-y-1 pl-5"><li>Seller is only paid after you give the code</li><li>Full refund if you reject the item</li><li>Full refund if the seller doesn&apos;t show up or cancels</li><li>Automatic refund if the handover doesn&apos;t happen in time</li></ul>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Why sellers are safe</h2>
          <ul className="list-disc space-y-1 pl-5"><li>Money is already collected before you meet</li><li>No fake UPI screenshots or counterfeit notes</li><li>Compensation if the buyer doesn&apos;t turn up</li><li>Ratings that count only real, completed sales</li></ul>
        </div>
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">Fees</h2>
        <p>Listing and buying are free. When an item sells, the seller pays a <b>5% fee</b> (minimum ₹10, maximum ₹500). That&apos;s it — the buyer pays exactly the listed price.</p>
        <p className="mt-2">If a buyer misses an agreed meetup, 5% of the price (up to ₹100) goes to the seller for their time, and the rest is refunded.</p>
      </section>
      <div className="text-center"><Link href="/" className="inline-block rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white">Start browsing</Link></div>
    </div>
  );
}
