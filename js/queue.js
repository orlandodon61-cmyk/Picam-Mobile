// ==========================================
// PICAM v4.0 - queue.js
// Gestione coda: modal coda, storico, dettaglio elemento, delete
// ==========================================

APP.queueData = [];
APP.storicoData = [];
APP.currentQueueTab = 'coda';
APP.selectedQueueIndex = null;
APP.selectedQueueItem = null;
APP.queueDataFiltered = null;

APP.openQueueModal = async function(context) {
    APP.queueContext = context;
    APP.currentQueueTab = 'coda';
    APP.queueDataFiltered = null;

    const modal = document.getElementById('modal-queue');
    const titleEl = document.getElementById('queue-modal-title');

    const titles = { inventario: '📋 Inventario', ordiniClienti: '🛒 Ordini Clienti', ordiniFornitori: '🏭 Ordini Fornitori' };
    titleEl.textContent = titles[context] || 'Gestione';

    // Filtri: mostra/nascondi in base al contesto
    const invFilters = document.getElementById('inv-gestione-filters');
    const searchBar  = document.getElementById('queue-search-bar');
    if (invFilters) invFilters.style.display = context === 'inventario' ? 'flex' : 'none';
    if (searchBar)  searchBar.style.display  = context !== 'inventario' ? 'block' : 'none';

    modal.classList.remove('hidden');
    APP.switchQueueTab('coda');
};

APP.loadQueueData = async function() {
    const storeMap = { inventario: 'queueInventario', ordiniClienti: 'queueOrdiniClienti', ordiniFornitori: 'queueOrdiniFornitori' };
    const storeName = storeMap[APP.queueContext];
    APP.queueData = storeName ? await DB.getQueue(storeName) : [];
};

APP.loadStoricoData = async function() {
    const storeMap = { inventario: null, ordiniClienti: 'storicoOrdiniClienti', ordiniFornitori: 'storicoOrdiniFornitori' };
    const storeName = storeMap[APP.queueContext];
    APP.storicoData = storeName ? (await DB.getStorico(storeName).catch(() => [])) : [];
};

APP.updateQueueTabBadges = function() {
    const qCount = (APP.queueDataFiltered || APP.queueData).length;
    const sCount = APP.storicoData.length;
    const tabCoda    = document.getElementById('tab-coda-count');
    const tabStorico = document.getElementById('tab-storico-count');
    if (tabCoda)    tabCoda.textContent    = qCount;
    if (tabStorico) tabStorico.textContent = sCount;
};

APP.switchQueueTab = async function(tab) {
    APP.currentQueueTab = tab;
    document.querySelectorAll('.queue-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.queue-tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-content-${tab}`));

    await APP.loadQueueData();
    await APP.loadStoricoData();
    APP.updateQueueTabBadges();

    if (tab === 'coda') {
        if (APP.queueContext === 'inventario') await APP.loadInvFilters();
        APP.renderQueueList();
    } else {
        APP.renderStoricoList();
    }
};

APP.renderQueueList = async function(data = null) {
    const list     = document.getElementById('queue-list');
    const countEl  = document.getElementById('queue-count');
    const actionsEl = document.getElementById('queue-actions');
    if (!list) return;

    const items = data || APP.queueDataFiltered || APP.queueData;
    countEl.textContent = `${items.length} elementi`;

    if (items.length === 0) {
        list.innerHTML = '<div class="queue-empty">Nessun elemento in coda</div>';
        actionsEl.innerHTML = '';
        return;
    }

    let html = '';
    const context = APP.queueContext;

    items.forEach((item, index) => {
        if (context === 'inventario') {
            html += `
                <div class="queue-item" onclick="APP.selectQueueItem(${index})">
                    <div class="queue-item-main">
                        <span class="qi-code">${item.codice}</span>
                        <span class="qi-desc">${(item.des1||'').substring(0,30)}</span>
                    </div>
                    <div class="queue-item-sub">
                        Loc: ${item.locazione||'-'} &nbsp;|&nbsp; Qty: <strong>${item.qty}</strong>
                    </div>
                </div>`;
        } else {
            const sogg = context === 'ordiniClienti' ? item.cliente : item.fornitore;
            const syncIcon = item.synced ? '✅' : '⏳';
            html += `
                <div class="queue-item" onclick="APP.selectQueueItem(${index})">
                    <div class="queue-item-main">
                        <span class="qi-registro">${item.registro}/${item.numero}</span>
                        <span class="qi-sogg">${sogg?.ragSoc1 || '-'}</span>
                        <span class="qi-sync">${syncIcon}</span>
                    </div>
                    <div class="queue-item-sub">
                        ${APP.formatDate(new Date(item.data))} &nbsp;|&nbsp;
                        ${item.righe?.length || 0} art. &nbsp;|&nbsp;
                        ${APP.formatCurrency(item.totOrdine || item.righe?.reduce((s,r)=>s+r.qty*r.prezzo,0) || 0)}
                    </div>
                </div>`;
        }
    });

    list.innerHTML = html;

    // Azioni
    actionsEl.innerHTML = `
        <button class="btn-primary" onclick="APP.syncQueue('${context}')">☁️ Sincronizza su Drive</button>
        ${context !== 'inventario' ? `<button class="btn-secondary" onclick="APP.generateReport('${context}')">📄 Report PDF</button>` : ''}
        <button class="btn-danger" onclick="APP.clearQueue('${context}')">🗑️ Svuota Coda</button>`;
};

APP.loadInvFilters = async function() {
    try {
        const locazioni = await DB.getAllLocazioni();
        const gruppi = await DB.getAllGruppiMerceologici();
        const locSel = document.getElementById('inv-filter-locazione');
        const grpSel = document.getElementById('inv-filter-gruppo');
        if (locSel) {
            locSel.innerHTML = '<option value="">📍 Tutte le locazioni</option>';
            locazioni.forEach(l => { locSel.innerHTML += `<option value="${l.codice}">${l.codice}</option>`; });
        }
        if (grpSel) {
            grpSel.innerHTML = '<option value="">📦 Tutti i gruppi</option>';
            gruppi.forEach(g => { grpSel.innerHTML += `<option value="${g.codice}">${g.codice} - ${g.descrizione}</option>`; });
        }
    } catch(e) {}
};

APP.filterInventarioQueue = async function() {
    const loc = document.getElementById('inv-filter-locazione')?.value || '';
    const grp = document.getElementById('inv-filter-gruppo')?.value || '';
    if (!loc && !grp) {
        APP.queueDataFiltered = null;
    } else {
        APP.queueDataFiltered = APP.queueData.filter(item => {
            if (loc && item.locazione !== loc) return false;
            if (grp && item.gruppo !== grp) return false;
            return true;
        });
    }
    APP.renderQueueList();
};

APP.filterQueueList = function() {
    const q = (document.getElementById('queue-search-input')?.value || '').toLowerCase();
    if (!q) { APP.queueDataFiltered = null; APP.renderQueueList(); return; }
    const isFor = APP.queueContext === 'ordiniFornitori';
    APP.queueDataFiltered = APP.queueData.filter(item => {
        const sogg = isFor ? item.fornitore : item.cliente;
        return (sogg?.ragSoc1 || '').toLowerCase().includes(q) ||
               `${item.registro}/${item.numero}`.includes(q);
    });
    APP.renderQueueList();
};

APP.selectQueueItem = function(index) {
    const items = APP.queueDataFiltered || APP.queueData;
    const item = items[index];
    if (!item) return;
    APP.selectedQueueIndex = index;
    APP.selectedQueueItem = item;
    APP.openItemDetailModal();
};

APP.openItemDetailModal = function() {
    const item = APP.selectedQueueItem;
    const context = APP.queueContext;

    if (context === 'inventario') {
        APP.openItemDetailInventario();
    } else if (context === 'ordiniClienti') {
        APP.openItemDetailClienti();
    } else if (context === 'ordiniFornitori') {
        APP.openItemDetailFornitori();
    }
};

APP.openItemDetailInventario = function() {
    const item = APP.selectedQueueItem;
    const modal = document.getElementById('modal-item-detail');
    document.getElementById('item-detail-title').textContent = '📦 Dettaglio Articolo';
    document.getElementById('item-detail-content').innerHTML = `
        <div class="detail-row"><label>Codice:</label><span>${item.codice}</span></div>
        <div class="detail-row"><label>Descrizione:</label><span>${item.des1||'-'}</span></div>
        <div class="detail-row"><label>Locazione:</label><span>${item.locazione||'-'}</span></div>
        <div class="detail-row editable">
            <label>Quantità:</label>
            <input type="number" id="edit-qty" value="${item.qty}" min="1">
        </div>
        ${item.synced ? '<div class="sync-warning">⚠️ Già sincronizzato su Google Drive</div>' : ''}`;
    document.getElementById('item-detail-actions').innerHTML = `
        <button class="btn-primary" onclick="APP.saveItemEdit()">💾 Salva</button>
        <button class="btn-danger" onclick="APP.deleteQueueItem()">🗑️ Elimina</button>
        <button class="btn-secondary" onclick="APP.closeItemDetailModal()">Chiudi</button>`;
    modal.classList.remove('hidden');
};

APP.closeItemDetailModal = function() {
    document.getElementById('modal-item-detail').classList.add('hidden');
    APP.selectedQueueIndex = null;
    APP.selectedQueueItem = null;
};

APP.saveItemEdit = async function() {
    const context = APP.queueContext;
    const item = APP.selectedQueueItem;
    let storeName;

    if (context === 'inventario') {
        storeName = 'queueInventario';
        item.qty = parseInt(document.getElementById('edit-qty').value) || 1;
    } else if (context === 'ordiniClienti') {
        storeName = 'queueOrdiniClienti';
        // Per ordini clienti usa saveItemEditCli (gestisce anche prezzi)
        APP.saveItemEditCli(); return;
    } else if (context === 'ordiniFornitori') {
        storeName = 'queueOrdiniFornitori';
        document.querySelectorAll('.riga-qty-edit').forEach(inp => {
            item.righe[parseInt(inp.dataset.idx)].qty = parseInt(inp.value) || 1;
        });
        document.querySelectorAll('.riga-prezzo-edit').forEach(inp => {
            item.righe[parseInt(inp.dataset.idx)].prezzo = parseFloat(inp.value) || 0;
        });
        // Ricalcola totali
        let totNetto = 0, totIva = 0;
        item.righe.forEach(r => {
            const imp = r.qty * r.prezzo;
            totNetto += imp;
            totIva   += imp * APP.getAliquotaIvaSync(r.codIvaAcquisto||'22') / 100;
        });
        item.totNetto = totNetto; item.totIva = totIva; item.totOrdine = totNetto + totIva;
    }

    await DB.updateQueueItem(storeName, item);
    APP.showToast('Modifiche salvate', 'success');
    APP.closeItemDetailModal();
    APP.openQueueModal(context);
};

APP.deleteQueueItem = async function() {
    if (!confirm('Vuoi eliminare questo elemento?')) return;
    const context = APP.queueContext;
    const item = APP.selectedQueueItem;
    const storeMap = { inventario: 'queueInventario', ordiniClienti: 'queueOrdiniClienti', ordiniFornitori: 'queueOrdiniFornitori' };
    await DB.deleteFromQueue(storeMap[context], item.id || item.timestamp);
    APP.showToast('Elemento eliminato', 'success');
    APP.closeItemDetailModal();
    APP.updateBadges();
    const queue = await DB.getQueue(storeMap[context]);
    if (queue.length === 0) { APP.closeQueueModal(); } else { APP.openQueueModal(context); }
};

APP.clearQueue = async function(context) {
    if (!confirm('Vuoi svuotare la coda?')) return;
    const storeMap = { inventario: 'queueInventario', ordiniClienti: 'queueOrdiniClienti', ordiniFornitori: 'queueOrdiniFornitori' };
    await DB.clearQueue(storeMap[context]);
    APP.updateBadges();
    APP.closeQueueModal();
    APP.showToast('Coda svuotata', 'success');
};

APP.closeQueueModal = function() {
    document.getElementById('modal-queue').classList.add('hidden');
    APP.queueContext = null;
    APP.queueData = [];
};

// ---------- STORICO ----------

APP.renderStoricoList = function(filteredData = null) {
    const list = document.getElementById('storico-list');
    if (!list) return;
    const items = filteredData || APP.storicoData;
    if (items.length === 0) { list.innerHTML = '<div class="queue-empty">Nessun ordine nello storico</div>'; return; }
    const isFor = APP.queueContext === 'ordiniFornitori';
    list.innerHTML = items.map((item, i) => {
        const sogg = isFor ? item.fornitore : item.cliente;
        return `<div class="storico-item" onclick="APP.showStoricoDetail(${item.id || i})">
            <div class="si-main">
                <span class="si-registro">${item.registro}/${item.numero}</span>
                <span class="si-sogg">${sogg?.ragSoc1||'-'}</span>
            </div>
            <div class="si-sub">${APP.formatDate(new Date(item.data))} | ${item.righe?.length||0} art. | ${APP.formatCurrency(item.totOrdine||0)}</div>
        </div>`;
    }).join('');
};

APP.searchStorico = function() {
    const q = (document.getElementById('storico-search-input')?.value||'').toLowerCase();
    const dateFrom = document.getElementById('storico-date-from')?.value;
    const dateTo   = document.getElementById('storico-date-to')?.value;
    let filtered = APP.storicoData;
    if (q) {
        const isFor = APP.queueContext === 'ordiniFornitori';
        filtered = filtered.filter(item => {
            const sogg = isFor ? item.fornitore : item.cliente;
            return (sogg?.ragSoc1||'').toLowerCase().includes(q) ||
                   `${item.registro}/${item.numero}`.includes(q);
        });
    }
    if (dateFrom) filtered = filtered.filter(item => new Date(item.data) >= new Date(dateFrom));
    if (dateTo)   filtered = filtered.filter(item => new Date(item.data) <= new Date(dateTo + 'T23:59:59'));
    APP.renderStoricoList(filtered);
};

APP.showStoricoDetail = async function(id) {
    const item = APP.storicoData.find(o => (o.id || APP.storicoData.indexOf(o)) === id);
    if (!item) return;
    APP.selectedQueueItem = item;
    APP.openItemDetailModal();
};

APP.clearStoricoConfirm = function() {
    if (!confirm('Vuoi cancellare tutto lo storico?')) return;
    APP.clearStorico();
};

APP.clearStorico = async function() {
    const storeMap = { ordiniClienti: 'storicoOrdiniClienti', ordiniFornitori: 'storicoOrdiniFornitori' };
    const storeName = storeMap[APP.queueContext];
    if (!storeName) return;
    await DB.clearStorico(storeName);
    APP.storicoData = [];
    APP.renderStoricoList();
    APP.showToast('Storico cancellato', 'success');
};
