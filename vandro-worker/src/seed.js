import { hashPassword, newId } from './auth.js';

export async function seedTestContent(env) {
  const result = { users: 0, businesses: 0, posts: 0, events: 0, reviews: 0, checkins: 0, follows: 0, stories: 0 };

  const { hash, salt } = await hashPassword('testtest123');

  // ====== 8 testovacích užívateľov ======
  const users = [
    { id: 'test_user_1', email: 'test1@test.local', name: 'Jan Testovací', handle: 'jan', role: 'user', bio: 'Rád cestuju po Česku a fotím hrady.' },
    { id: 'test_user_2', email: 'test2@test.local', name: 'Petra Cestovatelka', handle: 'petra', role: 'user', bio: 'Hledám skryté poklady po celé zemi.' },
    { id: 'test_user_3', email: 'test3@test.local', name: 'Tomáš Turista', handle: 'tomas', role: 'user', bio: 'Víkendy trávím na horách.' },
    { id: 'test_user_4', email: 'test4@test.local', name: 'Lucie Gourmet', handle: 'lucie', role: 'user', bio: 'Miluju českou kuchyni.' },
    { id: 'test_user_5', email: 'test5@test.local', name: 'Martin Cyklista', handle: 'martin', role: 'user', bio: 'Cestuju na kole.' },
    { id: 'test_org_1', email: 'hrad@test.local', name: 'Hrad Testov', handle: 'hradtestov', role: 'organization', bio: 'Středověký hrad ze 13. století.' },
    { id: 'test_org_2', email: 'zamek@test.local', name: 'Zámek Testovice', handle: 'zamektestovice', role: 'organization', bio: 'Barokní zámek s krásnou zahradou.' },
    { id: 'test_hotel_1', email: 'hotel@test.local', name: 'Hotel Testov', handle: 'hoteltestov', role: 'hotelier', bio: 'Rodinný hotel v Krkonoších.' },
    { id: 'test_gastro_1', email: 'restaurace@test.local', name: 'Restaurace U Testu', handle: 'utestu', role: 'hotelier', bio: 'Tradiční česká kuchyně.' },
  ];
  for (const u of users) {
    const exists = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(u.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, display_name, handle, role, bio, credit_balance, email_verified, terms_accepted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, datetime('now'))`,
      ).bind(u.id, u.email, hash, salt, u.name, u.handle, u.role, u.bio).run();
      result.users++;
    }
  }

  // ====== 2 organizácie ======
  const orgs = [
    { id: 'test_org_1_biz', user_id: 'test_org_1', name: 'Hrad Testov', type: 'hrad', region: 'Středočeský kraj', district: 'Rakovník', city: 'Křivoklát', description: 'Středověký hrad ze 13. století s bohatou historií. Nabízíme prohlídky, akce pro děti a svatební obřady.', logo: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=400&h=400&fit=crop' },
    { id: 'test_org_2_biz', user_id: 'test_org_2', name: 'Zámek Testovice', type: 'zamek', region: 'Jihočeský kraj', district: 'Český Krumlov', city: 'Český Krumlov', description: 'Barokní zámek obklopený nádhernou zahradou. Pořádáme koncerty, výstavy a historické slavnosti.', logo: 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=400&h=400&fit=crop' },
  ];
  for (const o of orgs) {
    const exists = await env.DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(o.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO organizations (id, user_id, name, type, region, district, city, description, logo_url, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(o.id, o.user_id, o.name, o.type, o.region, o.district, o.city, o.description, o.logo).run();
      result.businesses++;
    }
  }

  // ====== 3 ubytování (hotel, penzion, chata) ======
  const accs = [
    { id: 'test_acc_1', user_id: 'test_hotel_1', name: 'Hotel Testov Krkonoše', type: 'hotel', region: 'Královéhradecký kraj', district: 'Trutnov', city: 'Pec pod Sněžkou', description: 'Rodinný hotel s wellness a výhledem na Sněžku.', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=400&fit=crop', capacity: 40 },
    { id: 'test_acc_2', user_id: 'test_hotel_1', name: 'Penzion Testov', type: 'penzion', region: 'Liberecký kraj', district: 'Semily', city: 'Harrachov', description: 'Útulný penzion v srdci Krkonoš.', image: 'https://images.unsplash.com/photo-1521401830884-6c03c1c87ebb?w=400&h=400&fit=crop', capacity: 16 },
    { id: 'test_acc_3', user_id: 'test_hotel_1', name: 'Chata Testovka', type: 'chata', region: 'Jihočeský kraj', district: 'Prachatice', city: 'Zadov', description: 'Horská chata s vlastní kuchyní a krbem.', image: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&h=400&fit=crop', capacity: 8 },
  ];
  for (const a of accs) {
    const exists = await env.DB.prepare('SELECT id FROM accommodation WHERE id = ?').bind(a.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO accommodation (id, user_id, name, type, region, district, city, description, image_url, capacity, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(a.id, a.user_id, a.name, a.type, a.region, a.district, a.city, a.description, a.image, a.capacity).run();
      result.businesses++;
    }
  }

  // ====== 2 restaurace ======
  const rests = [
    { id: 'test_rest_1', user_id: 'test_gastro_1', name: 'Restaurace U Testu', type: 'restaurace', cuisine_type: 'ceska', region: 'Jihočeský kraj', district: 'Český Krumlov', city: 'Český Krumlov', description: 'Tradiční česká kuchyně v historickém centru.', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=400&fit=crop' },
    { id: 'test_rest_2', user_id: 'test_gastro_1', name: 'Pivovar Testov', type: 'pivovar', cuisine_type: 'ceska', region: 'Středočeský kraj', district: 'Kutná Hora', city: 'Kutná Hora', description: 'Minipivovar s vlastní várkou.', image: 'https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=400&h=400&fit=crop' },
  ];
  for (const r of rests) {
    const exists = await env.DB.prepare('SELECT id FROM restaurants WHERE id = ?').bind(r.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO restaurants (id, user_id, name, type, cuisine_type, region, district, city, description, image_url, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(r.id, r.user_id, r.name, r.type, r.cuisine_type, r.region, r.district, r.city, r.description, r.image).run();
      result.businesses++;
    }
  }

  // ====== 12 príspevkov (mix fotky a bez) ======
  const posts = [
    { id: 'test_post_1', user_id: 'test_org_1', feed: 'organization', biz: 'test_org_1_biz', text: 'Podzimní prohlídky hradu jsou v plném proudu! Poslední vstup v 16:00.', imgs: ['https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&h=600&fit=crop', 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=800&h=600&fit=crop'] },
    { id: 'test_post_2', user_id: 'test_org_1', feed: 'organization', biz: 'test_org_1_biz', text: 'Nové rytířské turnaje pro děti každou sobotu!', imgs: ['https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&h=600&fit=crop'] },
    { id: 'test_post_3', user_id: 'test_org_1', feed: 'organization', biz: 'test_org_1_biz', text: 'V sobotu se koná tradiční noční prohlídka. Vstupenky na místě.', imgs: [] },
    { id: 'test_post_4', user_id: 'test_org_2', feed: 'organization', biz: 'test_org_2_biz', text: 'Zámecká zahrada právě rozkvetla. Přijďte se podívat!', imgs: ['https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=800&h=600&fit=crop'] },
    { id: 'test_post_5', user_id: 'test_org_2', feed: 'organization', biz: 'test_org_2_biz', text: 'Koncert vážné hudby v zámecké kapli tuto neděli v 17:00.', imgs: ['https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=800&h=600&fit=crop'] },
    { id: 'test_post_6', user_id: 'test_hotel_1', feed: 'accommodation', biz: 'test_acc_1', text: 'Podzimní balíček: 3 noci s polopenzí a wellness za zvýhodněnou cenu.', imgs: ['https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop'] },
    { id: 'test_post_7', user_id: 'test_hotel_1', feed: 'accommodation', biz: 'test_acc_1', text: 'Ranní mlha nad Krkonošemi je dnes úchvatná.', imgs: ['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop'] },
    { id: 'test_post_8', user_id: 'test_hotel_1', feed: 'accommodation', biz: 'test_acc_3', text: 'Chata je volná o Vánocích. Rezervujte včas!', imgs: ['https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800&h=600&fit=crop'] },
    { id: 'test_post_9', user_id: 'test_gastro_1', feed: 'gastro', biz: 'test_rest_1', text: 'Dnešní polední menu: svíčková na smetaně nebo houbové rizoto.', imgs: ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop'] },
    { id: 'test_post_10', user_id: 'test_gastro_1', feed: 'gastro', biz: 'test_rest_1', text: 'Máme nový jarní salát s kozím sýrem a vlašskými ořechy.', imgs: ['https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&h=600&fit=crop'] },
    { id: 'test_post_11', user_id: 'test_gastro_1', feed: 'gastro', biz: 'test_rest_2', text: 'Nová várka polotmavého ležáku je čepovaná od tohoto pátku!', imgs: ['https://images.unsplash.com/photo-1436076863939-06870fe779c2?w=800&h=600&fit=crop'] },
    { id: 'test_post_12', user_id: 'test_gastro_1', feed: 'gastro', biz: 'test_rest_2', text: 'Ochutnávka piv s výkladem sládka každý čtvrtek v 18:00.', imgs: [] },
  ];
  for (const p of posts) {
    const exists = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(p.id).first();
    if (!exists) {
      const main = p.imgs[0] || null;
      await env.DB.prepare(
        `INSERT INTO posts (id, user_id, target_feed, business_id, text_content, content_html, image_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`,
      ).bind(p.id, p.user_id, p.feed, p.biz, p.text, `<p>${p.text}</p>`, main).run();

      if (p.imgs.length > 0) {
        const stmt = env.DB.prepare(`INSERT INTO post_media (id, post_id, image_url, sort_order) VALUES (?, ?, ?, ?)`);
        await env.DB.batch(p.imgs.map((url, i) => stmt.bind(newId('pm'), p.id, url, i)));
      }
      result.posts++;
    }
  }

  // ====== 5 eventov ======
  const now = Date.now();
  const events = [
    { id: 'test_event_1', user_id: 'test_org_1', biz: 'test_org_1_biz', kind: 'organizations', title: 'Rytířské turnaje', desc: 'Tradiční rytířské turnaje s ukázkou šermu.', days: 7 },
    { id: 'test_event_2', user_id: 'test_org_1', biz: 'test_org_1_biz', kind: 'organizations', title: 'Noční prohlídka hradu', desc: 'Prohlídka s loučemi a strašidly.', days: 14 },
    { id: 'test_event_3', user_id: 'test_org_2', biz: 'test_org_2_biz', kind: 'organizations', title: 'Koncert vážné hudby', desc: 'Koncert v zámecké kapli.', days: 10 },
    { id: 'test_event_4', user_id: 'test_gastro_1', biz: 'test_rest_1', kind: 'restaurants', title: 'Ochutnávka vín', desc: 'Ochutnávka moravských vín s odborným výkladem.', days: 5 },
    { id: 'test_event_5', user_id: 'test_hotel_1', biz: 'test_acc_1', kind: 'accommodation', title: 'Wellness víkend', desc: 'Víkend s wellness procedurami.', days: 21 },
  ];
  for (const e of events) {
    const exists = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(e.id).first();
    if (!exists) {
      const startAt = new Date(now + e.days * 86400000).toISOString().replace('T', ' ').slice(0, 19);
      await env.DB.prepare(
        `INSERT INTO events (id, user_id, business_id, business_kind, title, description, content_html, start_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
      ).bind(e.id, e.user_id, e.biz, e.kind, e.title, e.desc, `<p>${e.desc}</p>`, startAt).run();
      result.events++;
    }
  }

  // ====== 6 recenzií ======
  const reviews = [
    { id: 'test_review_1', user_id: 'test_user_1', biz: 'test_org_1_biz', kind: 'organizations', rating: 5, title: 'Krásné místo', text: 'Skvělá prohlídka, průvodce byl super.' },
    { id: 'test_review_2', user_id: 'test_user_2', biz: 'test_org_1_biz', kind: 'organizations', rating: 4, title: 'Pěkné, ale drahé', text: 'Vstupné mohlo být nižší.' },
    { id: 'test_review_3', user_id: 'test_user_3', biz: 'test_org_2_biz', kind: 'organizations', rating: 5, title: 'Nádherná zahrada', text: 'Zahrada je kouzelná, doporučuji.' },
    { id: 'test_review_4', user_id: 'test_user_1', biz: 'test_rest_1', kind: 'restaurants', rating: 5, title: 'Nejlepší svíčková', text: 'Svíčková byla vynikající, obsluha milá.' },
    { id: 'test_review_5', user_id: 'test_user_4', biz: 'test_rest_1', kind: 'restaurants', rating: 4, title: 'Dobré jídlo', text: 'Jídlo dobré, ale čekali jsme dlouho.' },
    { id: 'test_review_6', user_id: 'test_user_2', biz: 'test_acc_1', kind: 'accommodation', rating: 5, title: 'Úžasný pobyt', text: 'Wellness bylo super, personál úžasný.' },
  ];
  for (const r of reviews) {
    const exists = await env.DB.prepare('SELECT id FROM reviews WHERE id = ?').bind(r.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO reviews (id, user_id, business_id, business_kind, rating, title, text, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`,
      ).bind(r.id, r.user_id, r.biz, r.kind, r.rating, r.title, r.text).run();
      result.reviews++;
    }
  }

  // ====== 6 check-inov ======
  const checkins = [
    { id: 'test_checkin_1', user_id: 'test_user_1', biz: 'test_org_1_biz', kind: 'organizations', note: 'Bylo tu hezky.' },
    { id: 'test_checkin_2', user_id: 'test_user_2', biz: 'test_org_1_biz', kind: 'organizations', note: 'Doporučuji!' },
    { id: 'test_checkin_3', user_id: 'test_user_3', biz: 'test_org_2_biz', kind: 'organizations', note: 'Krásná zahrada.' },
    { id: 'test_checkin_4', user_id: 'test_user_1', biz: 'test_rest_1', kind: 'restaurants', note: 'Skvělá svíčková.' },
    { id: 'test_checkin_5', user_id: 'test_user_4', biz: 'test_rest_2', kind: 'restaurants', note: 'Výborné pivo.' },
    { id: 'test_checkin_6', user_id: 'test_user_2', biz: 'test_acc_1', kind: 'accommodation', note: 'Wellness top.' },
  ];
  for (const c of checkins) {
    const exists = await env.DB.prepare('SELECT id FROM checkins WHERE id = ?').bind(c.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO checkins (id, user_id, business_id, business_kind, note) VALUES (?, ?, ?, ?, ?)`,
      ).bind(c.id, c.user_id, c.biz, c.kind, c.note).run();
      result.checkins++;
    }
  }

  // ====== follow vzťahy ======
  const follows = [
    ['test_user_1', 'organizations', 'test_org_1_biz'],
    ['test_user_1', 'organizations', 'test_org_2_biz'],
    ['test_user_2', 'organizations', 'test_org_1_biz'],
    ['test_user_2', 'restaurants', 'test_rest_1'],
    ['test_user_3', 'accommodation', 'test_acc_1'],
    ['test_user_4', 'restaurants', 'test_rest_1'],
    ['test_user_4', 'restaurants', 'test_rest_2'],
    ['test_user_5', 'organizations', 'test_org_1_biz'],
  ];
  for (const [follower, type, target] of follows) {
    try {
      await env.DB.prepare(`INSERT OR IGNORE INTO follows (follower_id, target_type, target_id) VALUES (?, ?, ?)`)
        .bind(follower, type, target).run();
      result.follows++;
    } catch {}
  }

  return {
    ok: true,
    ...result,
    note: 'Testovacie účty: test1@test.local … test5@test.local, hrad@test.local, zamek@test.local, hotel@test.local, restaurace@test.local (heslo: testtest123)',
  };
}

export async function cleanupTestContent(env) {
  const result = { deleted: {} };

  const tables = [
    { name: 'story_replies', col: 'id' },
    { name: 'push_subscriptions', col: 'id' },
    { name: 'reviews', col: 'id' },
    { name: 'checkins', col: 'id' },
    { name: 'events', col: 'id' },
    { name: 'comments', col: 'id' },
    { name: 'post_media', col: 'id' },
    { name: 'posts', col: 'id' },
    { name: 'notifications', col: 'id' },
    { name: 'restaurants', col: 'id' },
    { name: 'accommodation', col: 'id' },
    { name: 'organizations', col: 'id' },
  ];

  for (const t of tables) {
    try {
      const r = await env.DB.prepare(`DELETE FROM ${t.name} WHERE ${t.col} LIKE 'test_%'`).run();
      result.deleted[t.name] = r.changes || 0;
    } catch (e) {}
  }

  for (const t of ['follows', 'blocks', 'wishlist', 'bookmarks']) {
    try {
      if (t === 'follows') await env.DB.prepare(`DELETE FROM follows WHERE follower_id LIKE 'test_%' OR target_id LIKE 'test_%'`).run();
      else if (t === 'blocks') await env.DB.prepare(`DELETE FROM blocks WHERE blocker_id LIKE 'test_%' OR blocked_id LIKE 'test_%'`).run();
      else if (t === 'wishlist') await env.DB.prepare(`DELETE FROM wishlist WHERE user_id LIKE 'test_%' OR business_id LIKE 'test_%'`).run();
      else if (t === 'bookmarks') await env.DB.prepare(`DELETE FROM bookmarks WHERE user_id LIKE 'test_%' OR post_id LIKE 'test_%'`).run();
    } catch {}
  }

  try {
    const r = await env.DB.prepare(`DELETE FROM users WHERE id LIKE 'test_%' OR email LIKE '%@test.local'`).run();
    result.deleted.users = r.changes || 0;
  } catch {}

  return { ok: true, deleted: result.deleted };
}
