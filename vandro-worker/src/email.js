// ============================================================
// E-MAIL — Mailtrap API (4 000 e-mailov / mesiac zadarmo)
// ============================================================

const MAILTRAP_URL = 'https://send.api.mailtrap.io/api/send';

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
Tento e-mail ti přišel z <a href="https://app.vandro.cz" style="color:#1B8F52;">app.vandro.cz</a>.
</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href, label) {
  return `<p style="margin:20px 0;text-align:center;"><a href="${href}" style="display:inline-block;padding:13px 24px;background:#2FBF71;color:#fff;font-weight:700;border-radius:12px;text-decoration:none;font-size:14px;">${label}</a></p>`;
}

export async function sendEmail(env, { to, subject, html }) {
  if (!env.MAILTRAP_API_TOKEN) {
    console.warn('[email] Mailtrap token chýba, e-mail sa neposiela:', subject, '→', to);
    return { skipped: true, reason: 'no_credentials' };
  }

  const from = env.MAIL_FROM || 'Náš kraj <noreply@vandro.cz>';
  const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
  const senderName = fromMatch ? fromMatch[1] : 'Náš kraj';
  const senderEmail = fromMatch ? fromMatch[2] : 'noreply@vandro.cz';

  try {
    const res = await fetch(MAILTRAP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Token': env.MAILTRAP_API_TOKEN,
      },
      body: JSON.stringify({
        from: { email: senderEmail, name: senderName },
        to: [{ email: to }],
        subject: subject,
        html: html,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[email] Mailtrap error:', res.status, txt);
      return { error: `Mailtrap ${res.status}` };
    }
    const data = await res.json();
    console.log('[email] Odoslané:', to, '→', subject);
    return data;
  } catch (err) {
    console.error('[email] fetch zlyhal:', err);
    return { error: err.message };
  }
}

export async function sendVerificationEmail(env, { to, token, displayName }) {
  const appUrl = env.APP_URL || 'https://app.vandro.cz';
  const url = `${appUrl}/?verify=${token}`;
  const html = layout('Ověření e-mailové adresy', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;">pro dokončení registrace prosím ověř svůj e-mail kliknutím níže. Odkaz platí <strong>24 hodin</strong>.</p>
    ${button(url, 'Ověřit e-mail')}
    <p style="font-size:12px;color:#64766D;word-break:break-all;">${url}</p>
  `);
  return sendEmail(env, { to, subject: 'Ověření e-mailu — Náš kraj', html });
}

export async function sendPasswordResetEmail(env, { to, token, displayName }) {
  const appUrl = env.APP_URL || 'https://app.vandro.cz';
  const url = `${appUrl}/?reset=${token}`;
  const html = layout('Obnovení hesla', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;">obdrželi jsme žádost o obnovení hesla. Odkaz platí <strong>1 hodinu</strong>.</p>
    ${button(url, 'Nastavit nové heslo')}
    <p style="font-size:12px;color:#64766D;word-break:break-all;">${url}</p>
    <p style="font-size:12.5px;color:#64766D;margin-top:20px;">Pokud jsi o změnu nežádal, tento e-mail ignoruj — heslo zůstane beze změny.</p>
  `);
  return sendEmail(env, { to, subject: 'Obnovení hesla — Náš kraj', html });
}

export async function sendNewDeviceEmail(env, { to, ip, ua, displayName }) {
  const html = layout('Nové přihlášení', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;">zaznamenali jsme nové přihlášení:</p>
    <ul style="font-size:13px;color:#10201A;line-height:1.7;">
      <li>IP: <strong>${ip}</strong></li>
      <li>Zařízení: <strong>${ua || 'neznámé'}</strong></li>
    </ul>
  `);
  return sendEmail(env, { to, subject: 'Nové přihlášení — Náš kraj', html });
}

export async function sendMentionEmail(env, { to, actorName, postPreview, displayName }) {
  const url = env.APP_URL || 'https://app.vandro.cz';
  const html = layout('Zmínka v příspěvku', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;"><strong>${actorName}</strong> tě zmínil(a) v příspěvku:</p>
    <p style="font-size:13.5px;color:#10201A;padding:12px;background:#F6FAF7;border-radius:10px;">${postPreview}</p>
    ${button(url, 'Zobrazit příspěvek')}
  `);
  return sendEmail(env, { to, subject: 'Zmínka v příspěvku — Náš kraj', html });
}
