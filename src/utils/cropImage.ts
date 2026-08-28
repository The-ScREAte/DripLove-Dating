// Canvas-based crop: takes a source image URL and a pixel crop rect (as
// returned by react-easy-crop's onCropComplete) and produces a JPEG blob of
// exactly that rect, at the frame's own resolution (not the source photo's
// full resolution) so every cropped photo is a consistent, predictable size.
export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export const getCroppedImageBlob = async (
  imageSrc: string,
  pixelCrop: PixelCrop,
  outputWidth = 1000
): Promise<Blob> => {
  const image = await loadImage(imageSrc);

  const outputHeight = Math.round(outputWidth * (pixelCrop.height / pixelCrop.width));

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas is empty'));
      },
      'image/jpeg',
      0.9
    );
  });
};
