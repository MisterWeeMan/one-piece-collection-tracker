// Prova la lettura dei mazzi (parseDeck in index.html) sui tre formati supportati.
// Uso (Node 18+):  node scripts/check-deck-parser.mjs   -> esce con errore se qualcosa non torna.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';

// Si estrae dalla pagina il blocco delle funzioni pure, così si prova il codice vero e non una copia.
const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const start = html.indexOf('// ---- MAZZI: lettura dei formati');
const end = html.indexOf('// ---- fine lettura mazzi ----');
assert(start > 0 && end > start, 'blocco di lettura mazzi non trovato in index.html');
const { parseDeck } = new Function(html.slice(start, end) + '; return { parseDeck };')();

const total = d => d.cards.reduce((n, c) => n + c[1], 0);

// Stesso mazzo (onepiecetopdecks) in formato JSON e in formato NxCODICE: devono dare lo stesso risultato.
const json = '["Exported from onepiecetopdecks.com","EB05-010","OP09-106","OP09-106","OP09-106","OP09-106","OP13-113","OP13-113","OP13-113","OP13-113","EB05-050","EB05-050","EB05-050","EB05-050","EB05-057","EB05-057","EB05-057","EB05-057","OP17-109","OP17-109","OP17-109","OP17-109","EB05-052","EB05-052","EB05-052","EB05-055","EB05-055","EB05-055","EB05-055","OP14-108","OP14-108","OP14-108","OP14-108","OP17-114","OP17-114","EB03-055","EB03-055","EB03-055","EB04-018","EB04-018","EB04-018","OP13-031","OP13-031","EB05-016","EB05-016","EB05-016","EB05-016","OP17-022","OP17-022","OP17-022","OP14-118","OP14-118"]';
const lines = '1xEB05-010\n4xOP09-106\n4xOP13-113\n4xEB05-050\n4xEB05-057\n4xOP17-109\n3xEB05-052\n4xEB05-055\n4xOP14-108\n2xOP17-114\n3xEB03-055\n3xEB04-018\n2xOP13-031\n4xEB05-016\n3xOP17-022\n2xOP14-118\n';
const a = parseDeck(json), b = parseDeck(lines);
assert.equal(a.leader, 'EB05-010');
assert.equal(a.cards.length, 16);
assert.equal(total(a), 51);
assert.deepEqual(a, b);

// Codici di condivisione oplaytcg (versione 2): sempre Leader + 50 carte.
const oplay = {
  '2kFAocIICXDrEFBDhlw04b8OOHOAYOGAaD7HHARBZjbxyQU': ['EB05-010', 15],
  '2gNAEcICBuIKAOACG8AMEOAOC2AYCXBfANBCg_gHA_gIgtDBAGhPAJBQAFgJ': ['OP13-001', 15],
  '2gRCceAQGeAiFHCphWQsYW8LuGHDHhkw0obcN-HHHbo': ['OP17-039', 16]
};
for (const [code, [leader, n]] of Object.entries(oplay)) {
  for (const input of [code, 'https://oplaytcg.com/deck-builder?d=' + code + '&s=copy']) {
    const d = parseDeck(input);
    assert.equal(d.error, undefined, code);
    assert.equal(d.leader, leader);
    assert.equal(d.cards.length, n);
    assert.equal(total(d), 51);
  }
}

// Input non validi: errore, mai un mazzo a metà.
const lastChar = '2kFAocIICXDrEFBDhlw04b8OOHOAYOGAaD7HHARBZjbxyQU'.slice(-1);
for (const bad of ['', '   ', '[1,2', '["solo intestazione"]', 'ciao a tutti', '4xOP01-001\nnon una riga',
  '2kFAocIICXDrEFBDhlw04b8OOHOAYOGAaD7HHARBZjbxyQ' + (lastChar === 'A' ? 'B' : 'A')]) {
  assert(parseDeck(bad).error, 'doveva dare errore: ' + JSON.stringify(bad));
}

console.log('OK: formati JSON, NxCODICE e oplaytcg letti correttamente.');
