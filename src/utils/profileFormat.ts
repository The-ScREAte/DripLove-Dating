/** Formats a height in cm as `5'11" (180 cm)`. */
export const formatHeightLabel = (cm: number): string => {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}" (${cm} cm)`;
};

/** Shortens a photo caption to 50 characters for cards and overlays. */
export const truncateCaption = (text: string): string =>
  text.length > 50 ? `${text.slice(0, 50).trimEnd()}…` : text;

/** Height as 5'11" - the compact form used in tight card headers. */
export const formatHeightShort = (cm: number): string => {
  const totalInches = Math.round(cm / 2.54);
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}"`;
};
