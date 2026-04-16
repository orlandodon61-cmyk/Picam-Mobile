// ==========================================
// PICAM v4.0 - pdf.js
// Layout unificato clienti + fornitori
// Logo, dati mittente, fincature uniformi
// Destinazione stampa configurabile
// ==========================================

APP.logoBase64 = null;

// ---------- CARICAMENTO LOGO ----------

APP.loadLogo = async function() {
    try {
        const folderId = await APP.findFolder(APP.config.folder);
        const searchLogo = async (parentId) => {
            const q = parentId
                ? `(name='logo.jpg' or name='logo.png' or name='LOGO.jpg' or name='LOGO.png') and '${parentId}' in parents and trashed=false`
                : `(name='logo.jpg' or name='logo.png' or name='LOGO.jpg' or name='LOGO.png') and trashed=false`;
            const resp = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
                { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
            );
            const data = await resp.json();
            return data.files?.length > 0 ? data.files[0] : null;
        };
        let logoFile = folderId ? await searchLogo(folderId) : null;
        if (!logoFile) logoFile = await searchLogo(null);
        if (!logoFile) return null;
        const fileResp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${logoFile.id}?alt=media`,
            { headers: { 'Authorization': `Bearer ${APP.accessToken}` } }
        );
        const blob = await fileResp.blob();
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch(e) {
        console.warn('Errore caricamento logo:', e);
        return null;
    }
};

// ---------- HELPER PDF ----------

// Disegna rettangolo con bordo 0.2pt e riempimento opzionale
function pdfRect(doc, x, y, w, h, fill = false, fillColor = [240,240,240]) {
    doc.setLineWidth(0.2);
    doc.setDrawColor(80, 80, 80);
    if (fill) {
        doc.setFillColor(...fillColor);
        doc.rect(x, y, w, h, 'FD');
    } else {
        doc.rect(x, y, w, h);
    }
}

// Linea separatrice leggera tra le righe articolo
function pdfRowLine(doc, y, x1 = 10, x2 = 200) {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.line(x1, y, x2, y);
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.2);
}

// ---------- ORDINE PROFESSIONALE UNIFICATO ----------
// Unico layout per clienti e fornitori

APP.generateOrdineProfessionale = async function(ordine, showPrices = true) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Carica logo se non in cache
    if (!APP.logoBase64 && APP.accessToken) {
        APP.logoBase64 = await APP.loadLogo();
    }

    const isCliente  = ordine.tipo === 'cliente';
    const soggetto   = isCliente ? ordine.cliente : ordine.fornitore;
    const dataOrd    = APP.formatDate(new Date(ordine.data));
    const dataOrdF   = dataOrd.replace(/\//g, '-');
    const tipoDoc    = isCliente ? 'ORDINE CLIENTE' : "CONFERMA D'ORDINE FORNITORE";
    const tipoLabel  = isCliente ? 'CLIENTE' : 'FORNITORE';
    const colHeader  = isCliente ? [33, 103, 185] : [74, 53, 152];  // blu/viola header
    const codPag     = ordine.pagamento?.codice || soggetto.codPag || '';
    const desPag     = ordine.pagamento?.descrizione || '';

    // ─────────────────────────────────────────
    // SEZIONE 1: INTESTAZIONE MITTENTE (sx)
    // ─────────────────────────────────────────
    const mitRagSoc  = APP.config.mitRagSoc  || '';
    const mitInd     = APP.config.mitInd     || '';
    const mitCap     = APP.config.mitCap     || '';
    const mitLoc     = APP.config.mitLoc     || '';
    const mitPro     = APP.config.mitPro     || '';
    const mitPiva    = APP.config.mitPiva    || '';
    const mitTel     = APP.config.mitTel     || '';

    let logoEndY = 8;

    if (APP.logoBase64) {
        // Logo proporzionato: larghezza max 65mm, altezza max 30mm
        try {
            const img = new Image();
            await new Promise(resolve => {
                img.onload = resolve;
                img.src = APP.logoBase64;
            });
            const maxW = 65, maxH = 30;
            const ratio = img.naturalHeight / img.naturalWidth;
            let lw = maxW, lh = lw * ratio;
            if (lh > maxH) { lh = maxH; lw = lh / ratio; }
            doc.addImage(APP.logoBase64, 'JPEG', 10, 8, lw, lh);
            logoEndY = 8 + lh + 2;
        } catch(e) {
            // Se logo fallisce, usa testo
            doc.setFontSize(13); doc.setFont(undefined, 'bold');
            doc.setTextColor(33, 103, 185);
            doc.text(mitRagSoc, 10, 14);
            doc.setTextColor(0, 0, 0);
            logoEndY = 18;
        }
    } else if (mitRagSoc) {
        // Nessun logo: mostra ragione sociale grande
        doc.setFontSize(13); doc.setFont(undefined, 'bold');
        doc.setTextColor(...colHeader);
        doc.text(mitRagSoc, 10, 15);
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal'); doc.setFontSize(8);
        let ym = 21;
        if (mitInd) { doc.text(mitInd, 10, ym); ym += 4; }
        if (mitLoc) { doc.text(`${mitCap} ${mitLoc} (${mitPro})`, 10, ym); ym += 4; }
        if (mitPiva) { doc.text(`P.IVA: ${mitPiva}`, 10, ym); ym += 4; }
        if (mitTel) { doc.text(`Tel: ${mitTel}`, 10, ym); }
        logoEndY = 44;
    }

    // ─────────────────────────────────────────
    // SEZIONE 2: BOX DESTINATARIO (dx)
    // ─────────────────────────────────────────
    pdfRect(doc, 115, 8, 85, 38);

    doc.setFontSize(7); doc.setFont(undefined, 'bold');
    doc.setTextColor(...colHeader);
    doc.text(tipoLabel, 117, 14);
    doc.setTextColor(0, 0, 0); doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    let ys = 20;
    doc.text((soggetto.ragSoc1 || '').substring(0, 38), 117, ys); ys += 5;
    if (soggetto.ragSoc2) { doc.text(soggetto.ragSoc2.substring(0, 38), 117, ys); ys += 4; }
    doc.setFontSize(8);
    if (soggetto.indirizzo) { doc.text(soggetto.indirizzo.substring(0,38), 117, ys); ys += 4; }
    doc.text(`${soggetto.cap||''} ${soggetto.localita||''} ${soggetto.provincia ? '('+soggetto.provincia+')':''}`, 117, ys);

    // ─────────────────────────────────────────
    // SEZIONE 3: TITOLO DOCUMENTO
    // ─────────────────────────────────────────
    const yTitolo = Math.max(logoEndY, 50);
    doc.setFillColor(...colHeader);
    doc.setDrawColor(...colHeader);
    doc.rect(10, yTitolo, 190, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text(`${tipoDoc}  N. ${ordine.registro}/${ordine.numero}  DEL ${dataOrdF}`, 105, yTitolo + 5.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // ─────────────────────────────────────────
    // SEZIONE 4: RIGA DATI ORDINE
    // ─────────────────────────────────────────
    let y = yTitolo + 8;

    // Header dati
    pdfRect(doc, 10, y, 190, 6, true, [230,230,230]);
    doc.setFontSize(6); doc.setFont(undefined, 'bold');
    doc.text(`COD. ${tipoLabel}`, 12, y + 4.2);
    doc.text('PARTITA IVA',       42, y + 4.2);
    doc.text('COD. PAG.',         82, y + 4.2);
    doc.text('DESCRIZIONE PAGAMENTO', 98, y + 4.2);
    doc.text('DEPOSITO',         152, y + 4.2);
    doc.text('DATA',             168, y + 4.2);
    doc.text('N. PAG.',          188, y + 4.2);
    y += 6;

    // Valori dati
    pdfRect(doc, 10, y, 190, 6);
    doc.setFont(undefined, 'normal'); doc.setFontSize(8);
    doc.text(soggetto.codice || '',      12, y + 4.2);
    doc.text(soggetto.partitaIva || '',  42, y + 4.2);
    doc.text(codPag,                     82, y + 4.2);
    doc.text(desPag.substring(0, 24),    98, y + 4.2);  // max 24 per non sforare
    doc.text(APP.config.deposito || '01', 152, y + 4.2);
    doc.text(dataOrd,                   168, y + 4.2);
    doc.text('1',                       190, y + 4.2);
    y += 6;

    // ─────────────────────────────────────────
    // SEZIONE 5: HEADER TABELLA ARTICOLI
    // ─────────────────────────────────────────
    // Layout colonne (left-align, 8pt ≈ 1.8mm/char):
    //  12  COD (max 15 char ~27mm → fine ~39)
    //  42  DESC (max 34 char ~61mm → fine ~103)
    // 106  QTA (max 7 char ~13mm → fine ~119)
    // 121  U.M. (max 4 char ~7mm → fine ~128)
    // 132  PREZZO UNIT (max 9 char ~16mm → fine ~148)  [solo con prezzi]
    // 152  TOTALE RIGA (max 8 char ~14mm → fine ~166)  [solo con prezzi]
    // 170  DT.CONS. (10 char ~18mm → fine ~188 < 200)
    y += 3;
    pdfRect(doc, 10, y, 190, 7, true, [230,230,230]);
    doc.setFontSize(6.5); doc.setFont(undefined, 'bold');
    doc.text('COD. ARTICOLO',   12,  y + 5);
    doc.text('DESCRIZIONE',     42,  y + 5);
    doc.text("QTA'",           106,  y + 5);
    doc.text('U.M.',           121,  y + 5);
    if (showPrices) {
        doc.text('PREZZO UNIT.', 132, y + 5);
        doc.text('TOTALE RIGA',  152, y + 5);
    }
    doc.text('DT.CONS.',        170, y + 5);
    y += 7;

    // ─────────────────────────────────────────
    // SEZIONE 6: RIGHE ARTICOLI
    // ─────────────────────────────────────────
    let totaleMerce = 0;
    doc.setFont(undefined, 'normal'); doc.setFontSize(8);

    ordine.righe.forEach((riga, idx) => {
        if (y > 245) {
            doc.addPage();
            y = 20;
            // Ripete header tabella sulla nuova pagina
            pdfRect(doc, 10, y, 190, 7, true, [230,230,230]);
            doc.setFontSize(6.5); doc.setFont(undefined, 'bold');
            doc.text('COD. ARTICOLO', 12,  y+5); doc.text('DESCRIZIONE', 42, y+5);
            doc.text("QTA'", 106, y+5); doc.text('U.M.', 121, y+5);
            if (showPrices) { doc.text('PREZZO UNIT.', 132, y+5); doc.text('TOTALE RIGA', 152, y+5); }
            doc.text('DT.CONS.', 170, y+5);
            y += 7;
            doc.setFont(undefined, 'normal'); doc.setFontSize(8);
        }

        // Riga alternata leggera
        if (idx % 2 === 0) {
            doc.setFillColor(250, 250, 250);
            doc.rect(10, y, 190, 7, 'F');
        }
        // Linea separatrice
        pdfRowLine(doc, y + 7);

        doc.setFontSize(8);
        doc.text(riga.codice.substring(0, 15),                      12,  y + 5);
        doc.text(riga.des1.substring(0, 34),                        42,  y + 5);
        doc.text(riga.qty.toFixed(3).replace('.', ','),             106,  y + 5);
        doc.text((riga.um || 'Nr.').substring(0, 4),                121,  y + 5);

        if (showPrices) {
            const totRiga = riga.qty * riga.prezzo;
            totaleMerce += totRiga;
            doc.text(riga.prezzo.toFixed(4).replace('.', ','),      132,  y + 5);
            doc.text(totRiga.toFixed(2).replace('.', ','),          152,  y + 5);
        }
        doc.text(dataOrd,                                           170,  y + 5);
        y += 7;
    });

    // ─────────────────────────────────────────
    // SEZIONE 7: FOOTER TOTALI + CASELLE
    // ─────────────────────────────────────────
    // Forza il footer verso il fondo pagina ma non oltre
    y = Math.max(y + 4, 220);
    if (y > 235) { doc.addPage(); y = 20; }

    // Riga totali
    pdfRect(doc, 10, y, 190, 10, true, [240,240,240]);
    doc.setFontSize(7); doc.setFont(undefined, 'bold');
    doc.text('TOTALE MERCE',   12, y + 4);
    doc.text('SCONTO',         55, y + 4);
    doc.text('TOTALE IVA',     90, y + 4);
    doc.text('TOTALE ORDINE', 140, y + 4);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    if (showPrices) {
        const totIva    = ordine.totIva    || 0;
        const totOrdine = ordine.totOrdine || (totaleMerce + totIva);
        doc.text(totaleMerce.toFixed(2).replace('.', ','),  12, y + 8.5);
        doc.text('0,00',                                     55, y + 8.5);
        doc.text(totIva.toFixed(2).replace('.', ','),        90, y + 8.5);
        // Totale in grassetto
        doc.setFont(undefined, 'bold');
        doc.setFontSize(10);
        doc.text(totOrdine.toFixed(2).replace('.', ','),    140, y + 8.5);
        doc.setFont(undefined, 'normal'); doc.setFontSize(8);
    }
    y += 10;

    // Caselle Vettore / Firma
    pdfRect(doc, 10,  y, 100, 12);
    pdfRect(doc, 112, y,  88, 12);
    doc.setFontSize(6.5); doc.setFont(undefined, 'bold');
    doc.text('VETTORE / TRASPORTATORE', 12, y + 4);
    doc.text('FIRMA RESPONSABILE',      114, y + 4);
    y += 12;

    // Casella Destinazione merce
    pdfRect(doc, 10, y, 190, 12);
    doc.setFontSize(6.5); doc.setFont(undefined, 'bold');
    doc.text('DESTINAZIONE MERCE', 12, y + 4);
    y += 12;

    // Casella Note
    pdfRect(doc, 10, y, 190, 14);
    doc.setFontSize(6.5); doc.setFont(undefined, 'bold');
    doc.text('NOTE', 12, y + 4);

    // Numero pagina in basso a destra
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setFont(undefined, 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text(`Pag. ${i}/${pageCount}`, 200, 292, { align: 'right' });
        doc.setTextColor(0, 0, 0);
    }

    return doc;
};

// ---------- REPORT INVENTARIO ----------

APP.generateReportInventario = async function() {
    const queue = await DB.getQueue('queueInventario');
    if (queue.length === 0) { APP.showToast('Nessun elemento da esportare', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text('Report Inventario', 105, 15, { align: 'center' });
    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text(`Generato il ${APP.formatDate(new Date())} | Deposito: ${APP.config.deposito}`, 105, 22, { align: 'center' });

    let y = 35;
    doc.setFillColor(55, 71, 79);
    doc.rect(10, y-5, 190, 8, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont(undefined, 'bold');
    doc.text('Codice', 12, y); doc.text('Descrizione', 45, y);
    doc.text('Loc.', 155, y); doc.text('Qtà', 185, y);
    y += 8;
    doc.setTextColor(0,0,0); doc.setFont(undefined, 'normal');
    let totQta = 0;
    queue.forEach((item, i) => {
        if (y > 280) { doc.addPage(); y = 20; }
        if (i % 2 === 0) { doc.setFillColor(248,248,248); doc.rect(10, y-4, 190, 6, 'F'); }
        doc.setFontSize(8);
        doc.text(item.codice.substring(0,20), 12, y);
        doc.text((item.des1||'').substring(0,50), 45, y);
        doc.text(item.locazione||'-', 155, y);
        doc.text(String(item.qty), 185, y);
        totQta += item.qty; y += 6;
    });
    y += 5;
    doc.setFillColor(55, 71, 79); doc.rect(10, y-4, 190, 8, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text(`Totale: ${queue.length} articoli`, 12, y);
    doc.text(`${totQta} pz`, 185, y);

    APP.savePDF(doc, `Inventario_${APP.formatDateFile(new Date())}.pdf`);
};

// ---------- REPORT ORDINI ----------

APP.generateReportOrdini = async function(tipo) {
    const storeName = tipo === 'clienti' ? 'queueOrdiniClienti' : 'queueOrdiniFornitori';
    const queue = await DB.getQueue(storeName);
    if (queue.length === 0) { APP.showToast('Nessun ordine da esportare', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const titolo = tipo === 'clienti' ? 'Report Ordini Clienti' : 'Report Ordini Fornitori';
    doc.setFontSize(16); doc.text(titolo, 105, 15, { align: 'center' });
    doc.setFontSize(9); doc.text(`Generato il ${APP.formatDate(new Date())}`, 105, 22, { align: 'center' });
    let y = 35;
    queue.forEach(ordine => {
        if (y > 250) { doc.addPage(); y = 20; }
        const sogg = tipo === 'clienti' ? ordine.cliente : ordine.fornitore;
        const col = tipo === 'clienti' ? [33,103,185] : [74,53,152];
        doc.setFillColor(...col);
        doc.rect(10, y-4, 190, 10, 'F');
        doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont(undefined, 'bold');
        doc.text(`Ordine ${ordine.registro}/${ordine.numero} — ${APP.formatDate(new Date(ordine.data))}`, 12, y+2);
        y += 12;
        doc.setTextColor(0,0,0); doc.setFont(undefined,'normal'); doc.setFontSize(10);
        doc.text(`${sogg.ragSoc1}`, 12, y); y += 8;
        let totOrd = 0;
        ordine.righe.forEach(riga => {
            if (y > 280) { doc.addPage(); y = 20; }
            const tot = riga.qty * riga.prezzo;
            totOrd += tot;
            doc.setFontSize(8);
            doc.text(`  ${riga.codice}`, 12, y);
            doc.text(riga.des1.substring(0,40), 42, y);
            doc.text(`${riga.qty} ${riga.um}`, 140, y);
            doc.text(`€ ${tot.toFixed(2)}`, 170, y);
            y += 5;
        });
        doc.setFont(undefined,'bold');
        doc.text(`Totale: € ${totOrd.toFixed(2)}`, 150, y+2);
        y += 15;
    });
    APP.savePDF(doc, `Ordini_${tipo}_${APP.formatDateFile(new Date())}.pdf`);
};

// ---------- SALVA / CONDIVIDI PDF ----------

// Salva il PDF secondo la destinazione configurata:
//   'download' → download diretto (va in Downloads/ su Android)
//   'share'    → Web Share API (l'utente sceglie dove salvare)
//   'drive'    → upload su Google Drive nella cartella configurata
APP.savePDF = async function(doc, fileName) {
    const dest = APP.config.saveMethod || 'download';

    if (dest === 'drive') {
        try {
            await APP.ensureValidToken();
            const folderId = await APP.findFolder(APP.config.folder);
            if (!folderId) throw new Error('Cartella Drive non trovata');
            const pdfArray = doc.output('arraybuffer');
            await APP.uploadFile(folderId, fileName, pdfArray,
                'application/pdf');
            APP.showToast(`PDF salvato su Drive: ${fileName}`, 'success');
            return;
        } catch(e) {
            APP.showToast('Errore Drive: ' + e.message + ' — salvo localmente', 'error');
            // Fallback al download
        }
    }

    if (dest === 'share' && navigator.share) {
        try {
            const pdfBlob = doc.output('blob');
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ title: fileName, files: [file] });
                APP.showToast('PDF condiviso', 'success');
                return;
            }
        } catch(e) {
            if (e.name === 'AbortError') return; // utente ha annullato
            // Fallback al download
        }
    }

    // 'download' oppure fallback: download standard
    // Su Android Chrome → cartella Downloads/
    APP.downloadPDF(doc, fileName);
};

// Download diretto (legacy, usato anche da savePDF come fallback)
APP.downloadPDF = function(doc, fileName) {
    const url = URL.createObjectURL(doc.output('blob'));
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    APP.showToast('PDF scaricato', 'success');
};

// Condividi documento (chiamata da tasto "Condividi" nell'ordine)
APP.shareDocument = async function(doc, fileName, title) {
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ title, files: [file] });
            APP.showToast('Documento condiviso', 'success');
            return;
        } catch(e) {
            if (e.name === 'AbortError') return;
        }
    }
    APP.downloadPDF(doc, fileName);
};

APP.generateReport = async function(context) {
    switch(context) {
        case 'inventario':      await APP.generateReportInventario();       break;
        case 'ordiniClienti':   await APP.generateReportOrdini('clienti');  break;
        case 'ordiniFornitori': await APP.generateReportOrdini('fornitori');break;
    }
};
