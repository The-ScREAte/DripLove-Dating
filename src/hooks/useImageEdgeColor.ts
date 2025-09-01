import { useState, useEffect } from 'react';

interface EdgeColorOptions {
  sampleSize?: number;
  threshold?: number;
}

export const useImageEdgeColor = (imageUrl: string, options: EdgeColorOptions = {}) => {
  const [edgeColor, setEdgeColor] = useState<string>('#000000');
  const [isLoading, setIsLoading] = useState(false);

  const { sampleSize = 20, threshold = 10 } = options;

  useEffect(() => {
    if (!imageUrl) {
      setEdgeColor('#000000');
      return;
    }

    setIsLoading(true);

    const extractEdgeColor = () => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            setEdgeColor('#000000');
            setIsLoading(false);
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const pixels = imageData.data;
          
          const edgePixels: number[][] = [];
          
          // Sample pixels from all four edges
          for (let i = 0; i < sampleSize; i++) {
            // Top edge
            const topX = Math.floor((i / sampleSize) * canvas.width);
            const topIndex = (0 * canvas.width + topX) * 4;
            if (topIndex < pixels.length) {
              edgePixels.push([pixels[topIndex], pixels[topIndex + 1], pixels[topIndex + 2]]);
            }
            
            // Bottom edge
            const bottomX = Math.floor((i / sampleSize) * canvas.width);
            const bottomIndex = ((canvas.height - 1) * canvas.width + bottomX) * 4;
            if (bottomIndex < pixels.length) {
              edgePixels.push([pixels[bottomIndex], pixels[bottomIndex + 1], pixels[bottomIndex + 2]]);
            }
            
            // Left edge
            const leftY = Math.floor((i / sampleSize) * canvas.height);
            const leftIndex = (leftY * canvas.width + 0) * 4;
            if (leftIndex < pixels.length) {
              edgePixels.push([pixels[leftIndex], pixels[leftIndex + 1], pixels[leftIndex + 2]]);
            }
            
            // Right edge
            const rightY = Math.floor((i / sampleSize) * canvas.height);
            const rightIndex = (rightY * canvas.width + (canvas.width - 1)) * 4;
            if (rightIndex < pixels.length) {
              edgePixels.push([pixels[rightIndex], pixels[rightIndex + 1], pixels[rightIndex + 2]]);
            }
          }
          
          if (edgePixels.length === 0) {
            setEdgeColor('#000000');
            setIsLoading(false);
            return;
          }

          // Calculate average color from edge pixels
          let totalR = 0, totalG = 0, totalB = 0;
          let validPixels = 0;

          edgePixels.forEach(([r, g, b]) => {
            // Filter out completely black or white pixels (likely padding/borders)
            if ((r > threshold && g > threshold && b > threshold) && 
                (r < 255 - threshold || g < 255 - threshold || b < 255 - threshold)) {
              totalR += r;
              totalG += g;
              totalB += b;
              validPixels++;
            }
          });

          if (validPixels === 0) {
            // Fallback to all edge pixels if filtering removed everything
            edgePixels.forEach(([r, g, b]) => {
              totalR += r;
              totalG += g;
              totalB += b;
            });
            validPixels = edgePixels.length;
          }

          const avgR = Math.round(totalR / validPixels);
          const avgG = Math.round(totalG / validPixels);
          const avgB = Math.round(totalB / validPixels);

          // Convert to hex
          const hexColor = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;
          setEdgeColor(hexColor);
          
        } catch (error) {
          console.warn('Error extracting edge color:', error);
          setEdgeColor('#000000');
        } finally {
          setIsLoading(false);
        }
      };

      img.onerror = () => {
        setEdgeColor('#000000');
        setIsLoading(false);
      };

      img.src = imageUrl;
    };

    extractEdgeColor();
  }, [imageUrl, sampleSize, threshold]);

  return { edgeColor, isLoading };
};