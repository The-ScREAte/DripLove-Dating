import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Real, server-side photo moderation. Replaces the old client-side
// photoModeration.ts, which just guessed at nudity from raw pixel color
// (skin-tone heuristics) in the browser and let the browser write the
// approval decision straight into the database. This function is the only
// thing allowed to decide is_approved/moderation_status now - the DB grants
// added in the accompanying migration block the client from writing those
// columns directly, so every photo (profile upload, registration,
// profile-completion) must go through here.
//
// Policy (default-to-live, not default-to-review):
//   - Explicit nudity/sex acts at or above EXPLICIT_CONTENT_THRESHOLD confidence
//     are the ONLY thing auto-removed without a human. Suggestive/swimwear/
//     shirtless etc. is allowed and goes live immediately - nothing "unsure"
//     blocks a photo from showing.
//   - Face-matching never gates visibility. It runs in the background and
//     only ever adds a non-blocking "give this a glance" marker for admins;
//     the photo is already live either way. A strong match doesn't grant a
//     badge here - profiles.face_descriptor (set once, at face-verify time)
//     is what already drives the existing verified badge.
//   - Unverified users are fully usable; no face check runs for them at all,
//     and that alone earns no negative marker (see faceReviewReason below).
//   - Whether the photo has a detectable face is reported back for the
//     client's own UI benefit (a friendly, non-blocking nudge on slot 1
//     specifically), never as a moderation gate.
//
// Two real AWS Rekognition checks, run server-side:
//   1. DetectModerationLabels - nudity / explicit content
//   2. SearchFacesByImage against the driplove_faces collection - does this
//      photo's face match the uploader's own verified face? (face-verify's
//      index_face already put their face in that collection at signup/
//      verification time, so this doesn't need a client-supplied reference
//      image the way the old client-side compare did.)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";
const AWS_REGION = "us-east-1";
const COLLECTION_ID = "driplove_faces";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Only explicit nudity/sex-act content at or above this confidence is
// auto-removed. Suggestive/swimwear/shirtless content stays well under this
// and is always allowed through.
const EXPLICIT_CONTENT_THRESHOLD = 85;
// Below this we don't even bother recording the label - keeps the audit
// trail free of noise from very low-confidence guesses.
const MODERATION_MIN_CONFIDENCE = 40;
// Rekognition's own similarity score for "this is the same person," at or
// above which a photo counts as a strong match (no human glance needed).
const FACE_STRONG_MATCH_THRESHOLD = 90;
// Below this, SearchFacesByImage won't even return the match - so anything
// found is at least a "weak match" candidate rather than pure noise.
const FACE_SEARCH_MATCH_THRESHOLD = 50;

const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

function parseUserIdFromExternalImageId(externalImageId?: string): string | null {
  if (!externalImageId) return null;
  const uuidMatch = externalImageId.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );
  return uuidMatch?.[0] || null;
}

// --- AWS Signature V4 (identical scheme to supabase/functions/face-verify) ---
async function sha256(message: string | Uint8Array): Promise<ArrayBuffer> {
  const data = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const buffer = new Uint8Array(data).buffer as ArrayBuffer;
  return await crypto.subtle.digest('SHA-256', buffer);
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> {
  const keyData = new TextEncoder().encode('AWS4' + key);
  const kDate = await hmacSha256(keyData.buffer as ArrayBuffer, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  return await hmacSha256(kService, 'aws4_request');
}

async function signRequest(method: string, service: string, target: string, payload: string): Promise<Headers> {
  const host = `${service}.${AWS_REGION}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = toHex(await sha256(payload));
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
  const canonicalRequest = `${method}\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${toHex(await sha256(canonicalRequest))}`;

  const signingKey = await getSignatureKey(AWS_SECRET_ACCESS_KEY, dateStamp, AWS_REGION, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  const authorizationHeader =
    `${algorithm} Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = new Headers();
  headers.set('Content-Type', 'application/x-amz-json-1.1');
  headers.set('Host', host);
  headers.set('X-Amz-Date', amzDate);
  headers.set('X-Amz-Target', target);
  headers.set('Authorization', authorizationHeader);
  return headers;
}

async function rekognitionRequest(target: string, payload: object, allowedErrors: string[] = []): Promise<any> {
  const payloadStr = JSON.stringify(payload);
  const headers = await signRequest('POST', 'rekognition', target, payloadStr);

  const response = await fetch(`https://rekognition.${AWS_REGION}.amazonaws.com/`, {
    method: 'POST',
    headers,
    body: payloadStr,
  });

  const responseText = await response.text();
  if (!response.ok) {
    for (const allowedError of allowedErrors) {
      if (responseText.includes(allowedError)) return { __allowedError: allowedError };
    }
    console.error('Rekognition error:', responseText);
    throw new Error(`Rekognition error: ${response.status} - ${responseText}`);
  }
  return JSON.parse(responseText);
}

function base64ToBytes(base64: string): Uint8Array {
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    result += String.fromCharCode(...bytes.slice(i, i + CHUNK_SIZE));
  }
  return btoa(result);
}

// 'rejected' is the only outcome that ever hides a photo - it's reserved
// for confirmed explicit content. 'approved' always means live, whether or
// not faceReviewReason asks a human for a non-blocking follow-up glance.
type Decision = {
  status: 'approved' | 'rejected';
  reason: string;
  message: string;
};

// A face WAS detected but doesn't clearly belong to this account - a human
// should glance at it, but it stays live either way. null means either no
// face check applies (unverified) or the check came back clean.
type FaceReviewReason = 'face_weak_match' | 'face_no_match' | null;

function decideModeration(explicitConfidence: number | null): Decision {
  if (explicitConfidence !== null && explicitConfidence >= EXPLICIT_CONTENT_THRESHOLD) {
    return {
      status: 'rejected',
      reason: 'explicit_content',
      message: 'This photo was removed for showing explicit nudity or sexual content, which violates our content guidelines.',
    };
  }
  return { status: 'approved', reason: 'auto_approved', message: 'Photo approved.' };
}

// AWS's Content Moderation v7 taxonomy is a 3-tier hierarchy - each label
// carries Name/ParentName/TaxonomyLevel, and L1 (top-level) labels have
// ParentName === "". Only the "Explicit" L1 category is genuine nudity or
// sexual content. Two other L1 categories look deceptively close but are
// NOT explicit at all: "Non-Explicit Nudity of Intimate parts and Kissing"
// (AWS's v7 rename of what used to be called "Suggestive") and "Swimwear
// or Underwear" - exactly the sexy/bikini/shirtless content the policy
// says to always allow. A flat max-confidence across every returned label
// regardless of category conflates these with real nudity - that bug is
// what silently auto-removed clean, non-nude photos (a sheer dress, a
// swimwear photo) whenever AWS's model scored them confidently as
// "suggestive," which has nothing to do with actual nudity. This walks
// each label's ParentName chain up to its L1 root to tell them apart.
const EXPLICIT_ROOT_CATEGORY = 'Explicit';

function explicitContentConfidence(labels: any[]): number | null {
  const byName = new Map(labels.map((l) => [l.Name, l]));
  const rootCategoryOf = (label: any): string => {
    let current = label;
    const seen = new Set<string>();
    while (current.ParentName && !seen.has(current.Name)) {
      seen.add(current.Name);
      const parent = byName.get(current.ParentName);
      if (!parent) break;
      current = parent;
    }
    return current.Name;
  };

  let max: number | null = null;
  for (const label of labels) {
    if (rootCategoryOf(label) !== EXPLICIT_ROOT_CATEGORY) continue;
    max = Math.max(max ?? 0, label.Confidence || 0);
  }
  return max;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (!adminClient) {
    return json({ success: false, error: 'Server misconfigured' }, 500);
  }

  try {
    const { imageId, imageBase64 } = await req.json();

    if (!imageId || !imageBase64) {
      return json({ success: false, error: 'imageId and imageBase64 are required' }, 400);
    }

    // Require a valid session whose subject owns the image row being
    // moderated - otherwise any caller could trigger moderation (and have
    // the AI's verdict written) for someone else's photo.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: authData, error: authError } = token
      ? await adminClient.auth.getUser(token)
      : { data: { user: null }, error: new Error('Missing Authorization header') };

    if (authError || !authData?.user) {
      return json({ success: false, error: 'Not authorized' }, 401);
    }

    const { data: imageRow, error: imageError } = await adminClient
      .from('user_images')
      .select('id, user_id')
      .eq('id', imageId)
      .single();

    if (imageError || !imageRow) {
      return json({ success: false, error: 'Image not found' }, 404);
    }
    if (imageRow.user_id !== authData.user.id) {
      return json({ success: false, error: 'Not authorized to moderate this image' }, 403);
    }

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return json({ success: false, error: 'AWS credentials not configured' }, 500);
    }

    const userId = imageRow.user_id as string;

    const { data: profile } = await adminClient
      .from('profiles')
      .select('face_descriptor')
      .eq('id', userId)
      .single();
    const isVerified = !!profile?.face_descriptor;

    const imageBytes = base64ToBytes(imageBase64);
    const imageBase64Clean = bytesToBase64(imageBytes);

    let decision: Decision;
    let moderationLabels: any[] = [];
    let explicitConfidence: number | null = null;
    let faceSimilarity: number | null = null;
    let faceReviewReason: FaceReviewReason = null;
    // null = couldn't be determined (check failed); otherwise whether a
    // face was found at all - purely informational, for the client's own
    // non-blocking slot-1 nudge, never a moderation gate.
    let hasFace: boolean | null = null;
    let checkFailed = false;

    try {
      // The two checks are independent - run them concurrently instead of
      // one after the other, since that's most of what made moderation feel
      // slow (two sequential AWS round-trips instead of one).
      const moderationPromise = rekognitionRequest('RekognitionService.DetectModerationLabels', {
        Image: { Bytes: imageBase64Clean },
        MinConfidence: MODERATION_MIN_CONFIDENCE,
      });

      // Identity matching only ever applies to verified users, and only
      // ever produces a non-blocking review marker - it never changes
      // whether the photo goes live. hasFace (for the slot-1 nudge) is
      // useful for every uploader either way. Wrapped in its own try/catch
      // so an expected "no faces in the photo" result doesn't reject the
      // Promise.all below and lose the moderation-labels result running
      // alongside it.
      const facePromise = (async () => {
        if (isVerified) {
          try {
            const searchResult = await rekognitionRequest('RekognitionService.SearchFacesByImage', {
              CollectionId: COLLECTION_ID,
              Image: { Bytes: imageBase64Clean },
              FaceMatchThreshold: FACE_SEARCH_MATCH_THRESHOLD,
              MaxFaces: 1,
            }, ['ResourceNotFoundException']);
            return { kind: 'search' as const, searchResult };
          } catch (searchError: any) {
            const msg = searchError?.message || '';
            if (msg.includes('InvalidParameterException') && msg.includes('no faces')) {
              return { kind: 'no-face' as const };
            }
            throw searchError;
          }
        } else {
          const detectResult = await rekognitionRequest('RekognitionService.DetectFaces', {
            Image: { Bytes: imageBase64Clean },
            Attributes: ['DEFAULT'],
          });
          return { kind: 'detect' as const, detectResult };
        }
      })();

      const [moderationResult, faceOutcome] = await Promise.all([moderationPromise, facePromise]);

      moderationLabels = moderationResult?.ModerationLabels || [];
      explicitConfidence = explicitContentConfidence(moderationLabels);

      if (faceOutcome.kind === 'no-face') {
        // No face in the photo at all - "no penalty" per policy, just
        // recorded for the slot-1 nudge.
        hasFace = false;
      } else if (faceOutcome.kind === 'detect') {
        hasFace = (faceOutcome.detectResult?.FaceDetails?.length || 0) > 0;
      } else {
        hasFace = true;
        const searchResult = faceOutcome.searchResult;
        if (searchResult?.__allowedError) {
          // Collection doesn't exist yet - shouldn't happen for a verified
          // user, but treat it like "no match" rather than failing the
          // whole upload over it.
          faceReviewReason = 'face_no_match';
        } else {
          const match = searchResult?.FaceMatches?.[0];
          if (!match) {
            faceReviewReason = 'face_no_match';
          } else {
            const matchedUserId = parseUserIdFromExternalImageId(match.Face?.ExternalImageId);
            faceSimilarity = match.Similarity ?? null;
            if (matchedUserId !== userId) {
              faceReviewReason = 'face_no_match';
            } else {
              faceReviewReason = (faceSimilarity ?? 0) >= FACE_STRONG_MATCH_THRESHOLD ? null : 'face_weak_match';
            }
          }
        }
      }

      decision = decideModeration(explicitConfidence);
    } catch (checkError: any) {
      console.error('Moderation check failed:', checkError?.message || checkError);
      checkFailed = true;
      // Only confirmed explicit content ever gets removed - if the check
      // itself couldn't complete, the photo still goes live, just flagged
      // for a human to glance at rather than left unmoderated forever.
      decision = { status: 'approved', reason: 'auto_approved', message: 'Photo approved.' };
    }

    const moderationReason = decision.status === 'rejected'
      ? decision.reason
      : (checkFailed ? 'moderation_check_failed' : faceReviewReason);

    const moderationNotes = decision.status === 'rejected'
      ? decision.message
      : checkFailed
        ? "This photo is live. Our automated check couldn't complete, so it's been queued for a quick manual glance."
        : faceReviewReason
          ? "This photo is live. Its face didn't clearly match the account's verified face, so it's been queued for a quick manual glance."
          : decision.message;

    const { error: updateError } = await adminClient
      .from('user_images')
      .update({
        is_approved: decision.status === 'approved',
        moderation_status: decision.status,
        moderation_reason: moderationReason,
        moderation_notes: moderationNotes,
        moderation_labels: { moderationLabels, faceSimilarity, isVerified, hasFace },
        face_similarity: faceSimilarity,
        confidence_score: explicitConfidence ?? 0,
        flagged_content: moderationLabels.map((l: any) => l.Name).filter(Boolean),
        // Auto-removal frees the slot immediately, same as an admin reject -
        // the user can upload a replacement into it right away.
        ...(decision.status === 'rejected' ? { image_order: -1 } : {}),
      })
      .eq('id', imageId);

    if (updateError) {
      console.error('Failed to persist moderation result:', updateError.message);
      return json({ success: false, error: 'Failed to save moderation result' }, 500);
    }

    // Rejected is the one outcome that actually hides a live photo from the
    // user with no action on their part - worth a real notification so they
    // know a slot opened up, rather than silently discovering it later.
    // Routes to Profile on tap (see resolveNotificationRoute in
    // pushNotifications.ts).
    if (decision.status === 'rejected' && adminClient) {
      adminClient.functions.invoke('send-push-notification', {
        body: {
          title: 'Photo Removed',
          body: 'A photo was removed — upload a new one anytime',
          userId,
          type: 'image_rejected',
        },
      }).catch((notifyError: unknown) => {
        console.error('Failed to send image-rejection notification:', notifyError);
      });
    }

    return json({
      success: true,
      status: decision.status,
      reason: moderationReason,
      message: moderationNotes,
      hasFace,
      faceSimilarity,
    });
  } catch (error: unknown) {
    console.error('moderate-image error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return json({ success: false, error: errorMessage }, 500);
  }
});
