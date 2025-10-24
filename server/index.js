// Apple IAP receipt validation endpoint for your backend
// This is a minimal Express server example

const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

// POST /verify-apple-receipt
app.post('/verify-apple-receipt', async (req, res) => {
  const { receiptData } = req.body;
  if (!receiptData) {
    return res.status(400).json({ error: 'Missing receiptData' });
  }

  // Helper to call Apple endpoint
  async function callApple(url) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'receipt-data': receiptData })
    });
    return response.json();
  }

  // 1. Try production first
  let result = await callApple(APPLE_PRODUCTION_URL);
  if (result.status === 21007) {
    // 2. If sandbox receipt, try sandbox endpoint
    result = await callApple(APPLE_SANDBOX_URL);
  }

  res.json(result);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Apple IAP receipt validator running on port ${PORT}`);
});
