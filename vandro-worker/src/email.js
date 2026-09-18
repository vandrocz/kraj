// ============================================================
// E-MAIL — no-op (bez odosielania)
// ============================================================
// Prečo prázdne?
//   - Google Sign-In už rieši overenie e-mailu.
//   - Nechceme žiadne mesačné výdavky ani limity.
//
// Ako neskôr zapnúť skutočné odosielanie:
//   1. Vyber si provider (Brevo/Mailjet/Resend/vlastný SMTP).
//   2. V nižšie uvedenej funkcii `sendEmail()` nahraď `console.log`
//      volaním `fetch()` na API providera.
//   3. Do Cloudflare Worker secrets pridaj príslušné API kľúče.
// ============================================================

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
Náš kraj — regionální platforma pro Česko
</td></tr>
</table></td></tr></table></body></html>`;
}

// ------------------------------------------------------------
// Hlavná funkcia — v no-op verzii len loguje.
// ------------------------------------------------------------
export async function sendEmail(env, { to, subject, html }) {
  console.log('[email:noop]', { to, subject, html_length: html?.length || 0 });
  return { skipped: true, reason: 'no-op email backend' };
}

// ------------------------------------------------------------
// Wrappery — musia existovať, aby build prešiel.
// Všetky aktuálne volajú sendEmail (no-op).
// ------------------------------------------------------------

export async function sendVerificationEmail(env, { to, token, displayName }) {
  const url = `${env.APP_URL || 'https://naskraj.vandro.cz'}/?verify=${token}`;
  const html = layout('Ověření e-mailové adresy', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;">pro dokončení registrace ověř svůj e-mail kliknutím níže.</p>
    <p style="text-align:center;margin:20px 0;"><a href="${url}" style="display:inline-block;padding:13px 24px;background:#2FBF71;color:#fff;font-weight:700;border-radius:12px;text-decoration:none;">Ověřit e-mail</a></p>
    <p style="font-size:12px;color:#64766D;word-break:break-all;">${url}</p>
  `);
  return sendEmail(env, { to, subject: 'Ověření e-mailu — Náš kraj', html });
}

export async function sendPasswordResetEmail(env, { to, token, displayName }) {
  const url = `${env.APP_URL || 'https://naskraj.vandro.cz'}/?reset=${token}`;
  const html = layout('Obnovení hesla', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;">obdrželi jsme žádost o obnovení hesla. Odkaz platí 1 hodinu.</p>
    <p style="text-align:center;margin:20px 0;"><a href="${url}" style="display:inline-block;padding:13px 24px;background:#2FBF71;color:#fff;font-weight:700;border-radius:12px;text-decoration:none;">Nastavit nové heslo</a></p>
    <p style="font-size:12px;color:#64766D;word-break:break-all;">${url}</p>
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
  const url = `${env.APP_URL || 'https://naskraj.vandro.cz'}/`;
  const html = layout('Zmínka v příspěvku', `
    <p style="font-size:14px;color:#10201A;line-height:1.6;">Ahoj ${displayName || ''},</p>
    <p style="font-size:14px;color:#10201A;line-height:1.6;"><strong>${actorName}</strong> tě zmínil(a) v příspěvku:</p>
    <p style="font-size:13.5px;color:#10201A;padding:12px;background:#F6FAF7;border-radius:10px;">${postPreview}</p>
    <p style="text-align:center;margin:20px 0;"><a href="${url}" style="display:inline-block;padding:13px 24px;background:#2FBF71;color:#fff;font-weight:700;border-radius:12px;text-decoration:none;">Zobrazit příspěvek</a></p>
  `);
  return sendEmail(env, { to, subject: 'Zmínka v příspěvku — Náš kraj', html });
}
