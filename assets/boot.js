// Spuštění aplikace a registrace service workeru (dříve inline skript v index.html, kvůli CSP bez 'unsafe-inline')
if (typeof initI18n === 'function') initI18n();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW:', e));
    // Nová verze service workeru převzala řízení: jednou stránku načíst znovu, aby se projevily nové soubory
    let _swReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (_swReloaded || !sessionStorage.getItem('vandro_sw_seen')) { sessionStorage.setItem('vandro_sw_seen', '1'); return; }
      _swReloaded = true; location.reload();
    });
  });
}
