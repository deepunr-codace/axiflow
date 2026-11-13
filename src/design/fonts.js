/*
 * Typefaces for brochures and proposals (owner, 2026-11-05: "use standard fonts too. not generic ai feel fonts",
 * "in brochure, proposal"). Classic, open-licence families (OFL files in assets/fonts) next to the template fonts
 * (Poppins, Unbounded, Hanken Grotesk, Lora, Inter). Every face is a static TTF, so the editor (CSS @font-face,
 * served at /fonts.css) and the PDF (pdfkit) use the same file.
 *
 * Pairings are curated heading + body combinations. A layout built with a pairing swaps its own font codes as it
 * builds (withFonts + mapFont), so text is measured and wrapped in the new fonts and the editor and PDF still match.
 * No dependencies: the Claude worker's validator may import it.
 */
const F = (file, family, weight, name, fallback) => ({ file, family, weight, name, fallback });
export const EXTRA_FONTS = {
  EG5: F('EBGaramond-500.ttf', 'EB Garamond', 500, 'EB Garamond Medium', 'Times-Roman'),
  EG7: F('EBGaramond-700.ttf', 'EB Garamond', 700, 'EB Garamond Bold', 'Times-Bold'),
  BK4: F('LibreBaskerville-400.ttf', 'Libre Baskerville', 400, 'Baskerville Regular', 'Times-Roman'),
  BK7: F('LibreBaskerville-700.ttf', 'Libre Baskerville', 700, 'Baskerville Bold', 'Times-Bold'),
  BM5: F('BodoniModa-500.ttf', 'Bodoni Moda', 500, 'Bodoni Medium', 'Times-Roman'),
  BM7: F('BodoniModa-700.ttf', 'Bodoni Moda', 700, 'Bodoni Bold', 'Times-Bold'),
  PF5: F('PlayfairDisplay-500.ttf', 'Playfair Display', 500, 'Playfair Medium', 'Times-Roman'),
  PF7: F('PlayfairDisplay-700.ttf', 'Playfair Display', 700, 'Playfair Bold', 'Times-Bold'),
  DS4: F('DMSerifDisplay-400.ttf', 'DM Serif Display', 400, 'DM Serif Display', 'Times-Bold'),
  CS4: F('LibreCaslonText-400.ttf', 'Libre Caslon Text', 400, 'Caslon Regular', 'Times-Roman'),
  CS7: F('LibreCaslonText-700.ttf', 'Libre Caslon Text', 700, 'Caslon Bold', 'Times-Bold'),
  SR4: F('SourceSerif4-400.ttf', 'Source Serif 4', 400, 'Source Serif Regular', 'Times-Roman'),
  SR6: F('SourceSerif4-600.ttf', 'Source Serif 4', 600, 'Source Serif SemiBold', 'Times-Bold'),
  LF4: F('LibreFranklin-400.ttf', 'Libre Franklin', 400, 'Franklin Regular', 'Helvetica'),
  LF5: F('LibreFranklin-500.ttf', 'Libre Franklin', 500, 'Franklin Medium', 'Helvetica'),
  LF7: F('LibreFranklin-700.ttf', 'Libre Franklin', 700, 'Franklin Bold', 'Helvetica-Bold'),
  PX4: F('IBMPlexSans-400.ttf', 'IBM Plex Sans', 400, 'IBM Plex Sans Regular', 'Helvetica'),
  PX5: F('IBMPlexSans-500.ttf', 'IBM Plex Sans', 500, 'IBM Plex Sans Medium', 'Helvetica'),
  PX6: F('IBMPlexSans-600.ttf', 'IBM Plex Sans', 600, 'IBM Plex Sans SemiBold', 'Helvetica-Bold'),
  WS4: F('WorkSans-400.ttf', 'Work Sans', 400, 'Work Sans Regular', 'Helvetica'),
  WS5: F('WorkSans-500.ttf', 'Work Sans', 500, 'Work Sans Medium', 'Helvetica'),
  WS6: F('WorkSans-600.ttf', 'Work Sans', 600, 'Work Sans SemiBold', 'Helvetica-Bold'),
  JO4: F('Jost-400.ttf', 'Jost', 400, 'Jost Regular (Futura style)', 'Helvetica'),
  JO5: F('Jost-500.ttf', 'Jost', 500, 'Jost Medium', 'Helvetica'),
  JO6: F('Jost-600.ttf', 'Jost', 600, 'Jost SemiBold', 'Helvetica-Bold'),
  AR4: F('Archivo-400.ttf', 'Archivo', 400, 'Archivo Regular', 'Helvetica'),
  AR5: F('Archivo-500.ttf', 'Archivo', 500, 'Archivo Medium', 'Helvetica'),
  AR7: F('Archivo-700.ttf', 'Archivo', 700, 'Archivo Bold', 'Helvetica-Bold'),
  OS5: F('Oswald-500.ttf', 'Oswald', 500, 'Oswald Medium', 'Helvetica-Bold'),
  OS6: F('Oswald-600.ttf', 'Oswald', 600, 'Oswald SemiBold', 'Helvetica-Bold'),
  BB4: F('BebasNeue-400.ttf', 'Bebas Neue', 400, 'Bebas Neue', 'Helvetica-Bold'),
  AN4: F('Anton-400.ttf', 'Anton', 400, 'Anton', 'Helvetica-Bold'),
  AF4: F('AbrilFatface-400.ttf', 'Abril Fatface', 400, 'Abril Fatface', 'Times-Bold'),
  // Codeace Growth (owner's "Digital Growth Solutions" deck, 2026-11-10): bold Inter headings, mono eyebrows
  IB7: F('Inter-Bold.ttf', 'InterDeck', 700, 'Inter Bold', 'Helvetica-Bold'),
  JM5: F('JetBrainsMono-500.ttf', 'JetBrains Mono', 500, 'JetBrains Mono Medium', 'Courier'),
};
export const EXTRA_CODES = Object.keys(EXTRA_FONTS);

/*
 * h = heading faces (main, strong), b = body faces (reg, med, strong). hLs scales the layouts' tight heading
 * tracking (tuned for Unbounded / Lora); display = an all-caps or poster face that must not set running text.
 */
export const PAIRINGS = {
  'garamond-franklin': { name: 'Garamond + Franklin Gothic', mood: 'classic editorial, literary, established', h: ['EG5', 'EG7'], b: ['LF4', 'LF5', 'LF7'], hLs: 0.3 },
  'baskerville-plex': { name: 'Baskerville + IBM Plex Sans', mood: 'trusted and professional: clinics, law, finance, education', h: ['BK4', 'BK7'], b: ['PX4', 'PX5', 'PX6'], hLs: 0.25 },
  'bodoni-jost': { name: 'Bodoni + Jost (Futura style)', mood: 'luxury and fashion: salons, boutiques, jewellery, interiors', h: ['BM5', 'BM7'], b: ['JO4', 'JO5', 'JO6'], hLs: 0.35 },
  'playfair-work': { name: 'Playfair Display + Work Sans', mood: 'elegant hospitality: resorts, restaurants, weddings, wellness', h: ['PF5', 'PF7'], b: ['WS4', 'WS5', 'WS6'], hLs: 0.3 },
  'dmserif-archivo': { name: 'DM Serif Display + Archivo', mood: 'warm and modern: cafés, local brands, real estate', h: ['DS4', 'DS4'], b: ['AR4', 'AR5', 'AR7'], hLs: 0.3 },
  'caslon-sourceserif': { name: 'Caslon + Source Serif', mood: 'heritage and tradition: ayurveda, family businesses, temples, crafts', h: ['CS4', 'CS7'], b: ['SR4', 'SR4', 'SR6'], hLs: 0.25 },
  'sourceserif-plex': { name: 'Source Serif + IBM Plex Sans', mood: 'calm and clear: healthcare, NGOs, consultants', h: ['SR4', 'SR6'], b: ['PX4', 'PX5', 'PX6'], hLs: 0.3 },
  'oswald-franklin': { name: 'Oswald + Franklin Gothic', mood: 'bold retail and sport: gyms, shops, events', h: ['OS5', 'OS6'], b: ['LF4', 'LF5', 'LF7'], hLs: 0, display: true },
  'bebas-plex': { name: 'Bebas Neue + IBM Plex Sans', mood: 'industrial and technical: automotive, construction, logistics', h: ['BB4', 'BB4'], b: ['PX4', 'PX5', 'PX6'], hLs: 0, display: true },
  'anton-work': { name: 'Anton + Work Sans', mood: 'loud and promotional: food, offers, entertainment', h: ['AN4', 'AN4'], b: ['WS4', 'WS5', 'WS6'], hLs: 0, display: true },
  'abril-jost': { name: 'Abril Fatface + Jost', mood: 'playful premium: bakeries, florists, kids, gifts', h: ['AF4', 'AF4'], b: ['JO4', 'JO5', 'JO6'], hLs: 0.2, display: true },
  'franklin': { name: 'Franklin Gothic', mood: 'clean Swiss style: tech, B2B, manufacturing', h: ['LF5', 'LF7'], b: ['LF4', 'LF5', 'LF7'], hLs: 0.4 },
  'jost': { name: 'Jost (Futura style)', mood: 'geometric and modern: architecture, design studios, startups', h: ['JO5', 'JO6'], b: ['JO4', 'JO5', 'JO6'], hLs: 0.4 },
};
export const PAIRING_IDS = Object.keys(PAIRINGS);
/** For prompts: one line per pairing. */
export const pairingGuide = () => PAIRING_IDS.map((id) => `"${id}": ${PAIRINGS[id].name}: ${PAIRINGS[id].mood}`).join('\n');

// The template fonts by role (classic deck: Unbounded + Hanken; Editorial: Lora + Inter; Codeace Default: Poppins).
const HEAD_MAIN = ['UM', 'LR', 'LM'], HEAD_STRONG = ['US', 'LS', 'PB'];
const BODY = { HR: 0, IR: 0, PR: 0, HM: 1, IM: 1, PM: 1, HS: 2, IS: 2, PS: 2 };

let current = null; // { map, hLs } while a layout builds
/** Builds fn() with a pairing's fonts (null / unknown id = the template's own fonts). Layout building is synchronous. */
export function withFonts(pairingId, fn) {
  const p = PAIRINGS[pairingId];
  const prev = current;
  if (p) {
    const map = {};
    // Lora Regular sets a lead line in Editorial: with a poster face (display) it takes the body face instead
    const asBody = (c) => p.display && c === 'LR';
    for (const c of HEAD_MAIN) map[c] = asBody(c) ? p.b[0] : p.h[0];
    for (const c of HEAD_STRONG) map[c] = p.h[1];
    for (const [c, i] of Object.entries(BODY)) map[c] = p.b[i];
    current = { map, hLs: p.hLs ?? 0.3, heads: new Set([...HEAD_MAIN, ...HEAD_STRONG].filter((c) => !asBody(c))) };
  } else current = null;
  try { return fn(); } finally { current = prev; }
}
export const mapFont = (code) => current?.map[code] || code;
/** Element fields for a text element built while a pairing is active: the mapped font and scaled heading tracking. */
export function mapText(o) {
  if (!current || !o.font) return o;
  const out = { ...o, font: mapFont(o.font) };
  if (current.heads.has(o.font) && o.ls) out.ls = Math.round(o.ls * current.hLs * 10) / 10;
  return out;
}

/** The pairing to use: a fixed one from settings, else ("auto") the one Claude chose, else ("template") none. */
export function resolvePairing(setting, chosen) {
  if (PAIRINGS[setting]) return setting;
  if (setting === 'template') return null;
  return PAIRINGS[chosen] ? chosen : null;
}
