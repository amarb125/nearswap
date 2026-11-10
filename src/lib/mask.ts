/**
 * Redacts contact details from chat messages so deals stay on-platform until a reservation
 * (escrow) exists. Covers phone numbers (incl. spaced / spelled-out digits), emails, UPI IDs,
 * and links to messaging apps.
 */
const WORD_DIGITS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  shunya: "0", ek: "1", do: "2", teen: "3", char: "4", paanch: "5", chhe: "6", saat: "7", aath: "8", nau: "9",
};

const REDACT = "[hidden]";

export function maskContactInfo(input: string): { text: string; masked: boolean } {
  let text = input;
  const before = text;

  // emails and UPI handles (name@bank)
  text = text.replace(/[A-Za-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[A-Za-z0-9.-]+(\s*(\.|\(dot\)|\[dot\])\s*[A-Za-z]{2,})?/gi, REDACT);
  // messaging / social links
  text = text.replace(/\b(https?:\/\/)?(wa\.me|api\.whatsapp\.com|t\.me|telegram\.me|instagram\.com|m\.me|fb\.me)\/\S*/gi, REDACT);
  // runs of digits possibly separated by spaces, dashes, brackets (8+ digits total = phone-like)
  text = text.replace(/\+?\d(?:[\s\-()]*\d){7,}/g, REDACT);
  // spelled-out digits: "nine eight seven six five four three two one zero"
  const wordRe = new RegExp(`\\b(?:(?:${Object.keys(WORD_DIGITS).join("|")})\\b[\\s,.-]*){8,}`, "gi");
  text = text.replace(wordRe, REDACT);

  return { text, masked: text !== before };
}
