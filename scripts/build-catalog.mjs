// Generates card-catalog.json: for each card code, the structured data (type, color, cost, ...) and
// the list of versions (base, parallel, box topper, ...) with the TCGplayer product id the
// app derives the images from. Source: https://tcgcsv.com (daily mirror of the TCGplayer API).
//
// Usage (Node 18+):  node scripts/build-catalog.mjs
// Re-run when a new set comes out; then commit card-catalog.json together with index.html.
// The effect text (Description) is deliberately NOT copied.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'https://tcgcsv.com/tcgplayer/68'; // 68 = category "One Piece Card Game"
const OUT = fileURLToPath(new URL('../card-catalog.json', import.meta.url));
const DELAY_MS = 120;

// The service rejects (401) Node's generic user agent: we identify ourselves with a descriptive one.
const HEADERS = { 'User-Agent': 'one-piece-collection-tracker/1.0 (personal hobby app; catalog build script)' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return (await res.json()).results || [];
      if (res.status !== 429 && res.status < 500) throw new Error('HTTP ' + res.status);
    } catch (e) {
      if (i === tries) throw new Error(url + ' -> ' + e.message);
    }
    await sleep(500 * i);
  }
  throw new Error(url + ' -> troppi tentativi');
}

const ext = (product, name) => {
  const e = (product.extendedData || []).find(x => x.name === name);
  return e && String(e.value).trim() ? String(e.value).trim() : '';
};

// Product name, e.g. "Name (003) (Parallel)", "Name (Alternate Art)", "Name (Promotion Pack 2022)",
// "Name (001) (Offline Regional 2024 Vol. 2) [Winner]". Version labels are the round
// and square brackets that are NOT the card number: if there is a "(NNN)" only the ones after it
// count (the ones before are part of the card name, e.g. "Mr.1 (Daz.Bonez) (018)").
function variantTags(name) {
  const num = [...name.matchAll(/\((\d{1,3})\)/g)].pop();
  const rest = num ? name.slice(num.index + num[0].length) : name;
  return [...rest.matchAll(/[(\[]([^)\]]+)[)\]]/g)]
    .map(t => t[1].trim())
    .filter(t => t && !/^\d{1,3}$/.test(t) && !/^[A-Z]+\d+-\d+$/i.test(t)); // card number or code
}

// Group abbreviations are not uniform ("OP01", "ST-01", "OP14-EB04", "OP15 RE", "OP-PR"): a group
// is the "origin" for a code if the abbreviation, without dashes and spaces, starts with the code prefix.
const codePrefix = code => (code.match(/^([A-Z]+\d+)-/) || [])[1] || '';
const isNative = (code, abbr) => {
  const prefix = codePrefix(code);
  const norm = (abbr || '').replace(/[-\s]/g, '').toUpperCase();
  return !!prefix && norm.startsWith(prefix) && !/\d/.test(norm.charAt(prefix.length));
};

const groups = await getJson(BASE + '/groups');
console.log(groups.length + ' gruppi (set/prodotti)');

const cards = {};
let products = 0;
for (const g of groups) {
  await sleep(DELAY_MS);
  const list = await getJson(`${BASE}/${g.groupId}/products`);
  for (const p of list) {
    const code = ext(p, 'Number').toUpperCase();
    if (!code) continue; // packs, boxes, DON!! cards
    products++;
    const entry = cards[code] || (cards[code] = { variants: [] });
    // The structured data are the same for all versions: keep those of the first one.
    const fields = {
      type: ext(p, 'CardType'), color: ext(p, 'Color'), cost: ext(p, 'Cost'), power: ext(p, 'Power'),
      counter: ext(p, 'Counterplus'), life: ext(p, 'Life'), attribute: ext(p, 'Attribute'), subtypes: ext(p, 'Subtypes')
    };
    for (const [k, v] of Object.entries(fields)) if (v && !entry[k]) entry[k] = v;
    const tags = variantTags(p.name);
    const native = isNative(code, g.abbreviation);
    entry.variants.push({ id: p.productId, tags, native, group: g.abbreviation });
  }
}

// For each code: the base is the first unlabeled product of the origin set (otherwise the first
// unlabeled one overall); the other versions are those with an explicit label (Parallel,
// Alternate Art, promo...). Unlabeled products from other sets are reprints with the same
// artwork as the base and are discarded. Equal labels get numbered (#2, #3).
const out = {};
for (const code of Object.keys(cards).sort()) {
  const e = cards[code];
  const byId = (a, b) => a.id - b.id;
  const untagged = e.variants.filter(v => !v.tags.length).sort(byId);
  const base = untagged.find(v => v.native) || untagged[0];
  const tagged = e.variants.filter(v => v.tags.length).sort(byId);
  const seen = {};
  const list = [];
  if (base) list.push([base.id, 'Base']);
  for (const v of tagged) {
    let label = v.tags.join(' · ');
    if (!v.native && codePrefix(code)) label += ' · ' + v.group;
    seen[label] = (seen[label] || 0) + 1;
    list.push([v.id, seen[label] > 1 ? label + ' #' + seen[label] : label]);
  }
  e.variants = list;
  out[code] = e;
}

const json = JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), source: 'tcgcsv.com (TCGplayer)', cards: out });
await writeFile(OUT, json);
const multi = Object.values(out).filter(e => e.variants.length > 1).length;
console.log(`${Object.keys(out).length} codici, ${products} prodotti-carta, ${multi} codici con più versioni`);
console.log(`scritto ${OUT} (${(json.length / 1024).toFixed(0)} KB)`);
