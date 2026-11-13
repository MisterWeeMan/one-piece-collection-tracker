# Percorso di studio: Claude Code con l'app One Piece

Scopo: imparare a usare Claude Code (e l'AI in generale) usando questa app come palestra.
Ogni capitolo fa provare una funzione nuova di Claude Code su un lavoro vero dell'app.

## Come usare questo file

- Un capitolo = una sessione nuova di Claude Code.
- Segui l'ordine: i capitoli 4, 5 e 6 preparano i capitoli 7 e 9.
- Alla fine di ogni capitolo spunta la casella e scrivi 3 righe nelle note:
  1. cosa ha fatto bene Claude;
  2. cosa ha sbagliato;
  3. cosa hai dovuto controllare tu.
- Le regole del progetto (in `CLAUDE.md`) valgono anche qui: solo `main`, nessuna PR, ogni funzione deve funzionare su PC e telefono, niente dipendenze o build step non richiesti.
- Le funzioni dell'app usate come esercizio vengono dalle 5 idee discusse: aggiunta veloce per codice, ricerca e filtri, grafico della storia, backup ed esportazione, valore della collezione.

**Prima di iniziare ogni capitolo**: chiedi a Claude di verificare che la funzione sia disponibile nel tuo piano e sul tuo PC. Non è stato ancora controllato per: Action con Claude, task in cloud, Firebase MCP.

---

## Parte A: le basi

### Cap. 1: CLAUDE.md e memoria

- [ ] Fatto

**Funzione**: file di istruzioni (`CLAUDE.md`) e memoria.

**Esercizio**
- Il file esiste già. Aggiungi le regole del gioco: massimo 4 copie per codice, 1 solo Leader, formato codice `SET-NNN`.
- Apri una sessione nuova e chiedi "quante copie posso mettere nel mazzo?". Non ripetere la regola.

**Cosa impari**: la differenza tra `CLAUDE.md` (regole che scrivi tu, lette a ogni sessione) e memoria (appunti che Claude tiene tra le sessioni).

**Fatto quando**: la risposta è giusta senza che tu la ricordi.

**Note**:

---

### Cap. 2: Plan mode e gestione del contesto

- [ ] Fatto

**Funzione**: plan mode, `/clear`, `/compact`.

**Esercizio**
- Funzione dell'app: aggiunta veloce per codice (scrivi `OP05-060`, premi Invio, la carta sale di +1).
- Usa il plan mode: Claude legge e propone un piano, senza modificare nulla finché non approvi.
- Prova `/clear` (azzera la conversazione) e `/compact` (la riassume): servono quando la sessione si fa lunga.

**Cosa impari**: guidare Claude prima che scriva codice, e tenere il contesto pulito.

**Fatto quando**: hai rifiutato o cambiato almeno un punto del piano.

**Note**:

---

### Cap. 3: Verifica nel browser

- [ ] Fatto

**Funzione**: browser integrato nell'app Claude (apre la pagina, la ridimensiona, clicca, legge la console).

**Esercizio**
- Funzione dell'app: ricerca e filtri su tutte le carte (nome o codice; colore, rarità, tipo; "ce l'ho / mi manca").
- Claude verifica a larghezza PC e a larghezza telefono.
- Attenzione: il login obbligatorio blocca la pagina. Serve un Firebase finto in locale, come già fatto in passato.
- Qui si decide anche il server locale: `CLAUDE.md` dice di proporlo prima, mai di crearlo senza chiedere.

**Cosa impari**: far verificare a Claude il proprio lavoro, non solo scriverlo.

**Fatto quando**: hai visto la verifica su PC e su telefono e ne conosci i limiti (login, sincronizzazione).

**Note**:

---

## Parte B: automazione

### Cap. 4: Test automatici

- [ ] Fatto

**Funzione**: test con `node --test` (incluso in Node, nessuna dipendenza) e skill `tdd` (una skill è un pacchetto di istruzioni che Claude carica).

**Esercizio**
- Cosa testare: i 3 parser dei mazzi, il calcolo delle carte mancanti, la validità del catalogo.
- Da discutere prima: la logica sta dentro `index.html`. Serve l'estrazione più piccola possibile, senza build step.
- Lavora a test prima: test rosso, poi codice, poi test verde.

**Cosa impari**: far scrivere test a Claude e usarli come rete di sicurezza.

**Fatto quando**: i test sono verdi, e rompendone uno a mano diventano rossi.

**Note**:

---

### Cap. 5: Hook

- [ ] Fatto

**Funzione**: hook (un comando che l'app lancia da sola prima o dopo un'azione di Claude; non dipende da Claude, funziona sempre).

**Esercizio**
- Hook 1: blocca ogni modifica manuale a `card-catalog.json` (è un file generato).
- Hook 2: prima di `git push`, controlla che l'account GitHub attivo sia `MisterWeeMan`.

**Cosa impari**: trasformare una regola scritta in un controllo automatico.

**Fatto quando**: chiedi a Claude di modificare il catalogo a mano e l'hook lo ferma.

**Note**:

---

### Cap. 6: Skill tua (un comando personale)

- [ ] Fatto

**Funzione**: skill personalizzate (`/nome-comando`).

**Esercizio**
- Crea `/nuovo-set EB06`. I passi: aggiungere il codice a `SET_RELEASE_ORDER`, lanciare `node scripts/build-catalog.mjs`, controllare i conteggi, dirti cosa committare.

**Cosa impari**: mettere una procedura ripetitiva in un comando riutilizzabile.

**Fatto quando**: la usi su un set vero, alla sua uscita.

**Note**:

---

### Cap. 7: Subagenti

- [ ] Fatto

**Funzione**: subagenti (assistenti con contesto separato e strumenti limitati; ti torna solo il loro rapporto).

**Esercizio**
- `catalog-checker`: sola lettura, valida il catalogo dopo la rigenerazione.
- `reviewer`: legge la differenza del lavoro e segnala i problemi.
- Usali dentro la skill del cap. 6.

**Cosa impari**: delegare compiti senza riempire la tua conversazione.

**Fatto quando**: la tua conversazione resta corta e arriva solo il rapporto.

**Note**:

---

## Parte C: qualità e autonomia

### Cap. 8: Revisione di codice e sicurezza

- [ ] Fatto

**Funzione**: `/code-review` e `/security-review`.

**Esercizio**
- Lancia le due revisioni sul codice del login Google e della sincronizzazione (commit `4f559bb` e `63772df`).
- Rischio reale: le regole Firestore non sono nel repo, stanno nella console Firebase.

**Cosa impari**: usare Claude come revisore e non fidarsi alla cieca dei suoi risultati.

**Fatto quando**: per almeno un problema segnalato hai verificato tu se è vero e deciso se correggerlo o scartarlo, con un motivo.

**Note**:

---

### Cap. 9: GitHub Action

- [ ] Fatto

**Funzione**: GitHub Action (un controllo che GitHub esegue da solo a ogni push) e, facoltativa, Claude dentro la Action.

**Esercizio**
- Parte A, senza AI: la Action lancia `node --test` e il controllo del catalogo.
- Parte B, facoltativa: revisione con Claude, che richiede una chiave API.
  - La salvi tu nei Secrets di GitHub, Claude non la vede e non la stampa.
  - Costa denaro.

**Attenzione**: il push su `main` pubblica già il sito, quindi la Action avvisa dopo e non blocca. Per questo serve anche l'hook del cap. 5.

**Fatto quando**: rompi un test (non l'app, così il sito pubblicato resta intatto) e la Action diventa rossa.

**Note**:

---

### Cap. 10: Task programmati

- [ ] Fatto

**Funzione**: task programmati (eseguiti a orari fissi).

**Esercizio**
- Ogni settimana un controllo confronta tcgcsv con il tuo catalogo e ti dice se è uscito un set nuovo. Riporta soltanto, non modifica nulla.
- Differenza da valutare: un task locale gira solo a PC acceso; un task in cloud ha bisogno dell'accesso al repo privato.

**Cosa impari**: far lavorare Claude senza di te.

**Fatto quando**: la prima esecuzione ti consegna un rapporto.

**Note**:

---

## Bonus

### Cap. 11: Modalità headless e MCP

- [ ] Fatto

**Funzione**: `claude -p` (headless) e MCP.

**Esercizio**
- Headless: `claude -p "..."` esegue Claude da uno script, senza chat. Potresti usarlo nella Action per riassumere le modifiche al catalogo.
- MCP: un collegamento di Claude a strumenti esterni. Caso possibile: Firebase, per mettere nel repo le regole Firestore. Da verificare se esiste e se è adatto.

**Note**:

---

### Cap. 12: Sessioni parallele e worktree

- [ ] Fatto

**Funzione**: worktree (copie del repo su rami separati) e più sessioni insieme.

**Attenzione**: vanno contro la regola "solo `main`, mai rami". Falli solo se accetti un'eccezione scritta in `CLAUDE.md`, altrimenti salta il capitolo.

**Note**:
