// ==========================================
// PICAM v4.0 - ordini-clienti.js
// Ordini Clienti: completo, parificato a Fornitori
// Prezzo editabile, totali IVA, stampa PDF, condivisione
// ==========================================

APP.openOrdiniClienti = async function() {
    APP.currentContext = 'ordiniClienti';
    APP.showScreen('ordini-clienti');
    APP.updateHeaderQueueCount('ordCli');
    document.getElementById('ord-cli-data').value = APP.formatDate(new Date());
    document.getElementById('ord-cli-numero').value = APP.currentOrdineClienti.numero;
    // Applica registro da config (solo se non già modificato manualmente)
    const regEl = document.getElementById('ord-cli-registro');
    if (regEl) regEl.value = APP.config.registroClienti;
    // Reset ordine corrente
    APP.currentOrdineClienti.cliente = null;
    APP.currentOrdineClienti.righe = [];
    APP.renderSelectedCliente();
    APP.renderRigheOrdineClienti();
    // Carica pagamenti anche per clienti
    await APP.loadPagamentiDropdownCli();
};

APP.loadPagamentiDropdownCli = async function() {
    const select = document.getElementById('ord-cli-pagamento');
    if (!select) return;
    select.innerHTML = '<option value="">-- Seleziona pagamento --</option>';
    try {
        const pagamenti = await DB.getAllPagamenti();
        pagamenti.forEach(pag => {
            const option = document.createElement('option');
            option.value = pag.codice;
            option.textContent = `${pag.codice} - ${pag.descrizione}`;
            option.dataset.descrizione = pag.descrizione;
            select.appendChild(option);
        });
    } catch(e) {}
};

APP.renderSelectedCliente = function() {
    const container = document.getElementById('selected-cliente');
    const cli = APP.currentOrdineClienti.cliente;
    if (!cli) {
        container.innerHTML = '<span>Nessun cliente selezionato</span>';
        container.className = 'cliente-info empty';
        return;
    }
    container.className = 'cliente-info selected';
    container.innerHTML = `
        <div class="soggetto-header">
            <div>
                <div class="soggetto-name">${cli.ragSoc1}</div>
                ${cli.ragSoc2 ? `<div class="soggetto-name2">${cli.ragSoc2}</div>` : ''}
                <div class="soggetto-detail">${cli.indirizzo || ''} - ${cli.cap || ''} ${cli.localita || ''} ${cli.provincia ? '('+cli.provincia+')' : ''}</div>
                <div class="soggetto-detail">P.IVA: ${cli.partitaIva || '-'} | Tel: ${cli.telefono || '-'}</div>
                <div class="soggetto-detail">Cod: ${cli.codice}</div>
            </div>
            <button class="btn-remove-soggetto" onclick="APP.removeCliente()">✕</button>
        </div>`;
};

APP.removeCliente = function() {
    APP.currentOrdineClienti.cliente = null;
    APP.renderSelectedCliente();
    APP.updateBtnConfermaOrdCli();
};

APP.addRigaOrdineCliente = function(articolo, qty, prezzoInserito = null) {
    const prezzo = prezzoInserito !== null ? prezzoInserito : (articolo.prezzoVendita || articolo.prezzo || 0);
    const existing = APP.currentOrdineClienti.righe.find(r => r.codice === articolo.codice);
    if (existing) {
        existing.qty += qty;
        if (prezzoInserito !== null) existing.prezzo = prezzoInserito;
    } else {
        APP.currentOrdineClienti.righe.push({
            codice: articolo.codice,
            des1: articolo.des1,
            des2: articolo.des2 || '',
            um: articolo.um || '',
            prezzo,
            codIvaVendita: articolo.codIvaVendita || '22',
            giacenza: articolo.giacenza || 0,
            qty
        });
    }
    APP.renderRigheOrdineClienti();
    APP.updateBtnConfermaOrdCli();
};

APP.removeRigaOrdineCliente = function(index) {
    APP.currentOrdineClienti.righe.splice(index, 1);
    APP.renderRigheOrdineClienti();
    APP.updateBtnConfermaOrdCli();
};

APP.renderRigheOrdineClienti = function() {
    const container = document.getElementById('righe-ord-cli');
    const righe = APP.currentOrdineClienti.righe;

    if (righe.length === 0) {
        container.innerHTML = '';
        ['tot-cli-articoli','tot-cli-qta','tot-cli-imponibile','tot-cli-iva','tot-cli-totale']
            .forEach(id => { const el = document.getElementById(id); if(el) el.textContent = id.includes('cli-a') || id.includes('qta') ? '0' : '€ 0,00'; });
        return;
    }

    let html = '';
    let totQta = 0, totImponibile = 0, totIva = 0;

    righe.forEach((riga, index) => {
        totQta += riga.qty;
        const impRiga = riga.qty * riga.prezzo;
        const aliquota = APP.getAliquotaIvaSync(riga.codIvaVendita || '22');
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
                        <span class="riga-prezzo-badge">€ ${riga.prezzo.toFixed(2).replace('.',',')}/cad</span>
                        <span class="riga-totale">€ ${impRiga.toFixed(2).replace('.',',')}</span>
                    </div>
                </div>
                <button class="btn-remove-riga" onclick="APP.removeRigaOrdineCliente(${index})">🗑️</button>
            </div>`;
    });

    const totOrdine = totImponibile + totIva;
    container.innerHTML = html;

    const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    set('tot-cli-articoli',   righe.length);
    set('tot-cli-qta',        totQta);
    set('tot-cli-imponibile', APP.formatCurrency(totImponibile));
    set('tot-cli-iva',        APP.formatCurrency(totIva));
    set('tot-cli-totale',     APP.formatCurrency(totOrdine));
};

APP.updateBtnConfermaOrdCli = function() {
    const btn = document.getElementById('btn-conferma-ord-cli');
    if (btn) btn.disabled = !(APP.currentOrdineClienti.cliente && APP.currentOrdineClienti.righe.length > 0);
};

APP.confermaOrdineCliente = async function() {
    const ordine = APP.currentOrdineClienti;
    if (!ordine.cliente || ordine.righe.length === 0) { APP.showToast('Ordine incompleto', 'error'); return; }

    // Calcola totali
    let totNetto = 0, totIva = 0;
    for (const riga of ordine.righe) {
        const imp = riga.qty * riga.prezzo;
        const aliquota = await APP.getAliquotaIva(riga.codIvaVendita || '22');
        totNetto += imp;
        totIva += imp * aliquota / 100;
    }

    const pagamentoSelect = document.getElementById('ord-cli-pagamento');
    const codPagamento = pagamentoSelect?.value || '';
    const desPagamento = pagamentoSelect?.selectedOptions[0]?.dataset?.descrizione || '';

    const ordineCompleto = {
        tipo: 'cliente',
        registro: document.getElementById('ord-cli-registro')?.value || APP.config.registroClienti,
        numero: parseInt(document.getElementById('ord-cli-numero')?.value) || 1,
        data: new Date().toISOString(),
        cliente: { ...ordine.cliente },
        righe: [...ordine.righe],
        pagamento: { codice: codPagamento, descrizione: desPagamento },
        totNetto,
        totIva,
        totOrdine: totNetto + totIva,
        timestamp: Date.now()
    };

    await DB.addToQueue('queueOrdiniClienti', ordineCompleto);
    try { await DB.addToStorico('storicoOrdiniClienti', ordineCompleto); } catch(e) {}

    APP.currentOrdineClienti.numero = ordineCompleto.numero + 1;
    localStorage.setItem('picam_ordini_last_num', ordineCompleto.numero.toString());
    APP.currentOrdineClienti.cliente = null;
    APP.currentOrdineClienti.righe = [];

    APP.renderSelectedCliente();
    APP.renderRigheOrdineClienti();
    document.getElementById('ord-cli-numero').value = APP.currentOrdineClienti.numero;
    APP.updateBtnConfermaOrdCli();
    APP.updateHeaderQueueCount('ordCli');
    APP.updateBadges();
    APP.showToast(`Ordine ${ordineCompleto.registro}/${ordineCompleto.numero} aggiunto alla coda`, 'success');
};

// ---------- PRINT / SHARE ORDINE CLIENTE ----------

APP.printOrdineCliente = async function(showPrices) {
    const ordine = APP.selectedQueueItem;
    if (!ordine) return;
    const doc = await APP.generateOrdineProfessionale(ordine, showPrices);
    const fileName = `OrdineCliente_${ordine.registro}_${ordine.numero}_${APP.formatDateFile(new Date())}.pdf`;
    APP.savePDF(doc, fileName);
};

APP.shareOrdineCliente = async function() {
    const ordine = APP.selectedQueueItem;
    if (!ordine) return;
    const doc = await APP.generateOrdineProfessionale(ordine, true);
    const fileName = `OrdineCliente_${ordine.registro}_${ordine.numero}.pdf`;
    await APP.shareDocument(doc, fileName, `Ordine Cliente ${ordine.registro}/${ordine.numero}`);
};

// ---------- MODAL DETTAGLIO ORDINE CLIENTE (con prezzo editabile) ----------

APP.openItemDetailClienti = function() {
    const item = APP.selectedQueueItem;
    const modal = document.getElementById('modal-item-detail');
    const titleEl = document.getElementById('item-detail-title');
    const contentEl = document.getElementById('item-detail-content');
    const actionsEl = document.getElementById('item-detail-actions');

    let totale = 0;
    let righeHtml = item.righe.map((riga, idx) => {
        const tot = riga.qty * riga.prezzo;
        totale += tot;
        return `
            <div class="riga-detail riga-detail-cliente">
                <div class="riga-info">
                    <span class="riga-cod">${riga.codice}</span>
                    <span class="riga-desc">${riga.des1.substring(0, 28)}</span>
                </div>
                <div class="riga-inputs">
                    <label>Qtà:</label>
                    <input type="number" class="riga-qty-edit" data-idx="${idx}" value="${riga.qty}" min="1" style="width:60px"
                           onchange="APP.updateOrderTotalCli()">
                    <label>Prezzo:</label>
                    <input type="number" class="riga-prezzo-edit" data-idx="${idx}" value="${riga.prezzo.toFixed(2)}"
                           step="0.01" min="0" style="width:80px; background:#e8f5e9"
                           onchange="APP.updateRigaTotaleCli(${idx})">
                    <span class="riga-tot" id="riga-tot-cli-${idx}">€ ${tot.toFixed(2)}</span>
                </div>
            </div>`;
    }).join('');

    titleEl.textContent = `🛒 Ordine ${item.registro}/${item.numero}`;
    contentEl.innerHTML = `
        <div class="detail-row"><label>Cliente:</label><span>${item.cliente.ragSoc1}</span></div>
        <div class="detail-row"><label>Data:</label><span>${APP.formatDate(new Date(item.data))}</span></div>
        <div class="detail-row"><label>Totale:</label><span id="order-total-cli">€ ${totale.toFixed(2)}</span></div>
        ${item.synced ? '<div class="sync-warning">⚠️ Già sincronizzato su Google Drive</div>' : ''}
        <h4>Righe ordine:</h4>
        <div class="righe-list">${righeHtml}</div>`;

    actionsEl.innerHTML = `
        <button class="btn-primary" onclick="APP.saveItemEditCli()">💾 Salva</button>
        <button class="btn-secondary" onclick="APP.printOrdineCliente(true)">🖨️ Stampa con prezzi</button>
        <button class="btn-secondary" onclick="APP.printOrdineCliente(false)">🖨️ Stampa senza prezzi</button>
        <button class="btn-secondary" onclick="APP.shareOrdineCliente()">📤 Condividi</button>
        <button class="btn-secondary" onclick="APP.printMobileOrdine()">📱 Stampa Mobile</button>
        <button class="btn-danger" onclick="APP.deleteQueueItem()">🗑️ Elimina</button>
        <button class="btn-secondary" onclick="APP.closeItemDetailModal()">Chiudi</button>`;

    modal.classList.remove('hidden');
};

APP.updateRigaTotaleCli = function(idx) {
    const qtyInput   = document.querySelector(`.riga-qty-edit[data-idx="${idx}"]`);
    const przInput   = document.querySelector(`.riga-prezzo-edit[data-idx="${idx}"]`);
    const totEl      = document.getElementById(`riga-tot-cli-${idx}`);
    if (qtyInput && przInput && totEl) {
        const tot = (parseFloat(qtyInput.value)||0) * (parseFloat(przInput.value)||0);
        totEl.textContent = `€ ${tot.toFixed(2)}`;
        APP.updateOrderTotalCli();
    }
};

APP.updateOrderTotalCli = function() {
    let totale = 0;
    document.querySelectorAll('.riga-qty-edit').forEach(qtyInput => {
        const idx = qtyInput.dataset.idx;
        const przInput = document.querySelector(`.riga-prezzo-edit[data-idx="${idx}"]`);
        totale += (parseFloat(qtyInput.value)||0) * (przInput ? (parseFloat(przInput.value)||0) : (APP.selectedQueueItem?.righe[idx]?.prezzo||0));
    });
    const totEl = document.getElementById('order-total-cli');
    if (totEl) totEl.textContent = `€ ${totale.toFixed(2)}`;
};

APP.saveItemEditCli = async function() {
    const item = APP.selectedQueueItem;
    document.querySelectorAll('.riga-qty-edit').forEach(input => {
        const idx = parseInt(input.dataset.idx);
        item.righe[idx].qty = parseInt(input.value) || 1;
    });
    document.querySelectorAll('.riga-prezzo-edit').forEach(input => {
        const idx = parseInt(input.dataset.idx);
        item.righe[idx].prezzo = parseFloat(input.value) || 0;
    });
    // Ricalcola totali
    let totNetto = 0, totIva = 0;
    item.righe.forEach(riga => {
        const imp = riga.qty * riga.prezzo;
        const aliquota = APP.getAliquotaIvaSync(riga.codIvaVendita || '22');
        totNetto += imp;
        totIva   += imp * aliquota / 100;
    });
    item.totNetto  = totNetto;
    item.totIva    = totIva;
    item.totOrdine = totNetto + totIva;
    await DB.updateQueueItem('queueOrdiniClienti', item);
    APP.showToast('Modifiche salvate', 'success');
    APP.closeItemDetailModal();
    APP.openQueueModal('ordiniClienti');
};
