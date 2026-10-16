// Čištění a kontrola textů, které uživatelé ukládají do profilů a podniků.

// Povolí jen http(s) adresy. Bez schématu doplní https://, cokoli jiného (např. javascript:) zahodí.
export function sanitizeWebsite(value) {
  const s = (value == null ? '' : String(value)).trim().slice(0, 300);
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch { return null; }
}

// Odstraní řídicí znaky, ořízne mezery a délku. Prázdný výsledek → null.
export function cleanText(value, max) {
  if (value == null) return null;
  const s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
  return s || null;
}

export function cleanPhone(value) {
  const s = cleanText(value, 30);
  if (!s) return null;
  return /^[0-9+()\-./\s]{3,30}$/.test(s) ? s : null;
}
