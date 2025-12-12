// Video preloader utility for performance optimization

class VideoPreloader {
  private preloadedUrls: Set<string> = new Set();

  preload(url: string): void {
    if (this.preloadedUrls.has(url)) return;
    
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'video';
    link.href = url;
    document.head.appendChild(link);
    
    this.preloadedUrls.add(url);
  }

  preloadMultiple(urls: string[]): void {
    urls.forEach(url => this.preload(url));
  }

  isPreloaded(url: string): boolean {
    return this.preloadedUrls.has(url);
  }
}

export const videoPreloader = new VideoPreloader();
