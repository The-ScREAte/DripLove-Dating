/**
 * Performance Monitoring Script for Android/iOS Comparison
 * 
 * Run this in the browser console to measure app performance
 * Compare metrics between Android and iOS devices
 */

(() => {
  console.log('🚀 Performance Monitoring Started...\n');

  const metrics = {
    platform: /Android/i.test(navigator.userAgent) ? 'Android' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iOS' : 'Desktop',
    deviceMemory: navigator.deviceMemory || 'unknown',
    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
    connection: navigator.connection?.effectiveType || 'unknown',
    
    // Performance metrics
    domContentLoaded: 0,
    firstPaint: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    timeToInteractive: 0,
    totalBlockingTime: 0,
    cumulativeLayoutShift: 0,
    
    // Memory metrics
    jsHeapSize: 0,
    jsHeapLimit: 0,
    
    // Custom metrics
    imageLoadTime: 0,
    apiResponseTime: 0,
    rerenderCount: 0,
    
    // Resource metrics
    totalResources: 0,
    totalTransferSize: 0,
    totalResourceDuration: 0
  };

  // Measure Navigation Timing
  if (performance.timing) {
    const timing = performance.timing;
    metrics.domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
  }

  // Measure Paint Timing
  if (performance.getEntriesByType) {
    const paintEntries = performance.getEntriesByType('paint');
    paintEntries.forEach(entry => {
      if (entry.name === 'first-paint') {
        metrics.firstPaint = entry.startTime;
      }
      if (entry.name === 'first-contentful-paint') {
        metrics.firstContentfulPaint = entry.startTime;
      }
    });

    // Measure Resource Loading
    const resources = performance.getEntriesByType('resource');
    metrics.totalResources = resources.length;
    metrics.totalTransferSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
    metrics.totalResourceDuration = resources.reduce((sum, r) => sum + r.duration, 0);
  }

  // Measure LCP
  if ('PerformanceObserver' in window) {
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        metrics.largestContentfulPaint = lastEntry.startTime;
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // Measure CLS
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
            metrics.cumulativeLayoutShift = clsValue;
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });

      // Measure Long Tasks (TBT)
      let tbtValue = 0;
      const tbtObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            tbtValue += entry.duration - 50;
            metrics.totalBlockingTime = tbtValue;
          }
        }
      });
      tbtObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      console.warn('Some performance observers not supported');
    }
  }

  // Measure Memory
  if (performance.memory) {
    const memory = performance.memory;
    metrics.jsHeapSize = Math.round(memory.usedJSHeapSize / 1024 / 1024);
    metrics.jsHeapLimit = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
  }

  // Custom Image Load Time Measurement
  window.addEventListener('load', () => {
    const images = document.querySelectorAll('img');
    let totalImageTime = 0;
    let loadedImages = 0;

    images.forEach(img => {
      if (img.complete) {
        loadedImages++;
      }
    });

    if (loadedImages > 0) {
      const imageResources = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'img');
      totalImageTime = imageResources.reduce((sum, r) => sum + r.duration, 0);
      metrics.imageLoadTime = Math.round(totalImageTime / imageResources.length);
    }
  });

  // Print Results after 5 seconds
  setTimeout(() => {
    console.log('\n📊 PERFORMANCE REPORT\n');
    console.log('═══════════════════════════════════════\n');
    
    console.log('📱 DEVICE INFO:');
    console.log(`   Platform: ${metrics.platform}`);
    console.log(`   Memory: ${metrics.deviceMemory} GB`);
    console.log(`   CPU Cores: ${metrics.hardwareConcurrency}`);
    console.log(`   Connection: ${metrics.connection}\n`);
    
    console.log('⚡ LOADING METRICS:');
    console.log(`   DOM Content Loaded: ${metrics.domContentLoaded}ms`);
    console.log(`   First Paint: ${Math.round(metrics.firstPaint)}ms`);
    console.log(`   First Contentful Paint: ${Math.round(metrics.firstContentfulPaint)}ms`);
    console.log(`   Largest Contentful Paint: ${Math.round(metrics.largestContentfulPaint)}ms\n`);
    
    console.log('🎯 CORE WEB VITALS:');
    console.log(`   LCP: ${Math.round(metrics.largestContentfulPaint)}ms ${metrics.largestContentfulPaint < 2500 ? '✅ GOOD' : metrics.largestContentfulPaint < 4000 ? '⚠️ NEEDS IMPROVEMENT' : '❌ POOR'}`);
    console.log(`   TBT: ${Math.round(metrics.totalBlockingTime)}ms ${metrics.totalBlockingTime < 200 ? '✅ GOOD' : metrics.totalBlockingTime < 600 ? '⚠️ NEEDS IMPROVEMENT' : '❌ POOR'}`);
    console.log(`   CLS: ${metrics.cumulativeLayoutShift.toFixed(3)} ${metrics.cumulativeLayoutShift < 0.1 ? '✅ GOOD' : metrics.cumulativeLayoutShift < 0.25 ? '⚠️ NEEDS IMPROVEMENT' : '❌ POOR'}\n`);
    
    console.log('💾 MEMORY USAGE:');
    console.log(`   JS Heap Used: ${metrics.jsHeapSize} MB`);
    console.log(`   JS Heap Limit: ${metrics.jsHeapLimit} MB`);
    console.log(`   Memory Usage: ${((metrics.jsHeapSize / metrics.jsHeapLimit) * 100).toFixed(1)}%\n`);
    
    console.log('📦 RESOURCES:');
    console.log(`   Total Resources: ${metrics.totalResources}`);
    console.log(`   Transfer Size: ${(metrics.totalTransferSize / 1024).toFixed(2)} KB`);
    console.log(`   Avg Load Time: ${Math.round(metrics.totalResourceDuration / metrics.totalResources)}ms\n`);
    
    if (metrics.imageLoadTime > 0) {
      console.log('🖼️ IMAGES:');
      console.log(`   Avg Image Load: ${metrics.imageLoadTime}ms\n`);
    }
    
    console.log('═══════════════════════════════════════\n');
    
    // Overall Score
    let score = 100;
    if (metrics.largestContentfulPaint > 4000) score -= 20;
    else if (metrics.largestContentfulPaint > 2500) score -= 10;
    
    if (metrics.totalBlockingTime > 600) score -= 20;
    else if (metrics.totalBlockingTime > 200) score -= 10;
    
    if (metrics.cumulativeLayoutShift > 0.25) score -= 20;
    else if (metrics.cumulativeLayoutShift > 0.1) score -= 10;
    
    if (metrics.jsHeapSize / metrics.jsHeapLimit > 0.8) score -= 15;
    else if (metrics.jsHeapSize / metrics.jsHeapLimit > 0.6) score -= 5;
    
    console.log(`🎯 OVERALL SCORE: ${score}/100 ${score >= 90 ? '🟢 EXCELLENT' : score >= 70 ? '🟡 GOOD' : score >= 50 ? '🟠 FAIR' : '🔴 POOR'}\n`);
    
    // Platform-specific recommendations
    if (metrics.platform === 'Android') {
      console.log('📱 ANDROID-SPECIFIC RECOMMENDATIONS:');
      if (metrics.largestContentfulPaint > 3000) {
        console.log('   ⚠️ LCP is slow - reduce image sizes');
      }
      if (metrics.totalBlockingTime > 300) {
        console.log('   ⚠️ High TBT - reduce JavaScript execution');
      }
      if (metrics.jsHeapSize > 100) {
        console.log('   ⚠️ High memory usage - optimize data structures');
      }
      console.log();
    }
    
    // Export data
    window.__performanceMetrics = metrics;
    console.log('💾 Metrics saved to window.__performanceMetrics');
    console.log('   Copy with: copy(__performanceMetrics)\n');
  }, 5000);

  console.log('⏳ Collecting metrics... (will report in 5 seconds)\n');
})();
