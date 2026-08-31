// The full campaign budget is charged upfront at launch (see
// stripe-charge-campaign), but that's not the same as "how much of it has
// actually been used" - this computes the implied spend so far from how many
// of the paid-for impressions have actually been delivered, purely for
// transparent display (no second charge happens here).

export interface SpendableAd {
  total_budget: number | null;
  impressions: number | null;
  estimated_impressions_max: number | null;
}

export const computeSpentSoFar = (ad: SpendableAd): number => {
  const budget = ad.total_budget || 0;
  const cap = ad.estimated_impressions_max || 0;
  if (budget <= 0 || cap <= 0) return 0;
  const delivered = ad.impressions || 0;
  const fraction = Math.min(1, delivered / cap);
  return budget * fraction;
};

export const computeDeliveryProgress = (ad: SpendableAd): number => {
  const cap = ad.estimated_impressions_max || 0;
  if (cap <= 0) return 0;
  const delivered = ad.impressions || 0;
  return Math.min(1, delivered / cap);
};
