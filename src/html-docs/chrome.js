import fs from 'node:fs';

/*
 * Headless Chromium for the HTML document templates (owner, 2026-11-11: "convert this exactly to our system … same as
 * exactly without any difference"). The two Codeace designs were made as HTML in Claude; printing that same HTML in
 * Chromium is the only way to get the same result, so these documents skip pdfkit.
 *  - Vercel: @sparticuz/chromium (its binary ships in node_modules/@sparticuz/chromium/bin, see vercel.json includeFiles);
 *  - this machine / other servers: CHROME_PATH, else an installed Chrome or Edge.
 * One browser per process, reused; each document gets its own page.
 */
const LOCAL = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

let browserP = null;
async function launch() {
  const puppeteer = (await import('puppeteer-core')).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: null });
  }
  const exe = LOCAL.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (!exe) throw new Error('No Chrome or Edge found for the HTML documents (set CHROME_PATH)');
  return puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'], defaultViewport: null });
}
/**
 * A browser of its own for one job, closed by the caller. On Vercel without --single-process: the shared browser runs as
 * one process and crashed ("Connection closed") on Claude design bundles, whose pages are built in nested frames.
 */
export async function ownBrowser() {
  const puppeteer = (await import('puppeteer-core')).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const args = chromium.args.filter((a) => a !== '--single-process' && !/^--disable-web-security/.test(a) && !/^--allow-running-insecure-content/.test(a));
    return puppeteer.launch({ args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: null });
  }
  return launch();
}
export async function browser() {
  if (browserP) {
    const b = await browserP.catch(() => null);
    if (b?.connected) return b;
  }
  browserP = launch();
  return browserP;
}

/** Opens the HTML in a fresh page (fonts and images are inline, so nothing is fetched) and hands it to fn. */
export async function withPage(html, { width, height, scaleFactor, media }, fn) {
  const b = await browser();
  const page = await b.newPage();
  try {
    await page.setViewport({ width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: scaleFactor || 1 });
    // imported HTML templates are printed as they look on screen (their own print rules were written for another page set-up)
    if (media) await page.emulateMediaType(media);
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Pages whose content does not fit (element bottoms beyond the page box): [{ page, over }] in CSS px. */
// Content may end at the page's footer rule (.foot, brochure) or above its bottom padding (data-bottom, proposal);
// a box whose content is taller than the box (a grid cell with too much text) counts too.
export const overflowCheck = (page) => page.evaluate(() => [...document.querySelectorAll('[data-page]')].map((pg, i) => {
  const r = pg.getBoundingClientRect();
  const foot = pg.querySelector('.foot');
  const limit = foot ? foot.getBoundingClientRect().top : r.bottom - Number(pg.dataset.bottom || 0);
  let over = 0;
  for (const fit of pg.querySelectorAll('[data-fit]')) {
    for (const e of [fit, ...fit.querySelectorAll('*')]) {
      const q = e.getBoundingClientRect();
      if (q.height) over = Math.max(over, q.bottom - limit);
    }
    for (const c of fit.children) over = Math.max(over, c.scrollHeight - c.clientHeight - 1);
  }
  return { page: i, id: pg.dataset.page, over: Math.round(over) };
}).filter((x) => x.over > 1));

/**
 * HTML → PDF, backgrounds printed. size = { width, height } in CSS px (96 per inch) plus, optionally, the paper:
 * paper = { width: '210mm', height: '297mm' } with scale = paper / layout (the reference PDFs are true A4 while the
 * layouts are whole CSS pixels, e.g. 794 × 1123 px on 793.7 × 1122.5 px of A4).
 */
export async function htmlToPdf(html, size) {
  const paper = size.paper || { width: `${size.width}px`, height: `${size.height}px` };
  return withPage(html, { ...size, scaleFactor: 1.6 }, async (page) => {
    await flatten(page);
    return Buffer.from(await page.pdf({ ...(size.cssPage ? {} : { width: paper.width, height: paper.height }), scale: size.scale || 1, printBackground: true, preferCSSPageSize: !!size.cssPage, margin: { top: 0, right: 0, bottom: 0, left: 0 } }));
  });
}

/*
 * Photo areas with see-through layers (a dark gradient over a photo) become one flat JPEG before printing, as in the
 * reference PDFs: a PDF with soft masks is blended differently by some viewers (found 2026-11-11: pdf.js showed the
 * proposal's dark photo strip pink). Each [data-flatten] element is screenshotted with its children hidden, and the
 * picture replaces its background. Text stays vector on top; the PDF also gets much smaller.
 */
async function flatten(page) {
  // background photos must be decoded before the screenshot (found 2026-11-11: the first try caught the bare colour)
  await page.evaluate(async () => {
    const urls = new Set();
    for (const e of document.querySelectorAll('[data-flatten]')) for (const m of getComputedStyle(e).backgroundImage.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]);
    await Promise.all([...urls].map((u) => { const i = new Image(); i.src = u; return i.decode().catch(() => {}); }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  for (const el of await page.$$('[data-flatten]')) {
    await el.evaluate((e) => { for (const c of e.children) { c.dataset.vis = c.style.visibility; c.style.visibility = 'hidden'; } });
    const buf = await el.screenshot({ type: 'jpeg', quality: 84 });
    await el.evaluate((e, b64) => {
      Object.assign(e.style, { backgroundImage: `url(data:image/jpeg;base64,${b64})`, backgroundSize: '100% 100%', backgroundPosition: '0 0', backgroundRepeat: 'no-repeat' });
      for (const c of e.children) c.style.visibility = c.dataset.vis || '';
    }, Buffer.from(buf).toString('base64'));
  }
}
