import { newId } from './auth.js';

export const BADGE_DEFS = {
  traveler: { name: 'Cestovatel', icon: 'compass', tiers: [1, 5, 10, 25, 50, 100], description: 'Navštívená místa', compute: (s) => s.totalCheckins },
  castle_lord: { name: 'Hradní pán', icon: 'castle', tiers: [1, 5, 15, 30], description: 'Navštívené hrady', compute: (s) => s.castles },
  chateau: { name: 'Zámecký', icon: 'landmark', tiers: [1, 5, 15, 30], description: 'Navštívené zámky', compute: (s) => s.chateaux },
  museum_rat: { name: 'Muzejní krysa', icon: 'bookmark', tiers: [3, 10, 25], description: 'Navštívená muzea', compute: (s) => s.museums },
  zoo_fan: { name: 'ZOO nadšenec', icon: 'heart', tiers: [1, 3, 6], description: 'Navštívené ZOO', compute: (s) => s.zoos },
  gourmet: { name: 'Gurmán', icon: 'utensils', tiers: [5, 15, 40, 100], description: 'Navštívené restaurace', compute: (s) => s.restaurants },
  beer_lover: { name: 'Pivní znalec', icon: 'coffee', tiers: [3, 10, 25], description: 'Navštívené pivovary', compute: (s) => s.breweries },
  sleeper: { name: 'Nocležník', icon: 'bed', tiers: [3, 10, 25], description: 'Navštívená ubytování', compute: (s) => s.accommodations },
  reviewer: { name: 'Recenzent', icon: 'comment', tiers: [1, 5, 25, 100], description: 'Napsané recenze', compute: (s) => s.reviews },
  photographer: { name: 'Fotograf', icon: 'image', tiers: [5, 25, 100], description: 'Nahrané fotky z návštěv', compute: (s) => s.photos },
  explorer: { name: 'Objevitel krajů', icon: 'mapPin', tiers: [3, 7, 14], description: 'Navštívené kraje', compute: (s) => s.regions },
};

const ORG_TYPE_TO_COUNTER = {
  hrad: 'castles', zamek: 'chateaux', muzeum: 'museums', zoo: 'zoos',
  lyzarske_stredisko: 'skiResorts', galerie: 'galleries', prirodni_pamatka: 'naturalSites',
};
const REST_TYPE_TO_COUNTER = { restaurace: 'restaurants', kavarna: 'cafes', hospoda: 'pubs', pivovar: 'breweries' };

export async function computeUserStats(env, userId) {
  const stats = {
    totalCheckins: 0, castles: 0, chateaux: 0, museums: 0, zoos: 0, skiResorts: 0, galleries: 0, naturalSites: 0,
    restaurants: 0, cafes: 0, pubs: 0, breweries: 0, accommodations: 0,
    reviews: 0, photos: 0, regions: 0,
  };

  const { results: checkins } = await env.DB.prepare(
    `SELECT checkins.id, checkins.business_kind, checkins.image_url,
            o.type AS org_type, o.region AS org_region,
            a.type AS acc_type, a.region AS acc_region,
            r.type AS rest_type, r.region AS rest_region
     FROM checkins
     LEFT JOIN organizations o ON o.id = checkins.business_id AND checkins.business_kind = 'organizations'
     LEFT JOIN accommodation a ON a.id = checkins.business_id AND checkins.business_kind = 'accommodation'
     LEFT JOIN restaurants r ON r.id = checkins.business_id AND checkins.business_kind = 'restaurants'
     WHERE checkins.user_id = ?`,
  ).bind(userId).all();

  const regions = new Set();
  for (const c of checkins) {
    if (c.image_url) stats.photos++;
    if (c.business_kind === 'organizations') {
      const counter = ORG_TYPE_TO_COUNTER[c.org_type];
      if (counter) stats[counter]++;
      if (c.org_region) regions.add(c.org_region);
    } else if (c.business_kind === 'accommodation') {
      stats.accommodations++;
      if (c.acc_region) regions.add(c.acc_region);
    } else if (c.business_kind === 'restaurants') {
      const counter = REST_TYPE_TO_COUNTER[c.rest_type];
      if (counter) stats[counter]++;
      if (c.rest_region) regions.add(c.rest_region);
    }
  }
  stats.totalCheckins = checkins.length;
  stats.regions = regions.size;

  const reviewsCount = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM reviews WHERE user_id = ? AND status = 'published'`,
  ).bind(userId).first();
  stats.reviews = reviewsCount?.n || 0;

  return stats;
}

function levelFromCount(count, tiers) {
  let level = 0;
  for (const t of tiers) { if (count >= t) level++; else break; }
  return level;
}

export async function computeUserBadges(env, userId) {
  const stats = await computeUserStats(env, userId);
  const newBadges = [];

  const { results: existing } = await env.DB.prepare(
    `SELECT badge_key, level FROM user_badges WHERE user_id = ?`,
  ).bind(userId).all();
  const existingMap = new Map(existing.map((e) => [e.badge_key, e.level]));

  for (const [key, def] of Object.entries(BADGE_DEFS)) {
    const count = def.compute(stats) || 0;
    const level = levelFromCount(count, def.tiers);
    const oldLevel = existingMap.get(key) || 0;

    if (level > oldLevel) {
      if (existingMap.has(key)) {
        await env.DB.prepare(
          `UPDATE user_badges SET level = ?, progress = ?, updated_at = datetime('now') WHERE user_id = ? AND badge_key = ?`,
        ).bind(level, count, userId, key).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO user_badges (id, user_id, badge_key, progress, level) VALUES (?, ?, ?, ?, ?)`,
        ).bind(newId('badge'), userId, key, count, level).run();
      }
      newBadges.push({ key, name: def.name, level, icon: def.icon });
    } else if (existingMap.has(key)) {
      await env.DB.prepare(
        `UPDATE user_badges SET progress = ?, updated_at = datetime('now') WHERE user_id = ? AND badge_key = ?`,
      ).bind(count, userId, key).run();
    }
  }

  return newBadges;
}

export async function getUserBadges(env, userId) {
  await computeUserBadges(env, userId);
  const stats = await computeUserStats(env, userId);

  const { results } = await env.DB.prepare(
    `SELECT badge_key, level, progress, earned_at FROM user_badges WHERE user_id = ? AND level > 0 ORDER BY level DESC, earned_at ASC`,
  ).bind(userId).all();

  return results.map((r) => {
    const def = BADGE_DEFS[r.badge_key];
    if (!def) return null;
    const count = def.compute(stats) || 0;
    const nextTierIdx = def.tiers.findIndex((t) => t > count);
    const nextTier = nextTierIdx >= 0 ? def.tiers[nextTierIdx] : null;
    return {
      key: r.badge_key, name: def.name, icon: def.icon, description: def.description,
      level: r.level, max_level: def.tiers.length,
      progress: count, next_tier: nextTier, earned_at: r.earned_at,
    };
  }).filter(Boolean);
}