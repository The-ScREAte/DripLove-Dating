# Email Confirmation Flow Documentation

## Overview
This document describes the email confirmation flow implemented in the DripLove dating app to ensure users verify their email addresses before they can log in and use the application.

## How It Works

### 1. Registration Process
When a user registers:
1. User fills out the registration form with their email and password
2. The system calls `supabase.auth.signUp()` with the `emailRedirectTo` option
3. Supabase sends a confirmation email to the user's email address
4. **No session is created** until the email is confirmed
5. User sees a message asking them to check their email
6. The form switches to login mode

### 2. Email Confirmation
When the user clicks the confirmation link in their email:
1. They are redirected to `/auth/confirm` with a confirmation token
2. The `EmailConfirmPage` component processes the token
3. If successful, the user's email is marked as confirmed
4. User is redirected to the login page

### 3. Login Process
When a user tries to log in:
1. If their email is not confirmed, login fails with an error
2. The system detects this specific error and offers to resend the confirmation email
3. Once email is confirmed, login proceeds normally

## Key Files

### `/src/components/AuthForm.tsx`
- Handles registration with email confirmation
- Manages login with unconfirmed email detection
- Includes resend confirmation functionality

### `/src/components/EmailConfirmPage.tsx`
- Processes email confirmation tokens
- Provides user feedback during confirmation
- Handles various confirmation states (success, error, already confirmed)

### `/src/config/oauth.ts`
- Contains `getEmailConfirmRedirectUri()` function
- Dynamically generates confirmation URLs for different environments
- Supports both web and mobile app redirects

### `/src/components/AppRoutes.tsx`
- Defines the `/auth/confirm` route for email confirmation

## Configuration

### Supabase Settings
Ensure email confirmation is enabled in your Supabase project:
1. Go to Authentication > Settings
2. Enable "Confirm email" 
3. Set the confirmation URL to point to your app's `/auth/confirm` route

### Environment-Specific URLs
The system automatically generates appropriate redirect URLs:
- **Localhost**: `http://localhost:PORT/auth/confirm`
- **Production**: `https://yourdomain.com/auth/confirm`
- **Mobile**: `driplove://auth/confirm`

## Testing the Flow

### Manual Testing
1. Register a new account with a real email address
2. Check that no automatic login occurs
3. Check your email for the confirmation link
4. Click the confirmation link
5. Verify you're redirected to the confirmation page
6. Try to login and confirm it works

### Expected Behavior
- ✅ Registration creates user but no active session
- ✅ Confirmation email is sent automatically
- ✅ Login fails for unconfirmed emails with helpful message
- ✅ Confirmation link activates the account
- ✅ Login works after confirmation

## Troubleshooting

### Common Issues
1. **Emails not being sent**: Check Supabase email settings and provider configuration
2. **Confirmation links not working**: Verify the redirect URL matches your route
3. **Mobile app issues**: Ensure custom URL scheme is properly configured

### Debug Logs
The system includes extensive logging:
- Check browser console for registration and confirmation logs
- Look for `[Registration]` and `[Email Confirmation]` prefixed messages

## Security Considerations

1. **Email Verification Required**: Users cannot access the app without confirming their email
2. **Token Validation**: Confirmation tokens are validated server-side by Supabase
3. **No Credential Storage**: No sensitive data is stored in the confirmation flow
4. **Rate Limiting**: Supabase provides built-in rate limiting for email sends

## Future Enhancements

1. **Resend UI**: Add a dedicated resend confirmation button to the login form
2. **Email Templates**: Customize the confirmation email template in Supabase
3. **Mobile Deep Links**: Improve mobile app deep linking for confirmation
4. **Analytics**: Track confirmation rates and optimize the flow
