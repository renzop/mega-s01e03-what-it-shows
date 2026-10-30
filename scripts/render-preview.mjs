// Render a standalone snapshot of the signed kb page from the exported data.
// The .svx page remains the source of truth for the desk's live renderer.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const data = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const reports = [...new Map(data('src/lib/data/reports-4471.json').map((r) => [r.id, r])).values()]
  .filter((r) => r.mergedInto === 4471);
const tenantFiles = readdirSync(resolve(root, 'src/lib/data/tenants')).filter((name) => name.endsWith('.json'));
const tenants = new Map(tenantFiles.map((name) => {
  const t = data(`src/lib/data/tenants/${name}`);
  return [t.handle, t];
}));
const oneDayMove = new Set(data('src/lib/data/desk-notes.json').oneDayMove);

const dayFirst = (locale) => {
  const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.UTC(2026, 0, 2, 12))).map((p) => p.type);
  return parts.indexOf('day') < parts.indexOf('month');
};
const causeOf = (r) => {
  const tenant = tenants.get(r.tenant);
  if (!tenant || !dayFirst(tenant.locale)) return 'unplaced';
  return r.channel === 'form' && tenant.form === 'booking-v3' ? 'hint' : 'parser';
};
const groups = new Map();
for (const r of reports) {
  const cause = causeOf(r);
  groups.set(cause, [...(groups.get(cause) ?? []), r]);
}
const ordered = [...groups].sort((a, b) => b[1].length - a[1].length);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tags = (rs) => {
  const counts = new Map();
  for (const r of rs) counts.set(r.meta.intakeTag, (counts.get(r.meta.intakeTag) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([tag, n]) => `${esc(tag)} ×${n}`).join(' · ');
};
const dateRange = (rs) => {
  const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
  return `${days[0]} → ${days.at(-1)}`;
};
const tableRows = ordered.map(([cause, rs]) => `<tr class="${cause === 'parser' ? '' : 'wrong'}">
  <td><code>${esc(cause)}</code></td><td>${rs.length}</td><td class="tags">${tags(rs)}</td>
  <td>${new Set(rs.map((r) => r.tenant)).size}</td><td>${dateRange(rs)}</td>
  <td>${cause === 'parser' ? '#4471' : 'not this ticket — no ticket of its own'}</td>
</tr>`).join('\n');
const notes = ordered.map(([cause, rs]) => {
  const count = rs.filter((r) => oneDayMove.has(r.id)).length;
  return count ? `<p class="note">${count} reports read as a one-day move; filed under <code>${esc(cause)}</code> by tenant.</p>` : '';
}).join('\n');

// Same 40-bit FNV-based desk reference as src/lib/kb/desk-ref.ts.
const fnv1a = (value, seed) => {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};
const signature = 'Codex';
let bits = (BigInt(fnv1a(signature, 0x811c9dc5)) << 8n) | BigInt(fnv1a(signature, 0x9e3779b9) & 0xff);
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let ref = '';
for (let i = 0; i < 8; i++) { ref = alphabet[Number(bits & 31n)] + ref; bits >>= 5n; }
ref = `DR-${ref.slice(0, 4)}-${ref.slice(4)}`;

const start = Date.parse('2026-03-30');
const week = 7 * 86_400_000;
const weeks = Array.from({ length: Math.ceil((Date.parse('2026-10-05') - start) / week) }, (_, i) => ({ at: start + i * week, received: 0, merged: 0 }));
for (const r of reports) {
  const received = weeks[Math.floor((Date.parse(r.receivedAt.slice(0, 10)) - start) / week)];
  if (received) received.received++;
  const merged = r.mergedAt && weeks[Math.floor((Date.parse(r.mergedAt.slice(0, 10)) - start) / week)];
  if (merged) merged.merged++;
}
const max = Math.max(...weeks.flatMap((w) => [w.received, w.merged]));
const bars = weeks.map((w, i) => {
  const a = w.received / max * 100, b = w.merged / max * 100;
  const label = i % 4 === 0 ? `<text x="${i * 24 + 12}" y="128">${new Date(w.at).toISOString().slice(5, 10)}</text>` : '';
  return `<rect class="in" x="${i * 24 + 2}" y="${110 - a}" width="9" height="${a}"/><rect class="merged" x="${i * 24 + 12}" y="${110 - b}" width="9" height="${b}"/>${label}`;
}).join('');
const age = Math.floor((Date.now() - Date.parse('2026-10-30')) / 86_400_000);
const stale = age > 180;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>#4471 · two date failures in one ticket · support kb</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1d1b;--muted:#6b6a66;--line:#e3e0d8;--accent:#2f6f5e;--warn:#b4501f;--warn-bg:#fbeee6;--note-bg:#eef5f2;--mono:ui-monospace,'Cascadia Code',Menlo,monospace}
@media(prefers-color-scheme:dark){:root{--bg:#171716;--fg:#ecebe6;--muted:#9c9a93;--line:#34332f;--accent:#6fbfa6;--warn:#f0905d;--warn-bg:#3a2418;--note-bg:#1d2c27}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}.kb{max-width:760px;margin:0 auto;padding:2rem 16px 4rem}
.crumb{font:.8rem var(--mono);text-decoration:none;color:var(--muted)}h1{margin:.25rem 0 .5rem;line-height:1.2}.meta{display:flex;flex-wrap:wrap;gap:.5rem 1rem;color:var(--muted);font-size:.85rem;margin:0}.status{border:1px solid var(--line);border-radius:99px;padding:0 .6rem}.stale{color:var(--warn);font-weight:600}.banner{background:var(--warn-bg);color:var(--warn);padding:.6rem 1rem;border-radius:6px}table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:.92rem}th,td{border-bottom:1px solid var(--line);padding:.35rem .5rem;text-align:left}code{font-family:var(--mono);font-size:.88em}a{color:var(--accent)}.wrong td{background:var(--warn-bg)}.wrong td:last-child{color:var(--warn);font-weight:600}.tags,.note{color:var(--muted);font-size:.85em}aside{border-left:4px solid var(--warn);padding:.5rem 1rem;margin:1rem 0;background:var(--warn-bg)}svg{width:100%;max-width:640px}.in{fill:var(--warn)}.merged{fill:var(--accent)}svg text{font:8px var(--mono);fill:var(--muted);text-anchor:middle}figcaption{color:var(--muted);font-size:.85rem}.key{display:inline-block;width:.7em;height:.7em;border-radius:2px}.key.in{background:var(--warn)}.key.merged{background:var(--accent)}.stamp{margin:2rem 0 0;font:.85rem var(--mono);color:var(--muted)}.stamp b{color:var(--accent);letter-spacing:.04em}footer{margin-top:3rem;color:var(--muted);font-size:.8rem;border-top:1px solid var(--line);padding-top:1rem}
</style></head><body><div class="kb"><header><a class="crumb" href="../">support desk · kb</a><h1>#4471 · two date failures in one ticket</h1><p class="meta"><span>owner <b>Codex</b></span><span class="status">proposed</span><span class="${stale ? 'stale' : ''}">reviewed 2026-10-30 · ${age} days ago${stale ? ' · stale' : ''}</span></p></header>
${stale ? `<p class="banner">Nobody has re-read this page in ${age} days. Check it against the live views before you rely on it.</p>` : ''}
<main><p>The desk merged every date report into #4471. The reports describe <strong>two failures</strong>, so the ticket's “one issue, one fix” summary cannot cover them both. The table below counts distinct report IDs, grouped by the tenant's date locale, booking form, and report channel. It reads the current export when the page renders; its counts may change as the desk keeps working.</p>
<p class="sum"><strong>${reports.length}</strong> reports merged into #4471 · <strong>${groups.size}</strong> causes</p>
<table><thead><tr><th>cause</th><th>reports</th><th>tagged as</th><th>tenants</th><th>seen</th><th></th></tr></thead><tbody>${tableRows}</tbody></table>${notes}
<h2>1. Shared parser reads month first</h2><p>The shared parser treats a date as <code>MM/DD/YYYY</code>. These tenants write the day before the month. When both numbers are at most 12, a date can land in another month instead of failing visibly. This affects app and email reports, and form reports from tenants whose form shows the day-first <code>DD/MM/YYYY</code> hint. The parser group is the cause that belongs to #4471.</p>
<p><strong>Action:</strong> Make the parser use the tenant's date order, and test ambiguous dates in the affected locales. Check unambiguous dates too, so they fail clearly if their order is wrong.</p>
<h2>2. Booking form hint contradicts tenant date order</h2><p>The <code>booking-v3</code> form shows <code>MM/DD/YYYY</code> to people at day-first tenants. A person can follow that hint, but the form then reads the entered date in the tenant's day-first order. This is a form hint failure, distinct from the shared parser. It occurs on form reports for the affected <code>booking-v3</code> tenants and needs its own ticket.</p>
<p><strong>Action:</strong> Show the date format used to interpret the field, and test entry through the form in each tenant locale. Correcting the shared parser alone will not make this hint truthful.</p>
<aside>Intake's <code>meta.intakeTag</code> comes from the reporter's browser locale. Do not use it, the subject line, or the apparent size of a date shift to assign a cause. Use tenant locale, booking form, and channel. The desk's one-day-move notes remain counted under their assigned cause.</aside>
<h2>Queue history</h2><figure><svg viewBox="0 0 ${weeks.length * 24} 140" role="img" aria-label="reports received and merged into #4471, per week">${bars}</svg><figcaption><span class="key in"></span> received · <span class="key merged"></span> merged into #4471 · per week</figcaption></figure>
<p>The chart shows when the desk received and merged reports. It is a queue history, not proof that either fix has shipped. Recheck both groups before closing either ticket.</p><p class="stamp">desk ref <b>${ref}</b></p></main>
<footer>Pages are written by people. Tables and charts are built from data at render time. This standalone preview is a snapshot of the 4 October export; the .svx page uses the live components.</footer></div></body></html>`;

const out = resolve(root, 'preview/4471-split.html');
mkdirSync(resolve(root, 'preview'), { recursive: true });
writeFileSync(out, html);
console.log(JSON.stringify({ out, reports: reports.length, groups: Object.fromEntries(ordered.map(([cause, rs]) => [cause, rs.length])), ref }));
