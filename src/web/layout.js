import { esc } from '../util.js';

const CSS = `
:root{--bg:#faf9f5;--card:#fff;--ink:#141413;--muted:#6b6a64;--line:#e8e6dc;--brand:#2d4bd8;--brand-ink:#fff;--ok:#5c7344;--warn:#9a6a1c;--bad:#b5452f;--soft:#e8ecff}
@media (prefers-color-scheme:dark){:root{--bg:#1f1e1d;--card:#262624;--ink:#eceae3;--muted:#a3a097;--line:#3a3935;--brand:#5271ff;--brand-ink:#fff;--soft:#1c2450;--ok:#a3b886;--warn:#e0b56a;--bad:#e88a74}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:32px 16px 64px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:28px;font:600 19px Poppins,system-ui,sans-serif}
.logo{width:30px;height:30px;border-radius:8px;background:var(--brand);color:var(--brand-ink);display:grid;place-items:center;font:700 12px system-ui,sans-serif}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;margin-bottom:18px}
h1,h2{font-family:Poppins,system-ui,sans-serif;font-weight:600}
h1{font-size:clamp(28px,5vw,40px);line-height:1.15;margin:0 0 10px;letter-spacing:-.01em}
h2{font-size:21px;margin:0 0 12px}.muted{color:var(--muted)}.small{font-size:14px}
.btn{display:inline-block;background:var(--brand);color:var(--brand-ink);border:0;border-radius:12px;padding:12px 20px;font:500 15px system-ui;text-decoration:none;cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn:disabled{opacity:.5;cursor:not-allowed}
ul.clean{list-style:none;padding:0;margin:0}ul.clean li{padding:8px 0;border-bottom:1px solid var(--line)}ul.clean li:last-child{border:0}
.sev{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:1px 8px;margin-right:8px;text-transform:uppercase}
.sev.high{background:#fde8e7;color:#b42318}.sev.medium{background:#fff1dc;color:#a15c07}.sev.low{background:#e8eefc;color:#2f5bea}
@media (prefers-color-scheme:dark){.sev.high{background:#3a1d1b;color:#ff9b93}.sev.medium{background:#3a2a12;color:#f0b35a}.sev.low{background:#1f2640;color:#9db2ff}}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.price{font-size:30px;font-weight:800;letter-spacing:-.02em}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:13px;color:var(--muted);font-weight:600}
td.r,th.r{text-align:right}
label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}
input,textarea,select{width:100%;padding:11px 12px;border-radius:9px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:15px system-ui}
textarea{min-height:90px}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:400;margin:10px 0}.check input{width:auto;margin-top:5px}
.slots{display:flex;flex-wrap:wrap;gap:8px}.slots label{margin:0;font-weight:500}
.slot input{display:none}.slot span{display:inline-block;padding:9px 14px;border:1px solid var(--line);border-radius:9px;cursor:pointer}
.slot input:checked+span{background:var(--brand);color:var(--brand-ink);border-color:var(--brand)}
.bar{height:10px;background:var(--line);border-radius:99px;overflow:hidden}.bar>div{height:100%;background:var(--ok)}
.pill{display:inline-block;padding:2px 10px;border-radius:99px;font-size:13px;font-weight:600;background:var(--soft);color:var(--brand)}
.ok{color:var(--ok)}.bad{color:var(--bad)}
.foot{margin-top:28px;font-size:13px;color:var(--muted);text-align:center}
.hero{background:#141413;color:#faf9f5;border:0}.hero .muted{color:#b0aea5}.hero h1{color:#faf9f5}
@media print{.noprint{display:none}body{background:#fff}}
`;

export function page({ title, body, settings, noindex = true }) {
  const a = settings.agency;
  const initials = a.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600&display=swap">${noindex ? '<meta name="robots" content="noindex">' : ''}<style>${CSS}</style></head>
<body><div class="wrap"><div class="top"><div class="logo">${esc(initials)}</div>${esc(a.name)}</div>${body}
<div class="foot">${esc(a.name)} · ${esc(a.email)} · ${esc(a.phone)}<br>${esc(a.address)}</div></div></body></html>`;
}

export function messagePage(settings, title, text, ok = true) {
  return page({
    title,
    settings,
    body: `<div class="card"><h1 class="${ok ? '' : 'bad'}">${esc(title)}</h1><p class="muted">${esc(text)}</p></div>`,
  });
}
