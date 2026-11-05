// Logica pura dell'app (nessun accesso a pagina, localStorage o Firestore).
// Caricata da index.html con un <script> classico (espone window.OPLogic) e dai test con require().
// Le funzioni ricevono i dati e l'ora ("now") come parametri, così si provano in memoria in modo ripetibile.
(function(root){
  var HISTORY_MAX_DAYS = 400;

  // ---- CARTE ----
  function target(card){ return card.leader ? 1 : 4; }

  function normalizeCode(c){ return (c||'').trim().toUpperCase(); }

  function clampOwned(card){
    var t = target(card);
    if(card.owned < 0) card.owned = 0;
    if(card.owned > t) card.owned = t;
  }

  function findCard(cards, code){
    var nc = normalizeCode(code);
    for(var i=0;i<cards.length;i++){ if(cards[i].code === nc) return cards[i]; }
    return null;
  }

  // Ogni modifica a una carta ne aggiorna il timestamp: è ciò che permette al merge di
  // scegliere la versione più recente quando due dispositivi hanno dati diversi.
  function touch(card, now){ card.updatedAt = now; }

  // Aggiunge o aggiorna una carta dentro "cards" (l'array viene modificato).
  function upsertCard(cards, data, now){
    var nc = normalizeCode(data.code);
    if(!nc) return { ok:false, error: 'Codice mancante' };
    if(!data.name || !data.name.trim()) return { ok:false, error: 'Nome mancante' };
    var existing = findCard(cards, nc);
    if(existing){
      var before = existing.name + '|' + existing.set + '|' + existing.rarity + '|' + existing.leader + '|' + existing.owned;
      existing.name = data.name.trim();
      existing.set = (data.set||'').trim() || existing.set;
      existing.rarity = (data.rarity||'').trim().toUpperCase();
      existing.leader = !!data.leader;
      clampOwned(existing);
      // Un reimport di dati invariati non deve "rinfrescare" la carta, altrimenti
      // batterebbe le copie segnate nel frattempo su un altro dispositivo.
      var after = existing.name + '|' + existing.set + '|' + existing.rarity + '|' + existing.leader + '|' + existing.owned;
      if(after !== before) touch(existing, now);
      return { ok:true, updated:true };
    } else {
      var card = { code: nc, name: data.name.trim(), set: (data.set||'').trim() || 'Senza set', rarity: (data.rarity||'').trim().toUpperCase(), leader: !!data.leader, owned: 0 };
      touch(card, now);
      cards.push(card);
      return { ok:true, updated:false };
    }
  }

  // Restituisce le carte senza quella eliminata e scrive la lapide in "deleted" (l'oggetto viene modificato).
  function deleteCard(cards, deleted, code, now){
    var nc = normalizeCode(code);
    deleted[nc] = now;
    return cards.filter(function(c){ return c.code !== nc; });
  }

  // "Svuota collezione": una lapide per ogni carta presente (l'oggetto "deleted" viene modificato).
  function tombstoneAll(cards, deleted, now){
    cards.forEach(function(c){ deleted[c.code] = now; });
  }

  // Tocco su un quadratino: se è già l'ultimo pieno si scende di uno, altrimenti si sale fino a quel quadratino.
  function toggleOwned(card, idx, now){
    card.owned = (card.owned === idx + 1) ? idx : idx + 1;
    clampOwned(card);
    touch(card, now);
  }

  // La stellina dei desideri: la chiave "wishlist" c'è solo quando è attiva (mai "false").
  function toggleWish(card, now){
    if(card.wishlist) delete card.wishlist; else card.wishlist = true;
    touch(card, now);
  }

  // ---- METADATI E STORICO ----
  function cleanMeta(m){
    m = m && typeof m === 'object' ? m : {};
    return {
      deleted: m.deleted && typeof m.deleted === 'object' ? m.deleted : {},
      history: m.history && typeof m.history === 'object' ? m.history : {}
    };
  }

  // Istantanea { cards, deleted, history } da un documento remoto: scarta le carte senza codice.
  function cleanSnapshot(raw){
    return {
      cards: (Array.isArray(raw.cards) ? raw.cards : []).filter(function(c){ return c && typeof c.code === 'string'; }),
      deleted: cleanMeta(raw).deleted, history: cleanMeta(raw).history
    };
  }

  function todayKey(now){
    var d = new Date(now);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  // Una voce al giorno (l'ultima): serve al grafico "Andamento" della vista Statistiche.
  // "history" viene modificato.
  function recordSnapshot(cards, history, now){
    if(cards.length === 0) return;
    var owned = 0, tgt = 0;
    cards.forEach(function(c){ tgt += target(c); owned += Math.min(c.owned || 0, target(c)); });
    var key = todayKey(now);
    var cur = history[key];
    if(cur && cur.owned === owned && cur.target === tgt) return;
    history[key] = { t: now, owned: owned, target: tgt };
    var keys = Object.keys(history).sort();
    while(keys.length > HISTORY_MAX_DAYS) delete history[keys.shift()];
  }

  // Unisce due istantanee { cards, deleted, history } (locale e remota) senza perdere modifiche.
  // Per ogni codice vince la carta con updatedAt maggiore (a parità vince quella remota, come
  // prima della sincronizzazione a merge); una carta sopravvive solo se è più recente della
  // sua eventuale lapide. Le carte senza updatedAt (dati vecchi) valgono 0.
  function mergeSnapshots(local, remote){
    var deleted = {};
    [remote.deleted, local.deleted].forEach(function(d){
      Object.keys(d || {}).forEach(function(code){
        if(!deleted.hasOwnProperty(code) || d[code] > deleted[code]) deleted[code] = d[code];
      });
    });
    var byCode = {};
    remote.cards.forEach(function(c){ byCode[c.code] = c; });
    local.cards.forEach(function(c){
      var r = byCode[c.code];
      if(!r || (c.updatedAt || 0) > (r.updatedAt || 0)) byCode[c.code] = c;
    });
    var cards = [];
    Object.keys(byCode).forEach(function(code){
      var c = byCode[code];
      if(deleted.hasOwnProperty(code)){
        if((c.updatedAt || 0) <= deleted[code]) return;
        delete deleted[code];
      }
      cards.push(c);
    });
    var history = {};
    [remote.history, local.history].forEach(function(h){
      Object.keys(h || {}).forEach(function(day){
        if(!history[day] || (h[day].t || 0) > (history[day].t || 0)) history[day] = h[day];
      });
    });
    return { cards: cards, deleted: deleted, history: history };
  }

  // Forma canonica per confrontare due istantanee indipendentemente dall'ordine.
  function canonSnapshot(s){
    var cards = s.cards.slice().sort(function(a,b){ return a.code < b.code ? -1 : a.code > b.code ? 1 : 0; });
    function sortedObj(o){
      var out = {};
      Object.keys(o || {}).sort().forEach(function(k){ out[k] = o[k]; });
      return out;
    }
    return JSON.stringify({ cards: cards, deleted: sortedObj(s.deleted), history: sortedObj(s.history) });
  }

  // ---- MAZZI: lettura dei formati ----
  var DECK_CODE = /^[A-Z]{1,4}\d{0,2}-\d{3}$/;
  var DECK_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var DECK_FAMILIES = ['OP', 'ST', 'EB', 'PRB', 'P'];

  // Codice di condivisione di oplaytcg.com, versione "2": 6 bit per carattere, ultimo carattere = controllo.
  // Formato ricavato osservando il sito e provato su mazzi reali; non è un'API ufficiale e può cambiare.
  function decodeOplayDeck(code){
    if(code.charAt(0) !== '2' || code.length < 3) return null;
    var body = code.slice(1, -1), sum = 7, bits = [], i, b;
    for(i = 0; i < body.length; i++) sum = (31 * sum + body.charCodeAt(i)) % 4093;
    if(DECK_ALPHABET.charAt(sum % 64) !== code.charAt(code.length - 1)) return null;
    for(i = 0; i < body.length; i++){
      var v = DECK_ALPHABET.indexOf(body.charAt(i));
      if(v < 0) return null;
      for(b = 5; b >= 0; b--) bits.push((v >> b) & 1);
    }
    var pos = 0;
    function read(n){
      if(pos + n > bits.length) throw new Error('fine del codice');
      var x = 0;
      for(var k = 0; k < n; k++) x = x * 2 + bits[pos++];
      return x;
    }
    // Una carta: [stesso set della precedente?] famiglia, set, numero [, copie].
    function readCard(withQty, prev){
      var prefix, set, j;
      if(withQty && read(1)){
        prefix = prev.prefix; set = prev.set;
      } else {
        var f = read(4);
        if(f === 15){ // codice scritto per esteso
          var len = read(5) + 1, text = '';
          for(j = 0; j < len; j++) text += String.fromCharCode(read(7));
          return { code: text, qty: withQty ? read(7) : 1, part: null };
        }
        if(f === 14){
          var n = read(2) + 1;
          prefix = '';
          for(j = 0; j < n; j++) prefix += String.fromCharCode(65 + read(5));
        } else if(f < DECK_FAMILIES.length){
          prefix = DECK_FAMILIES[f];
        } else {
          throw new Error('famiglia sconosciuta');
        }
        set = read(7);
      }
      var num = read(10);
      return {
        code: prefix + (set ? String(set).padStart(2, '0') : '') + '-' + String(num).padStart(3, '0'),
        qty: withQty ? read(2) + 1 : 1,
        part: { prefix: prefix, set: set }
      };
    }
    try{
      var cards = [], prev = null, r;
      if(read(1)){ r = readCard(false, null); cards.push([r.code, 1]); prev = r.part; }
      var count = read(7);
      if(count > 80) return null;
      for(i = 0; i < count; i++){ r = readCard(true, prev); prev = r.part; cards.push([r.code, r.qty]); }
      var ok = cards.length > 0 && cards.every(function(c){ return DECK_CODE.test(c[0]) && c[1] > 0; });
      return ok ? { leader: cards.length > count ? cards[0][0] : null, cards: cards } : null;
    }catch(e){
      return null;
    }
  }

  // Legge un mazzo incollato: elenco JSON di onepiecetopdecks, righe NxCODICE (OPTCGSim) o codice/link di oplaytcg.
  // Restituisce { leader, cards: [[codice, copie], ...] } (il Leader è la prima carta) oppure { error }.
  function parseDeck(text){
    text = String(text || '').trim();
    if(!text) return { error: 'Incolla un mazzo.' };
    var entries = [];
    if(text.charAt(0) === '['){
      var arr = null;
      try{ arr = JSON.parse(text); }catch(e){}
      if(!Array.isArray(arr)) return { error: 'Elenco JSON non valido.' };
      // La prima voce è un'intestazione di testo ("Exported from ..."): non è un codice, quindi si scarta.
      arr.forEach(function(x){
        var c = String(x).trim().toUpperCase();
        if(DECK_CODE.test(c)) entries.push([c, 1]);
      });
    } else {
      var lines = text.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
      var re = /^(\d{1,2})\s*x\s*([A-Z]{1,4}\d{0,2}-\d{3})$/i;
      if(lines.every(function(l){ return re.test(l); })){
        lines.forEach(function(l){ var m = l.match(re); entries.push([m[2].toUpperCase(), parseInt(m[1], 10)]); });
      } else {
        var link = text.match(/[?&]d=([A-Za-z0-9_-]+)/), code = link ? link[1] : text;
        var deck = /^[A-Za-z0-9_-]+$/.test(code) ? decodeOplayDeck(code) : null;
        if(deck) return deck;
        var some = lines.some(function(l){ return re.test(l); });
        return { error: some ? 'Alcune righe non sono nel formato 4xOP01-001.' : 'Formato non riconosciuto o codice non valido.' };
      }
    }
    var cards = [], index = {};
    entries.forEach(function(e){
      if(index.hasOwnProperty(e[0])) cards[index[e[0]]][1] += e[1];
      else { index[e[0]] = cards.length; cards.push([e[0], e[1]]); }
    });
    if(!cards.length) return { error: 'Nessuna carta riconosciuta.' };
    return { leader: cards[0][1] === 1 ? cards[0][0] : null, cards: cards };
  }

  // ---- MAZZI: dati e sincronizzazione ----
  // I mazzi si salvano a parte dalla collezione ({ list, deleted }) e hanno la stessa logica di merge:
  // vince il mazzo con updatedAt maggiore, una lapide in "deleted" impedisce che un mazzo eliminato riappaia.
  function cleanDecks(raw){
    raw = raw && typeof raw === 'object' ? raw : {};
    var list = (Array.isArray(raw.list) ? raw.list : []).filter(function(d){
      return d && typeof d.id === 'string' && Array.isArray(d.cards);
    }).map(function(d){
      d.cards = d.cards.filter(function(c){ return Array.isArray(c) && typeof c[0] === 'string' && c[1] > 0; });
      return d;
    });
    return { list: list, deleted: raw.deleted && typeof raw.deleted === 'object' ? raw.deleted : {} };
  }

  function mergeDecks(local, remote){
    var deleted = {};
    [remote.deleted, local.deleted].forEach(function(d){
      Object.keys(d).forEach(function(id){ if(!deleted.hasOwnProperty(id) || d[id] > deleted[id]) deleted[id] = d[id]; });
    });
    var byId = {};
    remote.list.forEach(function(d){ byId[d.id] = d; });
    local.list.forEach(function(d){
      var r = byId[d.id];
      if(!r || (d.updatedAt || 0) > (r.updatedAt || 0)) byId[d.id] = d;
    });
    var list = [];
    Object.keys(byId).forEach(function(id){
      var d = byId[id];
      if(deleted.hasOwnProperty(id)){
        if((d.updatedAt || 0) <= deleted[id]) return;
        delete deleted[id];
      }
      list.push(d);
    });
    return { list: list, deleted: deleted };
  }

  function canonDecks(s){
    var list = s.list.slice().sort(function(a, b){ return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var deleted = Object.keys(s.deleted).sort().map(function(k){ return [k, s.deleted[k]]; });
    return JSON.stringify({ list: list, deleted: deleted });
  }

  // Per ogni carta del mazzo: copie richieste, copie possedute. Ogni mazzo è valutato da solo (le copie
  // non si "prenotano" tra mazzi diversi). noSet: la carta non c'è e nemmeno il suo set è nella collezione.
  function deckStatus(cards, deck){
    var sets = {};
    cards.forEach(function(c){ var m = c.code.match(/^(.*)-/); if(m) sets[m[1]] = true; });
    var res = { need: 0, have: 0, missing: [], done: [] };
    deck.cards.forEach(function(c){
      var card = findCard(cards, c[0]), owned = card ? Math.min(card.owned || 0, c[1]) : 0;
      res.need += c[1];
      res.have += owned;
      var item = { code: c[0], need: c[1], owned: owned, noSet: !card && !sets[c[0].replace(/-.*/, '')] };
      (owned < c[1] ? res.missing : res.done).push(item);
    });
    return res;
  }

  // ---- IMPORT IN BLOCCO ----
  function parseBulk(text){
    text = text.trim();
    if(!text) return { cards: [], error: 'Incolla almeno una riga.' };
    if(text[0] === '[' || text[0] === '{'){
      try{
        var parsed = JSON.parse(text);
        var arr = Array.isArray(parsed) ? parsed : [parsed];
        return { cards: arr.map(function(o){
          return { code: o.code || o.codice, name: o.name || o.nome, set: o.set, rarity: o.rarity || o.rarita, leader: !!(o.leader || o.isLeader) };
        }) };
      }catch(e){
        return { cards: [], error: 'JSON non valido.' };
      }
    }
    var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);
    var cards = [];
    var isLeaderFlag = function(s){ return /^l(eader)?$/i.test(s); };
    for(var i=0;i<lines.length;i++){
      var parts = lines[i].split('|').map(function(p){ return p.trim(); });
      if(parts.length < 2){ return { cards: [], error: 'Riga ' + (i+1) + ' non valida: serve almeno codice | nome' }; }
      var rarity = '', leaderFlag = false;
      if(parts[3] && isLeaderFlag(parts[3]) && !parts[4]){
        leaderFlag = true;
      } else {
        rarity = parts[3] || '';
        leaderFlag = parts[4] ? isLeaderFlag(parts[4]) : false;
      }
      cards.push({ code: parts[0], name: parts[1], set: parts[2] || '', rarity: rarity, leader: leaderFlag });
    }
    return { cards: cards };
  }

  var OPLogic = {
    target: target, normalizeCode: normalizeCode, clampOwned: clampOwned,
    upsertCard: upsertCard, deleteCard: deleteCard, tombstoneAll: tombstoneAll,
    toggleOwned: toggleOwned, toggleWish: toggleWish,
    cleanMeta: cleanMeta, cleanSnapshot: cleanSnapshot, recordSnapshot: recordSnapshot,
    mergeSnapshots: mergeSnapshots, canonSnapshot: canonSnapshot,
    parseDeck: parseDeck, decodeOplayDeck: decodeOplayDeck,
    cleanDecks: cleanDecks, mergeDecks: mergeDecks, canonDecks: canonDecks, deckStatus: deckStatus,
    parseBulk: parseBulk
  };
  if(typeof module !== 'undefined' && module.exports) module.exports = OPLogic;
  else root.OPLogic = OPLogic;
})(this);
