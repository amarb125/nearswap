export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-3 text-sm">
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p><b>What we collect:</b> your mobile number (for login), name and city, listings and photos you upload, approximate location (rounded to about 100 metres), chat messages, order history, and the bank details you give for payouts (sent to our payment partner; we keep only the last 4 digits).</p>
      <p><b>What others see:</b> your first name, city/area, ratings and sale counts. Your phone number and exact location are never shown.</p>
      <p><b>Why:</b> to run the marketplace, prevent fraud, resolve disputes and meet legal obligations. Chats on orders may be reviewed by our support team when a dispute is opened.</p>
      <p><b>Sharing:</b> with our payment partner (payments and payouts), SMS provider (login codes) and hosting providers. We don&apos;t sell your data.</p>
      <p><b>Your rights:</b> you can request access to or deletion of your data by contacting support, subject to records we must keep for legal and tax purposes.</p>
    </article>
  );
}
