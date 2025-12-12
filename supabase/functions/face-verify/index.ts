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

// AWS Signature V4 helper
async function sha256(message: string | Uint8Array): Promise<ArrayBuffer> {
  const data = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  return await crypto.subtle.digest('SHA-256', data);
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
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key), dateStamp);
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

// Convert base64 to Uint8Array
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

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Handle delete/clear collection request
    if (body.action === 'clear_collection') {
      console.log('🗑️ Clearing face collection...');
      try {
        // List all faces in collection
        const listResult = await rekognitionRequest('RekognitionService.ListFaces', {
          CollectionId: COLLECTION_ID,
          MaxResults: 100,
        }, ['ResourceNotFoundException']);
        
        if (listResult.__allowedError) {
          return new Response(JSON.stringify({ 
            success: true, 
            message: 'Collection does not exist - nothing to clear' 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (listResult.Faces && listResult.Faces.length > 0) {
          const faceIds = listResult.Faces.map((f: any) => f.FaceId);
          console.log(`Found ${faceIds.length} faces to delete`);
          
          await rekognitionRequest('RekognitionService.DeleteFaces', {
            CollectionId: COLLECTION_ID,
            FaceIds: faceIds,
          });
          
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

    // Regular face verification
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
    const imageBase64 = btoa(String.fromCharCode(...imageBytes));
    
    console.log('📸 Image size:', imageBytes.length, 'bytes');

    // STEP 1: Detect if there's actually a human face in the image first
    console.log('🔍 Detecting face in image...');
    let detectResult;
    try {
      detectResult = await rekognitionRequest('RekognitionService.DetectFaces', {
        Image: { Bytes: imageBase64 },
        Attributes: ['DEFAULT'],
      });
    } catch (detectError: any) {
      console.error('Face detection failed:', detectError.message);
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not analyze image. Please try again.',
        code: 'DETECTION_FAILED'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!detectResult.FaceDetails || detectResult.FaceDetails.length === 0) {
      console.log('❌ No human face detected in image');
      return new Response(JSON.stringify({
        success: false,
        error: 'No human face detected. Please take a clear photo of your face.',
        code: 'NO_FACE'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const faceConfidence = detectResult.FaceDetails[0].Confidence || 0;
    console.log('✅ Face detected with confidence:', faceConfidence);

    if (faceConfidence < 90) {
      console.log('⚠️ Face confidence too low:', faceConfidence);
      return new Response(JSON.stringify({
        success: false,
        error: 'Face not clear enough. Please ensure good lighting and face the camera directly.',
        code: 'LOW_CONFIDENCE'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // STEP 2: Search for existing face (duplicate check)
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
        console.log('⚠️ Duplicate face found with similarity:', matchConfidence);
        return new Response(JSON.stringify({
          success: false,
          error: 'This face is already registered with another account.',
          code: 'DUPLICATE_FACE'
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      console.log('✅ No duplicate found');
    } catch (searchError: any) {
      // If no faces in collection yet, search will fail - that's OK
      if (!searchError.message?.includes('InvalidParameterException')) {
        console.log('Search check passed (collection may be empty)');
      }
    }

    // STEP 3: Index (save) this new face
    console.log('📝 Indexing new face...');
    const indexResult = await rekognitionRequest('RekognitionService.IndexFaces', {
      CollectionId: COLLECTION_ID,
      ExternalImageId: userId || `user_${Date.now()}`,
      Image: { Bytes: imageBase64 },
      DetectionAttributes: ['DEFAULT'],
    });

    if (!indexResult.FaceRecords || indexResult.FaceRecords.length === 0) {
      console.log('❌ Failed to index face');
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to register face. Please try again.',
        code: 'INDEX_FAILED'
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
