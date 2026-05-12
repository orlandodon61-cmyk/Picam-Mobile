# 📦 PICAM Mobile v4.0

**Progressive Web App per la gestione mobile di inventario e ordini, integrata con il gestionale Picam ERP.**

Funziona su qualsiasi smartphone o tablet Android/iOS tramite Chrome, senza installazione di app native. Sincronizza i dati con Google Drive per l'importazione nel gestionale Picam (Faircom c-tree Plus).

---

## ✨ Funzionalità

### 📋 Inventario Tri-Modale
- **Scansione** — ricerca testuale + scanner QR/barcode da fotocamera; fast scan (qty=1 automatico)
- **Per Locazione** — tabella articoli di una corsia/scaffale; tocco singolo = lente ingrandimento; doppio tocco = inserimento quantità; ritorno automatico alla posizione precedente
- **Per Gruppo Merceologico** — come per locazione, filtrato per categoria merceologica
- Tastiera virtuale soppressa durante la navigazione tabellare (`inputmode="none"`)

### 🛒 Ordini Clienti
- Ricerca clienti, selezione articoli con barcode o testo
- **Prezzo vendita editabile** (sfondo verde) pre-compilato con ultimo prezzo
- Calcolo automatico IVA, imponibile e totale ordine
- Stampa PDF professionale con/senza prezzi
- Condivisione tramite Web Share API

### 🏭 Ordini Fornitori
- Stesso flusso degli ordini clienti
- **Prezzo acquisto editabile** (sfondo giallo) pre-compilato con ultimo prezzo acquisto
- Modalità pagamento selezionabile

### ☁️ Sincronizzazione Google Drive
- **Inventario** → `INVENMAG.xlsx`
- **Ordini Clienti** → `ordini-anagrafiche` + `ordini-testate` + `ordini-dettagli` (pipe-delimited)
- **Ordini Fornitori** → `ordfornitori-anagrafica` + `ordfornitori-testate` + `ordfornitori-dettagli`
- Storico ordini sincronizzato come JSON su Drive

### 🖨️ Stampa
- **PDF professionale** — layout unificato clienti/fornitori; logo aziendale da Drive; fincature 0.2pt; totali con IVA
- **Destinazione configurabile**: Download / Condividi (scegli cartella su Android) / Google Drive
- **Stampante termica mobile**: ESC/POS (con logo bitmap 1-bit), CPCL, ZPL; connessione TCP/Bluetooth/USB

---

## 🏗️ Architettura

```
index.html          Entry point + stato globale APP
styles.css          UI completa (CSS variables, responsive)
sw.js               Service Worker — cache-first, offline support
manifest.json       PWA manifest

js/
├── db.js           IndexedDB PicamDB v5 — tutti i CRUD
├── utils.js        Formatter, toast, beep, debounce
├── config.js       Configurazione persistente (localStorage)
├── main.js         OAuth2, caricamento Drive, navigazione, scanner, numpad
├── inventario.js   Tri-modale, lente ingrandimento, UX tabellare
├── ordini-clienti.js   Ordini clienti completi
├── ordini-fornitori.js Ordini fornitori completi
├── queue.js        Gestione coda e storico
├── sync.js         Export file Picam ERP
├── pdf.js          Generazione PDF (jsPDF)
└── print.js        Stampa termica ESC/POS / CPCL / ZPL
```

---

## 🚀 Installazione

### Requisiti
- Account Google con Google Drive attivo
- File Excel delle anagrafiche Picam nella cartella Drive configurata (generati da PicamExporter)
- Chrome su Android/iOS/Desktop

### Accesso
```
https://orlandodon61-cmyk.github.io/Picam-Mobile
```

### Installazione come app (Android)
1. Apri l'URL in Chrome
2. Menu ⋮ → **Installa app** (o "Aggiungi a schermata Home")
3. L'app si aprirà come applicazione nativa

---

## ⚙️ Configurazione

### Prima configurazione
1. Apri l'app → schermata Setup
2. **Accedi con Google** (Step 1)
3. Inserisci la **cartella Drive** dove sono i file Excel (es. `archivi/Ordini`)
4. Inserisci il **codice deposito** (es. `01`) e i **registri ordini**
5. Tocca **"Carica Dati da Drive"**

### Impostazioni (⚙️ dal menu principale)
| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| Cartella Drive | `archivi/Ordini` | Percorso relativo nella root del Drive |
| Deposito | `01` | Codice deposito magazzino |
| Registro Clienti | `01` | Registro ordini clienti (max 4 char) |
| Registro Fornitori | `01` | Registro ordini fornitori |
| Dati Mittente | — | Ragione sociale, indirizzo, P.IVA per intestazione PDF |
| Destinazione PDF | `download` | `download` \| `share` \| `drive` |

### Logo aziendale
Carica il file `logo.jpg` o `LOGO.jpg` nella cartella Drive configurata. Viene usato automaticamente nell'intestazione dei PDF e nelle stampe termiche ESC/POS.

---

## 📁 File Excel di Input

Generati da **PicamExporter** (script Python + `excelout.exe`):

| File | Contenuto | Campi chiave |
|------|-----------|-------------|
| `articoli.xlsx` | Anagrafica articoli (40.000+) | `art_cod`, `art_des_1`, `art_gru_ven`, `art_loc_mag`, `art_prz_ult_ven`, `art_prz_ult_acq` |
| `codbar.xlsx` | Codici a barre | `cba_cod_art`, `cba_cod_bar` |
| `artdep.xlsx` | Giacenze deposito | `ard_cod`, `ard_giac`, `ard_loc` |
| `clicom.xlsx` | Clienti commerciali | `clc_cod_cli`, `clc_rag_soc_1`, `clc_cod_pag` |
| `forcom.xlsx` | Fornitori | `foc_cod_for`, `foc_rag_soc_1`, `foc_cod_pag` |
| `iva.xlsx` | Aliquote IVA | `iva_cod`, `iva_ali` |
| `pagame.xlsx` | Modalità pagamento | `pag_cod`, `pag_des` |
| `grupmerc.xlsx` | Gruppi merceologici | `grm_cod_gru`, `grm_des_gru` (solo `grm_tip_gru = 'V'`) |

---

## 📤 File Export verso Picam ERP

### Ordini Clienti
| File | Campi | Formato |
|------|-------|---------|
| `ordini-anagrafiche` | 20 campi `clc_*` | Pipe-delimited `\|` |
| `ordini-testate` | 29 campi `oct_*` (inc. `oct_tot_net_mer`, `oct_iva`, `oct_tot_ord`) | Pipe-delimited `\|` |
| `ordini-dettagli` | 36 campi `ocd_*` | Pipe-delimited `\|` |

### Ordini Fornitori
Stessa struttura con file `ordfornitori-*`.

### Inventario
`INVENMAG.xlsx` con 9 campi `ima_*` (deposito, codice, quantità, data).

> Date: `DDMMYYYY` — Decimali: virgola, 6 cifre (es. `40,000000`)

---

## 🔧 Aggiornamento versione

1. Modifica i file necessari
2. Incrementa il nome cache in `sw.js`: `const CACHE_NAME = 'picam-v41'`
3. Carica su GitHub (drag & drop dell'intera cartella `js/`)
4. Il Service Worker vecchio si aggiorna automaticamente al primo accesso con rete

**Se il vecchio SW persiste su Chrome:**
```javascript
// Incolla nella Console DevTools (F12)
navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister()))
```
Poi `Ctrl+Shift+R` per ricaricare.

---

## 📚 Documentazione

| Documento | Descrizione |
|-----------|-------------|
| [`PICAM_Documentazione_Tecnica_v4.0.docx`](./PICAM_Documentazione_Tecnica_v4.0.docx) | Architettura, schema DB, mapping campi completo, bug fix storici |
| [`PICAM_Manuale_Utente_v4.0.docx`](./PICAM_Manuale_Utente_v4.0.docx) | Guida operativa passo-passo per gli utenti |

---

## 🛠️ Dipendenze esterne (CDN)

| Libreria | Versione | Uso |
|----------|---------|-----|
| [SheetJS](https://sheetjs.com) | 0.18.5 | Lettura/scrittura file .xlsx |
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 2.3.8 | Scanner barcode/QR da fotocamera |
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | Generazione PDF |
| [Google Identity Services](https://developers.google.com/identity) | latest | OAuth 2.0 per Google Drive |

---

## 📝 Changelog

### v4.0 (Aprile 2026)
- **Architettura modulare**: da 1 file `app.js` (4289 righe) a 11 moduli JS indipendenti
- **Fix critico**: `saveArticoli()` ora salva tutti gli articoli (fix troncamento a 500 con `setTimeout`)
- **Fix inventario**: campo gruppo da `art_gru_ven`, locazione da `art_loc_mag`
- **Fix UI tabellare**: doppio tap apre modal qty; `inputmode="none"` blocca tastiera Android
- **Ordini clienti**: parificati ai fornitori (prezzo editabile, totali IVA, PDF, condivisione)
- **PDF unificato**: stesso layout professionale per clienti e fornitori; logo proporzionato
- **Configurazione estesa**: dati mittente PDF, registri ordini, destinazione salvataggio
- **Stampa mobile**: ESC/POS con logo bitmap 1-bit; CPCL; ZPL; wizard guidato
- **Registri ordini**: configurabili separatamente per clienti e fornitori

### v3.6
- Fix sincronizzazione inventario, gruppi merceologici, prezzo ordini fornitori

---

## 👤 Autore

**Orlando Don** — orlando.don61@gmail.com  
Sviluppato con assistenza AI (Claude — Anthropic)

---

*PICAM Mobile è un progetto proprietario sviluppato per uso interno. Il codice è rilasciato sul repository GitHub per facilità di deploy tramite GitHub Pages.*
