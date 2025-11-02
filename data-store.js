const STORAGE_KEY = 'iva_sv_data';
const VAT_RATE = 0.13;

const defaultData = {
    clients: [],
    suppliers: [],
    salesRecords: [], // Includes both CF and CCF/F
    purchaseRecords: [],
    nextCorrelatives: {
        salesCF: 1, // Correlative for Final Consumer documents
        salesCCF: 1, // Correlative for Credit Fiscal documents
        purchases: 1 // Internal correlative for purchase tracking
    },
    // NEW: Company Information
    companyInfo: {
        name: '',
        nit: '',
        nrc: '',
        dui: '',
        activity: '',
        address: '',
        phone: ''
    }
};

let appData = loadData();

function loadData() {
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            const loadedData = JSON.parse(storedData);
            const merged = {
                ...defaultData,
                ...loadedData,
                nextCorrelatives: { ...defaultData.nextCorrelatives, ...loadedData.nextCorrelatives },
                companyInfo: { ...defaultData.companyInfo, ...loadedData.companyInfo }
            };
            ['salesRecords','purchaseRecords','clients','suppliers'].forEach(t => {
                merged[t] = (merged[t] || []).map(r => r?.id ? r : { ...r, id: generateId() });
            });
            return merged;
        }
    } catch (e) {
        console.error("Error loading data from localStorage", e);
    }
    return defaultData;
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function resetData() {
    // Perform a deep copy reset
    appData = JSON.parse(JSON.stringify(defaultData)); 
    saveData();
}

// --- General CRUD functions ---

function getAll(type) {
    return appData[type];
}

function addEntity(type, entity) {
    // Assign a simple ID for management
    entity.id = Date.now() + Math.random().toString(16).slice(2); 
    appData[type].push(entity);
    saveData();
    return entity;
}

function updateEntity(type, id, newData) {
    const list = appData[type];
    const index = list.findIndex(e => e.id === id);
    
    if (index === -1) {
        throw new Error(`Entity with id ${id} not found in ${type}.`);
    }

    const currentRecord = list[index];
    
    // Merge new data
    let updatedRecord = { ...currentRecord, ...newData };

    // Specific logic for purchase records update: Recalculate total
    if (type === 'purchaseRecords') {
        // Ensure numeric fields are correctly parsed from potential string inputs 
        // coming from contenteditable cells (which might return strings like "100.00")
        const taxableAmount = parseFloat(updatedRecord.taxableAmount) || 0;
        const exemptAmount = parseFloat(updatedRecord.exemptAmount) || 0;
        const ivaCredit = parseFloat(updatedRecord.ivaCredit) || 0;
        const ivaWithheld = parseFloat(updatedRecord.ivaWithheld) || 0;

        updatedRecord.total = taxableAmount + exemptAmount + ivaCredit - ivaWithheld;
        
        // Ensure values are stored as numbers for calculations elsewhere
        updatedRecord.taxableAmount = taxableAmount;
        updatedRecord.exemptAmount = exemptAmount;
        updatedRecord.ivaCredit = ivaCredit;
        updatedRecord.ivaWithheld = ivaWithheld;

    } else if (type === 'salesRecords') {
        // Handle sales record update (recalculation based on document type)
        const isCredit = updatedRecord.documentType === 'CCF';

        if (isCredit) {
            // CCF: Input is TaxableAmount and ExemptAmount. Calculate IVA and Total.
            const taxableAmount = parseFloat(updatedRecord.taxableAmount) || 0;
            const exemptAmount = parseFloat(updatedRecord.exemptAmount) || 0;

            updatedRecord.taxableAmount = taxableAmount;
            updatedRecord.exemptAmount = exemptAmount;
            
            // Recalculate derived fields
            updatedRecord.ivaDebit = calculateVat(taxableAmount);
            updatedRecord.total = taxableAmount + exemptAmount + updatedRecord.ivaDebit;
            
            // Ensure clientNrc is mandatory for CCF
            if (!updatedRecord.clientNrc) {
                updatedRecord.clientNrc = null; // Clear if empty
            }

        } else if (updatedRecord.documentType === 'CF') {
            // CF: Input is Total (Gross amount). Calculate Taxable and IVA Debit.
            const total = parseFloat(updatedRecord.total) || 0;
            updatedRecord.total = total;
            
            // Recalculate derived fields from total
            updatedRecord.taxableAmount = Math.round((total / (1 + VAT_RATE)) * 100) / 100;
            updatedRecord.exemptAmount = 0; 
            updatedRecord.ivaDebit = Math.round((total - updatedRecord.taxableAmount) * 100) / 100;
            
            // Ensure NRC and Exempt are nullified/cleared if present for CF
            updatedRecord.clientNrc = null;
            updatedRecord.exemptAmount = 0;

        } else {
            console.warn(`Attempted to update sales record with unknown document type: ${updatedRecord.documentType}`);
        }
    }
    
    list[index] = updatedRecord;
    saveData();
    return updatedRecord;
}

function deleteEntity(type, id) {
    const list = appData[type];
    const initialLength = list.length;
    
    // Filter out the entity with the matching ID
    appData[type] = list.filter(e => e.id !== id);
    
    if (appData[type].length < initialLength) {
        saveData();
        return true; // Deletion successful
    }
    return false; // Entity not found
}

// Function to handle full data replacement (JSON backup restore)
function importFullBackup(data) {
    if (!data || typeof data !== 'object' || !data.salesRecords || !data.purchaseRecords || !data.nextCorrelatives) {
        throw new Error("Invalid data structure for full import. Missing key arrays or correlatives.");
    }
    
    appData = { 
        ...defaultData, 
        ...data,
        nextCorrelatives: { ...defaultData.nextCorrelatives, ...data.nextCorrelatives },
        companyInfo: { ...defaultData.companyInfo, ...data.companyInfo }
    };
    ['salesRecords','purchaseRecords','clients','suppliers'].forEach(t => {
        appData[t] = (appData[t] || []).map(r => r?.id ? r : { ...r, id: generateId() });
    });

    saveData();
    console.log("Full data backup restored.");
    return true;
}

// Function to retrieve all stored data
function getAllData() {
    return appData;
}

// Function to get next correlatives
function getNextCorrelatives() {
    return appData.nextCorrelatives;
}

// Function to set next correlatives for sales types
function setSalesCorrelatives(ccfValue, cfValue) {
    let changed = false;
    
    const newCCF = parseInt(ccfValue);
    if (!isNaN(newCCF) && newCCF >= 1) {
        appData.nextCorrelatives.salesCCF = newCCF;
        changed = true;
    }

    const newCF = parseInt(cfValue);
    if (!isNaN(newCF) && newCF >= 1) {
        appData.nextCorrelatives.salesCF = newCF;
        changed = true;
    }
    
    if (changed) {
        saveData();
    }
    return changed;
}

// --- New Company Info Functions ---
function getCompanyInfo() {
    // Ensure the structure exists if loaded data is old
    if (!appData.companyInfo) {
        appData.companyInfo = defaultData.companyInfo;
    }
    return appData.companyInfo;
}

function setCompanyInfo(info) {
    appData.companyInfo = { ...appData.companyInfo, ...info };
    saveData();
    return appData.companyInfo;
}


// --- Specific Logic for Records ---

// Helper function for VAT calculations
function calculateVat(baseAmount) {
    // Ensure baseAmount is a number
    baseAmount = parseFloat(baseAmount) || 0;
    
    // Rounding to 2 decimal places for accounting accuracy
    const vat = baseAmount * VAT_RATE;
    return Math.round(vat * 100) / 100;
}

// Function to register a sale
function addSale(saleData) {
    const isCredit = saleData.documentType === 'CCF';
    saleData.id = saleData.id || generateId();
    saleData.items = Array.isArray(saleData.items) ? saleData.items : [];
    if (isCredit) {
        saleData.correlative = appData.nextCorrelatives.salesCCF++;
        const itemsBase = saleData.items.reduce((s,it)=> s + ((parseFloat(it.qty)||0) * (parseFloat(it.price)||0)), 0);
        const base = itemsBase > 0 ? itemsBase : (parseFloat(saleData.taxableAmount)||0);
        saleData.taxableAmount = Math.round(base*100)/100;
        saleData.exemptAmount = parseFloat(saleData.exemptAmount)||0;
        saleData.ivaDebit = calculateVat(saleData.taxableAmount);
        saleData.total = saleData.taxableAmount + saleData.exemptAmount + saleData.ivaDebit;
    } else { 
        // Consumer Final (CF). saleData.total includes VAT (must be gross total)
        saleData.correlative = appData.nextCorrelatives.salesCF++;
        saleData.total = parseFloat(saleData.total) || 0;

        // Calculate base and VAT from gross total (Total / 1.13 = Base)
        saleData.taxableAmount = Math.round((saleData.total / (1 + VAT_RATE)) * 100) / 100;
        saleData.exemptAmount = 0; 
        saleData.ivaDebit = saleData.total - saleData.taxableAmount; // Derived VAT

        // Handle rounding difference if necessary
        saleData.ivaDebit = Math.round(saleData.ivaDebit * 100) / 100;
    }

    appData.salesRecords.push(saleData);
    saveData();
    return saleData;
}

// Function to register a purchase
function addPurchase(purchaseData) {
    purchaseData.correlative = appData.nextCorrelatives.purchases++;
    purchaseData.id = purchaseData.id || generateId();
    
    purchaseData.taxableAmount = parseFloat(purchaseData.taxableAmount) || 0;
    purchaseData.exemptAmount = parseFloat(purchaseData.exemptAmount) || 0;
    purchaseData.ivaCredit = parseFloat(purchaseData.ivaCredit) || 0; 
    purchaseData.ivaWithheld = parseFloat(purchaseData.ivaWithheld) || 0; 
    
    // Total calculation 
    purchaseData.total = purchaseData.taxableAmount + purchaseData.exemptAmount + purchaseData.ivaCredit - purchaseData.ivaWithheld;

    appData.purchaseRecords.push(purchaseData);
    saveData();
    return purchaseData;
}

// Function to handle bulk import of parsed data
function importBulkData(data) {
    const counts = {
        clients: 0,
        suppliers: 0,
        salesRecords: 0,
        purchaseRecords: 0
    };
    
    const types = ['clients', 'suppliers', 'salesRecords', 'purchaseRecords'];
    
    // We iterate through the raw data structure provided by the parser
    for (const type of types) {
        if (data[type] && Array.isArray(data[type])) {
            let importedCount = 0;
            
            data[type].forEach(record => {
                try {
                    // Note: We use the specific add functions to ensure correlatives and internal calculations are triggered.
                    if (type === 'clients' || type === 'suppliers') {
                        addEntity(type, record);
                        importedCount++;
                    } else if (type === 'salesRecords') {
                        // CF sales calculation relies on 'total'. CCF calculation relies on 'taxableAmount'.
                        // addSale handles this internally based on documentType.
                        addSale(record); 
                        importedCount++;
                    } else if (type === 'purchaseRecords') {
                        addPurchase(record);
                        importedCount++;
                    }
                } catch (e) {
                    console.error(`Error importing record into ${type}:`, record, e);
                    // Continue to next record
                }
            });
            counts[type] = importedCount;
        }
    }
    
    // Save data after all imports
    saveData();
    return counts;
}

export { 
    getAll, 
    addEntity, 
    updateEntity,
    deleteEntity,
    addSale, 
    addPurchase,
    calculateVat,
    VAT_RATE,
    getAllData,
    importBulkData,
    resetData,
    getNextCorrelatives,
    setSalesCorrelatives,
    getCompanyInfo,
    setCompanyInfo,
    importFullBackup
};

/* Helper to generate unique IDs */
function generateId() {
    return Date.now() + Math.random().toString(16).slice(2);
}