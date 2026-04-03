import type { Role, TeamMember } from "./useTeamMockData";

export type QuotaAmount = number | "infinity";

export type QuotaSummary = {
  used: number;
  remaining: QuotaAmount;
  total: QuotaAmount;
  progressRatio: number;
  isUnlimited: boolean;
};

type MemberQuotaLike = Pick<
  TeamMember,
  | "role"
  | "creditLimit"
  | "creditLimitKind"
  | "creditsUsed"
  | "creditsRemaining"
>;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function getMemberQuotaSummary(
  member?: MemberQuotaLike | null,
  fallbackRole?: Role,
): QuotaSummary {
  void fallbackRole;
  const used = Math.max(member?.creditsUsed ?? 0, 0);
  const total = member?.creditLimit;
  const limitKind = member?.creditLimitKind ?? (total == null ? "unlimited" : "fixed");

  if (limitKind === "unlimited" || total == null) {
    return {
      used,
      remaining: "infinity",
      total: "infinity",
      progressRatio: 1,
      isUnlimited: true,
    };
  }

  const normalizedTotal = Math.max(total, 0);
  const calculatedRemaining =
    member?.creditsRemaining ?? normalizedTotal - used;
  const remaining = clamp(calculatedRemaining, 0, normalizedTotal);
  const progressRatio =
    normalizedTotal > 0 ? remaining / normalizedTotal : 0;

  return {
    used,
    remaining,
    total: normalizedTotal,
    progressRatio,
    isUnlimited: false,
  };
}
