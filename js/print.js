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
        set('printer-width',   APP.printerConfig.width   || '48');
        set('printer-charset', APP.printerConfig.charset || 'PC858_EURO');
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
        width:   parseInt(v('printer-width'))  || 48,
        charset: v('printer-charset') || 'PC858_EURO'
    };
    APP.savePrinterConfig(config);
    APP.showToast('Configurazione stampante salvata', 'success');
    APP.closePrintWizard();
};

// ---------- TEST STAMPA ----------

APP.testPrint = async function() {
    const config = APP.printerConfig;
    if (!config) { APP.showToast('Configura prima la stampante', 'error'); return; }
    const testData = APP.buildTestPage(config);
    await APP.sendToPrinter(testData, config);
};

APP.buildTestPage = function(config) {
    const type = config.type || 'escpos';
    const w = config.width || 48;
    const line = '─'.repeat(w);
    const center = (txt) => txt.padStart(Math.floor((w + txt.length)/2)).padEnd(w);

    switch(type) {
        case 'escpos': return APP.buildEscPos([
            { type: 'init' },
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
        ]);
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

// ---------- GENERA COMANDI STAMPANTE ----------

// ESC/POS
APP.ESC = 0x1B; APP.GS = 0x1D; APP.LF = 0x0A;

APP.buildEscPos = function(commands) {
    const bytes = [];
    const push = (...bs) => bs.forEach(b => bytes.push(b));
    const str = s => [...new TextEncoder().encode(s)];

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
APP.sendViaBluetooth = async function(data, config) {
    if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth non supportato su questo browser');
    }
    try {
        APP.showToast('Connessione Bluetooth...', 'info');
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

        // Invia in chunk da 512 bytes
        const CHUNK_SIZE = 512;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            await characteristic.writeValue(chunk);
            await new Promise(r => setTimeout(r, 50));
        }
        device.gatt.disconnect();
        APP.showToast('Stampato via Bluetooth', 'success');
    } catch(e) {
        if (e.name === 'NotFoundError') {
            throw new Error('Nessuna stampante Bluetooth trovata');
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

    const data = APP.buildOrdineMobile(ordine, APP.printerConfig);
    await APP.sendToPrinter(data, APP.printerConfig);
};

APP.buildOrdineMobile = function(ordine, config) {
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
        const cmds = [
            { type: 'init' },
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
            { type: 'text', v: sep },
        ];
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
