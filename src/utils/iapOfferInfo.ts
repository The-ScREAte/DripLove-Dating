// Reads the free-trial length and post-trial price directly off the native
// store's own offer data (cordova-plugin-purchase's `product.offers[].
// pricingPhases[]`) instead of hardcoding a trial length anywhere - whatever
// is actually configured in App Store Connect / Google Play Console is what
// gets shown, so changing the trial length there needs no app update.

export interface FreeTrialOfferInfo {
  hasFreeTrial: boolean;
  trialDays: number | null;
  /** Human label in the store's own unit, e.g. "7 days", "1 week", "1 month" */
  trialPeriodLabel: string;
  /** Store-formatted price for after the trial ends, e.g. "$4.99" */
  priceAfterTrial: string | null;
}

const EMPTY_OFFER_INFO: FreeTrialOfferInfo = {
  hasFreeTrial: false,
  trialDays: null,
  trialPeriodLabel: '',
  priceAfterTrial: null,
};

// Trial pricing phases are always a single unit (StoreKit/Play Billing never
// emit combined durations like "P1Y2M" for an intro/trial phase), so a
// single-unit ISO 8601 duration parser covers every real case.
const parseIsoDuration = (period?: string): { value: number; unit: string } | null => {
  if (!period) return null;
  const match = /^P(\d+)([DWMY])$/.exec(period.trim().toUpperCase());
  if (!match) return null;
  const value = parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, unit: match[2] };
};

const daysForUnit = (value: number, unit: string): number => {
  switch (unit) {
    case 'D': return value;
    case 'W': return value * 7;
    case 'M': return value * 30;
    case 'Y': return value * 365;
    default: return value;
  }
};

const labelForUnit = (value: number, unit: string): string => {
  const plural = value === 1 ? '' : 's';
  switch (unit) {
    case 'D': return `${value} day${plural}`;
    case 'W': return `${value} week${plural}`;
    case 'M': return `${value} month${plural}`;
    case 'Y': return `${value} year${plural}`;
    default: return `${value} day${plural}`;
  }
};

interface PricingPhaseLike {
  price?: string;
  billingPeriod?: string;
  paymentMode?: string;
}
interface OfferLike {
  pricingPhases?: PricingPhaseLike[];
}
interface ProductLike {
  offers?: OfferLike[];
  getOffer?: () => OfferLike | undefined;
}

const productHasFreeTrialOffer = (product: ProductLike | null | undefined): boolean => {
  if (!product) return false;
  const offers: OfferLike[] = Array.isArray(product.offers) ? product.offers : [];
  return offers.some((o) => (o.pricingPhases || []).some((p) => p.paymentMode === 'FreeTrial'));
};

interface PurchasableProductLike extends ProductLike {
  canPurchase?: boolean;
}

/**
 * Single source of truth (both platforms) for "which of our several product
 * IDs do we actually mean right now" - used identically by the trial/price
 * display (useFreeTrialOffer, usePricingConfig) and the real purchase calls
 * (buyMonthly, buyGoogleMonthly), so none of them can ever point at a
 * different product than the others. Previously the display code picked the
 * first *registered* product (store.get(id) truthy, regardless of
 * purchasability) while the purchase calls picked the first *purchasable*
 * one - on accounts where those differed (most visibly on iOS, which has two
 * real products at different prices), the app showed a price/trial for one
 * product and then charged for a completely different one. Only ever
 * consider purchasable products, and among those prefer whichever one
 * actually carries a free-trial offer.
 */
export const selectPurchasableProduct = <T extends PurchasableProductLike>(
  getProduct: (id: string) => T | null | undefined,
  productIds: string[]
): T | undefined => {
  const purchasable = productIds
    .map((id) => getProduct(id))
    .filter((p): p is T => !!p && !!p.canPurchase);
  if (purchasable.length === 0) return undefined;
  return purchasable.find((p) => productHasFreeTrialOffer(p)) ?? purchasable[0];
};

export const extractFreeTrialOfferInfo = (product: ProductLike | null | undefined): FreeTrialOfferInfo => {
  if (!product) return EMPTY_OFFER_INFO;

  const offers: OfferLike[] = Array.isArray(product.offers) && product.offers.length > 0
    ? product.offers
    : (() => {
        const shortcut = product.getOffer?.();
        return shortcut ? [shortcut] : [];
      })();

  for (const offer of offers) {
    const phases = offer.pricingPhases || [];
    const trialPhase = phases.find((p) => p.paymentMode === 'FreeTrial');
    if (!trialPhase) continue;

    const parsed = parseIsoDuration(trialPhase.billingPeriod);
    if (!parsed) continue;

    const payPhase = phases.find((p) => p.paymentMode === 'PayAsYouGo' || p.paymentMode === 'UpFront');

    return {
      hasFreeTrial: true,
      trialDays: daysForUnit(parsed.value, parsed.unit),
      trialPeriodLabel: labelForUnit(parsed.value, parsed.unit),
      priceAfterTrial: payPhase?.price ?? null,
    };
  }

  return EMPTY_OFFER_INFO;
};
