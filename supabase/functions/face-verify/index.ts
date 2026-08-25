import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    })
  : null;

type ProfileLookup = {
  id: string;
  email: string | null;
  fullName: string | null;
};

function parseUserIdFromExternalImageId(externalImageId?: string): string | null {
  if (!externalImageId) return null;

  const uuidMatch = externalImageId.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  );
  if (uuidMatch?.[0]) return uuidMatch[0];

  if (externalImageId.startsWith("temp_")) {
    const tempId = externalImageId.slice(5).trim();
    return tempId || null;
  }

  return null;
}

async function fetchProfilesByIds(userIds: string[]): Promise<Map<string, ProfileLookup>> {
  const profileMap = new Map<string, ProfileLookup>();
  if (!adminClient || userIds.length === 0) return profileMap;

  const { data, error } = await adminClient
    .from("profiles")
    .select("id,email,first_name,last_name")
    .in("id", userIds);

  if (error) {
    console.warn("Could not load profile associations for faces:", error.message);
    return profileMap;
  }

  for (const row of data || []) {
    const first = typeof row.first_name === "string" ? row.first_name.trim() : "";
    const last = typeof row.last_name === "string" ? row.last_name.trim() : "";
    const fullName = `${first} ${last}`.trim() || null;
    profileMap.set(row.id, {
      id: row.id,
      email: row.email ?? null,
      fullName,
    });
  }

  return profileMap;
}

async function getFaceAssociation(face: any, similarity?: number) {
  const externalImageId = face?.ExternalImageId || null;
  const associatedUserId = parseUserIdFromExternalImageId(externalImageId || undefined);
  let associatedEmail: string | null = null;
  let associatedName: string | null = null;

  if (associatedUserId) {
    const profileMap = await fetchProfilesByIds([associatedUserId]);
    const profile = profileMap.get(associatedUserId);
    associatedEmail = profile?.email ?? null;
    associatedName = profile?.fullName ?? null;
  }

  return {
    similarity: typeof similarity === "number" ? similarity : null,
    faceId: face?.FaceId || null,
    imageId: face?.ImageId || null,
    externalImageId,
    associatedUserId,
    associatedEmail,
    associatedName,
  };
}

// AWS Signature V4 helper
async function sha256(message: string | Uint8Array): Promise<ArrayBuffer> {
  const data = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  // Create a new ArrayBuffer to satisfy TypeScript's type requirements
  const buffer = new Uint8Array(data).buffer as ArrayBuffer;
  return await crypto.subtle.digest('SHA-256', buffer);
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> {
  const keyData = new TextEncoder().encode('AWS4' + key);
  const kDate = await hmacSha256(keyData.buffer as ArrayBuffer, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}

async function signRequest(method: string, service: string, target: string, payload: string): Promise<Headers> {
  const host = `${service}.${AWS_REGION}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  
  const canonicalUri = '/';
  const canonicalQuerystring = '';
  const payloadHash = toHex(await sha256(payload));
  
  const canonicalHeaders = 
    `content-type:application/x-amz-json-1.1\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';
  
  const canonicalRequest = 
    `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign = 
    `${algorithm}\n${amzDate}\n${credentialScope}\n${toHex(await sha256(canonicalRequest))}`;
  
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
    // Check if this is an allowed error (like ResourceAlreadyExistsException)
    for (const allowedError of allowedErrors) {
      if (responseText.includes(allowedError)) {
        console.log(`Allowed error: ${allowedError}`);
        return { __allowedError: allowedError };
      }
    }
    console.error('Rekognition error:', responseText);
    throw new Error(`Rekognition error: ${response.status} - ${responseText}`);
  }
  
  return JSON.parse(responseText);
}

// List every face in the collection, following Rekognition's NextToken pagination.
// ListFaces caps each page at MaxResults, so a collection bigger than one page
// was previously silently truncated (admin panel + clear-all only ever saw page 1).
interface RekognitionFace {
  FaceId: string;
  ImageId: string;
  ExternalImageId?: string;
  Confidence: number;
}

async function listAllFaces(): Promise<RekognitionFace[]> {
  const allFaces: RekognitionFace[] = [];
  let nextToken: string | undefined;

  do {
    const payload: Record<string, unknown> = { CollectionId: COLLECTION_ID, MaxResults: 1000 };
    if (nextToken) payload.NextToken = nextToken;

    const result = await rekognitionRequest('RekognitionService.ListFaces', payload, ['ResourceNotFoundException']);
    if (result.__allowedError) break;

    allFaces.push(...(result.Faces || []));
    nextToken = result.NextToken;
  } while (nextToken);

  return allFaces;
}

// Ensure collection exists
async function ensureCollection(): Promise<void> {
  const result = await rekognitionRequest(
    'RekognitionService.CreateCollection', 
    { CollectionId: COLLECTION_ID },
    ['ResourceAlreadyExistsException'] // Allow this error
  );
  
  if (result.__allowedError) {
    console.log('Collection already exists:', COLLECTION_ID);
  } else {
    console.log('Collection created:', COLLECTION_ID);
  }
}

// Convert base64 to Uint8Array (handles large images without stack overflow)
function base64ToBytes(base64: string): Uint8Array {
  // Remove data URI prefix if present
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Convert Uint8Array to base64 safely (avoids stack overflow on large images)
function bytesToBase64(bytes: Uint8Array): string {
  // Process in chunks to avoid "Maximum call stack size exceeded"
  const CHUNK_SIZE = 8192;
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    result += String.fromCharCode(...chunk);
  }
  return btoa(result);
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Handle list faces request (for admin)
    if (body.action === 'list_faces') {
      console.log('📋 Listing all faces...');
      try {
        await ensureCollection();

        const facesRaw = await listAllFaces();
        console.log(`Found ${facesRaw.length} faces across all pages`);

        const associatedIds = Array.from(
          new Set(
            facesRaw
              .map((face: any) => parseUserIdFromExternalImageId(face.ExternalImageId))
              .filter((id: string | null): id is string => Boolean(id))
          )
        );
        const profileMap = await fetchProfilesByIds(associatedIds);

        const faces = facesRaw.map((face: any) => {
          const associatedUserId = parseUserIdFromExternalImageId(face.ExternalImageId);
          const associatedProfile = associatedUserId ? profileMap.get(associatedUserId) : undefined;

          return {
            faceId: face.FaceId,
            externalImageId: face.ExternalImageId || 'Unknown',
            imageId: face.ImageId,
            confidence: face.Confidence,
            associatedUserId: associatedProfile?.id || associatedUserId || null,
            associatedEmail: associatedProfile?.email || null,
            associatedName: associatedProfile?.fullName || null,
          };
        });
        
        return new Response(JSON.stringify({ 
          success: true, 
          faces 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (listError: any) {
        console.error('List faces error:', listError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to list faces' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Handle delete single face request
    if (body.action === 'delete_face' && body.faceId) {
      console.log('🗑️ Deleting face:', body.faceId);
      try {
        await rekognitionRequest('RekognitionService.DeleteFaces', {
          CollectionId: COLLECTION_ID,
          FaceIds: [body.faceId],
        });
        
        console.log('✅ Deleted face:', body.faceId);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Face deleted successfully' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (deleteError: any) {
        console.error('Delete face error:', deleteError);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to delete face'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Delete every Rekognition face tied to a user (used by account deletion).
    // More robust than delete_face: doesn't depend on the client having a
    // correct/current faceId on hand, and cleans up all faces if a user ever
    // re-verified more than once (delete_face only ever removes one).
    if (body.action === 'delete_user_faces' && body.userId) {
      console.log('🗑️ Deleting all Rekognition faces for user:', body.userId);
      try {
        const allFaces = await listAllFaces();
        const matchingFaceIds = allFaces
          .filter((f) => parseUserIdFromExternalImageId(f.ExternalImageId) === body.userId)
          .map((f) => f.FaceId);

        if (matchingFaceIds.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            message: 'No faces found for user',
            deletedCount: 0
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        await rekognitionRequest('RekognitionService.DeleteFaces', {
          CollectionId: COLLECTION_ID,
          FaceIds: matchingFaceIds,
        });

        console.log(`✅ Deleted ${matchingFaceIds.length} face(s) for user:`, body.userId);
        return new Response(JSON.stringify({
          success: true,
          deletedCount: matchingFaceIds.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (deleteError: any) {
        console.error('Delete user faces error:', deleteError);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to delete user faces'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Sweep the whole collection for faces that aren't tied to any existing
    // account (e.g. left behind by account deletions from before delete_user_faces
    // existed, or a malformed/unparseable ExternalImageId) and delete them.
    if (body.action === 'delete_orphaned_faces') {
      console.log('🧹 Scanning for orphaned faces...');
      try {
        const allFaces = await listAllFaces();

        const candidateIds = Array.from(
          new Set(
            allFaces
              .map((f) => parseUserIdFromExternalImageId(f.ExternalImageId))
              .filter((id): id is string => Boolean(id))
          )
        );

        // Look up existence directly (not via fetchProfilesByIds, which
        // swallows query errors and returns an empty map on failure - here
        // that would make every face look orphaned and wipe the collection).
        // Fail the whole sweep instead of guessing if this can't be verified.
        if (!adminClient) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Admin database client not configured - refusing to sweep'
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const existingIds = new Set<string>();
        // Kept small: .in() filters are sent as URL query params by
        // PostgREST, and a few hundred UUIDs can exceed a URL length limit
        // (this is what failed at 500 - the request never even reached Postgres).
        const ID_CHUNK_SIZE = 100;
        for (let i = 0; i < candidateIds.length; i += ID_CHUNK_SIZE) {
          const chunk = candidateIds.slice(i, i + ID_CHUNK_SIZE);
          const { data, error } = await adminClient
            .from('profiles')
            .select('id')
            .in('id', chunk);

          if (error) {
            console.error('Profile existence check failed, aborting sweep:', error.message);
            return new Response(JSON.stringify({
              success: false,
              error: 'Could not verify account existence - aborted without deleting anything'
            }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          for (const row of data || []) existingIds.add(row.id);
        }
        const existingProfiles = existingIds;

        const orphanedFaces = allFaces.filter((f) => {
          const userId = parseUserIdFromExternalImageId(f.ExternalImageId);
          return !userId || !existingProfiles.has(userId);
        });

        if (orphanedFaces.length === 0) {
          return new Response(JSON.stringify({
            success: true,
            message: 'No orphaned faces found',
            totalFaces: allFaces.length,
            deletedCount: 0
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const orphanedFaceIds = orphanedFaces.map((f) => f.FaceId);
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < orphanedFaceIds.length; i += CHUNK_SIZE) {
          await rekognitionRequest('RekognitionService.DeleteFaces', {
            CollectionId: COLLECTION_ID,
            FaceIds: orphanedFaceIds.slice(i, i + CHUNK_SIZE),
          });
        }

        console.log(`✅ Deleted ${orphanedFaceIds.length} orphaned face(s) out of ${allFaces.length} total`);
        return new Response(JSON.stringify({
          success: true,
          totalFaces: allFaces.length,
          deletedCount: orphanedFaceIds.length,
          remainingFaces: allFaces.length - orphanedFaceIds.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (sweepError: any) {
        console.error('Delete orphaned faces error:', sweepError);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to delete orphaned faces'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle delete/clear collection request
    if (body.action === 'clear_collection') {
      console.log('🗑️ Clearing face collection...');
      try {
        // List every face in the collection (paginated - a collection can hold more than one page)
        const facesRaw = await listAllFaces();

        if (facesRaw.length > 0) {
          const faceIds = facesRaw.map((f: any) => f.FaceId);
          console.log(`Found ${faceIds.length} faces to delete`);

          // DeleteFaces accepts at most 4096 IDs per call - chunk defensively
          const CHUNK_SIZE = 1000;
          for (let i = 0; i < faceIds.length; i += CHUNK_SIZE) {
            await rekognitionRequest('RekognitionService.DeleteFaces', {
              CollectionId: COLLECTION_ID,
              FaceIds: faceIds.slice(i, i + CHUNK_SIZE),
            });
          }

          console.log('✅ Deleted all faces');
          return new Response(JSON.stringify({
            success: true,
            message: `Deleted ${faceIds.length} faces from collection`
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } else {
          return new Response(JSON.stringify({ 
            success: true, 
            message: 'Collection is already empty' 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      } catch (clearError: any) {
        console.error('Clear collection error:', clearError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to clear collection' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle detect_face action - check if an image contains a human face
    if (body.action === 'detect_face') {
      const { image } = body;
      
      console.log('👤 Detecting face in image...');
      
      if (!image) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Image is required',
          code: 'MISSING_IMAGE'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        return new Response(JSON.stringify({
          success: false,
          error: 'AWS credentials not configured'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const imageBytes = base64ToBytes(image);
        const imageBase64 = bytesToBase64(imageBytes);
        
        const detectResult = await rekognitionRequest('RekognitionService.DetectFaces', {
          Image: { Bytes: imageBase64 },
          Attributes: ['DEFAULT'],
        });
        
        const hasFace = detectResult.FaceDetails && detectResult.FaceDetails.length > 0;
        const confidence = hasFace ? detectResult.FaceDetails[0].Confidence : 0;
        
        console.log(`Face detection result: ${hasFace ? 'Face found' : 'No face'} (confidence: ${confidence}%)`);
        
        return new Response(JSON.stringify({
          success: true,
          hasFace: hasFace,
          confidence: confidence,
          faceCount: detectResult.FaceDetails?.length || 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (detectError: any) {
        console.error('Face detection error:', detectError);
        return new Response(JSON.stringify({
          success: false,
          error: 'Face detection failed',
          hasFace: false
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle validate_only action - check for duplicates WITHOUT indexing
    if (body.action === 'validate_only') {
      const { front } = body;
      
      console.log('🔍 Validating face (no indexing)...');
      
      if (!front) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Front image is required',
          code: 'MISSING_IMAGE'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        console.error('AWS credentials not configured');
        return new Response(JSON.stringify({
          success: false,
          error: 'AWS credentials not configured'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await ensureCollection();
      
      const imageBytes = base64ToBytes(front);
      const imageBase64 = bytesToBase64(imageBytes);
      
      console.log('📸 Image size:', imageBytes.length, 'bytes');

      // Search for existing face (duplicate check)
      try {
        console.log('🔍 Checking if face already registered...');
        const searchResult = await rekognitionRequest('RekognitionService.SearchFacesByImage', {
          CollectionId: COLLECTION_ID,
          Image: { Bytes: imageBase64 },
          FaceMatchThreshold: 90,
          MaxFaces: 1,
        });

        if (searchResult.FaceMatches && searchResult.FaceMatches.length > 0) {
          const matchConfidence = searchResult.FaceMatches[0].Similarity || 0;
          const duplicateFace = await getFaceAssociation(searchResult.FaceMatches[0].Face, matchConfidence);
          console.log('⚠️ Duplicate face found with similarity:', matchConfidence);
          return new Response(JSON.stringify({
            success: false,
            error: 'This face already exists in our system. Each person can only have one account.',
            code: 'DUPLICATE_FACE',
            duplicateFace,
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        console.log('✅ No duplicate found - face is valid');
        
        // Return success - face is valid and not a duplicate
        return new Response(JSON.stringify({ 
          success: true,
          message: 'Face validated successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (searchError: any) {
        const errorMsg = searchError.message || '';
        
        // No face detected in image
        if (errorMsg.includes('InvalidParameterException') && errorMsg.includes('no faces')) {
          console.log('❌ No face detected in search');
          return new Response(JSON.stringify({
            success: false,
            error: 'No face detected. Please take a clear photo showing your face.',
            code: 'NO_FACE'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Collection is empty - that's fine, face is valid
        if (errorMsg.includes('There are no faces in the collection')) {
          console.log('Collection is empty - face is valid');
          return new Response(JSON.stringify({ 
            success: true,
            message: 'Face validated successfully (first face)'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Other errors
        console.error('Search error:', errorMsg);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to validate face. Please try again.',
          code: 'VALIDATION_FAILED'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle index_face action - actually save the face to collection
    if (body.action === 'index_face') {
      const { front, userId, userName } = body;

      console.log('📝 Indexing face for user:', userId, 'name:', userName);

      if (!front || !userId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Front image and userId are required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // SECURITY: this function has verify_jwt=false at the platform level, and it
      // writes profiles.face_descriptor (the verified-badge flag) server-side below
      // using the service role, which bypasses RLS entirely. Without this check,
      // any caller could pass an arbitrary userId and grant that user (or a
      // completely different account) the verified badge. Require a valid
      // Supabase session whose subject matches the userId being indexed.
      if (!adminClient) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Server misconfigured'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const { data: authData, error: authError } = token
        ? await adminClient.auth.getUser(token)
        : { data: { user: null }, error: new Error('Missing Authorization header') };

      if (authError || !authData?.user || authData.user.id !== userId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Not authorized to verify this account'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        return new Response(JSON.stringify({
          success: false,
          error: 'AWS credentials not configured'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      await ensureCollection();
      
      const imageBytes = base64ToBytes(front);
      const imageBase64 = bytesToBase64(imageBytes);
      
      // Create external ID with user name for easy identification
      const externalId = userName ? `${userName.replace(/\s+/g, '_')}_${userId}` : userId;
      
      try {
        const indexResult = await rekognitionRequest('RekognitionService.IndexFaces', {
          CollectionId: COLLECTION_ID,
          ExternalImageId: externalId,
          Image: { Bytes: imageBase64 },
          DetectionAttributes: ['DEFAULT'],
        });
        
        if (!indexResult?.FaceRecords || indexResult.FaceRecords.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No face detected in image',
            code: 'NO_FACE'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const faceId = indexResult.FaceRecords[0].Face?.FaceId;
        console.log('✅ Face indexed successfully');

        // Mark the account verified server-side (service role bypasses RLS).
        // Previously the client set profiles.face_descriptor itself after
        // receiving this response, which meant any authenticated user could
        // grant themselves the verified badge by writing directly to the
        // profiles table without ever calling Rekognition. Writing it here,
        // gated by the identity check above, closes that gap.
        const { error: profileUpdateError } = await adminClient
          .from('profiles')
          .update({
            face_descriptor: faceId || 'verified',
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (profileUpdateError) {
          console.error('Failed to persist verification status:', profileUpdateError.message);
          return new Response(JSON.stringify({
            success: false,
            error: 'Face verified but failed to save status. Please try again.',
            code: 'PROFILE_UPDATE_FAILED'
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          faceId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      } catch (indexError: any) {
        const errorMsg = indexError.message || '';

        if (errorMsg.includes('InvalidParameterException') && (errorMsg.includes('no faces') || errorMsg.includes('No faces'))) {
          return new Response(JSON.stringify({
            success: false,
            error: 'No face detected. Please take a clear photo showing your face.',
            code: 'NO_FACE'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.error('Index error:', errorMsg);
        return new Response(JSON.stringify({
          success: false,
          error: 'Could not save face. Please try again.',
          code: 'INDEX_FAILED'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Handle compare_faces action - compare uploaded images with verified face
    if (body.action === 'compare_faces') {
      const { sourceImage, targetImages } = body;
      
      console.log('🔍 Comparing faces...');
      
      if (!sourceImage || !targetImages || targetImages.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Source image and target images are required'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        return new Response(JSON.stringify({
          success: false,
          error: 'AWS credentials not configured'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const sourceBytes = base64ToBytes(sourceImage);
      const sourceBase64 = bytesToBase64(sourceBytes);
      
      // Try each target image until we find a match
      for (let i = 0; i < targetImages.length; i++) {
        try {
          const targetBytes = base64ToBytes(targetImages[i]);
          const targetBase64 = bytesToBase64(targetBytes);
          
          console.log(`Comparing with target image ${i + 1}/${targetImages.length}`);
          
          const compareResult = await rekognitionRequest('RekognitionService.CompareFaces', {
            SourceImage: { Bytes: sourceBase64 },
            TargetImage: { Bytes: targetBase64 },
            SimilarityThreshold: 70, // 70% similarity threshold for real-world photos
          });
          
          if (compareResult.FaceMatches && compareResult.FaceMatches.length > 0) {
            const similarity = compareResult.FaceMatches[0].Similarity;
            console.log(`✅ Face match found! Similarity: ${similarity}%`);
            return new Response(JSON.stringify({ 
              success: true,
              matchFound: true,
              matchIndex: i,
              similarity: similarity
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }
        } catch (compareError: any) {
          console.log(`Target image ${i + 1} comparison failed:`, compareError.message);
          // Continue to next image
        }
      }
      
      // No match found in any image
      console.log('❌ No face match found in any uploaded image');
      return new Response(JSON.stringify({ 
        success: true,
        matchFound: false,
        error: 'None of your uploaded photos match your verified face. At least one photo must be of you.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Legacy: Regular face verification (validate + index in one step)
    const { front, side, userId } = body;
    
    console.log('🔍 Face verification started');
    
    if (!front) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Front image is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      console.error('AWS credentials not configured');
      return new Response(JSON.stringify({
        success: false,
        error: 'AWS credentials not configured'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Ensure collection exists
    await ensureCollection();
    
    const imageBytes = base64ToBytes(front);
    const imageBase64 = bytesToBase64(imageBytes);
    
    console.log('📸 Image size:', imageBytes.length, 'bytes');

    // STEP 1: Search for existing face (duplicate check) - this also validates if there's a face
    try {
      console.log('🔍 Checking if face already registered...');
      const searchResult = await rekognitionRequest('RekognitionService.SearchFacesByImage', {
        CollectionId: COLLECTION_ID,
        Image: { Bytes: imageBase64 },
        FaceMatchThreshold: 90,
        MaxFaces: 1,
      });

      if (searchResult.FaceMatches && searchResult.FaceMatches.length > 0) {
        const matchConfidence = searchResult.FaceMatches[0].Similarity || 0;
        const duplicateFace = await getFaceAssociation(searchResult.FaceMatches[0].Face, matchConfidence);
        console.log('⚠️ Duplicate face found with similarity:', matchConfidence);
        return new Response(JSON.stringify({
          success: false,
          error: 'This face already exists in our system. Each person can only have one account.',
          code: 'DUPLICATE_FACE',
          duplicateFace,
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.log('✅ No duplicate found');
    } catch (searchError: any) {
      const errorMsg = searchError.message || '';
      
      // No face detected in image
      if (errorMsg.includes('InvalidParameterException') && errorMsg.includes('no faces')) {
        console.log('❌ No face detected in search');
        return new Response(JSON.stringify({
          success: false,
          error: 'No face detected. Please take a clear photo showing your face.',
          code: 'NO_FACE'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Collection is empty - that's fine, continue to index
      if (errorMsg.includes('There are no faces in the collection')) {
        console.log('Collection is empty - no duplicates possible');
      } else if (!errorMsg.includes('InvalidParameterException')) {
        // Other errors - log but continue
        console.log('Search error (continuing):', errorMsg);
      }
    }

    // STEP 2: Index (save) this new face
    console.log('📝 Indexing new face...');
    let indexResult;
    try {
      indexResult = await rekognitionRequest('RekognitionService.IndexFaces', {
        CollectionId: COLLECTION_ID,
        ExternalImageId: userId || `user_${Date.now()}`,
        Image: { Bytes: imageBase64 },
        DetectionAttributes: ['DEFAULT'],
      });
    } catch (indexError: any) {
      const errorMsg = indexError.message || '';
      
      // No face in image
      if (errorMsg.includes('InvalidParameterException') && (errorMsg.includes('no faces') || errorMsg.includes('No faces'))) {
        console.log('❌ No face detected during indexing');
        return new Response(JSON.stringify({
          success: false,
          error: 'No face detected. Please take a clear photo showing your face.',
          code: 'NO_FACE'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      console.error('Index error:', errorMsg);
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not process your photo. Please try again with better lighting.',
        code: 'INDEX_FAILED'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!indexResult?.FaceRecords || indexResult.FaceRecords.length === 0) {
      console.log('❌ No face records returned');
      return new Response(JSON.stringify({
        success: false,
        error: 'No face detected. Please take a clear photo showing your face.',
        code: 'NO_FACE'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Face indexed successfully');
    return new Response(JSON.stringify({ 
      success: true,
      faceId: indexResult.FaceRecords[0].Face?.FaceId 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Face verification error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
