// Reading of the deck formats (JSON, NxCODE, oplaytcg code) and the missing-cards calculation.
// Made-up cards (ZZ01-...), except the 3 real oplaytcg share codes previously used in
// scripts/check-deck-parser.mjs (public decks, no collection data).
var test = require('node:test');
var assert = require('node:assert/strict');
var L = require('../logic.js');

var total = function(d){ return d.cards.reduce(function(n, c){ return n + c[1]; }, 0); };

// ---- real decks (same deck as JSON and as lines) ----
var JSON_DECK = '["Exported from onepiecetopdecks.com","EB05-010","OP09-106","OP09-106","OP09-106","OP09-106","OP13-113","OP13-113","OP13-113","OP13-113","EB05-050","EB05-050","EB05-050","EB05-050","EB05-057","EB05-057","EB05-057","EB05-057","OP17-109","OP17-109","OP17-109","OP17-109","EB05-052","EB05-052","EB05-052","EB05-055","EB05-055","EB05-055","EB05-055","OP14-108","OP14-108","OP14-108","OP14-108","OP17-114","OP17-114","EB03-055","EB03-055","EB03-055","EB04-018","EB04-018","EB04-018","OP13-031","OP13-031","EB05-016","EB05-016","EB05-016","EB05-016","OP17-022","OP17-022","OP17-022","OP14-118","OP14-118"]';
var LINES_DECK = '1xEB05-010\n4xOP09-106\n4xOP13-113\n4xEB05-050\n4xEB05-057\n4xOP17-109\n3xEB05-052\n4xEB05-055\n4xOP14-108\n2xOP17-114\n3xEB03-055\n3xEB04-018\n2xOP13-031\n4xEB05-016\n3xOP17-022\n2xOP14-118\n';

test('parseDeck: JSON onepiecetopdecks e righe NxCODICE danno lo stesso mazzo', function(){
  var a = L.parseDeck(JSON_DECK), b = L.parseDeck(LINES_DECK);
  assert.equal(a.leader, 'EB05-010');
  assert.equal(a.cards.length, 16);
  assert.equal(total(a), 51);
  assert.deepEqual(a, b);
});

test('parseDeck: codici oplaytcg reali, da soli o dentro un link', function(){
  var oplay = {
    '2kFAocIICXDrEFBDhlw04b8OOHOAYOGAaD7HHARBZjbxyQU': ['EB05-010', 15],
    '2gNAEcICBuIKAOACG8AMEOAOC2AYCXBfANBCg_gHA_gIgtDBAGhPAJBQAFgJ': ['OP13-001', 15],
    '2gRCceAQGeAiFHCphWQsYW8LuGHDHhkw0obcN-HHHbo': ['OP17-039', 16]
  };
  Object.keys(oplay).forEach(function(code){
    [code, ' ' + code + ' ', 'https://oplaytcg.com/deck-builder?d=' + code + '&s=copy', 'https://x.test/?a=1&d=' + code].forEach(function(input){
      var d = L.parseDeck(input);
      assert.equal(d.error, undefined, code);
      assert.equal(d.leader, oplay[code][0]);
      assert.equal(d.cards.length, oplay[code][1]);
      assert.equal(total(d), 51);
    });
  });
});

test('parseDeck: input non validi = errore, mai un mazzo a metà', function(){
  var good = '2kFAocIICXDrEFBDhlw04b8OOHOAYOGAaD7HHARBZjbxyQU', last = good.slice(-1);
  ['', '   ', null, undefined, '[1,2', 'ciao a tutti', '4xOP01-001\nnon una riga',
    good.slice(0, -1) + (last === 'A' ? 'B' : 'A')].forEach(function(bad){
    assert.ok(L.parseDeck(bad).error, 'doveva dare errore: ' + JSON.stringify(bad));
  });
  assert.equal(L.parseDeck('["solo intestazione"]').error, 'Nessuna carta riconosciuta.');
  assert.equal(L.parseDeck('4xZZ01-001\nnon una riga').error, 'Alcune righe non sono nel formato 4xOP01-001.');
  assert.equal(L.parseDeck('[1,2').error, 'Elenco JSON non valido.');
});

test('parseDeck: maiuscole/minuscole, spazi, righe vuote e CRLF nelle righe NxCODICE', function(){
  var d = L.parseDeck('1 x zz01-001\r\n\r\n 4xZZ01-002 \r\n');
  assert.deepEqual(d, { leader: 'ZZ01-001', cards: [['ZZ01-001', 1], ['ZZ01-002', 4]] });
});

test('parseDeck: lo stesso codice più volte si somma, senza perdere carte', function(){
  var rows = L.parseDeck('2xZZ01-002\n1xZZ01-001\n2xZZ01-002');
  assert.deepEqual(rows.cards, [['ZZ01-002', 4], ['ZZ01-001', 1]]);
  var json = L.parseDeck('["h","ZZ01-001","ZZ01-002","zz01-002"," ZZ01-002 "]');
  assert.deepEqual(json.cards, [['ZZ01-001', 1], ['ZZ01-002', 3]]);
});

test('parseDeck: il Leader è la prima carta solo se ha una copia', function(){
  assert.equal(L.parseDeck('1xZZ01-001\n4xZZ01-002').leader, 'ZZ01-001');
  assert.equal(L.parseDeck('4xZZ01-002\n1xZZ01-001').leader, null);
});

test('parseDeck: nel JSON le voci che non sono codici si scartano', function(){
  var d = L.parseDeck('["Exported from x", 5, null, "ZZ01-001", "non-un-codice"]');
  assert.deepEqual(d.cards, [['ZZ01-001', 1]]);
});

// ---- test encoder for oplaytcg codes (version 2), to cover the branches the real decks do not reach ----
var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function Bits(){ this.b = []; }
Bits.prototype.put = function(n, v){ for(var i = n - 1; i >= 0; i--) this.b.push((v >> i) & 1); return this; };
var FAM = { OP: 0, ST: 1, EB: 2, PRB: 3, P: 4 };
// One card: { same:true } | { fam, set } | { custom:'XY', set } | { raw:'ZZ99-123' }, plus num and qty.
function putCard(w, c, withQty){
  if(c.raw !== undefined){
    if(withQty) w.put(1, 0);
    w.put(4, 15).put(5, c.raw.length - 1);
    for(var i = 0; i < c.raw.length; i++) w.put(7, c.raw.charCodeAt(i));
    if(withQty) w.put(7, c.qty);
    return;
  }
  if(withQty) w.put(1, c.same ? 1 : 0);
  if(!c.same){
    if(c.custom){
      w.put(4, 14).put(2, c.custom.length - 1);
      for(var j = 0; j < c.custom.length; j++) w.put(5, c.custom.charCodeAt(j) - 65);
    } else {
      w.put(4, c.famIndex !== undefined ? c.famIndex : FAM[c.fam]);
    }
    w.put(7, c.set);
  }
  w.put(10, c.num);
  if(withQty) w.put(2, c.qty - 1);
}
function encode(leader, cards, count, fixSum){
  var w = new Bits();
  if(leader){ w.put(1, 1); putCard(w, leader, false); } else w.put(1, 0);
  w.put(7, count !== undefined ? count : cards.length);
  cards.forEach(function(c){ putCard(w, c, true); });
  while(w.b.length % 6) w.b.push(0);
  var body = '', sum = 7, i;
  for(i = 0; i < w.b.length; i += 6){
    var v = 0;
    for(var k = 0; k < 6; k++) v = v * 2 + w.b[i + k];
    body += ALPHABET.charAt(v);
  }
  for(i = 0; i < body.length; i++) sum = (31 * sum + body.charCodeAt(i)) % 4093;
  return '2' + body + ALPHABET.charAt((sum + (fixSum || 0)) % 64);
}

test('oplay: Leader + carte con tutti i tipi di codice (famiglia, stesso set, lettere, per esteso)', function(){
  var code = encode({ fam: 'OP', set: 13, num: 1 }, [
    { fam: 'OP', set: 13, num: 5, qty: 4 },
    { same: true, num: 6, qty: 3 },       // same set as the previous one
    { fam: 'ST', set: 1, num: 2, qty: 2 },
    { fam: 'P', set: 0, num: 3, qty: 1 }, // promo: "P-003"
    { custom: 'XY', set: 3, num: 7, qty: 2 },
    { raw: 'ZZ99-123', qty: 4 },
    { fam: 'PRB', set: 2, num: 9, qty: 1 }
  ]);
  var d = L.parseDeck(code);
  assert.equal(d.error, undefined);
  assert.deepEqual(d, { leader: 'OP13-001', cards: [
    ['OP13-001', 1], ['OP13-005', 4], ['OP13-006', 3], ['ST01-002', 2], ['P-003', 1], ['XY03-007', 2], ['ZZ99-123', 4], ['PRB02-009', 1]
  ] });
});

test('oplay: senza Leader dichiarato il leader è nullo', function(){
  var d = L.parseDeck(encode(null, [{ fam: 'EB', set: 5, num: 10, qty: 4 }, { same: true, num: 11, qty: 2 }]));
  assert.deepEqual(d, { leader: null, cards: [['EB05-010', 4], ['EB05-011', 2]] });
});

test('oplay: codici malformati danno errore', function(){
  var ok = [{ fam: 'OP', set: 1, num: 1, qty: 1 }];
  assert.equal(L.parseDeck(encode(null, ok)).error, undefined, 'il codice di base è valido');
  var bad = {
    'checksum sbagliato': encode(null, ok, undefined, 1),
    'più di 80 carte': encode(null, ok, 81),
    'carte dichiarate ma mancanti (codice troncato)': encode(null, ok, 5),
    'famiglia sconosciuta': encode(null, [{ famIndex: 13, set: 1, num: 1, qty: 1 }]),
    'stesso set senza carta precedente': encode(null, [{ same: true, num: 1, qty: 1 }]),
    'stesso set dopo un codice per esteso': encode(null, [{ raw: 'ZZ99-123', qty: 1 }, { same: true, num: 2, qty: 1 }]),
    'codice per esteso non valido': encode(null, [{ raw: 'abc', qty: 1 }]),
    'copie a zero': encode(null, [{ raw: 'ZZ99-123', qty: 0 }]),
    'nessuna carta': encode(null, [])
  };
  Object.keys(bad).forEach(function(why){
    assert.ok(L.parseDeck(bad[why]).error, why);
  });
});

test('oplay: versione diversa da "2" o codice troppo corto = errore', function(){
  var code = encode(null, [{ fam: 'OP', set: 1, num: 1, qty: 1 }]);
  assert.ok(L.parseDeck('1' + code.slice(1)).error);
  assert.equal(L.decodeOplayDeck('2A'), null);
  assert.equal(L.decodeOplayDeck(''), null);
});

// ---- missing cards ----
function owned(code, n){ return { code: code, name: 'Carta ' + code, set: 'Set Finto', rarity: 'C', leader: false, owned: n }; }

test('deckStatus: conta solo le copie richieste e separa mancanti e complete', function(){
  var cards = [owned('ZZ01-001', 1), owned('ZZ01-002', 4), owned('ZZ01-003', 2), owned('ZZ01-004', 0)];
  var deck = { cards: [['ZZ01-001', 1], ['ZZ01-002', 3], ['ZZ01-003', 4], ['ZZ01-004', 2]] };
  var s = L.deckStatus(cards, deck);
  assert.equal(s.need, 10);
  assert.equal(s.have, 1 + 3 + 2 + 0, 'le 4 copie possedute valgono solo 3');
  assert.deepEqual(s.done.map(function(i){ return i.code; }), ['ZZ01-001', 'ZZ01-002']);
  assert.deepEqual(s.missing.map(function(i){ return [i.code, i.need, i.owned]; }), [['ZZ01-003', 4, 2], ['ZZ01-004', 2, 0]]);
});

test('deckStatus: codice scritto in modo diverso e owned mancante', function(){
  var c = owned('ZZ01-001', 2);
  delete c.owned;
  var s = L.deckStatus([c], { cards: [['ZZ01-001', 1]] });
  assert.equal(s.have, 0);
  assert.equal(s.missing.length, 1);
});

test('deckStatus: noSet è vero solo se non c\'è la carta né il suo set', function(){
  var cards = [owned('ZZ01-001', 1)];
  var s = L.deckStatus(cards, { cards: [['ZZ01-002', 1], ['ZZ09-001', 1], ['ZZ01-001', 1]] });
  var by = {};
  s.missing.concat(s.done).forEach(function(i){ by[i.code] = i; });
  assert.equal(by['ZZ01-002'].noSet, false, 'carta assente ma set presente');
  assert.equal(by['ZZ09-001'].noSet, true, 'set assente');
  assert.equal(by['ZZ01-001'].noSet, false, 'carta presente');
  assert.equal(L.deckStatus([], { cards: [['ZZ01-001', 1]] }).missing[0].noSet, true, 'collezione vuota');
});

test('deckStatus: due mazzi con le stesse carte non si "prenotano" le copie', function(){
  var cards = [owned('ZZ01-001', 4)];
  var a = L.deckStatus(cards, { cards: [['ZZ01-001', 4]] }), b = L.deckStatus(cards, { cards: [['ZZ01-001', 4]] });
  assert.equal(a.have, 4);
  assert.equal(b.have, 4);
  assert.equal(a.missing.length + b.missing.length, 0);
});

test('deckStatus: mazzo vuoto e input non modificati', function(){
  var cards = [owned('ZZ01-001', 2)], deck = { cards: [['ZZ01-001', 3]] };
  var c0 = JSON.stringify(cards), d0 = JSON.stringify(deck);
  assert.deepEqual(L.deckStatus(cards, { cards: [] }), { need: 0, have: 0, missing: [], done: [] });
  L.deckStatus(cards, deck);
  assert.equal(JSON.stringify(cards), c0);
  assert.equal(JSON.stringify(deck), d0);
});
