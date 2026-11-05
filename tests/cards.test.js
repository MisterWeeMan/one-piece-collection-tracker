// Modifiche alle carte (aggiunta, import, eliminazione, quadratini, desideri), storico e import in blocco.
// Solo oggetti in memoria e carte inventate (ZZ01-...): nessun localStorage, Firestore o dato reale.
var test = require('node:test');
var assert = require('node:assert/strict');
var L = require('../logic.js');

test('upsertCard: codice o nome mancante = errore e nessuna modifica', function(){
  var cards = [];
  assert.deepEqual(L.upsertCard(cards, { code: '  ', name: 'X' }, 1), { ok: false, error: 'Codice mancante' });
  assert.deepEqual(L.upsertCard(cards, { code: 'ZZ01-001', name: '   ' }, 1), { ok: false, error: 'Nome mancante' });
  assert.deepEqual(L.upsertCard(cards, { code: 'ZZ01-001' }, 1), { ok: false, error: 'Nome mancante' });
  assert.equal(cards.length, 0);
});

test('upsertCard: carta nuova, formato salvato invariato', function(){
  var cards = [];
  var res = L.upsertCard(cards, { code: ' zz01-001 ', name: ' Prova ', set: '', rarity: ' sr ', leader: 1 }, 1000);
  assert.deepEqual(res, { ok: true, updated: false });
  // Le chiavi esatte di una carta salvata (op-collection-cards): non devono cambiare senza una migrazione.
  assert.deepEqual(cards, [{ code: 'ZZ01-001', name: 'Prova', set: 'Senza set', rarity: 'SR', leader: true, owned: 0, updatedAt: 1000 }]);
});

test('upsertCard: reimport di dati uguali non cambia updatedAt', function(){
  var cards = [{ code: 'ZZ01-001', name: 'Prova', set: 'Set Finto', rarity: 'C', leader: false, owned: 2, updatedAt: 50 }];
  var res = L.upsertCard(cards, { code: 'zz01-001', name: 'Prova', set: 'Set Finto', rarity: 'c', leader: false }, 9999);
  assert.deepEqual(res, { ok: true, updated: true });
  assert.equal(cards.length, 1, 'niente doppioni');
  assert.equal(cards[0].updatedAt, 50);
  assert.equal(cards[0].owned, 2, 'le copie segnate restano');
});

test('upsertCard: un dato cambiato aggiorna updatedAt; set vuoto tiene il vecchio', function(){
  var cards = [{ code: 'ZZ01-001', name: 'Prova', set: 'Set Finto', rarity: 'C', leader: false, owned: 2, updatedAt: 50 }];
  L.upsertCard(cards, { code: 'ZZ01-001', name: 'Nuovo nome', set: '', rarity: 'C', leader: false }, 70);
  assert.equal(cards[0].name, 'Nuovo nome');
  assert.equal(cards[0].set, 'Set Finto');
  assert.equal(cards[0].updatedAt, 70);
});

test('upsertCard: diventare Leader porta le copie a 1', function(){
  var cards = [{ code: 'ZZ01-001', name: 'Prova', set: 'S', rarity: 'C', leader: false, owned: 3, updatedAt: 50 }];
  L.upsertCard(cards, { code: 'ZZ01-001', name: 'Prova', set: 'S', rarity: 'C', leader: true }, 70);
  assert.equal(cards[0].owned, 1);
  assert.equal(cards[0].updatedAt, 70);
});

test('target e clampOwned: 1 per i Leader, 4 per gli altri, mai negativo', function(){
  assert.equal(L.target({ leader: true }), 1);
  assert.equal(L.target({ leader: false }), 4);
  var a = { leader: false, owned: 9 }, b = { leader: true, owned: 3 }, c = { leader: false, owned: -2 };
  [a, b, c].forEach(L.clampOwned);
  assert.deepEqual([a.owned, b.owned, c.owned], [4, 1, 0]);
});

test('deleteCard: toglie la carta e scrive la lapide con il codice normalizzato', function(){
  var cards = [{ code: 'ZZ01-001' }, { code: 'ZZ01-002' }], deleted = {};
  var rest = L.deleteCard(cards, deleted, ' zz01-001', 500);
  assert.deepEqual(rest, [{ code: 'ZZ01-002' }]);
  assert.deepEqual(deleted, { 'ZZ01-001': 500 });
  assert.equal(cards.length, 2, 'l\'array di partenza non cambia');
  L.deleteCard(rest, deleted, 'ZZ09-999', 600); // codice assente: la lapide si scrive comunque
  assert.equal(deleted['ZZ09-999'], 600);
});

test('tombstoneAll (svuota collezione): una lapide per ogni carta', function(){
  var deleted = { 'ZZ01-009': 1 };
  L.tombstoneAll([{ code: 'ZZ01-001' }, { code: 'ZZ01-002' }], deleted, 700);
  assert.deepEqual(deleted, { 'ZZ01-009': 1, 'ZZ01-001': 700, 'ZZ01-002': 700 });
});

test('toggleOwned: secondo tocco sull\'ultimo quadratino torna indietro, limiti rispettati', function(){
  var c = { code: 'ZZ01-001', leader: false, owned: 0 };
  L.toggleOwned(c, 2, 10);
  assert.equal(c.owned, 3);
  assert.equal(c.updatedAt, 10);
  L.toggleOwned(c, 2, 11);
  assert.equal(c.owned, 2);
  L.toggleOwned(c, 0, 12);
  assert.equal(c.owned, 1);
  L.toggleOwned(c, 0, 13);
  assert.equal(c.owned, 0);
  var l = { code: 'ZZ01-002', leader: true, owned: 0 };
  L.toggleOwned(l, 3, 14); // un quadratino oltre l'obiettivo di un Leader
  assert.equal(l.owned, 1);
});

test('toggleWish: la chiave wishlist c\'è solo se attiva, mai false', function(){
  var c = { code: 'ZZ01-001', owned: 0 };
  L.toggleWish(c, 5);
  assert.equal(c.wishlist, true);
  assert.equal(c.updatedAt, 5);
  L.toggleWish(c, 6);
  assert.equal('wishlist' in c, false);
  assert.equal(c.updatedAt, 6);
});

// ---- storico ----
var DAY = new Date(2026, 0, 5, 12, 0, 0).getTime(); // 5 gennaio 2026, ora locale

test('recordSnapshot: nessuna carta, nessuna voce', function(){
  var h = {};
  L.recordSnapshot([], h, DAY);
  assert.deepEqual(h, {});
});

test('recordSnapshot: conta min(copie, obiettivo) e obiettivo totale', function(){
  var h = {};
  L.recordSnapshot([{ leader: false, owned: 9 }, { leader: true, owned: 1 }, { leader: false, owned: 2 }, { leader: false }], h, DAY);
  assert.deepEqual(h, { '2026-01-05': { t: DAY, owned: 7, target: 13 } });
});

test('recordSnapshot: stessi numeri non cambiano t, numeri diversi sì', function(){
  var cards = [{ leader: false, owned: 1 }], h = {};
  L.recordSnapshot(cards, h, DAY);
  L.recordSnapshot(cards, h, DAY + 5000);
  assert.equal(h['2026-01-05'].t, DAY);
  cards[0].owned = 2;
  L.recordSnapshot(cards, h, DAY + 6000);
  assert.deepEqual(h['2026-01-05'], { t: DAY + 6000, owned: 2, target: 4 });
});

test('recordSnapshot: oltre 400 giorni toglie i più vecchi', function(){
  var h = {};
  for(var i = 0; i < 400; i++) h['2020-' + String(i).padStart(4, '0')] = { t: i, owned: 0, target: 4 };
  L.recordSnapshot([{ leader: false, owned: 1 }], h, DAY);
  var keys = Object.keys(h);
  assert.equal(keys.length, 400);
  assert.ok(!('2020-0000' in h));
  assert.ok('2026-01-05' in h);
});

// ---- import in blocco ----
test('parseBulk: righe codice | nome | set | rarità | L', function(){
  var r = L.parseBulk('ZZ01-001 | Uno | Set Finto | SR | L\r\nZZ01-002|Due|Set Finto\n\n  ZZ01-003 | Tre | | | leader\nZZ01-004 | Quattro | S | L');
  assert.equal(r.error, undefined);
  assert.deepEqual(r.cards, [
    { code: 'ZZ01-001', name: 'Uno', set: 'Set Finto', rarity: 'SR', leader: true },
    { code: 'ZZ01-002', name: 'Due', set: 'Set Finto', rarity: '', leader: false },
    { code: 'ZZ01-003', name: 'Tre', set: '', rarity: '', leader: true },
    { code: 'ZZ01-004', name: 'Quattro', set: 'S', rarity: '', leader: true }
  ]);
});

test('parseBulk: riga con una sola colonna = errore con il numero e nessuna carta', function(){
  var r = L.parseBulk('ZZ01-001 | Uno\nsolo testo');
  assert.deepEqual(r, { cards: [], error: 'Riga 2 non valida: serve almeno codice | nome' });
});

test('parseBulk: JSON (array, oggetto singolo, chiavi italiane) e JSON non valido', function(){
  var a = L.parseBulk('[{"code":"ZZ01-001","name":"Uno","set":"S","rarity":"C","isLeader":true},{"codice":"ZZ01-002","nome":"Due","rarita":"R"}]');
  assert.deepEqual(a.cards, [
    { code: 'ZZ01-001', name: 'Uno', set: 'S', rarity: 'C', leader: true },
    { code: 'ZZ01-002', name: 'Due', set: undefined, rarity: 'R', leader: false }
  ]);
  assert.equal(L.parseBulk('{"code":"ZZ01-003","name":"Tre"}').cards.length, 1);
  assert.equal(L.parseBulk('[{"code":').error, 'JSON non valido.');
});

test('parseBulk: testo vuoto = errore', function(){
  assert.equal(L.parseBulk('  \n ').error, 'Incolla almeno una riga.');
});

test('parseBulk + upsertCard: reimportare due volte lo stesso testo non duplica né rinfresca', function(){
  var cards = [], text = 'ZZ01-001 | Uno | Set Finto | C\nZZ01-002 | Due | Set Finto | R';
  L.parseBulk(text).cards.forEach(function(c){ L.upsertCard(cards, c, 100); });
  L.parseBulk(text).cards.forEach(function(c){ L.upsertCard(cards, c, 200); });
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map(function(c){ return c.updatedAt; }), [100, 100]);
});
