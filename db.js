// ==========================================
// PICAM v3.6 - Database Module (IndexedDB)
// ==========================================

const DB_NAME = 'PicamDB';
const DB_VERSION = 5; // v5: Fix sync, gruppi, getAllArticoliByLocazione/Gruppo

let db = null;

// ==========================================
// INIZIALIZZAZIONE DATABASE
// ==========================================

function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Errore apertura IndexedDB:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB aperto con successo');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            console.log('Creazione/aggiornamento schema IndexedDB...');

            // Store ARTICOLI con indici
            if (!database.objectStoreNames.contains('articoli')) {
                const articoliStore = database.createObjectStore('articoli', { keyPath: 'codice' });
                articoliStore.createIndex('barcode', 'barcode', { unique: false });
                articoliStore.createIndex('des1', 'des1', { unique: false });
                articoliStore.createIndex('gruppo', 'gruppo', { unique: false });
                articoliStore.createIndex('locazione', 'locazione', { unique: false });
            }

            // Store CLIENTI con indici
            if (!database.objectStoreNames.contains('clienti')) {
                const clientiStore = database.createObjectStore('clienti', { keyPath: 'codice' });
                clientiStore.createIndex('ragSoc1', 'ragSoc1', { unique: false });
                clientiStore.createIndex('partitaIva', 'partitaIva', { unique: false });
            }

            // Store FORNITORI con indici
            if (!database.objectStoreNames.contains('fornitori')) {
                const fornitoriStore = database.createObjectStore('fornitori', { keyPath: 'codice' });
                fornitoriStore.createIndex('ragSoc1', 'ragSoc1', { unique: false });
                fornitoriStore.createIndex('partitaIva', 'partitaIva', { unique: false });
            }

            // Store CODA INVENTARIO
            if (!database.objectStoreNames.contains('queueInventario')) {
                database.createObjectStore('queueInventario', { keyPath: 'id', autoIncrement: true });
            }

            // Store CODA ORDINI CLIENTI
            if (!database.objectStoreNames.contains('queueOrdiniClienti')) {
                database.createObjectStore('queueOrdiniClienti', { keyPath: 'id', autoIncrement: true });
            }

            // Store CODA ORDINI FORNITORI
            if (!database.objectStoreNames.contains('queueOrdiniFornitori')) {
                database.createObjectStore('queueOrdiniFornitori', { keyPath: 'id', autoIncrement: true });
            }

            // Store METADATA (contatori, config, ecc.)
            if (!database.objectStoreNames.contains('metadata')) {
                database.createObjectStore('metadata', { keyPath: 'key' });
            }
            
            // Store ALIQUOTE IVA (v2)
            if (!database.objectStoreNames.contains('aliquoteIva')) {
                const ivaStore = database.createObjectStore('aliquoteIva', { keyPath: 'codice' });
                ivaStore.createIndex('aliquota', 'aliquota', { unique: false });
            }
            
            // Store PAGAMENTI (v2)
            if (!database.objectStoreNames.contains('pagamenti')) {
                const pagStore = database.createObjectStore('pagamenti', { keyPath: 'codice' });
                pagStore.createIndex('descrizione', 'descrizione', { unique: false });
            }
            
            // Store STORICO ORDINI CLIENTI (v3)
            if (!database.objectStoreNames.contains('storicoOrdiniClienti')) {
                const storicoCliStore = database.createObjectStore('storicoOrdiniClienti', { keyPath: 'id', autoIncrement: true });
                storicoCliStore.createIndex('timestamp', 'timestamp', { unique: false });
                storicoCliStore.createIndex('clienteCodice', 'cliente.codice', { unique: false });
            }
            
            // Store STORICO ORDINI FORNITORI (v3)
            if (!database.objectStoreNames.contains('storicoOrdiniFornitori')) {
                const storicoForStore = database.createObjectStore('storicoOrdiniFornitori', { keyPath: 'id', autoIncrement: true });
                storicoForStore.createIndex('timestamp', 'timestamp', { unique: false });
                storicoForStore.createIndex('fornitoreCodice', 'fornitore.codice', { unique: false });
            }
            
            // Store GRUPPI MERCEOLOGICI (v4)
            if (!database.objectStoreNames.contains('gruppiMerceologici')) {
                const gruppiStore = database.createObjectStore('gruppiMerceologici', { keyPath: 'codice' });
                gruppiStore.createIndex('descrizione', 'descrizione', { unique: false });
            }
            
            // Store LOCAZIONI (v4) - per gestione locazioni personalizzate
            if (!database.objectStoreNames.contains('locazioni')) {
                const locStore = database.createObjectStore('locazioni', { keyPath: 'codice' });
            }

            console.log('Schema IndexedDB creato');
        };
    });
}

// ==========================================
// OPERAZIONI GENERICHE
// ==========================================

function getStore(storeName, mode = 'readonly') {
    if (!db) throw new Error('Database non inizializzato');
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
}

function clearStore(storeName) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function countStore(storeName) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readonly');
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// ARTICOLI
// ==========================================

async function saveArticoli(articoli, onProgress) {
    await clearStore('articoli');
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('articoli', 'readwrite');
        const store = transaction.objectStore('articoli');
        
        let processed = 0;
        const total = articoli.length;
        const batchSize = 500;
        
        function processBatch(startIndex) {
            const endIndex = Math.min(startIndex + batchSize, total);
            
            for (let i = startIndex; i < endIndex; i++) {
                store.put(articoli[i]);
                processed++;
            }
            
            if (onProgress) {
                onProgress(Math.round((processed / total) * 100));
            }
            
            if (endIndex < total) {
                setTimeout(() => processBatch(endIndex), 0);
            }
        }
        
        transaction.oncomplete = () => resolve(total);
        transaction.onerror = () => reject(transaction.error);
        
        processBatch(0);
    });
}

function searchArticoli(query, limit = 50) {
    return new Promise((resolve, reject) => {
        if (!query || query.length < 2) {
            resolve([]);
            return;
        }
        
        const queryLower = query.toLowerCase();
        const results = [];
        
        const store = getStore('articoli', 'readonly');
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            
            if (cursor && results.length < limit) {
                const art = cursor.value;
                
                // Ricerca su codice, barcode, descrizione1, descrizione2
                if (art.codice.toLowerCase().includes(queryLower) ||
                    (art.barcode && art.barcode.includes(query)) ||
                    art.des1.toLowerCase().includes(queryLower) ||
                    (art.des2 && art.des2.toLowerCase().includes(queryLower))) {
                    results.push(art);
                }
                
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

function getArticoloByCode(codice) {
    return new Promise((resolve, reject) => {
        const store = getStore('articoli', 'readonly');
        const request = store.get(codice);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getArticoloByBarcode(barcode) {
    return new Promise((resolve, reject) => {
        const store = getStore('articoli', 'readonly');
        const index = store.index('barcode');
        const request = index.get(barcode);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAllArticoli() {
    return new Promise((resolve, reject) => {
        const store = getStore('articoli', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Aggiorna locazione di un articolo
function updateArticoloLocazione(codice, nuovaLocazione) {
    return new Promise(async (resolve, reject) => {
        try {
            const articolo = await getArticoloByCode(codice);
            if (!articolo) {
                reject(new Error('Articolo non trovato'));
                return;
            }
            
            articolo.locazione = nuovaLocazione;
            
            const store = getStore('articoli', 'readwrite');
            const request = store.put(articolo);
            request.onsuccess = () => resolve(articolo);
            request.onerror = () => reject(request.error);
        } catch(e) {
            reject(e);
        }
    });
}

// Ottieni tutti articoli ordinati per locazione + codice (senza loc in fondo)
function getAllArticoliByLocazione() {
    return new Promise((resolve, reject) => {
        const store = getStore('articoli', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => {
            const result = request.result.sort((a, b) => {
                const locA = (a.locazione || '').trim();
                const locB = (b.locazione || '').trim();
                
                if (!locA && locB) return 1;
                if (locA && !locB) return -1;
                
                if (locA !== locB) return locA.localeCompare(locB);
                return (a.codice || '').localeCompare(b.codice || '');
            });
            resolve(result);
        };
        request.onerror = () => reject(request.error);
    });
}

// Ottieni tutti articoli ordinati per gruppo + codice
function getAllArticoliByGruppo() {
    return new Promise((resolve, reject) => {
        const store = getStore('articoli', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => {
            const result = request.result.sort((a, b) => {
                const grpA = (a.gruppo || 'ZZZ').toUpperCase();
                const grpB = (b.gruppo || 'ZZZ').toUpperCase();
                if (grpA !== grpB) return grpA.localeCompare(grpB);
                return (a.codice || '').localeCompare(b.codice || '');
            });
            resolve(result);
        };
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// CLIENTI
// ==========================================

async function saveClienti(clienti, onProgress) {
    await clearStore('clienti');
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('clienti', 'readwrite');
        const store = transaction.objectStore('clienti');
        
        clienti.forEach((cli, idx) => {
            store.put(cli);
            if (onProgress && idx % 100 === 0) {
                onProgress(Math.round((idx / clienti.length) * 100));
            }
        });
        
        transaction.oncomplete = () => resolve(clienti.length);
        transaction.onerror = () => reject(transaction.error);
    });
}

function searchClienti(query, limit = 50) {
    return new Promise((resolve, reject) => {
        if (!query || query.length < 2) {
            resolve([]);
            return;
        }
        
        const queryLower = query.toLowerCase();
        const results = [];
        
        const store = getStore('clienti', 'readonly');
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            
            if (cursor && results.length < limit) {
                const cli = cursor.value;
                
                if (cli.codice.toLowerCase().includes(queryLower) ||
                    cli.ragSoc1.toLowerCase().includes(queryLower) ||
                    cli.partitaIva.includes(query)) {
                    results.push(cli);
                }
                
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

function getAllClienti() {
    return new Promise((resolve, reject) => {
        const store = getStore('clienti', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// FORNITORI
// ==========================================

async function saveFornitori(fornitori, onProgress) {
    await clearStore('fornitori');
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('fornitori', 'readwrite');
        const store = transaction.objectStore('fornitori');
        
        fornitori.forEach((forn, idx) => {
            store.put(forn);
            if (onProgress && idx % 100 === 0) {
                onProgress(Math.round((idx / fornitori.length) * 100));
            }
        });
        
        transaction.oncomplete = () => resolve(fornitori.length);
        transaction.onerror = () => reject(transaction.error);
    });
}

function searchFornitori(query, limit = 50) {
    return new Promise((resolve, reject) => {
        if (!query || query.length < 2) {
            resolve([]);
            return;
        }
        
        const queryLower = query.toLowerCase();
        const results = [];
        
        const store = getStore('fornitori', 'readonly');
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            
            if (cursor && results.length < limit) {
                const forn = cursor.value;
                
                if (forn.codice.toLowerCase().includes(queryLower) ||
                    forn.ragSoc1.toLowerCase().includes(queryLower) ||
                    forn.partitaIva.includes(query)) {
                    results.push(forn);
                }
                
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

function getAllFornitori() {
    return new Promise((resolve, reject) => {
        const store = getStore('fornitori', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// CODE (INVENTARIO, ORDINI)
// ==========================================

function addToQueue(storeName, item) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.add(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function updateQueueItem(storeName, item) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.put(item);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function deleteFromQueue(storeName, id) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readwrite');
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function getQueue(storeName) {
    return new Promise((resolve, reject) => {
        const store = getStore(storeName, 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function clearQueue(storeName) {
    return clearStore(storeName);
}

// ==========================================
// METADATA
// ==========================================

function setMetadata(key, value) {
    return new Promise((resolve, reject) => {
        const store = getStore('metadata', 'readwrite');
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function getMetadata(key) {
    return new Promise((resolve, reject) => {
        const store = getStore('metadata', 'readonly');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// STATISTICHE
// ==========================================

async function getStats() {
    const articoliCount = await countStore('articoli');
    const clientiCount = await countStore('clienti');
    const fornitoriCount = await countStore('fornitori');
    const queueInvCount = await countStore('queueInventario');
    const queueOrdCliCount = await countStore('queueOrdiniClienti');
    const queueOrdForCount = await countStore('queueOrdiniFornitori');
    
    // Storico ordini (v3)
    let storicoCliCount = 0;
    let storicoForCount = 0;
    try {
        storicoCliCount = await countStore('storicoOrdiniClienti');
        storicoForCount = await countStore('storicoOrdiniFornitori');
    } catch(e) {
        // Store non ancora creato
    }
    
    return {
        articoli: articoliCount,
        clienti: clientiCount,
        fornitori: fornitoriCount,
        queueInventario: queueInvCount,
        queueOrdiniClienti: queueOrdCliCount,
        queueOrdiniFornitori: queueOrdForCount,
        storicoOrdiniClienti: storicoCliCount,
        storicoOrdiniFornitori: storicoForCount
    };
}

// ==========================================
// ALIQUOTE IVA
// ==========================================

function saveAliquoteIva(aliquote) {
    return new Promise((resolve, reject) => {
        const store = getStore('aliquoteIva', 'readwrite');
        let completed = 0;
        
        aliquote.forEach(item => {
            const request = store.put(item);
            request.onsuccess = () => {
                completed++;
                if (completed === aliquote.length) resolve(completed);
            };
            request.onerror = () => reject(request.error);
        });
        
        if (aliquote.length === 0) resolve(0);
    });
}

function getAliquotaByCode(codice) {
    return new Promise((resolve, reject) => {
        const store = getStore('aliquoteIva', 'readonly');
        const request = store.get(codice);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAllAliquoteIva() {
    return new Promise((resolve, reject) => {
        const store = getStore('aliquoteIva', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// PAGAMENTI
// ==========================================

function savePagamenti(pagamenti) {
    return new Promise((resolve, reject) => {
        const store = getStore('pagamenti', 'readwrite');
        let completed = 0;
        
        pagamenti.forEach(item => {
            const request = store.put(item);
            request.onsuccess = () => {
                completed++;
                if (completed === pagamenti.length) resolve(completed);
            };
            request.onerror = () => reject(request.error);
        });
        
        if (pagamenti.length === 0) resolve(0);
    });
}

function getPagamentoByCode(codice) {
    return new Promise((resolve, reject) => {
        const store = getStore('pagamenti', 'readonly');
        const request = store.get(codice);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAllPagamenti() {
    return new Promise((resolve, reject) => {
        const store = getStore('pagamenti', 'readonly');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ==========================================
// STORICO ORDINI (v3)
// ==========================================

// Aggiunge ordine allo storico
function addToStorico(storeName, ordine) {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore(storeName, 'readwrite');
            // Copia ordine aggiungendo timestamp se non presente
            const ordineStorico = {
                ...ordine,
                dataStorico: new Date().toISOString()
            };
            const request = store.add(ordineStorico);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch(e) {
            reject(e);
        }
    });
}

// Ottiene tutto lo storico (ordinato per data desc)
function getStorico(storeName) {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore(storeName, 'readonly');
            const request = store.getAll();
            request.onsuccess = () => {
                // Ordina per timestamp decrescente (più recenti prima)
                const result = request.result.sort((a, b) => {
                    const tA = a.timestamp || 0;
                    const tB = b.timestamp || 0;
                    return tB - tA;
                });
                resolve(result);
            };
            request.onerror = () => reject(request.error);
        } catch(e) {
            resolve([]); // Store non esiste ancora
        }
    });
}

// Ottiene un singolo ordine dallo storico per ID
function getStoricoById(storeName, id) {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore(storeName, 'readonly');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch(e) {
            reject(e);
        }
    });
}

// Svuota lo storico
function clearStorico(storeName) {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore(storeName, 'readwrite');
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch(e) {
            reject(e);
        }
    });
}

// Cerca nello storico per cliente/fornitore
function searchStorico(storeName, query) {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore(storeName, 'readonly');
            const request = store.getAll();
            request.onsuccess = () => {
                const queryLower = query.toLowerCase();
                const results = request.result.filter(ordine => {
                    // Cerca in cliente o fornitore
                    const soggetto = ordine.cliente || ordine.fornitore;
                    if (!soggetto) return false;
                    
                    const ragSoc = (soggetto.ragSoc1 || '').toLowerCase();
                    const codice = (soggetto.codice || '').toLowerCase();
                    const numero = (ordine.numero || '').toString();
                    
                    return ragSoc.includes(queryLower) || 
                           codice.includes(queryLower) ||
                           numero.includes(queryLower);
                });
                
                // Ordina per timestamp desc
                results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        } catch(e) {
            resolve([]);
        }
    });
}

// ==========================================
// GRUPPI MERCEOLOGICI (v4)
// ==========================================

function saveGruppiMerceologici(gruppi) {
    return new Promise(async (resolve, reject) => {
        try {
            await clearStore('gruppiMerceologici');
            const store = getStore('gruppiMerceologici', 'readwrite');
            let completed = 0;
            
            if (gruppi.length === 0) {
                resolve(0);
                return;
            }
            
            gruppi.forEach(item => {
                const request = store.put(item);
                request.onsuccess = () => {
                    completed++;
                    if (completed === gruppi.length) resolve(completed);
                };
                request.onerror = () => reject(request.error);
            });
        } catch(e) {
            reject(e);
        }
    });
}

function getAllGruppiMerceologici() {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore('gruppiMerceologici', 'readonly');
            const request = store.getAll();
            request.onsuccess = () => {
                // Ordina per descrizione
                const result = request.result.sort((a, b) => 
                    (a.descrizione || '').localeCompare(b.descrizione || '')
                );
                resolve(result);
            };
            request.onerror = () => reject(request.error);
        } catch(e) {
            resolve([]);
        }
    });
}

function getGruppoByCode(codice) {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore('gruppiMerceologici', 'readonly');
            const request = store.get(codice);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch(e) {
            resolve(null);
        }
    });
}

// Ottieni articoli per gruppo merceologico
function getArticoliByGruppo(codiceGruppo) {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore('articoli', 'readonly');
            const index = store.index('gruppo');
            const request = index.getAll(codiceGruppo);
            request.onsuccess = () => {
                // Ordina per descrizione
                const result = request.result.sort((a, b) => 
                    (a.des1 || '').localeCompare(b.des1 || '')
                );
                resolve(result);
            };
            request.onerror = () => reject(request.error);
        } catch(e) {
            resolve([]);
        }
    });
}

// ==========================================
// LOCAZIONI (v4)
// ==========================================

function saveLocazioni(locazioni) {
    return new Promise(async (resolve, reject) => {
        try {
            await clearStore('locazioni');
            const store = getStore('locazioni', 'readwrite');
            let completed = 0;
            
            if (locazioni.length === 0) {
                resolve(0);
                return;
            }
            
            locazioni.forEach(item => {
                const request = store.put(item);
                request.onsuccess = () => {
                    completed++;
                    if (completed === locazioni.length) resolve(completed);
                };
                request.onerror = () => reject(request.error);
            });
        } catch(e) {
            reject(e);
        }
    });
}

function addLocazione(locazione) {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore('locazioni', 'readwrite');
            const request = store.put(locazione);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch(e) {
            reject(e);
        }
    });
}

function getAllLocazioni() {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore('locazioni', 'readonly');
            const request = store.getAll();
            request.onsuccess = () => {
                // Ordina per codice
                const result = request.result.sort((a, b) => 
                    (a.codice || '').localeCompare(b.codice || '')
                );
                resolve(result);
            };
            request.onerror = () => reject(request.error);
        } catch(e) {
            resolve([]);
        }
    });
}

// Ottieni articoli per locazione
function getArticoliByLocazione(locazione) {
    return new Promise((resolve, reject) => {
        try {
            const store = getStore('articoli', 'readonly');
            const index = store.index('locazione');
            const request = index.getAll(locazione);
            request.onsuccess = () => {
                // Ordina per descrizione
                const result = request.result.sort((a, b) => 
                    (a.des1 || '').localeCompare(b.des1 || '')
                );
                resolve(result);
            };
            request.onerror = () => reject(request.error);
        } catch(e) {
            resolve([]);
        }
    });
}

// Estrai locazioni uniche dagli articoli
async function extractLocazioniFromArticoli() {
    const articoli = await getAllArticoli();
    const locazioniSet = new Set();
    
    articoli.forEach(art => {
        if (art.locazione && art.locazione.trim()) {
            locazioniSet.add(art.locazione.trim());
        }
    });
    
    const locazioni = Array.from(locazioniSet).map(loc => ({
        codice: loc,
        descrizione: loc
    }));
    
    await saveLocazioni(locazioni);
    return locazioni;
}

// ==========================================
// EXPORT MODULO
// ==========================================

const DB = {
    init: initDB,
    
    // Articoli
    saveArticoli,
    searchArticoli,
    getArticoloByCode,
    getArticoloByBarcode,
    getAllArticoli,
    getAllArticoliByLocazione,
    getAllArticoliByGruppo,
    updateArticoloLocazione,
    countArticoli: () => countStore('articoli'),
    
    // Clienti
    saveClienti,
    searchClienti,
    getAllClienti,
    countClienti: () => countStore('clienti'),
    
    // Fornitori
    saveFornitori,
    searchFornitori,
    getAllFornitori,
    countFornitori: () => countStore('fornitori'),
    
    // Aliquote IVA
    saveAliquoteIva,
    getAliquotaByCode,
    getAllAliquoteIva,
    
    // Pagamenti
    savePagamenti,
    getPagamentoByCode,
    getAllPagamenti,
    
    // Code
    addToQueue,
    updateQueueItem,
    deleteFromQueue,
    getQueue,
    clearQueue,
    countStore,  // Espongo la funzione generica countStore
    
    // Storico Ordini (v3)
    addToStorico,
    getStorico,
    getStoricoById,
    clearStorico,
    searchStorico,
    
    // Gruppi Merceologici (v4)
    saveGruppiMerceologici,
    getAllGruppiMerceologici,
    getGruppoByCode,
    getArticoliByGruppo,
    
    // Locazioni (v4)
    saveLocazioni,
    addLocazione,
    getAllLocazioni,
    getArticoliByLocazione,
    extractLocazioniFromArticoli,
    
    // Metadata
    setMetadata,
    getMetadata,
    
    // Stats
    getStats
};
