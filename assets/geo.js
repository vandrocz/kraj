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
