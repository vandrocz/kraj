const RESEND_URL = 'https://api.resend.com/emails';

function layout(title, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F6FAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6FAF7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(16,32,26,0.08);">
<tr><td style="padding:28px 28px 12px;text-align:center;">
<div style="display:inline-block;width:44px;height:44px;border-radius:12px;background:#2FBF71;color:#fff;font-size:22px;font-weight:800;line-height:44px;">N</div>
<div style="font-size:19px;font-weight:700;color:#10201A;margin-top:8px;">Náš kraj</div>
</td></tr>
<tr><td style="padding:8px 28px 28px;">
<h1 style="font-size:20px;color:#10201A;margin:0 0 12px;">${title}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #E4ECE6;text-align:center;font-size:11.5px;color:#64766D;">
Náš kraj — regionální platforma pro Česko<br>
Tento e-mail ti přišel z <a href="https://naskraj.vandro.cz" style="color:#1B8F52;">naskraj.vandro.cz</a>.
</td></tr>
</table></td></tr></table></body></html>`;
}
function button(href, label) {
  return `<p style="margin:20px 0;text-align:center;"><a href="${href}" style="display:inline-block;padding:13px 24px;background:#2FBF71;color:#fff;font-weight:700;border-radius:12px;text-decoration:none;font-size:14px;">${label}</a></p>`;
}

export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) { console.warn('RESEND_API_KEY chýba:', subject, '→', to); return { skipped: true }; }
  const from = env.MAIL_FROM || 'Náš kraj <noreply@vandro.cz>';
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) { console.error('Resend error:', res.status, await res.text().catch(() => '')); return { error: res.status }; }
    return await res.json();
  } catch (err) { console.error('Resend fetch:', err); return { error: err.message }; }
}

export async function sendVerificationEmail(env, { to, token, displayName }) {
  const url = `${env.APP_URL || 'https://naskraj.vandro.cz'}/?verify=${token}`;
  const html = layout('Ověření e-mailové adresy', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;">pro dokončení registrace prosím ověř svůj e-mail kliknutím níže. Odkaz platí <strong>24 hodin</strong>.</p>
    ${button(url, 'Ověřit e-mail')}
    <p style="font-size:12px;color:#64766D;word-break:break-all;">${url}</p>
  `);
  return sendEmail(env, { to, subject: 'Ověření e-mailu — Náš kraj', html });
}

export async function sendPasswordResetEmail(env, { to, token, displayName }) {
  const url = `${env.APP_URL || 'https://naskraj.vandro.cz'}/?reset=${token}`;
  const html = layout('Obnovení hesla', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;">obdrželi jsme žádost o obnovení hesla. Odkaz platí <strong>1 hodinu</strong>.</p>
    ${button(url, 'Nastavit nové heslo')}
    <p style="font-size:12px;color:#64766D;word-break:break-all;">${url}</p>
  `);
  return sendEmail(env, { to, subject: 'Obnovení hesla — Náš kraj', html });
}

export async function sendNewDeviceEmail(env, { to, ip, ua, displayName }) {
  const html = layout('Nové přihlášení', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;">zaznamenali jsme nové přihlášení k tvému účtu:</p>
    <ul style="font-size:13px;color:#10201A;line-height:1.7;">
      <li>IP: <strong>${ip}</strong></li>
      <li>Zařízení: <strong>${ua || 'neznámé'}</strong></li>
    </ul>
    <p style="font-size:12.5px;color:#64766D;">Pokud jsi to nebyl ty, změň si prosím heslo.</p>
  `);
  return sendEmail(env, { to, subject: 'Nové přihlášení — Náš kraj', html });
}
