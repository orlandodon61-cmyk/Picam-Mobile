// ==========================================
// PICAM v4.0 - pdf.js
// Generazione PDF professionale: ordini clienti e fornitori
// Report inventario, Report ordini
// ==========================================

APP.logoBase64 = null;

APP.loadLogo = async function() {
    try {
        const folderId = await APP.findFolder(APP.config.folder);
        const searchLogo = async (parentId) => {
            const q = parentId
                ? `(name='logo.jpg' or name='logo.png') and '${parentId}' in parents and trashed=false`
                : `(name='logo.jpg' or name='logo.png') and trashed=false`;
            const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
                { headers: { 'Authorization': `Bearer ${APP.accessToken}` } });
            const data = await resp.json();
            return data.files?.length > 0 ? data.files[0] : null;
        };
        let logoFile = folderId ? await searchLogo(folderId) : null;
        if (!logoFile) logoFile = await searchLogo(null);
        if (!logoFile) return null;
        const fileResp = await fetch(`https://www.googleapis.com/drive/v3/files/${logoFile.id}?alt=media`,
            { headers: { 'Authorization': `Bearer ${APP.accessToken}` } });
        const blob = await fileResp.blob();
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch(e) { return null; }
};

// ---------- ORDINE PROFESSIONALE (clienti + fornitori) ----------

APP.generateOrdineProfessionale = async function(ordine, showPrices = true) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    if (!APP.logoBase64 && APP.accessToken) {
        APP.logoBase64 = await APP.loadLogo();
    }

    const isCliente = ordine.tipo === 'cliente';
    const soggetto  = isCliente ? ordine.cliente : ordine.fornitore;
    const dataOrd   = APP.formatDate(new Date(ordine.data));
    const dataOrdTratto = dataOrd.replace(/\//g, '-');
    const tipoDoc   = isCliente ? "ORDINE CLIENTE" : "CONFERMA D'ORDINE FORNITORE";
    const codPag    = ordine.pagamento?.codice || soggetto.codPag || '';
    const desPag    = ordine.pagamento?.descrizione || '';

    // ===== HEADER =====
    if (APP.logoBase64) {
        try { doc.addImage(APP.logoBase64, 'JPEG', 10, 8, 55, 35); } catch(e) {}
    }
    doc.setDrawColor(0); doc.setLineWidth(0.2);
    doc.rect(115, 8, 85, 35);
    doc.setFontSize(8); doc.setFont(undefined, 'bold');
    doc.text('INTESTATARIO', 117, 13);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(soggetto.ragSoc1 || '', 117, 19);
    if (soggetto.ragSoc2) doc.text(soggetto.ragSoc2, 117, 24);
    const yAddr = soggetto.ragSoc2 ? 29 : 24;
    doc.text(soggetto.indirizzo || '', 117, yAddr);
    doc.text(`${soggetto.cap||''} ${soggetto.localita||''} (${soggetto.provincia||''})`, 117, yAddr+5);

    // ===== TITOLO =====
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text(`${tipoDoc} DEL ${dataOrdTratto}`, 105, 52, { align: 'center' });

    // ===== RIGA INFO ORDINE =====
    let y = 58;
    doc.setLineWidth(0.2);
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y, 190, 7, 'F'); doc.rect(10, y, 190, 7);
    doc.setFontSize(6); doc.setFont(undefined, 'bold');
    const tipoLabel = isCliente ? 'COD. CLIENTE' : 'COD. FORNITORE';
    doc.text(tipoLabel,              12, y+5);
    doc.text('PARTITA IVA',          45, y+5);
    doc.text('C. PAG.',              80, y+5);
    doc.text('DESCR. PAGAMENTO',     95, y+5);
    doc.text('NUMERO',              140, y+5);
    doc.text('DATA',                162, y+5);
    doc.text('DEPOSITO',            185, y+5);
    y += 7;
    doc.rect(10, y, 190, 7);
    doc.setFont(undefined, 'normal'); doc.setFontSize(8);
    doc.text(soggetto.codice||'',   12, y+5);
    doc.text(soggetto.partitaIva||'', 45, y+5);
    doc.text(codPag,                 80, y+5);
    doc.text(desPag.substring(0,25), 95, y+5);
    doc.text(`${ordine.registro}/${ordine.numero}`, 140, y+5);
    doc.text(dataOrd,               162, y+5);
    doc.text(APP.config.deposito||'01', 185, y+5);

    // ===== TABELLA ARTICOLI =====
    y += 12;
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y, 190, 7, 'F'); doc.rect(10, y, 190, 7);
    doc.setFontSize(6); doc.setFont(undefined, 'bold');
    doc.text('COD.ARTICOLO',  12, y+5);
    doc.text('DESCRIZIONE',   50, y+5);
    doc.text("QUANTITA'",    115, y+5);
    doc.text('U.M.',          133, y+5);
    if (showPrices) {
        doc.text('PREZZO UNIT.', 148, y+5);
        doc.text('TOTALE',       178, y+5);
    }
    doc.text('DATA CONS.',    192, y+5, { align: 'right' });
    y += 7;

    let totaleMerce = 0;
    doc.setFont(undefined, 'normal'); doc.setFontSize(8);
    ordine.righe.forEach(riga => {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.1);
        doc.line(10, y+5, 200, y+5);
        doc.setDrawColor(0); doc.setLineWidth(0.2);
        doc.text(riga.codice.substring(0,18), 12, y+4);
        doc.text(riga.des1.substring(0,35),   50, y+4);
        doc.text(riga.qty.toFixed(3).replace('.',','), 115, y+4);
        doc.text(riga.um||'Nr.', 133, y+4);
        if (showPrices) {
            const totRiga = riga.qty * riga.prezzo;
            doc.text(riga.prezzo.toFixed(6).replace('.',','), 148, y+4);
            doc.text(totRiga.toFixed(2).replace('.',','),     178, y+4);
            totaleMerce += totRiga;
        }
        doc.text(dataOrd, 192, y+4, { align: 'right' });
        y += 8;
    });

    // ===== TOTALI =====
    y = Math.max(y + 5, 250);
    if (y > 265) { doc.addPage(); y = 20; }

    doc.setLineWidth(0.2);
    doc.rect(10, y, 190, 12);
    doc.setFontSize(7); doc.setFont(undefined, 'bold');
    doc.text('TOTALE MERCE', 12, y+5);
    doc.text('IVA',           80, y+5);
    doc.text('TOTALE ORDINE',140, y+5);
    doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    if (showPrices) {
        const totIva    = ordine.totIva    || 0;
        const totOrdine = ordine.totOrdine || (totaleMerce + totIva);
        doc.text(totaleMerce.toFixed(2).replace('.',','),  12, y+10);
        doc.text(totIva.toFixed(2).replace('.',','),       80, y+10);
        doc.text(totOrdine.toFixed(2).replace('.',','),   140, y+10);
    }

    y += 12;
    doc.rect(10, y, 140, 10); doc.rect(150, y, 50, 10);
    doc.setFontSize(7); doc.setFont(undefined, 'bold');
    doc.text('VETTORE', 12, y+4);

    y += 10;
    doc.rect(10, y, 190, 12);
    doc.setFontSize(7); doc.setFont(undefined, 'bold');
    doc.text('DESTINAZIONE MERCE', 12, y+5);

    y += 12;
    doc.rect(10, y, 190, 12);
    doc.text('NOTE', 12, y+5);

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

    APP.downloadPDF(doc, `Inventario_${APP.formatDateFile(new Date())}.pdf`);
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
        doc.setFillColor(tipo === 'clienti' ? 33 : 94, tipo === 'clienti' ? 150 : 53, tipo === 'clienti' ? 243 : 177);
        doc.rect(10, y-4, 190, 10, 'F');
        doc.setTextColor(255,255,255); doc.setFontSize(10); doc.setFont(undefined, 'bold');
        doc.text(`Ordine ${ordine.registro}/${ordine.numero} - ${APP.formatDate(new Date(ordine.data))}`, 12, y+2);
        y += 12;
        doc.setTextColor(0,0,0); doc.setFont(undefined,'normal'); doc.setFontSize(10);
        doc.text(`${sogg.ragSoc1}`, 12, y);
        y += 8;
        let totOrd = 0;
        ordine.righe.forEach(riga => {
            if (y > 280) { doc.addPage(); y = 20; }
            const tot = riga.qty * riga.prezzo;
            totOrd += tot;
            doc.setFontSize(8);
            doc.text(`  ${riga.codice}`, 12, y);
            doc.text(riga.des1.substring(0,40), 40, y);
            doc.text(`${riga.qty} ${riga.um}`, 140, y);
            doc.text(`€ ${tot.toFixed(2)}`, 170, y);
            y += 5;
        });
        doc.setFont(undefined,'bold');
        doc.text(`Totale: € ${totOrd.toFixed(2)}`, 150, y+2);
        y += 15;
    });
    APP.downloadPDF(doc, `Ordini_${tipo}_${APP.formatDateFile(new Date())}.pdf`);
};

// ---------- DOWNLOAD / SHARE ----------

APP.downloadPDF = function(doc, fileName) {
    const url = URL.createObjectURL(doc.output('blob'));
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
    APP.showToast('PDF generato', 'success');
};

APP.shareDocument = async function(doc, fileName, title) {
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ title, files: [file] });
            APP.showToast('Documento condiviso', 'success');
        } catch(e) {
            if (e.name !== 'AbortError') APP.downloadPDF(doc, fileName);
        }
    } else {
        APP.downloadPDF(doc, fileName);
    }
};

APP.generateReport = async function(context) {
    switch(context) {
        case 'inventario':      await APP.generateReportInventario();       break;
        case 'ordiniClienti':   await APP.generateReportOrdini('clienti');  break;
        case 'ordiniFornitori': await APP.generateReportOrdini('fornitori');break;
    }
};
