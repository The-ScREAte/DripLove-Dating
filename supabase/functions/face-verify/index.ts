import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { RekognitionClient, IndexFacesCommand, SearchFacesByImageCommand } from "npm:@aws-sdk/client-rekognition";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const client = new RekognitionClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID") || "",
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY") || "",
  }
});

const COLLECTION = "driplove_faces";

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { front, left, right, userId } = await req.json();

  // Convert base64 → Buffer
  function decode(base64: string) {
    return new Uint8Array(
      atob(base64.replace(/^data:image\/\w+;base64,/, ""))
        .split("")
        .map(c => c.charCodeAt(0))
    );
  }

  // Create a single combined image (AWS requires one image per indexing)
  const mainImage = decode(front);

  // STEP 1 — SEARCH if this face already exists
  const searchCmd = new SearchFacesByImageCommand({
    CollectionId: COLLECTION,
    Image: { Bytes: mainImage },
    FaceMatchThreshold: 90,
    MaxFaces: 1,
  });

  try {
    const searchResult = await client.send(searchCmd);

    if (searchResult.FaceMatches?.length) {
      return new Response(JSON.stringify({
        success: false,
        reason: "duplicate"
      }), { 
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  } catch (err) {
    console.error("search error:", err);
  }

  // STEP 2 — INDEX (save) this new face
  const indexCmd = new IndexFacesCommand({
    CollectionId: COLLECTION,
    ExternalImageId: userId,
    Image: { Bytes: mainImage },
  });

  await client.send(indexCmd);

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
