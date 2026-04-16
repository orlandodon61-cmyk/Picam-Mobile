// ==========================================
// PICAM v4.0 - main.js
// Auth Google, init, caricamento dati, navigazione, scanner, modal qty
// ==========================================

// ---------- COSTANTI ----------
const GOOGLE_CLIENT_ID = '780777046643-ebl7m87qcoldp3c8sg9c1u5dfqjdgl42.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive';

// ---------- AUTH ----------

APP.tryAutoLogin = function() {
    return new Promise((resolve) => {
        const savedEmail = localStorage.getItem('picam_user_email');
        if (!savedEmail) { resolve(false); return; }
        const client = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_SCOPES,
            hint: savedEmail,
            prompt: '',
            callback: (response) => {
                if (response.access_token) {
                    APP.accessToken = response.access_token;
                    APP.tokenExpiry = Date.now() + (response.expires_in * 1000);
                    APP.userEmail = savedEmail;
                    localStorage.setItem('picam_access_token', APP.accessToken);
                    localStorage.setItem('picam_token_expiry', APP.tokenExpiry.toString());
                    resolve(true);
                } else { resolve(false); }
            },
            error_callback: () => resolve(false)
        });
        setTimeout(() => resolve(false), 5000);
        try { client.requestAccessToken({ prompt: '' }); } catch(e) { resolve(false); }
    });
};

APP.login = function() {
    const statusEl = document.getElementById('login-status');
    statusEl.className = 'status-message loading';
    statusEl.textContent = 'Connessione in corso...';
    const savedEmail = localStorage.getItem('picam_user_email');
    const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        hint: savedEmail || '',
        callback: (response) => {
            if (response.access_token) {
                APP.accessToken = response.access_token;
                APP.tokenExpiry = Date.now() + (response.expires_in * 1000);
                localStorage.setItem('picam_access_token', APP.accessToken);
                localStorage.setItem('picam_token_expiry', APP.tokenExpiry.toString());
                APP.getUserInfo();
            } else {
                statusEl.className = 'status-message error';
                statusEl.textContent = 'Errore di autenticazione';
            }
        }
    });
    client.requestAccessToken();
};

APP.getUserInfo = async function() {
    let email = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await new Promise(r => setTimeout(r, attempt * 500));
            if (!APP.accessToken) throw new Error('Token non disponibile');
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo',
                { headers: { 'Authorization': `Bearer ${APP.accessToken}` } });
            if (!response.ok) throw new Error(`Errore API: ${response.status}`);
            const data = await response.json();
            if (data.email) { email = data.email; break; }
        } catch(e) { console.warn(`getUserInfo tentativo ${attempt}/3:`, e.message); }
    }
    if (!email) email = localStorage.getItem('picam_user_email');
    if (email) {
        APP.userEmail = email;
        localStorage.setItem('picam_user_email', email);
        document.getElementById('login-status').className = 'status-message success';
        document.getElementById('login-status').textContent = `Connesso come ${email}`;
        document.getElementById('step-login').classList.add('completed');
        document.getElementById('step-config').classList.remove('disabled');
        document.getElementById('step-load').classList.remove('disabled');
        APP.applyConfigToSetup();
    } else {
        document.getElementById('login-status').className = 'status-message warning';
        document.getElementById('login-status').textContent = 'Connesso (email non disponibile)';
        document.getElementById('step-login').classList.add('completed');
        document.getElementById('step-config').classList.remove('disabled');
        document.getElementById('step-load').classList.remove('disabled');
        APP.applyConfigToSetup();
    }
    APP.checkSkipButton();
};

APP.checkSkipButton = async function() {
    const skipOption = document.getElementById('skip-option');
    if (!skipOption) return;
    let articoliCount = parseInt(localStorage.getItem('picam_articoli_count') || '0');
    try {
        await DB.init();
        const stats = await DB.getStats();
        if (stats.articoli > 0) {
            articoliCount = stats.articoli;
            localStorage.setItem('picam_articoli_count', stats.articoli.toString());
        }
    } catch(e) {}
    if (articoliCount > 0) {
        skipOption.style.display = 'block';
        document.getElementById('skip-count').textContent = `${articoliCount} articoli`;
    } else {
        skipOption.style.display = 'none';
    }
};

APP.checkAuth = function() {
    const token  = localStorage.getItem('picam_access_token');
    const expiry = localStorage.getItem('picam_token_expiry');
    const email  = localStorage.getItem('picam_user_email');
    if (token && expiry && Date.now() < parseInt(expiry)) {
        APP.accessToken = token;
        APP.tokenExpiry = parseInt(expiry);
        APP.userEmail = email;
        return true;
    }
    return false;
};

APP.isTokenExpiring = function() {
    if (!APP.tokenExpiry) return true;
    return (APP.tokenExpiry - Date.now()) < 300000;
};

APP.ensureValidToken = async function() {
    if (APP.isTokenExpiring()) {
        const success = await APP.tryAutoLogin();
        if (!success) {
            APP.showToast('Sessione scaduta, effettua nuovamente il login', 'error');
            APP.showScreen('setup');
            APP.checkSkipButton();
            return false;
        }
    }
    return true;
};

APP.logout = function() {
    if (!confirm('Vuoi disconnetterti?')) return;
    localStorage.removeItem('picam_access_token');
    localStorage.removeItem('picam_token_expiry');
    APP.accessToken = null;
    APP.tokenExpiry = null;
    APP.showScreen('setup');
    APP.closeSettings();
    document.getElementById('step-login').classList.remove('completed');
    document.getElementById('step-config').classList.add('disabled');
    document.getElementById('step-load').classList.add('disabled');
    document.getElementById('login-status').textContent = '';
    APP.checkSkipButton();
};

// ---------- CARICAMENTO DATI ----------

APP.loadAllData = async function() {
    const progressContainer = document.getElementById('load-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const statusEl = document.getElementById('load-status');
    const btnLoad = document.getElementById('btn-load-data');

    btnLoad.disabled = true;
    progressContainer.classList.remove('hidden');
    statusEl.textContent = '';

    try {
        APP.saveConfigFromSetup();

        const setProgress = (pct, txt) => {
            progressFill.style.width = pct + '%';
            progressText.textContent = txt;
        };

        setProgress(5, 'Inizializzazione database...');
        await DB.init();

        setProgress(10, 'Ricerca cartella su Drive...');
        const folderId = await APP.findFolder(APP.config.folder);
        if (!folderId) throw new Error(`Cartella "${APP.config.folder}" non trovata su Google Drive`);

        setProgress(20, 'Caricamento articoli...');
        const articoli = await APP.loadExcelFile(folderId, 'articoli.xlsx');
        setProgress(35, 'Caricamento codici a barre...');
        const codbar  = await APP.loadExcelFile(folderId, 'codbar.xlsx');
        setProgress(50, 'Caricamento giacenze...');
        const artdep  = await APP.loadExcelFile(folderId, 'artdep.xlsx');

        setProgress(60, 'Elaborazione articoli...');
        console.log(`Articoli da Excel: ${articoli.length} | Codbar: ${codbar.length} | Artdep: ${artdep.length}`);
        const mergedArticoli = APP.mergeArticoli(articoli, codbar, artdep);
        console.log(`Articoli dopo merge: ${mergedArticoli.length}`);

        // DEBUG: verifica campo gruppo e locazione sui primi 3 articoli
        console.log('=== MERGE ARTICOLI - verifica campi ===');
        mergedArticoli.slice(0, 3).forEach((a, i) => {
            console.log(`[${i}] codice=${a.codice} | gruppo="${a.gruppo}" | locazione="${a.locazione}" | giacenza=${a.giacenza}`);
        });
        const conGruppo   = mergedArticoli.filter(a => a.gruppo   && a.gruppo   !== '').length;
        const conLocazione = mergedArticoli.filter(a => a.locazione && a.locazione !== '').length;
        console.log(`Articoli con gruppo: ${conGruppo}/${mergedArticoli.length} | con locazione: ${conLocazione}/${mergedArticoli.length}`);

        setProgress(65, `Salvataggio ${mergedArticoli.length.toLocaleString('it-IT')} articoli...`);
        await DB.saveArticoli(mergedArticoli, (pct) => {
            progressFill.style.width = (65 + pct * 0.1) + '%';
            progressText.textContent = `Salvataggio articoli... ${pct}%`;
        });
        console.log(`Salvataggio completato: ${mergedArticoli.length} articoli`);

        setProgress(75, 'Caricamento clienti...');
        const clientiRaw = await APP.loadExcelFile(folderId, 'clicom.xlsx');
        await DB.saveClienti(APP.mapClienti(clientiRaw));

        setProgress(80, 'Caricamento fornitori...');
        try {
            const fornitoriRaw = await APP.loadExcelFile(folderId, 'forcom.xlsx');
            await DB.saveFornitori(APP.mapFornitori(fornitoriRaw));
        } catch(e) { console.warn('forcom.xlsx non trovato'); }

        setProgress(83, 'Caricamento aliquote IVA...');
        try {
            const ivaRaw = await APP.loadExcelFile(folderId, 'iva.xlsx');
            await DB.saveAliquoteIva(APP.mapAliquoteIva(ivaRaw));
        } catch(e) { console.warn('iva.xlsx non trovato'); }

        setProgress(86, 'Caricamento pagamenti...');
        try {
            const pagRaw = await APP.loadExcelFile(folderId, 'pagame.xlsx');
            await DB.savePagamenti(APP.mapPagamenti(pagRaw));
        } catch(e) { console.warn('pagame.xlsx non trovato'); }

        setProgress(89, 'Caricamento gruppi merceologici...');
        try {
            const gruppiRaw = await APP.loadExcelFile(folderId, 'grupmerc.xlsx');
            await DB.saveGruppiMerceologici(APP.mapGruppiMerceologici(gruppiRaw));
        } catch(e) { console.warn('grupmerc.xlsx non trovato'); }

        setProgress(92, 'Estrazione locazioni...');
        try { await DB.extractLocazioniFromArticoli(); } catch(e) {}

        setProgress(96, 'Caricamento code...');
        await APP.loadSavedQueues();

        setProgress(100, 'Completato!');
        const stats = await DB.getStats();
        statusEl.className = 'status-message success';
        statusEl.textContent = `Caricati ${stats.articoli} articoli, ${stats.clienti} clienti, ${stats.fornitori} fornitori`;
        localStorage.setItem('picam_articoli_count', stats.articoli.toString());

        setTimeout(() => {
            APP.showScreen('menu');
            APP.updateMenuStats();
            APP.updateBadges();
        }, 1000);

    } catch(error) {
        console.error('Errore caricamento:', error);
        statusEl.className = 'status-message error';
        statusEl.textContent = 'Errore: ' + error.message;
        btnLoad.disabled = false;
    }
};

APP.skipLoadData = async function() {
    if (!confirm('Usare i dati già caricati?\n\nLe anagrafiche potrebbero non essere aggiornate.')) return;
    APP.saveConfigFromSetup();
    await APP.loadSavedQueues();
    APP.showScreen('menu');
    APP.updateMenuStats();
    APP.updateBadges();
    APP.showToast('Dati esistenti caricati', 'success');
};

// ---------- DRIVE HELPERS ----------

APP.findFolder = async function(folderPath) {
    const parts = folderPath.split('/').filter(p => p.trim());
    let parentId = 'root';
    for (const part of parts) {
        const query = `name='${part}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${APP.accessToken}` } });
        const data = await response.json();
        if (!data.files || data.files.length === 0) return null;
        parentId = data.files[0].id;
    }
    return parentId;
};

APP.loadExcelFile = async function(folderId, fileName) {
    const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${APP.accessToken}` } });
    const data = await response.json();
    if (!data.files || data.files.length === 0) throw new Error(`File "${fileName}" non trovato`);
    const fileId = data.files[0].id;
    const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${APP.accessToken}` } });
    const arrayBuffer = await fileResponse.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
};

// ---------- MAPPER DATI ----------

APP.mergeArticoli = function(articoli, codbar, artdep) {
    // Mappa barcode: codArt -> barcode
    const codbarMap = new Map();
    codbar.forEach(cb => {
        const codArt = (cb.cba_cod_art || cb.CBA_COD_ART || '').toString().trim();
        const barcode = (cb.cba_cod_bar || cb.CBA_COD_BAR || '').toString().trim();
        if (codArt && barcode) codbarMap.set(codArt, barcode);
    });

    // Mappa artdep: codArt -> { giacenza, locazione }  (usata come fallback)
    const artdepMap = new Map();
    artdep.forEach(ad => {
        const codArt = (ad.ard_cod || ad.ARD_COD || '').toString().trim();
        if (codArt) artdepMap.set(codArt, {
            giacenza: parseFloat(ad.ard_giac || ad.ARD_GIAC || 0) || 0,
            locazione: (ad.ard_loc || ad.ARD_LOC || '').toString().trim()
        });
    });

    return articoli.map(art => {
        const codice = (art.art_cod || art.ART_COD || '').toString().trim();
        const depInfo = artdepMap.get(codice) || { giacenza: 0, locazione: '' };

        // GRUPPO: campo reale art_gru_ven, fallback art_gru per compatibilita'
        const gruppo = (
            art.art_gru_ven || art.ART_GRU_VEN ||
            art.art_gru     || art.ART_GRU     || ''
        ).toString().trim();

        // LOCAZIONE: campo reale art_loc_mag in articoli.xlsx, fallback artdep
        const locazione = (
            art.art_loc_mag || art.ART_LOC_MAG ||
            depInfo.locazione || ''
        ).toString().trim();

        // GIACENZA: da artdep (piu' affidabile), fallback campo diretto
        const giacenza = parseFloat(
            depInfo.giacenza || art.art_giac || art.ART_GIAC || 0
        ) || 0;

        return {
            codice,
            des1:          (art.art_des_1 || art.ART_DES_1 || '').toString().trim(),
            des2:          (art.art_des_2 || art.ART_DES_2 || '').toString().trim(),
            um:            (art.art_uni_mis || art.ART_UNI_MIS || '').toString().trim(),
            gruppo,
            prezzo:         parseFloat(art.art_pre_ven     || art.ART_PRE_VEN     || 0) || 0,
            prezzoVendita:  parseFloat(art.art_prz_ult_ven || art.ART_PRZ_ULT_VEN || 0) || 0,
            prezzoAcquisto: parseFloat(art.art_prz_ult_acq || art.ART_PRZ_ULT_ACQ || 0) || 0,
            codIvaVendita:  (art.art_cod_iva_ven || art.ART_COD_IVA_VEN || art.art_cod_iva || art.ART_COD_IVA || '22').toString().trim(),
            codIvaAcquisto: (art.art_cod_iva_acq || art.ART_COD_IVA_ACQ || art.art_cod_iva || art.ART_COD_IVA || '22').toString().trim(),
            barcode:    codbarMap.get(codice) || '',
            giacenza,
            locazione
        };
    });
};

APP.mapClienti = function(raw) {
    return raw.map(cli => ({
        codice:     (cli.clc_cod_cli   || cli.CLC_COD_CLI   || '').toString().trim(),
        ragSoc1:    (cli.clc_rag_soc_1 || cli.CLC_RAG_SOC_1 || '').toString().trim(),
        ragSoc2:    (cli.clc_rag_soc_2 || cli.CLC_RAG_SOC_2 || '').toString().trim(),
        indirizzo:  (cli.clc_ind       || cli.CLC_IND       || '').toString().trim(),
        cap:        (cli.clc_cap       || cli.CLC_CAP       || '').toString().trim(),
        localita:   (cli.clc_loc       || cli.CLC_LOC       || '').toString().trim(),
        provincia:  (cli.clc_pro       || cli.CLC_PRO       || '').toString().trim(),
        telefono:   (cli.clc_tel       || cli.CLC_TEL       || '').toString().trim(),
        email:      (cli.clc_e_mail    || cli.CLC_E_MAIL    || '').toString().trim(),
        partitaIva: (cli.clc_par_iva   || cli.CLC_PAR_IVA   || '').toString().trim(),
        codFisc:    (cli.clc_cod_fis   || cli.CLC_COD_FIS   || '').toString().trim(),
        codPag:     (cli.clc_cod_pag   || cli.CLC_COD_PAG   || '').toString().trim(),
        codIva:     (cli.clc_cod_iva   || cli.CLC_COD_IVA   || '').toString().trim()
    }));
};

APP.mapFornitori = function(raw) {
    return raw.map(forn => ({
        codice:     (forn.foc_cod_for   || forn.FOC_COD_FOR   || '').toString().trim(),
        ragSoc1:    (forn.foc_rag_soc_1 || forn.FOC_RAG_SOC_1 || '').toString().trim(),
        ragSoc2:    (forn.foc_rag_soc_2 || forn.FOC_RAG_SOC_2 || '').toString().trim(),
        indirizzo:  (forn.foc_ind       || forn.FOC_IND       || '').toString().trim(),
        cap:        (forn.foc_cap       || forn.FOC_CAP       || '').toString().trim(),
        localita:   (forn.foc_loc       || forn.FOC_LOC       || '').toString().trim(),
        provincia:  (forn.foc_pro       || forn.FOC_PRO       || '').toString().trim(),
        telefono:   (forn.foc_tel       || forn.FOC_TEL       || '').toString().trim(),
        email:      (forn.foc_e_mail    || forn.FOC_E_MAIL    || '').toString().trim(),
        partitaIva: (forn.foc_par_iva   || forn.FOC_PAR_IVA   || '').toString().trim(),
        codFisc:    (forn.foc_cod_fis   || forn.FOC_COD_FIS   || '').toString().trim(),
        codPag:     (forn.foc_cod_pag   || forn.FOC_COD_PAG   || '').toString().trim()
    }));
};

APP.mapAliquoteIva = function(raw) {
    return raw.map(iva => ({
        codice:      (iva.iva_cod     || iva.IVA_COD     || '').toString().trim(),
        aliquota:    parseFloat(iva.iva_ali || iva.IVA_ALI || 0) || 0,
        descrizione: (iva.iva_des_sin || iva.IVA_DES_SIN || '').toString().trim()
    })).filter(i => i.codice);
};

APP.mapPagamenti = function(raw) {
    return raw.map(pag => ({
        codice:      (pag.pag_cod || pag.PAG_COD || '').toString().trim(),
        descrizione: (pag.pag_des || pag.PAG_DES || '').toString().trim()
    })).filter(p => p.codice);
};

APP.mapGruppiMerceologici = function(raw) {
    return raw
        .filter(g => (g.grm_tip_gru || g.GRM_TIP_GRU || '').toString().trim().toUpperCase() === 'V')
        .map(g => ({
            codice:      (g.grm_cod_gru || g.GRM_COD_GRU || '').toString().trim(),
            descrizione: (g.grm_des_gru || g.GRM_DES_GRU || '').toString().trim()
        }))
        .filter(g => g.codice);
};

// Cache IVA
APP.aliquoteIvaCache = new Map();
APP.getAliquotaIvaSync = function(codIva) {
    if (APP.aliquoteIvaCache.has(codIva)) return APP.aliquoteIvaCache.get(codIva);
    const n = parseFloat(codIva);
    return isNaN(n) ? 22 : n;
};
APP.getAliquotaIva = async function(codIva) {
    if (APP.aliquoteIvaCache.has(codIva)) return APP.aliquoteIvaCache.get(codIva);
    try {
        const iva = await DB.getAliquotaByCode(codIva);
        if (iva) { APP.aliquoteIvaCache.set(codIva, iva.aliquota); return iva.aliquota; }
    } catch(e) {}
    const n = parseFloat(codIva);
    return isNaN(n) ? 22 : n;
};

APP.loadSavedQueues = async function() {
    const lastNumCli = localStorage.getItem('picam_ordini_last_num');
    const lastNumFor = localStorage.getItem('picam_ordfor_last_num');
    if (lastNumCli) APP.currentOrdineClienti.numero  = parseInt(lastNumCli) + 1;
    if (lastNumFor) APP.currentOrdineFornitori.numero = parseInt(lastNumFor) + 1;
    // Recupera registri dalla config
    APP.currentOrdineClienti.registro  = APP.config.registroClienti;
    APP.currentOrdineFornitori.registro = APP.config.registroFornitori;
    const history = localStorage.getItem('picam_scan_history');
    if (history) try { APP.scanHistory = JSON.parse(history); } catch(e) {}
};

// ---------- NAVIGAZIONE ----------

APP.showScreen = function(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + screenName);
    if (el) el.classList.add('active');
};

APP.goToMenu = function() {
    APP.showScreen('menu');
    APP.updateMenuStats();
    APP.updateBadges();
};

APP.updateMenuStats = async function() {
    try {
        const stats = await DB.getStats();
        document.getElementById('stat-articoli').textContent  = APP.formatNumber(stats.articoli);
        document.getElementById('stat-clienti').textContent   = APP.formatNumber(stats.clienti);
        document.getElementById('stat-fornitori').textContent = APP.formatNumber(stats.fornitori);
    } catch(e) { console.error('Errore updateMenuStats:', e); }
};

APP.updateBadges = async function() {
    try {
        const inv  = await DB.countStore('queueInventario');
        const cli  = await DB.countStore('queueOrdiniClienti');
        const forn = await DB.countStore('queueOrdiniFornitori');
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || ''; };
        set('badge-inventario',      inv  || '');
        set('badge-ordini-clienti',  cli  || '');
        set('badge-ordini-fornitori',forn || '');
    } catch(e) {}
};

APP.updateHeaderQueueCount = async function(context) {
    let storeName, elId;
    switch(context) {
        case 'inv':      storeName = 'queueInventario';       elId = 'header-queue-count-inv';     break;
        case 'ordCli':   storeName = 'queueOrdiniClienti';    elId = 'header-queue-count-ord-cli';  break;
        case 'ordFor':   storeName = 'queueOrdiniFornitori';  elId = 'header-queue-count-ord-for';  break;
        default: return;
    }
    try {
        const count = await DB.countStore(storeName);
        const el = document.getElementById(elId);
        if (el) el.textContent = count > 0 ? count : '';
    } catch(e) {}
};

// ---------- RICERCA ARTICOLI ----------

APP.performSearch = async function(context) {
    let inputId, resultsId;
    switch(context) {
        case 'inv':        inputId = 'search-inv';           resultsId = 'results-inv';           break;
        case 'artOrdCli':  inputId = 'search-art-ord-cli';   resultsId = 'results-art-ord-cli';   break;
        case 'artOrdFor':  inputId = 'search-art-ord-for';   resultsId = 'results-art-ord-for';   break;
        case 'cliente':    inputId = 'search-cliente';       resultsId = 'results-cliente';        break;
        case 'fornitore':  inputId = 'search-fornitore';     resultsId = 'results-fornitore';      break;
        default: return;
    }
    const query = document.getElementById(inputId)?.value?.trim() || '';
    const container = document.getElementById(resultsId);
    if (!container) return;
    if (query.length < 2) { container.innerHTML = ''; return; }
    try {
        let results;
        if (context === 'cliente') {
            results = await DB.searchClienti(query);
            APP.renderSearchResults(results, container, context);
        } else if (context === 'fornitore') {
            results = await DB.searchFornitori(query);
            APP.renderSearchResults(results, container, context);
        } else {
            results = await DB.searchArticoli(query);
            results = APP.filterArticoliResults(results, context);
            APP.renderSearchResults(results, container, context);
        }
    } catch(e) { console.error('Errore ricerca:', e); }
};

APP.renderSearchResults = function(results, container, context) {
    if (!APP.searchResults) APP.searchResults = {};
    APP.searchResults[context] = results;
    if (results.length === 0) { container.innerHTML = '<div class="result-item empty">Nessun risultato</div>'; return; }
    const limit = Math.min(results.length, 30);
    let html = '';
    for (let i = 0; i < limit; i++) {
        const r = results[i];
        if (context === 'cliente') {
            html += `<div class="result-item" onclick="APP.onResultClick('${context}', ${i})">
                <div class="result-code">${r.codice}</div>
                <div class="result-desc">${r.ragSoc1}</div>
                <div class="result-sub">${r.localita || ''} ${r.provincia ? '('+r.provincia+')' : ''}</div>
            </div>`;
        } else if (context === 'fornitore') {
            html += `<div class="result-item" onclick="APP.onResultClick('${context}', ${i})">
                <div class="result-code">${r.codice}</div>
                <div class="result-desc">${r.ragSoc1}</div>
                <div class="result-sub">${r.localita || ''} ${r.provincia ? '('+r.provincia+')' : ''}</div>
            </div>`;
        } else {
            html += `<div class="result-item" onclick="APP.onResultClick('${context}', ${i})">
                <div class="result-code">${r.codice} ${r.barcode ? '📷' : ''}</div>
                <div class="result-desc">${r.des1}</div>
                <div class="result-sub">Giac: ${r.giacenza || 0} | ${r.locazione || '-'} | ${APP.formatCurrency(r.prezzoVendita || r.prezzo)}</div>
            </div>`;
        }
    }
    if (results.length > limit) html += `<div class="result-item empty">... e altri ${results.length - limit} risultati</div>`;
    container.innerHTML = html;
};

APP.onResultClick = function(context, index) {
    const results = APP.searchResults?.[context];
    if (!results || !results[index]) return;
    const item = results[index];
    if (context === 'cliente') {
        APP.handleSelectCliente(item);
    } else if (context === 'fornitore') {
        APP.handleSelectFornitore(item);
    } else {
        APP.handleSelectArticolo(item, context);
    }
};

APP.handleSelectArticolo = function(articolo, context) {
    let appContext;
    switch(context) {
        case 'inv':       appContext = 'inventario';       break;
        case 'artOrdCli': appContext = 'ordiniClienti';    break;
        case 'artOrdFor': appContext = 'ordiniFornitori';  break;
        default:          appContext = context;
    }
    APP.selectedArticolo = articolo;
    APP.qtyContext = context;
    APP.currentContext = appContext;
    // Chiudi risultati ricerca
    const map = { inv:'results-inv', artOrdCli:'results-art-ord-cli', artOrdFor:'results-art-ord-for' };
    const resEl = document.getElementById(map[context]);
    if (resEl) resEl.innerHTML = '';
    // Salva posizione scroll SOLO se siamo in modalità tabellare inventario
    if (appContext === 'inventario' && (APP.invMode === 'locazione' || APP.invMode === 'gruppo')) {
        const cont = document.querySelector('.inv-tab-table-container');
        if (cont) APP.invTabellareScrollPos = cont.scrollTop;
    }
    APP.openQtyModal();
};

APP.handleSelectCliente = function(cliente) {
    APP.currentOrdineClienti.cliente = cliente;
    document.getElementById('results-cliente').innerHTML = '';
    document.getElementById('search-cliente').value = '';
    APP.renderSelectedCliente();
    APP.updateBtnConfermaOrdCli();
};

APP.handleSelectFornitore = function(fornitore) {
    APP.currentOrdineFornitori.fornitore = fornitore;
    document.getElementById('results-fornitore').innerHTML = '';
    document.getElementById('search-fornitore').value = '';
    APP.renderSelectedFornitore();
    APP.updateBtnConfermaOrdFor();
};

// Filtri articoli
APP.articoliFilters = {};
APP.toggleArticoliFilters = async function(context) {
    const filtersEl = document.getElementById(`articoli-filters-${context}`);
    if (!filtersEl) return;
    filtersEl.classList.toggle('hidden');
    if (!filtersEl.classList.contains('hidden')) {
        await APP.loadArticoliFilterOptions(context);
    }
};
APP.loadArticoliFilterOptions = async function(context) {
    try {
        const gruppi = await DB.getAllGruppiMerceologici();
        const gruppiSel = document.getElementById(`filter-gruppo-${context}`);
        if (gruppiSel) {
            const cur = gruppiSel.value;
            gruppiSel.innerHTML = '<option value="">📦 Tutti i gruppi</option>';
            gruppi.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.codice; opt.textContent = `${g.codice} - ${g.descrizione}`;
                gruppiSel.appendChild(opt);
            });
            gruppiSel.value = cur;
        }
        const locazioni = await DB.getAllLocazioni();
        const locSel = document.getElementById(`filter-locazione-${context}`);
        if (locSel) {
            const cur = locSel.value;
            locSel.innerHTML = '<option value="">📍 Tutte le locazioni</option>';
            locazioni.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.codice; opt.textContent = l.codice;
                locSel.appendChild(opt);
            });
            locSel.value = cur;
        }
    } catch(e) {}
};
APP.applyArticoliFilters = function(context) { APP.performSearch(context); };
APP.resetArticoliFilters = function(context) {
    ['filter-gruppo', 'filter-locazione', 'filter-giacenza'].forEach(p => {
        const el = document.getElementById(`${p}-${context}`);
        if (el) el.value = '';
    });
    APP.performSearch(context);
};
APP.filterArticoliResults = function(articoli, context) {
    const gEl  = document.getElementById(`filter-gruppo-${context}`);
    const lEl  = document.getElementById(`filter-locazione-${context}`);
    const giacEl = document.getElementById(`filter-giacenza-${context}`);
    const grupo   = gEl?.value   || '';
    const loc     = lEl?.value   || '';
    const giacenza = giacEl?.value || '';
    return articoli.filter(a => {
        if (grupo && a.gruppo !== grupo) return false;
        if (loc   && a.locazione !== loc) return false;
        if (giacenza === 'positive' && !(a.giacenza > 0)) return false;
        if (giacenza === 'zero'     && a.giacenza !== 0)  return false;
        if (giacenza === 'negative' && !(a.giacenza < 0)) return false;
        return true;
    });
};

// Ricerca tramite barcode
APP.selectArticolo = async function(codice, context) {
    try {
        let articolo = await DB.getArticoloByCode(codice);
        if (!articolo) articolo = await DB.getArticoloByBarcode(codice);
        if (articolo) {
            APP.handleSelectArticolo(articolo, context);
            return true;
        }
    } catch(e) {}
    return false;
};

// ---------- MODAL QUANTITÀ ----------

APP.openQtyModal = async function() {
    const articolo = APP.selectedArticolo;
    if (!articolo) return;

    document.getElementById('qty-articolo-desc').textContent = articolo.des1;
    document.getElementById('qty-articolo-code').textContent = articolo.codice;
    document.getElementById('numpad-value').textContent = '1';
    document.getElementById('numpad-value').dataset.fresh = 'true';

    // Campo locazione (solo inventario)
    const locCont  = document.getElementById('qty-locazione-container');
    const locInput = document.getElementById('qty-locazione-input');
    const locList  = document.getElementById('locazioni-list');
    if (APP.currentContext === 'inventario') {
        locCont.classList.remove('hidden');
        locInput.value = articolo.locazione || '';
        try {
            const locazioni = await DB.getAllLocazioni();
            locList.innerHTML = locazioni.map(l => `<option value="${l.codice}">`).join('');
        } catch(e) { locList.innerHTML = ''; }
    } else {
        locCont.classList.add('hidden');
        locInput.value = '';
    }

    // Campo prezzo: visibile per ENTRAMBI ordini clienti e fornitori
    const przCont  = document.getElementById('qty-prezzo-container');
    const przInput = document.getElementById('qty-prezzo-input');
    const przLabel = document.getElementById('qty-prezzo-label');
    if (APP.currentContext === 'ordiniFornitori') {
        przCont.classList.remove('hidden');
        if (przLabel) przLabel.textContent = 'Prezzo acquisto (opzionale):';
        przInput.style.backgroundColor = '#fffde7';
        const def = articolo.prezzoAcquisto || 0;
        przInput.value = def > 0 ? def.toFixed(2) : '';
    } else if (APP.currentContext === 'ordiniClienti') {
        przCont.classList.remove('hidden');
        if (przLabel) przLabel.textContent = 'Prezzo vendita (opzionale):';
        przInput.style.backgroundColor = '#e8f5e9';
        const def = articolo.prezzoVendita || articolo.prezzo || 0;
        przInput.value = def > 0 ? def.toFixed(2) : '';
    } else {
        przCont.classList.add('hidden');
        przInput.value = '';
    }

    document.getElementById('modal-qty').classList.remove('hidden');
    // Focus sul display per input immediato
    setTimeout(() => document.getElementById('numpad-value')?.focus(), 100);
};

APP.clearLocazioneInput = function() {
    document.getElementById('qty-locazione-input').value = '';
};

APP.closeQtyModal = function() {
    document.getElementById('modal-qty').classList.add('hidden');
    APP.selectedArticolo = null;
    APP.qtyContext = null;
};

APP.numpadInput = function(digit) {
    const display = document.getElementById('numpad-value');
    let value = display.textContent;
    if (display.dataset.fresh === 'true') {
        value = digit;
    } else {
        if (value === '0') value = digit;
        else value += digit;
    }
    display.textContent = value;
    display.dataset.fresh = 'false';
};

APP.numpadClear = function() {
    const display = document.getElementById('numpad-value');
    display.textContent = '0';
    display.dataset.fresh = 'true';
};

APP.numpadBackspace = function() {
    const display = document.getElementById('numpad-value');
    const value = display.textContent;
    display.textContent = value.length > 1 ? value.slice(0, -1) : '0';
};

APP.numpadConfirm = function() {
    const qty = parseInt(document.getElementById('numpad-value').textContent) || 0;
    if (qty <= 0) { APP.showToast('Quantità non valida', 'error'); return; }

    // Prezzo per ordini clienti e fornitori
    let prezzoInserito = null;
    if (APP.currentContext === 'ordiniFornitori' || APP.currentContext === 'ordiniClienti') {
        const przInput = document.getElementById('qty-prezzo-input');
        if (przInput && przInput.value) prezzoInserito = parseFloat(przInput.value) || null;
    }

    // Locazione per inventario
    let locazioneInserita = null;
    if (APP.currentContext === 'inventario') {
        const locInput = document.getElementById('qty-locazione-input');
        if (locInput && locInput.value.trim()) locazioneInserita = locInput.value.trim();
    }

    document.getElementById('modal-qty').classList.add('hidden');
    APP.processArticoloWithQty(qty, prezzoInserito, locazioneInserita);
};

APP.processArticoloWithQty = async function(qty, prezzoInserito = null, locazioneInserita = null) {
    const articolo = APP.selectedArticolo;
    const context = APP.currentContext;
    if (!articolo) return;

    switch(context) {
        case 'inventario':
            await APP.addToInventarioQueue(articolo, qty, locazioneInserita);
            APP.addToHistory(articolo, qty);
            APP.playBeep();
            APP.vibrate(50);
            APP.showToast(`${articolo.codice} → qty ${qty}`, 'success');
            // Aggiorna il campo readonly nella tabella se siamo in modalità tabellare
            if (APP.invMode === 'locazione' || APP.invMode === 'gruppo') {
                // Trova l'indice dell'articolo nella tabella
                const tabIdx = APP.invTabellareData.findIndex(a => a.codice === articolo.codice);
                if (tabIdx >= 0) {
                    APP.invTabellareData[tabIdx].qtyInventario = qty;
                    const input = document.querySelector(`input[data-index="${tabIdx}"]`);
                    if (input) {
                        input.value = qty;
                        input.classList.add('has-value');
                        // Disabilita il pulsante +
                        const btn = input?.parentElement?.nextElementSibling?.querySelector('button');
                        if (btn) btn.disabled = true;
                    }
                    // Aggiorna contatore
                    const countWithQty = APP.invTabellareData.filter(a => a.qtyInventario > 0).length;
                    const countEl = document.getElementById('inv-tab-count');
                    if (countEl) countEl.textContent = countWithQty;
                    const actEl = document.getElementById('inv-tab-actions');
                    if (actEl) actEl.style.display = 'block';
                }
                // Ripristina posizione scroll e highlight
                requestAnimationFrame(() => {
                    const cont = document.querySelector('.inv-tab-table-container');
                    if (cont) cont.scrollTop = APP.invTabellareScrollPos;
                    if (APP.invFocusIndex >= 0) APP.highlightTabellareRow(APP.invFocusIndex);
                });
            }
            break;
        case 'ordiniClienti':
            APP.addRigaOrdineCliente(articolo, qty, prezzoInserito);
            APP.showToast(`${articolo.codice} aggiunto`, 'success');
            break;
        case 'ordiniFornitori':
            APP.addRigaOrdineFornitore(articolo, qty, prezzoInserito);
            APP.showToast(`${articolo.codice} aggiunto`, 'success');
            break;
    }

    APP.selectedArticolo = null;
    APP.qtyContext = null;
    APP.updateHeaderQueueCount(context === 'inventario' ? 'inv' : context === 'ordiniClienti' ? 'ordCli' : 'ordFor');
};

// ---------- SCANNER ----------

APP.startScan = function(context) {
    APP.scanMode = context;
    const overlay = document.getElementById('scanner-overlay');
    const hint = document.getElementById('scanner-hint');
    overlay.classList.remove('hidden');
    let fastMode = false;
    switch(context) {
        case 'inv':    fastMode = APP.fastScanMode.inv;    break;
        case 'ordCli': fastMode = APP.fastScanMode.ordCli; break;
        case 'ordFor': fastMode = APP.fastScanMode.ordFor; break;
    }
    if (hint) { hint.classList.toggle('hidden', !fastMode); }
    try {
        APP.html5QrCode = new Html5Qrcode('scanner-reader');
        APP.html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 150 } },
            APP.onScanSuccess,
            (error) => {}
        ).catch(e => {
            APP.showToast('Errore apertura camera: ' + e.message, 'error');
            overlay.classList.add('hidden');
        });
    } catch(e) {
        APP.showToast('Scanner non disponibile', 'error');
        overlay.classList.add('hidden');
    }
};

APP.stopScan = function() {
    if (APP.html5QrCode) {
        APP.html5QrCode.stop().catch(() => {}).finally(() => {
            APP.html5QrCode.clear();
            APP.html5QrCode = null;
        });
    }
    document.getElementById('scanner-overlay').classList.add('hidden');
    APP.scanMode = null;
};

APP.onScanSuccess = async function(barcode) {
    APP.playBeep(); APP.vibrate(50);
    const context = APP.scanMode;
    let searchContext;
    switch(context) {
        case 'inv':    searchContext = 'inv';       APP.currentContext = 'inventario';       APP.qtyContext = 'inv';       break;
        case 'ordCli': searchContext = 'artOrdCli'; APP.currentContext = 'ordiniClienti';    APP.qtyContext = 'artOrdCli'; break;
        case 'ordFor': searchContext = 'artOrdFor'; APP.currentContext = 'ordiniFornitori';  APP.qtyContext = 'artOrdFor'; break;
        default: return;
    }
    let articolo = await DB.getArticoloByBarcode(barcode);
    if (!articolo) articolo = await DB.getArticoloByCode(barcode);
    if (!articolo) { APP.showToast(`Articolo non trovato: ${barcode}`, 'error'); return; }
    APP.selectedArticolo = articolo;
    let fastMode = false;
    switch(context) {
        case 'inv':    fastMode = APP.fastScanMode.inv;    break;
        case 'ordCli': fastMode = APP.fastScanMode.ordCli; break;
        case 'ordFor': fastMode = APP.fastScanMode.ordFor; break;
    }
    if (fastMode) {
        APP.stopScan();
        await APP.processArticoloWithQty(1, null, null);
    } else {
        APP.stopScan();
        await APP.openQtyModal();
    }
};

APP.toggleFastScan = function(mode) {
    switch(mode) {
        case 'inv':    APP.fastScanMode.inv    = document.getElementById('fast-scan-inv')?.checked    || false; break;
        case 'ordCli': APP.fastScanMode.ordCli = document.getElementById('fast-scan-ord-cli')?.checked || false; break;
        case 'ordFor': APP.fastScanMode.ordFor = document.getElementById('fast-scan-ord-for')?.checked || false; break;
    }
};

// ---------- CRONOLOGIA SCANSIONI ----------

APP.addToHistory = function(articolo, qty) {
    APP.scanHistory.unshift({ codice: articolo.codice, des1: articolo.des1, qty, time: Date.now() });
    APP.scanHistory = APP.scanHistory.slice(0, 10);
    localStorage.setItem('picam_scan_history', JSON.stringify(APP.scanHistory));
    APP.renderHistory();
};

APP.renderHistory = function() {
    const container = document.getElementById('history-inv');
    const card = document.getElementById('history-inv-card');
    if (!container) return;
    if (APP.scanHistory.length === 0) {
        if (card) card.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    if (card) card.style.display = 'block';
    container.innerHTML = APP.scanHistory.map(h => `
        <div class="history-item">
            <span class="history-code">${h.codice}</span>
            <span class="history-desc">${(h.des1 || '').substring(0, 25)}</span>
            <span class="history-qty">×${h.qty}</span>
        </div>
    `).join('');
};

// ---------- INIT APP ----------

APP.initWithAuth = async function() {
    try {
        await DB.init();
        const stats = await DB.getStats();
        if (stats.articoli > 0) {
            await APP.loadSavedQueues();
            APP.showScreen('menu');
            APP.updateMenuStats();
            APP.updateBadges();
            APP.showToast(`Bentornato! ${stats.articoli} articoli`, 'success');
            if (APP.accessToken) {
                APP.loadStoricoFromDrive().catch(e => console.warn('Storico non caricato:', e));
            }
        } else {
            APP.showScreen('setup');
            document.getElementById('step-login').classList.add('completed');
            document.getElementById('step-config').classList.remove('disabled');
            document.getElementById('step-load').classList.remove('disabled');
            document.getElementById('login-status').textContent = `Connesso come ${APP.userEmail}`;
            document.getElementById('login-status').className = 'status-message success';
            APP.checkSkipButton();
        }
    } catch(e) {
        console.error('Errore init DB:', e);
        APP.showScreen('setup');
        APP.checkSkipButton();
    }
};

document.addEventListener('DOMContentLoaded', async function() {
    console.log('PICAM v4.01 - Inizializzazione...');

    // Carica configurazione
    APP.loadConfig();
    APP.applyConfigToSetup();

    const waitForGoogle = () => new Promise(resolve => {
        if (typeof google !== 'undefined' && google.accounts) { resolve(); return; }
        const check = setInterval(() => {
            if (typeof google !== 'undefined' && google.accounts) { clearInterval(check); resolve(); }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 3000);
    });

    if (APP.checkAuth()) {
        await APP.initWithAuth();
    } else {
        const savedEmail = localStorage.getItem('picam_user_email');
        if (savedEmail) {
            document.getElementById('login-status').className = 'status-message loading';
            document.getElementById('login-status').textContent = 'Accesso automatico...';
            await waitForGoogle();
            const success = await APP.tryAutoLogin();
            if (success) {
                await APP.initWithAuth();
            } else {
                document.getElementById('login-status').className = 'status-message';
                document.getElementById('login-status').textContent = `Tocca per accedere come ${savedEmail}`;
                APP.showScreen('setup');
                APP.checkSkipButton();
            }
        } else {
            APP.showScreen('setup');
            APP.checkSkipButton();
        }
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(() => console.log('SW registrato'))
            .catch(e => console.error('Errore SW:', e));
    });
}
