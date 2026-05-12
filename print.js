// ============================================================
// PICAM v4.04 — crm.js  (integrazione CRM su PWA)
// Legge 7 JSON da Google Drive prodotti da crm_builder_pwa.py
// 6 tab scorrevoli: Contatti | Scadenze | Ordini | Top Art. | Saldo | Documenti
// ============================================================

// ── Stato CRM ────────────────────────────────────────────────────────────────
APP.crm = {
    clienti:     {},   // dict {cod_cli: {...}}
    scadenze:    [],
    saldo:       {},   // dict {cod_cli: {...}}
    ordini:      [],
    topArticoli: {},   // dict {cod_cli: [...]}
    documenti:   [],
    meta:        null,
    loaded:      false,
    filterText:  '',
    sortBy:      'rag_soc',  // 'rag_soc' | 'scaduto' | 'zona'
    selectedCli: null,
    gpsCoords:   null,
};

// ── File JSON da caricare ─────────────────────────────────────────────────────
const CRM_FILES = [
    'crm_clienti.json',
    'crm_scadenze.json',
    'crm_saldo.json',
    'crm_ordini.json',
    'crm_top_articoli.json',
    'crm_documenti.json',
    'crm_meta.json',
];

// ── Caricamento da Drive ──────────────────────────────────────────────────────
APP.loadCRM = async function(forceReload = false) {
    if (APP.crm.loaded && !forceReload) {
        APP.renderCrmLista();
        return true;
    }
    APP.showToast('Caricamento CRM da Drive...', 'info');
    try {
        if (APP.ensureValidToken) await APP.ensureValidToken();
        const folderId = await APP.findFolder(APP.config.folder);
        const total    = CRM_FILES.length;
        let   loaded   = 0;

        const fetchJson = async (name) => {
            const q = `name='${name}' and '${folderId}' in parents and trashed=false`;
            const r = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
                { headers: { Authorization: `Bearer ${APP.accessToken}` } }
            );
            const d = await r.json();
            if (!d.files?.length) { console.warn(`CRM: ${name} non trovato`); return null; }
            const fr = await fetch(
                `https://www.googleapis.com/drive/v3/files/${d.files[0].id}?alt=media`,
                { headers: { Authorization: `Bearer ${APP.accessToken}` } }
            );
            loaded++;
            APP._crmUpdateProgress(Math.round(loaded / total * 100));
            return fr.json();
        };

        const [clienti, scadenze, saldo, ordini, topArt, documenti, meta] =
            await Promise.all(CRM_FILES.map(fetchJson));

        APP.crm.clienti     = clienti     || {};
        APP.crm.scadenze    = scadenze    || [];
        APP.crm.saldo       = saldo       || {};
        APP.crm.ordini      = ordini      || [];
        APP.crm.topArticoli = topArt      || {};
        APP.crm.documenti   = documenti   || [];
        APP.crm.meta        = meta        || {};
        APP.crm.loaded      = true;

        const n = Object.keys(APP.crm.clienti).length;
        APP.showToast(`CRM caricato: ${n} clienti`, 'success');
        console.log('CRM meta:', APP.crm.meta);
        APP.renderCrmLista();
        return true;
    } catch(e) {
        APP.showToast('Errore CRM: ' + e.message, 'error');
        console.error('CRM load error:', e);
        return false;
    }
};

APP._crmUpdateProgress = function(pct) {
    const el = document.getElementById('crm-load-progress');
    if (el) { el.style.display = 'block'; el.style.width = pct + '%'; }
};

// ── Apertura CRM ─────────────────────────────────────────────────────────────
APP.openCRM = async function() {
    APP.showScreen('crm-lista');
    if (!APP.crm.loaded) await APP.loadCRM();
    else APP.renderCrmLista();
};

// ── Lista Clienti ─────────────────────────────────────────────────────────────
APP.renderCrmLista = function() {
    const txt = (APP.crm.filterText || '').toLowerCase().normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

    let lista = Object.values(APP.crm.clienti).filter(c => {
        if (!txt) return true;
        const check = [c.rag_soc, c.cod_cli, c.loc, c.pro, c.des_zona, c.email]
            .join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return txt.split(' ').every(w => check.includes(w));
    });

    // Ordina
    if (APP.crm.sortBy === 'scaduto') {
        lista.sort((a, b) => {
            const sa = APP._crmScadutoCliente(a.cod_cli);
            const sb = APP._crmScadutoCliente(b.cod_cli);
            return sb - sa;
        });
    } else if (APP.crm.sortBy === 'zona') {
        lista.sort((a, b) => (a.des_zon || '').localeCompare(b.des_zon || ''));
    } else {
        lista.sort((a, b) => (a.rag_soc || '').localeCompare(b.rag_soc || ''));
    }

    document.getElementById('crm-lista-count').textContent = `${lista.length} clienti`;

    const html = lista.map(c => {
        const sal    = APP.crm.saldo[c.cod_cli];
        const scadTot = APP._crmScadutoCliente(c.cod_cli);
        const saldoHtml = sal
            ? `<span class="crm-badge ${sal.saldo_sign === 'Debito' ? 'badge-debito' : 'badge-ok'}">`
              + `${sal.saldo_corrente >= 0 ? '+' : ''}${Number(sal.saldo_corrente).toFixed(0)}</span>`
            : '';
        const scadHtml = scadTot > 0
            ? `<span class="crm-badge badge-scaduto">⚠ ${scadTot.toFixed(0)}</span>`
            : '';
        const avatar = (c.rag_soc || '?')[0].toUpperCase();
        const hue    = (c.cod_cli || '').split('').reduce((n, ch) => n + ch.charCodeAt(0), 0) % 360;
        return `<div class="crm-list-item" onclick="APP.openClienteDetail('${c.cod_cli}')">
          <div class="crm-avatar" style="background:hsl(${hue},55%,45%)">${avatar}</div>
          <div class="crm-list-body">
            <div class="crm-list-main">
              <span class="crm-list-rag">${APP._crmEsc(c.rag_soc)}</span>
              <span class="crm-list-cod">${c.cod_cli}</span>
            </div>
            <div class="crm-list-sub">
              <span>${APP._crmEsc(c.loc)}${c.pro ? ' ('+c.pro+')' : ''}</span>
              ${saldoHtml}${scadHtml}
            </div>
          </div>
          <div class="crm-list-arrow">›</div>
        </div>`;
    }).join('');

    document.getElementById('crm-lista-body').innerHTML =
        html || '<p class="crm-empty">Nessun cliente trovato</p>';
};

APP._crmScadutoCliente = function(codCli) {
    return APP.crm.scadenze
        .filter(s => s.cod_cli === String(codCli) && s.stato === 'SCADUTO')
        .reduce((tot, s) => tot + (Number(s.imp_eff) || 0), 0);
};

APP._crmEsc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ── Dettaglio Cliente ─────────────────────────────────────────────────────────
APP.openClienteDetail = function(codCli) {
    const c = APP.crm.clienti[String(codCli)];
    if (!c) return;
    APP.crm.selectedCli = c;
    APP.showScreen('crm-detail');
    APP._renderCrmHeader(c);
    APP._renderCrmKpi(c);
    APP.crmOpenTab('contatti'); // apre il primo tab
};

APP._renderCrmHeader = function(c) {
    const avg = (c.rag_soc || '?')[0].toUpperCase();
    const hue = (c.cod_cli || '').split('').reduce((n,ch) => n + ch.charCodeAt(0), 0) % 360;
    document.getElementById('crm-det-avatar').textContent   = avg;
    document.getElementById('crm-det-avatar').style.background = `hsl(${hue},55%,45%)`;
    document.getElementById('crm-det-rag').textContent      = c.rag_soc || '';
    document.getElementById('crm-det-cod').textContent      = `Cod: ${c.cod_cli}`;
    document.getElementById('crm-det-ind').textContent      =
        [c.ind, c.cap, c.loc, c.pro ? `(${c.pro})` : ''].filter(Boolean).join(' ');
    document.getElementById('crm-det-meta').textContent     =
        [c.des_age ? `Agente: ${c.des_age}` : '',
         c.des_zon  ? `Zona: ${c.des_zon}`  : '',
         c.des_pag  ? `Pag: ${c.des_pag}`   : ''].filter(Boolean).join('  |  ');
};

APP._renderCrmKpi = function(c) {
    const sal       = APP.crm.saldo[c.cod_cli] || {};
    const scadTot   = APP._crmScadutoCliente(c.cod_cli);
    const ordAperti = APP.crm.ordini.filter(o => o.cod_cli === c.cod_cli);
    const totOrd    = ordAperti.reduce((s,r) => s + (Number(r.imp_riga)||0), 0);

    const kpiSaldo = document.getElementById('crm-kpi-saldo');
    kpiSaldo.textContent = sal.saldo_corrente != null
        ? `${Number(sal.saldo_corrente).toFixed(2)}`
        : '—';
    kpiSaldo.className = 'kpi-value' +
        (sal.saldo_sign === 'Debito' ? ' kpi-danger' : '');

    const kpiSca = document.getElementById('crm-kpi-scaduto');
    kpiSca.textContent = scadTot > 0 ? scadTot.toFixed(2) : '—';
    kpiSca.className   = 'kpi-value' + (scadTot > 0 ? ' kpi-danger' : '');

    document.getElementById('crm-kpi-ordini').textContent =
        totOrd > 0 ? `${totOrd.toFixed(2)} (${ordAperti.length} righe)` : '—';
};

// ── Render Tab ────────────────────────────────────────────────────────────────
APP.crmOpenTab = function(tabName) {
    const tabs = ['contatti','scadenze','ordini','top-articoli','saldo','documenti'];
    tabs.forEach(t => {
        const p = document.getElementById(`crm-tab-${t}`);
        const b = document.getElementById(`crm-tab-btn-${t}`);
        if (p)  p.style.display  = t === tabName ? 'block' : 'none';
        if (b)  b.classList.toggle('tab-active', t === tabName);
    });
    // Render del tab selezionato
    const c = APP.crm.selectedCli;
    if (!c) return;
    const renderMap = {
        'contatti':     () => APP._renderTabContatti(c),
        'scadenze':     () => APP._renderTabScadenze(c),
        'ordini':       () => APP._renderTabOrdini(c),
        'top-articoli': () => APP._renderTabTopArticoli(c),
        'saldo':        () => APP._renderTabSaldo(c),
        'documenti':    () => APP._renderTabDocumenti(c),
    };
    if (renderMap[tabName]) renderMap[tabName]();
};

// ── Tab: Contatti ─────────────────────────────────────────────────────────────
APP._renderTabContatti = function(c) {
    const el = document.getElementById('crm-tab-contatti');
    const conts = c.contatti || [];
    const mainCard = `
        <div class="crm-contact-card crm-contact-main">
          <div class="crm-contact-name">${APP._crmEsc(c.rag_soc)}</div>
          <div class="crm-contact-qual">Cliente ${c.cod_cli}</div>
          <div class="crm-contact-actions">
            ${c.tel  ? `<button class="btn-contact" onclick="APP.crmCall('${c.tel}')">📞 ${c.tel}</button>` : ''}
            ${c.cel  ? `<button class="btn-contact btn-wa" onclick="APP.crmWhatsApp('${c.cel}','')">💬 ${c.cel}</button>` : ''}
            ${c.email ? `<button class="btn-contact btn-mail" onclick="APP.crmEmail('${c.email}','${APP._crmEsc(c.rag_soc)}','')">✉ Email</button>` : ''}
            <button class="btn-contact btn-maps" onclick="APP.crmNavigate()">🗺️ Mappa</button>
          </div>
          ${c.piva ? `<div class="crm-contact-info">P.IVA: ${c.piva}</div>` : ''}
        </div>`;
    const extra = conts.map(ct => `
        <div class="crm-contact-card">
          <div class="crm-contact-name">${APP._crmEsc(ct.nome)}
            <span class="crm-contact-qual">${APP._crmEsc(ct.qualifica)}</span>
          </div>
          <div class="crm-contact-actions">
            ${ct.tel   ? `<button class="btn-contact" onclick="APP.crmCall('${ct.tel}')">📞 ${ct.tel}</button>` : ''}
            ${ct.cell  ? `<button class="btn-contact btn-wa" onclick="APP.crmWhatsApp('${ct.cell}','')">💬 WA</button>` : ''}
            ${ct.email ? `<button class="btn-contact btn-mail" onclick="APP.crmEmail('${ct.email}','${APP._crmEsc(c.rag_soc)}','')">✉ Email</button>` : ''}
          </div>
        </div>`).join('');
    el.innerHTML = mainCard + (extra || '<p class="crm-empty">Nessun contatto aggiuntivo</p>');
};

// ── Tab: Scadenze ─────────────────────────────────────────────────────────────
APP._renderTabScadenze = function(c) {
    const el  = document.getElementById('crm-tab-scadenze');
    const sca = APP.crm.scadenze.filter(s => s.cod_cli === c.cod_cli);
    if (!sca.length) { el.innerHTML = '<p class="crm-empty">Nessuna scadenza</p>'; return; }

    const totScaduto = sca.filter(s=>s.stato==='SCADUTO').reduce((t,s)=>t+(Number(s.imp_eff)||0),0);
    const totAperto  = sca.reduce((t,s)=>t+(Number(s.imp_eff)||0),0);
    const summary    = `<div class="crm-summary">
        <span>Totale aperto: <strong>Eur ${totAperto.toFixed(2)}</strong></span>
        ${totScaduto > 0 ? `<span class="crm-scad-warn">Scaduto: Eur ${totScaduto.toFixed(2)}</span>` : ''}
    </div>`;

    const rows = sca.map(s => {
        const cls = s.stato==='SCADUTO' ? 'row-danger' : s.stato==='In_scadenza' ? 'row-warn' : '';
        const dat = s.dat_sca ? new Date(s.dat_sca).toLocaleDateString('it-IT') : '—';
        const gg  = s.giorni != null ? (s.giorni >= 0 ? `+${s.giorni}gg` : `${s.giorni}gg`) : '—';
        return `<tr class="${cls}">
          <td>${dat}</td>
          <td>${APP._crmEsc(s.des_pag || s.cod_pag || '—')}</td>
          <td class="td-num">${Number(s.imp_eff||0).toFixed(2)}</td>
          <td><span class="stato-badge stato-${s.stato}">${s.stato.replace('_',' ')}</span></td>
          <td class="td-num">${gg}</td>
        </tr>`;
    }).join('');
    el.innerHTML = summary + `<table class="crm-table">
        <thead><tr><th>Data Sca.</th><th>Pagamento</th><th>Importo</th><th>Stato</th><th>Giorni</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
};

// ── Tab: Ordini Aperti ────────────────────────────────────────────────────────
APP._renderTabOrdini = function(c) {
    const el  = document.getElementById('crm-tab-ordini');
    const ord = APP.crm.ordini.filter(o => o.cod_cli === c.cod_cli);
    if (!ord.length) { el.innerHTML = '<p class="crm-empty">Nessun ordine aperto</p>'; return; }

    const totImp = ord.reduce((t,o)=>t+(Number(o.imp_riga)||0),0);
    const summary = `<div class="crm-summary">
        <span>${ord.length} righe — Totale: <strong>Eur ${totImp.toFixed(2)}</strong></span>
    </div>`;

    const rows = ord.map(o => {
        const dat = o.dat_ord ? new Date(o.dat_ord).toLocaleDateString('it-IT') : '—';
        return `<tr>
          <td>${o.num_ord||'—'}<br><small>${dat}</small></td>
          <td title="${APP._crmEsc(o.des_art)}">${APP._crmEsc(o.cod_art)}<br>
            <small>${APP._crmEsc((o.des_art||'').substring(0,30))}</small></td>
          <td class="td-num">${Number(o.qta_da_evadere||0).toFixed(2)}</td>
          <td class="td-num">${Number(o.pre_uni||0).toFixed(4)}</td>
          <td class="td-num"><strong>${Number(o.imp_riga||0).toFixed(2)}</strong></td>
        </tr>`;
    }).join('');
    el.innerHTML = summary + `<table class="crm-table">
        <thead><tr><th>Ordine</th><th>Articolo</th><th>Q.tà</th><th>Prezzo</th><th>Importo</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
};

// ── Tab: Top Articoli ─────────────────────────────────────────────────────────
APP._renderTabTopArticoli = function(c) {
    const el  = document.getElementById('crm-tab-top-articoli');
    const top = (APP.crm.topArticoli[c.cod_cli] || []);
    if (!top.length) { el.innerHTML = '<p class="crm-empty">Nessun articolo negli ordini aperti</p>'; return; }

    const rows = top.map((a, i) => `<tr>
        <td>${i+1}</td>
        <td>${APP._crmEsc(a.cod_art)}<br><small>${APP._crmEsc(a.des_art||'')}</small></td>
        <td class="td-num">${Number(a.qta_tot||0).toFixed(2)}</td>
        <td class="td-num">${Number(a.ultimo_prezzo||0).toFixed(4)}</td>
        <td>${a.ultima_data ? new Date(a.ultima_data).toLocaleDateString('it-IT') : '—'}</td>
    </tr>`).join('');
    el.innerHTML = `<table class="crm-table">
        <thead><tr><th>#</th><th>Articolo</th><th>Q.tà tot.</th><th>Ult. Prezzo</th><th>Ult. Data</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
};

// ── Tab: Saldo ────────────────────────────────────────────────────────────────
APP._renderTabSaldo = function(c) {
    const el  = document.getElementById('crm-tab-saldo');
    const sal = APP.crm.saldo[c.cod_cli];
    if (!sal) { el.innerHTML = '<p class="crm-empty">Nessun saldo disponibile</p>'; return; }
    const sign = sal.saldo_sign;
    const cls  = sign === 'Debito' ? 'kpi-danger' : sign === 'Credito' ? 'kpi-ok' : '';
    el.innerHTML = `
        <div class="crm-saldo-card">
            <div class="crm-saldo-row">
                <span>Saldo esercizio precedente</span>
                <strong>${Number(sal.saldo_prec||0).toFixed(2)}</strong>
            </div>
            <div class="crm-saldo-row">
                <span>+ Dare esercizio corrente</span>
                <strong>${Number(sal.dare_att||0).toFixed(2)}</strong>
            </div>
            <div class="crm-saldo-row">
                <span>− Avere esercizio corrente</span>
                <strong>${Number(sal.ave_att||0).toFixed(2)}</strong>
            </div>
            <div class="crm-saldo-divider"></div>
            <div class="crm-saldo-row crm-saldo-total">
                <span>Saldo corrente (${sign})</span>
                <strong class="${cls}">${Number(sal.saldo_corrente||0).toFixed(2)}</strong>
            </div>
        </div>`;
};

// ── Tab: Documenti ────────────────────────────────────────────────────────────
APP._renderTabDocumenti = function(c) {
    const el  = document.getElementById('crm-tab-documenti');
    const doc = APP.crm.documenti.filter(d => d.cod_cli === c.cod_cli);
    if (!doc.length) { el.innerHTML = '<p class="crm-empty">Nessun documento</p>'; return; }

    const rows = doc.slice(0,50).map(d => {
        const dat = d.dat_doc ? new Date(d.dat_doc).toLocaleDateString('it-IT') : '—';
        return `<tr>
          <td>${APP._crmEsc(d.archivio)}<br><small>${d.tip_doc}</small></td>
          <td>${d.num_doc||'—'}</td>
          <td>${dat}</td>
          <td class="td-num">${Number(d.net_pag||0).toFixed(2)}</td>
          <td><small>${APP._crmEsc(d.des_pag||d.cod_pag||'')}</small></td>
        </tr>`;
    }).join('');
    el.innerHTML = `<table class="crm-table">
        <thead><tr><th>Tipo</th><th>N.</th><th>Data</th><th>Importo</th><th>Pagamento</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
};

// ── Azioni rapide ─────────────────────────────────────────────────────────────
APP.crmCall = tel => { window.open(`tel:${tel}`, '_self'); };

APP.crmWhatsApp = function(tel, msg) {
    tel = tel.replace(/[\s\-\+()]/g,'');
    if (!tel.startsWith('39')) tel = '39' + tel;
    window.open(`https://wa.me/${tel}` + (msg ? `?text=${encodeURIComponent(msg)}` : ''), '_blank');
};

APP.crmEmail = function(email, ragSoc, oggetto) {
    window.open(`mailto:${email}?subject=${encodeURIComponent(oggetto || `Rif. ${ragSoc}`)}`, '_self');
};

APP.crmEmailAll = function() {
    const c = APP.crm.selectedCli;
    if (!c) return;
    const emails = [c.email, ...(c.contatti||[]).map(ct=>ct.email)].filter(Boolean);
    if (!emails.length) { APP.showToast('Nessuna email disponibile', 'error'); return; }
    APP.crmEmail(emails.join(','), c.rag_soc, '');
};

APP.crmWhatsAppCliente = function() {
    const c = APP.crm.selectedCli;
    if (!c) return;
    const tel = c.cel || c.tel;
    if (!tel) { APP.showToast('Nessun telefono disponibile', 'error'); return; }
    APP.crmWhatsApp(tel, `Gentile ${c.rag_soc},\n`);
};

APP.crmNavigate = function() {
    const c = APP.crm.selectedCli;
    if (!c) return;
    const dest = encodeURIComponent(c.maps_query || [c.ind, c.cap, c.loc, 'Italy'].filter(Boolean).join(', '));
    if (APP.crm.gpsCoords) {
        const { lat, lng } = APP.crm.gpsCoords;
        window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${dest}&travelmode=driving`, '_blank');
    } else {
        window.open(`https://www.google.com/maps/search/?api=1&query=${dest}`, '_blank');
    }
};

APP.crmGetGPS = function(cb) {
    if (!navigator.geolocation) { APP.showToast('GPS non disponibile', 'error'); return; }
    APP.showToast('Rilevamento GPS...', 'info');
    navigator.geolocation.getCurrentPosition(
        pos => {
            APP.crm.gpsCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            APP.showToast(`GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`, 'success');
            if (cb) cb(APP.crm.gpsCoords);
        },
        err => APP.showToast('GPS: ' + err.message, 'error'),
        { enableHighAccuracy: true, timeout: 10000 }
    );
};
