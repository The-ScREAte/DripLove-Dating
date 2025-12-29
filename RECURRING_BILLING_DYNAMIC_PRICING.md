# Paystack Recurring Billing - Dynamic Pricing Update

## Problem Identified

Previously, the recurring billing system had a **static pricing issue**:

### Old Behavior:
```typescript
// First payment: User pays $5 USD → ₵80 GHS (exchange rate: 16)
// Authorization saved with: default_amount = 8000 kobo

// 30 days later - recurring charge:
// ❌ Still charges 8000 kobo (₵80 GHS)
// ❌ Even if admin changed price to $6 USD
// ❌ Even if exchange rate changed to 17 (should be ₵102)
```

**Issues:**
1. Price locked at first payment amount
2. No exchange rate updates
3. Admin pricing changes ignored for existing subscriptions

## New Behavior

### Dynamic Pricing with Current Exchange Rates:
```typescript
// First payment: User pays $5 USD → ₵80 GHS (rate: 16)

// Admin changes price to $6 USD

// 30 days later - recurring charge:
// ✅ Fetches current admin price: $6 USD
// ✅ Gets current exchange rate: 1 USD = 17 GHS
// ✅ Calculates: $6 × 17 = ₵102 GHS
// ✅ Charges ₵102 GHS (10,200 kobo)
```

## Implementation Details

### Functions Added to `paystack-recurring-billing/index.ts`:

#### 1. `getExchangeRate(fromCurrency, toCurrency)`
```typescript
// Fetches real-time exchange rates from exchangerate-api.com
// Same API used by the frontend
// Returns rate or null if API fails
```

#### 2. `getCurrentPricing(supabase)`
```typescript
// Fetches current pricing from payment_config table
// Gets: default_international_price, default_international_currency
// Converts to GHS using current exchange rate
// Returns: { price, currency, ghsAmount }
```

### Billing Process Flow:

```typescript
1. Cron runs paystack-recurring-billing function

2. Fetch current pricing ONCE for all subscriptions:
   - Admin configured: $5 USD
   - Current exchange rate: 16.2 GHS/USD
   - Calculated amount: ₵81 GHS

3. For each subscription due for renewal:
   - Get user's saved authorization_code
   - Use CURRENT pricing (₵81 GHS = 8,100 kobo)
   - Charge via Paystack charge_authorization API
   
4. On success:
   - Record payment with current amount
   - Extend subscription 30 days
```

## Key Changes in Code:

### Before:
```typescript
// Used saved amount from first payment
amount: authData.default_amount,
currency: authData.default_currency,
```

### After:
```typescript
// Get current pricing (once per billing run)
const currentPricing = await getCurrentPricing(supabase)

// Calculate current GHS amount
const chargeAmountGHS = currentPricing.ghsAmount
const chargeAmountKobo = chargeAmountGHS * 100

// Use current pricing for charge
amount: chargeAmountKobo, // Fresh calculation
currency: 'GHS',
```

## Metadata Tracking

Charges now include metadata showing the pricing source:

```typescript
metadata: {
  pricing_source: "5 USD (current admin pricing)",
  ghs_amount: 81,
  renewal: true
}
```

This helps with:
- Debugging billing issues
- Tracking price changes over time
- Auditing charge amounts

## Fallback Protection

If the exchange rate API fails:

```typescript
// Fallback rates (same as frontend)
const fallbackRates = {
  USD: 16,
  EUR: 17,
  GBP: 20
}
```

The system will still function using approximate rates.

## Benefits

### ✅ For Admins:
- Change pricing once in admin panel
- Applies to ALL future recurring charges
- No need to manually update each subscription

### ✅ For Users:
- Always charged current market price
- Fair pricing with updated exchange rates
- Transparent pricing

### ✅ For Business:
- Can adjust pricing based on market conditions
- Exchange rate fluctuations handled automatically
- Revenue stays aligned with costs

## Example Scenarios

### Scenario 1: Admin Increases Price
```
Month 1: Admin sets $5 → charges ₵80 (rate: 16)
Month 2: Admin changes to $6 → charges ₵96 (rate: 16)
Month 3: Admin changes to $7 → charges ₵112 (rate: 16)
```

### Scenario 2: Exchange Rate Changes
```
Month 1: $5 @ rate 16 → charges ₵80
Month 2: $5 @ rate 17 → charges ₵85
Month 3: $5 @ rate 15 → charges ₵75
```

### Scenario 3: Both Change
```
Month 1: $5 @ rate 16 → charges ₵80
Month 2: $6 @ rate 17 → charges ₵102
Month 3: $7 @ rate 18 → charges ₵126
```

## Database Impact

### `paystack_charge_attempts` table:
- `amount` - Now reflects current pricing (in kobo)
- `currency` - Always 'GHS'

### `subscription_payments` table:
- `amount` - Current GHS amount charged
- `currency` - Always 'GHS'

### No Changes to:
- `paystack_authorizations` - Still stores original authorization_code
- `user_subscriptions` - Still tracks subscription status

## Testing

To test the dynamic pricing:

1. Set admin price to $5 USD
2. User subscribes → first charge ₵80 (assuming rate 16)
3. Change admin price to $10 USD
4. Manually trigger billing: Admin page → "Run Recurring Billing"
5. Check `subscription_payments` → should see ₵160 charged

## Important Notes

⚠️ **First Payment**: Still uses exchange rate at time of payment  
✅ **Recurring Charges**: Use current admin price + current exchange rate  
📊 **Audit Trail**: All charges logged in `subscription_payments`  
🔄 **Rate Refresh**: Exchange rates fetched fresh each billing run (typically daily)  

## Summary

The recurring billing system now:
1. **Fetches current admin pricing** from `payment_config`
2. **Gets current exchange rates** from exchangerate-api.com
3. **Calculates fresh GHS amount** on each billing cycle
4. **Charges the calculated amount** instead of saved amount

This ensures pricing stays current and reflects both admin changes and market exchange rates!
