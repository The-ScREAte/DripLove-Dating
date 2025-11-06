# Language Detection & Persistence Implementation

## Overview
Implemented a comprehensive language detection and persistence system for DripLove that:
- Auto-detects user's region/language when not authenticated
- Displays language selector on welcome screen
- Saves language preference in session storage for non-authenticated users
- Saves language preference to database when user logs in
- Loads saved language preference automatically on subsequent logins

## Files Created/Modified

### New Files
1. **`/src/components/GlobalLanguageSelector.tsx`**
   - Dropdown component with 7 language options (EN, FR, DE, ZH, SW, PT, AR)
   - Two variants: `welcome` (for welcome screen) and `default` (for general use)
   - Saves to sessionStorage and database (if user authenticated)
   - Shows language flag and name with checkmark for current selection

2. **`/src/utils/languageDetection.ts`**
   - `detectAndSetLanguage()`: Main function that detects language from:
     - Database (for authenticated users) - Priority 1
     - Session storage - Priority 2
     - Geographic location (IP-based) - Priority 3
     - Browser language - Priority 4
     - Default to English - Priority 5
   - `detectLanguageFromLocation()`: Uses ipapi.co API to get country from IP
   - `detectBrowserLanguage()`: Extracts language from navigator.language
   - `saveLanguageToDatabase()`: Saves preference to profiles table
   - `loadUserLanguagePreference()`: Loads preference from profiles table

### Modified Files
1. **`/src/components/WelcomeScreen.tsx`**
   - Added GlobalLanguageSelector component next to Privacy Policy link
   - Language selector appears in footer with other legal links

2. **`/src/i18n/config.ts`**
   - Updated detection order: `querystring → sessionStorage → localStorage → navigator`
   - Set initial language from sessionStorage if available
   - Added sessionStorage to caches array

3. **`/src/components/MainApp.tsx`**
   - Enhanced language loading on mount
   - Loads from database for authenticated users
   - Falls back to session storage if no DB preference
   - Saves session preference to DB on first login

4. **`/src/pages/Index.tsx`**
   - Calls `detectAndSetLanguage()` on mount for non-authenticated users
   - Ensures language is detected based on user's region

5. **`/src/components/AuthForm.tsx`**
   - Saves session language preference to database on login
   - Ensures language persists after authentication

6. **`/src/integrations/supabase/types.ts`**
   - Added `preferred_language` field to profiles table types
   - Updated Row, Insert, and Update interfaces

### Database
**Migration**: `supabase/migrations/20251106000000_add_preferred_language.sql`
- Adds `preferred_language` column to profiles table
- Default value: 'en'
- Type: VARCHAR(10)
- Indexed for performance

## How It Works

### For Non-Authenticated Users
1. User visits welcome screen
2. System detects language from:
   - Geographic location (IP) → Country mapping
   - Browser language settings
3. Language preference saved to sessionStorage
4. User can manually change language via selector
5. Language persists during session

### For Authenticated Users
1. User logs in
2. System loads language preference from database
3. If no DB preference exists:
   - Checks sessionStorage for selection made before login
   - Saves to database for future visits
4. User can change language anytime via:
   - WelcomeScreen language selector
   - ProfilePage language selector (existing)
5. Changes saved to both sessionStorage and database

## Language Detection Priority
```
1. Database (authenticated users only)
2. Session Storage
3. Geographic Location (IP → Country → Language)
4. Browser Language
5. English (default)
```

## Country → Language Mapping
- **English**: US, UK, Canada, Australia, Nigeria, Ghana, etc.
- **French**: France, Belgium, Senegal, Cameroon, etc.
- **German**: Germany, Austria, Liechtenstein
- **Chinese**: China, Taiwan, Hong Kong, Singapore
- **Swahili**: Kenya, Tanzania, Uganda
- **Portuguese**: Portugal, Brazil, Angola, Mozambique
- **Arabic**: Saudi Arabia, UAE, Egypt, Morocco, etc.

## API Used
- **ipapi.co**: Free IP geolocation API
  - Timeout: 3 seconds
  - Fallback: Browser language or English
  - No API key required

## Session Storage Keys
- `preferredLanguage`: Stores user's language preference

## Database Schema
```sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en';

CREATE INDEX IF NOT EXISTS idx_profiles_preferred_language 
ON public.profiles(preferred_language);
```

## UI Components
- **Welcome Screen**: Language selector in footer (right side)
- **Profile Page**: Existing language selector (unchanged)
- Both components sync via database and sessionStorage

## Testing Recommendations
1. Test language auto-detection from different countries
2. Test language persistence across sessions
3. Test language sync between session and database
4. Test language selector on welcome screen
5. Test that DB preference overrides other settings

## Notes
- Language preference is personal and user-specific
- Changes made before login are saved after authentication
- System gracefully falls back if geolocation fails
- All 7 languages fully supported across entire app
