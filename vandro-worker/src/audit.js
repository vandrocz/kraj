import { newId } from './auth.js';

export async function logAudit(env, { adminId, action, targetType, targetId, reason, meta }) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, admin_id, action, target_type, target_id, reason, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId('audit'),
      adminId || null,
      action,
      targetType || null,
      targetId || null,
      reason || null,
      meta ? JSON.stringify(meta) : null,
    ).run();
  } catch (err) {
    console.warn('logAudit failed:', err.message);
  }
}
