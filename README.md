# 📦 PICAM PWA v3.4

**Versione:** 3.3  
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
- **Stampa ordine professionale** (layout Picam):
  - Logo aziendale in alto a sinistra
  - Stampa CON prezzi (completa)
  - Stampa SENZA prezzi (conferma ordine)
- **Condivisione** via email, WhatsApp, Telegram
- Modifica righe dalla coda
- Report PDF con totali

---

## 🆕 Novità v3.4

1. **Ricerca su descrizione** - Cerca anche su des1 e des2
2. **Salta caricamento** - Usa dati già caricati senza ricaricare
3. **Prezzo modificabile** - Inserisci prezzo acquisto al volo
4. **PDF migliorato** - Rimossi campi inutili, colonne sistemate

### Già presenti da v3.2
- Login automatico (ricorda account)
- Impostazioni salvate (cartella Drive, deposito)
- Modifica dalla coda (tocca per modificare)
- Elimina singoli elementi
- Avviso se già sincronizzato
- Ordine professionale layout Picam
- Logo automatico da Google Drive

---

## 📂 Struttura File

```
Picam-Mobile/
├── index.html      # Struttura HTML (v24)
├── styles.css      # Stili CSS (v24)
├── app.js          # Logica applicativa (v24)
├── db.js           # Database IndexedDB (v24)
├── sw.js           # Service Worker (cache-v24)
├── manifest.json   # Manifest PWA
├── icon-192.png    # Icona 192x192
├── icon-512.png    # Icona 512x512
└── README.md       # Questo file
```

---

## ⚙️ Configurazione

### Google Cloud Console
- **Progetto:** picam-mobile (780777046643)
- **Account:** orlando.don61@gmail.com
- **Client ID:** 780777046643-ebl7m87qcoldp3c8sg9c1u5dfqjdgl42.apps.googleusercontent.com

### URI Autorizzati
- **Origine JS:** https://orlandodon61-cmyk.github.io
- **Redirect:** https://orlandodon61-cmyk.github.io/Picam-Mobile/

---

## 🖼️ Logo Ordini

Per inserire il logo negli ordini fornitori:

1. Prepara un file **logo.jpg** o **logo.png** (max 400x300 pixel)
2. Caricalo su Google Drive in una di queste posizioni:
   - Nella cartella configurata (es: `archivi/Ordini`)
   - Nella root di Google Drive
3. L'app lo troverà automaticamente

---

## 📱 Installazione PWA

### Android (Chrome)
1. Apri https://orlandodon61-cmyk.github.io/Picam-Mobile
2. Tocca menu ⋮ → "Installa" o "Aggiungi a schermata Home"

### iOS (Safari)
1. Apri https://orlandodon61-cmyk.github.io/Picam-Mobile
2. Tocca Condividi → "Aggiungi a Home"

---

## 📤 File Output

### Inventario
- **INVENMAG.xlsx** - 9 campi ima_*

### Ordini Clienti/Fornitori
- **ordini-anagrafiche** - 20 campi clc_*
- **ordini-testate** - 29 campi oct_*
- **ordini-dettagli** - 36 campi ocd_*

**Formato:** pipe-delimited, stringhe tra virgolette, date ggmmaaaa, decimali virgola 6 cifre

---

## 🔄 Aggiornamento Cache

Se l'app non si aggiorna:
1. Chiudi tutte le schede/finestre dell'app
2. Riapri l'app
3. Se persiste: Impostazioni browser → Cancella dati sito

---

## 📞 Supporto

Repository: https://github.com/orlandodon61-cmyk/Picam-Mobile

---

© 2026 Techmatesrls - Picam PWA v3.4
