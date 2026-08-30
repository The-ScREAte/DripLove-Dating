import React, { useCallback, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { getCroppedImageBlob } from '@/utils/cropImage';

interface CropModalProps {
  imageUrl: string;
  /** width / height, e.g. 3/4 for a tall portrait frame. */
  aspect: number;
  title?: string;
  helperText?: string;
  onCancel: () => void;
  onCropped: (blob: Blob) => void | Promise<void>;
}

/**
 * Generic, standalone crop UI - no coupling to any table/bucket, so it's
 * reusable anywhere a "pick a rect out of this image" step is needed (profile
 * photos have their own flow in PhotoCropModal.tsx with upload/DB-update logic
 * built in; this is the plain building block for everything else, e.g. ad
 * images in the admin panel).
 */
const CropModal: React.FC<CropModalProps> = ({
  imageUrl,
  aspect,
  title = 'Crop Image',
  helperText = 'Drag to reposition, pinch or use the slider to zoom.',
  onCancel,
  onCropped,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels || isProcessing) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedImageBlob(imageUrl, croppedAreaPixels);
      await onCropped(blob);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isProcessing && onCancel()}>
      <DialogContent className="sm:max-w-md bg-black border border-pink-500/30 text-white p-4">
        <DialogHeader>
          <DialogTitle className="text-white">{title}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-white -mt-2 mb-1">{helperText}</p>

        <div className="relative w-full rounded-lg overflow-hidden bg-neutral-900" style={{ height: 360 }}>
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            showGrid
            cropShape="rect"
          />
        </div>

        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs text-white shrink-0">Zoom</span>
          <Slider value={[zoom]} onValueChange={(v) => setZoom(v[0])} min={1} max={3} step={0.01} className="w-full" />
        </div>

        <div className="flex flex-row items-center justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="w-auto h-9 px-4 bg-white border-pink-500/30 text-black hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing || !croppedAreaPixels}
            className="w-auto h-9 px-4 bg-pink-600 hover:bg-pink-700 text-white"
          >
            {isProcessing ? 'Processing...' : 'OK'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CropModal;
