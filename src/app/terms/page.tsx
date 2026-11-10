export const metadata = { title: "Terms of use" };
const APP = process.env.NEXT_PUBLIC_APP_NAME ?? "Nearswap";

export default function Terms() {
  return (
    <article className="mx-auto max-w-2xl space-y-3 text-sm">
      <h1 className="text-2xl font-bold">Terms of use</h1>
      <p>{APP} is a marketplace that connects people who want to sell used items with buyers nearby. {APP} is not the seller of any item and does not deliver items.</p>
      <h2 className="font-semibold">Payments & escrow</h2>
      <p>Buyers pay through our payment partner. Funds are held until the buyer confirms the handover by sharing the handover code with the seller, after which the sale is final and the seller is paid the sale price less the platform fee. Refunds, no-show compensation and deadlines work as described on the How it works page.</p>
      <h2 className="font-semibold">Your responsibilities</h2>
      <p>List only items you own and may legally sell, describe them honestly, meet only in safe public places, and complete payment only through the app. We may remove listings, suspend accounts, or withhold payouts pending investigation where we suspect fraud or rule violations.</p>
      <h2 className="font-semibold">Disputes</h2>
      <p>If something goes wrong, use &quot;Get help&quot; on the order. Our decision on disputes is based on the order timeline, chat history and evidence from both parties.</p>
      <h2 className="font-semibold">Liability</h2>
      <p>Items are sold as inspected by the buyer. To the extent permitted by law, {APP} is not liable for the condition of items or for the conduct of users at meetups.</p>
    </article>
  );
}
