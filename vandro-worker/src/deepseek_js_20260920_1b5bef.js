import { hashPassword, newId } from './auth.js';

export async function seedTestContent(env) {
  const result = { users: 0, businesses: 0, posts: 0, events: 0, reviews: 0, checkins: 0 };

  // Marker pre ľahké vymazanie: prefix "test_" v ID
  // Všetky testovacie záznamy začínajú "test_" alebo majú @test.local email.

  const { hash, salt } = await hashPassword('testtest123');

  const users = [
    { id: 'test_user_1', email: 'test1@test.local', name: 'Test Turista 1', role: 'user', bio: 'Rád cestuju po Česku.' },
    { id: 'test_user_2', email: 'test2@test.local', name: 'Test Turista 2', role: 'user', bio: 'Hledám skryté poklady.' },
    { id: 'test_user_3', email: 'test3@test.local', name: 'Test Turista 3', role: 'user', bio: '' },
  ];
  for (const u of users) {
    const exists = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(u.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, display_name, role, bio, credit_balance, email_verified, terms_accepted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, datetime('now'))`,
      ).bind(u.id, u.email, hash, salt, u.name, u.role, u.bio).run();
      result.users++;
    }
  }

  // Organizácie
  const orgs = [
    { id: 'test_org_1', user_id: 'test_user_1', name: 'Test Hrad', type: 'hrad', region: 'Středočeský kraj', district: 'Rakovník', city: 'Křivoklát', description: 'Testovací hrad pro vývoj.' },
    { id: 'test_org_2', user_id: 'test_user_1', name: 'Test Zámek', type: 'zamek', region: 'Jihočeský kraj', district: 'Český Krumlov', city: 'Český Krumlov', description: 'Testovací zámek.' },
  ];
  for (const o of orgs) {
    const exists = await env.DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(o.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO organizations (id, user_id, name, type, region, district, city, description, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(o.id, o.user_id, o.name, o.type, o.region, o.district, o.city, o.description).run();
      result.businesses++;
    }
  }

  // Ubytování
  const accs = [
    { id: 'test_acc_1', user_id: 'test_user_1', name: 'Test Hotel', type: 'hotel', region: 'Královéhradecký kraj', district: 'Trutnov', city: 'Pec pod Sněžkou', description: 'Testovací hotel.', capacity: 20 },
    { id: 'test_acc_2', user_id: 'test_user_1', name: 'Test Chata', type: 'chata', region: 'Liberecký kraj', district: 'Semily', city: 'Harrachov', description: 'Testovací chata.', capacity: 8 },
  ];
  for (const a of accs) {
    const exists = await env.DB.prepare('SELECT id FROM accommodation WHERE id = ?').bind(a.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO accommodation (id, user_id, name, type, region, district, city, description, capacity, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(a.id, a.user_id, a.name, a.type, a.region, a.district, a.city, a.description, a.capacity).run();
      result.businesses++;
    }
  }

  // Restaurace
  const rests = [
    { id: 'test_rest_1', user_id: 'test_user_1', name: 'Test Restaurace', type: 'restaurace', cuisine_type: 'ceska', region: 'Jihočeský kraj', district: 'Český Krumlov', city: 'Český Krumlov', description: 'Testovací restaurace.' },
  ];
  for (const r of rests) {
    const exists = await env.DB.prepare('SELECT id FROM restaurants WHERE id = ?').bind(r.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO restaurants (id, user_id, name, type, cuisine_type, region, district, city, description, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(r.id, r.user_id, r.name, r.type, r.cuisine_type, r.region, r.district, r.city, r.description).run();
      result.businesses++;
    }
  }

  // Príspevky
  const posts = [
    { id: 'test_post_1', user_id: 'test_user_1', target_feed: 'organization', business_id: 'test_org_1', text: 'Testovací příspěvek 1 z hradu.', image: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&h=600&fit=crop' },
    { id: 'test_post_2', user_id: 'test_user_1', target_feed: 'organization', business_id: 'test_org_1', text: 'Testovací příspěvek 2.', image: 'https://images.unsplash.com/photo-1461360228754-6e81c478b882?w=800&h=600&fit=crop' },
    { id: 'test_post_3', user_id: 'test_user_1', target_feed: 'accommodation', business_id: 'test_acc_1', text: 'Testovací příspěvek z hotelu.', image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=600&fit=crop' },
    { id: 'test_post_4', user_id: 'test_user_1', target_feed: 'gastro', business_id: 'test_rest_1', text: 'Testovací příspěvek z restaurace.', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop' },
  ];
  for (const p of posts) {
    const exists = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(p.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO posts (id, user_id, target_feed, business_id, text_content, content_html, image_url, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`,
      ).bind(p.id, p.user_id, p.target_feed, p.business_id, p.text, `<p>${p.text}</p>`, p.image).run();

      await env.DB.prepare(
        `INSERT INTO post_media (id, post_id, image_url, sort_order) VALUES (?, ?, ?, 0)`,
      ).bind(newId('pm'), p.id, p.image).run();
      result.posts++;
    }
  }

  // Events
  const events = [
    { id: 'test_event_1', user_id: 'test_user_1', business_id: 'test_org_1', business_kind: 'organizations', title: 'Test Akce 1', description: 'Testovací akce na hradě.', start_at: new Date(Date.now() + 7 * 86400000).toISOString().replace('T', ' ').slice(0, 19) },
    { id: 'test_event_2', user_id: 'test_user_1', business_id: 'test_rest_1', business_kind: 'restaurants', title: 'Test Akce 2 (Gastro)', description: 'Testovací gastro akce.', start_at: new Date(Date.now() + 14 * 86400000).toISOString().replace('T', ' ').slice(0, 19) },
  ];
  for (const e of events) {
    const exists = await env.DB.prepare('SELECT id FROM events WHERE id = ?').bind(e.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO events (id, user_id, business_id, business_kind, title, description, start_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`,
      ).bind(e.id, e.user_id, e.business_id, e.business_kind, e.title, e.description, e.start_at).run();
      result.events++;
    }
  }

  // Reviews
  const reviews = [
    { id: 'test_review_1', user_id: 'test_user_2', business_id: 'test_org_1', business_kind: 'organizations', rating: 5, title: 'Krásné místo', text: 'Testovací recenze.' },
    { id: 'test_review_2', user_id: 'test_user_3', business_id: 'test_rest_1', business_kind: 'restaurants', rating: 4, title: 'Dobré jídlo', text: 'Testovací recenze.' },
  ];
  for (const r of reviews) {
    const exists = await env.DB.prepare('SELECT id FROM reviews WHERE id = ?').bind(r.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO reviews (id, user_id, business_id, business_kind, rating, title, text, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'published')`,
      ).bind(r.id, r.user_id, r.business_id, r.business_kind, r.rating, r.title, r.text).run();
      result.reviews++;
    }
  }

  // Check-ins
  const checkins = [
    { id: 'test_checkin_1', user_id: 'test_user_2', business_id: 'test_org_1', business_kind: 'organizations', note: 'Bylo tu hezky.' },
    { id: 'test_checkin_2', user_id: 'test_user_3', business_id: 'test_org_1', business_kind: 'organizations', note: 'Doporučuji.' },
    { id: 'test_checkin_3', user_id: 'test_user_2', business_id: 'test_rest_1', business_kind: 'restaurants', note: 'Skvělá svíčková.' },
  ];
  for (const c of checkins) {
    const exists = await env.DB.prepare('SELECT id FROM checkins WHERE id = ?').bind(c.id).first();
    if (!exists) {
      await env.DB.prepare(
        `INSERT INTO checkins (id, user_id, business_id, business_kind, note) VALUES (?, ?, ?, ?, ?)`,
      ).bind(c.id, c.user_id, c.business_id, c.business_kind, c.note).run();
      result.checkins++;
    }
  }

  return { ok: true, ...result, note: 'Testovacie účty: test1@test.local / test2@test.local / test3@test.local (heslo: testtest123)' };
}

export async function cleanupTestContent(env) {
  const result = { deleted: {} };

  // Vymaž všetko s ID začína "test_" alebo emaily @test.local
  const tables = [
    { name: 'story_replies', col: 'id' },
    { name: 'story_views', col: null }, // nemá vlastné ID
    { name: 'push_subscriptions', col: 'id' },
    { name: 'reviews', col: 'id' },
    { name: 'checkins', col: 'id' },
    { name: 'events', col: 'id' },
    { name: 'comments', col: 'id' },
    { name: 'post_media', col: 'id' },
    { name: 'posts', col: 'id' },
    { name: 'wishlist', col: null },
    { name: 'bookmarks', col: null },
    { name: 'notifications', col: 'id' },
    { name: 'follows', col: null },
    { name: 'blocks', col: null },
    { name: 'restaurants', col: 'id' },
    { name: 'accommodation', col: 'id' },
    { name: 'organizations', col: 'id' },
  ];

  for (const t of tables) {
    try {
      if (t.col) {
        const r = await env.DB.prepare(`DELETE FROM ${t.name} WHERE ${t.col} LIKE 'test_%'`).run();
        result.deleted[t.name] = r.changes || 0;
      }
    } catch (e) { /* ignore */ }
  }

  // Follower/block/wishlist/bookmark k test_userom
  const testUserIds = ['test_user_1', 'test_user_2', 'test_user_3'];
  for (const t of ['follows', 'blocks', 'wishlist', 'bookmarks']) {
    try {
      if (t === 'follows') {
        await env.DB.prepare(`DELETE FROM follows WHERE follower_id LIKE 'test_%' OR target_id LIKE 'test_%'`).run();
      } else if (t === 'blocks') {
        await env.DB.prepare(`DELETE FROM blocks WHERE blocker_id LIKE 'test_%' OR blocked_id LIKE 'test_%'`).run();
      } else if (t === 'wishlist') {
        await env.DB.prepare(`DELETE FROM wishlist WHERE user_id LIKE 'test_%' OR business_id LIKE 'test_%'`).run();
      } else if (t === 'bookmarks') {
        await env.DB.prepare(`DELETE FROM bookmarks WHERE user_id LIKE 'test_%' OR post_id LIKE 'test_%'`).run();
      }
    } catch {}
  }

  // Napokon users
  try {
    const r = await env.DB.prepare(`DELETE FROM users WHERE id LIKE 'test_%' OR email LIKE '%@test.local'`).run();
    result.deleted.users = r.changes || 0;
  } catch {}

  return { ok: true, deleted: result.deleted };
}