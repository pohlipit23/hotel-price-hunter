import { minorDigits } from '../public/drop-watch.js';

// The Drop email, as one pure function: catalogue facts in, { subject, html, text } out. Nothing here reads
// storage, the network or the clock. The only judge-derived text is the masked address in the footer note;
// every other word is fixed copy or a reviewed catalogue fact, and every value is escaped.
// Email-safe on purpose: table layout, inline styles, light only, web-safe font fallbacks, absolute images.

// Fixed and always shown: the price in the email is the captured check replayed, never a live price.
export const REPLAY_LABEL = 'Replayed from a captured price check. Not a live price.';
const C = { page: '#eef4f9', surface: '#ffffff', ink: '#202c3b', muted: '#52657b', coral: '#c2402f', blue: '#2f5d8f', line: '#d5dee8',
  green: '#0b5e40', greenBg: '#dff3e8', blueBg: '#dbe8f7', roomInk: '#23466e' };
const HEADING = "'Bricolage Grotesque', 'Trebuchet MS', 'Segoe UI', Arial, sans-serif";
const BODY = "'DM Sans', 'Segoe UI', Helvetica, Arial, sans-serif";
const CODE = /^[A-Z0-9]{4,20}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fail = () => { throw Object.assign(new Error('The Drop email could not be built.'), { code: 'DROP_MAIL_INVALID' }); };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function money(minor, currency) {
  const digits = minorDigits(currency);
  return currency + ' ' + new Intl.NumberFormat('en-US', { minimumFractionDigits: minor % 10 ** digits ? digits : 0, maximumFractionDigits: digits }).format(minor / 10 ** digits);
}
// Drop amounts are rounded whole units with a minus, as on the Drops page: "-45".
const whole = (minor, currency) => '-' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(minor / 10 ** minorDigits(currency)));
const dayLabel = day => new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const instantLabel = value => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
const timeLabel = value => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
function stayLabel({ checkin, checkout }) {
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000);
  return dayLabel(checkin) + ' · ' + nights + (nights === 1 ? ' night' : ' nights');
}

function validate(facts) {
  const { origin, link, code, currency, bookedMinor, drops, minimumSavingMinor, capturedAt, expiresAt, maskedEmail, hotelName, roomName, stay, photo } = facts ?? {};
  let parsed; try { parsed = new URL(origin); } catch { fail(); }
  if (parsed.origin !== origin || !(parsed.protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(parsed.hostname))) fail();
  if (!CODE.test(code ?? '') || typeof link !== 'string' || !link.startsWith(`${origin}/#inbox-${code}~`) || !/^[A-Z]{3}$/.test(currency ?? '')) fail();
  if (![bookedMinor, minimumSavingMinor].every(Number.isSafeInteger) || !Array.isArray(drops) || drops.length > 20) fail();
  if (drops.some(drop => !Number.isSafeInteger(drop?.totalMinor) || !Number.isSafeInteger(drop.savingMinor) || drop.savingMinor <= 0
    || typeof drop.roomName !== 'string' || typeof drop.sameRoom !== 'boolean')) fail();
  if (![capturedAt, expiresAt].every(value => Number.isFinite(Date.parse(value))) || typeof maskedEmail !== 'string' || !maskedEmail.includes('***@')) fail();
  if (typeof hotelName !== 'string' || typeof roomName !== 'string' || !DAY.test(stay?.checkin ?? '') || !DAY.test(stay?.checkout ?? '')) fail();
  if (photo != null && (typeof photo.url !== 'string' || !photo.url.startsWith(origin + '/assets/') || typeof photo.alt !== 'string')) fail();
}

// The airmail edge of the ticket: coral, white, blue, white bars, as cells so every client keeps them.
function airmail() {
  const colours = [C.coral, C.surface, C.blue, C.surface];
  const cells = Array.from({ length: 16 }, (_, index) => `<td width="6.25%" height="8" style="height:8px;line-height:8px;font-size:0;background:${colours[index % 4]};">&nbsp;</td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${cells}</tr></table>`;
}
// The rubber stamp: a double coral ring, the saving with its minus, the currency underneath.
function stamp({ label, amount, unit, filled }) {
  const ink = filled ? C.surface : C.coral; const paper = filled ? C.coral : C.surface;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="border-collapse:separate;">
<tr><td width="92" height="92" align="center" valign="middle" style="width:92px;height:92px;border:3px solid ${C.coral};border-radius:50%;background:${paper};color:${ink};box-shadow:inset 0 0 0 3px ${paper},inset 0 0 0 5px ${ink};text-align:center;transform:rotate(-8deg);">
<div style="font:800 10px/1.1 ${BODY};letter-spacing:.08em;text-transform:uppercase;color:${ink};">${escape(label)}</div>
<div style="font:800 ${amount.length > 5 ? 20 : 27}px/1 ${HEADING};letter-spacing:-.03em;color:${ink};padding-top:2px;">${escape(amount)}</div>
${unit ? `<div style="font:800 11px/1.2 ${BODY};letter-spacing:.1em;color:${ink};">${escape(unit)}</div>` : ''}
</td></tr></table>`;
}
const pill = (text, background, colour) => `<span style="display:inline-block;border-radius:9px;padding:5px 10px;background:${background};color:${colour};font:500 12px/1.25 ${BODY};">${escape(text)}</span>`;
function button(link, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;margin:0 auto;">
<tr><td align="center" bgcolor="${C.coral}" style="border-radius:999px;background:${C.coral};">
<a href="${escape(link)}" style="display:inline-block;padding:15px 30px;border-radius:999px;color:${C.surface};font:700 17px/1.2 ${HEADING};text-decoration:none;">${escape(label)}</a>
</td></tr></table>`;
}

// Builds the email for one armed Drop Watch. `drops` is the replayed first check, best matched first;
// an empty list is the honest "nothing yet" email, with no saving shown at all.
export function dropMailMessage(facts) {
  validate(facts);
  const { origin, link, code, currency, bookedMinor, drops, minimumSavingMinor, capturedAt, expiresAt, maskedEmail, hotelName, roomName, stay, photo } = facts;
  const found = drops.length > 0; const best = drops[0];
  const more = drops.length - 1;
  const saving = found ? whole(best.savingMinor, currency) : null;
  const subject = found ? `${saving} ${currency} on your ${hotelName} stay` : `No drop yet on your ${hotelName} stay`;
  const preheader = found ? `${drops.length === 1 ? 'A drop' : drops.length + ' drops'} waiting for your approval. ${REPLAY_LABEL}`
    : `Nothing at least ${whole(minimumSavingMinor, currency)} ${currency} yet. Your booking stays as it is.`;
  const action = found ? 'See my drops' : 'Open my Drop Watch';
  const footer = `Someone armed this Drop Watch with ${maskedEmail}. Ignore this email to stop; nothing changes without your approval.`;
  const until = `The button works until ${timeLabel(expiresAt)}. RoomDrop judge demo: selection only, no booking or payment.`;

  const hero = photo ? `<tr><td style="padding:0;line-height:0;font-size:0;"><img src="${escape(photo.url)}" width="560" alt="${escape(photo.alt)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;outline:none;text-decoration:none;"></td></tr>`
    : `<tr><td align="center" bgcolor="${C.blueBg}" style="padding:28px 0;background:${C.blueBg};"><img src="${escape(origin)}/assets/roomdrop-key-icon.png" width="72" height="72" alt="" style="display:block;width:72px;height:72px;border:0;"></td></tr>`;
  const headline = `<tr><td style="padding:20px 22px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
<td valign="middle" style="padding-right:12px;">
<p style="margin:0 0 4px;color:${C.muted};font:500 12px/1.3 ${BODY};letter-spacing:.09em;text-transform:uppercase;">Drop Watch · ${escape(code)}</p>
<h1 style="margin:0 0 6px;color:${C.ink};font:600 26px/1.1 ${HEADING};letter-spacing:-.02em;">${found ? 'Your room dropped' : 'No drop yet'}</h1>
<p style="margin:0;color:${C.ink};font:500 15px/1.35 ${BODY};">${escape(hotelName)}</p>
<p style="margin:2px 0 0;color:${C.muted};font:400 13px/1.35 ${BODY};">${escape(stayLabel(stay))}</p>
</td>
<td width="98" valign="middle" style="width:98px;">${found ? stamp({ label: 'Drop', amount: saving, unit: currency, filled: drops.length > 1 })
    : stamp({ label: 'Still', amount: 'Watching', unit: '', filled: false })}</td>
</tr></table></td></tr>`;
  const tear = `<tr><td style="padding:0 22px;"><div style="border-top:2px dashed ${C.line};height:0;line-height:0;font-size:0;">&nbsp;</div></td></tr>`;
  const detail = found ? `<tr><td style="padding:16px 22px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>
<td valign="top" width="50%" style="padding-right:8px;">
<p style="margin:0 0 2px;color:${C.muted};font:500 11px/1.3 ${BODY};letter-spacing:.09em;text-transform:uppercase;">Booked</p>
<p style="margin:0;color:${C.muted};font:500 16px/1.3 ${BODY};text-decoration:line-through;">${escape(money(bookedMinor, currency))}</p>
</td>
<td valign="top" width="50%" style="padding-left:8px;">
<p style="margin:0 0 2px;color:${C.coral};font:500 11px/1.3 ${BODY};letter-spacing:.09em;text-transform:uppercase;">&#9660; Drop</p>
<p style="margin:0;color:${C.ink};font:700 20px/1.2 ${HEADING};">${escape(money(best.totalMinor, currency))}</p>
</td></tr></table>
<p style="margin:14px 0 0;">${best.sameRoom ? pill('Same room', C.greenBg, C.green) : pill('Other room', C.blueBg, C.roomInk)}${best.freeCancellation ? ' ' + pill('Free cancellation', C.greenBg, C.green) : ''}</p>
<p style="margin:8px 0 0;color:${C.ink};font:500 14px/1.4 ${BODY};">${escape(best.roomName)}${best.board ? ` <span style="color:${C.muted};">· ${escape(best.board)}</span>` : ''}</p>
${more > 0 ? `<p style="margin:10px 0 0;color:${C.blue};font:700 14px/1.4 ${BODY};">+ ${more} more ${more === 1 ? 'drop' : 'drops'} waiting</p>` : ''}
</td></tr>` : `<tr><td style="padding:16px 22px 4px;">
<p style="margin:0;color:${C.ink};font:500 15px/1.45 ${BODY};">Nothing at least <strong style="color:${C.coral};">${escape(whole(minimumSavingMinor, currency))} ${escape(currency)}</strong> in this check.</p>
<p style="margin:6px 0 0;color:${C.muted};font:400 14px/1.45 ${BODY};">Your ${escape(roomName)} booking stays as it is.</p>
</td></tr>`;
  const cta = `<tr><td style="padding:22px 22px 8px;">${button(link, action)}</td></tr>`;
  const honest = `<tr><td style="padding:10px 22px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
<td style="border:1px dashed ${C.line};border-radius:12px;padding:10px 12px;background:#fbfcfd;color:${C.muted};font:400 12px/1.45 ${BODY};text-align:center;">
<strong style="color:${C.ink};font-weight:700;">${escape(REPLAY_LABEL)}</strong><br>Captured ${escape(instantLabel(capturedAt))}.</td>
</tr></table></td></tr>`;

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escape(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&amp;family=DM+Sans:wght@400;500;700&amp;display=swap" rel="stylesheet">
<style>:root { color-scheme: light only; supported-color-schemes: light only; } body { margin: 0; padding: 0; } a { color: ${C.blue}; }</style>
</head>
<body style="margin:0;padding:0;background:${C.page};color:${C.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page};font-size:1px;line-height:1px;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="border-collapse:collapse;background:${C.page};">
<tr><td align="center" style="padding:24px 10px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:560px;">
<tr><td align="center" style="padding:0 0 18px;"><a href="${escape(origin)}/" style="text-decoration:none;"><img src="${escape(origin)}/assets/roomdrop-logo.png" width="150" alt="RoomDrop" style="display:block;width:150px;height:auto;border:0;"></a></td></tr>
<tr><td style="border-radius:20px;background:${C.surface};box-shadow:0 8px 18px rgba(32,44,59,.07);">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-radius:20px;overflow:hidden;background:${C.surface};">
<tr><td style="padding:0;">${airmail()}</td></tr>
${hero}
${headline}
${tear}
${detail}
${cta}
${honest}
<tr><td style="padding:0;">${airmail()}</td></tr>
</table></td></tr>
<tr><td style="padding:18px 12px 0;color:${C.muted};font:400 12px/1.5 ${BODY};text-align:center;">${escape(footer)}<br>${escape(until)}</td></tr>
</table></td></tr></table>
</body>
</html>
`;
  const text = [
    found ? `Your room dropped: ${saving} ${currency}` : 'No drop yet',
    `${hotelName}, ${stayLabel(stay)}`,
    '',
    ...(found ? [`Booked: ${money(bookedMinor, currency)}`, `Drop: ${money(best.totalMinor, currency)} (${best.sameRoom ? 'same room' : 'other room'}: ${best.roomName}${best.board ? ', ' + best.board : ''})`,
      ...(more > 0 ? [`+ ${more} more ${more === 1 ? 'drop' : 'drops'} waiting`] : [])]
      : [`Nothing at least ${whole(minimumSavingMinor, currency)} ${currency} in this check. Your ${roomName} booking stays as it is.`]),
    '',
    `${action}: ${link}`,
    '',
    `${REPLAY_LABEL} Captured ${instantLabel(capturedAt)}.`,
    '',
    footer,
    until,
  ].join('\n');
  return { subject, html, text, kind: found ? 'drop' : 'nothing-yet' };
}
