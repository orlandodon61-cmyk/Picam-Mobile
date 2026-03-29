# 📦 PICAM PWA v3.4

**Versione:** 3.4  
**Cache:** v24  
**Data:** 29 Marzo 2026  

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
- Modifica righe dalla coda
- Report PDF con totali

### Ordini Fornitori
- Selezione fornitore da anagrafica
- Ricerca articoli su codice, des1, des2, barcode
- Prezzo ultimo acquisto proposto (modificabile)
- **Inserimento prezzo manuale** se non presente
- IVA automatica da anagrafica articoli
- **Stampa ordine professionale** (layout Picam)
- **Condivisione** via email, WhatsApp, Telegram
- Modifica righe dalla coda
- Report PDF con totali

---

## 🆕 Novità v3.4

1. **Ricerca su descrizione** - Cerca anche su des1 e des2
2. **Salta caricamento** - Usa dati già caricati senza ricaricare
3. **Prezzo modificabile** - Inserisci prezzo acquisto al volo
4. **PDF migliorato** - Rimossi campi inutili, colonne sistemate

---

## 📂 Struttura File

```
Picam-Mobile/
├── index.html      # Struttura HTML (v24)
├── styles.css      # Stili CSS (v24) ⚠️ NON stili.css!
├── app.js          # Logica applicativa (v24)
├── db.js           # Database IndexedDB (v24)
├── sw.js           # Service Worker (cache-v24)
├── manifest.json   # Manifest PWA
├── icon-192.png    # Icona 192x192
├── icon-512.png    # Icona 512x512
└── README.md       # Questo file
```

---

## ⚙️ Configurazione Google Cloud

- **Progetto:** picam-mobile (780777046643)
- **Client ID:** 780777046643-ebl7m87qcoldp3c8sg9c1u5dfqjdgl42

---

© 2026 Techmatesrls - Picam PWA v3.4
