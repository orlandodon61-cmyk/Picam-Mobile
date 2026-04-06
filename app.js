/**
 * PICAM PWA - App Module v3.5
 * Gestione Inventario e Ordini
 */

const APP = {
    // Config
    CLIENT_ID: '780777046643-ebl7m87qcoldp3c8sg9c1u5dfqjdgl42.apps.googleusercontent.com',
    SCOPES: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
    
    // State
    accessToken: null,
    userEmail: null,
    config: {
        folder: 'archivi/Ordini',
        deposito: '01'
    },
    
    // Context
    currentScreen: 'setup',
    currentContext: null,
    
    // Inventario
    invMode: 'selector', // 'selector', 'scansione', 'locazione', 'gruppo'
    invLocazioneData: [],
    invGruppoData: [],
    
    // Ordini
    ordineCliente: null,
    ordineFornitore: null,
    righeOrdineClienti: [],
    righeOrdiniFornitori: [],
    clienteSelezionato: null,
    fornitoreSelezionato: null,
    
    // Coda
    queueContext: null,
    queueData: [],
    queueTab: 'pending',
    selectedQueueIndex: -1,
    
    // Scanner
    scanner: null,
    scanContext: null,
    fastScanMode: {},
    
    // Search
    searchTimeout: null,
    scanHistory: [],
    
    // Filtri
    articoliFilters: {}
};

// ==========================================
// INIZIALIZZAZIONE
// ==========================================

APP.init = async function() {
    console.log('APP.init v3.5');
    
    try {
        // Inizializza DB
        await DB.init();
        
        // Carica cache IVA
        await DB.loadIvaCache();
        
        // Carica config salvata
        APP.loadConfig();
        
        // Carica cronologia scansioni
        const history = localStorage.getItem('picam_scan_history');
        if (history) {
            APP.scanHistory = JSON.parse(history);
        }
        
        // Controlla se ci sono dati per skip button
        APP.checkSkipButton();
        
        // Inizializza data ordini
        const oggi = new Date().toLocaleDateString('it-IT');
        const dataCliEl = document.getElementById('ord-cli-data');
        const dataForEl = document.getElementById('ord-for-data');
        if (dataCliEl) dataCliEl.value = oggi;
        if (dataForEl) dataForEl.value = oggi;
        
    } catch (e) {
        console.error('Errore init:', e);
    }
};

APP.loadConfig = function() {
    const saved = localStorage.getItem('picam_config');
    if (saved) {
        APP.config = JSON.parse(saved);
        document.getElementById('config-folder').value = APP.config.folder || 'archivi/Ordini';
        document.getElementById('config-deposito').value = APP.config.deposito || '01';
    }
};

APP.saveConfig = function() {
    APP.config.folder = document.getElementById('config-folder').value;
    APP.config.deposito = document.getElementById('config-deposito').value;
    localStorage.setItem('picam_config', JSON.stringify(APP.config));
};

APP.checkSkipButton = async function() {
    const btn = document.getElementById('btn-skip-standalone');
    if (!btn) return;
    
    try {
        const hasData = await DB.hasData();
        if (hasData) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    } catch (e) {
        btn.classList.add('hidden');
    }
};

APP.skipToMenu = function() {
    APP.showScreen('menu');
    APP.updateMenuStats();
};

// ==========================================
// NAVIGAZIONE
// ==========================================

APP.showScreen = function(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById('screen-' + screenId);
    if (screen) {
        screen.classList.add('active');
        APP.currentScreen = screenId;
    }
};

APP.goToMenu = function() {
    APP.showScreen('menu');
    APP.updateMenuStats();
};

// ==========================================
// LOGIN GOOGLE
// ==========================================

APP.login = function() {
    const client = google.accounts.oauth2.initTokenClient({
        client_id: APP.CLIENT_ID,
        scope: APP.SCOPES,
        callback: (response) => {
            if (response.access_token) {
                APP.accessToken = response.access_token;
                APP.onLoginSuccess();
            } else {
                APP.showStatus('login-status', 'Errore accesso', 'error');
            }
        }
    });
    
    client.requestAccessToken();
};

APP.onLoginSuccess = async function() {
    // Ottieni email utente
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': 'Bearer ' + APP.accessToken }
        });
        const data = await res.json();
        APP.userEmail = data.email;
        localStorage.setItem('picam_user', APP.userEmail);
    } catch (e) {
        APP.userEmail = 'Utente';
    }
    
    // Aggiorna UI
    document.getElementById('step-login').classList.add('completed');
    document.getElementById('step-config').classList.remove('disabled');
    document.getElementById('step-load').classList.remove('disabled');
    document.getElementById('btn-load-data').disabled = false;
    APP.showStatus('login-status', `Connesso come ${APP.userEmail}`, 'success');
    
    // Controlla skip
    APP.checkSkipButton();
};

APP.logout = function() {
    APP.accessToken = null;
    APP.userEmail = null;
    localStorage.removeItem('picam_user');
    APP.closeSettings();
    APP.showScreen('setup');
    
    // Reset UI
    document.getElementById('step-login').classList.remove('completed');
    document.getElementById('step-config').classList.add('disabled');
    document.getElementById('step-load').classList.add('disabled');
    document.getElementById('login-status').textContent = '';
};

// ==========================================
// CARICAMENTO DATI
// ==========================================

APP.loadAllData = async function() {
    APP.saveConfig();
    
    const progressContainer = document.getElementById('load-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    progressContainer.classList.remove('hidden');
    
    const files = [
        { name: 'articoli.xlsx', store: 'articoli', parser: APP.parseArticoli },
        { name: 'codbar.xlsx', store: 'codbar', parser: APP.parseCodbar },
        { name: 'artdep.xlsx', store: 'giacenze', parser: APP.parseGiacenze },
        { name: 'clicom.xlsx', store: 'clienti', parser: APP.parseClienti },
        { name: 'forcom.xlsx', store: 'fornitori', parser: APP.parseFornitori },
        { name: 'iva.xlsx', store: 'iva', parser: APP.parseIva },
        { name: 'pagame.xlsx', store: 'pagamenti', parser: APP.parsePagamenti },
        { name: 'grupmerc.xlsx', store: 'gruppiMerc', parser: APP.parseGruppiMerc }
    ];
    
    let loaded = 0;
    let errors = [];
    
    for (const file of files) {
        progressText.textContent = `Caricamento ${file.name}...`;
        progressFill.style.width = `${(loaded / files.length) * 100}%`;
        
        try {
            const content = await APP.downloadFile(file.name);
            if (content) {
                const data = file.parser(content);
                await DB.clear(file.store);
                await DB.bulkPut(file.store, data);
                console.log(`${file.name}: ${data.length} record`);
            }
        } catch (e) {
            console.warn(`Errore ${file.name}:`, e);
            errors.push(file.name);
        }
        
        loaded++;
    }
    
    // Estrai locazioni dagli articoli
    progressText.textContent = 'Estrazione locazioni...';
    await DB.extractLocazioni();
    
    // Carica cache IVA
    await DB.loadIvaCache();
    
    progressFill.style.width = '100%';
    
    if (errors.length > 0) {
        APP.showStatus('load-status', `Caricati con ${errors.length} errori`, 'warning');
    } else {
        APP.showStatus('load-status', 'Dati caricati!', 'success');
    }
    
    // Salva timestamp
    localStorage.setItem('picam_last_sync', new Date().toISOString());
    
    // Vai al menu dopo 1s
    setTimeout(() => {
        APP.showScreen('menu');
        APP.updateMenuStats();
    }, 1000);
};

APP.downloadFile = async function(filename) {
    const folderPath = APP.config.folder;
    
    // Cerca file nella cartella
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${filename}' and trashed=false&fields=files(id,name)`;
    
    try {
        const searchRes = await fetch(searchUrl, {
            headers: { 'Authorization': 'Bearer ' + APP.accessToken }
        });
        const searchData = await searchRes.json();
        
        if (!searchData.files || searchData.files.length === 0) {
            console.warn(`File non trovato: ${filename}`);
            return null;
        }
        
        const fileId = searchData.files[0].id;
        
        // Scarica contenuto
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const downloadRes = await fetch(downloadUrl, {
            headers: { 'Authorization': 'Bearer ' + APP.accessToken }
        });
        
        const blob = await downloadRes.blob();
        return await blob.arrayBuffer();
        
    } catch (e) {
        console.error(`Errore download ${filename}:`, e);
        throw e;
    }
};

// ==========================================
// PARSER XLSX
// ==========================================

APP.parseArticoli = function(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        
        data.push({
            codice: String(r[0] || '').trim(),
            des1: String(r[1] || '').trim(),
            des2: String(r[2] || '').trim(),
            um: String(r[3] || '').trim(),
            codIva: String(r[4] || '').trim(),
            prezzo1: parseFloat(r[5]) || 0,
            prezzo2: parseFloat(r[6]) || 0,
            prezzo3: parseFloat(r[7]) || 0,
            prezzo4: parseFloat(r[8]) || 0,
            costoUltimo: parseFloat(r[9]) || 0,
            costoMedio: parseFloat(r[10]) || 0,
            barcode: String(r[11] || '').trim(),
            gruppoMerc: String(r[12] || '').trim(),
            locazione: String(r[13] || '').trim().toUpperCase()
        });
    }
    
    return data;
};

APP.parseCodbar = function(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        
        data.push({
            barcode: String(r[0] || '').trim(),
            codice: String(r[1] || '').trim()
        });
    }
    
    return data;
};

APP.parseGiacenze = function(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        
        data.push({
            codice: String(r[0] || '').trim(),
            deposito: String(r[1] || '01').trim(),
            esistenza: parseFloat(r[2]) || 0,
            ordinato: parseFloat(r[3]) || 0,
            impegnato: parseFloat(r[4]) || 0
        });
    }
    
    return data;
};

APP.parseClienti = function(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        
        data.push({
            codice: String(r[0] || '').trim(),
            ragSoc1: String(r[1] || '').trim(),
            ragSoc2: String(r[2] || '').trim(),
            indirizzo: String(r[3] || '').trim(),
            cap: String(r[4] || '').trim(),
            citta: String(r[5] || '').trim(),
            prov: String(r[6] || '').trim(),
            piva: String(r[7] || '').trim(),
            cf: String(r[8] || '').trim(),
            telefono: String(r[9] || '').trim(),
            email: String(r[10] || '').trim()
        });
    }
    
    return data;
};

APP.parseFornitori = function(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        
        data.push({
            codice: String(r[0] || '').trim(),
            ragSoc1: String(r[1] || '').trim(),
            ragSoc2: String(r[2] || '').trim(),
            indirizzo: String(r[3] || '').trim(),
            cap: String(r[4] || '').trim(),
            citta: String(r[5] || '').trim(),
            prov: String(r[6] || '').trim(),
            piva: String(r[7] || '').trim(),
            cf: String(r[8] || '').trim(),
            telefono: String(r[9] || '').trim(),
            email: String(r[10] || '').trim()
        });
    }
    
    return data;
};

APP.parseIva = function(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        
        data.push({
            codice: String(r[0] || '').trim(),
            aliquota: parseFloat(r[1]) || 0,
            descrizione: String(r[2] || '').trim()
        });
    }
    
    return data;
};

APP.parsePagamenti = function(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        
        data.push({
            codice: String(r[0] || '').trim(),
            descrizione: String(r[1] || '').trim()
        });
    }
    
    return data;
};

APP.parseGruppiMerc = function(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const data = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        
        data.push({
            codice: String(r[0] || '').trim(),
            descrizione: String(r[1] || '').trim()
        });
    }
    
    return data;
};

// ==========================================
// MENU
// ==========================================

APP.updateMenuStats = async function() {
    try {
        const stats = await DB.getStats();
        
        // Info articoli
        document.getElementById('menu-articoli-count').textContent = `${stats.articoli} articoli`;
        
        // Last sync
        const lastSync = localStorage.getItem('picam_last_sync');
        if (lastSync) {
            const d = new Date(lastSync);
            document.getElementById('menu-last-sync').textContent = 
                `Sync: ${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // Badge
        APP.updateBadge('badge-inventario', stats.queueInventario);
        APP.updateBadge('badge-ordini-cli', stats.queueOrdiniClienti);
        APP.updateBadge('badge-ordini-for', stats.queueOrdiniFornitori);
        
    } catch (e) {
        console.error('Errore updateMenuStats:', e);
    }
};

APP.updateBadge = function(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (count > 0) {
        el.textContent = count;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
};

// ==========================================
// INVENTARIO - NAVIGAZIONE MODALITÀ
// ==========================================

APP.openInventario = function() {
    APP.currentContext = 'inventario';
    APP.showScreen('inventario');
    APP.updateHeaderQueueCount('inv');
    APP.showInvModeSelector();
};

APP.showInvModeSelector = function() {
    APP.invMode = 'selector';
    document.getElementById('inv-mode-selector').style.display = 'block';
    document.getElementById('inv-scansione-mode').classList.add('hidden');
    document.getElementById('inv-locazione-mode').classList.add('hidden');
    document.getElementById('inv-gruppo-mode').classList.add('hidden');
};

APP.setInvModeScansione = function() {
    APP.invMode = 'scansione';
    document.getElementById('inv-mode-selector').style.display = 'none';
    document.getElementById('inv-scansione-mode').classList.remove('hidden');
    document.getElementById('inv-locazione-mode').classList.add('hidden');
    document.getElementById('inv-gruppo-mode').classList.add('hidden');
    
    // Renderizza cronologia
    APP.renderHistory();
};

APP.setInvModeLocazione = async function() {
    APP.invMode = 'locazione';
    document.getElementById('inv-mode-selector').style.display = 'none';
    document.getElementById('inv-scansione-mode').classList.add('hidden');
    document.getElementById('inv-locazione-mode').classList.remove('hidden');
    document.getElementById('inv-gruppo-mode').classList.add('hidden');
    
    // Carica locazioni nel select
    const select = document.getElementById('inv-loc-select');
    select.innerHTML = '<option value="">-- Seleziona Locazione --</option>';
    select.innerHTML += '<option value="__ALL__">📋 TUTTE LE LOCAZIONI</option>';
    
    try {
        const locazioni = await DB.getAllLocazioni();
        locazioni.forEach(loc => {
            select.innerHTML += `<option value="${loc.codice}">${loc.codice}</option>`;
        });
    } catch(e) {
        console.warn('Errore caricamento locazioni:', e);
    }
    
    // Reset tabella
    document.getElementById('inv-loc-tbody').innerHTML = '';
    document.getElementById('inv-loc-actions').classList.add('hidden');
};

APP.setInvModeGruppo = async function() {
    APP.invMode = 'gruppo';
    document.getElementById('inv-mode-selector').style.display = 'none';
    document.getElementById('inv-scansione-mode').classList.add('hidden');
    document.getElementById('inv-locazione-mode').classList.add('hidden');
    document.getElementById('inv-gruppo-mode').classList.remove('hidden');
    
    // Carica gruppi nel select
    const select = document.getElementById('inv-grp-select');
    select.innerHTML = '<option value="">-- Seleziona Gruppo --</option>';
    select.innerHTML += '<option value="__ALL__">📋 TUTTI I GRUPPI</option>';
    
    try {
        const gruppi = await DB.getAllGruppiMerceologici();
        gruppi.forEach(g => {
            select.innerHTML += `<option value="${g.codice}">${g.codice} - ${g.descrizione}</option>`;
        });
    } catch(e) {
        console.warn('Errore caricamento gruppi:', e);
    }
    
    // Reset tabella
    document.getElementById('inv-grp-tbody').innerHTML = '';
    document.getElementById('inv-grp-actions').classList.add('hidden');
};

// ==========================================
// INVENTARIO PER LOCAZIONE
// ==========================================

APP.loadArticoliByLocazione = async function() {
    const select = document.getElementById('inv-loc-select');
    const value = select.value;
    const tbody = document.getElementById('inv-loc-tbody');
    const actions = document.getElementById('inv-loc-actions');
    
    if (!value) {
        tbody.innerHTML = '';
        actions.classList.add('hidden');
        APP.invLocazioneData = [];
        return;
    }
    
    try {
        let articoli = [];
        
        if (value === '__ALL__') {
            // Tutti ordinati per locazione+codice
            articoli = await DB.getAllArticoliByLocazione();
        } else {
            // Solo una locazione specifica
            articoli = await DB.getArticoliByLocazione(value);
        }
        
        // Aggiungi giacenza e prepara dati
        APP.invLocazioneData = [];
        for (const art of articoli) {
            const esistenza = await DB.getGiacenza(art.codice, APP.config.deposito);
            APP.invLocazioneData.push({
                ...art,
                esistenza: esistenza,
                qtyInventario: 0,
                locazioneNuova: art.locazione || '',
                locazioneModificata: false
            });
        }
        
        APP.renderInvLocazione();
        
    } catch(e) {
        console.error('Errore caricamento articoli per locazione:', e);
        tbody.innerHTML = '<tr><td colspan="5" class="inv-tab-empty">Errore caricamento</td></tr>';
    }
};

APP.renderInvLocazione = function() {
    const tbody = document.getElementById('inv-loc-tbody');
    const actions = document.getElementById('inv-loc-actions');
    const countEl = document.getElementById('inv-loc-count');
    
    if (APP.invLocazioneData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="inv-tab-empty">
                        <div class="inv-tab-empty-icon">📭</div>
                        <p>Nessun articolo trovato</p>
                    </div>
                </td>
            </tr>
        `;
        actions.classList.add('hidden');
        return;
    }
    
    let html = '';
    APP.invLocazioneData.forEach((art, index) => {
        const hasQty = art.qtyInventario > 0;
        const locModified = art.locazioneModificata;
        const rowClass = (hasQty || locModified) ? 'modified' : '';
        
        html += `
            <tr class="${rowClass}">
                <td class="cell-code">${art.codice}</td>
                <td class="cell-desc" title="${art.des1 || ''}">${art.des1 || ''}</td>
                <td>
                    <input type="text" 
                           class="input-loc ${locModified ? 'modified' : ''}"
                           value="${art.locazioneNuova || ''}"
                           maxlength="10"
                           data-index="${index}"
                           data-mode="loc"
                           onchange="APP.updateInvLocazione(${index}, this.value)"
                           onfocus="this.select()">
                </td>
                <td class="cell-exist">${art.esistenza}</td>
                <td>
                    <input type="number" 
                           class="input-qty ${hasQty ? 'has-value' : ''}"
                           value="${art.qtyInventario || ''}"
                           placeholder="0"
                           min="0"
                           data-index="${index}"
                           data-mode="loc"
                           onchange="APP.updateInvLocQty(${index}, this.value)"
                           onfocus="this.select()">
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Conta articoli con modifiche
    const countWithChanges = APP.invLocazioneData.filter(a => a.qtyInventario > 0 || a.locazioneModificata).length;
    countEl.textContent = countWithChanges;
    
    if (countWithChanges > 0) {
        actions.classList.remove('hidden');
    } else {
        actions.classList.add('hidden');
    }
};

APP.updateInvLocazione = function(index, value) {
    const newLoc = value.trim().toUpperCase();
    const original = APP.invLocazioneData[index].locazione || '';
    
    APP.invLocazioneData[index].locazioneNuova = newLoc;
    APP.invLocazioneData[index].locazioneModificata = (newLoc !== original);
    
    // Aggiorna UI
    const input = document.querySelector(`input[data-index="${index}"][data-mode="loc"].input-loc`);
    if (input) {
        input.value = newLoc;
        input.classList.toggle('modified', APP.invLocazioneData[index].locazioneModificata);
    }
    
    // Aggiorna riga
    const tr = input?.closest('tr');
    if (tr) {
        const hasChanges = APP.invLocazioneData[index].qtyInventario > 0 || APP.invLocazioneData[index].locazioneModificata;
        tr.classList.toggle('modified', hasChanges);
    }
    
    // Aggiorna contatore
    APP.updateInvLocCount();
};

APP.updateInvLocQty = function(index, value) {
    const qty = parseInt(value) || 0;
    APP.invLocazioneData[index].qtyInventario = qty;
    
    // Aggiorna UI
    const input = document.querySelector(`input[data-index="${index}"][data-mode="loc"].input-qty`);
    if (input) {
        input.classList.toggle('has-value', qty > 0);
    }
    
    // Aggiorna riga
    const tr = input?.closest('tr');
    if (tr) {
        const hasChanges = APP.invLocazioneData[index].qtyInventario > 0 || APP.invLocazioneData[index].locazioneModificata;
        tr.classList.toggle('modified', hasChanges);
    }
    
    // Aggiorna contatore
    APP.updateInvLocCount();
};

APP.updateInvLocCount = function() {
    const countWithChanges = APP.invLocazioneData.filter(a => a.qtyInventario > 0 || a.locazioneModificata).length;
    document.getElementById('inv-loc-count').textContent = countWithChanges;
    
    const actions = document.getElementById('inv-loc-actions');
    if (countWithChanges > 0) {
        actions.classList.remove('hidden');
    } else {
        actions.classList.add('hidden');
    }
};

APP.confirmInventarioLocazione = async function() {
    const articoliModificati = APP.invLocazioneData.filter(a => a.qtyInventario > 0 || a.locazioneModificata);
    
    if (articoliModificati.length === 0) {
        APP.showToast('Nessuna modifica da confermare', 'error');
        return;
    }
    
    const conferma = confirm(`Confermi le modifiche a ${articoliModificati.length} articoli?`);
    if (!conferma) return;
    
    let countInv = 0;
    let countLoc = 0;
    
    for (const art of articoliModificati) {
        // Se la locazione è stata modificata, aggiorna l'articolo
        if (art.locazioneModificata) {
            await DB.updateArticoloLocazione(art.codice, art.locazioneNuova);
            countLoc++;
        }
        
        // Se c'è quantità inventariata, aggiungi alla coda
        if (art.qtyInventario > 0) {
            await APP.addToInventarioQueue(art, art.qtyInventario, art.locazioneNuova);
            countInv++;
        }
    }
    
    let msg = '';
    if (countInv > 0) msg += `${countInv} inventariati. `;
    if (countLoc > 0) msg += `${countLoc} locazioni aggiornate.`;
    
    APP.showToast(msg, 'success');
    
    // Reset dati
    APP.invLocazioneData = APP.invLocazioneData.map(a => ({
        ...a,
        qtyInventario: 0,
        locazioneNuova: a.locazioneModificata ? a.locazioneNuova : a.locazione,
        locazione: a.locazioneModificata ? a.locazioneNuova : a.locazione,
        locazioneModificata: false
    }));
    
    APP.renderInvLocazione();
    APP.updateHeaderQueueCount('inv');
};

// ==========================================
// INVENTARIO PER GRUPPO
// ==========================================

APP.loadArticoliByGruppo = async function() {
    const select = document.getElementById('inv-grp-select');
    const value = select.value;
    const tbody = document.getElementById('inv-grp-tbody');
    const actions = document.getElementById('inv-grp-actions');
    
    if (!value) {
        tbody.innerHTML = '';
        actions.classList.add('hidden');
        APP.invGruppoData = [];
        return;
    }
    
    try {
        let articoli = [];
        
        if (value === '__ALL__') {
            // Tutti ordinati per gruppo+codice
            articoli = await DB.getAllArticoliByGruppo();
        } else {
            // Solo un gruppo specifico
            articoli = await DB.getArticoliByGruppo(value);
        }
        
        // Aggiungi giacenza e prepara dati
        APP.invGruppoData = [];
        for (const art of articoli) {
            const esistenza = await DB.getGiacenza(art.codice, APP.config.deposito);
            APP.invGruppoData.push({
                ...art,
                esistenza: esistenza,
                qtyInventario: 0,
                locazioneNuova: art.locazione || '',
                locazioneModificata: false
            });
        }
        
        APP.renderInvGruppo();
        
    } catch(e) {
        console.error('Errore caricamento articoli per gruppo:', e);
        tbody.innerHTML = '<tr><td colspan="5" class="inv-tab-empty">Errore caricamento</td></tr>';
    }
};

APP.renderInvGruppo = function() {
    const tbody = document.getElementById('inv-grp-tbody');
    const actions = document.getElementById('inv-grp-actions');
    const countEl = document.getElementById('inv-grp-count');
    
    if (APP.invGruppoData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="inv-tab-empty">
                        <div class="inv-tab-empty-icon">📭</div>
                        <p>Nessun articolo trovato</p>
                    </div>
                </td>
            </tr>
        `;
        actions.classList.add('hidden');
        return;
    }
    
    let html = '';
    APP.invGruppoData.forEach((art, index) => {
        const hasQty = art.qtyInventario > 0;
        const locModified = art.locazioneModificata;
        const rowClass = (hasQty || locModified) ? 'modified' : '';
        
        html += `
            <tr class="${rowClass}">
                <td class="cell-code">${art.codice}</td>
                <td class="cell-desc" title="${art.des1 || ''}">${art.des1 || ''}</td>
                <td>
                    <input type="text" 
                           class="input-loc ${locModified ? 'modified' : ''}"
                           value="${art.locazioneNuova || ''}"
                           maxlength="10"
                           data-index="${index}"
                           data-mode="grp"
                           onchange="APP.updateInvGrpLocazione(${index}, this.value)"
                           onfocus="this.select()">
                </td>
                <td class="cell-exist">${art.esistenza}</td>
                <td>
                    <input type="number" 
                           class="input-qty ${hasQty ? 'has-value' : ''}"
                           value="${art.qtyInventario || ''}"
                           placeholder="0"
                           min="0"
                           data-index="${index}"
                           data-mode="grp"
                           onchange="APP.updateInvGrpQty(${index}, this.value)"
                           onfocus="this.select()">
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    
    // Conta articoli con modifiche
    const countWithChanges = APP.invGruppoData.filter(a => a.qtyInventario > 0 || a.locazioneModificata).length;
    countEl.textContent = countWithChanges;
    
    if (countWithChanges > 0) {
        actions.classList.remove('hidden');
    } else {
        actions.classList.add('hidden');
    }
};

APP.updateInvGrpLocazione = function(index, value) {
    const newLoc = value.trim().toUpperCase();
    const original = APP.invGruppoData[index].locazione || '';
    
    APP.invGruppoData[index].locazioneNuova = newLoc;
    APP.invGruppoData[index].locazioneModificata = (newLoc !== original);
    
    // Aggiorna UI
    const input = document.querySelector(`input[data-index="${index}"][data-mode="grp"].input-loc`);
    if (input) {
        input.value = newLoc;
        input.classList.toggle('modified', APP.invGruppoData[index].locazioneModificata);
    }
    
    // Aggiorna riga
    const tr = input?.closest('tr');
    if (tr) {
        const hasChanges = APP.invGruppoData[index].qtyInventario > 0 || APP.invGruppoData[index].locazioneModificata;
        tr.classList.toggle('modified', hasChanges);
    }
    
    // Aggiorna contatore
    APP.updateInvGrpCount();
};

APP.updateInvGrpQty = function(index, value) {
    const qty = parseInt(value) || 0;
    APP.invGruppoData[index].qtyInventario = qty;
    
    // Aggiorna UI
    const input = document.querySelector(`input[data-index="${index}"][data-mode="grp"].input-qty`);
    if (input) {
        input.classList.toggle('has-value', qty > 0);
    }
    
    // Aggiorna riga
    const tr = input?.closest('tr');
    if (tr) {
        const hasChanges = APP.invGruppoData[index].qtyInventario > 0 || APP.invGruppoData[index].locazioneModificata;
        tr.classList.toggle('modified', hasChanges);
    }
    
    // Aggiorna contatore
    APP.updateInvGrpCount();
};

APP.updateInvGrpCount = function() {
    const countWithChanges = APP.invGruppoData.filter(a => a.qtyInventario > 0 || a.locazioneModificata).length;
    document.getElementById('inv-grp-count').textContent = countWithChanges;
    
    const actions = document.getElementById('inv-grp-actions');
    if (countWithChanges > 0) {
        actions.classList.remove('hidden');
    } else {
        actions.classList.add('hidden');
    }
};

APP.confirmInventarioGruppo = async function() {
    const articoliModificati = APP.invGruppoData.filter(a => a.qtyInventario > 0 || a.locazioneModificata);
    
    if (articoliModificati.length === 0) {
        APP.showToast('Nessuna modifica da confermare', 'error');
        return;
    }
    
    const conferma = confirm(`Confermi le modifiche a ${articoliModificati.length} articoli?`);
    if (!conferma) return;
    
    let countInv = 0;
    let countLoc = 0;
    
    for (const art of articoliModificati) {
        // Se la locazione è stata modificata, aggiorna l'articolo
        if (art.locazioneModificata) {
            await DB.updateArticoloLocazione(art.codice, art.locazioneNuova);
            countLoc++;
        }
        
        // Se c'è quantità inventariata, aggiungi alla coda
        if (art.qtyInventario > 0) {
            await APP.addToInventarioQueue(art, art.qtyInventario, art.locazioneNuova);
            countInv++;
        }
    }
    
    let msg = '';
    if (countInv > 0) msg += `${countInv} inventariati. `;
    if (countLoc > 0) msg += `${countLoc} locazioni aggiornate.`;
    
    APP.showToast(msg, 'success');
    
    // Reset dati
    APP.invGruppoData = APP.invGruppoData.map(a => ({
        ...a,
        qtyInventario: 0,
        locazioneNuova: a.locazioneModificata ? a.locazioneNuova : a.locazione,
        locazione: a.locazioneModificata ? a.locazioneNuova : a.locazione,
        locazioneModificata: false
    }));
    
    APP.renderInvGruppo();
    APP.updateHeaderQueueCount('inv');
};

// ==========================================
// INVENTARIO SCANSIONE - CODA
// ==========================================

APP.addToInventarioQueue = async function(articolo, qty, locazione = null) {
    const item = {
        codice: articolo.codice,
        des1: articolo.des1,
        locazione: locazione || articolo.locazione || '',
        qty: qty,
        deposito: APP.config.deposito
    };
    
    await DB.addToQueue('queueInventario', item);
};

// ==========================================
// Continua in parte 2...

// ==========================================
// RICERCA ARTICOLI
// ==========================================

APP.debounceSearch = function(context) {
    if (APP.searchTimeout) clearTimeout(APP.searchTimeout);
    
    APP.searchTimeout = setTimeout(() => {
        APP.searchArticoli(context);
    }, 300);
};

APP.searchArticoli = async function(context) {
    const inputId = context === 'inv' ? 'search-inv' : 
                   context === 'ord-cli' ? 'search-ord-cli' : 
                   context === 'ord-for' ? 'search-ord-for' :
                   context === 'cliente' ? 'search-cliente' :
                   context === 'fornitore' ? 'search-fornitore' : null;
    
    const resultsId = `results-${context}`;
    
    if (!inputId) return;
    
    const query = document.getElementById(inputId).value.trim();
    const resultsEl = document.getElementById(resultsId);
    
    if (!resultsEl) return;
    
    if (query.length < 2) {
        resultsEl.innerHTML = '';
        return;
    }
    
    try {
        let results = [];
        
        if (context === 'cliente') {
            results = await DB.searchClienti(query);
            APP.renderClienteResults(results, resultsEl);
        } else if (context === 'fornitore') {
            results = await DB.searchFornitori(query);
            APP.renderFornitoreResults(results, resultsEl);
        } else {
            results = await DB.searchArticoli(query);
            
            // Aggiungi giacenza
            for (const art of results) {
                art.giacenza = await DB.getGiacenza(art.codice, APP.config.deposito);
            }
            
            APP.renderArticoliResults(results, resultsEl, context);
        }
        
    } catch (e) {
        console.error('Errore ricerca:', e);
        resultsEl.innerHTML = '<div class="empty-message">Errore ricerca</div>';
    }
};

APP.renderArticoliResults = function(results, container, context) {
    if (results.length === 0) {
        container.innerHTML = '<div class="empty-message">Nessun risultato</div>';
        return;
    }
    
    container.innerHTML = results.map(art => `
        <div class="result-item" onclick="APP.selectArticolo('${art.codice}', '${context}')">
            <div class="result-info">
                <div class="result-code">${art.codice}</div>
                <div class="result-desc">${art.des1 || ''}</div>
                <div class="result-meta">📍 ${art.locazione || '-'} | Giac: ${art.giacenza}</div>
            </div>
            <div class="result-qty">€ ${(art.prezzo1 || 0).toFixed(2)}</div>
        </div>
    `).join('');
};

APP.renderClienteResults = function(results, container) {
    if (results.length === 0) {
        container.innerHTML = '<div class="empty-message">Nessun cliente trovato</div>';
        return;
    }
    
    container.innerHTML = results.map(cli => `
        <div class="result-item" onclick="APP.selectCliente('${cli.codice}')">
            <div class="result-info">
                <div class="result-code">${cli.codice}</div>
                <div class="result-desc">${cli.ragSoc1 || ''}</div>
                <div class="result-meta">${cli.citta || ''} ${cli.prov || ''}</div>
            </div>
        </div>
    `).join('');
};

APP.renderFornitoreResults = function(results, container) {
    if (results.length === 0) {
        container.innerHTML = '<div class="empty-message">Nessun fornitore trovato</div>';
        return;
    }
    
    container.innerHTML = results.map(forn => `
        <div class="result-item" onclick="APP.selectFornitore('${forn.codice}')">
            <div class="result-info">
                <div class="result-code">${forn.codice}</div>
                <div class="result-desc">${forn.ragSoc1 || ''}</div>
                <div class="result-meta">${forn.citta || ''} ${forn.prov || ''}</div>
            </div>
        </div>
    `).join('');
};

// ==========================================
// SELEZIONE ARTICOLO
// ==========================================

APP.currentArticolo = null;

APP.selectArticolo = async function(codice, context) {
    try {
        const articolo = await DB.get('articoli', codice);
        if (!articolo) {
            APP.showToast('Articolo non trovato', 'error');
            return;
        }
        
        articolo.giacenza = await DB.getGiacenza(codice, APP.config.deposito);
        
        APP.currentArticolo = articolo;
        APP.scanContext = context;
        
        // Fast scan per inventario
        if (context === 'inv' && APP.fastScanMode['inv']) {
            const locazione = articolo.locazione || '';
            await APP.addToInventarioQueue(articolo, 1, locazione);
            APP.addToHistory(articolo, 1);
            APP.showToast(`${articolo.codice} aggiunto (qty 1)`, 'success');
            APP.updateHeaderQueueCount('inv');
            
            // Pulisci ricerca
            document.getElementById('search-inv').value = '';
            document.getElementById('results-inv').innerHTML = '';
            return;
        }
        
        APP.openArticoloModal(articolo, context);
        
    } catch (e) {
        console.error('Errore selezione articolo:', e);
        APP.showToast('Errore', 'error');
    }
};

APP.openArticoloModal = function(articolo, context) {
    document.getElementById('art-codice').textContent = articolo.codice;
    document.getElementById('art-descrizione').textContent = articolo.des1 || '';
    document.getElementById('art-giacenza').textContent = articolo.giacenza || 0;
    document.getElementById('art-prezzo').textContent = `€ ${(articolo.prezzo1 || 0).toFixed(2)}`;
    document.getElementById('art-qty').value = 1;
    
    // Campo locazione
    const locGroup = document.getElementById('field-locazione-group');
    const locInput = document.getElementById('art-locazione');
    
    if (context === 'inv') {
        locGroup.style.display = 'block';
        locInput.value = articolo.locazione || '';
    } else {
        locGroup.style.display = 'none';
    }
    
    // Titolo
    document.getElementById('articolo-modal-title').textContent = 
        context === 'inv' ? '📋 Inventariazione' : '📦 Aggiungi al carrello';
    
    document.getElementById('articolo-modal').classList.remove('hidden');
};

APP.closeArticoloModal = function() {
    document.getElementById('articolo-modal').classList.add('hidden');
    APP.currentArticolo = null;
};

APP.incrementQty = function() {
    const input = document.getElementById('art-qty');
    input.value = parseInt(input.value || 0) + 1;
};

APP.decrementQty = function() {
    const input = document.getElementById('art-qty');
    const val = parseInt(input.value || 0);
    if (val > 1) input.value = val - 1;
};

APP.addToQueue = async function() {
    if (!APP.currentArticolo) return;
    
    const qty = parseInt(document.getElementById('art-qty').value) || 1;
    const context = APP.scanContext;
    
    if (context === 'inv') {
        const locazione = document.getElementById('art-locazione').value.trim().toUpperCase();
        
        // Se locazione cambiata, aggiorna articolo
        if (locazione !== (APP.currentArticolo.locazione || '')) {
            await DB.updateArticoloLocazione(APP.currentArticolo.codice, locazione);
        }
        
        await APP.addToInventarioQueue(APP.currentArticolo, qty, locazione);
        APP.addToHistory(APP.currentArticolo, qty);
        APP.updateHeaderQueueCount('inv');
        
    } else if (context === 'ord-cli') {
        APP.addRigaOrdineCliente(APP.currentArticolo, qty);
        
    } else if (context === 'ord-for') {
        APP.addRigaOrdineFornitore(APP.currentArticolo, qty);
    }
    
    APP.showToast(`${APP.currentArticolo.codice} aggiunto (qty ${qty})`, 'success');
    APP.closeArticoloModal();
    
    // Pulisci ricerca
    const searchId = context === 'inv' ? 'search-inv' : 
                    context === 'ord-cli' ? 'search-ord-cli' : 'search-ord-for';
    const resultsId = 'results-' + context;
    
    document.getElementById(searchId).value = '';
    document.getElementById(resultsId).innerHTML = '';
};

// ==========================================
// HISTORY SCANSIONI
// ==========================================

APP.addToHistory = function(articolo, qty) {
    APP.scanHistory.unshift({
        codice: articolo.codice,
        des1: articolo.des1,
        qty: qty,
        timestamp: new Date().toISOString()
    });
    
    // Max 20 elementi
    if (APP.scanHistory.length > 20) {
        APP.scanHistory = APP.scanHistory.slice(0, 20);
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
    
    container.innerHTML = APP.scanHistory.slice(0, 10).map(item => `
        <div class="history-item">
            <div>
                <div class="history-code">${item.codice}</div>
                <div class="history-desc">${item.des1 || ''}</div>
            </div>
            <div class="history-qty">+${item.qty}</div>
        </div>
    `).join('');
};

// ==========================================
// SCANNER
// ==========================================

APP.startScan = function(context) {
    APP.scanContext = context;
    document.getElementById('scanner-modal').classList.remove('hidden');
    
    const container = document.getElementById('scanner-container');
    
    APP.scanner = new Html5Qrcode('scanner-container');
    
    APP.scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
            APP.onScanSuccess(decodedText);
        },
        (errorMessage) => {
            // Ignora errori di scansione continua
        }
    ).catch(err => {
        console.error('Errore scanner:', err);
        APP.showToast('Errore avvio scanner', 'error');
        APP.closeScanner();
    });
};

APP.onScanSuccess = async function(barcode) {
    APP.closeScanner();
    
    try {
        const articolo = await DB.getArticoloByBarcode(barcode);
        
        if (articolo) {
            APP.selectArticolo(articolo.codice, APP.scanContext);
        } else {
            APP.showToast(`Barcode ${barcode} non trovato`, 'error');
        }
        
    } catch (e) {
        console.error('Errore barcode:', e);
        APP.showToast('Errore lettura barcode', 'error');
    }
};

APP.closeScanner = function() {
    if (APP.scanner) {
        APP.scanner.stop().catch(() => {});
        APP.scanner = null;
    }
    document.getElementById('scanner-modal').classList.add('hidden');
};

APP.toggleFastScan = function(context) {
    const checkbox = document.getElementById(`fast-scan-${context}`);
    APP.fastScanMode[context] = checkbox.checked;
};

// ==========================================
// FILTRI ARTICOLI
// ==========================================

APP.toggleArticoliFilters = async function(context) {
    const filtersEl = document.getElementById(`articoli-filters-${context}`);
    const btnEl = document.querySelector(`#screen-inventario .btn-filter-toggle`);
    
    if (!filtersEl) return;
    
    const isHidden = filtersEl.classList.contains('hidden');
    
    if (isHidden) {
        filtersEl.classList.remove('hidden');
        if (btnEl) btnEl.classList.add('active');
        await APP.loadArticoliFilterOptions(context);
    } else {
        filtersEl.classList.add('hidden');
        if (btnEl) btnEl.classList.remove('active');
    }
};

APP.loadArticoliFilterOptions = async function(context) {
    const gruppoSelect = document.getElementById(`filter-gruppo-${context}`);
    const locazioneSelect = document.getElementById(`filter-locazione-${context}`);
    
    if (gruppoSelect) {
        try {
            const gruppi = await DB.getAllGruppiMerceologici();
            gruppoSelect.innerHTML = '<option value="">📦 Tutti i gruppi</option>';
            gruppi.forEach(g => {
                gruppoSelect.innerHTML += `<option value="${g.codice}">${g.descrizione}</option>`;
            });
        } catch(e) {}
    }
    
    if (locazioneSelect) {
        try {
            const locazioni = await DB.getAllLocazioni();
            locazioneSelect.innerHTML = '<option value="">📍 Tutte le locazioni</option>';
            locazioni.forEach(l => {
                locazioneSelect.innerHTML += `<option value="${l.codice}">${l.codice}</option>`;
            });
        } catch(e) {}
    }
};

APP.applyArticoliFilters = function(context) {
    // Implementa filtri se necessario
    APP.searchArticoli(context);
};

APP.resetArticoliFilters = function(context) {
    document.getElementById(`filter-gruppo-${context}`).value = '';
    document.getElementById(`filter-locazione-${context}`).value = '';
    document.getElementById(`filter-giacenza-${context}`).value = '';
    APP.searchArticoli(context);
};

// ==========================================
// ORDINI CLIENTI
// ==========================================

APP.openOrdiniClienti = function() {
    APP.currentContext = 'ordiniClienti';
    APP.showScreen('ordini-clienti');
    APP.updateHeaderQueueCount('ord-cli');
    APP.initOrdineCliente();
};

APP.initOrdineCliente = function() {
    APP.righeOrdineClienti = [];
    APP.clienteSelezionato = null;
    
    document.getElementById('ord-cli-data').value = new Date().toLocaleDateString('it-IT');
    document.getElementById('search-cliente').value = '';
    document.getElementById('results-cliente').innerHTML = '';
    document.getElementById('cliente-selected').classList.add('hidden');
    
    APP.renderRigheOrdineClienti();
    APP.updateTotaliOrdineCliente();
};

APP.selectCliente = async function(codice) {
    try {
        const cliente = await DB.get('clienti', codice);
        if (!cliente) return;
        
        APP.clienteSelezionato = cliente;
        
        document.getElementById('cliente-code').textContent = cliente.codice;
        document.getElementById('cliente-name').textContent = cliente.ragSoc1;
        document.getElementById('cliente-selected').classList.remove('hidden');
        document.getElementById('results-cliente').innerHTML = '';
        document.getElementById('search-cliente').value = '';
        
        APP.updateBtnConfermaOrdCli();
        
    } catch (e) {
        console.error('Errore selezione cliente:', e);
    }
};

APP.clearCliente = function() {
    APP.clienteSelezionato = null;
    document.getElementById('cliente-selected').classList.add('hidden');
    APP.updateBtnConfermaOrdCli();
};

APP.addRigaOrdineCliente = function(articolo, qty) {
    // Cerca se esiste già
    const existingIndex = APP.righeOrdineClienti.findIndex(r => r.codice === articolo.codice);
    
    if (existingIndex >= 0) {
        APP.righeOrdineClienti[existingIndex].qty += qty;
    } else {
        APP.righeOrdineClienti.push({
            codice: articolo.codice,
            des1: articolo.des1,
            um: articolo.um,
            codIva: articolo.codIva,
            prezzo: articolo.prezzo1 || 0,
            qty: qty
        });
    }
    
    APP.renderRigheOrdineClienti();
    APP.updateTotaliOrdineCliente();
    APP.updateBtnConfermaOrdCli();
};

APP.renderRigheOrdineClienti = function() {
    const container = document.getElementById('righe-list-cli');
    const countEl = document.getElementById('righe-count-cli');
    
    countEl.textContent = `${APP.righeOrdineClienti.length} articoli`;
    
    if (APP.righeOrdineClienti.length === 0) {
        container.innerHTML = '<div class="empty-message">Nessun articolo</div>';
        return;
    }
    
    container.innerHTML = APP.righeOrdineClienti.map((riga, index) => `
        <div class="riga-item" onclick="APP.editRigaOrdine('cli', ${index})">
            <div class="riga-info">
                <div class="riga-code">${riga.codice}</div>
                <div class="riga-desc">${riga.des1 || ''}</div>
                <div class="riga-meta">
                    <span>Qtà: ${riga.qty}</span>
                    <span>€ ${riga.prezzo.toFixed(2)}</span>
                </div>
            </div>
            <div class="riga-totale">€ ${(riga.qty * riga.prezzo).toFixed(2)}</div>
        </div>
    `).join('');
};

APP.updateTotaliOrdineCliente = function() {
    let imponibile = 0;
    let totaleIva = 0;
    
    for (const riga of APP.righeOrdineClienti) {
        const importoRiga = riga.qty * riga.prezzo;
        imponibile += importoRiga;
        
        const aliquota = DB.getAliquotaIvaSync(riga.codIva);
        totaleIva += importoRiga * (aliquota / 100);
    }
    
    const totale = imponibile + totaleIva;
    
    document.getElementById('ord-cli-imponibile').textContent = `€ ${imponibile.toFixed(2)}`;
    document.getElementById('ord-cli-iva').textContent = `€ ${totaleIva.toFixed(2)}`;
    document.getElementById('ord-cli-totale').textContent = `€ ${totale.toFixed(2)}`;
};

APP.updateBtnConfermaOrdCli = function() {
    const btn = document.getElementById('btn-conferma-ord-cli');
    const canConfirm = APP.clienteSelezionato && APP.righeOrdineClienti.length > 0;
    btn.disabled = !canConfirm;
};

APP.confermaOrdineCliente = async function() {
    if (!APP.clienteSelezionato || APP.righeOrdineClienti.length === 0) {
        APP.showToast('Completa i dati dell\'ordine', 'error');
        return;
    }
    
    const ordine = {
        tipo: 'cliente',
        registro: document.getElementById('ord-cli-registro').value,
        numero: parseInt(document.getElementById('ord-cli-numero').value) || 1,
        data: new Date().toISOString(),
        cliente: APP.clienteSelezionato,
        righe: APP.righeOrdineClienti.map(r => ({...r}))
    };
    
    await DB.addToQueue('queueOrdiniClienti', ordine);
    
    APP.showToast('Ordine cliente aggiunto', 'success');
    
    // Incrementa numero ordine
    const nuovoNum = ordine.numero + 1;
    document.getElementById('ord-cli-numero').value = nuovoNum;
    
    // Reset
    APP.initOrdineCliente();
    APP.updateHeaderQueueCount('ord-cli');
};

// ==========================================
// ORDINI FORNITORI
// ==========================================

APP.openOrdiniFornitori = function() {
    APP.currentContext = 'ordiniFornitori';
    APP.showScreen('ordini-fornitori');
    APP.updateHeaderQueueCount('ord-for');
    APP.initOrdineFornitore();
};

APP.initOrdineFornitore = function() {
    APP.righeOrdiniFornitori = [];
    APP.fornitoreSelezionato = null;
    
    document.getElementById('ord-for-data').value = new Date().toLocaleDateString('it-IT');
    document.getElementById('search-fornitore').value = '';
    document.getElementById('results-fornitore').innerHTML = '';
    document.getElementById('fornitore-selected').classList.add('hidden');
    
    APP.renderRigheOrdineFornitori();
    APP.updateTotaliOrdineFornitore();
};

APP.selectFornitore = async function(codice) {
    try {
        const fornitore = await DB.get('fornitori', codice);
        if (!fornitore) return;
        
        APP.fornitoreSelezionato = fornitore;
        
        document.getElementById('fornitore-code').textContent = fornitore.codice;
        document.getElementById('fornitore-name').textContent = fornitore.ragSoc1;
        document.getElementById('fornitore-selected').classList.remove('hidden');
        document.getElementById('results-fornitore').innerHTML = '';
        document.getElementById('search-fornitore').value = '';
        
        APP.updateBtnConfermaOrdFor();
        
    } catch (e) {
        console.error('Errore selezione fornitore:', e);
    }
};

APP.clearFornitore = function() {
    APP.fornitoreSelezionato = null;
    document.getElementById('fornitore-selected').classList.add('hidden');
    APP.updateBtnConfermaOrdFor();
};

APP.addRigaOrdineFornitore = function(articolo, qty) {
    const existingIndex = APP.righeOrdiniFornitori.findIndex(r => r.codice === articolo.codice);
    
    if (existingIndex >= 0) {
        APP.righeOrdiniFornitori[existingIndex].qty += qty;
    } else {
        APP.righeOrdiniFornitori.push({
            codice: articolo.codice,
            des1: articolo.des1,
            um: articolo.um,
            codIva: articolo.codIva,
            prezzo: articolo.costoUltimo || articolo.prezzo1 || 0,
            qty: qty
        });
    }
    
    APP.renderRigheOrdineFornitori();
    APP.updateTotaliOrdineFornitore();
    APP.updateBtnConfermaOrdFor();
};

APP.renderRigheOrdineFornitori = function() {
    const container = document.getElementById('righe-list-for');
    const countEl = document.getElementById('righe-count-for');
    
    countEl.textContent = `${APP.righeOrdiniFornitori.length} articoli`;
    
    if (APP.righeOrdiniFornitori.length === 0) {
        container.innerHTML = '<div class="empty-message">Nessun articolo</div>';
        return;
    }
    
    container.innerHTML = APP.righeOrdiniFornitori.map((riga, index) => `
        <div class="riga-item" onclick="APP.editRigaOrdine('for', ${index})">
            <div class="riga-info">
                <div class="riga-code">${riga.codice}</div>
                <div class="riga-desc">${riga.des1 || ''}</div>
                <div class="riga-meta">
                    <span>Qtà: ${riga.qty}</span>
                    <span>€ ${riga.prezzo.toFixed(2)}</span>
                </div>
            </div>
            <div class="riga-totale">€ ${(riga.qty * riga.prezzo).toFixed(2)}</div>
        </div>
    `).join('');
};

APP.updateTotaliOrdineFornitore = function() {
    let imponibile = 0;
    let totaleIva = 0;
    
    for (const riga of APP.righeOrdiniFornitori) {
        const importoRiga = riga.qty * riga.prezzo;
        imponibile += importoRiga;
        
        const aliquota = DB.getAliquotaIvaSync(riga.codIva);
        totaleIva += importoRiga * (aliquota / 100);
    }
    
    const totale = imponibile + totaleIva;
    
    document.getElementById('ord-for-imponibile').textContent = `€ ${imponibile.toFixed(2)}`;
    document.getElementById('ord-for-iva').textContent = `€ ${totaleIva.toFixed(2)}`;
    document.getElementById('ord-for-totale').textContent = `€ ${totale.toFixed(2)}`;
};

APP.updateBtnConfermaOrdFor = function() {
    const btn = document.getElementById('btn-conferma-ord-for');
    const canConfirm = APP.fornitoreSelezionato && APP.righeOrdiniFornitori.length > 0;
    btn.disabled = !canConfirm;
};

APP.confermaOrdineFornitore = async function() {
    if (!APP.fornitoreSelezionato || APP.righeOrdiniFornitori.length === 0) {
        APP.showToast('Completa i dati dell\'ordine', 'error');
        return;
    }
    
    const ordine = {
        tipo: 'fornitore',
        registro: document.getElementById('ord-for-registro').value,
        numero: parseInt(document.getElementById('ord-for-numero').value) || 1,
        data: new Date().toISOString(),
        fornitore: APP.fornitoreSelezionato,
        righe: APP.righeOrdiniFornitori.map(r => ({...r}))
    };
    
    await DB.addToQueue('queueOrdiniFornitori', ordine);
    
    APP.showToast('Ordine fornitore aggiunto', 'success');
    
    // Incrementa numero ordine
    const nuovoNum = ordine.numero + 1;
    document.getElementById('ord-for-numero').value = nuovoNum;
    
    // Reset
    APP.initOrdineFornitore();
    APP.updateHeaderQueueCount('ord-for');
};

// ==========================================
// MODIFICA RIGA ORDINE
// ==========================================

APP.editRigaIndex = -1;
APP.editRigaTipo = '';

APP.editRigaOrdine = function(tipo, index) {
    APP.editRigaIndex = index;
    APP.editRigaTipo = tipo;
    
    const righe = tipo === 'cli' ? APP.righeOrdineClienti : APP.righeOrdiniFornitori;
    const riga = righe[index];
    
    document.getElementById('edit-riga-articolo').textContent = `${riga.codice} - ${riga.des1}`;
    document.getElementById('edit-riga-qty').value = riga.qty;
    
    document.getElementById('edit-riga-modal').classList.remove('hidden');
};

APP.closeEditRigaModal = function() {
    document.getElementById('edit-riga-modal').classList.add('hidden');
    APP.editRigaIndex = -1;
};

APP.incrementEditQty = function() {
    const input = document.getElementById('edit-riga-qty');
    input.value = parseInt(input.value || 0) + 1;
};

APP.decrementEditQty = function() {
    const input = document.getElementById('edit-riga-qty');
    const val = parseInt(input.value || 0);
    if (val > 1) input.value = val - 1;
};

APP.saveEditRiga = function() {
    const qty = parseInt(document.getElementById('edit-riga-qty').value) || 1;
    
    if (APP.editRigaTipo === 'cli') {
        APP.righeOrdineClienti[APP.editRigaIndex].qty = qty;
        APP.renderRigheOrdineClienti();
        APP.updateTotaliOrdineCliente();
    } else {
        APP.righeOrdiniFornitori[APP.editRigaIndex].qty = qty;
        APP.renderRigheOrdineFornitori();
        APP.updateTotaliOrdineFornitore();
    }
    
    APP.closeEditRigaModal();
};

APP.deleteEditRiga = function() {
    if (APP.editRigaTipo === 'cli') {
        APP.righeOrdineClienti.splice(APP.editRigaIndex, 1);
        APP.renderRigheOrdineClienti();
        APP.updateTotaliOrdineCliente();
        APP.updateBtnConfermaOrdCli();
    } else {
        APP.righeOrdiniFornitori.splice(APP.editRigaIndex, 1);
        APP.renderRigheOrdineFornitori();
        APP.updateTotaliOrdineFornitore();
        APP.updateBtnConfermaOrdFor();
    }
    
    APP.closeEditRigaModal();
};

// ==========================================
// GESTIONE CODA (MODAL)
// ==========================================

APP.openQueueModal = async function(context) {
    APP.queueContext = context;
    APP.queueTab = 'pending';
    
    const title = document.getElementById('queue-modal-title');
    const tapText = document.getElementById('queue-tap-text');
    const tabs = document.getElementById('queue-tabs');
    
    if (context === 'inventario') {
        title.textContent = '📋 Gestione Inventario';
        tapText.textContent = 'Tocca un\'inventariazione per modificare o eliminare';
        tabs.style.display = 'flex';
    } else {
        title.textContent = context === 'ordiniClienti' ? '🛒 Gestione Ordini Clienti' : '📦 Gestione Ordini Fornitori';
        tapText.textContent = 'Tocca un ordine per vedere i dettagli';
        tabs.style.display = 'flex';
    }
    
    await APP.loadQueueData();
    APP.renderQueueList();
    
    document.getElementById('queue-modal').classList.remove('hidden');
};

APP.closeQueueModal = function() {
    document.getElementById('queue-modal').classList.add('hidden');
    APP.queueContext = null;
};

APP.switchQueueTab = async function(tab) {
    APP.queueTab = tab;
    
    document.querySelectorAll('.queue-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.queue-tab:${tab === 'pending' ? 'first-child' : 'last-child'}`).classList.add('active');
    
    await APP.loadQueueData();
    APP.renderQueueList();
};

APP.loadQueueData = async function() {
    let storeName = '';
    let storicoName = '';
    
    switch (APP.queueContext) {
        case 'inventario':
            storeName = 'queueInventario';
            storicoName = 'storicoInventario';
            break;
        case 'ordiniClienti':
            storeName = 'queueOrdiniClienti';
            storicoName = 'storicoOrdiniClienti';
            break;
        case 'ordiniFornitori':
            storeName = 'queueOrdiniFornitori';
            storicoName = 'storicoOrdiniFornitori';
            break;
    }
    
    if (APP.queueTab === 'pending') {
        APP.queueData = await DB.getAll(storeName);
        // Filtra non sincronizzati
        APP.queueData = APP.queueData.filter(i => !i.synced);
    } else {
        APP.queueData = await DB.getStorico(storicoName, 50);
    }
    
    // Aggiorna contatori
    const pendingCount = (await DB.getAll(storeName)).filter(i => !i.synced).length;
    const storicoCount = await DB.count(storicoName);
    
    document.getElementById('queue-count-pending').textContent = pendingCount;
    document.getElementById('queue-count-history').textContent = storicoCount;
};

APP.renderQueueList = function() {
    const listEl = document.getElementById('queue-list');
    const actionsEl = document.getElementById('queue-actions');
    const hintEl = document.getElementById('queue-tap-hint');
    
    if (APP.queueData.length === 0) {
        listEl.innerHTML = '<div class="empty-message">Nessun elemento</div>';
        hintEl.style.display = 'none';
        actionsEl.style.display = APP.queueTab === 'pending' ? 'block' : 'none';
        return;
    }
    
    hintEl.style.display = 'flex';
    actionsEl.style.display = APP.queueTab === 'pending' ? 'block' : 'none';
    
    if (APP.queueContext === 'inventario') {
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
        listEl.innerHTML = APP.queueData.map((ord, index) => `
            <div class="ordine-item selectable" onclick="APP.selectQueueItem(${index})">
                <div class="ordine-header">
                    <span class="ordine-num">${ord.registro}/${ord.numero}</span>
                    <span class="ordine-data">${APP.formatDate(new Date(ord.data))}</span>
                    <span class="ordine-status ${ord.synced ? 'synced' : ''}">${ord.synced ? '✓ Sync' : '○'}</span>
                </div>
                <div class="ordine-body">
                    <span class="ordine-soggetto">
                        ${APP.queueContext === 'ordiniClienti' ? ord.cliente?.ragSoc1 : ord.fornitore?.ragSoc1}
                    </span>
                    <span class="ordine-righe">${ord.righe?.length || 0} art. - € ${(ord.righe || []).reduce((s, r) => s + r.qty * r.prezzo, 0).toFixed(2)}</span>
                </div>
            </div>
        `).join('');
    }
};

APP.selectQueueItem = function(index) {
    APP.selectedQueueIndex = index;
    const item = APP.queueData[index];
    
    if (APP.queueContext === 'inventario') {
        // Modal modifica inventario
        const content = document.getElementById('edit-queue-content');
        content.innerHTML = `
            <div class="info-row">
                <span class="info-label">Codice:</span>
                <span class="info-value">${item.codice}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Descrizione:</span>
                <span class="info-value">${item.des1 || ''}</span>
            </div>
            <div class="field-group">
                <label>Quantità</label>
                <div class="qty-input-group">
                    <button class="btn-qty" onclick="APP.decrementQueueQty()">−</button>
                    <input type="number" id="edit-queue-qty" value="${item.qty}" min="1">
                    <button class="btn-qty" onclick="APP.incrementQueueQty()">+</button>
                </div>
            </div>
            <div class="edit-riga-actions">
                <button class="btn-primary" onclick="APP.saveQueueItem()">💾 Salva</button>
                <button class="btn-danger" onclick="APP.deleteQueueItem()">🗑️ Elimina</button>
            </div>
        `;
        document.getElementById('edit-queue-modal').classList.remove('hidden');
    } else {
        // Per gli ordini, mostra solo dettagli
        alert(`Ordine ${item.registro}/${item.numero}\n${item.righe?.length || 0} righe`);
    }
};

APP.closeEditQueueModal = function() {
    document.getElementById('edit-queue-modal').classList.add('hidden');
};

APP.incrementQueueQty = function() {
    const input = document.getElementById('edit-queue-qty');
    input.value = parseInt(input.value || 0) + 1;
};

APP.decrementQueueQty = function() {
    const input = document.getElementById('edit-queue-qty');
    const val = parseInt(input.value || 0);
    if (val > 1) input.value = val - 1;
};

APP.saveQueueItem = async function() {
    const item = APP.queueData[APP.selectedQueueIndex];
    const newQty = parseInt(document.getElementById('edit-queue-qty').value) || 1;
    
    item.qty = newQty;
    
    const storeName = APP.queueContext === 'inventario' ? 'queueInventario' :
                      APP.queueContext === 'ordiniClienti' ? 'queueOrdiniClienti' : 'queueOrdiniFornitori';
    
    await DB.put(storeName, item);
    
    APP.closeEditQueueModal();
    await APP.loadQueueData();
    APP.renderQueueList();
    APP.showToast('Salvato', 'success');
};

APP.deleteQueueItem = async function() {
    if (!confirm('Eliminare questo elemento?')) return;
    
    const item = APP.queueData[APP.selectedQueueIndex];
    
    const storeName = APP.queueContext === 'inventario' ? 'queueInventario' :
                      APP.queueContext === 'ordiniClienti' ? 'queueOrdiniClienti' : 'queueOrdiniFornitori';
    
    await DB.delete(storeName, item.id);
    
    APP.closeEditQueueModal();
    await APP.loadQueueData();
    APP.renderQueueList();
    APP.updateHeaderQueueCount(APP.queueContext === 'inventario' ? 'inv' : 
                              APP.queueContext === 'ordiniClienti' ? 'ord-cli' : 'ord-for');
    APP.showToast('Eliminato', 'success');
};

APP.clearQueue = async function() {
    if (!confirm('Svuotare tutta la coda?')) return;
    
    const storeName = APP.queueContext === 'inventario' ? 'queueInventario' :
                      APP.queueContext === 'ordiniClienti' ? 'queueOrdiniClienti' : 'queueOrdiniFornitori';
    
    await DB.clear(storeName);
    
    await APP.loadQueueData();
    APP.renderQueueList();
    APP.updateHeaderQueueCount(APP.queueContext === 'inventario' ? 'inv' : 
                              APP.queueContext === 'ordiniClienti' ? 'ord-cli' : 'ord-for');
    APP.showToast('Coda svuotata', 'success');
};

// ==========================================
// SINCRONIZZAZIONE
// ==========================================

APP.syncQueue = async function() {
    const storeName = APP.queueContext === 'inventario' ? 'queueInventario' :
                      APP.queueContext === 'ordiniClienti' ? 'queueOrdiniClienti' : 'queueOrdiniFornitori';
    
    const items = await DB.getQueue(storeName);
    
    if (items.length === 0) {
        APP.showToast('Nessun elemento da sincronizzare', 'warning');
        return;
    }
    
    APP.showToast('Sincronizzazione...', 'info');
    
    try {
        // Crea contenuto file
        let content = '';
        let filename = '';
        
        if (APP.queueContext === 'inventario') {
            filename = `invenmag_${APP.formatDateFile(new Date())}.xlsx`;
            content = APP.createInventarioXlsx(items);
        } else {
            const tipo = APP.queueContext === 'ordiniClienti' ? 'cli' : 'for';
            filename = `ordini_${tipo}_${APP.formatDateFile(new Date())}.xlsx`;
            content = APP.createOrdiniXlsx(items);
        }
        
        // Upload su Drive
        await APP.uploadToDrive(filename, content);
        
        // Marca come sincronizzati
        for (const item of items) {
            await DB.markSynced(storeName, item.id);
        }
        
        // Sposta nello storico
        const storicoName = storeName.replace('queue', 'storico');
        await DB.moveToStorico(storeName, storicoName);
        
        APP.showToast(`${items.length} elementi sincronizzati`, 'success');
        
        await APP.loadQueueData();
        APP.renderQueueList();
        APP.updateHeaderQueueCount(APP.queueContext === 'inventario' ? 'inv' : 
                                  APP.queueContext === 'ordiniClienti' ? 'ord-cli' : 'ord-for');
        
    } catch (e) {
        console.error('Errore sync:', e);
        APP.showToast('Errore sincronizzazione', 'error');
    }
};

APP.createInventarioXlsx = function(items) {
    const ws_data = [['Codice', 'Descrizione', 'Locazione', 'Quantità', 'Deposito', 'Data']];
    
    for (const item of items) {
        ws_data.push([
            item.codice,
            item.des1 || '',
            item.locazione || '',
            item.qty,
            item.deposito || APP.config.deposito,
            APP.formatDate(new Date(item.timestamp))
        ]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
};

APP.createOrdiniXlsx = function(ordini) {
    const ws_data = [['Registro', 'Numero', 'Data', 'Codice Soggetto', 'Ragione Sociale', 
                      'Codice Art', 'Descrizione', 'Quantità', 'Prezzo', 'Importo']];
    
    for (const ord of ordini) {
        const soggetto = ord.cliente || ord.fornitore;
        
        for (const riga of ord.righe) {
            ws_data.push([
                ord.registro,
                ord.numero,
                APP.formatDate(new Date(ord.data)),
                soggetto.codice,
                soggetto.ragSoc1,
                riga.codice,
                riga.des1 || '',
                riga.qty,
                riga.prezzo,
                riga.qty * riga.prezzo
            ]);
        }
    }
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ordini');
    
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
};

APP.uploadToDrive = async function(filename, content) {
    const blob = new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const metadata = {
        name: filename,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + APP.accessToken },
        body: form
    });
    
    if (!response.ok) {
        throw new Error('Upload fallito');
    }
    
    return await response.json();
};

APP.generateReport = function() {
    APP.showToast('Generazione report...', 'info');
    
    // Semplice report PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text('PICAM - Report', 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Data: ${APP.formatDate(new Date())}`, 20, 30);
    doc.text(`Elementi: ${APP.queueData.length}`, 20, 40);
    
    let y = 55;
    
    if (APP.queueContext === 'inventario') {
        doc.text('Codice | Descrizione | Qtà | Locazione', 20, y);
        y += 10;
        
        for (const item of APP.queueData.slice(0, 30)) {
            doc.text(`${item.codice} | ${(item.des1 || '').substring(0, 20)} | ${item.qty} | ${item.locazione || '-'}`, 20, y);
            y += 7;
            if (y > 280) break;
        }
    }
    
    doc.save(`report_${APP.formatDateFile(new Date())}.pdf`);
    APP.showToast('Report generato', 'success');
};

// ==========================================
// HEADER QUEUE COUNT
// ==========================================

APP.updateHeaderQueueCount = async function(context) {
    let storeName = '';
    let badgeId = '';
    
    switch (context) {
        case 'inv':
            storeName = 'queueInventario';
            badgeId = 'header-queue-count-inv';
            break;
        case 'ord-cli':
            storeName = 'queueOrdiniClienti';
            badgeId = 'header-queue-count-ord-cli';
            break;
        case 'ord-for':
            storeName = 'queueOrdiniFornitori';
            badgeId = 'header-queue-count-ord-for';
            break;
    }
    
    try {
        const count = await DB.countQueue(storeName);
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.textContent = count > 0 ? count : '';
        }
    } catch (e) {}
};

// ==========================================
// STATISTICHE
// ==========================================

APP.openStatistiche = async function() {
    APP.showScreen('statistiche');
    
    try {
        const stats = await DB.getStats();
        
        document.getElementById('stats-articoli').textContent = stats.articoli;
        document.getElementById('stats-clienti').textContent = stats.clienti;
        document.getElementById('stats-fornitori').textContent = stats.fornitori;
        document.getElementById('stats-inventario').textContent = stats.queueInventario + stats.storicoInventario;
        document.getElementById('stats-ordini-cli').textContent = stats.queueOrdiniClienti + stats.storicoOrdiniClienti;
        document.getElementById('stats-ordini-for').textContent = stats.queueOrdiniFornitori + stats.storicoOrdiniFornitori;
        
    } catch (e) {
        console.error('Errore stats:', e);
    }
};

// ==========================================
// IMPOSTAZIONI
// ==========================================

APP.openSettings = function() {
    document.getElementById('settings-email').textContent = APP.userEmail || 'Non connesso';
    document.getElementById('settings-modal').classList.remove('hidden');
};

APP.closeSettings = function() {
    document.getElementById('settings-modal').classList.add('hidden');
};

APP.refreshData = async function() {
    APP.closeSettings();
    APP.showScreen('setup');
    
    // Reset UI
    document.getElementById('step-login').classList.add('completed');
    document.getElementById('step-config').classList.remove('disabled');
    document.getElementById('step-load').classList.remove('disabled');
    document.getElementById('login-status').textContent = `Connesso come ${APP.userEmail}`;
    document.getElementById('login-status').className = 'status-message success';
    
    document.getElementById('config-folder').value = APP.config.folder;
    document.getElementById('config-deposito').value = APP.config.deposito;
    
    document.getElementById('btn-load-data').disabled = false;
    document.getElementById('load-progress').classList.add('hidden');
    document.getElementById('load-status').textContent = '';
    
    APP.checkSkipButton();
};

APP.clearAllData = async function() {
    if (!confirm('Eliminare tutti i dati locali?')) return;
    
    await DB.clearAllData();
    localStorage.removeItem('picam_scan_history');
    localStorage.removeItem('picam_last_sync');
    
    APP.scanHistory = [];
    
    APP.closeSettings();
    APP.showScreen('setup');
    
    APP.showToast('Dati eliminati', 'success');
    APP.checkSkipButton();
};

// ==========================================
// UTILITIES
// ==========================================

APP.showStatus = function(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.className = `status-message ${type}`;
    }
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

APP.formatDate = function(date) {
    return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};

APP.formatDateFile = function(date) {
    return date.toISOString().split('T')[0].replace(/-/g, '');
};

// ==========================================
// INIT ON LOAD
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    APP.init();
});

console.log('APP module loaded v3.5');
