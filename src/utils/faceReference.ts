export type FaceReferenceInput = {
  faceId?: string | null;
  imageId?: string | null;
  externalImageId?: string | null;
};

function getPrimaryFaceIdentifier(input?: FaceReferenceInput | null): string {
  return input?.faceId || input?.imageId || input?.externalImageId || "";
}

function fallbackTokenFromString(value: string): string {
  let checksum = 0;

  for (let i = 0; i < value.length; i += 1) {
    checksum = (checksum * 31 + value.charCodeAt(i)) % 2176782336;
  }

  return checksum.toString(36).toUpperCase().padStart(6, "0").slice(0, 8);
}

export function getFaceReferenceCode(input?: FaceReferenceInput | null): string {
  const rawId = getPrimaryFaceIdentifier(input);

  if (!rawId) {
    return "FACE-UNKNOWN";
  }

  const uuidPrefixMatch = rawId.match(/^([0-9a-fA-F]{8})-/);
  if (uuidPrefixMatch) {
    return `FACE-${uuidPrefixMatch[1].toUpperCase()}`;
  }

  const cleaned = rawId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const token = cleaned.slice(0, 8) || fallbackTokenFromString(rawId);

  return `FACE-${token}`;
}

// ---------------------------------------------------------------------------
// Duplicate-face responses (face-verify edge function). Shared by the
// registration, profile-completion and face-verification flows.
// ---------------------------------------------------------------------------

export type DuplicateFaceDetails = {
  similarity?: number | null;
  faceId?: string | null;
  imageId?: string | null;
  externalImageId?: string | null;
  associatedUserId?: string | null;
  associatedEmail?: string | null;
  associatedName?: string | null;
};

/** Normalises the edge function's duplicate-face payload into one shape. */
export function extractDuplicateFaceDetails(
  data: (DuplicateFaceDetails & { duplicateFace?: DuplicateFaceDetails | null }) | null | undefined
): DuplicateFaceDetails {
  if (data?.duplicateFace && typeof data.duplicateFace === 'object') {
    return data.duplicateFace;
  }

  return {
    similarity: data?.similarity ?? null,
    faceId: data?.faceId ?? null,
    imageId: data?.imageId ?? null,
    externalImageId: data?.externalImageId ?? null,
    associatedUserId: data?.associatedUserId ?? null,
    associatedEmail: data?.associatedEmail ?? null,
    associatedName: data?.associatedName ?? null,
  };
}

export function formatDuplicateFaceMessage(details?: DuplicateFaceDetails | null): string {
  return `User already exists. Reference code: ${getFaceReferenceCode(details)}.`;
}
