// ==========================================
// PICAM v4.0 - ordini-fornitori.js
// Ordini Fornitori
// ==========================================

APP.openOrdiniFornitori = async function() {
    APP.currentContext = 'ordiniFornitori';
    APP.showScreen('ordini-fornitori');
    APP.updateHeaderQueueCount('ordFor');
    document.getElementById('ord-for-data').value = APP.formatDate(new Date());
    document.getElementById('ord-for-numero').value = APP.currentOrdineFornitori.numero;
    const regEl = document.getElementById('ord-for-registro');
    if (regEl) regEl.value = APP.config.registroFornitori;
    APP.currentOrdineFornitori.fornitore = null;
    APP.currentOrdineFornitori.righe = [];
    APP.currentOrdineFornitori.pagamento = null;
    APP.renderSelectedFornitore();
    APP.renderRigheOrdineFornitori();
    await APP.loadPagamentiDropdown();
};

APP.loadPagamentiDropdown = async function() {
    const select = document.getElementById('ord-for-pagamento');
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleziona pagamento --</option>';
    try {
        const pagamenti = await DB.getAllPagamenti();
        pagamenti.forEach(pag => {
            const opt = document.createElement('option');
            opt.value = pag.codice;
            opt.textContent = `${pag.codice} - ${pag.descrizione}`;
            opt.dataset.descrizione = pag.descrizione;
            select.appendChild(opt);
        });
    } catch(e) {}
};

APP.renderSelectedFornitore = function() {
    const container = document.getElementById('selected-fornitore');
    const forn = APP.currentOrdineFornitori.fornitore;
    if (!forn) {
        container.innerHTML = '<span>Nessun fornitore selezionato</span>';
        container.className = 'cliente-info empty';
        return;
    }
    container.className = 'cliente-info selected';
    container.innerHTML = `
        <div class="soggetto-header">
            <div>
                <div class="soggetto-name">${forn.ragSoc1}</div>
                ${forn.ragSoc2 ? `<div class="soggetto-name2">${forn.ragSoc2}</div>` : ''}
                <div class="soggetto-detail">${forn.indirizzo || ''} - ${forn.cap || ''} ${forn.localita || ''} ${forn.provincia ? '('+forn.provincia+')' : ''}</div>
                <div class="soggetto-detail">P.IVA: ${forn.partitaIva || '-'} | Tel: ${forn.telefono || '-'}</div>
                <div class="soggetto-detail">Cod: ${forn.codice}</div>
            </div>
            <button class="btn-remove-soggetto" onclick="APP.removeFornitore()">✕</button>
        </div>`;
};

APP.removeFornitore = function() {
    APP.currentOrdineFornitori.fornitore = null;
    APP.renderSelectedFornitore();
    APP.updateBtnConfermaOrdFor();
};

APP.addRigaOrdineFornitore = function(articolo, qty, prezzoInserito = null) {
    const prezzo = prezzoInserito !== null ? prezzoInserito : (articolo.prezzoAcquisto || articolo.prezzo || 0);
    const existing = APP.currentOrdineFornitori.righe.find(r => r.codice === articolo.codice);
    if (existing) {
        existing.qty += qty;
        if (prezzoInserito !== null) existing.prezzo = prezzoInserito;
    } else {
        APP.currentOrdineFornitori.righe.push({
            codice: articolo.codice,
            des1: articolo.des1,
            des2: articolo.des2 || '',
            um: articolo.um || '',
            prezzo,
            codIvaAcquisto: articolo.codIvaAcquisto || '22',
            giacenza: articolo.giacenza || 0,
            qty
        });
    }
    APP.renderRigheOrdineFornitori();
    APP.updateBtnConfermaOrdFor();
};

APP.removeRigaOrdineFornitore = function(index) {
    APP.currentOrdineFornitori.righe.splice(index, 1);
    APP.renderRigheOrdineFornitori();
    APP.updateBtnConfermaOrdFor();
};

APP.renderRigheOrdineFornitori = function() {
    const container = document.getElementById('righe-ord-for');
    const righe = APP.currentOrdineFornitori.righe;

    if (righe.length === 0) {
        container.innerHTML = '';
        ['tot-for-articoli','tot-for-qta','tot-for-imponibile','tot-for-iva','tot-for-totale']
            .forEach(id => { const el = document.getElementById(id); if(el) el.textContent = id.includes('for-a') || id.includes('qta') ? '0' : '€ 0,00'; });
        return;
    }

    let html = '';
    let totQta = 0, totImponibile = 0, totIva = 0;

    righe.forEach((riga, index) => {
        totQta += riga.qty;
        const impRiga = riga.qty * riga.prezzo;
        const aliquota = APP.getAliquotaIvaSync(riga.codIvaAcquisto || '22');
        const ivaRiga  = impRiga * aliquota / 100;
        totImponibile += impRiga;
        totIva += ivaRiga;

        html += `
            <div class="riga-item">
                <div class="riga-info">
                    <div class="riga-code">${riga.codice}</div>
                    <div class="riga-desc">${riga.des1}</div>
                    <div class="riga-details">
                        <span>Qta: <strong>${riga.qty}</strong> ${riga.um}</span>
                        <span>Giac: ${riga.giacenza || 0}</span>
                        <span class="riga-prezzo-badge" style="background:#fff8e1">€ ${riga.prezzo.toFixed(2).replace('.',',')}/cad</span>
                        <span class="riga-totale">€ ${impRiga.toFixed(2).replace('.',',')}</span>
                    </div>
                </div>
                <button class="btn-remove-riga" onclick="APP.removeRigaOrdineFornitore(${index})">🗑️</button>
            </div>`;
    });

    const totOrdine = totImponibile + totIva;
    container.innerHTML = html;

    const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    set('tot-for-articoli',   righe.length);
    set('tot-for-qta',        totQta);
    set('tot-for-imponibile', APP.formatCurrency(totImponibile));
    set('tot-for-iva',        APP.formatCurrency(totIva));
    set('tot-for-totale',     APP.formatCurrency(totOrdine));
};

APP.updateBtnConfermaOrdFor = function() {
    const btn = document.getElementById('btn-conferma-ord-for');
    if (btn) btn.disabled = !(APP.currentOrdineFornitori.fornitore && APP.currentOrdineFornitori.righe.length > 0);
};

APP.confermaOrdineFornitore = async function() {
    const ordine = APP.currentOrdineFornitori;
    if (!ordine.fornitore || ordine.righe.length === 0) { APP.showToast('Ordine incompleto', 'error'); return; }

    // Calcola totali
    let totNetto = 0, totIva = 0;
    for (const riga of ordine.righe) {
        const imp = riga.qty * riga.prezzo;
        const aliquota = await APP.getAliquotaIva(riga.codIvaAcquisto || '22');
        totNetto += imp;
        totIva   += imp * aliquota / 100;
    }

    const pagamentoSelect = document.getElementById('ord-for-pagamento');
    const codPagamento = pagamentoSelect?.value || '';
    const desPagamento = pagamentoSelect?.selectedOptions[0]?.dataset?.descrizione || '';

    const ordineCompleto = {
        tipo: 'fornitore',
        registro: document.getElementById('ord-for-registro')?.value || APP.config.registroFornitori,
        numero: parseInt(document.getElementById('ord-for-numero')?.value) || 1,
        data: new Date().toISOString(),
        fornitore: { ...ordine.fornitore },
        righe: [...ordine.righe],
        pagamento: { codice: codPagamento, descrizione: desPagamento },
        totNetto,
        totIva,
        totOrdine: totNetto + totIva,
        timestamp: Date.now()
    };

    await DB.addToQueue('queueOrdiniFornitori', ordineCompleto);
    try { await DB.addToStorico('storicoOrdiniFornitori', ordineCompleto); } catch(e) {}

    APP.currentOrdineFornitori.numero = ordineCompleto.numero + 1;
    localStorage.setItem('picam_ordfor_last_num', ordineCompleto.numero.toString());
    APP.currentOrdineFornitori.fornitore = null;
    APP.currentOrdineFornitori.righe = [];
    if (pagamentoSelect) pagamentoSelect.value = '';

    APP.renderSelectedFornitore();
    APP.renderRigheOrdineFornitori();
    document.getElementById('ord-for-numero').value = APP.currentOrdineFornitori.numero;
    APP.updateBtnConfermaOrdFor();
    APP.updateHeaderQueueCount('ordFor');
    APP.updateBadges();
    APP.showToast(`Ordine ${ordineCompleto.registro}/${ordineCompleto.numero} aggiunto alla coda`, 'success');
};

// ---------- PRINT / SHARE ORDINE FORNITORE ----------

APP.printOrdineFornitore = async function(showPrices) {
    const ordine = APP.selectedQueueItem;
    if (!ordine) return;
    const doc = await APP.generateOrdineProfessionale(ordine, showPrices);
    const fileName = `OrdineFornitore_${ordine.registro}_${ordine.numero}_${APP.formatDateFile(new Date())}.pdf`;
    APP.downloadPDF(doc, fileName);
};

APP.shareOrdineFornitore = async function() {
    const ordine = APP.selectedQueueItem;
    if (!ordine) return;
    const doc = await APP.generateOrdineProfessionale(ordine, true);
    const fileName = `OrdineFornitore_${ordine.registro}_${ordine.numero}.pdf`;
    await APP.shareDocument(doc, fileName, `Ordine Fornitore ${ordine.registro}/${ordine.numero}`);
};

// ---------- MODAL DETTAGLIO ORDINE FORNITORE ----------

APP.openItemDetailFornitori = function() {
    const item = APP.selectedQueueItem;
    const modal    = document.getElementById('modal-item-detail');
    const titleEl  = document.getElementById('item-detail-title');
    const contentEl = document.getElementById('item-detail-content');
    const actionsEl = document.getElementById('item-detail-actions');

    let totale = 0;
    let righeHtml = item.righe.map((riga, idx) => {
        const tot = riga.qty * riga.prezzo;
        totale += tot;
        return `
            <div class="riga-detail riga-detail-fornitore">
                <div class="riga-info">
                    <span class="riga-cod">${riga.codice}</span>
                    <span class="riga-desc">${riga.des1.substring(0,28)}</span>
                </div>
                <div class="riga-inputs">
                    <label>Qtà:</label>
                    <input type="number" class="riga-qty-edit" data-idx="${idx}" value="${riga.qty}" min="1" style="width:60px"
                           onchange="APP.updateOrderTotal()">
                    <label>Prezzo:</label>
                    <input type="number" class="riga-prezzo-edit" data-idx="${idx}" value="${riga.prezzo.toFixed(2)}"
                           step="0.01" min="0" style="width:80px; background:#fffde7"
                           onchange="APP.updateRigaTotale(${idx})">
                    <span class="riga-tot" id="riga-tot-${idx}">€ ${tot.toFixed(2)}</span>
                </div>
            </div>`;
    }).join('');

    titleEl.textContent = `🏭 Ordine ${item.registro}/${item.numero}`;
    contentEl.innerHTML = `
        <div class="detail-row"><label>Fornitore:</label><span>${item.fornitore.ragSoc1}</span></div>
        <div class="detail-row"><label>Data:</label><span>${APP.formatDate(new Date(item.data))}</span></div>
        <div class="detail-row"><label>Totale:</label><span id="order-total">€ ${totale.toFixed(2)}</span></div>
        ${item.synced ? '<div class="sync-warning">⚠️ Già sincronizzato su Google Drive</div>' : ''}
        <h4>Righe ordine:</h4>
        <div class="righe-list">${righeHtml}</div>`;

    actionsEl.innerHTML = `
        <button class="btn-primary" onclick="APP.saveItemEdit()">💾 Salva</button>
        <button class="btn-secondary" onclick="APP.printOrdineFornitore(true)">🖨️ Stampa con prezzi</button>
        <button class="btn-secondary" onclick="APP.printOrdineFornitore(false)">🖨️ Stampa senza prezzi</button>
        <button class="btn-secondary" onclick="APP.shareOrdineFornitore()">📤 Condividi</button>
        <button class="btn-secondary" onclick="APP.printMobileOrdine()">📱 Stampa Mobile</button>
        <button class="btn-danger" onclick="APP.deleteQueueItem()">🗑️ Elimina</button>
        <button class="btn-secondary" onclick="APP.closeItemDetailModal()">Chiudi</button>`;

    modal.classList.remove('hidden');
};

APP.updateRigaTotale = function(idx) {
    const qtyInput = document.querySelector(`.riga-qty-edit[data-idx="${idx}"]`);
    const przInput = document.querySelector(`.riga-prezzo-edit[data-idx="${idx}"]`);
    const totEl    = document.getElementById(`riga-tot-${idx}`);
    if (qtyInput && przInput && totEl) {
        const tot = (parseFloat(qtyInput.value)||0) * (parseFloat(przInput.value)||0);
        totEl.textContent = `€ ${tot.toFixed(2)}`;
        APP.updateOrderTotal();
    }
};

APP.updateOrderTotal = function() {
    let totale = 0;
    document.querySelectorAll('.riga-qty-edit').forEach(qtyInput => {
        const idx = qtyInput.dataset.idx;
        const przInput = document.querySelector(`.riga-prezzo-edit[data-idx="${idx}"]`);
        totale += (parseFloat(qtyInput.value)||0) * (przInput ? parseFloat(przInput.value)||0 : (APP.selectedQueueItem?.righe[idx]?.prezzo||0));
    });
    const totEl = document.getElementById('order-total');
    if (totEl) totEl.textContent = `€ ${totale.toFixed(2)}`;
};
