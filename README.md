# 📦 PICAM PWA v3.5

**Versione:** 3.5  
**Cache:** v25  
**Data:** 30 Marzo 2026  

---

## 🚀 Funzionalità

### Inventario
- Ricerca articoli per codice, descrizione1, descrizione2 o barcode
- Scanner barcode integrato (fotocamera)
- Modalità rapida (aggiunge automaticamente con qta 1)
- Modifica quantità dalla coda
- Report PDF con codice, des1, des2, locazione, quantità
- Sincronizzazione su Google Drive (INVENMAG.xlsx)

### Ordini Clienti
- Selezione cliente da anagrafica
- Ricerca articoli su codice, des1, des2, barcode
- Prezzo ultimo vendita proposto automaticamente
- Visualizzazione giacenza articoli
- **IVA automatica** da codice IVA vendita (art_cod_iva_ven)
- Modifica righe dalla coda
- Report PDF con totali

### Ordini Fornitori
- Selezione fornitore da anagrafica
- Ricerca articoli su codice, des1, des2, barcode
- Prezzo ultimo acquisto proposto (modificabile)
- **Inserimento prezzo manuale** se non presente
- **Dropdown modalità pagamento** da anagrafica PAGAME.xlsx
- **IVA automatica** da tabella IVA.xlsx (aliquota reale)
- **Stampa ordine professionale** (layout Picam con linee sottili)
- C. PAG. e DESCRIZIONE PAGAMENTO nel PDF
- **Condivisione** via email, WhatsApp, Telegram
- Modifica righe dalla coda

---

## 🆕 Novità v3.5

1. **IVA separata Clienti/Fornitori** - art_cod_iva_ven per clienti, art_cod_iva_acq per fornitori
2. **Tabella IVA.xlsx** - Lookup aliquota reale dal codice IVA
3. **Tabella PAGAME.xlsx** - Dropdown pagamento in ordini fornitori
4. **Fix "Connesso come undefined"** - Gestione errori migliorata
5. **PDF linee sottili** - Aspetto più professionale
6. **C. PAG. nel PDF** - Codice e descrizione pagamento visibili

---

## 📂 Struttura File

Picam-Mobile/
├── index.html      # Struttura HTML (v25)
├── styles.css      # Stili CSS (v25) ⚠️ NON stili.css!
├── app.js          # Logica applicativa (v25)
├── db.js           # Database IndexedDB v2 (v25)
├── sw.js           # Service Worker (cache-v25)
├── manifest.json   # Manifest PWA
├── icon-192.png    # Icona 192x192
├── icon-512.png    # Icona 512x512
└── README.md       # Questo file

---

## 📁 File Anagrafiche Richiesti

Nella cartella Google Drive configurata:

| File | Descrizione |
|------|-------------|
| articoli.xlsx | Anagrafica articoli |
| codbar.xlsx | Codici a barre |
| artdep.xlsx | Giacenze per deposito |
| clicom.xlsx | Anagrafica clienti |
| forcom.xlsx | Anagrafica fornitori |
| iva.xlsx | Aliquote IVA (iva_cod → iva_ali) |
| pagame.xlsx | Modalità pagamento (pag_cod → pag_des) |
| logo.jpg/png | Logo per stampe (opzionale) |

---

## ⚙️ Configurazione Google Cloud

- **Progetto:** picam-mobile (780777046643)
- **Client ID:** 780777046643-ebl7m87qcoldp3c8sg9c1u5dfqjdgl42

---

© 2026 Techmatesrls - Picam PWA v3.5
