// Apple IAP receipt validation endpoint for your backend
// This is a minimal Express server example

const express = require('express');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
const path = require('path');
const dotenv = require('dotenv');
const emailRoutes = require('./routes/emailRoutes');

// Load env files for local/server execution (later files can override earlier ones)
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });

function loadServiceAccount() {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try {
      const parsed = JSON.parse(envJson);
      if (parsed.private_key && parsed.private_key.includes('\\n')) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (error) {
      console.error('❌ Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
    }
  }

  // Backward compatibility for existing local setups
  const fileCandidates = [
    path.join(__dirname, 'config', 'serviceAccountKey.json'),
    path.join(__dirname, 'config', 'serviceAccountKey-new.json'),
  ];

  for (const filePath of fileCandidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(filePath);
    } catch {
      // Try the next candidate
    }
  }

  return null;
}

const serviceAccount = loadServiceAccount();
let firebaseReady = false;

if (serviceAccount) {
  // Initialize Firebase Admin SDK
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  firebaseReady = true;
}

if (firebaseReady) {
  console.log('✅ Firebase Admin initialized successfully');
} else {
  console.warn('⚠️ Firebase Admin not initialized (service account missing)');
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const allowedOrigin = process.env.EMAIL_ALLOWED_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-email-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

app.use('/api/email', emailRoutes);

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
  if (!firebaseReady) {
    return res.status(503).json({
      success: false,
      error: 'Firebase Admin is not initialized',
    });
  }

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
