// ==========================================
// PICAM v4.02 - print.js
// Stampa mobile ESC/POS professionale
// Logo.txt per intestazione termica
// Wizard con test Bluetooth esteso
// ==========================================

APP.printerConfig  = null;
APP.logoTxtLines   = null;   // cache righe Logo.txt
APP.logoBitmapCache = null;
APP.PRINTER_CONFIG_KEY = 'picam_printer_config';

// ══════════════════════════════════════════════════════
//  ENCODING CP437 — obbligatorio per ESC/POS Page0
//  Il simbolo € NON esiste in Page0 → sempre "Eur"
// ══════════════════════════════════════════════════════
APP._cp437Map = (function() {
    const tbl = [
        0x00C7,0x00FC,0x00E9,0x00E2,0x00E4,0x00E0,0x00E5,0x00E7,
        0x00EA,0x00EB,0x00E8,0x00EF,0x00EE,0x00EC,0x00C4,0x00C5,
        0x00C9,0x00E6,0x00C6,0x00F4,0x00F6,0x00F2,0x00FB,0x00F9,
        0x00FF,0x00D6,0x00DC,0x00A2,0x00A3,0x00A5,0x20A7,0x0192,
        0x00E1,0x00ED,0x00F3,0x00FA,0x00F1,0x00D1,0x00AA,0x00BA,
        0x00BF,0x2310,0x00AC,0x00BD,0x00BC,0x00A1,0x00AB,0x00BB,
        0x2591,0x2592,0x2593,0x2502,0x2524,0x2561,0x2562,0x2556,
        0x2555,0x2563,0x2551,0x2557,0x255D,0x255C,0x255B,0x2510,
        0x2514,0x2534,0x252C,0x251C,0x2500,0x253C,0x255E,0x255F,
        0x255A,0x2554,0x2569,0x2566,0x2560,0x2550,0x256C,0x2567,
        0x2568,0x2564,0x2565,0x2559,0x2558,0x2552,0x2553,0x256B,
        0x256A,0x2518,0x250C,0x2588,0x2584,0x258C,0x2590,0x2580,
        0x03B1,0x00DF,0x0393,0x03C0,0x03A3,0x03C3,0x00B5,0x03C4,
        0x03A6,0x0398,0x03A9,0x03B4,0x221E,0x03C6,0x03B5,0x2229,
        0x2261,0x00B1,0x2265,0x2264,0x2320,0x2321,0x00F7,0x2248,
        0x00B0,0x2219,0x00B7,0x221A,0x207F,0x00B2,0x25A0,0x00A0
    ];
    const map = new Map();
    for (let i = 0; i < tbl.length; i++) map.set(tbl[i], i + 128);
    return map;
})();

APP.encCP437 = function(s) {
    s = String(s || '')
        .replace(/[€\u20AC]/g, 'Eur')
        .replace(/[àáâãä]/g, 'a').replace(/[ÀÁÂÃÄ]/g, 'A')
        .replace(/[èéêë]/g,  'e').replace(/[ÈÉÊË]/g,  'E')
        .replace(/[ìíîï]/g,  'i').replace(/[ÌÍÎÏ]/g,  'I')
        .replace(/[òóôõö]/g, 'o').replace(/[ÒÓÔÕÖ]/g, 'O')
        .replace(/[ùúûü]/g,  'u').replace(/[ÙÚÛÜ]/g,  'U')
        .replace(/[ñ]/g,     'n').replace(/[Ñ]/g,     'N')
        .replace(/[ç]/g,     'c').replace(/[Ç]/g,     'C')
        .replace(/[''""`]/g, "'");
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code < 128) bytes.push(code);
        else if (APP._cp437Map.has(code)) bytes.push(APP._cp437Map.get(code));
        else bytes.push(0x3F); // '?'
    }
    return bytes;
};

// ══════════════════════════════════════════════════════
//  LOGO.TXT — intestazione di testo per stampante termica
//  File di testo su Drive nella stessa cartella di logo.jpg
//  Ogni riga viene centrata sul conto
//  Formato esempio:
//    TECHMATE SRLS
//    Sistemi informatici e Gestionali
//    Via Cardito 202 - 83031 Ariano Irpino (AV)
//    P.IVA: 03153880640  N.REA: AV-302779
//    Tel: 333 6439999
// ══════════════════════════════════════════════════════
APP.loadLogoTxt = async function() {
    if (APP.logoTxtLines) return APP.logoTxtLines;
    try {
        // Assicura token valido prima di interrogare Drive
        if (APP.ensureValidToken) await APP.ensureValidToken().catch(() => {});
        if (!APP.accessToken) {
            console.warn('Logo.txt: nessun token disponibile');
            return null;
        }
        const folderId = await APP.findFolder(APP.config.folder);
        const q = folderId
            ? `(name='logo.txt' or name='Logo.txt' or name='LOGO.TXT') and '${folderId}' in parents and trashed=false`
            : `(name='logo.txt' or name='Logo.txt' or name='LOGO.TXT') and trashed=false`;
        const resp = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
            { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
        );
        const data = await resp.json();
        if (!data.files?.length) return null;
        const fileResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${data.files[0].id}?alt=media`,
            { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
        );
        const text = await fileResp.text();
        APP.logoTxtLines = text.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);
        return APP.logoTxtLines;
    } catch(e) {
        console.warn('Logo.txt non trovato:', e.message);
        return null;
    }
};

// ══════════════════════════════════════════════════════
//  BUILDER ESC/POS
// ══════════════════════════════════════════════════════
APP.ESC = 0x1B; APP.GS = 0x1D; APP.LF = 0x0A;

APP.buildEscPos = function(commands) {
    const bytes = [];
    const push  = (...bs) => bs.forEach(b => bytes.push(b));
    const str   = s => APP.encCP437(s);

    commands.forEach(cmd => {
        switch(cmd.type) {
            case 'init':
                push(APP.ESC, 0x40); break;
            case 'align':
                push(APP.ESC, 0x61, cmd.v==='center' ? 1 : cmd.v==='right' ? 2 : 0); break;
            case 'bold':
                push(APP.ESC, 0x45, cmd.v ? 1 : 0); break;
            case 'dbl':   // doppia altezza
                push(APP.GS,  0x21, cmd.v ? 0x01 : 0x00); break;
            case 'size':
                push(APP.GS,  0x21, cmd.v || 0); break;
            case 'text':
                push(...str(cmd.v || ''), APP.LF); break;
            case 'raw_text':  // testo senza LF finale
                push(...str(cmd.v || '')); break;
            case 'feed':
                for(let i=0; i<(cmd.lines||1); i++) push(APP.LF); break;
            case 'cut':
                push(APP.GS, 0x56, 0x41, 0x00); break;
            case 'raw':
                if (cmd.v instanceof Uint8Array) cmd.v.forEach(b => bytes.push(b)); break;
        }
    });
    return new Uint8Array(bytes);
};

// Funzioni di formattazione layout
APP.prt = {
    // Riga con testo a sx e testo a dx sulla stessa riga
    sxDx: (sx, dx, w) => {
        sx = String(sx || ''); dx = String(dx || '');
        const spazio = Math.max(1, w - sx.length - dx.length);
        return sx + ' '.repeat(spazio) + dx;
    },
    // Centra una stringa nella larghezza w
    center: (s, w) => {
        s = String(s || '');
        if (s.length >= w) return s.substring(0, w);
        const pad = Math.floor((w - s.length) / 2);
        return ' '.repeat(pad) + s;
    },
    // Tronca a max n caratteri con ellipsis se necessario
    trunc: (s, n) => {
        s = String(s || '');
        return s.length > n ? s.substring(0, n-1) + '.' : s;
    },
    // Formatta importo fisso su N chars, allineato a dx
    money: (n, total) => {
        const s = Number(n || 0).toFixed(2).replace('.', ',');
        return s.length > total ? s : ' '.repeat(total - s.length) + s;
    }
};

// ══════════════════════════════════════════════════════
//  STAMPA ORDINE — layout professionale ESC/POS
// ══════════════════════════════════════════════════════
APP.printMobileOrdine = async function() {
    APP.loadPrinterConfig();
    if (!APP.printerConfig) {
        APP.showToast('Nessuna stampante configurata', 'error');
        setTimeout(() => APP.openPrintWizard(), 400);
        return;
    }
    const ordine = APP.selectedQueueItem;
    if (!ordine) { APP.showToast('Nessun ordine selezionato', 'error'); return; }

    // Carica Logo.txt (preferito per termica) e logo bitmap (fallback)
    const logoLoaded = await APP.loadLogoTxt().catch(() => null);
    console.log('Logo.txt:', logoLoaded
        ? `caricato (${logoLoaded.length} righe: ${logoLoaded[0]})`
        : 'non trovato — controlla che Logo.txt sia nella cartella Drive configurata');
    if (!APP.logoBase64 && APP.accessToken && !APP.logoTxtLines) {
        await APP.loadLogo().catch(() => null);
    }

    APP.showToast('Preparazione stampa...', 'info');
    const data = await APP.buildOrdineMobile(ordine, APP.printerConfig);
    await APP.sendToPrinter(data, APP.printerConfig);
};

APP.buildOrdineMobile = async function(ordine, config) {
    const type      = config.type  || 'escpos';
    const w         = config.width || 48;
    const isCliente = ordine.tipo === 'cliente';
    const soggetto  = isCliente ? ordine.cliente : ordine.fornitore;
    const dataOrd   = APP.formatDate(new Date(ordine.data));
    const SEP_BOLD  = '='.repeat(w);
    const SEP_THIN  = '-'.repeat(w);
    const P         = APP.prt;

    if (type !== 'escpos') return APP._buildOrdineFallback(ordine, config, type);

    const cmds = [{ type: 'init' }];

    // ── SEZIONE 1: INTESTAZIONE (Logo.txt o fallback da config) ──────────
    cmds.push({ type: 'align', v: 'center' });

    const logoLines = APP.logoTxtLines;
    if (logoLines && logoLines.length > 0) {
        // Prima riga in grassetto + doppia altezza (nome azienda)
        cmds.push({ type: 'bold', v: true }, { type: 'dbl', v: true });
        cmds.push({ type: 'text', v: P.trunc(logoLines[0], w) });
        cmds.push({ type: 'dbl', v: false }, { type: 'bold', v: false });
        // Righe successive normali
        for (let i = 1; i < logoLines.length; i++) {
            cmds.push({ type: 'text', v: P.trunc(logoLines[i], w) });
        }
    } else {
        // Nessun Logo.txt: usa dati mittente dalla config
        const rag = APP.config.mitRagSoc || '';
        if (rag) {
            cmds.push({ type: 'bold', v: true }, { type: 'dbl', v: true });
            cmds.push({ type: 'text', v: P.trunc(rag, w) });
            cmds.push({ type: 'dbl', v: false }, { type: 'bold', v: false });
            const ind = [APP.config.mitInd, `${APP.config.mitCap||''} ${APP.config.mitLoc||''}`]
                .filter(Boolean).join(' - ');
            if (ind.trim()) cmds.push({ type: 'text', v: P.trunc(ind, w) });
            if (APP.config.mitPiva) cmds.push({ type: 'text', v: `P.IVA: ${APP.config.mitPiva}` });
            if (APP.config.mitTel)  cmds.push({ type: 'text', v: `Tel: ${APP.config.mitTel}` });
        }
    }

    cmds.push({ type: 'text', v: SEP_BOLD });

    // ── SEZIONE 2: TIPO DOCUMENTO ──────────────────────────────────────────
    cmds.push({ type: 'align', v: 'center' });
    cmds.push({ type: 'bold', v: true });
    const tipoLabel = isCliente ? '*** ORDINE CLIENTE ***' : '** ORDINE FORNITORE **';
    cmds.push({ type: 'text', v: tipoLabel });
    cmds.push({ type: 'bold', v: false });

    const numOrd = ordine.registro
        ? `N. ${ordine.registro}/${ordine.numero}`
        : `N. ${ordine.numero}`;
    cmds.push({ type: 'text', v: P.sxDx(numOrd, `del ${dataOrd}`, w) });
    cmds.push({ type: 'align', v: 'left' });
    cmds.push({ type: 'text', v: SEP_THIN });

    // ── SEZIONE 3: DATI CLIENTE/FORNITORE ──────────────────────────────────
    const tipoSogg = isCliente ? 'CLIENTE' : 'FORNITORE';
    cmds.push({ type: 'text', v: `${tipoSogg}: ${P.trunc(soggetto.ragSoc1 || '', w - tipoSogg.length - 2)}` });
    if (soggetto.ragSoc2) cmds.push({ type: 'text', v: `         ${P.trunc(soggetto.ragSoc2, w-9)}` });

    const indirizzo = [soggetto.indirizzo, soggetto.localita, soggetto.provincia
        ? `(${soggetto.provincia})` : ''].filter(Boolean).join(' ');
    if (indirizzo.trim()) cmds.push({ type: 'text', v: `Ind: ${P.trunc(indirizzo, w-5)}` });
    if (soggetto.partitaIva) cmds.push({ type: 'text', v: `P.IVA: ${soggetto.partitaIva}` });

    // Pagamento
    const desPag = ordine.pagamento?.descrizione || soggetto.desPag || '';
    if (desPag) cmds.push({ type: 'text', v: `Pag: ${P.trunc(desPag, w-5)}` });

    cmds.push({ type: 'text', v: SEP_BOLD });

    // ── SEZIONE 4: INTESTAZIONE COLONNE ARTICOLI ──────────────────────────
    // Layout 48 char:  CODICE(13) DESCR(25) QTA(10)
    // Layout 32 char:  CODICE(8)  DESCR(16) QTA(8)
    // Layout 64 char:  CODICE(15) DESCR(33) QTA(16)
    const colW = w === 32 ? [8, 15, 9] : w === 64 ? [15, 33, 16] : [13, 25, 10];
    const hdrCod  = 'CODICE'.padEnd(colW[0]);
    const hdrDesc = 'DESCRIZIONE'.padEnd(colW[1]);
    const hdrQta  = 'QTA'.padStart(colW[2]);
    cmds.push({ type: 'bold', v: true });
    cmds.push({ type: 'text', v: hdrCod + hdrDesc + hdrQta });
    cmds.push({ type: 'bold', v: false });
    cmds.push({ type: 'text', v: SEP_THIN });

    // ── SEZIONE 5: RIGHE ARTICOLI ──────────────────────────────────────────
    let totaleMerce = 0;
    ordine.righe.forEach((riga, idx) => {
        const codice = P.trunc(riga.codice  || '', colW[0]);
        const desc1  = P.trunc(riga.des1    || '', colW[1]);
        const qty    = riga.qty || 0;
        const um     = riga.um || 'Nr.';
        const prezzo = riga.prezzo || 0;
        const totRiga = qty * prezzo;
        totaleMerce  += totRiga;

        // Riga 1: codice + descrizione + quantità/UM
        const qtaStr = `${qty} ${um}`.padStart(colW[2]);
        cmds.push({ type: 'text', v: codice + desc1 + qtaStr });

        // Riga 2 (se descrizione lunga): resto della descrizione
        if (riga.des1 && riga.des1.length > colW[1]) {
            const desc2 = P.trunc(riga.des1.substring(colW[1]), colW[0]+colW[1]);
            cmds.push({ type: 'text', v: ' '.repeat(colW[0]) + desc2 });
        }
        if (riga.des2 && riga.des2.trim()) {
            cmds.push({ type: 'text', v: ' '.repeat(colW[0]) + P.trunc(riga.des2, colW[1]) });
        }

        // Riga prezzi: Eur x prezzo = totale riga
        const prStr = `  Eur ${prezzo.toFixed(4).replace('.',',')} x ${qty} ${um}`;
        const totStr = `Eur ${totRiga.toFixed(2).replace('.',',')}`;
        cmds.push({ type: 'text', v: P.sxDx(prStr, totStr, w) });

        // Separatore sottile tra righe (non dopo l'ultima)
        if (idx < ordine.righe.length - 1) {
            cmds.push({ type: 'text', v: ' '.repeat(colW[0]) + SEP_THIN.substring(0, colW[1]+colW[2]) });
        }
    });

    cmds.push({ type: 'text', v: SEP_BOLD });

    // ── SEZIONE 6: TOTALI ──────────────────────────────────────────────────
    cmds.push({ type: 'align', v: 'right' });
    const totIva    = ordine.totIva    || 0;
    const totOrdine = ordine.totOrdine || (totaleMerce + totIva);

    // Imponibile
    cmds.push({ type: 'text', v: P.sxDx('Imponibile:', `Eur ${P.money(totaleMerce, 9)}`, w) });
    // IVA (mostra solo se > 0)
    if (totIva > 0) {
        cmds.push({ type: 'text', v: P.sxDx('IVA:', `Eur ${P.money(totIva, 9)}`, w) });
    }
    cmds.push({ type: 'text', v: SEP_THIN });
    // Totale in grassetto + doppia altezza
    cmds.push({ type: 'bold', v: true });
    cmds.push({ type: 'text', v: P.sxDx('TOTALE:', `Eur ${P.money(totOrdine, 9)}`, w) });
    cmds.push({ type: 'bold', v: false });
    cmds.push({ type: 'align', v: 'left' });
    cmds.push({ type: 'text', v: SEP_BOLD });

    // ── SEZIONE 7: PIEDE ──────────────────────────────────────────────────
    cmds.push({ type: 'align', v: 'center' });
    cmds.push({ type: 'text', v: '' });
    cmds.push({ type: 'text', v: P.center(`Righe: ${ordine.righe.length}`, w) });
    cmds.push({ type: 'text', v: P.center(`Ordine del ${dataOrd}`, w) });
    cmds.push({ type: 'text', v: '' });

    // Firma (spazio vuoto)
    cmds.push({ type: 'align', v: 'left' });
    cmds.push({ type: 'text', v: 'Firma: ________________________' });
    cmds.push({ type: 'feed', lines: 4 });
    cmds.push({ type: 'cut' });

    return APP.buildEscPos(cmds);
};

// Fallback per CPCL e ZPL (invariato)
APP._buildOrdineFallback = function(ordine, config, type) {
    const w         = config.width || 48;
    const isCliente = ordine.tipo === 'cliente';
    const soggetto  = isCliente ? ordine.cliente : ordine.fornitore;
    const dataOrd   = APP.formatDate(new Date(ordine.data));
    const tot = ordine.totOrdine || ordine.righe.reduce((s,r)=>s+r.qty*r.prezzo, 0);

    if (type === 'zpl') {
        const lines = [`^XA`];
        let y = 30;
        lines.push(`^FO50,${y}^A0N,35,35^FD${isCliente ? 'ORDINE CLIENTE' : 'ORDINE FORNITORE'}^FS`); y+=45;
        lines.push(`^FO50,${y}^A0N,25,25^FDN.${ordine.numero} del ${dataOrd}^FS`); y+=35;
        lines.push(`^FO50,${y}^GB550,2,2^FS`); y+=10;
        lines.push(`^FO50,${y}^A0N,22,22^FD${(soggetto.ragSoc1||'').substring(0,40)}^FS`); y+=30;
        lines.push(`^FO50,${y}^GB550,2,2^FS`); y+=10;
        ordine.righe.forEach(r => {
            lines.push(`^FO50,${y}^A0N,20,20^FB500,2,,^FD${(r.des1||'').substring(0,40)}^FS`); y+=25;
            lines.push(`^FO50,${y}^A0N,18,18^FDQta:${r.qty}${r.um}  Eur${(r.qty*r.prezzo).toFixed(2)}^FS`); y+=25;
        });
        lines.push(`^FO50,${y}^GB550,2,2^FS`); y+=10;
        lines.push(`^FO50,${y}^A0N,28,28^FDTOTALE: Eur ${tot.toFixed(2)}^FS`);
        lines.push(`^XZ`);
        return APP.buildZPL(lines);
    }

    // CPCL
    const h = 120 + ordine.righe.length * 55 + 80;
    const lines = [`! 0 200 200 ${h} 1`];
    lines.push(`CENTER`);
    lines.push(`T 4 0 0 0 ${isCliente ? 'ORDINE CLIENTE' : 'ORDINE FORNITORE'}`);
    lines.push(`T 3 0 0 35 N.${ordine.numero} del ${dataOrd}`);
    lines.push(`LEFT`);
    lines.push(`LINE 0 60 550 60 2`);
    lines.push(`T 3 0 0 70 ${(soggetto.ragSoc1||'').substring(0,40)}`);
    lines.push(`LINE 0 95 550 95 1`);
    let cy = 105;
    ordine.righe.forEach(r => {
        lines.push(`T 3 0 0 ${cy} ${(r.des1||'').substring(0,35)}`); cy+=25;
        lines.push(`T 2 0 0 ${cy} Qta:${r.qty}${r.um}  Eur${(r.qty*r.prezzo).toFixed(2)}`); cy+=25;
    });
    lines.push(`LINE 0 ${cy} 550 ${cy} 2`); cy+=10;
    lines.push(`CENTER`);
    lines.push(`T 4 0 0 ${cy} TOTALE: Eur ${tot.toFixed(2)}`);
    lines.push(`FORM`, `PRINT`);
    return APP.buildCPCL(lines);
};

APP.buildCPCL = lines => new TextEncoder().encode(lines.join('\n') + '\n');
APP.buildZPL  = lines => new TextEncoder().encode(lines.join('\n') + '\n');

// ══════════════════════════════════════════════════════
//  LOGO BITMAP ESC/POS (per chi non ha Logo.txt)
// ══════════════════════════════════════════════════════
APP.imageToEscPosBitmap = async function(imgSrc, targetWidth = 200) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const ratio  = img.height / img.width;
                const w      = Math.min(targetWidth, img.width);
                const h      = Math.round(w * ratio);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                const pixels    = ctx.getImageData(0, 0, w, h).data;
                const widthBytes = Math.ceil(w / 8);
                const raster = [];
                for (let row = 0; row < h; row++) {
                    for (let b = 0; b < widthBytes; b++) {
                        let byte = 0;
                        for (let bit = 0; bit < 8; bit++) {
                            const col = b * 8 + bit;
                            if (col < w) {
                                const i = (row * w + col) * 4;
                                const lum = pixels[i]*0.299 + pixels[i+1]*0.587 + pixels[i+2]*0.114;
                                if (lum < 128) byte |= (0x80 >> bit);
                            }
                        }
                        raster.push(byte);
                    }
                }
                const cmd = [0x1D,0x76,0x30,0x00,
                    widthBytes & 0xFF, (widthBytes>>8) & 0xFF,
                    h & 0xFF, (h>>8) & 0xFF,
                    ...raster];
                resolve(new Uint8Array(cmd));
            } catch(e) { reject(e); }
        };
        img.onerror = () => reject(new Error('Immagine non caricabile'));
        img.src = imgSrc;
    });
};

APP.getLogoEscPos = async function(config) {
    if (APP.logoBitmapCache) return APP.logoBitmapCache;
    if (!APP.logoBase64) return null;
    try {
        const tw = config.width === 32 ? 160 : config.width === 48 ? 200 : 240;
        APP.logoBitmapCache = await APP.imageToEscPosBitmap(APP.logoBase64, tw);
        return APP.logoBitmapCache;
    } catch(e) { return null; }
};

// ══════════════════════════════════════════════════════
//  CONFIGURAZIONE STAMPANTE
// ══════════════════════════════════════════════════════
APP.loadPrinterConfig = function() {
    try {
        const s = localStorage.getItem(APP.PRINTER_CONFIG_KEY);
        APP.printerConfig = s ? JSON.parse(s) : null;
    } catch(e) { APP.printerConfig = null; }
};

APP.savePrinterConfig = function(config) {
    APP.printerConfig = config;
    localStorage.setItem(APP.PRINTER_CONFIG_KEY, JSON.stringify(config));
};

APP.openPrintWizard = function() {
    APP.loadPrinterConfig();
    const modal = document.getElementById('modal-print-wizard');
    if (!modal) { APP.showToast('Modal stampante non trovata', 'error'); return; }

    if (APP.printerConfig) {
        const set = (id, v) => { const el = document.getElementById(id); if(el) el.value = v ?? ''; };
        set('printer-type',    APP.printerConfig.type    || 'escpos');
        set('printer-conn',    APP.printerConfig.conn    || 'bluetooth');
        set('printer-ip',      APP.printerConfig.ip      || '192.168.1.100');
        set('printer-port',    APP.printerConfig.port    || '9100');
        set('printer-bt-name', APP.printerConfig.btName  || 'Printer001');
        set('printer-width',   APP.printerConfig.width   || '48');
        set('printer-charset', APP.printerConfig.charset || 'CP437');
    }
    APP.updatePrintWizardUI();
    APP._updateBtStatus();
    modal.classList.remove('hidden');
};

APP.closePrintWizard = function() {
    document.getElementById('modal-print-wizard')?.classList.add('hidden');
};

APP.updatePrintWizardUI = function() {
    const conn = document.getElementById('printer-conn')?.value || 'bluetooth';
    const netF = document.getElementById('printer-network-fields');
    const btF  = document.getElementById('printer-bluetooth-fields');
    if (netF) netF.style.display = conn === 'network' ? 'block' : 'none';
    if (btF)  btF.style.display  = conn === 'bluetooth' ? 'block' : 'none';
};

APP._updateBtStatus = function() {
    const el = document.getElementById('printer-bt-status');
    if (!el) return;
    if (!navigator.bluetooth) {
        el.textContent = '⚠ Web Bluetooth non supportato su questo browser. Usa Chrome su Android.';
        el.className   = 'printer-bt-status-error';
    } else {
        el.textContent = '✓ Web Bluetooth disponibile. La stampante deve essere abbinata nel Bluetooth Android prima di usarla.';
        el.className   = 'printer-bt-status-ok';
    }
};

APP.savePrintSettings = function() {
    const v = id => (document.getElementById(id)?.value || '').trim();
    const config = {
        type:    v('printer-type')    || 'escpos',
        conn:    v('printer-conn')    || 'bluetooth',
        ip:      v('printer-ip')      || '',
        port:    parseInt(v('printer-port')) || 9100,
        btName:  v('printer-bt-name') || 'Printer001',
        width:   parseInt(v('printer-width'))  || 48,
        charset: v('printer-charset') || 'CP437'
    };
    APP.savePrinterConfig(config);
    // Azzera cache logo bitmap se si cambia larghezza
    APP.logoBitmapCache = null;
    APP.logoTxtLines    = null;  // ricarica Logo.txt al prossimo uso
    APP.showToast('Configurazione stampante salvata', 'success');
    APP.closePrintWizard();
};

// ══════════════════════════════════════════════════════
//  TEST STAMPA ESTESO
// ══════════════════════════════════════════════════════
APP.testPrint = async function() {
    APP.loadPrinterConfig();
    const config = APP.printerConfig;
    if (!config) { APP.showToast('Configura prima la stampante', 'error'); return; }

    // Carica Logo.txt per usarlo nel test
    if (!APP.logoTxtLines && APP.accessToken) {
        await APP.loadLogoTxt().catch(() => null);
    }

    const data = await APP.buildTestPage(config);
    await APP.sendToPrinter(data, config);
};

APP.buildTestPage = async function(config) {
    const type = config.type || 'escpos';
    const w    = config.width || 48;
    const SEP  = '='.repeat(w);
    const THIN = '-'.repeat(w);
    const P    = APP.prt;

    if (type !== 'escpos') {
        // Test semplice per CPCL/ZPL
        return APP.buildEscPos([
            {type:'init'},
            {type:'align',v:'center'},
            {type:'bold',v:true},{type:'text',v:'PICAM MOBILE v4.02'},{type:'bold',v:false},
            {type:'text',v:`Test ${new Date().toLocaleString('it-IT')}`},
            {type:'text',v:SEP},
            {type:'text',v:`Tipo: ${type.toUpperCase()}  Larghezza: ${w}`},
            {type:'feed',lines:3},{type:'cut'}
        ]);
    }

    const cmds = [{type:'init'}];

    // Intestazione dal Logo.txt se disponibile
    cmds.push({type:'align',v:'center'});
    const logoLines = APP.logoTxtLines;
    if (logoLines?.length) {
        cmds.push({type:'bold',v:true},{type:'dbl',v:true});
        cmds.push({type:'text',v:P.trunc(logoLines[0], w)});
        cmds.push({type:'dbl',v:false},{type:'bold',v:false});
        for (let i=1; i<logoLines.length; i++)
            cmds.push({type:'text',v:P.trunc(logoLines[i], w)});
    } else {
        cmds.push({type:'bold',v:true});
        cmds.push({type:'text',v:'*** PICAM MOBILE v4.02 ***'});
        cmds.push({type:'bold',v:false});
    }

    cmds.push({type:'text',v:SEP});
    cmds.push({type:'bold',v:true},{type:'text',v:'** PAGINA DI TEST **'},{type:'bold',v:false});
    cmds.push({type:'text',v:new Date().toLocaleString('it-IT')});
    cmds.push({type:'text',v:THIN});

    // Info configurazione
    cmds.push({type:'align',v:'left'});
    cmds.push({type:'text',v:P.sxDx('Tipo:',     config.type?.toUpperCase() || 'ESC/POS', w)});
    cmds.push({type:'text',v:P.sxDx('Connessione:', config.conn || '-', w)});
    cmds.push({type:'text',v:P.sxDx('Larghezza:', `${w} char`, w)});
    cmds.push({type:'text',v:P.sxDx('Charset:',  config.charset || 'CP437', w)});
    if (config.conn === 'bluetooth')
        cmds.push({type:'text',v:P.sxDx('BT Nome:', config.btName || '-', w)});
    if (config.conn === 'network')
        cmds.push({type:'text',v:P.sxDx('IP:Port:', `${config.ip}:${config.port}`, w)});

    cmds.push({type:'text',v:THIN});

    // Test caratteri italiani
    cmds.push({type:'text',v:'Caratteri: a e i o u A E I O U'});
    cmds.push({type:'text',v:'Speciali: . , - / ( ) % * # @'});

    // Test layout colonne
    cmds.push({type:'text',v:THIN});
    cmds.push({type:'bold',v:true},{type:'text',v:'Test layout ordine:'},{type:'bold',v:false});
    cmds.push({type:'text',v:P.sxDx('CODICE-ART-001', 'x 10 Nr.', w)});
    cmds.push({type:'text',v:'Descrizione articolo di esempio'});
    cmds.push({type:'text',v:P.sxDx('  Eur 12,5000 x 10', 'Eur   125,00', w)});
    cmds.push({type:'text',v:THIN});
    cmds.push({type:'align',v:'right'});
    cmds.push({type:'bold',v:true});
    cmds.push({type:'text',v:P.sxDx('TOTALE:', 'Eur   125,00', w)});
    cmds.push({type:'bold',v:false});
    cmds.push({type:'align',v:'left'});
    cmds.push({type:'text',v:SEP});
    cmds.push({type:'align',v:'center'});
    cmds.push({type:'text',v:'** Stampa OK **'});
    cmds.push({type:'feed',lines:4},{type:'cut'});

    return APP.buildEscPos(cmds);
};

// ══════════════════════════════════════════════════════
//  INVIO ALLA STAMPANTE
// ══════════════════════════════════════════════════════
APP.sendToPrinter = async function(data, config) {
    if (!config) { APP.showToast('Nessuna stampante configurata', 'error'); return; }
    try {
        if      (config.conn === 'network')   await APP.sendViaNetwork(data, config);
        else if (config.conn === 'bluetooth') await APP.sendViaBluetooth(data, config);
        else if (config.conn === 'usb')       await APP.sendViaUSB(data, config);
        else APP.showToast('Metodo connessione non riconosciuto', 'error');
    } catch(e) {
        APP.showToast('Errore stampa: ' + e.message, 'error');
        console.error('Errore stampa:', e);
    }
};

APP.sendViaNetwork = async function(data, config) {
    const bridgeUrl = `http://${config.ip}:${config.port || 8080}/print`;
    try {
        const response = await fetch(bridgeUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' },
            body: data, signal: AbortSignal.timeout(5000)
        });
        if (response.ok) { APP.showToast('Stampato via rete', 'success'); return; }
    } catch(e) { /* fallback download */ }
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `picam_print_${Date.now()}.bin`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    APP.showToast('File scaricato (invia alla stampante)', 'info');
};

// Stampa via Bluetooth — SPP (Serial Port Profile)
// Stampante Mach Power BP-DTPP-022: nome "Printer001", PIN 0000
// UUID SPP standard: 00001101-0000-1000-8000-00805f9b34fb
//
// CONNESSIONE AUTOMATICA: dopo la prima selezione manuale, Chrome
// ricorda la stampante. Le stampe successive usano getDevices()
// per riconnettersi senza mostrare il picker.
// Il device autorizzato è salvato in APP._btDevice.

APP._btDevice = null;   // cache device Bluetooth autorizzato

APP.sendViaBluetooth = async function(data, config) {
    if (!navigator.bluetooth) {
        throw new Error(
            'Web Bluetooth non supportato.\n' +
            'Usa Chrome su Android e verifica che il Bluetooth sia attivo.'
        );
    }

    const SPP_SERVICE        = '00001101-0000-1000-8000-00805f9b34fb';
    const ALT_SERVICE        = '000018f0-0000-1000-8000-00805f9b34fb';
    const SPP_CHARACTERISTIC = '00002af1-0000-1000-8000-00805f9b34fb';
    const CHUNK_SIZE  = 200;
    const CHUNK_DELAY =  80;
    const btName = (config.btName || 'Printer001').trim();

    let server = null;

    try {
        // ── PASSO 1: Trova il device ──────────────────────────────────────
        // Prova nell'ordine:
        // A) Device già in cache da questa sessione
        // B) getDevices() → dispositivi già autorizzati da Chrome (nessun picker)
        // C) requestDevice() → picker manuale (solo alla prima volta o se B fallisce)

        let device = null;

        // A) Cache sessione
        if (APP._btDevice) {
            device = APP._btDevice;
            console.log('BT: uso device in cache:', device.name);
        }

        // B) Dispositivi già autorizzati (nessun picker, funziona dal 2° uso in poi)
        if (!device && navigator.bluetooth.getDevices) {
            try {
                const authorized = await navigator.bluetooth.getDevices();
                // Cerca per nome configurato, poi prende il primo disponibile
                device = authorized.find(d => d.name === btName)
                      || authorized.find(d => d.name?.toLowerCase().includes('print'))
                      || authorized[0]
                      || null;
                if (device) console.log('BT: device autorizzato trovato:', device.name);
            } catch(e) {
                console.warn('getDevices non supportato:', e);
            }
        }

        // C) Picker manuale (prima volta o se non trovato)
        if (!device) {
            APP.showToast('Seleziona la stampante Bluetooth...', 'info');
            try {
                const filters = [
                    { name: btName },
                    { namePrefix: btName.substring(0, Math.min(6, btName.length)) }
                ];
                device = await navigator.bluetooth.requestDevice({
                    filters,
                    optionalServices: [SPP_SERVICE, ALT_SERVICE]
                });
            } catch(filterErr) {
                // Fallback: mostra tutti se il filtro non trova nulla
                if (filterErr.name === 'NotFoundError') {
                    device = await navigator.bluetooth.requestDevice({
                        acceptAllDevices: true,
                        optionalServices: [SPP_SERVICE, ALT_SERVICE]
                    });
                } else throw filterErr;
            }
        }

        // Salva in cache per le prossime stampe della stessa sessione
        APP._btDevice = device;

        // ── PASSO 2: Connessione GATT ─────────────────────────────────────
        APP.showToast(`Connessione a ${device.name || 'stampante'}...`, 'info');
        server = await device.gatt.connect();

        // ── PASSO 3: Trova servizio ───────────────────────────────────────
        let service;
        for (const uuid of [SPP_SERVICE, ALT_SERVICE]) {
            try { service = await server.getPrimaryService(uuid); break; }
            catch(e) { /* prova uuid alternativo */ }
        }
        if (!service) {
            const services = await server.getPrimaryServices();
            if (!services.length) throw new Error('Nessun servizio BT trovato sulla stampante');
            service = services[0];
        }

        // ── PASSO 4: Trova characteristic scrivibile ──────────────────────
        let characteristic;
        try {
            characteristic = await service.getCharacteristic(SPP_CHARACTERISTIC);
        } catch(e) {
            const chars = await service.getCharacteristics();
            characteristic = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
            if (!characteristic) throw new Error('Nessuna characteristic scrivibile trovata');
        }

        // ── PASSO 5: Invia dati in chunk ──────────────────────────────────
        const writeNoResp = !characteristic.properties.write && characteristic.properties.writeWithoutResponse;
        let sent = 0;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            if (writeNoResp) await characteristic.writeValueWithoutResponse(chunk);
            else             await characteristic.writeValue(chunk);
            sent += chunk.length;
            await new Promise(r => setTimeout(r, CHUNK_DELAY));
        }

        await new Promise(r => setTimeout(r, 400));
        server.disconnect();
        APP.showToast(`Stampato OK (${sent} bytes)`, 'success');

    } catch(e) {
        if (server) try { server.disconnect(); } catch(_) {}
        // Se la connessione fallisce, resetta la cache così al prossimo tentativo
        // viene riproposto il picker
        if (e.name === 'NetworkError' || e.name === 'InvalidStateError') {
            APP._btDevice = null;
        }
        if (e.name === 'NotFoundError' || e.name === 'NotSupportedError') {
            APP._btDevice = null;
            throw new Error(
                'Stampante non trovata.\n' +
                'Verifica: stampante accesa, Bluetooth abbinato nelle impostazioni Android.'
            );
        }
        throw e;
    }
};

// Resetta il device BT memorizzato (utile se si vuole cambiare stampante)
APP.resetBtDevice = function() {
    APP._btDevice = null;
    APP.showToast('Stampante Bluetooth reimpostata', 'info');
};

APP.sendViaUSB = async function(data, config) {
    if (!navigator.usb) throw new Error('WebUSB non supportato su questo browser');
    try {
        const device = await navigator.usb.requestDevice({ filters: [] });
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        await device.claimInterface(0);
        let endpointOut = null;
        for (const iface of device.configuration.interfaces)
            for (const alt of iface.alternates)
                for (const ep of alt.endpoints)
                    if (ep.direction === 'out') { endpointOut = ep.endpointNumber; break; }
        if (endpointOut === null) throw new Error('Endpoint USB non trovato');
        const CHUNK = 512;
        for (let i = 0; i < data.length; i += CHUNK)
            await device.transferOut(endpointOut, data.slice(i, i + CHUNK));
        await device.close();
        APP.showToast('Stampato via USB', 'success');
    } catch(e) {
        if (e.name === 'NotFoundError') throw new Error('Nessuna stampante USB selezionata');
        throw e;
    }
};
