# OAuth Setup Instructions for Google and Facebook

## ⚠️ IMPORTANT: Port Configuration
**The application MUST run on port 8080** for OAuth to work properly. The OAuth providers are configured to redirect to `http://localhost:8080`. 

- ✅ Correct: `http://localhost:8080`
- ❌ Incorrect: `http://localhost:8081` or any other port

## Overview
This guide explains how to set up Google and Facebook OAuth authentication in your Supabase project to work with the new authentication flow.

## Current Implementation

### Frontend Changes Made:
1. **AuthForm Component** - Added Google and Facebook OAuth buttons
2. **ProfileCompletionForm** - New component for completing required profile fields for OAuth users
3. **Index.tsx** - Enhanced auth flow to handle OAuth users and profile completion

### Required Supabase Configuration:

## 1. Google OAuth Setup

### Step 1: Create Google OAuth App
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - `https://tgjsyyihabsovironesw.supabase.co/auth/v1/callback`
   - `http://localhost:8080/auth/callback` (for local development)

### Step 2: Configure in Supabase
1. Go to your Supabase dashboard
2. Navigate to Authentication → Providers
3. Enable Google provider
4. Enter your Google OAuth credentials:
   - **Client ID**: From Google Cloud Console
   - **Client Secret**: From Google Cloud Console
5. Save the configuration

## 2. Facebook OAuth Setup

### Step 1: Create Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app
3. Add Facebook Login product
4. Configure Facebook Login settings:
   - Valid OAuth Redirect URIs: `https://tgjsyyihabsovironesw.supabase.co/auth/v1/callback`
   - Client OAuth Login: Yes
   - Web OAuth Login: Yes

### Step 2: Configure in Supabase
1. Go to your Supabase dashboard
2. Navigate to Authentication → Providers
3. Enable Facebook provider
4. Enter your Facebook app credentials:
   - **App ID**: From Facebook App Dashboard
   - **App Secret**: From Facebook App Dashboard
5. Save the configuration

## 3. Database Schema Requirements

The current database schema already supports OAuth users. The required fields are:
- `first_name` *
- `last_name` *
- `email` *
- `date_of_birth` *
- `country` *
- `city` *
- `gender` *
- `preference` *
- `relationship_intent` *
- `occupation` *
- `industry` *
- `education_level` *

(*) = Required fields that OAuth users must complete

## 4. Authentication Flow

### New OAuth Flow:
1. User clicks "Continue with Google" or "Continue with Facebook"
2. OAuth authentication happens via Supabase
3. User is redirected back to the app
4. App checks if user profile is complete
5. If incomplete, user is shown the ProfileCompletionForm
6. After completion, user is redirected to the main app

### Existing Email/Password Flow:
- Remains unchanged
- Users can still register/login with email and password
- All existing functionality is preserved

## 5. Testing OAuth Integration

### Local Development:
1. Configure OAuth providers in Supabase dashboard
2. Start the development server: `npm run dev`
3. Navigate to `http://localhost:8080`
4. Click on Google or Facebook buttons to test

### Production:
1. Update OAuth redirect URIs to use your production domain
2. Deploy the application
3. Test OAuth flow in production environment

## 6. Security Considerations

- OAuth tokens are handled securely by Supabase
- User profile completion is mandatory for OAuth users
- Account status checks are maintained (blocked/on_hold)
- All existing security measures are preserved

## 7. User Experience

### For OAuth Users:
1. Quick sign-in with Google/Facebook
2. One-time profile completion
3. Access to full app functionality

### For Email Users:
1. Traditional email/password registration
2. Complete profile during registration
3. Direct access to app

## 8. Error Handling

The implementation includes comprehensive error handling for:
- OAuth authentication failures
- Profile completion errors
- Network connectivity issues
- Database errors
- Account status validation

## 9. Migration Notes

- Existing users are not affected
- No database migrations required
- OAuth functionality is additive to existing auth system
- All existing features continue to work normally

## Next Steps

1. Configure OAuth providers in Supabase dashboard
2. Test the OAuth flow in development
3. Update production OAuth settings
4. Monitor user registration patterns
5. Collect user feedback on the new auth options

## Support

If you encounter any issues:
1. Check Supabase dashboard for OAuth configuration
2. Verify redirect URIs are correctly set
3. Test OAuth flow in incognito/private browsing mode
4. Check browser console for any JavaScript errors
