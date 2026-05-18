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
    const item    = APP.selectedQueueItem;
    const modal   = document.getElementById('modal-item-detail');
    const titleEl = document.getElementById('item-detail-title');
    const contEl  = document.getElementById('item-detail-content');
    const actEl   = document.getElementById('item-detail-actions');
    if (!modal || !item) return;

    titleEl.textContent = `🛒 Ordine ${item.registro||'01'}/${item.numero}`;
    APP._renderOrdineCliDetailContent(item, contEl);

    actEl.innerHTML = '';
    const btn = (lbl, fn, cls) => {
        const b = document.createElement('button');
        b.className = cls || 'btn-secondary';
        b.textContent = lbl; b.onclick = fn;
        actEl.appendChild(b);
    };
    btn('💾 Salva',              APP.saveItemEditCli,          'btn-primary');
    btn('🖨️ PDF con prezzi',     () => APP.printOrdineCliente(true));
    btn('🖨️ PDF senza prezzi',   () => APP.printOrdineCliente(false));
    btn('📤 Condividi',          APP.shareOrdineCliente);
    btn('📱 Stampa Mobile',      APP.printMobileOrdine);
    btn('🗑️ Elimina ordine',    APP.deleteQueueItem,          'btn-danger');
    btn('✕ Chiudi',              APP.closeItemDetailModal);
    modal.classList.remove('hidden');
};

APP._renderOrdineCliDetailContent = function(item, contEl) {
    let tot = 0;
    const righeHtml = (item.righe || []).map((r, i) => {
        const t = (Number(r.qty)||0) * (Number(r.prezzo)||0); tot += t;
        return `<div class="riga-detail riga-detail-cliente">
          <div class="riga-info" style="flex:1">
            <div style="display:flex;gap:6px;align-items:baseline">
              <span class="riga-cod">${r.codice}</span>
              <span class="riga-desc" style="font-size:11px">${(r.des1||'').substring(0,25)}</span>
            </div>
            <div class="riga-inputs" style="margin-top:4px">
              <label style="font-size:10px">Qtà:</label>
              <input type="number" class="riga-qty-edit" data-idx="${i}"
                     value="${r.qty}" min="1" step="1" style="width:55px"
                     onchange="APP.updateRigaTotaleCli(${i})">
              <label style="font-size:10px">Prezzo:</label>
              <input type="number" class="riga-prezzo-edit" data-idx="${i}"
                     value="${Number(r.prezzo||0).toFixed(4)}" step="0.0001" min="0"
                     style="width:85px;background:#e8f5e9"
                     onchange="APP.updateRigaTotaleCli(${i})">
              <span class="riga-tot" id="riga-tot-cli-${i}">€ ${t.toFixed(2)}</span>
            </div>
          </div>
          <button class="btn-remove-riga" onclick="APP.deleteRigaOrdineCliDetail(${i})"
                  style="color:#c62828">🗑️</button>
        </div>`;
    }).join('');

    contEl.innerHTML = `
        <div class="detail-row"><label>Cliente:</label>
            <span>${item.cliente?.ragSoc1||''}</span></div>
        <div class="detail-row"><label>Data:</label>
            <span>${item.data ? APP.formatDate(new Date(item.data)) : ''}</span></div>
        <div class="detail-row"><label>Pagamento:</label>
            <span>${item.pagamento?.descrizione||item.pagamento?.codice||'-'}</span></div>
        <div class="detail-row"><label>Totale:</label>
            <strong><span id="order-total-cli">€ ${tot.toFixed(2)}</span></strong></div>
        ${item.synced ? '<div class="sync-warning">⚠️ Già sincronizzato su Drive</div>' : ''}
        <h4 style="margin:10px 0 4px">Righe ordine:</h4>
        <div class="righe-list" id="ordcli-detail-righe">${righeHtml}</div>
        <!-- Aggiungi articolo inline -->
        <div style="margin-top:10px;padding:8px;background:#f0f4ff;border-radius:8px">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px">➕ Aggiungi articolo</div>
          <div style="display:flex;gap:6px">
            <input type="text" id="ordcli-det-search-art"
                   placeholder="Codice o descrizione..."
                   style="flex:1;padding:6px;border:1px solid #ccc;border-radius:6px;font-size:12px"
                   oninput="APP.searchArtOrdCliDetail(this.value)">
          </div>
          <div id="ordcli-det-art-results"
               style="max-height:120px;overflow-y:auto;margin-top:4px"></div>
        </div>`;
};

// ── Elimina riga ordine in editing ────────────────────────────────────────────
APP.deleteRigaOrdineCliDetail = function(idx) {
    const item = APP.selectedQueueItem;
    if (!item) return;
    item.righe.splice(idx, 1);
    APP._renderOrdineCliDetailContent(item, document.getElementById('item-detail-content'));
};

// ── Cerca articolo nell'editor ordine inline ──────────────────────────────────
APP.searchArtOrdCliDetail = async function(query) {
    const el = document.getElementById('ordcli-det-art-results');
    if (!el || !query || query.length < 2) { if(el) el.innerHTML=''; return; }
    try {
        const risultati = await DB.searchArticoli(query);
        el.innerHTML = risultati.slice(0,10).map(a =>
            `<div style="padding:5px 8px;cursor:pointer;font-size:12px;border-bottom:1px solid #eee"
                  onmousedown="APP.addArtOrdCliDetail('${a.codice}')">
              <strong>${a.codice}</strong> — ${(a.des1||'').substring(0,30)}
              <span style="color:#2e7d32;margin-left:8px">€ ${Number(a.prezzo||0).toFixed(2)}</span>
            </div>`
        ).join('') || '<p style="padding:6px;color:#999;font-size:12px">Nessun risultato</p>';
    } catch(e) { el.innerHTML=''; }
};

// ── Aggiunge articolo all'ordine dall'editor inline ───────────────────────────
APP.addArtOrdCliDetail = async function(codice) {
    const item = APP.selectedQueueItem;
    if (!item) return;
    try {
        const risultati = await DB.searchArticoli(codice);
        const a = risultati.find(x => x.codice === codice);
        if (!a) return;
        item.righe.push({
            codice: a.codice, des1: a.des1||'', des2: a.des2||'',
            um: a.um||'Nr.', prezzo: a.prezzo||0,
            codIvaVendita: a.codIvaVendita||'22',
            gruppo: a.gruppo||'', qty: 1,
        });
        const inp = document.getElementById('ordcli-det-search-art');
        const res = document.getElementById('ordcli-det-art-results');
        if (inp) inp.value = '';
        if (res) res.innerHTML = '';
        APP._renderOrdineCliDetailContent(item, document.getElementById('item-detail-content'));
    } catch(e) { APP.showToast('Errore aggiunta articolo','error'); }
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
    // Aggiorna qty e prezzo da tutti i campi visibili
    document.querySelectorAll('.riga-qty-edit').forEach(input => {
        const idx = parseInt(input.dataset.idx);
        if (!isNaN(idx) && item.righe[idx]) item.righe[idx].qty = parseFloat(input.value) || 0;
    });
    document.querySelectorAll('.riga-prezzo-edit').forEach(input => {
        const idx = parseInt(input.dataset.idx);
        if (!isNaN(idx) && item.righe[idx]) item.righe[idx].prezzo = parseFloat(input.value) || 0;
    });
    // Ricalcola totali
    let totNetto = 0, totIva = 0;
    item.righe.forEach(r => {
        const imp = (r.qty||0) * (r.prezzo||0);
        totNetto += imp;
        totIva   += imp * APP.getAliquotaIvaSync(r.codIvaVendita || '22') / 100;
    });
    item.totNetto  = totNetto;
    item.totIva    = totIva;
    item.totOrdine = totNetto + totIva;
    await DB.updateQueueItem('queueOrdiniClienti', item);
    APP.showToast('Modifiche salvate', 'success');
    APP.closeItemDetailModal();
    APP.openQueueModal('ordiniClienti');
};
