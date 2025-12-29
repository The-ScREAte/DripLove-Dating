# Exchange Rate Service

This service provides real-time currency conversion using the free exchangerate-api.com API.

## Features

- **Real-time Exchange Rates**: Fetches current exchange rates from exchangerate-api.com
- **24-Hour Caching**: Caches rates in localStorage for 24 hours to minimize API calls
- **Automatic Fallback**: Falls back to approximate rates if API is unavailable
- **Free Tier**: Uses free API with 1,500 requests/month limit

## Usage

### Convert to GHS (Ghanaian Cedis)

```typescript
import { convertToGHS } from '@/services/exchangeRateService';

// Convert $5 USD to GHS
const ghsAmount = await convertToGHS(5, 'USD');
console.log(`₵${ghsAmount}`); // e.g., ₵80
```

### Get Exchange Rate

```typescript
import { getExchangeRate } from '@/services/exchangeRateService';

// Get USD to GHS exchange rate
const rate = await getExchangeRate('USD', 'GHS');
console.log(`1 USD = ${rate} GHS`); // e.g., 1 USD = 16.2 GHS
```

### Convert Any Currency

```typescript
import { convertCurrency } from '@/services/exchangeRateService';

// Convert 100 EUR to GBP
const gbpAmount = await convertCurrency(100, 'EUR', 'GBP');
console.log(`£${gbpAmount}`);
```

### Preload Exchange Rates

```typescript
import { preloadExchangeRates } from '@/services/exchangeRateService';

// Call on app initialization to cache rates in background
preloadExchangeRates();
```

### Clear Cache

```typescript
import { clearExchangeRateCache } from '@/services/exchangeRateService';

// Clear cached rates (useful for testing or manual refresh)
clearExchangeRateCache();
```

## API Information

- **API**: https://api.exchangerate-api.com/v4/latest
- **Free Tier**: 1,500 requests/month
- **No API Key Required**: The free endpoint doesn't need authentication
- **Rate Limit**: No strict rate limiting on free tier

## Caching Strategy

- Exchange rates are cached in localStorage for **24 hours**
- Cache key: `exchange_rates_cache`
- Cache includes:
  - Exchange rates for all currencies
  - Base currency (usually USD)
  - Timestamp of when rates were fetched

## Fallback Rates

If the API is unavailable, the service falls back to these approximate rates to GHS:

```typescript
{
  USD: 16,
  EUR: 17,
  GBP: 20,
  NGN: 0.01,
  ZAR: 0.85,
  KES: 0.12,
  GHS: 1
}
```

## Integration Points

The exchange rate service is integrated into:

1. **usePricingConfig.ts**: Converts IAP prices to GHS for Paystack payments
2. **Index.tsx**: Preloads exchange rates on app initialization
3. **PremiumUpgrade.tsx**: Uses GHS prices for payment processing

## Error Handling

- API failures gracefully fall back to approximate rates
- All errors are logged to console with `[ExchangeRate]` prefix
- The app continues to function even if exchange rate fetching fails

## Performance

- **First Load**: Makes 1 API call, caches for 24 hours
- **Subsequent Loads**: Uses cached rates (no API calls)
- **Cache Hit Rate**: ~99% for typical user sessions
- **API Response Time**: ~200-500ms

## Testing

To test with fresh rates:

```typescript
import { clearExchangeRateCache, getExchangeRate } from '@/services/exchangeRateService';

// Clear cache
clearExchangeRateCache();

// Get fresh rates
const rate = await getExchangeRate('USD', 'GHS');
console.log('Fresh rate:', rate);
```

## Notes

- Exchange rates update daily on the API
- The 24-hour cache is sufficient for payment processing
- For critical financial applications, consider upgrading to a paid API with more frequent updates
