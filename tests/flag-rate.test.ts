import { describe, expect, it } from "vitest";
import { flagRate, formatFlagRate } from "../lib/flag-rate";

/**
 * The number an operator judges a clinician by.
 *
 * Both edge cases here are about not accusing someone with a rounding error: a
 * clinician who has done nothing has no rate at all, and one who flags rarely
 * must not be shown as never flagging.
 */

describe("the rate", () => {
  it("is flags over everything they acted on", () => {
    expect(flagRate(9, 1)).toBeCloseTo(0.1);
    expect(flagRate(1, 1)).toBe(0.5);
  });

  it("is null, not zero, for a clinician who has done nothing", () => {
    expect(flagRate(0, 0)).toBeNull();
  });

  it("is zero for one who has worked and never flagged", () => {
    expect(flagRate(40, 0)).toBe(0);
  });

  it("is one for a clinician who has only ever flagged", () => {
    expect(flagRate(0, 3)).toBe(1);
  });
});

describe("how it reads", () => {
  it("shows nothing at all when there is no rate", () => {
    expect(formatFlagRate(null)).toBe("—");
  });

  it("rounds an ordinary rate to a whole percent", () => {
    expect(formatFlagRate(flagRate(9, 1))).toBe("10%");
    expect(formatFlagRate(flagRate(2, 1))).toBe("33%");
  });

  it("never rounds a real flag down to none", () => {
    // One in four hundred is not "never flags", which is what 0% would say.
    expect(formatFlagRate(flagRate(399, 1))).toBe("<1%");
  });

  it("never rounds a real judgement away either", () => {
    expect(formatFlagRate(flagRate(1, 399))).toBe(">99%");
  });

  it("keeps the true extremes for the true extremes", () => {
    expect(formatFlagRate(0)).toBe("0%");
    expect(formatFlagRate(1)).toBe("100%");
  });
});
