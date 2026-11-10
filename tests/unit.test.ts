import { describe, expect, it } from "vitest";
import { computeFee, computeNoShowCompensation, rupeesToPaise } from "@/lib/money";
import { maskContactInfo } from "@/lib/mask";
import { boundingBox, coarsen, haversineKm } from "@/lib/geo";
import { normalizePhone } from "@/lib/auth";
import { prohibitedTerm } from "@/lib/listings";

const fee = { feeBps: 500, feeMinPaise: 1000, feeMaxPaise: 50000 };

describe("fees", () => {
  it("charges 5% within min/max", () => {
    expect(computeFee(200000, fee)).toBe(10000); // ₹2000 -> ₹100
    expect(computeFee(5000, fee)).toBe(1000); // ₹50 -> min ₹10
    expect(computeFee(5_000_000, fee)).toBe(50000); // ₹50,000 -> cap ₹500
    expect(computeFee(1000, fee)).toBe(500); // never more than half the price
  });
  it("rejects bad prices", () => {
    expect(() => computeFee(0, fee)).toThrow();
    expect(() => computeFee(10.5, fee)).toThrow();
  });
  it("caps no-show compensation", () => {
    expect(computeNoShowCompensation(200000, 500, 10000)).toBe(10000);
    expect(computeNoShowCompensation(50000, 500, 10000)).toBe(2500);
  });
  it("parses rupees", () => {
    expect(rupeesToPaise("1,499.5")).toBe(149950);
    expect(rupeesToPaise("₹ 200")).toBe(20000);
    expect(rupeesToPaise("12.345")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
  });
});

describe("contact masking", () => {
  it.each([
    "call me 9876543210",
    "my no is 98765 43210",
    "+91-98765-43210 whatsapp",
    "nine eight seven six five four three two one zero",
    "pay to rahul@okicici",
    "mail me at abc.def@gmail.com",
    "msg me wa.me/919876543210",
  ])("hides contacts in %s", (msg) => {
    const r = maskContactInfo(msg);
    expect(r.masked).toBe(true);
    expect(r.text).toContain("[hidden]");
    expect(r.text).not.toMatch(/\d{5}/);
  });
  it.each(["Is it still available?", "Can you do ₹1500?", "Meet at 5:30 near the metro gate 2", "It's 2 years old, 128 GB"])(
    "leaves normal messages alone: %s",
    (msg) => {
      expect(maskContactInfo(msg)).toEqual({ text: msg, masked: false });
    },
  );
});

describe("geo", () => {
  it("computes distance", () => {
    // Connaught Place to India Gate ~2.4km
    expect(haversineKm(28.6315, 77.2167, 28.6129, 77.2295)).toBeCloseTo(2.4, 0);
  });
  it("bounding box contains radius", () => {
    const b = boundingBox(19.076, 72.8777, 5);
    expect(haversineKm(19.076, 72.8777, b.maxLat, 72.8777)).toBeCloseTo(5, 1);
  });
  it("coarsens location to ~100m", () => {
    expect(coarsen(28.613912)).toBe(28.614);
  });
});

describe("phone + policy", () => {
  it("normalizes indian numbers", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("09876543210")).toBe("+919876543210");
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
    expect(normalizePhone("12345")).toBeNull();
  });
  it("flags prohibited items", () => {
    expect(prohibitedTerm("Air pistol for sale")).toBe("pistol");
    expect(prohibitedTerm("Old guitar, good condition")).toBeNull();
    expect(prohibitedTerm("Beer mug set")).toBe("beer"); // conservative by design
  });
});
