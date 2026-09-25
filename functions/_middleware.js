// ============================================================
// Cloudflare Pages Function — dynamické OG meta tagy pre boty
// Beží na edge pre každý request. Ak ide o socialbota, vráti HTML
// s dynamickými OG tagmi pre zdieľanie.
// ============================================================

const API_BASE = 'https://naskraj-api.vandrocz-contact.workers.dev';
const SITE_URL = 'https://naskraj.vandro.cz';
const DEFAULT_IMAGE = 'https://cdn.vandro.cz/Untitled15_20260522160351.png';

function isBot(ua) {
  return /facebookexternalhit|twitterbot|whatsapp|telegrambot|slackbot|discordbot|linkedinbot|pinterest|applebot|googlebot|bingbot|embedly|quora|outbrain|vkshare|w3c_validator|redditbot|skypeuripreview|seznam|duckduckbot/i.test(ua || '');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function fetchOg(apiUrl) {
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';

  const postId = url.searchParams.get('post');
  const profile = url.searchParams.get('profile');
  const eventId = url.searchParams.get('event');

  if (!postId && !profile && !eventId) return next();
  if (!isBot(ua)) return next();

  let og = {
    title: 'Náš kraj — regionální platforma',
    description: 'Objevuj hrady, zámky, ubytování a gastro v Česku.',
    image: DEFAULT_IMAGE,
    url: SITE_URL,
  };

  let ogUrl = null;
  if (postId) ogUrl = `${API_BASE}/api/seo/og?type=post&id=${encodeURIComponent(postId)}`;
  else if (eventId) ogUrl = `${API_BASE}/api/seo/og?type=event&id=${encodeURIComponent(eventId)}`;
  else if (profile) {
    const [kind, id] = profile.split(':');
    if (kind && id) ogUrl = `${API_BASE}/api/seo/og?type=profile&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;
  }

  if (ogUrl) {
    const got = await fetchOg(ogUrl);
    if (got) og = { ...og, ...got };
  }

  const html = `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(og.title)}</title>
<meta name="description" content="${escapeHtml(og.description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(og.title)}">
<meta property="og:description" content="${escapeHtml(og.description)}">
<meta property="og:image" content="${escapeHtml(og.image)}">
<meta property="og:url" content="${escapeHtml(og.url || SITE_URL)}">
<meta property="og:site_name" content="Náš kraj">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(og.title)}">
<meta name="twitter:description" content="${escapeHtml(og.description)}">
<meta name="twitter:image" content="${escapeHtml(og.image)}">
<meta http-equiv="refresh" content="0;url=${escapeHtml(og.url || SITE_URL)}">
</head>
<body>
<p>Přesměrování… <a href="${escapeHtml(og.url || SITE_URL)}">Pokračovat</a></p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
