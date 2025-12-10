
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, CarouselApi } from '@/components/ui/carousel';

interface ImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
}

const ImageViewer = ({ isOpen, onClose, images, initialIndex = 0 }: ImageViewerProps) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(initialIndex);

  useEffect(() => {
    if (!api) return;

    setCurrent(initialIndex);
    api.scrollTo(initialIndex);
  }, [api, initialIndex, isOpen]);

  useEffect(() => {
    if (!api) return;

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  if (!images || images.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogTitle className="sr-only">Image Viewer</DialogTitle>
      <DialogDescription className="sr-only">View and navigate through user photos</DialogDescription>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 bg-black/95">
        <div className="relative w-full h-full">
          {/* Close button */}
          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </Button>

          {/* Image counter */}
          {images.length > 1 && (
            <div className="absolute top-4 left-4 z-50 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
              {current + 1} / {images.length}
            </div>
          )}

          <Carousel setApi={setApi} className="w-full h-[80vh]">
            <CarouselContent>
              {images.map((image, index) => (
                <CarouselItem key={index}>
                  <div className="flex items-center justify-center h-[80vh] p-4">
                    <img loading="lazy" decoding="async"
                      src={image}
                      alt={`Image ${index + 1}`}
                      className="max-w-full max-h-full object-contain rounded-lg"
                    />
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            
            {images.length > 1 && (
              <>
                <CarouselPrevious className="left-4 bg-black/50 border-white/20 text-white hover:bg-black/70" />
                <CarouselNext className="right-4 bg-black/50 border-white/20 text-white hover:bg-black/70" />
              </>
            )}
          </Carousel>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageViewer;
