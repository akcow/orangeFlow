import { getMemberQuotaSummary } from "./quota";

describe("getMemberQuotaSummary", () => {
  it("returns unlimited quota for owner memberships", () => {
    expect(
      getMemberQuotaSummary({
        role: "owner",
        creditLimit: null,
        creditsUsed: 250,
        creditsRemaining: null,
      }),
    ).toEqual({
      used: 250,
      remaining: "infinity",
      total: "infinity",
      progressRatio: 1,
      isUnlimited: true,
    });
  });

  it("calculates remaining credits and remaining progress ratio for limited memberships", () => {
    expect(
      getMemberQuotaSummary({
        role: "member",
        creditLimit: 200,
        creditLimitKind: "fixed",
        creditsUsed: 50,
        creditsRemaining: 150,
      }),
    ).toEqual({
      used: 50,
      remaining: 150,
      total: 200,
      progressRatio: 0.75,
      isUnlimited: false,
    });
  });

  it("falls back to derived remaining credits when the API omits them", () => {
    expect(
      getMemberQuotaSummary({
        role: "admin",
        creditLimit: 80,
        creditLimitKind: "recurring",
        creditsUsed: 30,
        creditsRemaining: null,
      }),
    ).toEqual({
      used: 30,
      remaining: 50,
      total: 80,
      progressRatio: 0.625,
      isUnlimited: false,
    });
  });
});
