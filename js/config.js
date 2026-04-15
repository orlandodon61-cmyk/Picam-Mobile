// ==========================================
// PICAM v4.0 - config.js
// Gestione configurazione con registri ordini
// ==========================================

APP.CONFIG_KEY = 'picam_config_v4';

APP.defaultConfig = {
    // Drive e deposito
    folder: 'archivi/Ordini',
    deposito: '01',
    registroClienti: '01',
    registroFornitori: '01',
    // Dati mittente (intestazione PDF)
    mitRagSoc: '',
    mitInd:    '',
    mitCap:    '',
    mitLoc:    '',
    mitPro:    '',
    mitPiva:   '',
    mitTel:    '',
    // Destinazione salvataggio PDF
    // 'download' = cartella Downloads (default Android)
    // 'share'    = Web Share API (utente sceglie la cartella su Android)
    // 'drive'    = carica su Google Drive
    saveMethod: 'download'
};

APP.loadConfig = function() {
    try {
        const saved = localStorage.getItem(APP.CONFIG_KEY);
        if (saved) {
            APP.config = Object.assign({}, APP.defaultConfig, JSON.parse(saved));
        } else {
            // Migrazione da v3.x
            const old = localStorage.getItem('picam_config');
            APP.config = Object.assign({}, APP.defaultConfig, old ? JSON.parse(old) : {});
        }
    } catch(e) {
        APP.config = Object.assign({}, APP.defaultConfig);
    }
};

APP.persistConfig = function() {
    localStorage.setItem(APP.CONFIG_KEY, JSON.stringify(APP.config));
};

APP.applyConfigToSetup = function() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('config-folder',        APP.config.folder);
    set('config-deposito',      APP.config.deposito);
    set('config-registro-cli',  APP.config.registroClienti);
    set('config-registro-for',  APP.config.registroFornitori);
};

APP.saveConfigFromSetup = function() {
    const v = id => (document.getElementById(id)?.value || '').trim();
    APP.config.folder            = v('config-folder')       || 'archivi/Ordini';
    APP.config.deposito          = v('config-deposito')     || '01';
    APP.config.registroClienti   = v('config-registro-cli') || '01';
    APP.config.registroFornitori = v('config-registro-for') || '01';
    APP.persistConfig();
};

APP.applyRegistroToUI = function() {
    const setIfFresh = (id, val) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.userModified) el.value = val;
    };
    setIfFresh('ord-cli-registro', APP.config.registroClienti);
    setIfFresh('ord-for-registro', APP.config.registroFornitori);
};

APP.openSettings = function() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    // Drive e deposito
    set('settings-folder',        APP.config.folder);
    set('settings-deposito',      APP.config.deposito);
    set('settings-registro-cli',  APP.config.registroClienti);
    set('settings-registro-for',  APP.config.registroFornitori);
    // Dati mittente
    set('settings-mit-ragsoc', APP.config.mitRagSoc);
    set('settings-mit-ind',    APP.config.mitInd);
    set('settings-mit-cap',    APP.config.mitCap);
    set('settings-mit-loc',    APP.config.mitLoc);
    set('settings-mit-pro',    APP.config.mitPro);
    set('settings-mit-piva',   APP.config.mitPiva);
    set('settings-mit-tel',    APP.config.mitTel);
    // Destinazione PDF
    set('settings-save-method', APP.config.saveMethod);
    // Account
    set('settings-email', APP.userEmail || '');
    document.getElementById('modal-settings').classList.remove('hidden');
};

APP.closeSettings = function() {
    document.getElementById('modal-settings').classList.add('hidden');
};

APP.saveSettings = function() {
    const v = id => (document.getElementById(id)?.value || '').trim();
    // Drive e deposito
    APP.config.folder            = v('settings-folder')        || 'archivi/Ordini';
    APP.config.deposito          = v('settings-deposito')      || '01';
    APP.config.registroClienti   = v('settings-registro-cli')  || '01';
    APP.config.registroFornitori = v('settings-registro-for')  || '01';
    // Dati mittente
    APP.config.mitRagSoc = v('settings-mit-ragsoc');
    APP.config.mitInd    = v('settings-mit-ind');
    APP.config.mitCap    = v('settings-mit-cap');
    APP.config.mitLoc    = v('settings-mit-loc');
    APP.config.mitPro    = v('settings-mit-pro');
    APP.config.mitPiva   = v('settings-mit-piva');
    APP.config.mitTel    = v('settings-mit-tel');
    // Destinazione PDF
    APP.config.saveMethod = v('settings-save-method') || 'download';
    // Azzera cache logo se cambia cartella Drive
    APP.logoBase64 = null;
    APP.logoBitmapCache = null;
    APP.persistConfig();
    APP.applyRegistroToUI();
    APP.closeSettings();
    APP.showToast('Impostazioni salvate', 'success');
};

APP.refreshData = async function() {
    APP.closeSettings();
    APP.showScreen('setup');
    document.getElementById('step-login').classList.add('completed');
    document.getElementById('step-config').classList.remove('disabled');
    document.getElementById('step-load').classList.remove('disabled');
    document.getElementById('login-status').textContent = `Connesso come ${APP.userEmail}`;
    document.getElementById('login-status').className = 'status-message success';
    APP.applyConfigToSetup();
    document.getElementById('btn-load-data').disabled = false;
    document.getElementById('load-progress').classList.add('hidden');
    document.getElementById('load-status').textContent = '';
    APP.checkSkipButton();
};
