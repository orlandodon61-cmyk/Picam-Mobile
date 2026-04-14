// ==========================================
// PICAM v4.0 - sync.js
// Sincronizzazione Google Drive
// Export file con campi completi per Picam ERP
// ==========================================

APP.syncQueue = async function(context) {
    APP.showToast('Sincronizzazione in corso...', 'info');
    try {
        switch(context) {
            case 'inventario':     await APP.syncInventario();      break;
            case 'ordiniClienti':  await APP.syncOrdiniClienti();   break;
            case 'ordiniFornitori':await APP.syncOrdiniFornitori(); break;
        }
        APP.showToast('Sincronizzazione completata!', 'success');
        APP.closeQueueModal();
    } catch(error) {
        console.error('Errore sync:', error);
        APP.showToast('Errore: ' + error.message, 'error');
    }
};

// ---------- SYNC INVENTARIO ----------

APP.syncInventario = async function() {
    const queue = await DB.getQueue('queueInventario');
    if (queue.length === 0) throw new Error('Nessun elemento da sincronizzare');
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
    const folderId = await APP.findFolder(APP.config.folder);
    if (!folderId) throw new Error('Cartella non trovata');
    await APP.uploadFile(folderId, 'INVENMAG.xlsx', xlsxData,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await DB.clearQueue('queueInventario');
    APP.updateHeaderQueueCount('inv');
    APP.updateBadges();
};

// ---------- SYNC ORDINI CLIENTI ----------
// Genera 3 file per Picam ERP:
// ordini-anagrafiche: dati cliente
// ordini-testate: testata ordine (con totali oct_*)
// ordini-dettagli: righe ordine

APP.syncOrdiniClienti = async function() {
    const queue = await DB.getQueue('queueOrdiniClienti');
    if (queue.length === 0) throw new Error('Nessun ordine da sincronizzare');
    const folderId = await APP.findFolder(APP.config.folder);
    if (!folderId) throw new Error('Cartella non trovata');

    let anagrafiche = '';
    let testate = '';
    let dettagli = '';
    const clientiProcessati = new Set();

    for (const ordine of queue) {
        const cli = ordine.cliente;
        const dataOrd = APP.formatDatePicam(new Date(ordine.data));

        // ------ ANAGRAFICA CLIENTE (20 campi clc_*) ------
        if (!clientiProcessati.has(cli.codice)) {
            clientiProcessati.add(cli.codice);
            anagrafiche += [
                cli.codice,
                `"${cli.ragSoc1||''}"`,
                `"${cli.ragSoc2||''}"`,
                `"${cli.indirizzo||''}"`,
                `"${cli.cap||''}"`,
                `"${cli.localita||''}"`,
                `"${cli.provincia||''}"`,
                `"${cli.email||''}"`,
                `"${cli.telefono||''}"`,
                `"${cli.partitaIva||''}"`,
                `"${cli.codFisc||''}"`,
                `"${cli.codPag||''}"`,
                `"${cli.codIva||''}"`,
                '""', '""', '""', '""', '""', '""', '""'
            ].join('|') + '\n';
        }

        // ------ TESTATA ORDINE CLIENTE (29 campi oct_*) ------
        // Calcola totali se non già presenti
        let totNetto = ordine.totNetto || 0;
        let totIva   = ordine.totIva   || 0;
        let totOrdine = ordine.totOrdine || 0;
        if (!totNetto) {
            for (const riga of ordine.righe) {
                const imp = riga.qty * riga.prezzo;
                const al  = await APP.getAliquotaIva(riga.codIvaVendita||'22');
                totNetto  += imp;
                totIva    += imp * al / 100;
            }
            totOrdine = totNetto + totIva;
        }
        const codPag = ordine.pagamento?.codice || cli.codPag || '';
        testate += [
            '"S"',                                      // oct_tp_mov
            `"${cli.codice}"`,                          // oct_cod_cli
            `"${ordine.registro}"`,                     // oct_reg_ord
            ordine.numero,                               // oct_num_ord
            `"${dataOrd}"`,                             // oct_dat_ord
            `"${dataOrd}"`,                             // oct_dat_cons
            '""',                                       // oct_rif_cli
            `"${codPag}"`,                              // oct_cod_pag
            '""',                                       // oct_des_pag
            '""',                                       // oct_mod_sped
            '0',                                        // oct_por_spa
            '""',                                       // oct_vet_cod
            '""',                                       // oct_note
            APP.formatDecimal(totNetto),                // oct_tot_net_mer
            APP.formatDecimal(totIva),                  // oct_iva
            APP.formatDecimal(totOrdine),               // oct_tot_ord
            APP.formatDecimal(0),                       // oct_spe_doc
            APP.formatDecimal(0),                       // oct_tot_fatt
            `"${APP.config.deposito}"`,                 // oct_dep
            '""',                                       // oct_cod_age
            APP.formatDecimal(0),                       // oct_prov
            '""',                                       // oct_cod_lis
            '""',                                       // oct_zona
            '""',                                       // oct_cat_cli
            '""',                                       // oct_rif_int
            '""',                                       // oct_flag_bol
            '""',                                       // oct_cod_val
            APP.formatDecimal(1),                       // oct_cam_val
            '""'                                        // oct_filler
        ].join('|') + '\n';

        // ------ DETTAGLI ORDINE CLIENTE (36 campi ocd_*) ------
        let numRiga = 1;
        for (const riga of ordine.righe) {
            const codIva = riga.codIvaVendita || '22';
            const aliquota = await APP.getAliquotaIva(codIva);
            const impNetto = riga.qty * riga.prezzo;
            const impIva   = impNetto * aliquota / 100;
            dettagli += [
                `"${cli.codice}"`,                      // ocd_cod_cli
                `"${ordine.registro}"`,                 // ocd_reg_ord
                ordine.numero,                          // ocd_num_ord
                numRiga,                                // ocd_rig_ord
                `"${dataOrd}"`,                         // ocd_dat_ord
                `"${riga.codice}"`,                     // ocd_cod_art
                `"${riga.des1||''}"`,                   // ocd_des_1
                `"${riga.des2||''}"`,                   // ocd_des_2
                `"${riga.um||''}"`,                     // ocd_uni_mis
                APP.formatDecimal(riga.qty),            // ocd_qta_ord
                APP.formatDecimal(0),                   // ocd_qta_eva
                APP.formatDecimal(riga.prezzo),         // ocd_prez_unit
                APP.formatDecimal(0),                   // ocd_sc_1
                APP.formatDecimal(0),                   // ocd_sc_2
                APP.formatDecimal(0),                   // ocd_sc_3
                APP.formatDecimal(impNetto),            // ocd_tot_netto
                `"${codIva}"`,                          // ocd_cod_iva
                APP.formatDecimal(aliquota),            // ocd_ali_iva
                APP.formatDecimal(impIva),              // ocd_imp_iva
                APP.formatDecimal(impNetto + impIva),   // ocd_tot_riga
                `"${APP.config.deposito}"`,             // ocd_dep
                `"${dataOrd}"`,                         // ocd_dat_cons
                '""', '""', '""', '""', '""',           // ocd_rif_*
                APP.formatDecimal(0),                   // ocd_prov_age
                '""',                                   // ocd_cod_lis
                APP.formatDecimal(0),                   // ocd_sc_extra
                '""', '""', '""', '""', '""', '""'      // filler
            ].join('|') + '\n';
            numRiga++;
        }
    }

    const enc = s => new TextEncoder().encode(s);
    await APP.uploadFile(folderId, 'ordini-anagrafiche', enc(anagrafiche), 'text/plain');
    await APP.uploadFile(folderId, 'ordini-testate',     enc(testate),     'text/plain');
    await APP.uploadFile(folderId, 'ordini-dettagli',    enc(dettagli),    'text/plain');

    await DB.clearQueue('queueOrdiniClienti');
    APP.updateHeaderQueueCount('ordCli');
    APP.updateBadges();
    await APP.syncStoricoToDrive('ordiniClienti');
};

// ---------- SYNC ORDINI FORNITORI ----------

APP.syncOrdiniFornitori = async function() {
    const queue = await DB.getQueue('queueOrdiniFornitori');
    if (queue.length === 0) throw new Error('Nessun ordine da sincronizzare');
    const folderId = await APP.findFolder(APP.config.folder);
    if (!folderId) throw new Error('Cartella non trovata');

    let anagrafiche = '';
    let testate = '';
    let dettagli = '';
    const fornitoriProcessati = new Set();

    for (const ordine of queue) {
        const forn = ordine.fornitore;
        const dataOrd = APP.formatDatePicam(new Date(ordine.data));
        const codPag  = ordine.pagamento?.codice || forn.codPag || '';
        const desPag  = ordine.pagamento?.descrizione || '';

        // ------ ANAGRAFICA FORNITORE (20 campi) ------
        if (!fornitoriProcessati.has(forn.codice)) {
            fornitoriProcessati.add(forn.codice);
            anagrafiche += [
                forn.codice,
                `"${forn.ragSoc1||''}"`,
                `"${forn.ragSoc2||''}"`,
                `"${forn.indirizzo||''}"`,
                `"${forn.cap||''}"`,
                `"${forn.localita||''}"`,
                `"${forn.provincia||''}"`,
                `"${forn.email||''}"`,
                `"${forn.telefono||''}"`,
                `"${forn.partitaIva||''}"`,
                `"${forn.codFisc||''}"`,
                `"${forn.codPag||''}"`,
                '""', '""', '""', '""', '""', '""', '""', '""'
            ].join('|') + '\n';
        }

        // ------ TESTATA ORDINE FORNITORE (29 campi oct_*) ------
        let totNetto  = ordine.totNetto || 0;
        let totIva    = ordine.totIva   || 0;
        let totOrdine = ordine.totOrdine || 0;
        if (!totNetto) {
            for (const riga of ordine.righe) {
                const imp = riga.qty * riga.prezzo;
                const al  = await APP.getAliquotaIva(riga.codIvaAcquisto||'22');
                totNetto  += imp;
                totIva    += imp * al / 100;
            }
            totOrdine = totNetto + totIva;
        }
        testate += [
            '"S"',
            `"${forn.codice}"`,
            `"${ordine.registro}"`,
            ordine.numero,
            `"${dataOrd}"`,
            `"${dataOrd}"`,
            '""',
            `"${codPag}"`,
            `"${desPag}"`,
            '""',
            '0',
            '""',
            '""',
            APP.formatDecimal(totNetto),
            APP.formatDecimal(totIva),
            APP.formatDecimal(totOrdine),
            APP.formatDecimal(0),
            APP.formatDecimal(0),
            `"${APP.config.deposito}"`,
            '""', APP.formatDecimal(0), '""', '""', '""', '""', '""', '""',
            APP.formatDecimal(1), '""'
        ].join('|') + '\n';

        // ------ DETTAGLI ORDINE FORNITORE (36 campi ocd_*) ------
        let numRiga = 1;
        for (const riga of ordine.righe) {
            const codIva   = riga.codIvaAcquisto || '22';
            const aliquota = await APP.getAliquotaIva(codIva);
            const impNetto = riga.qty * riga.prezzo;
            const impIva   = impNetto * aliquota / 100;
            dettagli += [
                `"${forn.codice}"`,
                `"${ordine.registro}"`,
                ordine.numero,
                numRiga,
                `"${dataOrd}"`,
                `"${riga.codice}"`,
                `"${riga.des1||''}"`,
                `"${riga.des2||''}"`,
                `"${riga.um||''}"`,
                APP.formatDecimal(riga.qty),
                APP.formatDecimal(0),
                APP.formatDecimal(riga.prezzo),
                APP.formatDecimal(0), APP.formatDecimal(0), APP.formatDecimal(0),
                APP.formatDecimal(impNetto),
                `"${codIva}"`,
                APP.formatDecimal(aliquota),
                APP.formatDecimal(impIva),
                APP.formatDecimal(impNetto + impIva),
                `"${APP.config.deposito}"`,
                `"${dataOrd}"`,
                '""', '""', '""', '""', '""',
                APP.formatDecimal(0), '""', APP.formatDecimal(0),
                '""', '""', '""', '""', '""', '""'
            ].join('|') + '\n';
            numRiga++;
        }
    }

    const enc = s => new TextEncoder().encode(s);
    await APP.uploadFile(folderId, 'ordfornitori-anagrafica', enc(anagrafiche), 'text/plain');
    await APP.uploadFile(folderId, 'ordfornitori-testate',    enc(testate),     'text/plain');
    await APP.uploadFile(folderId, 'ordfornitori-dettagli',   enc(dettagli),    'text/plain');

    await DB.clearQueue('queueOrdiniFornitori');
    APP.updateHeaderQueueCount('ordFor');
    APP.updateBadges();
    await APP.syncStoricoToDrive('ordiniFornitori');
};

// ---------- UPLOAD HELPER ----------

APP.uploadFile = async function(folderId, fileName, data, mimeType) {
    const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
    const searchResponse = await fetch(searchUrl, { headers: { 'Authorization': `Bearer ${APP.accessToken}` } });
    const searchData = await searchResponse.json();

    const boundary = '-------314159265358979323846';
    const metadata = { name: fileName, mimeType };
    if (!searchData.files || searchData.files.length === 0) metadata.parents = [folderId];

    let bodyParts = '';
    bodyParts += '--' + boundary + '\r\n';
    bodyParts += 'Content-Type: application/json; charset=UTF-8\r\n\r\n';
    bodyParts += JSON.stringify(metadata) + '\r\n';
    bodyParts += '--' + boundary + '\r\n';
    bodyParts += 'Content-Type: ' + mimeType + '\r\n';
    bodyParts += 'Content-Transfer-Encoding: base64\r\n\r\n';
    let binary = '';
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    bodyParts += btoa(binary) + '\r\n';
    bodyParts += '--' + boundary + '--';

    let url, method;
    if (searchData.files && searchData.files.length > 0) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${searchData.files[0].id}?uploadType=multipart`;
        method = 'PATCH';
    } else {
        url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        method = 'POST';
    }
    const response = await fetch(url, {
        method, body: bodyParts,
        headers: {
            'Authorization': `Bearer ${APP.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        }
    });
    if (!response.ok) throw new Error('Errore upload: ' + response.status);
    return await response.json();
};

// ---------- STORICO SU DRIVE ----------

APP.syncStoricoToDrive = async function(tipo) {
    const storeMap = { ordiniClienti: ['storicoOrdiniClienti','storico-ordini-clienti.json'],
                       ordiniFornitori: ['storicoOrdiniFornitori','storico-ordini-fornitori.json'] };
    const [storeName, fileName] = storeMap[tipo] || [];
    if (!storeName) return;
    try {
        const storico = await DB.getStorico(storeName);
        if (storico.length === 0) return;
        const folderId = await APP.findFolder(APP.config.folder);
        if (!folderId) return;
        const jsonData = JSON.stringify(storico, null, 2);
        await APP.uploadFile(folderId, fileName, new TextEncoder().encode(jsonData), 'application/json');
    } catch(e) { console.warn('Errore sync storico:', e); }
};

APP.loadStoricoFromDrive = async function() {
    try {
        const folderId = await APP.findFolder(APP.config.folder);
        if (!folderId) return;
        await APP.loadStoricoFile(folderId, 'storico-ordini-clienti.json',   'storicoOrdiniClienti');
        await APP.loadStoricoFile(folderId, 'storico-ordini-fornitori.json', 'storicoOrdiniFornitori');
    } catch(e) { console.warn('Errore caricamento storico:', e); }
};

APP.loadStoricoFile = async function(folderId, fileName, storeName) {
    try {
        const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;
        const searchResponse = await fetch(searchUrl, { headers: { 'Authorization': `Bearer ${APP.accessToken}` } });
        const searchData = await searchResponse.json();
        if (!searchData.files || searchData.files.length === 0) return;
        const downloadResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${searchData.files[0].id}?alt=media`,
            { headers: { 'Authorization': `Bearer ${APP.accessToken}` } });
        if (!downloadResponse.ok) return;
        const storicoData = JSON.parse(await downloadResponse.text());
        if (!Array.isArray(storicoData)) return;
        const storicoLocale = await DB.getStorico(storeName).catch(() => []);
        const localKeys = new Set(storicoLocale.map(o => `${o.registro}-${o.numero}-${o.timestamp}`));
        for (const ordine of storicoData) {
            const key = `${ordine.registro}-${ordine.numero}-${ordine.timestamp}`;
            if (!localKeys.has(key)) {
                const { id, ...senzaId } = ordine;
                await DB.addToStorico(storeName, senzaId);
            }
        }
    } catch(e) { console.warn(`Errore caricamento ${fileName}:`, e); }
};
