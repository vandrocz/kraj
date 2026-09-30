// ============================================================
// Cloudflare Pages Function — dynamické OG meta tagy pre boty
// ============================================================

const API_BASE = 'https://naskraj-api.vandrocz-contact.workers.dev';
const SITE_URL = 'https://naskraj.vandro.cz';
const DEFAULT_IMAGE = 'https://cdn.vandro.cz/Untitled15_20260522160351.png';
const DEFAULT_TITLE = 'VANDRO — regionální platforma';
const DEFAULT_DESC = 'Objevuj hrady, zámky, ubytování a gastro v Česku a na Slovensku. Podpoř regionální projekty.';

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

function buildOgHtml(og) {
  const title = escapeHtml(og.title || DEFAULT_TITLE);
  const description = escapeHtml(og.description || DEFAULT_DESC);
  const image = escapeHtml(og.image || DEFAULT_IMAGE);
  const url = escapeHtml(og.url || SITE_URL);

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="VANDRO">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0;url=${url}">
<link rel="canonical" href="${url}">
</head>
<body>
<p>Přesměrování… <a href="${url}">Pokračovat</a></p>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const ua = request.headers.get('user-agent') || '';
  const pathname = url.pathname;

  if (pathname === '/landing.html' || pathname === '/landing') {
    if (isBot(ua)) {
      return new Response(buildOgHtml({
        title: 'VANDRO — objevuj Česko, podpoř regionální projekty',
        description: 'Hrady, zámky, ubytování a gastro na jednom místě. Každý den jedna koruna na záchranu památek.',
        image: DEFAULT_IMAGE,
        url: `${SITE_URL}/landing.html`,
      }), {
        headers: {
          'content-type': 'text/html; charset=UTF-8',
          'cache-control': 'public, max-age=3600',
        },
      });
    }
    return next();
  }

  const postId = url.searchParams.get('post');
  const profile = url.searchParams.get('profile');
  const eventId = url.searchParams.get('event');
  const hashtag = url.searchParams.get('hashtag');

  if (!postId && !profile && !eventId && !hashtag) {
    if (isBot(ua) && pathname === '/') {
      return new Response(buildOgHtml({
        title: DEFAULT_TITLE,
        description: DEFAULT_DESC,
        image: DEFAULT_IMAGE,
        url: SITE_URL,
      }), {
        headers: {
          'content-type': 'text/html; charset=UTF-8',
          'cache-control': 'public, max-age=300',
        },
      });
    }
    return next();
  }

  if (!isBot(ua)) return next();

  let og = {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    image: DEFAULT_IMAGE,
    url: SITE_URL,
  };

  let ogUrl = null;
  if (postId) ogUrl = `${API_BASE}/api/seo/og?type=post&id=${encodeURIComponent(postId)}`;
  else if (eventId) ogUrl = `${API_BASE}/api/seo/og?type=event&id=${encodeURIComponent(eventId)}`;
  else if (profile) {
    const [kind, id] = profile.split(':');
    if (kind && id) ogUrl = `${API_BASE}/api/seo/og?type=profile&kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`;
  } else if (hashtag) {
    og.title = `#${hashtag} — VANDRO`;
    og.description = `Příspěvky s hashtagem #${hashtag} na VANDRO.`;
    og.url = `${SITE_URL}/?hashtag=${encodeURIComponent(hashtag)}`;
  }

  if (ogUrl) {
    const got = await fetchOg(ogUrl);
    if (got) og = { ...og, ...got };
  }

  return new Response(buildOgHtml(og), {
    headers: {
      'content-type': 'text/html; charset=UTF-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
