/**
 * PICAM PWA - Database Module v3.5
 * IndexedDB per storage locale
 */

const DB = {
    name: 'PicamDB',
    version: 5,
    db: null
};

// Inizializza database
DB.init = function() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB.name, DB.version);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            DB.db = request.result;
            console.log('DB inizializzato:', DB.name, 'v' + DB.version);
            resolve(DB.db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Articoli
            if (!db.objectStoreNames.contains('articoli')) {
                const store = db.createObjectStore('articoli', { keyPath: 'codice' });
                store.createIndex('descrizione', 'des1', { unique: false });
                store.createIndex('barcode', 'barcode', { unique: false });
                store.createIndex('gruppo', 'gruppoMerc', { unique: false });
                store.createIndex('locazione', 'locazione', { unique: false });
            }
            
            // Codici a barre
            if (!db.objectStoreNames.contains('codbar')) {
                const store = db.createObjectStore('codbar', { keyPath: 'barcode' });
                store.createIndex('codice', 'codice', { unique: false });
            }
            
            // Giacenze per deposito
            if (!db.objectStoreNames.contains('giacenze')) {
                const store = db.createObjectStore('giacenze', { keyPath: ['codice', 'deposito'] });
                store.createIndex('codice', 'codice', { unique: false });
                store.createIndex('deposito', 'deposito', { unique: false });
            }
            
            // Clienti
            if (!db.objectStoreNames.contains('clienti')) {
                const store = db.createObjectStore('clienti', { keyPath: 'codice' });
                store.createIndex('ragSoc', 'ragSoc1', { unique: false });
            }
            
            // Fornitori
            if (!db.objectStoreNames.contains('fornitori')) {
                const store = db.createObjectStore('fornitori', { keyPath: 'codice' });
                store.createIndex('ragSoc', 'ragSoc1', { unique: false });
            }
            
            // Aliquote IVA
            if (!db.objectStoreNames.contains('iva')) {
                db.createObjectStore('iva', { keyPath: 'codice' });
            }
            
            // Pagamenti
            if (!db.objectStoreNames.contains('pagamenti')) {
                db.createObjectStore('pagamenti', { keyPath: 'codice' });
            }
            
            // Gruppi merceologici
            if (!db.objectStoreNames.contains('gruppiMerc')) {
                db.createObjectStore('gruppiMerc', { keyPath: 'codice' });
            }
            
            // Locazioni (estratte dagli articoli)
            if (!db.objectStoreNames.contains('locazioni')) {
                db.createObjectStore('locazioni', { keyPath: 'codice' });
            }
            
            // Code
            if (!db.objectStoreNames.contains('queueInventario')) {
                const store = db.createObjectStore('queueInventario', { keyPath: 'id', autoIncrement: true });
                store.createIndex('codice', 'codice', { unique: false });
                store.createIndex('synced', 'synced', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('queueOrdiniClienti')) {
                const store = db.createObjectStore('queueOrdiniClienti', { keyPath: 'id', autoIncrement: true });
                store.createIndex('synced', 'synced', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('queueOrdiniFornitori')) {
                const store = db.createObjectStore('queueOrdiniFornitori', { keyPath: 'id', autoIncrement: true });
                store.createIndex('synced', 'synced', { unique: false });
            }
            
            // Storico
            if (!db.objectStoreNames.contains('storicoInventario')) {
                const store = db.createObjectStore('storicoInventario', { keyPath: 'id', autoIncrement: true });
                store.createIndex('data', 'data', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('storicoOrdiniClienti')) {
                const store = db.createObjectStore('storicoOrdiniClienti', { keyPath: 'id', autoIncrement: true });
                store.createIndex('data', 'data', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('storicoOrdiniFornitori')) {
                const store = db.createObjectStore('storicoOrdiniFornitori', { keyPath: 'id', autoIncrement: true });
                store.createIndex('data', 'data', { unique: false });
            }
            
            console.log('DB upgrade completato');
        };
    });
};

// ==========================================
// OPERAZIONI GENERICHE
// ==========================================

DB.add = function(storeName, data) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

DB.put = function(storeName, data) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

DB.get = function(storeName, key) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

DB.getAll = function(storeName) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

DB.delete = function(storeName, key) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

DB.clear = function(storeName) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

DB.count = function(storeName) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// ==========================================
// BULK OPERATIONS
// ==========================================

DB.bulkPut = function(storeName, dataArray) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        let count = 0;
        
        dataArray.forEach(item => {
            const request = store.put(item);
            request.onsuccess = () => count++;
        });
        
        tx.oncomplete = () => resolve(count);
        tx.onerror = () => reject(tx.error);
    });
};

// ==========================================
// ARTICOLI
// ==========================================

DB.searchArticoli = function(query, limit = 20) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('articoli', 'readonly');
        const store = tx.objectStore('articoli');
        const request = store.getAll();
        
        request.onsuccess = () => {
            const results = request.result;
            const q = query.toLowerCase();
            
            const filtered = results.filter(art => 
                art.codice.toLowerCase().includes(q) ||
                (art.des1 && art.des1.toLowerCase().includes(q)) ||
                (art.barcode && art.barcode.includes(q))
            );
            
            resolve(filtered.slice(0, limit));
        };
        
        request.onerror = () => reject(request.error);
    });
};

DB.getArticoloByBarcode = function(barcode) {
    return new Promise(async (resolve, reject) => {
        try {
            // Prima cerca nella tabella codbar
            const tx1 = DB.db.transaction('codbar', 'readonly');
            const store1 = tx1.objectStore('codbar');
            const request1 = store1.get(barcode);
            
            request1.onsuccess = async () => {
                if (request1.result) {
                    // Trovato in codbar, prendi l'articolo
                    const articolo = await DB.get('articoli', request1.result.codice);
                    resolve(articolo);
                } else {
                    // Cerca direttamente negli articoli per barcode
                    const tx2 = DB.db.transaction('articoli', 'readonly');
                    const store2 = tx2.objectStore('articoli');
                    const index = store2.index('barcode');
                    const request2 = index.get(barcode);
                    
                    request2.onsuccess = () => resolve(request2.result);
                    request2.onerror = () => reject(request2.error);
                }
            };
            
            request1.onerror = () => reject(request1.error);
        } catch (e) {
            reject(e);
        }
    });
};

DB.getArticoliByGruppo = function(gruppoCode) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('articoli', 'readonly');
        const store = tx.objectStore('articoli');
        const index = store.index('gruppo');
        const request = index.getAll(gruppoCode);
        
        request.onsuccess = () => {
            // Ordina per codice
            const results = request.result.sort((a, b) => a.codice.localeCompare(b.codice));
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

DB.getArticoliByLocazione = function(locazioneCode) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('articoli', 'readonly');
        const store = tx.objectStore('articoli');
        const index = store.index('locazione');
        const request = index.getAll(locazioneCode);
        
        request.onsuccess = () => {
            // Ordina per codice
            const results = request.result.sort((a, b) => a.codice.localeCompare(b.codice));
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

// Tutti gli articoli ordinati per locazione+codice
DB.getAllArticoliByLocazione = function() {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('articoli', 'readonly');
        const store = tx.objectStore('articoli');
        const request = store.getAll();
        
        request.onsuccess = () => {
            const results = request.result;
            
            // Ordina: prima quelli con locazione (alfabeticamente), poi quelli senza
            results.sort((a, b) => {
                const locA = a.locazione || '';
                const locB = b.locazione || '';
                
                // Se uno ha locazione e l'altro no
                if (locA && !locB) return -1;
                if (!locA && locB) return 1;
                
                // Entrambi con o senza locazione: ordina per locazione poi codice
                if (locA !== locB) return locA.localeCompare(locB);
                return a.codice.localeCompare(b.codice);
            });
            
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

// Tutti gli articoli ordinati per gruppo+codice
DB.getAllArticoliByGruppo = function() {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('articoli', 'readonly');
        const store = tx.objectStore('articoli');
        const request = store.getAll();
        
        request.onsuccess = () => {
            const results = request.result;
            
            // Ordina per gruppo merceologico poi codice
            results.sort((a, b) => {
                const grpA = a.gruppoMerc || '';
                const grpB = b.gruppoMerc || '';
                
                if (grpA !== grpB) return grpA.localeCompare(grpB);
                return a.codice.localeCompare(b.codice);
            });
            
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};

// Aggiorna locazione articolo
DB.updateArticoloLocazione = function(codice, nuovaLocazione) {
    return new Promise(async (resolve, reject) => {
        try {
            const articolo = await DB.get('articoli', codice);
            if (articolo) {
                articolo.locazione = nuovaLocazione;
                await DB.put('articoli', articolo);
                resolve(articolo);
            } else {
                reject(new Error('Articolo non trovato'));
            }
        } catch (e) {
            reject(e);
        }
    });
};

// ==========================================
// GIACENZE
// ==========================================

DB.getGiacenza = function(codice, deposito) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('giacenze', 'readonly');
        const store = tx.objectStore('giacenze');
        const request = store.get([codice, deposito]);
        
        request.onsuccess = () => {
            if (request.result) {
                resolve(request.result.esistenza || 0);
            } else {
                resolve(0);
            }
        };
        request.onerror = () => reject(request.error);
    });
};

// ==========================================
// CLIENTI / FORNITORI
// ==========================================

DB.searchClienti = function(query, limit = 20) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('clienti', 'readonly');
        const store = tx.objectStore('clienti');
        const request = store.getAll();
        
        request.onsuccess = () => {
            const results = request.result;
            const q = query.toLowerCase();
            
            const filtered = results.filter(cli => 
                cli.codice.toLowerCase().includes(q) ||
                (cli.ragSoc1 && cli.ragSoc1.toLowerCase().includes(q))
            );
            
            resolve(filtered.slice(0, limit));
        };
        
        request.onerror = () => reject(request.error);
    });
};

DB.searchFornitori = function(query, limit = 20) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction('fornitori', 'readonly');
        const store = tx.objectStore('fornitori');
        const request = store.getAll();
        
        request.onsuccess = () => {
            const results = request.result;
            const q = query.toLowerCase();
            
            const filtered = results.filter(forn => 
                forn.codice.toLowerCase().includes(q) ||
                (forn.ragSoc1 && forn.ragSoc1.toLowerCase().includes(q))
            );
            
            resolve(filtered.slice(0, limit));
        };
        
        request.onerror = () => reject(request.error);
    });
};

// ==========================================
// GRUPPI MERCEOLOGICI
// ==========================================

DB.getAllGruppiMerceologici = function() {
    return DB.getAll('gruppiMerc').then(results => {
        return results.sort((a, b) => a.codice.localeCompare(b.codice));
    });
};

// ==========================================
// LOCAZIONI
// ==========================================

DB.getAllLocazioni = function() {
    return DB.getAll('locazioni').then(results => {
        return results.sort((a, b) => a.codice.localeCompare(b.codice));
    });
};

// Estrai locazioni uniche dagli articoli
DB.extractLocazioni = async function() {
    const articoli = await DB.getAll('articoli');
    const locazioni = new Set();
    
    articoli.forEach(art => {
        if (art.locazione && art.locazione.trim()) {
            locazioni.add(art.locazione.trim().toUpperCase());
        }
    });
    
    // Salva le locazioni
    await DB.clear('locazioni');
    for (const loc of locazioni) {
        await DB.put('locazioni', { codice: loc });
    }
    
    return locazioni.size;
};

// ==========================================
// IVA
// ==========================================

DB.getAliquotaIva = function(codiceIva) {
    return DB.get('iva', codiceIva);
};

// Cache sincrona per IVA (popolata all'avvio)
DB.ivaCache = {};

DB.loadIvaCache = async function() {
    const aliquote = await DB.getAll('iva');
    DB.ivaCache = {};
    aliquote.forEach(a => {
        DB.ivaCache[a.codice] = a.aliquota || 0;
    });
};

DB.getAliquotaIvaSync = function(codiceIva) {
    return DB.ivaCache[codiceIva] || 0;
};

// ==========================================
// CODE
// ==========================================

DB.addToQueue = function(storeName, item) {
    item.timestamp = new Date().toISOString();
    item.synced = false;
    return DB.add(storeName, item);
};

DB.getQueue = function(storeName) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index('synced');
        const request = index.getAll(false);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

DB.countQueue = function(storeName) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index('synced');
        const request = index.count(false);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

DB.markSynced = function(storeName, id) {
    return new Promise(async (resolve, reject) => {
        try {
            const item = await DB.get(storeName, id);
            if (item) {
                item.synced = true;
                item.syncedAt = new Date().toISOString();
                await DB.put(storeName, item);
            }
            resolve();
        } catch (e) {
            reject(e);
        }
    });
};

DB.clearSyncedQueue = function(storeName) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const index = store.index('synced');
        const request = index.openCursor(IDBKeyRange.only(true));
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                store.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

// ==========================================
// STORICO
// ==========================================

DB.moveToStorico = async function(queueStoreName, storicoStoreName) {
    const items = await DB.getAll(queueStoreName);
    const syncedItems = items.filter(i => i.synced);
    
    for (const item of syncedItems) {
        await DB.add(storicoStoreName, {
            ...item,
            archivedAt: new Date().toISOString()
        });
        await DB.delete(queueStoreName, item.id);
    }
    
    return syncedItems.length;
};

DB.getStorico = function(storeName, limit = 50) {
    return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const results = request.result;
            // Ordina per data decrescente
            results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            resolve(results.slice(0, limit));
        };
        request.onerror = () => reject(request.error);
    });
};

// ==========================================
// STATISTICHE
// ==========================================

DB.getStats = async function() {
    const stats = {
        articoli: await DB.count('articoli'),
        clienti: await DB.count('clienti'),
        fornitori: await DB.count('fornitori'),
        queueInventario: await DB.countQueue('queueInventario'),
        queueOrdiniClienti: await DB.countQueue('queueOrdiniClienti'),
        queueOrdiniFornitori: await DB.countQueue('queueOrdiniFornitori'),
        storicoInventario: await DB.count('storicoInventario'),
        storicoOrdiniClienti: await DB.count('storicoOrdiniClienti'),
        storicoOrdiniFornitori: await DB.count('storicoOrdiniFornitori')
    };
    
    return stats;
};

// ==========================================
// CLEAR ALL
// ==========================================

DB.clearAllData = async function() {
    const stores = [
        'articoli', 'codbar', 'giacenze', 'clienti', 'fornitori',
        'iva', 'pagamenti', 'gruppiMerc', 'locazioni',
        'queueInventario', 'queueOrdiniClienti', 'queueOrdiniFornitori',
        'storicoInventario', 'storicoOrdiniClienti', 'storicoOrdiniFornitori'
    ];
    
    for (const store of stores) {
        try {
            await DB.clear(store);
        } catch (e) {
            console.warn('Errore clear', store, e);
        }
    }
};

// ==========================================
// CHECK DATA EXISTS
// ==========================================

DB.hasData = async function() {
    try {
        const count = await DB.count('articoli');
        return count > 0;
    } catch (e) {
        return false;
    }
};

console.log('DB module loaded');
