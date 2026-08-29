// Nastav si reálnu adresu API po nasadení Workera.
const API_BASE_URL = 'https://api.kraj.vandro.cz';

function getAuthToken() {
  return localStorage.getItem('vandro_token');
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API chyba (${res.status})`);
  }
  return res.json();
}

// Skúsi načítať live feed z API; ak zlyhá (napr. offline, API ešte nenasadené),
// potichu použije lokálne ukážkové dáta z data.js, aby appka fungovala aj samostatne.
async function loadFeedFromApi() {
  try {
    const data = await apiFetch('/api/feed');
    return data.feed;
  } catch (err) {
    console.warn('Živé API nedostupné, používam ukážkové dáta:', err.message);
    return null;
  }
}

async function likeProjectOnApi(projectId) {
  try {
    return await apiFetch(`/api/projects/${projectId}/like`, { method: 'POST' });
  } catch (err) {
    console.warn('Lajk sa nepodarilo odoslať na API (ukážkový režim):', err.message);
    return null;
  }
}

async function postCommentToApi(postId, text) {
  try {
    return await apiFetch(`/api/feed/${postId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.warn('Komentár sa nepodarilo odoslať na API (ukážkový režim):', err.message);
    return null;
  }
}
