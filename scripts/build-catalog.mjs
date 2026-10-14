// Genera card-catalog.json: per ogni codice carta, i dati strutturati (tipo, colore, costo, ...) e
// l'elenco delle versioni (base, parallel, box topper, ...) con l'id prodotto TCGplayer da cui
// l'app ricava le immagini. Fonte: https://tcgcsv.com (mirror giornaliero dell'API TCGplayer).
//
// Uso (Node 18+):  node scripts/build-catalog.mjs
// Va rilanciato quando esce un set nuovo; poi si carica card-catalog.json insieme a index.html.
// Il testo degli effetti (Description) NON viene copiato di proposito.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = 'https://tcgcsv.com/tcgplayer/68'; // 68 = categoria "One Piece Card Game"
const OUT = fileURLToPath(new URL('../card-catalog.json', import.meta.url));
const DELAY_MS = 120;

// Il servizio rifiuta (401) lo user-agent generico di Node: ci si identifica con uno descrittivo.
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

// Nome prodotto, ad es. "Nome (003) (Parallel)", "Nome (Alternate Art)", "Nome (Promotion Pack 2022)",
// "Nome (001) (Offline Regional 2024 Vol. 2) [Winner]". Le etichette di versione sono le parentesi tonde
// e quadre che NON sono il numero della carta: se c'è un "(NNN)" contano solo quelle dopo di esso
// (quelle prima fanno parte del nome della carta, es. "Mr.1 (Daz.Bonez) (018)").
function variantTags(name) {
  const num = [...name.matchAll(/\((\d{1,3})\)/g)].pop();
  const rest = num ? name.slice(num.index + num[0].length) : name;
  return [...rest.matchAll(/[(\[]([^)\]]+)[)\]]/g)]
    .map(t => t[1].trim())
    .filter(t => t && !/^\d{1,3}$/.test(t) && !/^[A-Z]+\d+-\d+$/i.test(t)); // numero o codice della carta
}

// Le sigle dei gruppi non sono omogenee ("OP01", "ST-01", "OP14-EB04", "OP15 RE", "OP-PR"): un gruppo
// è "di origine" per un codice se la sigla, senza trattini e spazi, inizia con il prefisso del codice.
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
    if (!code) continue; // confezioni, box, carte DON!!
    products++;
    const entry = cards[code] || (cards[code] = { variants: [] });
    // I dati strutturati sono uguali per tutte le versioni: si tengono quelli della prima.
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

// Per ogni codice: la base è il primo prodotto senza etichetta del set d'origine (altrimenti il primo
// senza etichetta in assoluto); le altre versioni sono quelle con un'etichetta esplicita (Parallel,
// Alternate Art, promo...). I prodotti senza etichetta di altri set sono ristampe con la stessa
// illustrazione della base e vengono scartati. Etichette uguali vengono numerate (#2, #3).
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
