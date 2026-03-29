// ==========================================
// PICAM v3.0 - Main Application
// Ottimizzato per grandi database
// ==========================================

const APP = {
    // Stato applicazione
    accessToken: null,
    tokenExpiry: null,
    userEmail: null,
    config: {
        folder: 'archivi/Ordini',
        deposito: '01'
    },
    
    // Scanner
    html5QrCode: null,
    scanMode: null,
    fastScanMode: { inv: false, ordCli: false, ordFor: false },
    
    // Ordine corrente clienti
    currentOrdineClienti: {
        cliente: null,
        righe: [],
        registro: '01',
        numero: 1
    },
    
    // Ordine corrente fornitori
    currentOrdineFornitori: {
        fornitore: null,
        righe: [],
        registro: '01',
        numero: 1
    },
    
    // Debounce timers
    searchTimers: {},
    
    // Articolo selezionato per quantità
    selectedArticolo: null,
    qtyContext: null,
    
    // Cronologia scansioni
    scanHistory: [],
    
    // Context per queue modal
    queueContext: null
};

// ==========================================
// GOOGLE OAUTH CON LOGIN AUTOMATICO
// ==========================================

const GOOGLE_CLIENT_ID = '780777046643-ebl7m87qcoldp3c8sg9c1u5dfqjdgl42.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive';

// Tenta login automatico silenzioso
APP.tryAutoLogin = function() {
    return new Promise((resolve) => {
        const savedEmail = localStorage.getItem('picam_user_email');
        
        if (!savedEmail) {
            resolve(false);
            return;
        }
        
        console.log('Tentativo login automatico per:', savedEmail);
        
        const client = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_SCOPES,
            hint: savedEmail,
            prompt: '', // Login silenzioso se già autorizzato
            callback: (response) => {
                if (response.access_token) {
                    APP.accessToken = response.access_token;
                    APP.tokenExpiry = Date.now() + (response.expires_in * 1000);
                    APP.userEmail = savedEmail;
                    
                    localStorage.setItem('picam_access_token', APP.accessToken);
                    localStorage.setItem('picam_token_expiry', APP.tokenExpiry.toString());
                    
                    console.log('Login automatico riuscito!');
                    resolve(true);
                } else {
                    console.log('Login automatico fallito, richiesto login manuale');
                    resolve(false);
                }
            },
            error_callback: (error) => {
                console.log('Login automatico non disponibile:', error);
                resolve(false);
            }
        });
        
        // Timeout per evitare blocchi
        setTimeout(() => resolve(false), 5000);
        
        try {
            client.requestAccessToken({ prompt: '' });
        } catch (e) {
            console.log('Errore login automatico:', e);
            resolve(false);
        }
    });
};

// Login manuale (con popup)
APP.login = function() {
    const statusEl = document.getElementById('login-status');
    statusEl.className = 'status-message loading';
    statusEl.textContent = 'Connessione in corso...';
    
    const savedEmail = localStorage.getItem('picam_user_email');
    
    const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        hint: savedEmail || '', // Pre-seleziona account se salvato
        callback: (response) => {
            if (response.access_token) {
                APP.accessToken = response.access_token;
                APP.tokenExpiry = Date.now() + (response.expires_in * 1000);
                
                // Salva in localStorage
                localStorage.setItem('picam_access_token', APP.accessToken);
                localStorage.setItem('picam_token_expiry', APP.tokenExpiry.toString());
                
                // Ottieni info utente
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
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${APP.accessToken}` }
        });
        
        const data = await response.json();
        APP.userEmail = data.email;
        localStorage.setItem('picam_user_email', APP.userEmail);
        
        // Aggiorna UI
        document.getElementById('login-status').className = 'status-message success';
        document.getElementById('login-status').textContent = `Connesso come ${APP.userEmail}`;
        
        document.getElementById('step-login').classList.add('completed');
        document.getElementById('step-config').classList.remove('disabled');
        document.getElementById('step-load').classList.remove('disabled');
        
        // Pre-compila configurazione salvata
        document.getElementById('config-folder').value = APP.config.folder;
        document.getElementById('config-deposito').value = APP.config.deposito;
        
        // Verifica se ci sono dati esistenti e mostra pulsante "Salta"
        try {
            await DB.init();
            const stats = await DB.getStats();
            if (stats.articoli > 0) {
                document.getElementById('btn-skip-load').classList.remove('hidden');
                document.getElementById('load-status').textContent = `${stats.articoli} articoli già caricati`;
                document.getElementById('load-status').className = 'status-message success';
            }
        } catch (e) {
            console.log('DB non inizializzato, skip non disponibile');
        }
        
    } catch (error) {
        console.error('Errore getUserInfo:', error);
        document.getElementById('login-status').className = 'status-message error';
        document.getElementById('login-status').textContent = 'Errore nel recupero info utente';
    }
};

APP.checkAuth = function() {
    const token = localStorage.getItem('picam_access_token');
    const expiry = localStorage.getItem('picam_token_expiry');
    const email = localStorage.getItem('picam_user_email');
    
    if (token && expiry && Date.now() < parseInt(expiry)) {
        APP.accessToken = token;
        APP.tokenExpiry = parseInt(expiry);
        APP.userEmail = email;
        return true;
    }
    return false;
};

// Verifica se token sta per scadere (meno di 5 minuti)
APP.isTokenExpiring = function() {
    if (!APP.tokenExpiry) return true;
    return (APP.tokenExpiry - Date.now()) < 300000; // 5 minuti
};

// Rinnova token se necessario prima di operazioni critiche
APP.ensureValidToken = async function() {
    if (APP.isTokenExpiring()) {
        console.log('Token in scadenza, rinnovo...');
        const success = await APP.tryAutoLogin();
        if (!success) {
            APP.showToast('Sessione scaduta, effettua nuovamente il login', 'error');
            APP.showScreen('setup');
            return false;
        }
    }
    return true;
};

APP.logout = function() {
    if (!confirm('Vuoi disconnetterti?')) return;
    
    localStorage.removeItem('picam_access_token');
    localStorage.removeItem('picam_token_expiry');
    // NON rimuoviamo email e config per il prossimo login
    
    APP.accessToken = null;
    APP.tokenExpiry = null;
    
    APP.showScreen('setup');
    APP.closeSettings();
    
    // Reset UI setup
    document.getElementById('step-login').classList.remove('completed');
    document.getElementById('step-config').classList.add('disabled');
    document.getElementById('step-load').classList.add('disabled');
    document.getElementById('login-status').textContent = '';
};

// ==========================================
// CARICAMENTO DATI
// ==========================================

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
        // Salva configurazione
        APP.config.folder = document.getElementById('config-folder').value || 'archivi/Ordini';
        APP.config.deposito = document.getElementById('config-deposito').value || '01';
        localStorage.setItem('picam_config', JSON.stringify(APP.config));
        
        // Inizializza IndexedDB
        progressText.textContent = 'Inizializzazione database...';
        progressFill.style.width = '5%';
        await DB.init();
        
        // Trova la cartella su Drive
        progressText.textContent = 'Ricerca cartella su Drive...';
        progressFill.style.width = '10%';
        
        const folderId = await APP.findFolder(APP.config.folder);
        if (!folderId) {
            throw new Error(`Cartella "${APP.config.folder}" non trovata su Google Drive`);
        }
        
        // Carica articoli.xlsx
        progressText.textContent = 'Caricamento articoli...';
        progressFill.style.width = '20%';
        const articoli = await APP.loadExcelFile(folderId, 'articoli.xlsx');
        
        // Carica codbar.xlsx
        progressText.textContent = 'Caricamento codici a barre...';
        progressFill.style.width = '35%';
        const codbar = await APP.loadExcelFile(folderId, 'codbar.xlsx');
        
        // Carica artdep.xlsx
        progressText.textContent = 'Caricamento giacenze...';
        progressFill.style.width = '50%';
        const artdep = await APP.loadExcelFile(folderId, 'artdep.xlsx');
        
        // Merge articoli
        progressText.textContent = 'Elaborazione articoli...';
        progressFill.style.width = '60%';
        const mergedArticoli = APP.mergeArticoli(articoli, codbar, artdep);
        
        // Salva articoli in IndexedDB
        progressText.textContent = 'Salvataggio articoli...';
        await DB.saveArticoli(mergedArticoli, (percent) => {
            progressFill.style.width = (60 + percent * 0.1) + '%';
        });
        
        // Carica clicom.xlsx (clienti)
        progressText.textContent = 'Caricamento clienti...';
        progressFill.style.width = '75%';
        const clientiRaw = await APP.loadExcelFile(folderId, 'clicom.xlsx');
        const clienti = APP.mapClienti(clientiRaw);
        await DB.saveClienti(clienti);
        
        // Carica forcom.xlsx (fornitori)
        progressText.textContent = 'Caricamento fornitori...';
        progressFill.style.width = '85%';
        try {
            const fornitoriRaw = await APP.loadExcelFile(folderId, 'forcom.xlsx');
            const fornitori = APP.mapFornitori(fornitoriRaw);
            await DB.saveFornitori(fornitori);
        } catch (e) {
            console.warn('forcom.xlsx non trovato, continuo senza fornitori');
        }
        
        // Carica code salvate
        progressText.textContent = 'Caricamento code...';
        progressFill.style.width = '95%';
        await APP.loadSavedQueues();
        
        // Completato
        progressFill.style.width = '100%';
        progressText.textContent = 'Completato!';
        
        statusEl.className = 'status-message success';
        const stats = await DB.getStats();
        statusEl.textContent = `Caricati ${stats.articoli} articoli, ${stats.clienti} clienti, ${stats.fornitori} fornitori`;
        
        // Vai al menu dopo 1 secondo
        setTimeout(() => {
            APP.showScreen('menu');
            APP.updateMenuStats();
            APP.updateBadges();
        }, 1000);
        
    } catch (error) {
        console.error('Errore caricamento:', error);
        statusEl.className = 'status-message error';
        statusEl.textContent = 'Errore: ' + error.message;
        btnLoad.disabled = false;
    }
};

// Salta caricamento e usa dati esistenti
APP.skipLoadData = async function() {
    const conferma = confirm('Usare i dati già caricati?\n\nLe anagrafiche potrebbero non essere aggiornate.');
    
    if (!conferma) return;
    
    // Salva configurazione corrente
    APP.config.folder = document.getElementById('config-folder').value || 'archivi/Ordini';
    APP.config.deposito = document.getElementById('config-deposito').value || '01';
    localStorage.setItem('picam_config', JSON.stringify(APP.config));
    
    // Vai direttamente al menu
    await APP.loadSavedQueues();
    APP.showScreen('menu');
    APP.updateMenuStats();
    APP.updateBadges();
    APP.showToast('Dati esistenti caricati', 'success');
};

APP.findFolder = async function(folderPath) {
    const parts = folderPath.split('/').filter(p => p.trim());
    let parentId = 'root';
    
    for (const part of parts) {
        const query = `name='${part}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${APP.accessToken}` }
        });
        
        const data = await response.json();
        
        if (!data.files || data.files.length === 0) {
            return null;
        }
        
        parentId = data.files[0].id;
    }
    
    return parentId;
};

APP.loadExcelFile = async function(folderId, fileName) {
    // Cerca il file nella cartella
    const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${APP.accessToken}` }
    });
    
    const data = await response.json();
    
    if (!data.files || data.files.length === 0) {
        throw new Error(`File "${fileName}" non trovato`);
    }
    
    const fileId = data.files[0].id;
    
    // Scarica il contenuto
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const fileResponse = await fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${APP.accessToken}` }
    });
    
    const arrayBuffer = await fileResponse.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    return XLSX.utils.sheet_to_json(worksheet, { defval: '' });
};

APP.mergeArticoli = function(articoli, codbar, artdep) {
    // Crea mappe per lookup veloce
    const codbarMap = new Map();
    codbar.forEach(cb => {
        const codArt = cb.cba_cod_art || cb.CBA_COD_ART || '';
        const barcode = cb.cba_cod_bar || cb.CBA_COD_BAR || '';
        if (codArt && barcode) {
            codbarMap.set(codArt.toString().trim(), barcode.toString().trim());
        }
    });
    
    const artdepMap = new Map();
    artdep.forEach(ad => {
        const codArt = ad.ard_cod || ad.ARD_COD || '';
        const giac = ad.ard_giac || ad.ARD_GIAC || 0;
        const loc = ad.ard_loc || ad.ARD_LOC || '';
        if (codArt) {
            artdepMap.set(codArt.toString().trim(), { giacenza: giac, locazione: loc });
        }
    });
    
    // Merge
    return articoli.map(art => {
        const codice = (art.art_cod || art.ART_COD || '').toString().trim();
        const des1 = (art.art_des_1 || art.ART_DES_1 || '').toString().trim();
        const des2 = (art.art_des_2 || art.ART_DES_2 || '').toString().trim();
        const um = (art.art_uni_mis || art.ART_UNI_MIS || '').toString().trim();
        const gruppo = (art.art_gru || art.ART_GRU || '').toString().trim();
        const prezzo = parseFloat(art.art_pre_ven || art.ART_PRE_VEN || 0) || 0;
        const prezzoVendita = parseFloat(art.art_prz_ult_ven || art.ART_PRZ_ULT_VEN || 0) || 0;
        const prezzoAcquisto = parseFloat(art.art_prz_ult_acq || art.ART_PRZ_ULT_ACQ || 0) || 0;
        const codIva = (art.art_cod_iva || art.ART_COD_IVA || '22').toString().trim();
        const aliquotaIva = parseFloat(codIva) || 22;
        
        const barcode = codbarMap.get(codice) || '';
        const depInfo = artdepMap.get(codice) || { giacenza: 0, locazione: '' };
        
        return {
            codice,
            des1,
            des2,
            um,
            gruppo,
            prezzo,
            prezzoVendita,
            prezzoAcquisto,
            codIva,
            aliquotaIva,
            barcode,
            giacenza: depInfo.giacenza,
            locazione: depInfo.locazione
        };
    });
};

APP.mapClienti = function(clientiRaw) {
    return clientiRaw.map(cli => ({
        codice: (cli.clc_cod_cli || cli.CLC_COD_CLI || '').toString().trim(),
        ragSoc1: (cli.clc_rag_soc_1 || cli.CLC_RAG_SOC_1 || '').toString().trim(),
        ragSoc2: (cli.clc_rag_soc_2 || cli.CLC_RAG_SOC_2 || '').toString().trim(),
        indirizzo: (cli.clc_ind || cli.CLC_IND || '').toString().trim(),
        cap: (cli.clc_cap || cli.CLC_CAP || '').toString().trim(),
        localita: (cli.clc_loc || cli.CLC_LOC || '').toString().trim(),
        provincia: (cli.clc_pro || cli.CLC_PRO || '').toString().trim(),
        telefono: (cli.clc_tel || cli.CLC_TEL || '').toString().trim(),
        email: (cli.clc_e_mail || cli.CLC_E_MAIL || '').toString().trim(),
        partitaIva: (cli.clc_par_iva || cli.CLC_PAR_IVA || '').toString().trim(),
        codPag: (cli.clc_cod_pag || cli.CLC_COD_PAG || '').toString().trim()
    }));
};

APP.mapFornitori = function(fornitoriRaw) {
    return fornitoriRaw.map(forn => ({
        codice: (forn.foc_cod_for || forn.FOC_COD_FOR || '').toString().trim(),
        ragSoc1: (forn.foc_rag_soc_1 || forn.FOC_RAG_SOC_1 || '').toString().trim(),
        ragSoc2: (forn.foc_rag_soc_2 || forn.FOC_RAG_SOC_2 || '').toString().trim(),
        indirizzo: (forn.foc_ind || forn.FOC_IND || '').toString().trim(),
        cap: (forn.foc_cap || forn.FOC_CAP || '').toString().trim(),
        localita: (forn.foc_loc || forn.FOC_LOC || '').toString().trim(),
        provincia: (forn.foc_pro || forn.FOC_PRO || '').toString().trim(),
        telefono: (forn.foc_tel || forn.FOC_TEL || '').toString().trim(),
        email: (forn.foc_e_mail || forn.FOC_E_MAIL || '').toString().trim(),
        partitaIva: (forn.foc_par_iva || forn.FOC_PAR_IVA || '').toString().trim(),
        codPag: (forn.foc_cod_pag || forn.FOC_COD_PAG || '').toString().trim()
    }));
};

APP.loadSavedQueues = async function() {
    // Carica numeri ordine salvati
    const lastNumCli = localStorage.getItem('picam_ordini_last_num');
    const lastNumFor = localStorage.getItem('picam_ordfor_last_num');
    
    if (lastNumCli) {
        APP.currentOrdineClienti.numero = parseInt(lastNumCli) + 1;
    }
    if (lastNumFor) {
        APP.currentOrdineFornitori.numero = parseInt(lastNumFor) + 1;
    }
    
    // Carica cronologia scansioni
    const history = localStorage.getItem('picam_scan_history');
    if (history) {
        APP.scanHistory = JSON.parse(history);
    }
};

APP.refreshData = async function() {
    APP.closeSettings();
    APP.showScreen('setup');
    
    // Reset step UI
    document.getElementById('step-login').classList.add('completed');
    document.getElementById('step-config').classList.remove('disabled');
    document.getElementById('step-load').classList.remove('disabled');
    document.getElementById('login-status').textContent = `Connesso come ${APP.userEmail}`;
    document.getElementById('login-status').className = 'status-message success';
    
    // Pre-compila configurazione
    document.getElementById('config-folder').value = APP.config.folder;
    document.getElementById('config-deposito').value = APP.config.deposito;
    
    // Abilita pulsante carica
    document.getElementById('btn-load-data').disabled = false;
    document.getElementById('load-progress').classList.add('hidden');
    document.getElementById('load-status').textContent = '';
};

// ==========================================
// NAVIGAZIONE
// ==========================================

APP.showScreen = function(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + screenName).classList.add('active');
};

APP.goToMenu = function() {
    APP.showScreen('menu');
    APP.updateMenuStats();
    APP.updateBadges();
};

APP.openInventario = function() {
    APP.currentContext = 'inventario';
    APP.showScreen('inventario');
    APP.updateHeaderQueueCount('inv');
    APP.renderHistory();
};

APP.openOrdiniClienti = async function() {
    APP.currentContext = 'ordiniClienti';
    APP.showScreen('ordini-clienti');
    APP.updateHeaderQueueCount('ordCli');
    
    // Imposta data corrente
    document.getElementById('ord-cli-data').value = APP.formatDate(new Date());
    document.getElementById('ord-cli-numero').value = APP.currentOrdineClienti.numero;
    
    // Reset ordine corrente
    APP.currentOrdineClienti.cliente = null;
    APP.currentOrdineClienti.righe = [];
    APP.renderSelectedCliente();
    APP.renderRigheOrdineClienti();
};

APP.openOrdiniFornitori = async function() {
    APP.currentContext = 'ordiniFornitori';
    APP.showScreen('ordini-fornitori');
    APP.updateHeaderQueueCount('ordFor');
    
    // Imposta data corrente
    document.getElementById('ord-for-data').value = APP.formatDate(new Date());
    document.getElementById('ord-for-numero').value = APP.currentOrdineFornitori.numero;
    
    // Reset ordine corrente
    APP.currentOrdineFornitori.fornitore = null;
    APP.currentOrdineFornitori.righe = [];
    APP.renderSelectedFornitore();
    APP.renderRigheOrdineFornitori();
};

// ==========================================
// MENU & STATS
// ==========================================

APP.updateMenuStats = async function() {
    try {
        const stats = await DB.getStats();
        document.getElementById('stat-articoli').textContent = APP.formatNumber(stats.articoli);
        document.getElementById('stat-clienti').textContent = APP.formatNumber(stats.clienti);
        document.getElementById('stat-fornitori').textContent = APP.formatNumber(stats.fornitori);
    } catch (e) {
        console.error('Errore updateMenuStats:', e);
    }
};

APP.updateBadges = async function() {
    try {
        const stats = await DB.getStats();
        
        // Badge inventario
        const badgeInv = document.getElementById('badge-inventario');
        if (stats.queueInventario > 0) {
            badgeInv.textContent = stats.queueInventario;
            badgeInv.classList.add('visible');
        } else {
            badgeInv.classList.remove('visible');
        }
        
        // Badge ordini clienti
        const badgeOrdCli = document.getElementById('badge-ordini-clienti');
        if (stats.queueOrdiniClienti > 0) {
            badgeOrdCli.textContent = stats.queueOrdiniClienti;
            badgeOrdCli.classList.add('visible');
        } else {
            badgeOrdCli.classList.remove('visible');
        }
        
        // Badge ordini fornitori
        const badgeOrdFor = document.getElementById('badge-ordini-fornitori');
        if (stats.queueOrdiniFornitori > 0) {
            badgeOrdFor.textContent = stats.queueOrdiniFornitori;
            badgeOrdFor.classList.add('visible');
        } else {
            badgeOrdFor.classList.remove('visible');
        }
    } catch (e) {
        console.error('Errore updateBadges:', e);
    }
};

APP.updateHeaderQueueCount = async function(context) {
    try {
        let count = 0;
        let elementId = '';
        
        switch (context) {
            case 'inv':
                count = await DB.countStore('queueInventario');
                elementId = 'header-queue-count-inv';
                break;
            case 'ordCli':
                count = await DB.countStore('queueOrdiniClienti');
                elementId = 'header-queue-count-ord-cli';
                break;
            case 'ordFor':
                count = await DB.countStore('queueOrdiniFornitori');
                elementId = 'header-queue-count-ord-for';
                break;
        }
        
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = count > 0 ? `(${count})` : '';
        }
    } catch (e) {
        console.error('Errore updateHeaderQueueCount:', e);
    }
};

// ==========================================
// RICERCA CON DEBOUNCE
// ==========================================

APP.debounceSearch = function(context) {
    if (APP.searchTimers[context]) {
        clearTimeout(APP.searchTimers[context]);
    }
    
    APP.searchTimers[context] = setTimeout(() => {
        APP.performSearch(context);
    }, 150); // 150ms debounce
};

APP.performSearch = async function(context) {
    let inputId, resultsId, searchFn;
    
    switch (context) {
        case 'inv':
            inputId = 'search-inv';
            resultsId = 'results-inv';
            searchFn = DB.searchArticoli;
            break;
        case 'cliente':
            inputId = 'search-cliente';
            resultsId = 'results-cliente';
            searchFn = DB.searchClienti;
            break;
        case 'fornitore':
            inputId = 'search-fornitore';
            resultsId = 'results-fornitore';
            searchFn = DB.searchFornitori;
            break;
        case 'artOrdCli':
            inputId = 'search-art-ord-cli';
            resultsId = 'results-art-ord-cli';
            searchFn = DB.searchArticoli;
            break;
        case 'artOrdFor':
            inputId = 'search-art-ord-for';
            resultsId = 'results-art-ord-for';
            searchFn = DB.searchArticoli;
            break;
    }
    
    const query = document.getElementById(inputId).value.trim();
    const resultsEl = document.getElementById(resultsId);
    
    if (query.length < 2) {
        resultsEl.innerHTML = '';
        return;
    }
    
    try {
        const results = await searchFn(query, 30);
        APP.renderSearchResults(results, resultsEl, context);
    } catch (e) {
        console.error('Errore ricerca:', e);
        resultsEl.innerHTML = '<div class="empty-message">Errore nella ricerca</div>';
    }
};

APP.renderSearchResults = function(results, container, context) {
    if (results.length === 0) {
        container.innerHTML = '<div class="empty-message">Nessun risultato</div>';
        return;
    }
    
    // Salva risultati in variabile globale per accesso successivo
    if (!APP.searchResults) APP.searchResults = {};
    APP.searchResults[context] = results;
    
    // Funzione per escape HTML
    const escapeHtml = (str) => {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    
    let html = '';
    
    if (context === 'cliente') {
        results.forEach((cli, index) => {
            html += `
                <div class="result-item" onclick="APP.onResultClick('${context}', ${index})">
                    <span class="result-code">${escapeHtml(cli.codice)}</span>
                    <div class="result-info">
                        <div class="result-name">${escapeHtml(cli.ragSoc1)}</div>
                        <div class="result-meta">
                            <span>${escapeHtml(cli.localita || '')}</span>
                            <span>${escapeHtml(cli.partitaIva || '')}</span>
                        </div>
                    </div>
                </div>
            `;
        });
    } else if (context === 'fornitore') {
        results.forEach((forn, index) => {
            html += `
                <div class="result-item fornitore" onclick="APP.onResultClick('${context}', ${index})">
                    <span class="result-code">${escapeHtml(forn.codice)}</span>
                    <div class="result-info">
                        <div class="result-name">${escapeHtml(forn.ragSoc1)}</div>
                        <div class="result-meta">
                            <span>${escapeHtml(forn.localita || '')}</span>
                            <span>${escapeHtml(forn.partitaIva || '')}</span>
                        </div>
                    </div>
                </div>
            `;
        });
    } else {
        // Articoli - mostra info diverse in base al contesto
        const isOrdCli = (context === 'artOrdCli');
        const isOrdFor = (context === 'artOrdFor');
        
        results.forEach((art, index) => {
            let prezzoInfo = '';
            if (isOrdCli && art.prezzoVendita) {
                prezzoInfo = `<span>💰 €${art.prezzoVendita.toFixed(2)}</span>`;
            } else if (isOrdFor && art.prezzoAcquisto) {
                prezzoInfo = `<span>💰 €${art.prezzoAcquisto.toFixed(2)}</span>`;
            }
            
            html += `
                <div class="result-item" onclick="APP.onResultClick('${context}', ${index})">
                    <span class="result-code">${escapeHtml(art.codice)}</span>
                    <div class="result-info">
                        <div class="result-name">${escapeHtml(art.des1)}</div>
                        <div class="result-meta">
                            <span>📦 ${art.giacenza || 0} ${escapeHtml(art.um || '')}</span>
                            ${prezzoInfo}
                            ${art.locazione ? `<span>📍 ${escapeHtml(art.locazione)}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
    }
    
    container.innerHTML = html;
};

// Handler unico per tutti i click sui risultati
APP.onResultClick = function(context, index) {
    console.log('onResultClick:', context, index);
    
    if (!APP.searchResults || !APP.searchResults[context]) {
        console.error('Nessun risultato trovato per context:', context);
        return;
    }
    
    const item = APP.searchResults[context][index];
    if (!item) {
        console.error('Item non trovato:', index);
        return;
    }
    
    console.log('Item selezionato:', item);
    
    switch (context) {
        case 'cliente':
            console.log('Chiamando handleSelectCliente');
            APP.handleSelectCliente(item);
            break;
        case 'fornitore':
            console.log('Chiamando handleSelectFornitore');
            APP.handleSelectFornitore(item);
            break;
        case 'inv':
        case 'artOrdCli':
        case 'artOrdFor':
            console.log('Chiamando handleSelectArticolo con context:', context);
            APP.handleSelectArticolo(item, context);
            break;
        default:
            console.error('Context non riconosciuto:', context);
    }
};

// ==========================================
// SELEZIONE ARTICOLO
// ==========================================

// Handler per selezione articolo (riceve oggetto direttamente)
APP.handleSelectArticolo = function(articolo, context) {
    console.log('handleSelectArticolo chiamato:', articolo, context);
    
    if (!articolo) {
        APP.showToast('Articolo non trovato', 'error');
        return;
    }
    
    APP.selectedArticolo = articolo;
    APP.qtyContext = context;
    
    console.log('selectedArticolo impostato, qtyContext:', context);
    
    // Determina se modalità veloce
    let fastMode = false;
    switch (context) {
        case 'inv':
            fastMode = APP.fastScanMode.inv;
            break;
        case 'artOrdCli':
            fastMode = APP.fastScanMode.ordCli;
            break;
        case 'artOrdFor':
            fastMode = APP.fastScanMode.ordFor;
            break;
    }
    
    console.log('fastMode:', fastMode);
    
    if (fastMode) {
        // Aggiungi direttamente con qta 1
        console.log('Chiamando processArticoloWithQty(1)');
        APP.processArticoloWithQty(1);
    } else {
        // Mostra modal quantità
        console.log('Chiamando openQtyModal()');
        APP.openQtyModal();
    }
    
    // Pulisci ricerca
    const inputIds = {
        'inv': 'search-inv',
        'artOrdCli': 'search-art-ord-cli',
        'artOrdFor': 'search-art-ord-for'
    };
    const resultsIds = {
        'inv': 'results-inv',
        'artOrdCli': 'results-art-ord-cli',
        'artOrdFor': 'results-art-ord-for'
    };
    
    if (inputIds[context]) {
        document.getElementById(inputIds[context]).value = '';
        document.getElementById(resultsIds[context]).innerHTML = '';
    }
};

// Handler per selezione cliente (riceve oggetto direttamente)
APP.handleSelectCliente = function(cliente) {
    if (!cliente) {
        APP.showToast('Cliente non trovato', 'error');
        return;
    }
    
    APP.currentOrdineClienti.cliente = cliente;
    APP.renderSelectedCliente();
    
    // Pulisci ricerca
    document.getElementById('search-cliente').value = '';
    document.getElementById('results-cliente').innerHTML = '';
    
    APP.updateBtnConfermaOrdCli();
};

// Handler per selezione fornitore (riceve oggetto direttamente)
APP.handleSelectFornitore = function(fornitore) {
    if (!fornitore) {
        APP.showToast('Fornitore non trovato', 'error');
        return;
    }
    
    APP.currentOrdineFornitori.fornitore = fornitore;
    APP.renderSelectedFornitore();
    
    // Pulisci ricerca
    document.getElementById('search-fornitore').value = '';
    document.getElementById('results-fornitore').innerHTML = '';
    
    APP.updateBtnConfermaOrdFor();
};

// Vecchia funzione selectArticolo (per compatibilità con scanner)
APP.selectArticolo = async function(codice, context) {
    const articolo = await DB.getArticoloByCode(codice);
    if (!articolo) {
        APP.showToast('Articolo non trovato', 'error');
        return;
    }
    APP.handleSelectArticolo(articolo, context);
};

APP.processArticoloWithQty = async function(qty, prezzoInserito = null) {
    const articolo = APP.selectedArticolo;
    const context = APP.qtyContext;
    
    if (!articolo || qty <= 0) return;
    
    switch (context) {
        case 'inv':
            await APP.addToInventarioQueue(articolo, qty);
            APP.addToHistory(articolo, qty);
            break;
        case 'artOrdCli':
            APP.addRigaOrdineCliente(articolo, qty);
            break;
        case 'artOrdFor':
            APP.addRigaOrdineFornitore(articolo, qty, prezzoInserito);
            break;
    }
    
    APP.selectedArticolo = null;
    APP.qtyContext = null;
    
    // Feedback
    APP.playBeep();
    APP.vibrate();
    APP.showToast(`${articolo.codice} - Qta: ${qty}`, 'success');
};

// ==========================================
// MODAL QUANTITÀ (NUMPAD)
// ==========================================

APP.openQtyModal = function() {
    const articolo = APP.selectedArticolo;
    if (!articolo) return;
    
    document.getElementById('qty-articolo-desc').textContent = articolo.des1;
    document.getElementById('qty-articolo-code').textContent = articolo.codice;
    document.getElementById('numpad-value').textContent = '1';
    
    // Mostra campo prezzo solo per ordini fornitori
    const prezzoContainer = document.getElementById('qty-prezzo-container');
    const prezzoInput = document.getElementById('qty-prezzo-input');
    
    if (APP.currentContext === 'ordiniFornitori') {
        prezzoContainer.classList.remove('hidden');
        // Pre-compila con prezzo acquisto se disponibile
        const prezzoDefault = articolo.prezzoAcquisto || 0;
        prezzoInput.value = prezzoDefault > 0 ? prezzoDefault.toFixed(2) : '';
    } else {
        prezzoContainer.classList.add('hidden');
        prezzoInput.value = '';
    }
    
    document.getElementById('modal-qty').classList.remove('hidden');
};

APP.closeQtyModal = function() {
    document.getElementById('modal-qty').classList.add('hidden');
    APP.selectedArticolo = null;
    APP.qtyContext = null;
};

APP.numpadInput = function(digit) {
    const display = document.getElementById('numpad-value');
    let value = display.textContent;
    
    if (value === '0' || value === '1' && display.dataset.fresh !== 'false') {
        value = digit;
    } else {
        value += digit;
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
    let value = display.textContent;
    
    if (value.length > 1) {
        display.textContent = value.slice(0, -1);
    } else {
        display.textContent = '0';
    }
};

APP.numpadConfirm = function() {
    const qty = parseInt(document.getElementById('numpad-value').textContent) || 0;
    
    if (qty <= 0) {
        APP.showToast('Quantità non valida', 'error');
        return;
    }
    
    // Prendi prezzo inserito (solo per ordini fornitori)
    let prezzoInserito = null;
    if (APP.currentContext === 'ordiniFornitori') {
        const prezzoInput = document.getElementById('qty-prezzo-input');
        if (prezzoInput.value) {
            prezzoInserito = parseFloat(prezzoInput.value) || 0;
        }
    }
    
    // PRIMA processo l'articolo, POI chiudo il modal
    document.getElementById('modal-qty').classList.add('hidden');
    APP.processArticoloWithQty(qty, prezzoInserito);
};

// ==========================================
// SCANNER
// ==========================================

APP.startScan = function(context) {
    APP.scanMode = context;
    
    const overlay = document.getElementById('scanner-overlay');
    const hint = document.getElementById('scanner-hint');
    
    overlay.classList.remove('hidden');
    
    // Mostra hint se modalità veloce
    let fastMode = false;
    switch (context) {
        case 'inv':
            fastMode = APP.fastScanMode.inv;
            break;
        case 'ordCli':
            fastMode = APP.fastScanMode.ordCli;
            break;
        case 'ordFor':
            fastMode = APP.fastScanMode.ordFor;
            break;
    }
    
    if (fastMode) {
        hint.classList.remove('hidden');
    } else {
        hint.classList.add('hidden');
    }
    
    // Inizializza scanner
    APP.html5QrCode = new Html5Qrcode('scanner-reader');
    
    APP.html5QrCode.start(
        { facingMode: 'environment' },
        {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.0
        },
        (decodedText) => {
            APP.onScanSuccess(decodedText);
        },
        (errorMessage) => {
            // Ignora errori di scansione continui
        }
    ).catch(err => {
        console.error('Errore avvio scanner:', err);
        APP.showToast('Errore fotocamera', 'error');
        APP.stopScan();
    });
};

APP.stopScan = function() {
    const overlay = document.getElementById('scanner-overlay');
    
    if (APP.html5QrCode) {
        APP.html5QrCode.stop().then(() => {
            APP.html5QrCode.clear();
            APP.html5QrCode = null;
        }).catch(err => {
            console.error('Errore stop scanner:', err);
            APP.html5QrCode = null;
        });
    }
    
    overlay.classList.add('hidden');
    APP.scanMode = null;
};

APP.onScanSuccess = async function(barcode) {
    // Cerca articolo per barcode
    const articolo = await DB.getArticoloByBarcode(barcode);
    
    if (!articolo) {
        APP.showToast(`Codice ${barcode} non trovato`, 'error');
        APP.vibrate(200);
        return;
    }
    
    // Determina modalità
    let fastMode = false;
    let context = APP.scanMode;
    
    switch (context) {
        case 'inv':
            fastMode = APP.fastScanMode.inv;
            APP.qtyContext = 'inv';
            break;
        case 'ordCli':
            fastMode = APP.fastScanMode.ordCli;
            APP.qtyContext = 'artOrdCli';
            break;
        case 'ordFor':
            fastMode = APP.fastScanMode.ordFor;
            APP.qtyContext = 'artOrdFor';
            break;
    }
    
    APP.selectedArticolo = articolo;
    
    if (fastMode) {
        // Aggiungi direttamente con qta 1
        APP.processArticoloWithQty(1);
        // Rimani in modalità scansione
    } else {
        // Chiudi scanner e mostra numpad
        APP.stopScan();
        APP.openQtyModal();
    }
};

APP.toggleFastScan = function(mode) {
    const checkboxId = {
        'inv': 'fast-scan-inv',
        'ordCli': 'fast-scan-ord-cli',
        'ordFor': 'fast-scan-ord-for'
    };
    
    const checked = document.getElementById(checkboxId[mode]).checked;
    APP.fastScanMode[mode] = checked;
    
    if (checked) {
        APP.showToast('Scansione veloce attiva', 'success');
    }
};

// ==========================================
// INVENTARIO QUEUE
// ==========================================

APP.addToInventarioQueue = async function(articolo, qty) {
    const item = {
        codice: articolo.codice,
        des1: articolo.des1,
        locazione: articolo.locazione,
        qty: qty,
        timestamp: Date.now()
    };
    
    await DB.addToQueue('queueInventario', item);
    APP.updateHeaderQueueCount('inv');
    APP.updateBadges();
};

APP.addToHistory = function(articolo, qty) {
    APP.scanHistory.unshift({
        codice: articolo.codice,
        des1: articolo.des1,
        qty: qty,
        time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    });
    
    // Mantieni solo ultime 10
    if (APP.scanHistory.length > 10) {
        APP.scanHistory = APP.scanHistory.slice(0, 10);
    }
    
    localStorage.setItem('picam_scan_history', JSON.stringify(APP.scanHistory));
    APP.renderHistory();
};

APP.renderHistory = function() {
    const container = document.getElementById('history-inv');
    if (!container) return;
    
    if (APP.scanHistory.length === 0) {
        container.innerHTML = '<div class="empty-message">Nessuna scansione recente</div>';
        return;
    }
    
    let html = '';
    APP.scanHistory.forEach(item => {
        html += `
            <div class="history-item">
                <span class="history-code">${item.codice}</span>
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.des1}</span>
                <span class="history-qty">${item.qty}</span>
                <span style="color: var(--text-light); font-size: 11px;">${item.time}</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
};

// ==========================================
// CLIENTI
// ==========================================

// Vecchia funzione selectCliente per compatibilità
APP.selectCliente = async function(codice) {
    const clienti = await DB.getAllClienti();
    const cliente = clienti.find(c => c.codice === codice);
    APP.handleSelectCliente(cliente);
};

APP.renderSelectedCliente = function() {
    const container = document.getElementById('selected-cliente');
    const cliente = APP.currentOrdineClienti.cliente;
    
    if (!cliente) {
        container.className = 'cliente-info empty';
        container.innerHTML = '<span>Nessun cliente selezionato</span>';
        return;
    }
    
    container.className = 'cliente-info';
    container.innerHTML = `
        <div class="cliente-detail">
            <div class="cliente-header">
                <span class="cliente-codice">${cliente.codice}</span>
                <span class="cliente-ragsoc">${cliente.ragSoc1}</span>
            </div>
            <div class="cliente-body">
                ${cliente.ragSoc2 ? `<p>${cliente.ragSoc2}</p>` : ''}
                <p>${cliente.indirizzo}, ${cliente.cap} ${cliente.localita} (${cliente.provincia})</p>
                ${cliente.telefono ? `<p>📞 ${cliente.telefono}</p>` : ''}
                ${cliente.partitaIva ? `<p>🏷️ P.IVA: ${cliente.partitaIva}</p>` : ''}
            </div>
        </div>
    `;
};

// ==========================================
// FORNITORI
// ==========================================

// Vecchia funzione selectFornitore per compatibilità
APP.selectFornitore = async function(codice) {
    const fornitori = await DB.getAllFornitori();
    const fornitore = fornitori.find(f => f.codice === codice);
    APP.handleSelectFornitore(fornitore);
};

APP.renderSelectedFornitore = function() {
    const container = document.getElementById('selected-fornitore');
    const fornitore = APP.currentOrdineFornitori.fornitore;
    
    if (!fornitore) {
        container.className = 'cliente-info empty';
        container.innerHTML = '<span>Nessun fornitore selezionato</span>';
        return;
    }
    
    container.className = 'cliente-info';
    container.innerHTML = `
        <div class="cliente-detail fornitore">
            <div class="cliente-header">
                <span class="cliente-codice">${fornitore.codice}</span>
                <span class="cliente-ragsoc">${fornitore.ragSoc1}</span>
            </div>
            <div class="cliente-body">
                ${fornitore.ragSoc2 ? `<p>${fornitore.ragSoc2}</p>` : ''}
                <p>${fornitore.indirizzo}, ${fornitore.cap} ${fornitore.localita} (${fornitore.provincia})</p>
                ${fornitore.telefono ? `<p>📞 ${fornitore.telefono}</p>` : ''}
                ${fornitore.partitaIva ? `<p>🏷️ P.IVA: ${fornitore.partitaIva}</p>` : ''}
            </div>
        </div>
    `;
};

// ==========================================
// RIGHE ORDINE CLIENTI
// ==========================================

APP.addRigaOrdineCliente = function(articolo, qty) {
    // Verifica se esiste già
    const existing = APP.currentOrdineClienti.righe.find(r => r.codice === articolo.codice);
    
    if (existing) {
        existing.qty += qty;
    } else {
        APP.currentOrdineClienti.righe.push({
            codice: articolo.codice,
            des1: articolo.des1,
            des2: articolo.des2,
            um: articolo.um,
            prezzo: articolo.prezzoVendita || articolo.prezzo || 0,
            aliquotaIva: articolo.aliquotaIva || 22,
            giacenza: articolo.giacenza || 0,
            qty: qty
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
        document.getElementById('tot-cli-articoli').textContent = '0';
        document.getElementById('tot-cli-qta').textContent = '0';
        return;
    }
    
    let html = '';
    let totQta = 0;
    
    righe.forEach((riga, index) => {
        totQta += riga.qty;
        const totRiga = riga.qty * riga.prezzo;
        
        html += `
            <div class="riga-item">
                <div class="riga-info">
                    <div class="riga-code">${riga.codice}</div>
                    <div class="riga-desc">${riga.des1}</div>
                    <div class="riga-details">
                        <span>Qta: ${riga.qty} ${riga.um}</span>
                        <span>📦 Giac: ${riga.giacenza || 0}</span>
                        <span class="riga-totale">€ ${totRiga.toFixed(2)}</span>
                    </div>
                </div>
                <button class="btn-remove-riga" onclick="APP.removeRigaOrdineCliente(${index})">🗑️</button>
            </div>
        `;
    });
    
    container.innerHTML = html;
    document.getElementById('tot-cli-articoli').textContent = righe.length;
    document.getElementById('tot-cli-qta').textContent = totQta;
};

APP.updateBtnConfermaOrdCli = function() {
    const btn = document.getElementById('btn-conferma-ord-cli');
    const hasCliente = APP.currentOrdineClienti.cliente !== null;
    const hasRighe = APP.currentOrdineClienti.righe.length > 0;
    
    btn.disabled = !(hasCliente && hasRighe);
};

// ==========================================
// RIGHE ORDINE FORNITORI
// ==========================================

APP.addRigaOrdineFornitore = function(articolo, qty, prezzoInserito = null) {
    // Usa prezzo inserito se fornito, altrimenti prezzo acquisto o 0
    const prezzo = prezzoInserito !== null ? prezzoInserito : (articolo.prezzoAcquisto || articolo.prezzo || 0);
    
    const existing = APP.currentOrdineFornitori.righe.find(r => r.codice === articolo.codice);
    
    if (existing) {
        existing.qty += qty;
        // Aggiorna anche il prezzo se è stato inserito uno nuovo
        if (prezzoInserito !== null) {
            existing.prezzo = prezzoInserito;
        }
    } else {
        APP.currentOrdineFornitori.righe.push({
            codice: articolo.codice,
            des1: articolo.des1,
            des2: articolo.des2,
            um: articolo.um,
            prezzo: prezzo,
            aliquotaIva: articolo.aliquotaIva || 22,
            giacenza: articolo.giacenza || 0,
            qty: qty
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
        document.getElementById('tot-for-articoli').textContent = '0';
        document.getElementById('tot-for-qta').textContent = '0';
        return;
    }
    
    let html = '';
    let totQta = 0;
    
    righe.forEach((riga, index) => {
        totQta += riga.qty;
        const totRiga = riga.qty * riga.prezzo;
        
        html += `
            <div class="riga-item">
                <div class="riga-info">
                    <div class="riga-code">${riga.codice}</div>
                    <div class="riga-desc">${riga.des1}</div>
                    <div class="riga-details">
                        <span>Qta: ${riga.qty} ${riga.um}</span>
                        <span>📦 Giac: ${riga.giacenza || 0}</span>
                        <span class="riga-totale">€ ${totRiga.toFixed(2)}</span>
                    </div>
                </div>
                <button class="btn-remove-riga" onclick="APP.removeRigaOrdineFornitore(${index})">🗑️</button>
            </div>
        `;
    });
    
    container.innerHTML = html;
    document.getElementById('tot-for-articoli').textContent = righe.length;
    document.getElementById('tot-for-qta').textContent = totQta;
};

APP.updateBtnConfermaOrdFor = function() {
    const btn = document.getElementById('btn-conferma-ord-for');
    const hasFornitore = APP.currentOrdineFornitori.fornitore !== null;
    const hasRighe = APP.currentOrdineFornitori.righe.length > 0;
    
    btn.disabled = !(hasFornitore && hasRighe);
};

// ==========================================
// CONFERMA ORDINI
// ==========================================

APP.confermaOrdineCliente = async function() {
    const ordine = APP.currentOrdineClienti;
    
    if (!ordine.cliente || ordine.righe.length === 0) {
        APP.showToast('Ordine incompleto', 'error');
        return;
    }
    
    // Prepara ordine per la coda
    const ordineCompleto = {
        tipo: 'cliente',
        registro: document.getElementById('ord-cli-registro').value || '01',
        numero: parseInt(document.getElementById('ord-cli-numero').value) || 1,
        data: new Date().toISOString(),
        cliente: { ...ordine.cliente },
        righe: [ ...ordine.righe ],
        timestamp: Date.now()
    };
    
    // Salva nella coda
    await DB.addToQueue('queueOrdiniClienti', ordineCompleto);
    
    // Aggiorna numero ordine
    APP.currentOrdineClienti.numero = ordineCompleto.numero + 1;
    localStorage.setItem('picam_ordini_last_num', ordineCompleto.numero.toString());
    
    // Reset ordine corrente
    APP.currentOrdineClienti.cliente = null;
    APP.currentOrdineClienti.righe = [];
    
    // Aggiorna UI
    APP.renderSelectedCliente();
    APP.renderRigheOrdineClienti();
    document.getElementById('ord-cli-numero').value = APP.currentOrdineClienti.numero;
    APP.updateBtnConfermaOrdCli();
    APP.updateHeaderQueueCount('ordCli');
    APP.updateBadges();
    
    APP.showToast(`Ordine ${ordineCompleto.registro}/${ordineCompleto.numero} aggiunto alla coda`, 'success');
};

APP.confermaOrdineFornitore = async function() {
    const ordine = APP.currentOrdineFornitori;
    
    if (!ordine.fornitore || ordine.righe.length === 0) {
        APP.showToast('Ordine incompleto', 'error');
        return;
    }
    
    // Prepara ordine per la coda
    const ordineCompleto = {
        tipo: 'fornitore',
        registro: document.getElementById('ord-for-registro').value || '01',
        numero: parseInt(document.getElementById('ord-for-numero').value) || 1,
        data: new Date().toISOString(),
        fornitore: { ...ordine.fornitore },
        righe: [ ...ordine.righe ],
        timestamp: Date.now()
    };
    
    // Salva nella coda
    await DB.addToQueue('queueOrdiniFornitori', ordineCompleto);
    
    // Aggiorna numero ordine
    APP.currentOrdineFornitori.numero = ordineCompleto.numero + 1;
    localStorage.setItem('picam_ordfor_last_num', ordineCompleto.numero.toString());
    
    // Reset ordine corrente
    APP.currentOrdineFornitori.fornitore = null;
    APP.currentOrdineFornitori.righe = [];
    
    // Aggiorna UI
    APP.renderSelectedFornitore();
    APP.renderRigheOrdineFornitori();
    document.getElementById('ord-for-numero').value = APP.currentOrdineFornitori.numero;
    APP.updateBtnConfermaOrdFor();
    APP.updateHeaderQueueCount('ordFor');
    APP.updateBadges();
    
    APP.showToast(`Ordine ${ordineCompleto.registro}/${ordineCompleto.numero} aggiunto alla coda`, 'success');
};

// ==========================================
// MODAL CODA
// ==========================================

APP.queueData = []; // Cache della coda corrente

APP.openQueueModal = async function(context) {
    APP.queueContext = context;
    
    const modal = document.getElementById('modal-queue');
    const title = document.getElementById('queue-modal-title');
    const countEl = document.getElementById('queue-count');
    const listEl = document.getElementById('queue-list');
    const actionsEl = document.getElementById('queue-actions');
    
    let storeName = '';
    
    switch (context) {
        case 'inventario':
            title.textContent = '📋 Coda Inventario';
            storeName = 'queueInventario';
            break;
        case 'ordiniClienti':
            title.textContent = '🛒 Coda Ordini Clienti';
            storeName = 'queueOrdiniClienti';
            break;
        case 'ordiniFornitori':
            title.textContent = '🏭 Coda Ordini Fornitori';
            storeName = 'queueOrdiniFornitori';
            break;
    }
    
    APP.queueData = await DB.getQueue(storeName);
    countEl.textContent = `${APP.queueData.length} elementi`;
    
    // Render lista con selezione
    if (APP.queueData.length === 0) {
        listEl.innerHTML = '<div class="empty-message">Nessun elemento in coda</div>';
    } else if (context === 'inventario') {
        listEl.innerHTML = APP.queueData.map((item, index) => `
            <div class="queue-item selectable" onclick="APP.selectQueueItem(${index})">
                <div class="queue-item-info">
                    <div class="queue-item-code">${item.codice}</div>
                    <div class="queue-item-desc">${item.des1 || ''}</div>
                    <div class="queue-item-loc">📍 ${item.locazione || '-'}</div>
                </div>
                <div class="queue-item-qty">${item.qty}</div>
                <div class="queue-item-status">${item.synced ? '✓' : ''}</div>
            </div>
        `).join('');
    } else {
        // Ordini
        listEl.innerHTML = APP.queueData.map((ord, index) => `
            <div class="ordine-item selectable" onclick="APP.selectQueueItem(${index})">
                <div class="ordine-header">
                    <span class="ordine-num">${ord.registro}/${ord.numero}</span>
                    <span class="ordine-data">${APP.formatDate(new Date(ord.data))}</span>
                    <span class="ordine-status ${ord.synced ? 'synced' : ''}">${ord.synced ? '✓ Sync' : '○'}</span>
                </div>
                <div class="ordine-body">
                    <span class="ordine-soggetto">
                        ${context === 'ordiniClienti' ? ord.cliente.ragSoc1 : ord.fornitore.ragSoc1}
                    </span>
                    <span class="ordine-righe">${ord.righe.length} art. - € ${ord.righe.reduce((s, r) => s + r.qty * r.prezzo, 0).toFixed(2)}</span>
                </div>
            </div>
        `).join('');
    }
    
    // Render azioni
    actionsEl.innerHTML = `
        <button class="btn-primary" onclick="APP.syncQueue('${context}')">
            ☁️ Sincronizza su Drive
        </button>
        <div class="queue-actions-row">
            <button class="btn-secondary" onclick="APP.generateReport('${context}')">
                📄 Report PDF
            </button>
            <button class="btn-danger" onclick="APP.clearQueue('${context}')">
                🗑️ Svuota
            </button>
        </div>
        <p class="queue-hint">Tocca un elemento per modificare/stampare</p>
    `;
    
    modal.classList.remove('hidden');
};

APP.closeQueueModal = function() {
    document.getElementById('modal-queue').classList.add('hidden');
    APP.queueContext = null;
    APP.queueData = [];
};

// Seleziona elemento dalla coda
APP.selectQueueItem = function(index) {
    const item = APP.queueData[index];
    if (!item) return;
    
    APP.selectedQueueIndex = index;
    APP.selectedQueueItem = item;
    
    // Apri modal dettaglio/modifica
    APP.openItemDetailModal();
};

// Modal dettaglio elemento
APP.openItemDetailModal = function() {
    const item = APP.selectedQueueItem;
    const context = APP.queueContext;
    
    const modal = document.getElementById('modal-item-detail');
    const titleEl = document.getElementById('item-detail-title');
    const contentEl = document.getElementById('item-detail-content');
    const actionsEl = document.getElementById('item-detail-actions');
    
    if (context === 'inventario') {
        titleEl.textContent = '📦 Dettaglio Articolo';
        contentEl.innerHTML = `
            <div class="detail-row">
                <label>Codice:</label>
                <span>${item.codice}</span>
            </div>
            <div class="detail-row">
                <label>Descrizione:</label>
                <span>${item.des1 || '-'}</span>
            </div>
            <div class="detail-row">
                <label>Locazione:</label>
                <span>${item.locazione || '-'}</span>
            </div>
            <div class="detail-row editable">
                <label>Quantità:</label>
                <input type="number" id="edit-qty" value="${item.qty}" min="1">
            </div>
            ${item.synced ? '<div class="sync-warning">⚠️ Già sincronizzato su Google Drive</div>' : ''}
        `;
        actionsEl.innerHTML = `
            <button class="btn-primary" onclick="APP.saveItemEdit()">💾 Salva</button>
            <button class="btn-danger" onclick="APP.deleteQueueItem()">🗑️ Elimina</button>
            <button class="btn-secondary" onclick="APP.closeItemDetailModal()">Chiudi</button>
        `;
    } else {
        // Ordine
        const soggetto = context === 'ordiniClienti' ? item.cliente : item.fornitore;
        const tipo = context === 'ordiniClienti' ? 'Cliente' : 'Fornitore';
        
        let totale = 0;
        let righeHtml = item.righe.map((riga, idx) => {
            const tot = riga.qty * riga.prezzo;
            totale += tot;
            return `
                <div class="riga-detail">
                    <span class="riga-cod">${riga.codice}</span>
                    <span class="riga-desc">${riga.des1.substring(0, 25)}</span>
                    <input type="number" class="riga-qty-edit" data-idx="${idx}" value="${riga.qty}" min="1" style="width:50px">
                    <span class="riga-tot">€ ${tot.toFixed(2)}</span>
                </div>
            `;
        }).join('');
        
        titleEl.textContent = `📋 Ordine ${item.registro}/${item.numero}`;
        contentEl.innerHTML = `
            <div class="detail-row">
                <label>${tipo}:</label>
                <span>${soggetto.ragSoc1}</span>
            </div>
            <div class="detail-row">
                <label>Data:</label>
                <span>${APP.formatDate(new Date(item.data))}</span>
            </div>
            <div class="detail-row">
                <label>Totale:</label>
                <span id="order-total">€ ${totale.toFixed(2)}</span>
            </div>
            ${item.synced ? '<div class="sync-warning">⚠️ Già sincronizzato su Google Drive</div>' : ''}
            <h4>Righe ordine:</h4>
            <div class="righe-list">${righeHtml}</div>
        `;
        
        let actionsHtml = `
            <button class="btn-primary" onclick="APP.saveItemEdit()">💾 Salva</button>
        `;
        
        // Azioni specifiche per ordini fornitori
        if (context === 'ordiniFornitori') {
            actionsHtml += `
                <button class="btn-secondary" onclick="APP.printOrdineFornitore(true)">🖨️ Stampa con prezzi</button>
                <button class="btn-secondary" onclick="APP.printOrdineFornitore(false)">🖨️ Stampa senza prezzi</button>
                <button class="btn-secondary" onclick="APP.shareOrdineFornitore()">📤 Condividi</button>
            `;
        }
        
        actionsHtml += `
            <button class="btn-danger" onclick="APP.deleteQueueItem()">🗑️ Elimina</button>
            <button class="btn-secondary" onclick="APP.closeItemDetailModal()">Chiudi</button>
        `;
        
        actionsEl.innerHTML = actionsHtml;
    }
    
    modal.classList.remove('hidden');
};

APP.closeItemDetailModal = function() {
    document.getElementById('modal-item-detail').classList.add('hidden');
    APP.selectedQueueIndex = null;
    APP.selectedQueueItem = null;
};

// Salva modifiche elemento
APP.saveItemEdit = async function() {
    const context = APP.queueContext;
    const index = APP.selectedQueueIndex;
    const item = APP.selectedQueueItem;
    
    let storeName = '';
    switch (context) {
        case 'inventario':
            storeName = 'queueInventario';
            const newQty = parseInt(document.getElementById('edit-qty').value) || 1;
            item.qty = newQty;
            break;
        case 'ordiniClienti':
            storeName = 'queueOrdiniClienti';
            // Aggiorna quantità righe
            document.querySelectorAll('.riga-qty-edit').forEach(input => {
                const idx = parseInt(input.dataset.idx);
                item.righe[idx].qty = parseInt(input.value) || 1;
            });
            break;
        case 'ordiniFornitori':
            storeName = 'queueOrdiniFornitori';
            document.querySelectorAll('.riga-qty-edit').forEach(input => {
                const idx = parseInt(input.dataset.idx);
                item.righe[idx].qty = parseInt(input.value) || 1;
            });
            break;
    }
    
    // Aggiorna nel DB
    await DB.updateQueueItem(storeName, item);
    
    APP.showToast('Modifiche salvate', 'success');
    APP.closeItemDetailModal();
    
    // Ricarica lista
    APP.openQueueModal(context);
};

// Elimina elemento dalla coda
APP.deleteQueueItem = async function() {
    if (!confirm('Vuoi eliminare questo elemento?')) return;
    
    const context = APP.queueContext;
    const item = APP.selectedQueueItem;
    
    let storeName = '';
    switch (context) {
        case 'inventario':
            storeName = 'queueInventario';
            break;
        case 'ordiniClienti':
            storeName = 'queueOrdiniClienti';
            break;
        case 'ordiniFornitori':
            storeName = 'queueOrdiniFornitori';
            break;
    }
    
    await DB.deleteFromQueue(storeName, item.id || item.timestamp);
    
    APP.showToast('Elemento eliminato', 'success');
    APP.closeItemDetailModal();
    APP.updateBadges();
    
    // Ricarica o chiudi se vuota
    const queue = await DB.getQueue(storeName);
    if (queue.length === 0) {
        APP.closeQueueModal();
    } else {
        APP.openQueueModal(context);
    }
};

// Stampa ordine fornitore
APP.printOrdineFornitore = async function(showPrices) {
    const ordine = APP.selectedQueueItem;
    const doc = await APP.generateOrdineProfessionale(ordine, showPrices);
    const fileName = `Ordine_${ordine.registro}_${ordine.numero}_${APP.formatDateFile(new Date())}.pdf`;
    APP.downloadPDF(doc, fileName);
};

// Condividi ordine fornitore
APP.shareOrdineFornitore = async function() {
    const ordine = APP.selectedQueueItem;
    const doc = await APP.generateOrdineProfessionale(ordine, true);
    const fileName = `Ordine_${ordine.registro}_${ordine.numero}.pdf`;
    await APP.shareDocument(doc, fileName, `Ordine ${ordine.registro}/${ordine.numero}`);
};

APP.clearQueue = async function(context) {
    if (!confirm('Vuoi svuotare la coda?')) return;
    
    let storeName = '';
    switch (context) {
        case 'inventario':
            storeName = 'queueInventario';
            break;
        case 'ordiniClienti':
            storeName = 'queueOrdiniClienti';
            break;
        case 'ordiniFornitori':
            storeName = 'queueOrdiniFornitori';
            break;
    }
    
    await DB.clearQueue(storeName);
    APP.closeQueueModal();
    APP.updateBadges();
    
    if (context === 'inventario') {
        APP.updateHeaderQueueCount('inv');
    } else if (context === 'ordiniClienti') {
        APP.updateHeaderQueueCount('ordCli');
    } else {
        APP.updateHeaderQueueCount('ordFor');
    }
    
    APP.showToast('Coda svuotata', 'success');
};

// ==========================================
// SYNC SU GOOGLE DRIVE
// ==========================================

APP.syncQueue = async function(context) {
    APP.showToast('Sincronizzazione in corso...', 'success');
    
    try {
        switch (context) {
            case 'inventario':
                await APP.syncInventario();
                break;
            case 'ordiniClienti':
                await APP.syncOrdiniClienti();
                break;
            case 'ordiniFornitori':
                await APP.syncOrdiniFornitori();
                break;
        }
        
        APP.showToast('Sincronizzazione completata!', 'success');
        APP.closeQueueModal();
    } catch (error) {
        console.error('Errore sync:', error);
        APP.showToast('Errore: ' + error.message, 'error');
    }
};

APP.syncInventario = async function() {
    const queue = await DB.getQueue('queueInventario');
    if (queue.length === 0) {
        throw new Error('Nessun elemento da sincronizzare');
    }
    
    // Prepara INVENMAG.xlsx
    const now = new Date();
    const dataStr = APP.formatDate(now);
    
    const rows = queue.map(item => ({
        ima_car_del: '',
        ima_cod_ute: '',
        ima_dat_reg: dataStr,
        ima_cod_dep: APP.config.deposito,
        ima_cod_art: item.codice,
        ima_num_lot: '',
        ima_qta: item.qty,
        ima_not: '',
        ima_filler: ''
    }));
    
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'INVENMAG');
    
    const xlsxData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    
    // Trova cartella
    const folderId = await APP.findFolder(APP.config.folder);
    if (!folderId) {
        throw new Error('Cartella non trovata');
    }
    
    // Upload
    await APP.uploadFile(folderId, 'INVENMAG.xlsx', xlsxData, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    // Svuota coda
    await DB.clearQueue('queueInventario');
    APP.updateHeaderQueueCount('inv');
    APP.updateBadges();
};

APP.syncOrdiniClienti = async function() {
    const queue = await DB.getQueue('queueOrdiniClienti');
    if (queue.length === 0) {
        throw new Error('Nessun ordine da sincronizzare');
    }
    
    const folderId = await APP.findFolder(APP.config.folder);
    if (!folderId) {
        throw new Error('Cartella non trovata');
    }
    
    // Genera i 3 file
    let anagrafiche = '';
    let testate = '';
    let dettagli = '';
    
    const clientiProcessati = new Set();
    
    queue.forEach(ordine => {
        const cli = ordine.cliente;
        const dataOrd = APP.formatDatePicam(new Date(ordine.data));
        
        // Anagrafica (solo se non già processato)
        if (!clientiProcessati.has(cli.codice)) {
            clientiProcessati.add(cli.codice);
            anagrafiche += `${cli.codice}|"${cli.ragSoc1}"|"${cli.ragSoc2}"|"${cli.indirizzo}"|"${cli.cap}"|"${cli.localita}"|"${cli.provincia}"|"${cli.email}"|"${cli.telefono}"|"${cli.partitaIva}"|\n`;
        }
        
        // Testata
        testate += `S|${cli.codPag || ''}|${dataOrd}|${dataOrd}|||"OCL"||||||"${ordine.registro}"|${ordine.numero}|${cli.codice}||||||\n`;
        
        // Dettagli
        ordine.righe.forEach(riga => {
            const impNetto = APP.formatDecimal(riga.qty * riga.prezzo);
            dettagli += `${cli.codice}|"${riga.des1}"|"${riga.des2 || ''}"|"${riga.um}"|${riga.qty}|${impNetto}||"${ordine.registro}"|${ordine.numero}|${dataOrd}|"22"|\n`;
        });
    });
    
    // Upload files
    await APP.uploadFile(folderId, 'ordini-anagrafiche', new TextEncoder().encode(anagrafiche), 'text/plain');
    await APP.uploadFile(folderId, 'ordini-testate', new TextEncoder().encode(testate), 'text/plain');
    await APP.uploadFile(folderId, 'ordini-dettagli', new TextEncoder().encode(dettagli), 'text/plain');
    
    // Svuota coda
    await DB.clearQueue('queueOrdiniClienti');
    APP.updateHeaderQueueCount('ordCli');
    APP.updateBadges();
};

APP.syncOrdiniFornitori = async function() {
    const queue = await DB.getQueue('queueOrdiniFornitori');
    if (queue.length === 0) {
        throw new Error('Nessun ordine da sincronizzare');
    }
    
    const folderId = await APP.findFolder(APP.config.folder);
    if (!folderId) {
        throw new Error('Cartella non trovata');
    }
    
    // Genera i 3 file
    let anagrafiche = '';
    let testate = '';
    let dettagli = '';
    
    const fornitoriProcessati = new Set();
    
    queue.forEach(ordine => {
        const forn = ordine.fornitore;
        const dataOrd = APP.formatDatePicam(new Date(ordine.data));
        
        // Anagrafica (solo se non già processato)
        if (!fornitoriProcessati.has(forn.codice)) {
            fornitoriProcessati.add(forn.codice);
            anagrafiche += `${forn.codice}|"${forn.ragSoc1}"|"${forn.ragSoc2}"|"${forn.indirizzo}"|"${forn.cap}"|"${forn.localita}"|"${forn.provincia}"|"${forn.email}"|"${forn.telefono}"|"${forn.partitaIva}"|\n`;
        }
        
        // Testata
        testate += `S|${forn.codPag || ''}|${dataOrd}|${dataOrd}|||"OFO"||||||"${ordine.registro}"|${ordine.numero}|${forn.codice}|\n`;
        
        // Dettagli
        ordine.righe.forEach(riga => {
            const impNetto = APP.formatDecimal(riga.qty * riga.prezzo);
            dettagli += `${forn.codice}|"${riga.des1}"|"${riga.des2 || ''}"|"${riga.um}"|${riga.qty}|${impNetto}||"${ordine.registro}"|${ordine.numero}|${dataOrd}|"22"|\n`;
        });
    });
    
    // Upload files
    await APP.uploadFile(folderId, 'ordfornitori-anagrafica', new TextEncoder().encode(anagrafiche), 'text/plain');
    await APP.uploadFile(folderId, 'ordfornitori-testate', new TextEncoder().encode(testate), 'text/plain');
    await APP.uploadFile(folderId, 'ordfornitori-dettagli', new TextEncoder().encode(dettagli), 'text/plain');
    
    // Svuota coda
    await DB.clearQueue('queueOrdiniFornitori');
    APP.updateHeaderQueueCount('ordFor');
    APP.updateBadges();
};

APP.uploadFile = async function(folderId, fileName, data, mimeType) {
    // Cerca se esiste già
    const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
    
    const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${APP.accessToken}` }
    });
    const searchData = await searchResponse.json();
    
    const boundary = '-------314159265358979323846';
    const metadata = {
        name: fileName,
        mimeType: mimeType
    };
    
    if (!searchData.files || searchData.files.length === 0) {
        metadata.parents = [folderId];
    }
    
    // Costruisci multipart
    let body = '';
    body += '--' + boundary + '\r\n';
    body += 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
    body += JSON.stringify(metadata) + '\r\n';
    body += '--' + boundary + '\r\n';
    body += 'Content-Type: ' + mimeType + '\r\n';
    body += 'Content-Transfer-Encoding: base64\r\n\r\n';
    
    // Converti dati in base64
    let binary = '';
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    body += btoa(binary) + '\r\n';
    body += '--' + boundary + '--';
    
    let url, method;
    if (searchData.files && searchData.files.length > 0) {
        // Aggiorna file esistente
        const fileId = searchData.files[0].id;
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
        method = 'PATCH';
    } else {
        // Crea nuovo file
        url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        method = 'POST';
    }
    
    const response = await fetch(url, {
        method: method,
        headers: {
            'Authorization': `Bearer ${APP.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: body
    });
    
    if (!response.ok) {
        throw new Error('Errore upload: ' + response.status);
    }
    
    return await response.json();
};

// ==========================================
// REPORT PDF
// ==========================================

// Cache del logo
APP.logoBase64 = null;

// Carica logo da Google Drive
APP.loadLogo = async function() {
    try {
        // Cerca prima nella cartella configurata
        let folderId = await APP.findFolder(APP.config.folder);
        
        // Cerca logo.jpg o logo.png
        const searchLogo = async (parentId) => {
            const query = parentId 
                ? `(name='logo.jpg' or name='logo.png') and '${parentId}' in parents and trashed=false`
                : `(name='logo.jpg' or name='logo.png') and trashed=false`;
            
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
            
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${APP.accessToken}` }
            });
            const data = await response.json();
            
            return data.files && data.files.length > 0 ? data.files[0] : null;
        };
        
        // Prima cerca nella cartella configurata
        let logoFile = null;
        if (folderId) {
            logoFile = await searchLogo(folderId);
        }
        
        // Se non trovato, cerca nella root
        if (!logoFile) {
            console.log('Logo non trovato nella cartella, cerco nella root...');
            logoFile = await searchLogo(null);
        }
        
        if (!logoFile) {
            console.log('Logo non trovato');
            return null;
        }
        
        console.log('Logo trovato:', logoFile.name);
        
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${logoFile.id}?alt=media`;
        
        const fileResponse = await fetch(downloadUrl, {
            headers: { 'Authorization': `Bearer ${APP.accessToken}` }
        });
        
        const blob = await fileResponse.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('Errore caricamento logo:', e);
        return null;
    }
};

// Genera Report Inventario avanzato
APP.generateReportInventario = async function() {
    const queue = await DB.getQueue('queueInventario');
    
    if (queue.length === 0) {
        APP.showToast('Nessun elemento da esportare', 'error');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Intestazione
    doc.setFontSize(18);
    doc.text('Report Inventario', 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Generato il ${APP.formatDate(new Date())} alle ${new Date().toLocaleTimeString('it-IT')}`, 105, 22, { align: 'center' });
    doc.text(`Deposito: ${APP.config.deposito}`, 105, 28, { align: 'center' });
    
    // Header tabella
    let y = 40;
    doc.setFillColor(55, 71, 79);
    doc.rect(10, y - 5, 190, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Codice', 12, y);
    doc.text('Descrizione 1', 45, y);
    doc.text('Descrizione 2', 110, y);
    doc.text('Loc.', 165, y);
    doc.text('Qta', 185, y);
    
    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    
    let totQta = 0;
    queue.forEach((item, index) => {
        if (y > 280) {
            doc.addPage();
            y = 20;
        }
        
        // Riga alternata
        if (index % 2 === 0) {
            doc.setFillColor(245, 245, 245);
            doc.rect(10, y - 4, 190, 6, 'F');
        }
        
        doc.setFontSize(8);
        doc.text(item.codice.substring(0, 20), 12, y);
        doc.text((item.des1 || '').substring(0, 35), 45, y);
        doc.text((item.des2 || '').substring(0, 30), 110, y);
        doc.text(item.locazione || '-', 165, y);
        doc.text(item.qty.toString(), 185, y);
        
        totQta += item.qty;
        y += 6;
    });
    
    // Totale
    y += 5;
    doc.setFillColor(55, 71, 79);
    doc.rect(10, y - 4, 190, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`Totale: ${queue.length} articoli`, 12, y);
    doc.text(`${totQta} pz`, 185, y);
    
    // Download
    APP.downloadPDF(doc, `Inventario_${APP.formatDateFile(new Date())}.pdf`);
};

// Genera Report Ordini (clienti o fornitori)
APP.generateReportOrdini = async function(tipo) {
    const storeName = tipo === 'clienti' ? 'queueOrdiniClienti' : 'queueOrdiniFornitori';
    const queue = await DB.getQueue(storeName);
    
    if (queue.length === 0) {
        APP.showToast('Nessun ordine da esportare', 'error');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const titolo = tipo === 'clienti' ? 'Report Ordini Clienti' : 'Report Ordini Fornitori';
    
    doc.setFontSize(18);
    doc.text(titolo, 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Generato il ${APP.formatDate(new Date())}`, 105, 22, { align: 'center' });
    
    let y = 35;
    
    queue.forEach((ordine) => {
        if (y > 250) {
            doc.addPage();
            y = 20;
        }
        
        const soggetto = tipo === 'clienti' ? ordine.cliente : ordine.fornitore;
        const syncStatus = ordine.synced ? '[SYNC]' : '[DA SYNC]';
        
        // Header ordine
        doc.setFillColor(tipo === 'clienti' ? 33 : 94, tipo === 'clienti' ? 150 : 53, tipo === 'clienti' ? 243 : 177);
        doc.rect(10, y - 4, 190, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`Ordine ${ordine.registro}/${ordine.numero} - ${APP.formatDate(new Date(ordine.data))}`, 12, y + 2);
        doc.setFontSize(8);
        doc.text(syncStatus, 175, y + 2);
        
        y += 12;
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        doc.text(`${tipo === 'clienti' ? 'Cliente' : 'Fornitore'}: ${soggetto.ragSoc1}`, 12, y);
        doc.text(`P.IVA: ${soggetto.partitaIva || '-'}`, 120, y);
        
        y += 8;
        
        // Righe ordine
        let totaleOrdine = 0;
        ordine.righe.forEach((riga) => {
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
            
            const totRiga = riga.qty * riga.prezzo;
            totaleOrdine += totRiga;
            
            doc.setFontSize(8);
            doc.text(`  ${riga.codice}`, 12, y);
            doc.text(`${riga.des1.substring(0, 40)}`, 40, y);
            doc.text(`${riga.qty} ${riga.um}`, 140, y);
            doc.text(`€ ${totRiga.toFixed(2)}`, 170, y);
            y += 5;
        });
        
        // Totale ordine
        doc.setFont(undefined, 'bold');
        doc.text(`Totale ordine: € ${totaleOrdine.toFixed(2)}`, 150, y + 2);
        y += 15;
    });
    
    APP.downloadPDF(doc, `Ordini_${tipo}_${APP.formatDateFile(new Date())}.pdf`);
};

// Genera Ordine Fornitore Professionale (con logo, prezzi, IVA)
APP.generateOrdineProfessionale = async function(ordine, showPrices = true) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Carica logo se non già in cache
    if (!APP.logoBase64) {
        APP.logoBase64 = await APP.loadLogo();
    }
    
    const forn = ordine.fornitore;
    const dataOrdine = APP.formatDate(new Date(ordine.data));
    const dataOrdineTratto = dataOrdine.replace(/\//g, '-');
    
    // ========== HEADER ==========
    
    // Logo in alto a sinistra (se presente)
    let logoEndX = 10;
    if (APP.logoBase64) {
        try {
            doc.addImage(APP.logoBase64, 'JPEG', 10, 8, 55, 35);
            logoEndX = 70;
        } catch (e) {
            console.warn('Errore inserimento logo:', e);
        }
    }
    
    // Box intestatario fornitore (alto a destra)
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(115, 8, 85, 35);
    
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.text('INTESTATARIO', 117, 13);
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(forn.ragSoc1 || '', 117, 19);
    if (forn.ragSoc2) doc.text(forn.ragSoc2, 117, 24);
    doc.text(`${forn.indirizzo || ''}`, 117, forn.ragSoc2 ? 29 : 24);
    doc.text(`${forn.cap || ''} ${forn.localita || ''} (${forn.provincia || ''})`, 117, forn.ragSoc2 ? 34 : 29);
    
    // ========== TITOLO ORDINE ==========
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`CONFERMA D'ORDINE FORNITORE DEL ${dataOrdineTratto}`, 105, 52, { align: 'center' });
    
    // ========== RIGA INFO ORDINE ==========
    
    let y = 58;
    
    // Header riga info
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y, 190, 7, 'F');
    doc.setDrawColor(0);
    doc.rect(10, y, 190, 7);
    
    doc.setFontSize(6);
    doc.setFont(undefined, 'bold');
    doc.text('COD. FORNITORE', 12, y + 5);
    doc.text('PARTITA IVA FORNITORE', 35, y + 5);
    doc.text('C. PAG.', 72, y + 5);
    doc.text('DESCRIZIONE PAGAMENTO', 85, y + 5);
    doc.text('FRAZ.', 125, y + 5);
    doc.text('NUMERO', 140, y + 5);
    doc.text('DATA', 160, y + 5);
    doc.text('N. PAG.', 185, y + 5);
    
    // Valori riga info
    y += 7;
    doc.rect(10, y, 190, 7);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.text(forn.codice || '', 12, y + 5);
    doc.text(forn.partitaIva || '', 35, y + 5);
    doc.text('', 72, y + 5); // Codice pagamento
    doc.text('', 85, y + 5); // Descrizione pagamento
    doc.text('SI', 127, y + 5);
    doc.text(`${ordine.registro}/${ordine.numero}`, 140, y + 5);
    doc.text(dataOrdine, 160, y + 5);
    doc.text('1', 188, y + 5);
    
    // ========== TABELLA ARTICOLI ==========
    
    y += 12;
    
    // Header tabella articoli
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y, 190, 7, 'F');
    doc.rect(10, y, 190, 7);
    
    doc.setFontSize(6);
    doc.setFont(undefined, 'bold');
    doc.text('COD.ARTICOLO', 12, y + 5);
    doc.text('DESCRIZIONE', 50, y + 5);
    doc.text("QUANTITA'", 115, y + 5);
    doc.text('U.M.', 133, y + 5);
    
    if (showPrices) {
        doc.text('PREZZO UNITARIO', 148, y + 5);
    }
    doc.text('DATA CONS', 192, y + 5, { align: 'right' });
    
    y += 7;
    
    // Righe articoli
    let totaleMerce = 0;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    
    ordine.righe.forEach((riga) => {
        if (y > 240) {
            doc.addPage();
            y = 20;
        }
        
        // Linea separatrice
        doc.setDrawColor(200, 200, 200);
        doc.line(10, y + 5, 200, y + 5);
        
        doc.setDrawColor(0);
        doc.text(riga.codice.substring(0, 18), 12, y + 4);
        doc.text(riga.des1.substring(0, 35), 50, y + 4);
        
        // Quantità con formato x,xxx
        const qtyFormatted = riga.qty.toFixed(3).replace('.', ',');
        doc.text(qtyFormatted, 115, y + 4);
        doc.text(riga.um || 'Nr.', 133, y + 4);
        
        if (showPrices) {
            const prezzoFormatted = riga.prezzo.toFixed(6).replace('.', ',');
            doc.text(prezzoFormatted, 148, y + 4);
            totaleMerce += riga.qty * riga.prezzo;
        }
        
        doc.text(dataOrdine, 192, y + 4, { align: 'right' });
        
        y += 8;
    });
    
    // ========== FOOTER ==========
    
    // Posiziona footer in basso
    y = 250;
    
    // Riga totale merce
    doc.setDrawColor(0);
    doc.rect(10, y, 190, 12);
    
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('TOTALE MERCE', 12, y + 5);
    doc.text('%SC.CASSA', 45, y + 5);
    doc.text('PORTO', 70, y + 5);
    doc.text('TRASP. A CURA', 95, y + 5);
    doc.text('RESPONSABILE ACQUISTI', 130, y + 5);
    
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    if (showPrices) {
        doc.text(totaleMerce.toFixed(2).replace('.', ','), 12, y + 10);
    }
    
    // Riga vettore
    y += 12;
    doc.rect(10, y, 140, 10);
    doc.rect(150, y, 50, 10);
    
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('VETTORE', 12, y + 4);
    doc.text('Tel.', 152, y + 8);
    
    // Riga destinazione
    y += 10;
    doc.rect(10, y, 190, 12);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('DESTINAZIONE MERCE', 12, y + 5);
    
    // Riga note
    y += 12;
    doc.rect(10, y, 190, 12);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('NOTE', 12, y + 5);
    
    return doc;
};

// Download PDF
APP.downloadPDF = function(doc, fileName) {
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    APP.showToast('PDF generato', 'success');
};

// Condividi documento
APP.shareDocument = async function(doc, fileName, title) {
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
    
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                title: title,
                files: [file]
            });
            APP.showToast('Documento condiviso', 'success');
        } catch (e) {
            if (e.name !== 'AbortError') {
                APP.downloadPDF(doc, fileName);
            }
        }
    } else {
        // Fallback: download
        APP.downloadPDF(doc, fileName);
    }
};

// Genera report legacy (per compatibilità)
APP.generateReport = async function(context) {
    switch (context) {
        case 'inventario':
            await APP.generateReportInventario();
            break;
        case 'ordiniClienti':
            await APP.generateReportOrdini('clienti');
            break;
        case 'ordiniFornitori':
            await APP.generateReportOrdini('fornitori');
            break;
    }
};

// ==========================================
// SETTINGS
// ==========================================

APP.openSettings = function() {
    document.getElementById('settings-folder').value = APP.config.folder;
    document.getElementById('settings-deposito').value = APP.config.deposito;
    document.getElementById('settings-email').value = APP.userEmail || '';
    
    document.getElementById('modal-settings').classList.remove('hidden');
};

APP.closeSettings = function() {
    document.getElementById('modal-settings').classList.add('hidden');
};

APP.saveSettings = function() {
    APP.config.folder = document.getElementById('settings-folder').value || 'archivi/Ordini';
    APP.config.deposito = document.getElementById('settings-deposito').value || '01';
    
    localStorage.setItem('picam_config', JSON.stringify(APP.config));
    
    APP.closeSettings();
    APP.showToast('Impostazioni salvate', 'success');
};

// ==========================================
// UTILITIES
// ==========================================

APP.formatDate = function(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

APP.formatDatePicam = function(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}${month}${year}`;
};

APP.formatDateFile = function(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}${month}${day}`;
};

APP.formatDecimal = function(value) {
    return value.toFixed(6).replace('.', ',');
};

APP.formatNumber = function(num) {
    return num.toLocaleString('it-IT');
};

APP.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
};

APP.playBeep = function() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.3;
        
        oscillator.start();
        setTimeout(() => oscillator.stop(), 100);
    } catch (e) {
        // Audio non supportato
    }
};

APP.vibrate = function(duration = 50) {
    if (navigator.vibrate) {
        navigator.vibrate(duration);
    }
};

// ==========================================
// INIZIALIZZAZIONE
// ==========================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Picam v3.4 - Inizializzazione...');
    
    // Carica configurazione salvata
    const savedConfig = localStorage.getItem('picam_config');
    if (savedConfig) {
        try {
            APP.config = JSON.parse(savedConfig);
        } catch (e) {
            console.warn('Config non valida, uso default');
        }
    }
    
    // Pre-compila i campi configurazione
    document.getElementById('config-folder').value = APP.config.folder || 'archivi/Ordini';
    document.getElementById('config-deposito').value = APP.config.deposito || '01';
    
    // Verifica autenticazione esistente
    if (APP.checkAuth()) {
        // Token ancora valido
        console.log('Token valido trovato');
        await APP.initWithAuth();
    } else {
        // Token scaduto o assente - tenta login automatico
        const savedEmail = localStorage.getItem('picam_user_email');
        
        if (savedEmail) {
            console.log('Token scaduto, tentativo rinnovo automatico...');
            document.getElementById('login-status').className = 'status-message loading';
            document.getElementById('login-status').textContent = 'Accesso automatico...';
            
            // Attendi che Google Identity Services sia pronto
            const waitForGoogle = () => {
                return new Promise((resolve) => {
                    if (typeof google !== 'undefined' && google.accounts) {
                        resolve();
                    } else {
                        const check = setInterval(() => {
                            if (typeof google !== 'undefined' && google.accounts) {
                                clearInterval(check);
                                resolve();
                            }
                        }, 100);
                        // Timeout dopo 3 secondi
                        setTimeout(() => {
                            clearInterval(check);
                            resolve();
                        }, 3000);
                    }
                });
            };
            
            await waitForGoogle();
            
            const success = await APP.tryAutoLogin();
            if (success) {
                await APP.initWithAuth();
            } else {
                // Login automatico fallito, mostra schermata login
                document.getElementById('login-status').className = 'status-message';
                document.getElementById('login-status').textContent = `Tocca per accedere come ${savedEmail}`;
                APP.showScreen('setup');
            }
        } else {
            // Nessun account salvato
            APP.showScreen('setup');
        }
    }
});

// Inizializza app dopo autenticazione
APP.initWithAuth = async function() {
    try {
        await DB.init();
        const stats = await DB.getStats();
        
        if (stats.articoli > 0) {
            // Dati già presenti, vai al menu
            await APP.loadSavedQueues();
            APP.showScreen('menu');
            APP.updateMenuStats();
            APP.updateBadges();
            APP.showToast(`Bentornato! ${stats.articoli} articoli caricati`, 'success');
        } else {
            // Mostra setup per caricare dati
            APP.showScreen('setup');
            document.getElementById('step-login').classList.add('completed');
            document.getElementById('step-config').classList.remove('disabled');
            document.getElementById('step-load').classList.remove('disabled');
            document.getElementById('login-status').textContent = `Connesso come ${APP.userEmail}`;
            document.getElementById('login-status').className = 'status-message success';
        }
    } catch (e) {
        console.error('Errore init DB:', e);
        APP.showScreen('setup');
    }
};

// Registra Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registrato'))
            .catch(err => console.error('Errore SW:', err));
    });
}
