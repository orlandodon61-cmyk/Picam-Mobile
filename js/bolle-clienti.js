// ==========================================
// PICAM v4.06 — bolle-clienti.js
// Modulo Bolle/DDT Clienti
// Produce: ddt-anagrafiche, ddt-testate, ddt-dettagli
// ==========================================

APP.currentBollaClienti = {
    registro:'01', numero:1, data:new Date().toISOString(),
    cliente:null, righe:[], pagamento:{codice:'',descrizione:''},
    segFat:'S', tipBol:'S', cauMag:'ven', codDep:'01',
    aspEst:'a vista', cauTra:'Vendita', tipPor:'A', tipSpe:'D',
    datIniTra:'', oraIniTra:'',
};

APP.openBolleClienti = async function() {
    APP.currentContext = 'bolleClienti';
    APP.showScreen('bolle-clienti');
    APP.updateHeaderQueueCount('bolCli');
    const oggi = new Date();
    document.getElementById('bol-cli-data').value   = APP.formatDate(oggi);
    document.getElementById('bol-cli-numero').value = APP.currentBollaClienti.numero;
    const regEl = document.getElementById('bol-cli-registro');
    if (regEl) regEl.value = APP.config.registroBolle || '01';
    APP.currentBollaClienti.cliente = null;
    APP.currentBollaClienti.righe   = [];
    APP.currentBollaClienti.pagamento = {codice:'',descrizione:''};
    APP.currentBollaClienti.datIniTra = APP.fmtDDMMYYYY(oggi);
    APP.currentBollaClienti.oraIniTra =
        oggi.getHours().toString().padStart(2,'0') +
        oggi.getMinutes().toString().padStart(2,'0');
    APP.renderSelectedClienteBolla();
    APP.renderRigheBollaClienti();
    await APP.loadPagamentiDropdownBol();
    APP.updateBtnConfermaBolCli();
};

APP.loadPagamentiDropdownBol = async function() {
    const sel = document.getElementById('bol-cli-pagamento');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleziona pagamento --</option>';
    try {
        const pags = await DB.getAllPagamenti();
        pags.forEach(p => {
            const o = document.createElement('option');
            o.value = p.codice; o.textContent = p.codice+' - '+p.descrizione;
            o.dataset.descrizione = p.descrizione; sel.appendChild(o);
        });
    } catch(e) {}
};

APP.renderSelectedClienteBolla = function() {
    const cont = document.getElementById('selected-cliente-bolla');
    const cli  = APP.currentBollaClienti.cliente;
    if (!cli) {
        cont.innerHTML = '<span>Nessun cliente selezionato</span>';
        cont.className = 'cliente-info empty'; return;
    }
    cont.className = 'cliente-info selected';
    cont.innerHTML = `<div class="soggetto-header"><div>
        <div class="soggetto-name">${cli.ragSoc1}</div>
        ${cli.ragSoc2?`<div class="soggetto-name2">${cli.ragSoc2}</div>`:''}
        <div class="soggetto-detail">${cli.indirizzo||''} - ${cli.cap||''} ${cli.localita||''} ${cli.provincia?'('+cli.provincia+')':''}</div>
        <div class="soggetto-detail">P.IVA: ${cli.partitaIva||'-'} | Tel: ${cli.telefono||'-'}</div>
        <div class="soggetto-detail">Cod: ${cli.codice}</div>
        </div><button class="btn-remove-soggetto" onclick="APP.removeClienteBolla()">✕</button></div>`;
};

APP.removeClienteBolla = function() {
    APP.currentBollaClienti.cliente = null;
    APP.renderSelectedClienteBolla();
    APP.updateBtnConfermaBolCli();
};

APP.addRigaBollaCliente = function(articolo, qty, prezzoInserito=null) {
    const prezzo = prezzoInserito!==null ? prezzoInserito : (articolo.prezzoVendita||articolo.prezzo||0);
    const ex = APP.currentBollaClienti.righe.find(r=>r.codice===articolo.codice);
    if (ex) { ex.qty+=qty; if(prezzoInserito!==null) ex.prezzo=prezzoInserito; }
    else APP.currentBollaClienti.righe.push({
        codice:articolo.codice, des1:articolo.des1||'', des2:articolo.des2||'',
        um:articolo.um||'Nr.', prezzo, codIvaVendita:articolo.codIvaVendita||'22',
        gruppo:articolo.gruppo||'', giacenza:articolo.giacenza||0, qty
    });
    APP.renderRigheBollaClienti();
    APP.updateBtnConfermaBolCli();
};

APP.removeRigaBollaCliente = function(idx) {
    APP.currentBollaClienti.righe.splice(idx,1);
    APP.renderRigheBollaClienti();
    APP.updateBtnConfermaBolCli();
};

APP.renderRigheBollaClienti = function() {
    const cont  = document.getElementById('righe-bol-cli');
    const righe = APP.currentBollaClienti.righe;
    if (!righe.length) {
        cont.innerHTML='';
        ['tot-bol-articoli','tot-bol-qta','tot-bol-imponibile','tot-bol-iva','tot-bol-totale']
            .forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=id.includes('articoli')||id.includes('qta')?'0':'€ 0,00';});
        return;
    }
    let html='', totQta=0, totImp=0, totIva=0;
    righe.forEach((r,i)=>{
        totQta+=r.qty;
        const imp=r.qty*r.prezzo;
        const ali=APP.getAliquotaIvaSync(r.codIvaVendita||'22');
        totImp+=imp; totIva+=imp*ali/100;
        html+=`<div class="riga-item">
            <div class="riga-info">
                <div class="riga-code">${r.codice}</div>
                <div class="riga-desc">${r.des1}</div>
                <div class="riga-details">
                    <span>Qta: <strong>${r.qty}</strong> ${r.um}</span>
                    <span class="riga-prezzo-badge">€ ${r.prezzo.toFixed(2).replace('.',',')}/cad</span>
                    <span class="riga-totale">€ ${imp.toFixed(2).replace('.',',')}</span>
                </div>
            </div>
            <button class="btn-remove-riga" onclick="APP.removeRigaBollaCliente(${i})">🗑️</button>
        </div>`;
    });
    cont.innerHTML=html;
    const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    s('tot-bol-articoli',righe.length); s('tot-bol-qta',totQta);
    s('tot-bol-imponibile',APP.formatCurrency(totImp));
    s('tot-bol-iva',APP.formatCurrency(totIva));
    s('tot-bol-totale',APP.formatCurrency(totImp+totIva));
};

APP.updateBtnConfermaBolCli = function() {
    const b=document.getElementById('btn-conferma-bol-cli');
    if(b) b.disabled=!(APP.currentBollaClienti.cliente&&APP.currentBollaClienti.righe.length>0);
};

// ── Opzioni DDT ───────────────────────────────────────────────────────────────
APP.apriOpzioniBollaDDT = function() {
    const b=APP.currentBollaClienti;
    const v=(id,val)=>{const e=document.getElementById(id);if(e)e.value=val;};
    v('bol-opt-seg-fat',b.segFat); v('bol-opt-tip-bol',b.tipBol);
    v('bol-opt-cau-mag',b.cauMag); v('bol-opt-cod-dep',b.codDep);
    v('bol-opt-asp-est',b.aspEst); v('bol-opt-cau-tra',b.cauTra);
    v('bol-opt-tip-por',b.tipPor); v('bol-opt-tip-spe',b.tipSpe);
    v('bol-opt-dat-tra',b.datIniTra); v('bol-opt-ora-tra',b.oraIniTra);
    document.getElementById('modal-opzioni-ddt').classList.remove('hidden');
};

APP.salvaOpzioniBollaDDT = function() {
    const g=id=>(document.getElementById(id)?.value||'').trim();
    const b=APP.currentBollaClienti;
    b.segFat=g('bol-opt-seg-fat')||'S'; b.tipBol=g('bol-opt-tip-bol')||'S';
    b.cauMag=g('bol-opt-cau-mag')||'ven'; b.codDep=g('bol-opt-cod-dep')||'01';
    b.aspEst=g('bol-opt-asp-est'); b.cauTra=g('bol-opt-cau-tra');
    b.tipPor=g('bol-opt-tip-por')||'A'; b.tipSpe=g('bol-opt-tip-spe')||'D';
    b.datIniTra=g('bol-opt-dat-tra'); b.oraIniTra=g('bol-opt-ora-tra');
    document.getElementById('modal-opzioni-ddt').classList.add('hidden');
};

APP.chiudiOpzioniBollaDDT = function() {
    document.getElementById('modal-opzioni-ddt').classList.add('hidden');
};

// ── Conferma bolla ────────────────────────────────────────────────────────────
APP.confermaBollaCliente = async function() {
    const bolla = APP.currentBollaClienti;
    if (!bolla.cliente||!bolla.righe.length) {
        APP.showToast('Bolla incompleta', 'error'); return;
    }
    let totNetto=0, totIva=0;
    for (const r of bolla.righe) {
        const imp=r.qty*r.prezzo;
        const ali=await APP.getAliquotaIva(r.codIvaVendita||'22');
        totNetto+=imp; totIva+=imp*ali/100;
    }
    const pagSel=document.getElementById('bol-cli-pagamento');
    const bollaCompleta = {
        tipo:'bolla',
        registro:document.getElementById('bol-cli-registro')?.value||'01',
        numero:parseInt(document.getElementById('bol-cli-numero')?.value)||1,
        data:new Date().toISOString(),
        cliente:{...bolla.cliente}, righe:[...bolla.righe],
        pagamento:{codice:pagSel?.value||'', descrizione:pagSel?.selectedOptions[0]?.dataset?.descrizione||''},
        segFat:bolla.segFat, tipBol:bolla.tipBol,
        cauMag:bolla.cauMag, codDep:bolla.codDep,
        aspEst:bolla.aspEst, cauTra:bolla.cauTra,
        tipPor:bolla.tipPor, tipSpe:bolla.tipSpe,
        datIniTra:bolla.datIniTra, oraIniTra:bolla.oraIniTra,
        totNetto, totIva, totBolla:totNetto+totIva,
        timestamp:Date.now()
    };
    await DB.addToQueue('queueBolleClienti', bollaCompleta);
    try { await DB.addToStorico('storicoBolleClienti', bollaCompleta); } catch(e){}
    APP.currentBollaClienti.numero = bollaCompleta.numero+1;
    localStorage.setItem('picam_bolle_last_num', bollaCompleta.numero.toString());
    APP.currentBollaClienti.cliente=null; APP.currentBollaClienti.righe=[];
    APP.renderSelectedClienteBolla(); APP.renderRigheBollaClienti();
    document.getElementById('bol-cli-numero').value=APP.currentBollaClienti.numero;
    APP.updateBtnConfermaBolCli();
    APP.updateHeaderQueueCount('bolCli');
    APP.updateBadges();
    APP.showToast(`Bolla ${bollaCompleta.registro}/${bollaCompleta.numero} aggiunta alla coda`,'success');
};

// ── Dettaglio bolla in coda ───────────────────────────────────────────────────
APP.openItemDetailBolleClienti = function() {
    const item=APP.selectedQueueItem;
    const modal=document.getElementById('modal-item-detail');
    const titleEl=document.getElementById('item-detail-title');
    const contentEl=document.getElementById('item-detail-content');
    const actionsEl=document.getElementById('item-detail-actions');
    let tot=0;
    const righeHtml=item.righe.map((r,i)=>{
        const t=r.qty*r.prezzo; tot+=t;
        return `<div class="riga-detail riga-detail-cliente">
            <div class="riga-info">
                <span class="riga-cod">${r.codice}</span>
                <span class="riga-desc">${r.des1.substring(0,28)}</span>
            </div>
            <div class="riga-inputs">
                <label>Qtà:</label>
                <input type="number" class="riga-qty-edit" data-idx="${i}" value="${r.qty}" min="1" style="width:60px" onchange="APP.updateBollaTotaleCli()">
                <label>Prezzo:</label>
                <input type="number" class="riga-prezzo-edit" data-idx="${i}" value="${r.prezzo.toFixed(2)}" step="0.01" min="0" style="width:80px;background:#e8f5e9" onchange="APP.updateRigaTotaleBolla(${i})">
                <span class="riga-tot" id="riga-tot-bol-${i}">€ ${t.toFixed(2)}</span>
            </div></div>`;
    }).join('');
    titleEl.textContent=`📦 Bolla ${item.registro}/${item.numero}`;
    contentEl.innerHTML=`
        <div class="detail-row"><label>Cliente:</label><span>${item.cliente.ragSoc1}</span></div>
        <div class="detail-row"><label>Data:</label><span>${APP.formatDate(new Date(item.data))}</span></div>
        <div class="detail-row"><label>Tipo bolla:</label><span>${item.tipBol==='S'?'Scarico':'Carico'}</span></div>
        <div class="detail-row"><label>Causale tra.:</label><span>${item.cauTra||'-'}</span></div>
        <div class="detail-row"><label>Aspetto:</label><span>${item.aspEst||'-'}</span></div>
        <div class="detail-row"><label>Porto:</label><span>${item.tipPor==='A'?'Assegnato':'Franco'}</span></div>
        <div class="detail-row"><label>Totale:</label><span id="order-total-bol">€ ${tot.toFixed(2)}</span></div>
        ${item.synced?'<div class="sync-warning">⚠️ Già sincronizzato su Drive</div>':''}
        <h4>Righe bolla:</h4><div class="righe-list">${righeHtml}</div>`;
    actionsEl.innerHTML='';
    const addBtn=(label,fn,cls)=>{const b=document.createElement('button');b.className=cls||'btn-secondary';b.textContent=label;b.onclick=fn;actionsEl.appendChild(b);};
    addBtn('💾 Salva',APP.saveItemEditBolla,'btn-primary');
    addBtn('🗑️ Elimina',APP.deleteQueueItem,'btn-danger');
    addBtn('Chiudi',APP.closeItemDetailModal);
    modal.classList.remove('hidden');
};

APP.updateRigaTotaleBolla = function(idx) {
    const q=document.querySelector(`.riga-qty-edit[data-idx="${idx}"]`);
    const p=document.querySelector(`.riga-prezzo-edit[data-idx="${idx}"]`);
    const t=document.getElementById(`riga-tot-bol-${idx}`);
    if(q&&p&&t){t.textContent=`€ ${((parseFloat(q.value)||0)*(parseFloat(p.value)||0)).toFixed(2)}`;APP.updateBollaTotaleCli();}
};

APP.updateBollaTotaleCli = function() {
    let tot=0;
    document.querySelectorAll('.riga-qty-edit').forEach(q=>{
        const p=document.querySelector(`.riga-prezzo-edit[data-idx="${q.dataset.idx}"]`);
        tot+=(parseFloat(q.value)||0)*(p?parseFloat(p.value)||0:0);
    });
    const el=document.getElementById('order-total-bol');
    if(el) el.textContent=`€ ${tot.toFixed(2)}`;
};

APP.saveItemEditBolla = async function() {
    const item=APP.selectedQueueItem;
    document.querySelectorAll('.riga-qty-edit').forEach(q=>{item.righe[parseInt(q.dataset.idx)].qty=parseInt(q.value)||1;});
    document.querySelectorAll('.riga-prezzo-edit').forEach(p=>{item.righe[parseInt(p.dataset.idx)].prezzo=parseFloat(p.value)||0;});
    let totNetto=0,totIva=0;
    item.righe.forEach(r=>{const imp=r.qty*r.prezzo;totNetto+=imp;totIva+=imp*APP.getAliquotaIvaSync(r.codIvaVendita||'22')/100;});
    item.totNetto=totNetto; item.totIva=totIva; item.totBolla=totNetto+totIva;
    await DB.updateQueueItem('queueBolleClienti',item);
    APP.showToast('Modifiche salvate','success');
    APP.closeItemDetailModal();
    APP.openQueueModal('bolleClienti');
};

// ── Helper date ────────────────────────────────────────────────────────────────
APP.fmtDDMMYYYY = function(d) {
    if(!(d instanceof Date)) d=new Date(d);
    return d.getDate().toString().padStart(2,'0')+(d.getMonth()+1).toString().padStart(2,'0')+d.getFullYear();
};
APP.fmtDDMMYYYYslash = function(d) {
    if(!(d instanceof Date)) d=new Date(d);
    return d.getDate().toString().padStart(2,'0')+'/'+(d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getFullYear();
};
