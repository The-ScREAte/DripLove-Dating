import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';
import { selectPurchasableProduct } from '@/utils/iapOfferInfo';
import { toast } from '@/components/ui/sonner';

const noopLog = (..._args: unknown[]) => {};

// Detect platform
const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const isIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

// Check if we're already on the payment success page (prevents redirect loops)
function isOnPaymentSuccessPage(): boolean {
  try {
    return window.location.pathname === '/payment-success';
  } catch {
    return false;
  }
}

// Mark that we've completed a payment successfully (prevents re-redirect on page reload)
function markPaymentCompleted() {
  try {
    localStorage.setItem('driplove_iap_completed', '1');
    localStorage.setItem('driplove_iap_completed_ts', String(Date.now()));
  } catch {
    // ignore
  }
}

// Check if payment was recently completed (within 5 minutes)
function wasPaymentRecentlyCompleted(): boolean {
  try {
    const completed = localStorage.getItem('driplove_iap_completed');
    const ts = localStorage.getItem('driplove_iap_completed_ts');
    if (completed === '1' && ts) {
      const elapsed = Date.now() - Number(ts);
      // Consider completed if within 5 minutes
      return elapsed < 5 * 60 * 1000;
    }
  } catch {
    // ignore
  }
  return false;
}

// GAP FIX: window.iapPurchaseInitiated is an in-memory flag - it's lost the
// instant the app is closed or the page reloads. If the network drops (or
// the user backgrounds/closes the app) in the moment right after paying,
// Apple's transaction queue still redelivers that approved-but-unfinished
// transaction on next launch (that's the whole point of the queue), but by
// then window.iapPurchaseInitiated is back to false - so .approved() used to
// treat it as "not user-initiated" and just call t.finish(), discarding the
// one chance to validate it. The user was charged and nothing ever showed.
// Persisting the same intent as a short-lived localStorage flag (mirroring
// the pattern already used on the Android side, iap-google.ts) survives
// exactly that gap, so the redelivered transaction still gets validated.
const IAP_PENDING_KEY = 'driplove_iap_pending';
const IAP_PENDING_TS_KEY = 'driplove_iap_pending_ts';
const IAP_PENDING_TTL_MS = 15 * 60 * 1000;

function markIapPending() {
  try {
    localStorage.setItem(IAP_PENDING_KEY, '1');
    localStorage.setItem(IAP_PENDING_TS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function clearIapPending() {
  try {
    localStorage.removeItem(IAP_PENDING_KEY);
    localStorage.removeItem(IAP_PENDING_TS_KEY);
  } catch {
    // ignore
  }
}

function hasRecentIapPending(): boolean {
  try {
    const pending = localStorage.getItem(IAP_PENDING_KEY) === '1';
    const tsRaw = localStorage.getItem(IAP_PENDING_TS_KEY);
    const ts = tsRaw ? Number(tsRaw) : 0;
    const isRecent = pending && Number.isFinite(ts) && ts > 0 && (Date.now() - ts) < IAP_PENDING_TTL_MS;
    if (pending && !isRecent) clearIapPending();
    return isRecent;
  } catch {
    return false;
  }
}

// GAP FIX: the validator can reject a receipt because the underlying
// Apple/Google subscription is already linked to a DIFFERENT account (see
// prevent_shared_iap_subscription). validateReceiptWithServer's `error` can
// be a plain string, an Error, or the parsed {valid:false, error:"..."} body
// from a normal 200 response - this pulls a human message out of whichever
// shape actually came back, so callers can tell that case apart from a
// genuine "nothing to restore" instead of collapsing both into the same
// generic message.
function extractValidationErrorMessage(error: any): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (typeof error?.error === 'string') return error.error;
  if (typeof error?.message === 'string') return error.message;
  return null;
}

// Pull the raw platform receipt (Apple base64 receipt, or Google purchase
// token) directly off a Transaction's parent Receipt. We deliberately never
// call transaction.verify()/store.when().verified() -- that chain only talks
// to a `store.validator`, which we never configure (validation happens in our
// own Supabase edge functions instead). Without a validator configured, the
// plugin's internal ValidatorController treats every receipt as verified
// without ever fetching real data ("for backward compatibility"), so
// anything read off that fake VerifiedReceipt is empty. Reading straight off
// the real Transaction/Receipt objects here is the only way to get the raw
// data.
function extractReceiptData(t: any): { receiptData: string | undefined; purchaseToken: string | undefined } {
  if (isAndroid()) {
    const purchaseToken = t?.parentReceipt?.purchaseToken || t?.nativePurchase?.purchaseToken;
    return { receiptData: purchaseToken, purchaseToken };
  }
  const receiptData = t?.parentReceipt?.nativeData?.appStoreReceipt;
  return { receiptData, purchaseToken: undefined };
}

// Find the real Transaction for an owned product among the store's locally
// held receipts. Product has no `.transaction`/`.latestTransaction` field --
// the transaction lives on the Receipt that contains it.
function findTransactionForProduct(store: any, productId: string): any {
  try {
    const receipts = store?.localReceipts || [];
    for (const receipt of receipts) {
      const tx = (receipt.transactions || []).find((t: any) =>
        (t.products || []).some((p: any) => p.id === productId)
      );
      if (tx) return tx;
    }
  } catch (e) {
    console.warn('[IAP] Error finding transaction for product:', productId, e);
  }
  return undefined;
}

// Send a receipt/purchase token to our own server for verification. Shared
// by both a fresh purchase (handleApprovedTransaction) and Restore Purchases,
// so the two paths can never disagree about what counts as "verified".
async function validateReceiptWithServer(
  userId: string,
  productId: string,
  transactionId: string | undefined,
  receiptData: string,
  purchaseToken?: string
): Promise<{ valid: boolean; active: boolean; error?: any }> {
  const { supabase } = await import('@/integrations/supabase/client');
  const validatorFunction = isAndroid() ? 'google-iap-validator' : 'iap-receipt-validator';

  const validationTimeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Receipt validation timeout')), 25000);
  });

  const validationPromise = supabase.functions.invoke(validatorFunction, {
    body: {
      receiptData,
      productId,
      user_id: userId,
      purchaseToken: purchaseToken || transactionId,
      transactionId,
    },
  });

  try {
    const result: any = await Promise.race([validationPromise, validationTimeout]);
    if (result.error || !result.data?.valid || !result.data?.active) {
      return { valid: false, active: false, error: result.error || result.data };
    }
    return { valid: true, active: true };
  } catch (error) {
    return { valid: false, active: false, error };
  }
}

// Validate a purchase's receipt with our server, activate premium, and
// redirect on success. This is the logic that used to live in
// store.when().verified() -- moved here so it can run directly off the
// approved Transaction (which has real receipt data), instead of the fake
// VerifiedReceipt produced by the unconfigured local validator.
async function handleApprovedTransaction(t: any) {
  // GUARD: Prevent redirect if already on payment-success page or recently completed
  if (isOnPaymentSuccessPage() || wasPaymentRecentlyCompleted()) {
    noopLog('[IAP] Already on success page or recently completed, just finishing transaction');
    if (t.finish && typeof t.finish === 'function') t.finish();
    return;
  }

  window.iapPurchaseInitiated = false;

  try {
    const { supabase } = await import('@/integrations/supabase/client');

    const { data: { user } } = await supabase.auth.getUser();

    let userId = user?.id;
    if (!userId) {
      try {
        const storedUserId = localStorage.getItem('driplove_iap_user_id');
        if (storedUserId) {
          userId = storedUserId;
          noopLog('[IAP] Using stored user_id:', userId);
        }
      } catch (e) {
        // localStorage not available
      }
    }

    if (!userId) {
      console.error('[IAP] No user identification available');
      toast.error('Please log in to complete your purchase.');
      return;
    }

    const productId = t.products?.[0]?.id || '';
    const transactionId = t.transactionId || `iap_${Date.now()}`;

    noopLog('[IAP] Processing approved transaction for user:', userId);
    noopLog('[IAP] Transaction:', { productId, transactionId, platform: isAndroid() ? 'google' : 'apple' });

    const { receiptData, purchaseToken } = extractReceiptData(t);

    if (!receiptData) {
      // No receipt data means we cannot verify this purchase with Apple/Google.
      // Never grant premium without server-side verification -- the client is
      // untrusted and must not be able to write its own entitlement.
      console.warn('[IAP] No receipt data available; cannot verify purchase');
      toast.error('Could not verify your purchase.', {
        description: 'Please use "Restore Purchases" or contact support.',
      });
      return;
    }

    noopLog('[IAP] Receipt data found, attempting server validation...');

    // The validator edge function is the ONLY thing that writes to
    // user_subscriptions for this flow -- it runs with the service-role key
    // after verifying the receipt with Apple/Google. The client never
    // activates premium itself; a database trigger also rejects any
    // client-originated write that grants or extends entitlement.
    const { valid, active, error: validationError } = await validateReceiptWithServer(
      userId, productId, transactionId, receiptData, purchaseToken
    );

    if (!valid || !active) {
      console.warn('[IAP] Server validation failed or subscription inactive:', validationError);
      const message = extractValidationErrorMessage(validationError);
      if (message && message.toLowerCase().includes('already linked')) {
        // Tell them the real reason instead of the generic "try again"
        // message - retrying or restoring will never succeed here, since
        // this specific subscription is tied to a different account. This
        // is the normal, expected outcome when e.g. a friend's phone/Apple
        // ID already subscribes another DripLove account - each account
        // needs its own separate purchase.
        toast.error('This subscription belongs to another account', {
          description: 'The Apple/Google account on this device already has an active DripLove subscription linked to a different account. To subscribe here, use a different Apple/Google ID for this purchase, or contact support.',
          duration: 8000,
        });
      } else {
        toast.error('We could not verify your purchase yet.', {
          description: 'If you were charged, please try "Restore Purchases" in a moment, or contact support.',
          duration: 6000,
        });
      }
      return;
    }

    // If we have a live session for this exact user, double-check the
    // entitlement was actually applied before redirecting (defends against
    // a race where the session switched accounts mid-purchase). This read
    // is RLS-gated to auth.uid() = user_id, so it only works when there IS
    // a live session -- when we fell back to the stored user_id above
    // (session expired mid-purchase), auth.uid() is null and this query
    // would always return nothing, so we skip it and trust the validator's
    // response directly: it already verified the receipt with Apple/Google
    // and wrote the row itself using the service-role key.
    if (user?.id && user.id === userId) {
      const { data: subRow } = await supabase
        .from('user_subscriptions')
        .select('plan_name, status, expires_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const isPremiumNow = !!subRow && subRow.plan_name === 'premium' &&
        (subRow.status === 'active' || subRow.status === 'cancelled') &&
        (!subRow.expires_at || new Date(subRow.expires_at) > new Date());

      if (!isPremiumNow) {
        console.warn('[IAP] Validation ok but subscription not yet applied; skipping redirect');
        toast('Your purchase was verified.', {
          description: 'It may take a moment to appear - please reopen the app shortly.',
        });
        return;
      }
    }

    try { localStorage.removeItem('driplove_iap_user_id'); } catch (e) {}
    clearIapPending();
    markPaymentCompleted();
    if (t.finish && typeof t.finish === 'function') t.finish();
    window.location.href = '/payment-success?status=successful&payment_type=iap';
  } catch (error: any) {
    console.error('[IAP] Error processing approved transaction:', error);
    // Handle error - ensure user doesn't get premium access on failure
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get current payment attempts
        const { data: currentSub } = await supabase
          .from('user_subscriptions')
          .select('payment_attempts')
          .eq('user_id', user.id)
          .single();

        const attempts = (currentSub?.payment_attempts || 0) + 1;

        if (attempts >= 3) {
          // Max attempts reached, deactivate subscription
          await supabase.rpc('handle_payment_failure', {
            p_user_id: user.id,
            p_reason: `IAP verification failed after ${attempts} attempts: ` + error.message
          });
        } else {
          // Increment attempt counter
          await supabase
            .from('user_subscriptions')
            .update({
              payment_attempts: attempts,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
        }
      }
    } catch (fallbackError) {
      console.error('[IAP] Fallback error handling failed:', fallbackError);
    }
    toast.error('Payment processing failed.', { description: 'Please try again or contact support.' });
    if (t.finish && typeof t.finish === 'function') {
      t.finish();
    }
  }
}

export function initIAP() {
  return new Promise<void>((resolve, reject) => {
    
    // If not a Cordova app, resolve immediately
    if (typeof (window as any).cordova === 'undefined') {
      resolve();
      return;
    }

    // Function to initialize the store
    const initializeStore = () => {
      
      // @ts-ignore
      const { store, LogLevel, Platform, ProductType, log } = window.CdvPurchase || {};
      if (!store) {
        console.error('[IAP] CdvPurchase.store not available! StoreKit not loaded.');
        window.iapInitializationFailed = true;
        resolve(); // Resolve to not block app
        return;
      }
      
      // Set log level to ERROR in production to hide technical messages from users
      if (log && LogLevel && typeof log.setLevel === 'function') {
        // Use ERROR level in production, DEBUG only in development
        const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        log.setLevel(isDevelopment ? LogLevel.DEBUG : LogLevel.ERROR);
        noopLog('[IAP] Log level set to:', isDevelopment ? 'DEBUG' : 'ERROR');
        noopLog('[IAP] Environment:', isDevelopment ? 'DEVELOPMENT (StoreKit Testing)' : 'PRODUCTION');
      }

      // Disable automatic error popups from the plugin
      if (store.autoFinishTransactions !== undefined) {
        store.autoFinishTransactions = false;
      }
      
      // Add timeout protection for initialization (15 seconds)
      let initializationTimeout = setTimeout(() => {
        console.error('[IAP] Store initialization timeout after 15 seconds');
        window.iapInitializationFailed = true;
        resolve(); // Resolve to not block app
      }, 15000);
    
    // 1️⃣ Define possible product IDs - try newest first
    const PRODUCT_IDS = [
      'com.driplove.dating.premium.monthlysub3',  // new one linked to this build
      'com.driplove.dating.premium.monthlysub2'   // older one (fallback)
    ];

    // Determine platform for registration
    const currentPlatform = isAndroid() ? Platform.GOOGLE_PLAY : Platform.APPLE_APPSTORE;
    noopLog('[IAP] Registering products for platform:', isAndroid() ? 'GOOGLE_PLAY' : 'APPLE_APPSTORE');
    noopLog('[IAP] Product IDs to register:', PRODUCT_IDS);

    // 2️⃣ Register all of them with the store for the correct platform
    if (store.register && typeof store.register === 'function') {
      const productsToRegister = PRODUCT_IDS.map(id => ({
        id,
        platform: currentPlatform,
        type: ProductType.PAID_SUBSCRIPTION
      }));
      noopLog('[IAP] Registering products:', JSON.stringify(productsToRegister, null, 2));
      store.register(productsToRegister);
      noopLog('[IAP] Products registered, waiting for productUpdated events...');
    } else {
      console.error('[IAP] store.register not available');
      clearTimeout(initializationTimeout);
      window.iapInitializationFailed = true;
      return;
    }

    // 2) Global error handler (covers user cancel + other errors)
    if (store.error && typeof store.error === 'function') {
      store.error(e => {
        // Only log to console, don't show user-facing errors here
        // User-facing errors will be handled in the UI layer
        console.warn('[IAP] Store error:', {
          code: e?.code,
          message: e?.message,
          isSetupError: e?.code === 'SETUP',
          isCommunicationError: e?.code === 'COMMUNICATION'
        });
        
        // Reset loading state on error
        window.iapPurchaseInitiated = false;
        
        // Set flag to indicate connection failed (for UI to handle)
        if (e?.code === 'SETUP' || e?.code === 'COMMUNICATION') {
          console.error('[IAP] Connection to App Store failed. Make sure:', 
            '\n  1. You are running from Xcode (not standalone)',
            '\n  2. StoreKit Configuration is enabled in scheme',
            '\n  3. You are signed out of production App Store'
          );
          window.iapInitializationFailed = true;
        }
      });
    }
    
    // 3) Core lifecycle - using the correct API structure
    if (store.when && typeof store.when === 'function') {
      noopLog('[IAP] Setting up store.when() event handlers...');
      store.when()
        .productUpdated(p => {
          // Product updated successfully - clear initialization timeout
          noopLog('[IAP] productUpdated event received for:', p?.id);
          
          // Check if it's one of our registered products
          const isOurProduct = PRODUCT_IDS.includes(p?.id);
          if (p && isOurProduct) {
            noopLog('[IAP] ✅ Product loaded successfully:', p.id, 'Price:', p.pricing?.price);
            noopLog('[IAP] Product details:', {
              id: p.id,
              title: p.title,
              canPurchase: p.canPurchase,
              owned: p.owned,
              state: p.state
            });
            clearTimeout(initializationTimeout);
            window.iapInitializationFailed = false;
          } else if (p) {
            noopLog('[IAP] Ignoring product (not in our list):', p.id);
          }
        })
        .approved(t => {
          // Only process purchases the user explicitly initiated. We call our
          // own validation directly here (see handleApprovedTransaction)
          // instead of t.verify() -- that goes through store.when().verified(),
          // which only talks to a `store.validator` we never configure, and
          // silently fakes a successful verification with no real receipt data
          // when none is configured.
          //
          // hasRecentIapPending() catches the redelivery case: an approved
          // transaction that never got finished last session (app closed or
          // network dropped right after paying) comes back through this same
          // event on the next launch, in a fresh page load where
          // window.iapPurchaseInitiated has already reset to false.
          if (window.iapPurchaseInitiated || hasRecentIapPending()) {
            handleApprovedTransaction(t);
          } else {
            if (t.finish && typeof t.finish === 'function') {
              t.finish();
            }
          }
        });
    }

    // 4) Initialize AFTER register, then refresh - use correct platform
    if (store.initialize && typeof store.initialize === 'function') {
      try {
        // Initialize for the correct platform
        const initPlatform = isAndroid() ? Platform.GOOGLE_PLAY : Platform.APPLE_APPSTORE;
        const initOptions = isAndroid() 
          ? { platform: initPlatform }
          : { platform: initPlatform, options: { needAppReceipt: true } };
        
        noopLog('[IAP] Calling store.initialize with platform:', initPlatform);
        store.initialize([initOptions]);
        noopLog('[IAP] store.initialize called successfully');
        
        // Add a ready state handler to clear timeout and resolve promise
        if (store.ready && typeof store.ready === 'function') {
          noopLog('[IAP] Setting up store.ready() handler...');
          store.ready(() => {
            noopLog('[IAP] ✅ Store is READY! Products should be loaded now.');
            noopLog('[IAP] Available products:', store.products?.map(p => ({ id: p.id, title: p.title, price: p.pricing?.price })));
            clearTimeout(initializationTimeout);
            window.iapInitializationFailed = false;
            resolve(); // Resolve when store is ready
          });
        } else {
          console.warn('[IAP] store.ready() not available, using timeout fallback');
          // If no ready handler, resolve after a short delay
          setTimeout(() => {
            clearTimeout(initializationTimeout);
            resolve();
          }, 2000);
        }
      } catch (error) {
        console.error('[IAP] Store initialization error:', error);
        clearTimeout(initializationTimeout);
        window.iapInitializationFailed = true;
        resolve(); // Resolve to not block app
        return;
      }
    } else {
      console.error('[IAP] store.initialize not available');
      clearTimeout(initializationTimeout);
      window.iapInitializationFailed = true;
      resolve(); // Resolve to not block app
      return;
    }
    
    if (store.refresh && typeof store.refresh === 'function') {
      try {
        store.refresh();
      } catch (error) {
        console.error('[IAP] Store refresh error:', error);
      }
    } else {
      console.error('[IAP] store.refresh not available');
    }
    };

    // Check if deviceready already fired
    if ((window as any).cordova && (window as any).cordova.platformId) {
      initializeStore();
    } else {
      // Set a timeout for deviceready event (10 seconds)
      const deviceReadyTimeout = setTimeout(() => {
        console.error('[IAP] deviceready event timeout after 10 seconds');
        window.iapInitializationFailed = true;
        resolve(); // Resolve anyway to not block app initialization
      }, 10000);

      document.addEventListener('deviceready', () => {
        clearTimeout(deviceReadyTimeout);
        initializeStore();
      }, { once: true });
    }
  });
}

// 🛍 Call to purchase from your UI - auto-selects the valid product
export const buyMonthly = async () => {
  // List all possible IDs (same as in initIAP) - try newest first
  const PRODUCT_IDS = [
    'com.driplove.dating.premium.monthlysub3',
    'com.driplove.dating.premium.monthlysub2'
  ];
  
  // @ts-ignore
  const store = window.CdvPurchase?.store;
  if (!store) {
    console.error('[IAP] Store not available');
    throw new Error('Store not initialized');
  }
  
  // Store current user_id BEFORE purchase for session-independent activation
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      localStorage.setItem('driplove_iap_user_id', user.id);
      noopLog('[IAP] Stored user_id for purchase:', user.id);
    }
  } catch (e) {
    console.warn('[IAP] Could not store user_id:', e);
  }
  
  window.iapPurchaseInitiated = true;
  markIapPending();

  // Same selection algorithm the trial/price display (useFreeTrialOffer)
  // uses - only ever consider purchasable products, preferring whichever
  // one actually carries a free-trial offer. Previously this loop picked
  // the first purchasable product regardless of trial, while the display
  // picked the first *registered* product regardless of purchasability -
  // on accounts where those disagreed, users saw one price/trial promise
  // and got charged a completely different product. Sharing this exact
  // selector makes that mismatch structurally impossible.
  for (const id of PRODUCT_IDS) {
    const p = store.get ? store.get(id) : null;
    noopLog(`[IAP] Checking product ${id}:`, {
      exists: !!p,
      canPurchase: p?.canPurchase,
      owned: p?.owned,
      title: p?.title,
      price: p?.pricing?.price
    });
  }
  const product = selectPurchasableProduct((id) => (store.get ? store.get(id) : null), PRODUCT_IDS);
  if (product) {
    noopLog(`[IAP] ✅ Selected product: ${product.id}`);
  }

  if (!product) {
    console.error('[IAP] No valid product found among:', PRODUCT_IDS);
    noopLog('[IAP] Available products:', store.products?.map(p => ({ id: p.id, canPurchase: p.canPurchase, title: p.title })));
    window.iapPurchaseInitiated = false;
    throw new Error('No valid subscription product available');
  }

  // Continue with existing order logic
  try {
    // product.getOffer() is documented as a shortcut to offers[0] - fine
    // when a product only has one offer, but if it ever has more than one,
    // offers[0] isn't guaranteed to be the one with the free-trial phase.
    // Explicitly prefer whichever offer actually has a FreeTrial phase so a
    // configured trial can never get silently skipped by picking the wrong
    // offer at purchase time.
    const offers: Array<{ pricingPhases?: Array<{ paymentMode?: string }>; order?: () => Promise<void> }> =
      Array.isArray(product.offers) ? product.offers : [];
    const trialOffer = offers.find((o) =>
      (o.pricingPhases || []).some((p) => p.paymentMode === 'FreeTrial')
    );
    const offer = trialOffer ?? product.getOffer?.();
    if (offer && typeof offer.order === 'function') {
      noopLog('[IAP] Ordering product:', product.id, trialOffer ? '(trial offer)' : '(default offer)');
      await offer.order();
    } else {
      console.error('[IAP] No valid offer found for product:', product.id);
      window.iapPurchaseInitiated = false;
      throw new Error('No valid offer available');
    }
  } catch (error) {
    console.error('[IAP] Order failed:', error);
    window.iapPurchaseInitiated = false;
    throw error;
  }
};

const RESTORE_PRODUCT_IDS = [
  'com.driplove.dating.premium.monthlysub3',
  'com.driplove.dating.premium.monthlysub2',
];

// Call to restore purchases - returns a Promise with restoration result
//
// IMPORTANT: this used to work by calling store.restorePurchases() (fire and
// forget) and then racing an 8-second timeout against a `productUpdated`
// listener waiting for `product.owned` to flip true. That was wrong on two
// counts:
//  1. store.restorePurchases() already returns a Promise that only resolves
//     once the real native round trip finishes -- on iOS that's
//     SKPaymentQueue.restoreCompletedTransactions() PLUS a subsequent app
//     receipt refresh, which can easily take longer than 8 seconds on a slow
//     connection (exactly what produced the premature "No Purchase Found").
//  2. On iOS, restoring an existing auto-renewable subscription does not
//     redeliver it as a fresh `approved` transaction -- it just refreshes the
//     local App Store receipt. Waiting on a transaction/productUpdated event
//     that may never come was the wrong mechanism entirely.
// The fix: await the real restore completion, then read whatever the store
// now has on record (the refreshed Apple receipt, or Google's queried
// purchases) directly, and validate that with our own server -- the same way
// a fresh purchase is validated.
export function restorePurchases(): Promise<{ restored: boolean; message: string }> {
  return new Promise(async (resolve) => {
    // @ts-ignore
    const store = window.CdvPurchase?.store;

    if (!store) {
      console.error('[IAP] Cannot restore purchases - store not available');
      resolve({ restored: false, message: 'Store not available. Please ensure you are using the app on iOS.' });
      return;
    }

    window.iapPurchaseInitiated = true;

    const finish = (result: { restored: boolean; message: string }) => {
      window.iapPurchaseInitiated = false;
      resolve(result);
    };

    // Safety net only -- store.restorePurchases() below is awaited for its
    // real result; this just prevents the UI from hanging forever if the
    // native side never calls back at all.
    const safetyTimeout = new Promise<{ restored: boolean; message: string }>((res) => {
      setTimeout(() => res({ restored: false, message: 'Restore is taking longer than expected. Please check your connection and try again.' }), 30000);
    });

    const doRestore = async (): Promise<{ restored: boolean; message: string }> => {
      try {
        if (store.restorePurchases && typeof store.restorePurchases === 'function') {
          noopLog('[IAP] Calling store.restorePurchases() and awaiting completion...');
          await store.restorePurchases();
        } else if (store.refresh && typeof store.refresh === 'function') {
          noopLog('[IAP] restorePurchases() unavailable, falling back to store.refresh()...');
          await store.refresh();
        } else {
          return { restored: false, message: 'Restore not available on this device' };
        }

        const { supabase } = await import('@/integrations/supabase/client');
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          return { restored: false, message: 'Please log in and try again.' };
        }

        const NOT_FOUND_MESSAGE = 'No active subscription found. If you previously purchased, it may have expired.';

        if (isAndroid()) {
          let alreadyLinkedMessage: string | null = null;
          for (const id of RESTORE_PRODUCT_IDS) {
            const transaction = findTransactionForProduct(store, id);
            const { receiptData, purchaseToken } = extractReceiptData(transaction);
            if (!receiptData) continue;

            noopLog('[IAP] Validating restored Google purchase for product:', id);
            const { valid, active, error } = await validateReceiptWithServer(
              user.id, id, transaction?.transactionId, receiptData, purchaseToken
            );
            if (valid && active) {
              try { localStorage.removeItem('driplove_iap_user_id'); } catch (e) {}
              return { restored: true, message: 'Subscription restored successfully' };
            }
            // GAP FIX: surface the real reason ("this subscription is tied to
            // a different account") instead of collapsing it into the same
            // generic "nothing to restore" message - retrying restore can
            // never fix that case, so the user needs to know it's different.
            const message = extractValidationErrorMessage(error);
            if (message && message.toLowerCase().includes('already linked')) {
              alreadyLinkedMessage = message;
            }
          }
          return { restored: false, message: alreadyLinkedMessage || NOT_FOUND_MESSAGE };
        }

        // iOS: the refreshed local App Store receipt contains the complete
        // purchase history (including the current subscription state), so
        // we don't need to find a specific transaction -- just send the
        // whole receipt, same as our server already does for a fresh purchase.
        const receipts = store.localReceipts || [];
        const appleReceipt = receipts.find((r: any) => r?.nativeData?.appStoreReceipt);
        const receiptData = appleReceipt?.nativeData?.appStoreReceipt;

        if (!receiptData) {
          return { restored: false, message: NOT_FOUND_MESSAGE };
        }

        noopLog('[IAP] Validating restored Apple receipt...');
        const { valid, active, error } = await validateReceiptWithServer(user.id, '', undefined, receiptData);
        if (valid && active) {
          try { localStorage.removeItem('driplove_iap_user_id'); } catch (e) {}
          return { restored: true, message: 'Subscription restored successfully' };
        }
        const message = extractValidationErrorMessage(error);
        if (message && message.toLowerCase().includes('already linked')) {
          return { restored: false, message };
        }
        return { restored: false, message: NOT_FOUND_MESSAGE };
      } catch (error) {
        console.error('[IAP] Error during restore:', error);
        return { restored: false, message: 'Restore failed. Please try again.' };
      }
    };

    const result = await Promise.race([doRestore(), safetyTimeout]);
    finish(result);
  });
}

// Debug helper function
export function debugIAPState() {
  // @ts-ignore
  const { store } = window.CdvPurchase || {};
  if (!store) {
    console.error('[IAP Debug] CdvPurchase.store not available');
    return;
  }

  let product, offer;
  try {
    product = store.get ? store.get('com.driplove.dating.premium.monthlysub1') : null;
    offer = product?.getOffer?.();
  } catch (error) {
    console.error('[IAP Debug] Error getting product:', error);
  }
  
  // Debug function - logs removed for production
  // Can be re-enabled for debugging if needed
}
