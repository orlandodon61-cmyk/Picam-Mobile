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
    // Nuovi campi
    codAgente:'', scontoGlobale:0, destDiverso:null,
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
    APP.currentBollaClienti.scontoGlobale = 0;
    APP.currentBollaClienti.destDiverso   = null;
    APP.currentBollaClienti.codAgente     = APP.config.codAgente || '';
    // Popola campo agente nell'UI
    const agenteEl = document.getElementById('bol-cli-agente');
    if (agenteEl) agenteEl.value = APP.config.codAgente || '';
    const scontoEl = document.getElementById('bol-cli-sconto');
    if (scontoEl) scontoEl.value = '';
    // Chiude destinatario diverso
    const dds = document.getElementById('dest-diverso-section');
    if (dds) dds.style.display = 'none';
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
    v('bol-opt-agente',  b.codAgente || APP.config.codAgente || '');
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
    b.codAgente=g('bol-opt-agente');
    // Aggiorna anche il campo agente visibile nel form principale
    const aEl=document.getElementById('bol-cli-agente'); if(aEl) aEl.value=b.codAgente;
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
    // Legge agente, sconto e destinatario diverso dall'UI
    const agenteEl = document.getElementById('bol-cli-agente');
    if (agenteEl) bolla.codAgente = agenteEl.value.trim();
    const scontoEl = document.getElementById('bol-cli-sconto');
    if (scontoEl) bolla.scontoGlobale = APP.parseScontoInput(scontoEl.value);
    APP.leggiDestDiverso();

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
    addBtn('🖨️ PDF Bolla',APP.stampaBollaPDF);
    addBtn('📤 Condividi',APP.condividiBollaPDF);
    addBtn('📱 Stampa Mobile',APP.printMobileBolla);
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

// ── Destinatario diverso ──────────────────────────────────────────────────────
APP.toggleDestDiverso = function() {
    const s = document.getElementById('dest-diverso-section');
    if (!s) return;
    const aperto = s.style.display !== 'none';
    s.style.display = aperto ? 'none' : 'block';
    if (aperto) {
        // Chiude: cancella destinatario diverso
        APP.currentBollaClienti.destDiverso = null;
    }
};

APP.leggiDestDiverso = function() {
    const g = id => (document.getElementById(id)?.value || '').trim();
    const ragSoc = g('dest-rag-soc');
    if (!ragSoc) { APP.currentBollaClienti.destDiverso = null; return; }
    APP.currentBollaClienti.destDiverso = {
        ragSoc, ind: g('dest-ind'), cap: g('dest-cap'),
        loc: g('dest-loc'), pro: g('dest-pro')
    };
};

// ── Sconto globale ────────────────────────────────────────────────────────────
APP.parseScontoInput = function(val) {
    // Accetta: "-3", "-3,50", "3", "3.5"
    val = String(val || '').replace(',','.').trim();
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

APP.aggiornaRigheBollaConSconto = function() {
    // Aggiorna solo il display — lo sconto viene applicato alla conferma riga
    const val = document.getElementById('bol-cli-sconto')?.value || '';
    APP.currentBollaClienti.scontoGlobale = APP.parseScontoInput(val);
    APP.renderRigheBollaClienti();
};

// ──────────────────────────────────────────────────────────────────────────────
// SEZIONE PDF E STAMPA TERMICA — Bolle / DDT Clienti
// Layout fedele al report Crystal Reports L_ibclafim
// ──────────────────────────────────────────────────────────────────────────────

// ── Genera PDF bolla (jsPDF, layout A4) ──────────────────────────────────────
APP.generateBollaPDF = async function(bolla) {
    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const PW   = 210;   // larghezza pagina mm
    const ML   = 10;    // margine sinistro
    const MR   = 200;   // margine destro
    const W    = MR - ML;

    const cli  = bolla.cliente || {};
    const dest = bolla.destDiverso || cli;
    const datBol = bolla.data ? new Date(bolla.data).toLocaleDateString('it-IT') : '';

    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    const lh  = 4;  // line height mm
    let   y   = 10;

    // ── Helper ───────────────────────────────────────────────────────────────
    const str   = (v,max) => { const s=String(v||''); return max?s.substring(0,max):s; };
    const line  = (x1,y1,x2,y2) => { doc.line(x1,y1,x2,y2); };
    const rect  = (x,y,w,h) => { doc.rect(x,y,w,h); };
    const txt   = (s,x,y2,align,size) => {
        if(size) doc.setFontSize(size);
        doc.text(str(s),x,y2,{align:align||'left',baseline:'middle'});
        if(size) doc.setFontSize(7);
    };
    const bold  = (on) => doc.setFont('helvetica', on?'bold':'normal');
    const cell  = (s,x,y2,w2,h2,align) => {
        doc.rect(x,y2,w2,h2);
        txt(str(s),align==='right'?x+w2-1:align==='center'?x+w2/2:x+1, y2+h2/2, align||'left');
    };
    const label = (s,x,y2,w2,h2) => {
        doc.setFillColor(230,230,230);
        doc.rect(x,y2,w2,h2,'F');
        doc.rect(x,y2,w2,h2);
        doc.setFontSize(5.5);
        txt(str(s),x+0.5,y2+h2/2);
        doc.setFontSize(7);
    };

    // ── SEZIONE 1: Destinatario e Intestatario (box in alto) ─────────────────
    const boxH = 22;
    const boxW = (W - 4) / 2;
    // Box Destinatario
    rect(ML, y, boxW, boxH);
    doc.setFontSize(5.5); doc.setTextColor(100,100,100);
    txt('DESTINATARIO MERCE', ML+1, y+3);
    doc.setTextColor(0,0,0); doc.setFontSize(8); bold(true);
    txt(str(dest.ragSoc1||dest.ragSoc||'', 35), ML+1, y+7);
    if (dest.ragSoc2||dest.ragSoc_2)
        txt(str(dest.ragSoc2||dest.ragSoc_2||'',35), ML+1, y+11);
    bold(false); doc.setFontSize(7);
    txt(str(dest.indirizzo||dest.ind||'',35), ML+1, y+15);
    txt(str((dest.cap||'')+' '+(dest.localita||dest.loc||'')+' '+(dest.provincia||dest.pro?'('+( dest.provincia||dest.pro)+')':''),35), ML+1, y+19);

    // Box Intestatario
    const bx2 = ML + boxW + 4;
    rect(bx2, y, boxW, boxH);
    doc.setFontSize(5.5); doc.setTextColor(100,100,100);
    txt('INTESTATARIO DOCUMENTO', bx2+1, y+3);
    doc.setTextColor(0,0,0); doc.setFontSize(8); bold(true);
    txt(str(cli.ragSoc1||'',35), bx2+1, y+7);
    if (cli.ragSoc2) txt(str(cli.ragSoc2,35), bx2+1, y+11);
    bold(false); doc.setFontSize(7);
    txt(str(cli.indirizzo||'',35), bx2+1, y+15);
    txt(str((cli.cap||'')+' '+(cli.localita||'')+' '+(cli.provincia?'('+cli.provincia+')':''),35), bx2+1, y+19);

    y += boxH + 3;

    // ── SEZIONE 2: Intestazione documento (riga dati) ─────────────────────────
    const rh = 8;  // row height
    const colsHead = [
        {l:'COD.CLI.',          v:str(cli.codice),      w:14, a:'center'},
        {l:'PARTITA IVA CLI.',  v:str(cli.partitaIva),  w:28, a:'center'},
        {l:'CODICE FISCALE CLI.',v:str(cli.codFiscale||cli.partitaIva), w:28, a:'center'},
        {l:'AGENTE',            v:str(bolla.codAgente), w:24, a:'center'},
        {l:'TIPO DOCUMENTO',    v:'DOCUM. DI TRASPORTO',w:40, a:'center'},
        {l:'NUM. DOCUM.',       v:str(bolla.registro||'01')+'/'+str(bolla.numero), w:20, a:'center'},
        {l:'DATA DOCUM.',       v:datBol,               w:W-14-28-28-24-40-20, a:'center'},
    ];
    let cx = ML;
    colsHead.forEach(col => {
        label(col.l, cx, y, col.w, rh/2);
        bold(true);
        cell(col.v, cx, y+rh/2, col.w, rh/2, col.a);
        bold(false);
        cx += col.w;
    });
    y += rh;

    // Riga pagamento + banca
    const colsPag = [
        {l:'C.PAG.',             v:str(bolla.pagamento?.codice), w:14, a:'center'},
        {l:'DESCRIZIONE PAGAMENTO', v:str(bolla.pagamento?.descrizione), w:56, a:'left'},
        {l:"BANCA D'APPOGGIO",   v:'',                          w:60, a:'left'},
        {l:'ABI / CAB',          v:'',                          w:30, a:'center'},
        {l:'N.PAGINA',           v:'1',                         w:W-14-56-60-30, a:'center'},
    ];
    cx = ML;
    colsPag.forEach(col => {
        label(col.l, cx, y, col.w, rh/2);
        cell(col.v, cx, y+rh/2, col.w, rh/2, col.a);
        cx += col.w;
    });
    y += rh + 2;

    // ── SEZIONE 3: Header colonne articoli ────────────────────────────────────
    const artH  = 5;
    const cDesc = W-22-8-26-20-14-12;
    const colsArt = [
        {l:'DESCRIZIONE',     w:cDesc, a:'left'},
        {l:"QUANTITA'",       w:22,    a:'center'},
        {l:'U.M',             w:8,     a:'center'},
        {l:'PREZZO UNITARIO', w:26,    a:'right'},
        {l:'SCONTI/AUMENTI',  w:20,    a:'right'},
        {l:'IMPORTO RIGO',    w:14,    a:'right'},
        {l:'C.I.',            w:12,    a:'center'},
    ];
    cx = ML;
    bold(true); doc.setFontSize(6);
    colsArt.forEach(col => {
        doc.setFillColor(220,220,220);
        doc.rect(cx, y, col.w, artH, 'FD');
        txt(col.l, col.a==='right'?cx+col.w-1:col.a==='center'?cx+col.w/2:cx+1, y+artH/2, col.a);
        cx += col.w;
    });
    bold(false); doc.setFontSize(7);
    y += artH;

    // ── SEZIONE 4: Righe articoli ─────────────────────────────────────────────
    const rigaH = 6;
    let totNetto = 0, totIva = 0;
    const ivaGruppi = {};

    bolla.righe.forEach(r => {
        const qta      = Number(r.qty || r.qtaPez || 0);
        const preLor   = Number(r.prezzo || 0);
        const sco      = Number(r.sconto || bolla.scontoGlobale || 0);
        const scoPerc  = Math.abs(sco);
        const scoSign  = sco <= 0 ? -1 : 1;  // negativo = sconto, positivo = aumento
        const impLor   = qta * preLor;
        const impNet   = impLor * (1 - scoPerc/100 * (scoSign < 0 ? 1 : -1));
        const ali      = Number(r.codIvaVendita || r.codIva || 22);
        const impIva   = impNet * ali / 100;
        totNetto      += impNet;
        totIva        += impIva;
        ivaGruppi[ali] = (ivaGruppi[ali] || {ali, imp:0, iva:0});
        ivaGruppi[ali].imp += impNet;
        ivaGruppi[ali].iva += impIva;

        // Nuova pagina se necessario
        if (y > 220) { doc.addPage(); y = 10; }

        cx = ML;
        const scoStr = sco !== 0 ? (sco < 0 ? '-' : '+') + Math.abs(sco).toFixed(2) : '';
        const rowVals = [
            {v:str(r.des1||r.codice,60), w:cDesc, a:'left'},
            {v:qta.toFixed(2).replace('.',','), w:22, a:'right'},
            {v:str(r.um||'Nr.'),         w:8,  a:'center'},
            {v:preLor.toFixed(6).replace('.',','), w:26, a:'right'},
            {v:scoStr,                   w:20, a:'right'},
            {v:impNet.toFixed(2).replace('.',','), w:14, a:'right'},
            {v:str(r.codIvaVendita||r.codIva||'22'), w:12, a:'center'},
        ];
        rowVals.forEach(col => {
            doc.rect(cx, y, col.w, rigaH);
            txt(col.v, col.a==='right'?cx+col.w-1:col.a==='center'?cx+col.w/2:cx+1, y+rigaH/2, col.a);
            cx += col.w;
        });
        y += rigaH;
    });

    // Lascia spazio minimo per il footer
    if (y < 180) y = 180;
    y += 2;

    // ── SEZIONE 5: Totali merce ───────────────────────────────────────────────
    const totH = 6;
    const colsTot = [
        {l:'TOTALE MERCE',      v:totNetto.toFixed(2).replace('.',','), w:30, a:'right'},
        {l:'%SC.CASSA',         v:'',  w:18, a:'center'},
        {l:'TOTALE NETTO MERCE',v:totNetto.toFixed(2).replace('.',','), w:36, a:'right'},
        {l:'TRASPORTO',         v:'',  w:30, a:'right'},
        {l:'IMBALLO',           v:'',  w:30, a:'right'},
        {l:'SPESE BANCARIE',    v:'',  w:W-30-18-36-30-30, a:'right'},
    ];
    cx = ML;
    colsTot.forEach(col => {
        label(col.l, cx, y, col.w, totH/2);
        cell(col.v, cx, y+totH/2, col.w, totH/2, col.a);
        cx += col.w;
    });
    y += totH + 1;

    // ── SEZIONE 6: Tabella IVA ────────────────────────────────────────────────
    const ivaH = 4;
    const ivaW = [10, cDesc+22-10, 30, 20, 30];
    const ivaL = ['C.I.','DESCRIZIONE','IMPONIBILE','%IVA','IMPORTO IVA'];
    cx = ML;
    ivaL.forEach((l,i) => { label(l, cx, y, ivaW[i], ivaH); cx+=ivaW[i]; });
    y += ivaH;
    Object.values(ivaGruppi).forEach(g => {
        cx = ML;
        const ivaVals = [str(g.ali),'',(g.imp).toFixed(2).replace('.',','),str(g.ali)+'%',(g.iva).toFixed(2).replace('.',',')];
        ivaVals.forEach((v,i)=>{cell(v,cx,y,ivaW[i],ivaH,i>=2?'right':'center');cx+=ivaW[i];});
        y += ivaH;
    });
    if (!Object.keys(ivaGruppi).length) {
        cx=ML; ivaL.forEach((_,i)=>{cell('',cx,y,ivaW[i],ivaH);cx+=ivaW[i];}); y+=ivaH;
    }
    y += 1;

    // ── SEZIONE 7: Totale fattura ─────────────────────────────────────────────
    const fH = 6;
    const totFatt = totNetto + totIva;
    const colsFat = [
        {l:'TOT.IMPONIBILE',  v:totNetto.toFixed(2).replace('.',','), w:26, a:'right'},
        {l:'TOTALE IVA',      v:totIva.toFixed(2).replace('.',','),   w:20, a:'right'},
        {l:'SPESE ART.15',    v:'', w:20, a:'right'},
        {l:'SPESE BOLLI',     v:'', w:18, a:'right'},
        {l:'TOTALE FATTURA',  v:totFatt.toFixed(2).replace('.',','),  w:26, a:'right'},
        {l:'ABBUONO',         v:'', w:18, a:'right'},
        {l:'ANTICIPO',        v:'', w:18, a:'right'},
        {l:'TOT.DA PAGARE',   v:totFatt.toFixed(2).replace('.',','),  w:W-26-20-20-18-26-18-18, a:'right'},
    ];
    cx = ML;
    colsFat.forEach(col=>{
        label(col.l, cx, y, col.w, fH/2);
        bold(col.l==='TOTALE FATTURA'||col.l==='TOT.DA PAGARE');
        cell(col.v, cx, y+fH/2, col.w, fH/2, col.a);
        bold(false);
        cx+=col.w;
    });
    y += fH + 1;

    // ── SEZIONE 8: Scadenze effetti ───────────────────────────────────────────
    doc.setFontSize(5.5); doc.setTextColor(100,100,100);
    txt('SCADENZE EFFETTI', ML, y+2); doc.setTextColor(0,0,0);
    rect(ML, y, W, 8);
    y += 9;

    // ── SEZIONE 9: Vettori ────────────────────────────────────────────────────
    const vH = 8;
    label('VETTORI', ML, y, W*0.5, vH/2);
    cell('', ML, y+vH/2, W*0.5, vH/2);
    label('DATA RIT.MERCE', ML+W*0.5, y, 25, vH/2);
    cell('', ML+W*0.5, y+vH/2, 25, vH/2);
    label('ORA RIT.', ML+W*0.5+25, y, 20, vH/2);
    cell('', ML+W*0.5+25, y+vH/2, 20, vH/2);
    label('FIRMA VETTORE', ML+W*0.5+45, y, W*0.5-45, vH/2);
    cell('', ML+W*0.5+45, y+vH/2, W*0.5-45, vH/2);
    y += vH + 1;

    // Partita IVA / Albo
    doc.setFontSize(7);
    txt('Partita IVA :', ML, y+3);
    txt('Nr.Iscr.Albo:', ML+60, y+3);
    y += 7;

    // ── SEZIONE 10: Porto / Trasporto ─────────────────────────────────────────
    const datTra = bolla.datIniTra
        ? bolla.datIniTra.replace(/^(\d{2})(\d{2})(\d{4})$/,'$1.$2.$3')
        : '';
    const pW = [22, 56, 30, 20, W-22-56-30-20];
    const pL = ['PORTO','ASPETTO ESTERIORE DEI BENI','DATA INIZ.TRASP.','ORA INIZ.','FIRMA CONDUCENTE'];
    const pV = [
        bolla.tipPor==='F'?'Franco':'Assegnato',
        bolla.aspEst||'',
        datTra,
        bolla.oraIniTra||'',
        ''
    ];
    cx=ML;
    pL.forEach((l,i)=>{ label(l,cx,y,pW[i],ivaH); cx+=pW[i]; });
    y+=ivaH; cx=ML;
    bold(true);
    pL.forEach((l,i)=>{ cell(pV[i],cx,y,pW[i],ivaH+1,i===0||i===2?'left':'left'); cx+=pW[i]; });
    bold(false); y+=ivaH+2;

    const tW = [22, 56, 20, 20, W-22-56-20-20];
    const tL = ['TRASPORTO A CURA','CAUSALE DEL TRASPORTO','N.COLLI','PESO','FIRMA DESTINATARIO'];
    const tipSpeStr = bolla.tipSpe==='M'?'Mittente': bolla.tipSpe==='V'?'Vettore':'Destinatario';
    const nColli = bolla.righe.reduce((s,r)=>s+(Number(r.qty||r.qtaPez)||0),0);
    const tV = [tipSpeStr, bolla.cauTra||'', nColli.toFixed(2).replace('.',','), '', ''];
    cx=ML;
    tL.forEach((l,i)=>{ label(l,cx,y,tW[i],ivaH); cx+=tW[i]; });
    y+=ivaH; cx=ML;
    bold(true);
    tV.forEach((v,i)=>{ cell(v,cx,y,tW[i],ivaH+1,'left'); cx+=tW[i]; });
    bold(false);

    return doc;
};

// ── Azioni PDF ────────────────────────────────────────────────────────────────
APP.stampaBollaPDF = async function() {
    const bolla = APP.selectedQueueItem;
    if (!bolla) return;
    const doc  = await APP.generateBollaPDF(bolla);
    const nome = `Bolla_${bolla.registro}_${bolla.numero}_${APP.formatDateFile(new Date())}.pdf`;
    APP.savePDF(doc, nome);
};

APP.condividiBollaPDF = async function() {
    const bolla = APP.selectedQueueItem;
    if (!bolla) return;
    const doc  = await APP.generateBollaPDF(bolla);
    const nome = `Bolla_${bolla.registro}_${bolla.numero}.pdf`;
    await APP.shareDocument(doc, nome, `Bolla DDT ${bolla.registro}/${bolla.numero}`);
};

// ── ESC/POS per stampanti termiche ────────────────────────────────────────────
APP.printMobileBolla = async function() {
    APP.loadPrinterConfig();
    if (!APP.printerConfig) {
        APP.showToast('Nessuna stampante configurata', 'error');
        setTimeout(() => APP.openPrintWizard(), 400);
        return;
    }
    const bolla = APP.selectedQueueItem;
    if (!bolla) { APP.showToast('Nessuna bolla selezionata', 'error'); return; }

    if (!APP.logoTxtLines && APP.accessToken) {
        await APP.loadLogoTxt().catch(() => null);
    }
    APP.showToast('Preparazione stampa bolla...', 'info');
    const data = APP.buildBollaEscPos(bolla, APP.printerConfig);
    await APP.sendToPrinter(data, APP.printerConfig);
};

APP.buildBollaEscPos = function(bolla, config) {
    const w      = config.width || 48;
    const P      = APP.prt;
    const SEP_B  = '='.repeat(w);
    const SEP_T  = '-'.repeat(w);
    const cli    = bolla.cliente || {};
    const dest   = bolla.destDiverso || cli;
    const datBol = bolla.data ? new Date(bolla.data).toLocaleDateString('it-IT') : '';
    const datTra = bolla.datIniTra
        ? bolla.datIniTra.replace(/^(\d{2})(\d{2})(\d{4})$/,'$1/$2/$3') : '';

    const cmds = [{type:'init'}];

    // ── Intestazione Logo.txt ─────────────────────────────────────────────────
    cmds.push({type:'align',v:'center'});
    const logoLines = APP.logoTxtLines;
    if (logoLines?.length) {
        cmds.push({type:'bold',v:true},{type:'dbl',v:true});
        cmds.push({type:'text',v:P.trunc(logoLines[0],w)});
        cmds.push({type:'dbl',v:false},{type:'bold',v:false});
        for(let i=1;i<logoLines.length;i++)
            cmds.push({type:'text',v:P.trunc(logoLines[i],w)});
    }
    cmds.push({type:'text',v:SEP_B});

    // ── Tipo documento ────────────────────────────────────────────────────────
    cmds.push({type:'bold',v:true});
    cmds.push({type:'text',v:'** DOCUMENTO DI TRASPORTO **'});
    cmds.push({type:'bold',v:false});
    cmds.push({type:'text',v:P.sxDx(`N. ${bolla.registro}/${bolla.numero}`, `del ${datBol}`, w)});
    cmds.push({type:'align',v:'left'});
    cmds.push({type:'text',v:SEP_T});

    // ── Destinatario ──────────────────────────────────────────────────────────
    if (bolla.destDiverso) {
        cmds.push({type:'text',v:`DEST: ${P.trunc(dest.ragSoc||dest.ragSoc1||'',w-6)}`});
        const ind = [dest.ind||dest.indirizzo, dest.cap, dest.loc||dest.localita].filter(Boolean).join(' ');
        if(ind) cmds.push({type:'text',v:`     ${P.trunc(ind,w-5)}`});
        cmds.push({type:'text',v:SEP_T});
    }

    // ── Intestatario ─────────────────────────────────────────────────────────
    cmds.push({type:'text',v:`CLIENTE: ${P.trunc(cli.ragSoc1||'',w-9)}`});
    const indCli = [cli.indirizzo||'', cli.cap||'', cli.localita||'',
                    cli.provincia?'('+cli.provincia+')':''].filter(Boolean).join(' ');
    if(indCli.trim()) cmds.push({type:'text',v:`         ${P.trunc(indCli,w-9)}`});
    if(cli.partitaIva) cmds.push({type:'text',v:`P.IVA: ${cli.partitaIva}`});
    if(bolla.pagamento?.descrizione)
        cmds.push({type:'text',v:`Pag: ${P.trunc(bolla.pagamento.descrizione,w-5)}`});
    if(bolla.codAgente)
        cmds.push({type:'text',v:`Agente: ${bolla.codAgente}`});
    cmds.push({type:'text',v:SEP_B});

    // ── Header colonne ────────────────────────────────────────────────────────
    // Layout 48: DESC(22) QTA(8) UM(4) PREZZO(10) SCONTO(4)
    // Layout 32: DESC(14) QTA(7) UM(3) PREZZO(8)
    // Layout 58: DESC(28) QTA(9) UM(5) PREZZO(12) SCONTO(4)
    const cD = w===32?14 : w===58?28 : 22;
    const cQ = w===32? 7 : w===58? 9  : 8;
    const cU = w===32? 3 : w===58? 5  : 4;
    const cP = w - cD - cQ - cU;
    cmds.push({type:'bold',v:true});
    cmds.push({type:'text', v:
        'DESCR'.padEnd(cD) + 'QTA'.padStart(cQ) + 'UM'.padStart(cU) + 'PREZZO'.padStart(cP)});
    cmds.push({type:'bold',v:false});
    cmds.push({type:'text',v:SEP_T});

    // ── Righe articoli ────────────────────────────────────────────────────────
    let totNetto=0, totIva=0;
    bolla.righe.forEach((r,i) => {
        const qta    = Number(r.qty||r.qtaPez||0);
        const pre    = Number(r.prezzo||0);
        const sco    = Number(r.sconto||bolla.scontoGlobale||0);
        const impLor = qta * pre;
        const impNet = sco!==0 ? impLor*(1-Math.abs(sco)/100) : impLor;
        const ali    = Number(r.codIvaVendita||r.codIva||22);
        totNetto += impNet;
        totIva   += impNet*ali/100;

        cmds.push({type:'text',v:P.trunc(r.des1||r.codice,cD).padEnd(cD)
            + qta.toString().padStart(cQ)
            + (r.um||'Nr.').substring(0,cU).padStart(cU)
            + impNet.toFixed(2).replace('.',',').padStart(cP)});
        if(sco!==0) {
            const scoStr = (sco<0?'-':'+') + Math.abs(sco).toFixed(1)+'%';
            cmds.push({type:'text',v:' '.repeat(cD)+P.sxDx('  Sco:'+scoStr,'Eur '+pre.toFixed(2),w-cD)});
        }
        if(i < bolla.righe.length-1)
            cmds.push({type:'text',v:' '.repeat(cD)+SEP_T.substring(0,w-cD)});
    });
    cmds.push({type:'text',v:SEP_B});

    // ── Totali ────────────────────────────────────────────────────────────────
    cmds.push({type:'align',v:'right'});
    cmds.push({type:'text',v:P.sxDx('Imponibile:', 'Eur '+P.money(totNetto,9),w)});
    cmds.push({type:'text',v:P.sxDx('IVA:',        'Eur '+P.money(totIva,9),w)});
    cmds.push({type:'text',v:SEP_T});
    cmds.push({type:'bold',v:true});
    cmds.push({type:'text',v:P.sxDx('TOTALE BOLLA:','Eur '+P.money(totNetto+totIva,9),w)});
    cmds.push({type:'bold',v:false});
    cmds.push({type:'align',v:'left'});
    cmds.push({type:'text',v:SEP_B});

    // ── Trasporto ─────────────────────────────────────────────────────────────
    const nColli = bolla.righe.reduce((s,r)=>s+(Number(r.qty||r.qtaPez)||0),0);
    const tipSpeStr = bolla.tipSpe==='M'?'Mittente':bolla.tipSpe==='V'?'Vettore':'Destinatario';
    if(bolla.cauTra) cmds.push({type:'text',v:`Causale: ${bolla.cauTra}`});
    if(bolla.aspEst) cmds.push({type:'text',v:`Aspetto: ${bolla.aspEst}`});
    cmds.push({type:'text',v:P.sxDx('Porto: '+(bolla.tipPor==='F'?'Franco':'Assegnato'),
        'A cura: '+tipSpeStr, w)});
    if(datTra||bolla.oraIniTra)
        cmds.push({type:'text',v:P.sxDx('Data tra.: '+datTra,'Ora: '+bolla.oraIniTra,w)});
    cmds.push({type:'text',v:P.sxDx('N.Colli: '+nColli.toFixed(0),'Peso: —',w)});
    cmds.push({type:'text',v:SEP_B});

    // ── Firma ─────────────────────────────────────────────────────────────────
    cmds.push({type:'text',v:'Firma destinatario:'});
    cmds.push({type:'text',v:''});
    cmds.push({type:'text',v:'_'.repeat(w)});
    cmds.push({type:'feed',lines:4});
    cmds.push({type:'cut'});

    return APP.buildEscPos(cmds);
};
