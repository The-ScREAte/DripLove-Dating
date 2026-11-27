/**
 * Cheap fingerprint of a file (size, type, first and last 100 bytes) used to
 * spot the same photo being picked twice without hashing the whole file.
 */
export const getFileHash = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const firstBytes = Array.from(bytes.slice(0, 100)).join(',');
  const lastBytes = Array.from(bytes.slice(-100)).join(',');
  return `${file.size}-${file.type}-${firstBytes}-${lastBytes}`;
};
