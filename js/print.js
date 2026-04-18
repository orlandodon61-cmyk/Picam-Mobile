// ==========================================
// PICAM v4.0 - print.js
// Stampa mobile: ESC/POS, CPCL, ZPL
// Wizard configurazione guidata + test stampa
// ==========================================

// Configurazione stampante salvata
APP.printerConfig = null;
APP.PRINTER_CONFIG_KEY = 'picam_printer_config';

APP.loadPrinterConfig = function() {
    try {
        const saved = localStorage.getItem(APP.PRINTER_CONFIG_KEY);
        APP.printerConfig = saved ? JSON.parse(saved) : null;
    } catch(e) { APP.printerConfig = null; }
};

APP.savePrinterConfig = function(config) {
    APP.printerConfig = config;
    localStorage.setItem(APP.PRINTER_CONFIG_KEY, JSON.stringify(config));
};

// ---------- APRE WIZARD STAMPANTE ----------

APP.openPrintWizard = function() {
    APP.loadPrinterConfig();
    const modal = document.getElementById('modal-print-wizard');
    if (!modal) { APP.showToast('Modal stampante non trovata', 'error'); return; }

    // Pre-popola con config salvata
    if (APP.printerConfig) {
        const set = (id, v) => { const el = document.getElementById(id); if(el) el.value = v; };
        set('printer-type',    APP.printerConfig.type    || 'escpos');
        set('printer-conn',    APP.printerConfig.conn    || 'network');
        set('printer-ip',      APP.printerConfig.ip      || '192.168.1.100');
        set('printer-port',    APP.printerConfig.port    || '9100');
        set('printer-bt-name', APP.printerConfig.btName  || 'Printer001');
        set('printer-width',   APP.printerConfig.width   || '48');
        set('printer-charset', APP.printerConfig.charset || 'CP437');
    }
    APP.updatePrintWizardUI();
    modal.classList.remove('hidden');
};

APP.closePrintWizard = function() {
    const modal = document.getElementById('modal-print-wizard');
    if (modal) modal.classList.add('hidden');
};

APP.updatePrintWizardUI = function() {
    const connType = document.getElementById('printer-conn')?.value || 'network';
    const btFields = document.getElementById('printer-bluetooth-fields');
    if (btFields) btFields.style.display = connType === 'bluetooth' ? 'block' : 'none';
    const networkFields = document.getElementById('printer-network-fields');
    if (networkFields) networkFields.style.display = connType === 'network' ? 'block' : 'none';
};

APP.savePrintSettings = function() {
    const v = id => (document.getElementById(id)?.value || '').trim();
    const config = {
        type:    v('printer-type')    || 'escpos',
        conn:    v('printer-conn')    || 'network',
        ip:      v('printer-ip')      || '',
        port:    parseInt(v('printer-port')) || 9100,
        btName:  v('printer-bt-name') || 'Printer001',
        width:   parseInt(v('printer-width'))  || 48,
        charset: v('printer-charset') || 'CP437'
    };
    APP.savePrinterConfig(config);
    APP.showToast('Configurazione stampante salvata', 'success');
    APP.closePrintWizard();
};

// ---------- TEST STAMPA ----------

APP.testPrint = async function() {
    const config = APP.printerConfig;
    if (!config) { APP.showToast('Configura prima la stampante', 'error'); return; }
    // Prova a caricare il logo se non ancora in cache
    if (!APP.logoBase64 && APP.accessToken) {
        APP.logoBase64 = await APP.loadLogo().catch(() => null);
    }
    const testData = await APP.buildTestPage(config);
    await APP.sendToPrinter(testData, config);
};

APP.buildTestPage = async function(config) {
    const type = config.type || 'escpos';
    const w = config.width || 48;
    const line = '─'.repeat(w);
    const center = (txt) => txt.padStart(Math.floor((w + txt.length)/2)).padEnd(w);

    switch(type) {
        case 'escpos': {
            const logoBmp = await APP.getLogoEscPos(config).catch(() => null);
            const testCmds = [{ type: 'init' }];
            if (logoBmp) {
                testCmds.push({ type: 'align', v: 'center' });
                testCmds.push({ type: 'raw', v: logoBmp });
                testCmds.push({ type: 'text', v: '' });
            }
            testCmds.push(
                { type: 'align', v: 'center' },
            { type: 'bold', v: true },
            { type: 'text', v: 'PICAM v4.0' },
            { type: 'bold', v: false },
            { type: 'text', v: 'Test Stampa' },
            { type: 'text', v: APP.formatDate(new Date()) },
            { type: 'text', v: '' },
            { type: 'align', v: 'left' },
            { type: 'text', v: line },
            { type: 'text', v: 'Configurazione stampante OK' },
            { type: 'text', v: `Tipo: ESC/POS | Larghezza: ${w}` },
            { type: 'text', v: line },
            { type: 'feed', lines: 3 },
            { type: 'cut' }
            );
            return APP.buildEscPos(testCmds);
        }
        case 'cpcl': return APP.buildCPCL([
            `! 0 200 200 210 1`,
            `ENCODING UTF-8`,
            `CENTER`,
            `T 4 0 0 0 PICAM v4.0`,
            `T 2 0 0 30 Test Stampa`,
            `T 2 0 0 60 ${APP.formatDate(new Date())}`,
            `LEFT`,
            `LINE 0 90 ${w*8} 90 1`,
            `T 2 0 0 100 Configurazione OK`,
            `FORM`,
            `PRINT`
        ]);
        case 'zpl': return APP.buildZPL([
            `^XA`,
            `^FO50,30^A0N,40,40^FD PICAM v4.0 ^FS`,
            `^FO50,80^A0N,25,25^FD Test Stampa ^FS`,
            `^FO50,110^A0N,20,20^FD ${APP.formatDate(new Date())} ^FS`,
            `^FO50,140^GB500,2,2^FS`,
            `^FO50,160^A0N,20,20^FD Configurazione OK ^FS`,
            `^XZ`
        ]);
        default: return new Uint8Array([]);
    }
};

// ---------- LOGO ESC/POS ----------

// Cache logo bitmap per evitare riconversioni
APP.logoBitmapCache = null;

// Converte un'immagine (url o dataURL) in bitmap ESC/POS 1-bit
// Ritorna Uint8Array con il comando GS v 0 pronto per la stampa
APP.imageToEscPosBitmap = async function(imgSrc, targetWidth = 200) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                // Calcola altezza proporzionale
                const ratio  = img.height / img.width;
                const w      = Math.min(targetWidth, img.width);
                const h      = Math.round(w * ratio);

                // Disegna su canvas
                const canvas = document.createElement('canvas');
                canvas.width  = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');

                // Sfondo bianco
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);

                const imageData = ctx.getImageData(0, 0, w, h);
                const pixels    = imageData.data;

                // Larghezza in bytes (arrotondata al byte superiore)
                const widthBytes = Math.ceil(w / 8);
                // ESC/POS vuole la larghezza in multipli di 8 (byte allineati)
                const printWidth = widthBytes * 8;

                // Converte ogni pixel in 1 bit (soglia 128: < 128 = nero = 1)
                const rasterBytes = [];
                for (let row = 0; row < h; row++) {
                    for (let byteIdx = 0; byteIdx < widthBytes; byteIdx++) {
                        let byte = 0;
                        for (let bit = 0; bit < 8; bit++) {
                            const col = byteIdx * 8 + bit;
                            if (col < w) {
                                const i = (row * w + col) * 4;
                                // Luminanza media dei 3 canali RGB
                                const lum = (pixels[i] * 0.299 + pixels[i+1] * 0.587 + pixels[i+2] * 0.114);
                                if (lum < 128) byte |= (0x80 >> bit); // pixel scuro = bit 1
                            }
                        }
                        rasterBytes.push(byte);
                    }
                }

                // Costruisce comando GS v 0
                // GS v 0 m xL xH yL yH d1...dk
                // m=0 (normal density), x=widthBytes, y=h
                const cmd = [];
                cmd.push(0x1D, 0x76, 0x30, 0x00);   // GS v 0 m=0
                cmd.push(widthBytes & 0xFF, (widthBytes >> 8) & 0xFF);  // xL xH
                cmd.push(h & 0xFF, (h >> 8) & 0xFF);                    // yL yH
                rasterBytes.forEach(b => cmd.push(b));

                resolve(new Uint8Array(cmd));
            } catch(e) {
                reject(e);
            }
        };
        img.onerror = () => reject(new Error('Immagine non caricabile'));
        img.src = imgSrc;
    });
};

// Carica e converte il logo (dalla cache o da Drive/pdf.js)
APP.getLogoEscPos = async function(config) {
    if (APP.logoBitmapCache) return APP.logoBitmapCache;

    // Usa il logo già caricato da pdf.js se disponibile
    const logoSrc = APP.logoBase64 || null;
    if (!logoSrc) return null;

    try {
        const targetWidth = config.width === 32 ? 160 : config.width === 48 ? 200 : 240;
        APP.logoBitmapCache = await APP.imageToEscPosBitmap(logoSrc, targetWidth);
        return APP.logoBitmapCache;
    } catch(e) {
        console.warn('Logo ESC/POS non disponibile:', e.message);
        return null;
    }
};

// ---------- GENERA COMANDI STAMPANTE ----------

// ESC/POS
APP.ESC = 0x1B; APP.GS = 0x1D; APP.LF = 0x0A;

// Encoding cp437 per stampanti termiche ESC/POS (Page0 / codepage 0)
// CRITICO: il simbolo € NON esiste in cp437/Page0 — sempre usare "Eur"
// Caratteri cp437 estesi (128-255) mappati dai corrispondenti Unicode
APP._cp437Map = (function() {
    // Caratteri speciali cp437 (posizioni 128-255) → codepoint Unicode
    const tbl = [
        0x00C7,0x00FC,0x00E9,0x00E2,0x00E4,0x00E0,0x00E5,0x00E7, // 128-135
        0x00EA,0x00EB,0x00E8,0x00EF,0x00EE,0x00EC,0x00C4,0x00C5, // 136-143
        0x00C9,0x00E6,0x00C6,0x00F4,0x00F6,0x00F2,0x00FB,0x00F9, // 144-151
        0x00FF,0x00D6,0x00DC,0x00A2,0x00A3,0x00A5,0x20A7,0x0192, // 152-159
        0x00E1,0x00ED,0x00F3,0x00FA,0x00F1,0x00D1,0x00AA,0x00BA, // 160-167
        0x00BF,0x2310,0x00AC,0x00BD,0x00BC,0x00A1,0x00AB,0x00BB, // 168-175
        0x2591,0x2592,0x2593,0x2502,0x2524,0x2561,0x2562,0x2556, // 176-183
        0x2555,0x2563,0x2551,0x2557,0x255D,0x255C,0x255B,0x2510, // 184-191
        0x2514,0x2534,0x252C,0x251C,0x2500,0x253C,0x255E,0x255F, // 192-199
        0x255A,0x2554,0x2569,0x2566,0x2560,0x2550,0x256C,0x2567, // 200-207
        0x2568,0x2564,0x2565,0x2559,0x2558,0x2552,0x2553,0x256B, // 208-215
        0x256A,0x2518,0x250C,0x2588,0x2584,0x258C,0x2590,0x2580, // 216-223
        0x03B1,0x00DF,0x0393,0x03C0,0x03A3,0x03C3,0x00B5,0x03C4, // 224-231
        0x03A6,0x0398,0x03A9,0x03B4,0x221E,0x03C6,0x03B5,0x2229, // 232-239
        0x2261,0x00B1,0x2265,0x2264,0x2320,0x2321,0x00F7,0x2248, // 240-247
        0x00B0,0x2219,0x00B7,0x221A,0x207F,0x00B2,0x25A0,0x00A0  // 248-255
    ];
    // Costruisce mappa inversa Unicode → byte cp437
    const map = new Map();
    for (let i = 0; i < tbl.length; i++) map.set(tbl[i], i + 128);
    return map;
})();

// Converte stringa in bytes cp437 — € rimpiazzato con "Eur"
APP.encCP437 = function(s) {
    // Sostituisce simboli problematici prima della conversione
    s = s.replace(/€/g, 'Eur').replace(/€/g, 'Eur');
    const bytes = [];
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code < 128) {
            bytes.push(code);                          // ASCII standard — diretto
        } else if (APP._cp437Map.has(code)) {
            bytes.push(APP._cp437Map.get(code));       // Carattere cp437 esteso
        } else {
            bytes.push(0x3F);                          // '?' per caratteri non mappabili
        }
    }
    return bytes;
};

APP.buildEscPos = function(commands) {
    const bytes = [];
    const push = (...bs) => bs.forEach(b => bytes.push(b));
    const str = s => APP.encCP437(String(s));          // cp437, non UTF-8

    commands.forEach(cmd => {
        switch(cmd.type) {
            case 'init':   push(APP.ESC, 0x40); break;
            case 'align':
                const a = cmd.v==='center' ? 1 : cmd.v==='right' ? 2 : 0;
                push(APP.ESC, 0x61, a); break;
            case 'bold':   push(APP.ESC, 0x45, cmd.v ? 1 : 0); break;
            case 'size':   push(APP.GS,  0x21, cmd.v || 0); break;
            case 'text':   push(...str(cmd.v || ''), APP.LF); break;
            case 'feed':   for(let i=0; i<(cmd.lines||1); i++) push(APP.LF); break;
            case 'cut':    push(APP.GS,  0x56, 0x41, 0x00); break;
            case 'raw':    // bytes grezzi (es. bitmap logo GS v 0)
                if (cmd.v instanceof Uint8Array) cmd.v.forEach(b => bytes.push(b));
                break;
            case 'barcode':
                push(APP.GS, 0x6B, 0x04); // Code39
                push(...str(cmd.v || ''), 0x00); break;
        }
    });
    return new Uint8Array(bytes);
};

APP.buildCPCL = function(lines) {
    return new TextEncoder().encode(lines.join('\n') + '\n');
};

APP.buildZPL = function(lines) {
    return new TextEncoder().encode(lines.join('\n') + '\n');
};

// ---------- INVIA DATI ALLA STAMPANTE ----------

APP.sendToPrinter = async function(data, config) {
    if (!config) { APP.showToast('Nessuna stampante configurata', 'error'); return; }

    try {
        if (config.conn === 'network') {
            await APP.sendViaNetwork(data, config);
        } else if (config.conn === 'bluetooth') {
            await APP.sendViaBluetooth(data, config);
        } else if (config.conn === 'usb') {
            await APP.sendViaUSB(data, config);
        } else {
            APP.showToast('Metodo connessione non supportato', 'error');
        }
    } catch(e) {
        APP.showToast('Errore stampa: ' + e.message, 'error');
        console.error('Errore stampa:', e);
    }
};

// Stampa via rete TCP (tramite proxy locale o WebSocket bridge)
APP.sendViaNetwork = async function(data, config) {
    // Prova prima con fetch a un bridge locale (se disponibile)
    const bridgeUrl = `http://${config.ip}:${config.port || 8080}/print`;
    try {
        const response = await fetch(bridgeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: data,
            signal: AbortSignal.timeout(5000)
        });
        if (response.ok) {
            APP.showToast('Stampato con successo', 'success');
            return;
        }
    } catch(e) {
        // Bridge non disponibile, prova download diretto
    }

    // Fallback: download file per stampa manuale o tramite app esterna
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = config.type === 'zpl' ? '.zpl' : config.type === 'cpcl' ? '.cpcl' : '.bin';
    a.download = `picam_print_${Date.now()}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    APP.showToast('File scaricato (da inviare alla stampante)', 'info');
};

// Stampa via Bluetooth (Web Bluetooth API)
// Stampante Mach Power BP-DTPP-022 (e compatibili ESC/POS):
//   - Nome Bluetooth: "Printer001"  PIN: 0000
//   - UUID servizio SPP: 00001101-0000-1000-8000-00805f9b34fb
//   - UUID alternativo (alcuni modelli): 000018f0-0000-1000-8000-00805f9b34fb
//   - Characteristic SPP: 00002af1-0000-1000-8000-00805f9b34fb
APP.sendViaBluetooth = async function(data, config) {
    if (!navigator.bluetooth) {
        throw new Error(
            'Web Bluetooth non supportato.\n' +
            'Su Android: usa Chrome (non Firefox/Safari).\n' +
            'Verifica che il Bluetooth sia attivo.'
        );
    }

    // UUID SPP standard (Serial Port Profile) — usato dalla maggior parte
    // delle stampanti termiche Bluetooth inclusa BP-DTPP-022
    const SPP_SERVICE        = '00001101-0000-1000-8000-00805f9b34fb';
    const ALT_SERVICE        = '000018f0-0000-1000-8000-00805f9b34fb';
    const SPP_CHARACTERISTIC = '00002af1-0000-1000-8000-00805f9b34fb';

    // Chunk size per Android BLE: 200 bytes con delay 80ms
    // Chunk più piccoli + delay maggiore = più affidabile su Android
    const CHUNK_SIZE  = 200;
    const CHUNK_DELAY = 80;

    APP.showToast('Ricerca stampante Bluetooth...', 'info');

    let device, server, characteristic;

    try {
        // Prova prima con filtro nome "Printer" (più preciso)
        // Se fallisce, prova con acceptAllDevices (mostra tutte le periferiche)
        try {
            const btName = (config && config.btName) ? config.btName.trim() : '';
            const filters = btName
                ? [{ name: btName }, { namePrefix: btName }]
                : [{ namePrefix: 'Printer' }, { namePrefix: 'POS' },
                   { services: [SPP_SERVICE] }, { services: [ALT_SERVICE] }];
            device = await navigator.bluetooth.requestDevice({
                filters,
                optionalServices: [SPP_SERVICE, ALT_SERVICE]
            });
        } catch(filterErr) {
            // Fallback: mostra tutti i dispositivi Bluetooth abbinati
            APP.showToast('Scegli la stampante dalla lista...', 'info');
            device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [SPP_SERVICE, ALT_SERVICE]
            });
        }

        APP.showToast(`Connessione a ${device.name || 'stampante'}...`, 'info');
        server = await device.gatt.connect();

        // Tenta con SPP UUID, poi con UUID alternativo
        let service;
        try {
            service = await server.getPrimaryService(SPP_SERVICE);
        } catch(e) {
            try {
                service = await server.getPrimaryService(ALT_SERVICE);
            } catch(e2) {
                // Ultima risorsa: prende il primo servizio disponibile
                const services = await server.getPrimaryServices();
                if (!services.length) throw new Error('Nessun servizio Bluetooth trovato');
                service = services[0];
            }
        }

        // Ottieni la characteristic scrivibile
        try {
            characteristic = await service.getCharacteristic(SPP_CHARACTERISTIC);
        } catch(e) {
            // Cerca la prima characteristic con proprietà WRITE
            const chars = await service.getCharacteristics();
            characteristic = chars.find(c =>
                c.properties.write || c.properties.writeWithoutResponse
            );
            if (!characteristic) throw new Error('Nessuna characteristic scrivibile');
        }

        // Invia i dati in chunk piccoli (più affidabile su Android BLE)
        const useWriteWithoutResponse = !characteristic.properties.write &&
                                         characteristic.properties.writeWithoutResponse;
        let sent = 0;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            if (useWriteWithoutResponse) {
                await characteristic.writeValueWithoutResponse(chunk);
            } else {
                await characteristic.writeValue(chunk);
            }
            sent += chunk.length;
            await new Promise(r => setTimeout(r, CHUNK_DELAY));
        }

        // Piccola pausa finale prima di disconnettere
        await new Promise(r => setTimeout(r, 300));
        server.disconnect();
        APP.showToast(`Stampato (${sent} bytes)`, 'success');

    } catch(e) {
        if (server) try { server.disconnect(); } catch(_) {}
        if (e.name === 'NotFoundError' || e.name === 'NotSupportedError') {
            throw new Error(
                'Stampante non trovata.\n' +
                'Verifica:\n' +
                '• Stampante accesa e Bluetooth attivo\n' +
                '• Dispositivo abbinato (PIN: 0000)\n' +
                '• Nome stampante: Printer001'
            );
        }
        throw e;
    }
};

// Stampa via USB (WebUSB API)
APP.sendViaUSB = async function(data, config) {
    if (!navigator.usb) {
        throw new Error('WebUSB non supportato su questo browser');
    }
    try {
        APP.showToast('Connessione USB...', 'info');
        const device = await navigator.usb.requestDevice({ filters: [] });
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        await device.claimInterface(0);

        // Trova endpoint OUT
        let endpointOut = null;
        for (const iface of device.configuration.interfaces) {
            for (const alt of iface.alternates) {
                for (const ep of alt.endpoints) {
                    if (ep.direction === 'out') { endpointOut = ep.endpointNumber; break; }
                }
            }
        }
        if (endpointOut === null) throw new Error('Endpoint USB non trovato');

        await device.transferOut(endpointOut, data);
        await device.releaseInterface(0);
        await device.close();
        APP.showToast('Stampato via USB', 'success');
    } catch(e) {
        if (e.name === 'NotFoundError') throw new Error('Nessuna stampante USB selezionata');
        throw e;
    }
};

// ---------- STAMPA ORDINE CORRENTE ----------

APP.printMobileOrdine = async function() {
    APP.loadPrinterConfig();
    if (!APP.printerConfig) {
        if (confirm('Nessuna stampante configurata. Vuoi configurarla ora?')) {
            APP.openPrintWizard();
        }
        return;
    }
    const ordine = APP.selectedQueueItem;
    if (!ordine) { APP.showToast('Nessun ordine selezionato', 'error'); return; }

    // Prova a caricare il logo (usa cache se disponibile)
    if (!APP.logoBase64 && APP.accessToken) {
        APP.logoBase64 = await APP.loadLogo().catch(() => null);
    }

    const data = await APP.buildOrdineMobile(ordine, APP.printerConfig);
    await APP.sendToPrinter(data, APP.printerConfig);
};

APP.buildOrdineMobile = async function(ordine, config) {
    const type = config.type || 'escpos';
    const w    = config.width || 48;
    const isCliente = ordine.tipo === 'cliente';
    const soggetto  = isCliente ? ordine.cliente : ordine.fornitore;
    const dataOrd   = APP.formatDate(new Date(ordine.data));
    const sep = '─'.repeat(w);
    const center = s => s.length >= w ? s : ' '.repeat(Math.floor((w-s.length)/2)) + s;
    const rpad = (a, b, total) => {
        const s = a + b;
        return a + ' '.repeat(Math.max(1, total - s.length)) + b;
    };

    if (type === 'escpos') {
        // Tenta di ottenere bitmap logo (1-bit, bianco/nero)
        const logoBmp = await APP.getLogoEscPos(config).catch(() => null);

        const cmds = [{ type: 'init' }];

        // Logo centrato se disponibile
        if (logoBmp) {
            cmds.push({ type: 'align', v: 'center' });
            cmds.push({ type: 'raw', v: logoBmp });   // già formattato come GS v 0
            cmds.push({ type: 'text', v: '' });        // riga vuota dopo logo
        }

        cmds.push(
            { type: 'align', v: 'center' },
            { type: 'bold', v: true },
            { type: 'text', v: isCliente ? 'ORDINE CLIENTE' : 'ORDINE FORNITORE' },
            { type: 'bold', v: false },
            { type: 'text', v: `${ordine.registro}/${ordine.numero} - ${dataOrd}` },
            { type: 'align', v: 'left' },
            { type: 'text', v: sep },
            { type: 'bold', v: true },
            { type: 'text', v: (isCliente ? 'CLI: ' : 'FOR: ') + soggetto.ragSoc1.substring(0, w-5) },
            { type: 'bold', v: false },
            { type: 'text', v: sep }
        );
        ordine.righe.forEach(riga => {
            cmds.push({ type: 'bold', v: true });
            cmds.push({ type: 'text', v: riga.codice.substring(0, 20) });
            cmds.push({ type: 'bold', v: false });
            cmds.push({ type: 'text', v: riga.des1.substring(0, w) });
            cmds.push({ type: 'text', v: rpad(`  Qta: ${riga.qty} ${riga.um}`, `Eur ${(riga.qty*riga.prezzo).toFixed(2)}`, w) });
        });
        cmds.push({ type: 'text', v: sep });
        const tot = ordine.totOrdine || ordine.righe.reduce((s,r)=>s+r.qty*r.prezzo, 0);
        cmds.push({ type: 'bold', v: true });
        cmds.push({ type: 'align', v: 'right' });
        cmds.push({ type: 'text', v: `TOTALE: EUR ${tot.toFixed(2)}` });
        cmds.push({ type: 'align', v: 'left' });
        cmds.push({ type: 'bold', v: false });
        cmds.push({ type: 'feed', lines: 3 });
        cmds.push({ type: 'cut' });
        return APP.buildEscPos(cmds);
    }

    if (type === 'zpl') {
        const lines = [`^XA`];
        let y = 30;
        lines.push(`^FO50,${y}^A0N,35,35^FD${isCliente ? 'ORDINE CLIENTE' : 'ORDINE FORNITORE'}^FS`); y+=45;
        lines.push(`^FO50,${y}^A0N,25,25^FD${ordine.registro}/${ordine.numero} - ${dataOrd}^FS`); y+=35;
        lines.push(`^FO50,${y}^GB550,2,2^FS`); y+=10;
        lines.push(`^FO50,${y}^A0N,22,22^FD${soggetto.ragSoc1.substring(0,40)}^FS`); y+=30;
        lines.push(`^FO50,${y}^GB550,2,2^FS`); y+=10;
        ordine.righe.forEach(riga => {
            lines.push(`^FO50,${y}^A0N,20,20^FB500,2,,^FD${riga.des1.substring(0,40)}^FS`); y+=25;
            lines.push(`^FO50,${y}^A0N,18,18^FDQta:${riga.qty}${riga.um} EUR${(riga.qty*riga.prezzo).toFixed(2)}^FS`); y+=25;
        });
        const tot = ordine.totOrdine || ordine.righe.reduce((s,r)=>s+r.qty*r.prezzo,0);
        lines.push(`^FO50,${y}^GB550,2,2^FS`); y+=10;
        lines.push(`^FO50,${y}^A0N,28,28^FDTOTALE: EUR ${tot.toFixed(2)}^FS`);
        lines.push(`^XZ`);
        return APP.buildZPL(lines);
    }

    // CPCL
    const h = 50 + ordine.righe.length * 50 + 100;
    const lines = [`! 0 200 200 ${h} 1`, `ENCODING UTF-8`];
    lines.push(`CENTER`);
    lines.push(`T 4 0 0 0 ${isCliente ? 'ORDINE CLIENTE' : 'ORDINE FORNITORE'}`);
    lines.push(`T 3 0 0 35 ${ordine.registro}/${ordine.numero} - ${dataOrd}`);
    lines.push(`LEFT`);
    lines.push(`LINE 0 60 550 60 2`);
    lines.push(`T 3 0 0 70 ${soggetto.ragSoc1.substring(0,40)}`);
    lines.push(`LINE 0 95 550 95 1`);
    let cy = 105;
    ordine.righe.forEach(riga => {
        lines.push(`T 3 0 0 ${cy} ${riga.des1.substring(0,35)}`); cy+=25;
        lines.push(`T 2 0 0 ${cy} Qta:${riga.qty}${riga.um}  EUR${(riga.qty*riga.prezzo).toFixed(2)}`); cy+=25;
    });
    const tot = ordine.totOrdine || ordine.righe.reduce((s,r)=>s+r.qty*r.prezzo,0);
    lines.push(`LINE 0 ${cy} 550 ${cy} 2`); cy+=10;
    lines.push(`CENTER`);
    lines.push(`T 4 0 0 ${cy} TOTALE: EUR ${tot.toFixed(2)}`);
    lines.push(`FORM`, `PRINT`);
    return APP.buildCPCL(lines);
};
