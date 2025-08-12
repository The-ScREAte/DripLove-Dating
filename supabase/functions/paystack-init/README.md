# paystack-init (Supabase Edge Function)

Initializes a Paystack transaction server-side using your secret key. Prevents client-side key exposure and avoids inline.js "Please enter a valid Key" errors caused by key/plan/currency mismatches.

## Environment Variables
- PAYSTACK_SECRET_KEY (required) — your Paystack Secret key (test/live to match mode)

## Request (POST)
```
{
  "email": "user@example.com",
  "amount": 50,            // in major units for one-time
  "currency": "GHS",
  "plan": "PLN_xxx",      // omit amount/currency if plan is provided
  "channels": ["card", "mobile_money"],
  "metadata": { },
  "callback_url": "https://your.app/payment-success"
}
```

## Response
```
{
  "ok": true,
  "authorization_url": "https://checkout.paystack.com/...",
  "access_code": "...",
  "reference": "..."
}
```

