let _geoWatchId = null;

async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolokace není podporována.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error('Nepodařilo se získat polohu.')),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

async function attachLocationToPost() {
  try {
    const { lat, lng } = await getCurrentLocation();
    const data = await apiGet(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
    const place = data.place || `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
    return { lat, lng, place };
  } catch (err) {
    showToast(err.message);
    return null;
  }
}

async function saveMyLocation() {
  try {
    const { lat, lng } = await getCurrentLocation();
    const data = await apiGet(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
    await apiPost('/api/geo/save', { lat, lng, place: data.place || '' });
    if (state.user) { state.user.geo_city = data.place || ''; setStoredUser(state.user); }
    showToast('Poloha uložena.');
  } catch (err) { showToast(err.message); }
}

// Forward geocoding — nájde reálne miesta/adresy podľa textu
// Používa Nominatim (OpenStreetMap) — zdarma, bez API kľúča.
async function searchPlaces(query, limit = 5) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&accept-language=cs,sk&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((r) => {
      const parts = (r.display_name || '').split(',').map((s) => s.trim()).filter(Boolean);
      // Krátky label: prvé 2-3 časti (názov + mesto/obec)
      const short = parts.slice(0, 3).join(', ');
      return {
        place: short || r.display_name,
        display_name: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      };
    }).filter((r) => !isNaN(r.lat) && !isNaN(r.lng));
  } catch (err) {
    console.warn('searchPlaces error:', err);
    return [];
  }
}
