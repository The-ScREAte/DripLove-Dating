// Apple IAP receipt validation endpoint for your backend
// This is a minimal Express server example

const express = require('express');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = require('./config/serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

console.log('✅ Firebase Admin initialized successfully');

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

// GET /firebase-test - Test Firebase connection
app.get('/firebase-test', async (req, res) => {
  try {
    const db = admin.firestore();
    const docRef = db.collection('test').doc('connection-check');
    await docRef.set({ 
      initialized: true, 
      timestamp: new Date(),
      message: 'Firebase Admin SDK is working!' 
    });
    
    const doc = await docRef.get();
    res.json({ 
      success: true, 
      message: '✅ Firebase is working!',
      data: doc.data() 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Apple IAP receipt validator running on port ${PORT}`);
});
