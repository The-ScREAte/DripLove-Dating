// Android-specific viewport fix to match iOS behavior exactly

export const fixAndroidViewport = () => {
  // Only run on Android
  const isAndroid = /Android/i.test(navigator.userAgent);
  if (!isAndroid) return;

  // Force viewport meta tag to exact iOS behavior
  const viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement;
  if (viewportMeta) {
    viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  }

  // Force document and body to fill viewport exactly like iOS
  const applyViewportFix = () => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    // Reset everything to zero first
    [html, body, root].forEach(el => {
      if (el) {
        el.style.margin = '0';
        el.style.padding = '0';
        el.style.border = 'none';
        el.style.outline = 'none';
      }
    });

    // Set exact dimensions
    if (html) {
      html.style.width = '100vw';
      html.style.height = '100vh';
      html.style.maxWidth = '100vw';
      html.style.maxHeight = '100vh';
      html.style.overflow = 'hidden';
      html.style.position = 'fixed';
      html.style.top = '0';
      html.style.left = '0';
    }

    if (body) {
      body.style.width = '100vw';
      body.style.height = '100vh';
      body.style.maxWidth = '100vw';
      body.style.maxHeight = '100vh';
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = '0';
      body.style.left = '0';
    }

    if (root) {
      root.style.width = '100vw';
      root.style.height = '100vh';
      root.style.maxWidth = '100vw';
      root.style.maxHeight = '100vh';
      root.style.overflow = 'hidden';
      root.style.position = 'relative';
    }

    // Force all immediate children to respect full width
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
      const element = el as HTMLElement;
      const computedStyle = window.getComputedStyle(element);
      
      // If element has max-width constraints, remove them
      if (computedStyle.maxWidth && computedStyle.maxWidth !== 'none' && computedStyle.maxWidth !== '100vw') {
        element.style.maxWidth = '100vw';
      }
      
      // If element is centered with margins, force full width
      if (computedStyle.marginLeft === 'auto' && computedStyle.marginRight === 'auto') {
        element.style.marginLeft = '0';
        element.style.marginRight = '0';
        element.style.width = '100vw';
      }
    });
  };

  // Apply immediately
  applyViewportFix();

  // Reapply on window resize (Android orientation changes)
  window.addEventListener('resize', applyViewportFix);
  
  // Reapply when DOM changes (React re-renders)
  const observer = new MutationObserver(() => {
    setTimeout(applyViewportFix, 0);
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });

  // Reapply periodically to catch any dynamic changes
  setInterval(applyViewportFix, 1000);
};

// Don't auto-initialize to prevent crashes
// Let components manually call fixAndroidViewport when needed
