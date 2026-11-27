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

const crypto = require('crypto');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// Security headers (this server only serves JSON APIs).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// CORS: only the configured origins (comma separated EMAIL_ALLOWED_ORIGIN).
// These endpoints are server-to-server (API key), so no wildcard.
const allowedOrigins = (process.env.EMAIL_ALLOWED_ORIGIN || '')
  .split(',').map((o) => o.trim()).filter((o) => o && o !== '*');
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-email-api-key');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Minimal in-memory rate limiter (per IP): 60 requests / minute.
const hits = new Map();
setInterval(() => hits.clear(), 60 * 1000).unref();
app.use((req, res, next) => {
  const ip = req.ip || 'unknown';
  const n = (hits.get(ip) || 0) + 1;
  hits.set(ip, n);
  if (n > 60) return res.status(429).json({ error: 'Too many requests' });
  next();
});

function safeEqual(a, b) {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
// Internal endpoints require x-api-key equal to INTERNAL_API_KEY (disabled when unset).
function requireInternalKey(req, res, next) {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return res.status(503).json({ error: 'Endpoint disabled' });
  if (!safeEqual(req.header('x-api-key'), key)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.use('/api/email', emailRoutes);

const APPLE_PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

// POST /verify-apple-receipt
app.post('/verify-apple-receipt', requireInternalKey, async (req, res) => {
  const { receiptData } = req.body || {};
  if (!receiptData || typeof receiptData !== 'string' || receiptData.length > 2000000) {
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
app.get('/firebase-test', requireInternalKey, async (req, res) => {
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
      error: 'Firebase check failed'
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Apple IAP receipt validator running on port ${PORT}`);
});
