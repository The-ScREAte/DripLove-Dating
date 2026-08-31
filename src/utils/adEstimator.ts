// Turns a budget/duration/audience choice into the impressions estimate
// shown to advertisers - "$10/day is expected to get you ~8,000-12,000
// impressions", never a hard promise. The actual rate (impressions per $1)
// is admin-configured per country (app_settings.ad_rates), not hardcoded
// here - this only does the math once you already have the rate.

export interface AdRates {
  default: number;
  [countryCode: string]: number;
}

export const DEFAULT_AD_RATES: AdRates = { default: 1000 };

// Averages the rate across whichever countries are targeted (falls back to
// the default rate when none are selected, i.e. "everywhere").
export const getBlendedRate = (targetCountries: string[], rates: AdRates): number => {
  if (targetCountries.length === 0) return rates.default;
  const values = targetCountries.map((c) => rates[c] ?? rates.default);
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

export interface ImpressionEstimate {
  dailyMin: number;
  dailyMax: number;
  totalMin: number;
  totalMax: number;
}

// +/-20% band around the point estimate - there's no real inventory/auction
// data behind this yet, so a single exact number would be a false promise.
const BAND = 0.2;

export const estimateImpressions = (
  budgetPerDay: number,
  durationDays: number,
  targetCountries: string[],
  rates: AdRates
): ImpressionEstimate => {
  const rate = getBlendedRate(targetCountries, rates);
  const dailyPoint = Math.max(0, budgetPerDay) * rate;
  const dailyMin = Math.round(dailyPoint * (1 - BAND));
  const dailyMax = Math.round(dailyPoint * (1 + BAND));
  return {
    dailyMin,
    dailyMax,
    totalMin: dailyMin * Math.max(0, durationDays),
    totalMax: dailyMax * Math.max(0, durationDays),
  };
};

export const formatImpressions = (n: number): string => n.toLocaleString('en-US');
