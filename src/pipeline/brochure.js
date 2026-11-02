import { page } from '../web/layout.js';
import { esc, money, BASE_URL, firstName } from '../util.js';

/** Builds the personalised brochure (HTML, printable to PDF) from the pitch maker output. */
export function buildBrochure(lead, audit, settings, pitch = null) {
  const pkg = settings.packages.find((p) => p.id === (pitch?.recommended_package || lead.recommended_package)) || settings.packages[0];
  const first = firstName(lead.contact_name);
  const cur = settings.billing.currency;
  const findings = (audit?.findings || []).slice(0, 6);
  const bookUrl = `${BASE_URL}/book/${lead.token}`;
  const designUrl = `${BASE_URL}/d/${lead.token}`;
  const list = (items) => `<ul class="clean">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

  const body = `
<div class="card hero">
  <div class="small muted">Prepared for ${esc(lead.company)}${lead.city ? ' · ' + esc(lead.city) : ''}</div>
  <h1>${pitch ? esc(pitch.headline) : `Hi ${esc(first)}, here's how ${esc(lead.company)} can win more customers online.`}</h1>
  <p class="muted">${pitch ? esc(pitch.hook) : `A personalised plan from ${esc(settings.agency.name)}.`}</p>
</div>

${lead.pitch ? `<div class="card"><h2>A note from ${esc(settings.agency.sender_name)}</h2><p>${esc(lead.pitch)}</p></div>` : ''}

${lead.design_version ? `<div class="card">
  <h2>We designed a homepage concept for you</h2>
  <p class="muted">A first look at what ${esc(lead.company)}'s new website could look like.</p>
  <iframe src="${designUrl}" sandbox="" loading="lazy" title="Homepage concept" style="width:100%;height:520px;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>
  <p><a class="btn ghost" href="${designUrl}" target="_blank" rel="noopener">Open full concept</a></p>
</div>` : ''}

<div class="card">
  <h2>${audit?.has_website ? `What we found on ${esc(audit.final_url || audit.url || lead.website)}` : 'Where you stand today'}</h2>
  ${pitch?.pain_points?.length ? list(pitch.pain_points.slice(0, 5)) : findings.length
    ? `<ul class="clean">${findings.map((f) => `<li><span class="sev ${f.severity}">${f.severity}</span>${esc(f.text)}</li>`).join('')}</ul>`
    : '<p class="muted">Your site is in good shape. We can focus on growth: SEO, conversion and speed.</p>'}
</div>

${pitch?.value_props?.length ? `<div class="card"><h2>What this means for ${esc(lead.company)}</h2>${list(pitch.value_props)}</div>` : ''}

<div class="card">
  <h2>Our recommendation: ${esc(pkg.name)}</h2>
  ${pitch?.package_reason ? `<p class="muted">${esc(pitch.package_reason)}</p>` : ''}
  <div class="grid">
    <div><div class="price">${money(pkg.price, cur)}</div><div class="muted small">one-time · delivered in ${esc(pkg.timeline)}</div></div>
    <ul class="clean">${pkg.includes.map((i) => `<li>✓ ${esc(i)}</li>`).join('')}</ul>
  </div>
</div>

<div class="card">
  <h2>How it works</h2>
  <ol>
    <li><b>30-minute call</b>: we understand your goals.</li>
    <li><b>Proposal</b>: fixed price, fixed timeline, accept online.</li>
    <li><b>Design &amp; build</b>: you track progress live, milestone by milestone.</li>
    <li><b>Launch &amp; care</b>: we host, back up and keep your site updated.</li>
  </ol>
</div>

${settings.agency.portfolio?.length ? `<div class="card"><h2>Recent results</h2><div class="grid">${settings.agency.portfolio
    .map((p) => `<div><b>${esc(p.name)}</b><div class="muted small">${esc(p.result)}</div></div>`).join('')}</div></div>` : ''}

<div class="card" style="text-align:center">
  <h2>Ready to talk?</h2>
  <p class="muted">Pick a free 30-minute slot. No obligation.</p>
  <a class="btn" href="${bookUrl}">Book a call</a>
  <a class="btn ghost noprint" href="javascript:window.print()">Save as PDF</a>
</div>`;

  return page({ title: `${lead.company}: Website plan by ${settings.agency.name}`, body, settings });
}
