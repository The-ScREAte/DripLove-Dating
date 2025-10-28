# Firebase Admin SDK Setup

## ✅ Setup Complete!

Your Firebase Admin SDK has been successfully configured for the project `time-tracking-b70af`.

## 📁 Project Structure

```
server/
  ├── config/
  │   └── serviceAccountKey.json  (🔒 Protected by .gitignore)
  ├── index.js                    (Firebase Admin initialized)
  └── package.json                (firebase-admin dependency added)
```

## 🔐 Security

- ✅ Service account credentials stored in `server/config/serviceAccountKey.json`
- ✅ File added to `.gitignore` to prevent committing to GitHub
- ⚠️ **NEVER** commit this file to version control

## 🚀 How to Use

### Start the Server

```bash
cd server
npm start
```

Or directly:

```bash
cd server
node index.js
```

### Test Firebase Connection

Once the server is running, visit:
```
http://localhost:3001/firebase-test
```

This endpoint will:
- Write a test document to Firestore
- Return success confirmation
- Verify Firebase Admin is working correctly

### Using Firebase Admin in Your Code

Firebase Admin is now available throughout your application:

```javascript
const admin = require('firebase-admin');

// Access Firestore
const db = admin.firestore();

// Access Authentication
const auth = admin.auth();

// Access Cloud Messaging
const messaging = admin.messaging();
```

## 📋 Available Endpoints

- `POST /verify-apple-receipt` - Apple IAP receipt validation
- `GET /firebase-test` - Test Firebase connectivity

## 🌐 Production Deployment

For production environments (Vercel, Render, Supabase Edge Functions), use environment variables:

### 1. Set environment variable:

```bash
export FIREBASE_CREDENTIALS='{"type": "service_account", "project_id": "time-tracking-b70af", ...}'
```

### 2. Update code to use environment variable:

```javascript
let serviceAccount;
if (process.env.FIREBASE_CREDENTIALS) {
  // Production: Load from environment variable
  serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
} else {
  // Development: Load from file
  serviceAccount = require('./config/serviceAccountKey.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
```

## 📦 Installed Dependencies

- `firebase-admin@^12.0.0` - Official Firebase Admin SDK

## 🔥 Firebase Project Info

- **Project ID**: `time-tracking-b70af`
- **Service Account**: `firebase-adminsdk-fbsvc@time-tracking-b70af.iam.gserviceaccount.com`

## ⚠️ Important Notes

1. Keep your service account key secure
2. Never share or commit credentials
3. Rotate keys regularly for security
4. Use environment variables in production
5. Monitor Firebase console for usage

## 🆘 Troubleshooting

If you see authentication errors:
1. Verify `serviceAccountKey.json` exists in `server/config/`
2. Check file permissions
3. Ensure Firebase Admin is installed: `npm install firebase-admin`
4. Verify project ID matches in Firebase Console

## 📚 Resources

- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Service Account Keys](https://cloud.google.com/iam/docs/service-account-creds)
- [Firebase Security Best Practices](https://firebase.google.com/docs/admin/setup#initialize-sdk)
