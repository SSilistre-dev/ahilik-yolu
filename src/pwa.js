// PWA glue: portrait lock when installed, service worker registration, idle-time asset precache (AHI-036).
export function initPwa() {
  try {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone) screen.orientation?.lock?.('portrait').catch(() => {});
    if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) return;
    navigator.serviceWorker.register('sw.js').then(() => {
      const go = () => {
        const c = navigator.connection;
        if (!navigator.onLine || c?.saveData || ['slow-2g', '2g'].includes(c?.effectiveType)) return;
        navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: 'PRECACHE' }));
      };
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 4000));
      if (document.readyState === 'complete') idle(go); else addEventListener('load', () => idle(go), { once: true });
    }).catch(() => {});
  } catch { /* PWA features are optional */ }
}
