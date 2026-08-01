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
