// ============================================================
// WEB PUSH — registrácia a subscription
// ============================================================

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (err) {
    console.warn('[push] SW registrácia zlyhala:', err);
    return null;
  }
}

async function maybeSubscribePush() {
  if (!isLoggedIn()) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'denied') return;

  // Skontroluj, či už nie je subscribed
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      // Zaregistruj na serveri (refresh)
      await apiPost('/api/push/subscribe', sub.toJSON()).catch(() => {});
      state._pushSubscribed = true;
      return;
    }
  } catch {}
}

async function enablePushNotifications() {
  if (!isLoggedIn()) { showToast('Musíš být přihlášen.'); return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('Tvůj prohlížeč nepodporuje push notifikace.');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { showToast('Notifikace zamítnuty.'); return; }

    const reg = await registerServiceWorker();
    if (!reg) { showToast('Chyba při registraci service workeru.'); return; }

    const res = await apiGet('/api/push/vapid-public-key');
    const publicKey = res.publicKey;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await apiPost('/api/push/subscribe', sub.toJSON());
    state._pushSubscribed = true;
    showToast('Notifikace zapnuty! 🔔');
    renderApp();
  } catch (err) {
    console.error('[push] chyba:', err);
    showToast('Nepodařilo se zapnout notifikace.');
  }
}

async function disablePushNotifications() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await apiPost('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
    state._pushSubscribed = false;
    showToast('Notifikace vypnuty.');
    renderApp();
  } catch (err) {
    showToast('Chyba: ' + err.message);
  }
}

async function testPush() {
  try {
    const r = await apiPost('/api/push/test', {});
    showToast(`Test: odesláno ${r.sent || 0} / ${r.total || 0}`);
  } catch (err) { showToast(err.message); }
}
