// Extrakcia a normalizácia hashtagov
// Podporuje diakritiku, limit 8 hashtagov na príspevok, dĺžka 2–40 znakov

export function extractHashtags(text) {
  if (!text) return [];
  const t = String(text);
  const re = /#([a-zA-Z0-9_áäčďéěíľĺňóôŕřšťúůýžÁÄČĎÉĚÍĽĹŇÓÔŔŘŠŤÚŮÝŽ]{2,40})/g;
  const set = new Set();
  let m;
  while ((m = re.exec(t))) {
    const tag = m[1].toLowerCase();
    set.add(tag);
    if (set.size >= 8) break;
  }
  return [...set];
}

export function normalizeHashtag(tag) {
  return String(tag || '')
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9_áäčďéěíľĺňóôŕřšťúůýž]/g, '')
    .slice(0, 40);
}
