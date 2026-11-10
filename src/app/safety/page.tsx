export const metadata = { title: "Safety & prohibited items" };

export default function Safety() {
  return (
    <article className="prose mx-auto max-w-2xl space-y-4 text-sm">
      <h1 className="text-2xl font-bold">Safety & prohibited items</h1>
      <section className="space-y-1"><h2 className="font-semibold">Meeting safely</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Meet in busy public places: metro stations, malls, cafés, petrol pumps, police station lobbies.</li>
          <li>Prefer daylight. Tell a friend where you&apos;re going.</li>
          <li>Never go to a stranger&apos;s home alone or invite strangers to yours for small items.</li>
          <li>Never pay or accept payment outside the app. Off-app deals are not protected and break our rules.</li>
          <li>Never share your handover code over phone or chat — only in person, after inspecting the item.</li>
          <li>We will never ask for your OTP, UPI PIN or bank password.</li>
        </ul></section>
      <section className="space-y-1"><h2 className="font-semibold">Not allowed on the platform</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Weapons, ammunition, explosives, fireworks</li><li>Drugs, alcohol, tobacco and vapes</li><li>Medicines, prescription items, medical devices requiring licences</li>
          <li>Live animals and wildlife products</li><li>Identity documents, SIM cards, accounts, tickets for resale above face value</li>
          <li>Counterfeit, replica, stolen or recalled goods</li><li>Adult content; anything illegal under Indian law</li>
        </ul></section>
      <section className="space-y-1"><h2 className="font-semibold">Strikes</h2>
        <p>Sellers who cancel paid orders or miss meetups receive strikes. Three strikes hide your listings and stop new ones. Buyers who repeatedly reject items or miss meetups lose the ability to reserve.</p></section>
      <p>See something wrong? Use &quot;Report this listing&quot; or &quot;Get help&quot; on your order.</p>
    </article>
  );
}
