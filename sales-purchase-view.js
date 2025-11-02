import { html, nothing } from 'lit-html';
import { getFormData, formatCurrency } from '../utils/form-utils.js';
import { getAll, addSale, addPurchase, calculateVat, VAT_RATE, updateEntity, getNextCorrelatives, deleteEntity } from '../data-store.js';
import { forceRender } from '../router.js';
import { getCompanyInfo } from '../data-store.js';

let recordType = 'salesRecords';
let notification = null;
let editingId = null; // State for tracking inline editing
// NEW: Items state for CCF invoice
let salesItems = [];
// New: Sales list document type filter ('all'|'CCF'|'CF')
let salesDocFilter = 'all';
// NEW: Month filter for sales list ('all' or 1-12)
let salesMonthFilter = 'all';

// --- Confirmation Modal State and Logic ---
let confirmAction = null; // Stores the action to be executed if confirmed
let confirmMessage = null; // Stores the message to display
let confirmRecordId = null; // Stores the ID of the record being deleted

function showConfirmation(message, action, recordId) {
    confirmMessage = message;
    confirmAction = action;
    confirmRecordId = recordId;
    forceRender();
}

function closeConfirmation() {
    confirmMessage = null;
    confirmAction = null;
    confirmRecordId = null;
    forceRender();
}

function handleConfirmExecute() {
    if (confirmAction && confirmRecordId) {
        // Execute the stored action with the record ID
        confirmAction(confirmRecordId);
    }
    closeConfirmation();
}

function ConfirmationModal() {
    if (!confirmMessage) return nothing;

    return html`
        <div class="modal-overlay" @click=${closeConfirmation}>
            <div class="modal-content" @click=${(e) => e.stopPropagation()}>
                <h3>Confirmación de Eliminación</h3>
                <p>${confirmMessage}</p>
                <div class="modal-actions">
                    <button class="cancel-btn" @click=${closeConfirmation} style="background-color: #6c757d;">Cancelar</button>
                    <button @click=${handleConfirmExecute} style="background-color: var(--error-color);">Confirmar Eliminación</button>
                </div>
            </div>
        </div>
    `;
}
// --- END Confirmation Modal Logic ---

function showNotification(message, isSuccess = true) {
    notification = { message, isSuccess };
    // We rely on the calling function (submit/save/cancel handler) to call forceRender 
    // to update the view immediately if structural changes occurred.
    setTimeout(() => {
        notification = null;
        forceRender(); // Clear notification (asynchronous)
    }, 5000);
}

function handleSalesDocFilterChange(e) {
    salesDocFilter = e.target.value;
    forceRender();
}

// NEW: handle month filter change
function handleSalesMonthFilterChange(e) {
    salesMonthFilter = e.target.value;
    forceRender();
}

// --- Editing handlers for Purchases/Sales ---

function handleRecordEdit(e, recordId) {
    e.preventDefault();
    if (editingId !== null) return; 
    editingId = recordId;
    // Force re-render to switch to edit mode
    forceRender(); 
}

function handleRecordCancel(e) {
    e.preventDefault();
    editingId = null;
    // Force re-render to exit edit mode
    forceRender(); 
}

function handleRecordSave(e, recordId) {
    e.preventDefault();
    const row = e.target.closest('tr');   
//    const form = e.target.closest('form');
    let notificationMessage = '';
    let notificationSuccess = false;

    try {
        const isSales = recordType === 'salesRecords';
        const cleanNumber = (v) => parseFloat(String(v || '').replace(/[^0-9.-]/g, '')) || 0;

        // Gather common data
        const documentType = (row.querySelector('[data-field="documentType"]').textContent || '').trim().toUpperCase();
        const newData = {
            date: (row.querySelector('[data-field="date"]').textContent || '').trim(),
            documentType
        };

        if (!newData.date) {
             throw new Error("La Fecha es obligatoria.");
        }

        if (isSales) {
            const isCCF = documentType === 'CCF';
            if (documentType !== 'CCF' && documentType !== 'CF') {
                throw new Error("Tipo de Documento inválido. Use 'CCF' o 'CF'.");
            }
            
            // NEW: Extract description if available in the row
            const descriptionElement = row.querySelector('[data-field="description"]');
            if (descriptionElement) {
                newData.description = descriptionElement.textContent.trim();
            }

            // Sales specific fields extraction
            if (isCCF) {
                newData.clientNrc = (row.querySelector('[data-field="clientNrc"]').textContent || '').trim();
                newData.taxableAmount = cleanNumber(row.querySelector('[data-field="taxableAmount"]').textContent);
                newData.exemptAmount = cleanNumber(row.querySelector('[data-field="exemptAmount"]').textContent);
                
                if (!newData.clientNrc) {
                     throw new Error("El CCF requiere el NRC del cliente.");
                }
                
            } else if (documentType === 'CF') {
                newData.total = cleanNumber(row.querySelector('[data-field="total"]').textContent);
                newData.clientNrc = '';
                // Provide safe placeholders; updateEntity recalculates for CF
                newData.taxableAmount = cleanNumber(row.querySelector('[data-field="taxableAmount"]')?.textContent || 0);
                newData.exemptAmount = 0;

                // Basic validation for CF total (numeric check)
                if (!(newData.total > 0)) {
                    throw new Error("El Monto Total de Venta es obligatorio para CF.");
                }

            } else {
                 throw new Error(`Tipo de Documento inválido para venta: ${documentType}`);
            }
            
            // Update entity. Recalculation happens inside updateEntity based on documentType.
            updateEntity(recordType, recordId, newData);
            notificationMessage = `Registro de venta actualizado exitosamente.`;
            notificationSuccess = true;


        } else if (recordType === 'purchaseRecords') {
            // Existing Purchase logic
            newData.supplierNrc = row.querySelector('[data-field="supplierNrc"]').textContent.trim();
            newData.documentNumber = row.querySelector('[data-field="documentNumber"]').textContent.trim();
            
            // Numeric fields need conversion from string content
            newData.taxableAmount = row.querySelector('[data-field="taxableAmount"]').textContent.trim();
            newData.exemptAmount = row.querySelector('[data-field="exemptAmount"]').textContent.trim();
            newData.ivaCredit = row.querySelector('[data-field="ivaCredit"]').textContent.trim();
            newData.ivaWithheld = row.querySelector('[data-field="ivaWithheld"]').textContent.trim();
        
            if (!newData.date || !newData.documentNumber || !newData.supplierNrc) {
                 throw new Error("Fecha, NRC Proveedor y Número de Documento son obligatorios.");
            }

            // updateEntity will handle float conversion and recalculating the 'total' for purchaseRecords
            updateEntity(recordType, recordId, newData);
            notificationMessage = `Registro de compra actualizado exitosamente.`;
            notificationSuccess = true;

        } else {
            throw new Error("Tipo de registro desconocido.");
        }


    } catch (error) {
        console.error("Error during record update:", error);
        notificationMessage = `Error al actualizar el registro: ${error.message}`;
        notificationSuccess = false;
    } finally {
        editingId = null; // Exit edit mode
        
        // Set notification state and schedule clear
        showNotification(notificationMessage, notificationSuccess);
        
        // Force re-render to update list/exit edit mode AND display notification
        forceRender(); 
    }
}

// --- NEW Delete handler ---
function handleRecordDelete(e, recordId) {
    e.preventDefault();
    const isSales = recordType === 'salesRecords';
    
    const record = getAll(recordType).find(r => r.id === recordId);
    if (!record) return;

    const docType = isSales ? (record.documentType || 'Documento de Venta') : 'Documento de Compra';
    const correlative = record.correlative || 'N/A';
    
    const message = `ADVERTENCIA: ¿Está seguro de eliminar el registro de ${docType} (Correlativo Interno: ${correlative})? Esta acción no se puede deshacer y afectará los informes.`;

    showConfirmation(message, (id) => {
        const success = deleteEntity(recordType, id);
        
        if (success) {
            showNotification(`Registro de ${docType} eliminado exitosamente.`, true);
        } else {
            showNotification(`Error: No se pudo encontrar o eliminar el registro.`, false);
        }
        // Force render to update the list immediately after deletion
        forceRender();
    }, recordId);


}

// --- PRINT TICKET FOR SALES ---
function handlePrintTicket(e){
    e.preventDefault();
    const f=e.target.form||document.querySelector('form');
    if(!f)return;
    const info=getCompanyInfo(),doc=f.querySelector('#documentType')?.value||'CCF',cor=getNextCorrelatives()[doc==='CCF'?'salesCCF':'salesCF'],date=f.querySelector('#date')?.value||new Date().toISOString().substring(0,10),clientNrc=f.querySelector('#clientNrc')?.value||'',desc=f.querySelector('#description')?.value||'',tax=parseFloat(f.querySelector('#taxableAmount')?.value)||0,exe=parseFloat(f.querySelector('#exemptAmount')?.value)||0,totCF=parseFloat(f.querySelector('#total')?.value)||0;
    // --- lookup client name to show under NRC ---
    let clientName = '';
    if (clientNrc) {
        try {
            const clients = getAll('clients') || [];
            const cl = clients.find(c => c.nrc === clientNrc);
            clientName = cl ? cl.name : '';
        } catch (err) {
            clientName = '';
        }
    }
    let base=tax,iva=calculateVat(base),tot=tax+exe+iva;
    if(doc==='CF'){tot=totCF;base=Math.round((tot/(1+VAT_RATE))*100)/100;iva=Math.round((tot-base)*100)/100;}
    const title=`Ticket_${doc}_${cor}`;
    const w=window.open('','TICKET','width=380,height=640');
    const css='body{font-family:"Noto Sans",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:12px;color:#333} .h{font-weight:700;text-align:center;margin-bottom:8px} .s{font-size:.9em;color:#555} hr{border:0;border-top:1px dashed #999;margin:10px 0} .r{display:flex;justify-content:space-between;margin:4px 0} button{background:#333;color:#fff;border:0;border-radius:4px;padding:8px 12px;cursor:pointer} .c{text-align:center;margin-top:12px}';
    const ivals=doc==='CF'?'':`<div class="r"><span>Subtotal</span><span>$${base.toFixed(2)}</span></div><div class="r"><span>IVA (13%)</span><span>$${iva.toFixed(2)}</span></div>`;
    const client=clientNrc?`<div class="s">Cliente NRC: ${clientNrc}</div>${clientName?`<div class="s">Nombre: ${clientName}</div>`:''}`:'';
    const descr=desc?`<div class="s">Detalle: ${desc}</div>`:'';
    const itemsHtml = salesItems.length? `<hr><div class="s">Ítems</div>${salesItems.map(it=>`<div class="r"><span>${it.qty} x ${it.desc}</span><span>$${(it.price*it.qty).toFixed(2)}</span></div>`).join('')}`:'';
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap" rel="stylesheet"><style>${css}</style></head><body><div class="h">${doc} N° ${cor}</div><div class="s" style="text-align:center">${info.name||''}</div><div class="s" style="text-align:center">${info.activity||''}</div><div class="s" style="text-align:center">${info.address||''}</div><div class="s" style="text-align:center">NIT: ${info.nit||''}  NRC: ${info.nrc||''}  Tel: ${info.phone||''}</div><hr><div class="s">Fecha: ${date}</div>${client}${descr}${itemsHtml}<hr>${ivals}<div class="r"><span>Total ${doc==='CF'?'(c/ IVA)':''}</span><span>$${tot.toFixed(2)}</span></div><div class="c"><button onclick="window.print()">Guardar PDF</button></div></body></html>`);
    w.document.close();
    w.focus();
}

// --- SALES VIEW ---

function handleSalesSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = getFormData(form);
    
    let notificationMessage = '';
    let notificationSuccess = false;

    try {
        if (data.documentType === 'CCF' && !data.clientNrc) {
             throw new Error("El CCF requiere el NRC del cliente.");
        }
        
        // Ensure quantity is numeric for CF entries
        if (data.documentType === 'CF') {
            data.quantity = parseInt(form.querySelector('#quantity')?.value) || 0;
        }
        
        // Before saving, ensure calculated fields are captured if using CF
        if (data.documentType === 'CF') {
            const total = data.total || 0;
            data.taxableAmount = Math.round((total / (1 + VAT_RATE)) * 100) / 100;
            data.ivaDebit = Math.round((total - data.taxableAmount) * 100) / 100;
        } else {
            // CCF: base from items if present
            const base = salesItems.reduce((s, it)=> s + (it.qty * it.price), 0);
            data.taxableAmount = Math.round(base*100)/100;
            data.exemptAmount = parseFloat(data.exemptAmount)||0;
            data.ivaDebit = calculateVat(data.taxableAmount);
            data.total = data.taxableAmount + data.exemptAmount + data.ivaDebit;
        }

        // Build items for saving: for CCF use salesItems, for CF create single item preserving qty & desc
        let itemsToSave = [];
        if (data.documentType === 'CCF') {
            itemsToSave = salesItems.slice();
        } else {
            // For CF, create one item so CF is stored in items field similar to CCF
            const qty = data.quantity > 0 ? data.quantity : 1;
            // Derive unit price from taxable base (prefer base without IVA) distributed by quantity
            const unitPrice = Math.round(((data.taxableAmount || 0) / qty) * 100) / 100;
            itemsToSave = [{ qty, desc: data.description || '', price: unitPrice }];
        }

        const newSale = addSale({
            ...data,
            items: itemsToSave,
            // Append quantity to description for CF for clarity
            description: (data.description || (salesItems[0]?.desc || '')) + (data.quantity ? ` (Cant: ${data.quantity})` : ''),
            date: data.date || new Date().toISOString().substring(0, 10)
        });
        
        notificationMessage = `Venta registrada exitosamente. Documento CCF/CF correlativo #${newSale.correlative}`;
        notificationSuccess = true;

        form.reset();
        salesItems = [];
        
        // Reset dynamic displays
        if (document.getElementById('ivaDebitDisplay')) document.getElementById('ivaDebitDisplay').value = formatCurrency(0);
        if (document.getElementById('totalDisplay')) document.getElementById('totalDisplay').value = formatCurrency(0);
        if (document.getElementById('ivaDebitDisplayCF')) document.getElementById('ivaDebitDisplayCF').value = formatCurrency(0);
        if (document.getElementById('taxableAmountDisplayCF')) document.getElementById('taxableAmountDisplayCF').value = formatCurrency(0);


    } catch (error) {
        console.error(error);
        notificationMessage = `Error al registrar la venta: ${error.message}`;
        notificationSuccess = false;
    } finally {
        // Set notification state and schedule clear
        showNotification(notificationMessage, notificationSuccess);
        
        // Force re-render to update the list and display notification
        forceRender(); 
    }
}

function calculateSalesCCF(e) {
    const form = e.target.closest('form');
    if (!form || form.querySelector('#documentType')?.value !== 'CCF') return;
    // Prefer items-driven calc
    if (salesItems.length) { recalcFromItems(); return; }
    const taxableAmount = parseFloat(form.querySelector('#taxableAmount').value) || 0;
    const exemptAmount = parseFloat(form.querySelector('#exemptAmount').value) || 0;
    
    const ivaDebit = calculateVat(taxableAmount);
    const total = taxableAmount + exemptAmount + ivaDebit;

    form.querySelector('#ivaDebitDisplay').value = formatCurrency(ivaDebit);
    form.querySelector('#totalDisplay').value = formatCurrency(total);
    // Update hidden fields for submission
    form.querySelector('input[name="ivaDebit"]').value = ivaDebit.toFixed(2);
    form.querySelector('input[name="total"]').value = total.toFixed(2);
}

function calculateSalesCF(e) {
    const form = e.target.closest('form');
    if (!form || form.querySelector('#documentType')?.value !== 'CF') return;

    const total = parseFloat(form.querySelector('#total').value) || 0;
    
    // Total / 1.13 = Base. Total - Base = IVA
    const taxableAmount = Math.round((total / (1 + VAT_RATE)) * 100) / 100;
    const ivaDebit = Math.round((total - taxableAmount) * 100) / 100;

    form.querySelector('#ivaDebitDisplayCF').value = formatCurrency(ivaDebit);
    form.querySelector('#taxableAmountDisplayCF').value = formatCurrency(taxableAmount);
    // Update hidden fields for submission
    form.querySelector('input[name="taxableAmount"]').value = taxableAmount.toFixed(2);
    form.querySelector('input[name="ivaDebit"]').value = ivaDebit.toFixed(2);
    
    // Total input already contains the gross total
}

function addItem() { salesItems.push({ qty: 1, desc: '', price: 0 }); forceRender(); }
function removeItem(i) { salesItems.splice(i,1); recalcFromItems(); forceRender(); }
function updateItem(i, field, value) { const it=salesItems[i]; it[field]=field==='desc'?value:parseFloat(value)||0; recalcFromItems(); }
function recalcFromItems() {
    const base = salesItems.reduce((s, it) => s + (it.qty * it.price), 0);
    const form = document.querySelector('#sales-form');
    if (!form) return;
    const taxable = form.querySelector('#taxableAmount'); const exempt = form.querySelector('#exemptAmount');
    if (taxable) taxable.value = base.toFixed(2);
    if (exempt) exempt.value = (parseFloat(exempt.value)||0).toFixed(2);
    const iva = calculateVat(base);
    const total = base + (parseFloat(exempt?.value)||0) + iva;
    form.querySelector('#ivaDebitDisplay').value = formatCurrency(iva);
    form.querySelector('#totalDisplay').value = formatCurrency(total);
    form.querySelector('input[name="ivaDebit"]').value = iva.toFixed(2);
    form.querySelector('input[name="total"]').value = total.toFixed(2);
}

function SalesForm() {
    const clients = getAll('clients');
    const correlatives = getNextCorrelatives(); // Get current correlatives
    const currentDocType = document.getElementById('documentType')?.value || 'CCF';
    
    // Determine the correlative to display
    const nextCorrelative = currentDocType === 'CCF' ? correlatives.salesCCF : correlatives.salesCF;

    return html`
        <div class="card">
            <h3>Registro de Ventas</h3>
            <form id="sales-form" @submit=${handleSalesSubmit} @input=${(e) => { 
                if (e.target.id === 'documentType') { 
                    forceRender(); // Re-render to show correct fields and update correlative display
                } else if (currentDocType === 'CCF') {
                    calculateSalesCCF(e);
                } else if (currentDocType === 'CF') {
                    calculateSalesCF(e);
                }
            }}>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                    <div class="form-group">
                        <label for="date">Fecha de Documento</label>
                        <input type="date" id="date" name="date" required value=${new Date().toISOString().substring(0, 10)}>
                    </div>
                    
                    <div class="form-group">
                        <label for="documentType">Tipo de Documento</label>
                        <select id="documentType" name="documentType" required>
                            <option value="CCF" ?selected=${currentDocType === 'CCF'}>Factura de Crédito Fiscal (CCF)</option>
                            <option value="CF" ?selected=${currentDocType === 'CF'}>Comprobante de Venta a Consumidor Final (CF)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="correlativeDisplay">N° Comprobante (Siguiente)</label>
                        <input type="text" id="correlativeDisplay" disabled value="${nextCorrelative}">
                    </div>
                </div>
                
                ${currentDocType === 'CCF' ? html`
                    <!-- CCF Details -->
                    <p style="font-weight: bold; margin-bottom: 10px; margin-top: 5px;">Detalles CCF</p>
                    <div class="form-group">
                        <label for="clientNrc">Cliente (NRC)</label>
                        <select id="clientNrc" name="clientNrc" required>
                            <option value="">Seleccione Cliente (Debe tener NRC)</option>
                            ${clients.filter(c => c.nrc).map(client => html`
                                <option value="${client.nrc}">${client.name} (NRC: ${client.nrc})</option>
                            `)}
                        </select>
                    </div>
                    
                    <!-- NEW FIELD: Description -->
                    <div class="form-group">
                        <label for="description">Detalle de la venta o Descripción del servicio</label>
                        <textarea id="description" name="description" rows="2" required></textarea>
                    </div>

                    <div class="card" style="margin-bottom:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong>Ítems de la Factura</strong>
                            <button type="button" @click=${addItem}>Agregar Ítem</button>
                        </div>
                        ${salesItems.length ? html`
                            <table class="data-table">
                                <thead><tr><th>Cant.</th><th>Descripción</th><th>Precio Unit.</th><th>Total</th><th></th></tr></thead>
                                <tbody>
                                    ${salesItems.map((it,i)=>html`
                                        <tr>
                                            <td><input type="number" min="1" step="1" value="${it.qty}" @input=${(e)=>updateItem(i,'qty',e.target.value)}></td>
                                            <td><input type="text" value="${it.desc}" @input=${(e)=>updateItem(i,'desc',e.target.value)}></td>
                                            <td><input type="number" step="0.01" value="${it.price}" @input=${(e)=>updateItem(i,'price',e.target.value)}></td>
                                            <td class="numeric-cell">${formatCurrency(it.qty*it.price)}</td>
                                            <td><button type="button" class="cancel-btn" @click=${()=>removeItem(i)} style="background-color: var(--error-color);">Quitar</button></td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        ` : html`<p style="color:#666; font-size:.9em;">Agrega ítems para calcular automáticamente la Venta Gravada e IVA.</p>`}
                    </div>

                    <div class="dashboard-grid" style="grid-template-columns: 1fr 1fr;">
                        <div class="form-group">
                            <label for="taxableAmount">Venta Gravada (autocalculada)</label>
                            <input type="number" id="taxableAmount" name="taxableAmount" step="0.01" value="0.00" readonly>
                        </div>
                        <div class="form-group">
                            <label for="exemptAmount">Venta Exenta</label>
                            <input type="number" id="exemptAmount" name="exemptAmount" step="0.01" value="0.00">
                        </div>
                    </div>

                    <div class="dashboard-grid" style="grid-template-columns: 1fr 1fr;">
                        <div class="form-group">
                            <label>IVA Débito Fiscal (13%)</label>
                            <input type="text" id="ivaDebitDisplay" disabled value="${formatCurrency(0)}">
                        </div>
                        <div class="form-group">
                            <label>TOTAL DOCUMENTO</label>
                            <input type="text" id="totalDisplay" disabled value="${formatCurrency(0)}">
                        </div>
                    </div>
                    <!-- Hidden fields for final calculation storage -->
                    <input type="hidden" name="total" value="0"> 
                    <input type="hidden" name="ivaDebit" value="0">

                ` : html`
                    <!-- CF Details -->
                    <p style="font-weight: bold; margin-bottom: 10px; margin-top: 5px;">Detalles Consumidor Final</p>
                    <div style="display: grid; grid-template-columns: 120px 2fr 1fr; gap: 15px; align-items: start;">
                        <div class="form-group" style="margin-bottom:0;">
                            <label for="quantity">Cantidad</label>
                            <input type="number" id="quantity" name="quantity" min="1" step="1" value="1" required>
                        </div>
                        <div class="form-group" style="margin-bottom:0;">
                            <label for="description">Detalle de la venta o Descripción del servicio</label>
                            <textarea id="description" name="description" rows="2" placeholder="Descripción breve..." required></textarea>
                        </div>
                        <div class="form-group" style="margin-bottom:0;">
                            <label for="total">Monto Total de la Venta (Incluye IVA)</label>
                            <input type="number" id="total" name="total" step="0.01" value="0.00" @input=${calculateSalesCF} required>
                        </div>
                    </div>
                    
                    <div class="dashboard-grid" style="grid-template-columns: 1fr 1fr;">
                        <div class="form-group">
                            <label>Base Imponible Calculada</label>
                            <input type="text" id="taxableAmountDisplayCF" disabled value="${formatCurrency(0)}">
                            <input type="hidden" name="taxableAmount" value="0">
                            <input type="hidden" name="exemptAmount" value="0">
                        </div>
                        <div class="form-group">
                            <label>IVA Débito Fiscal Calculado</label>
                            <input type="text" id="ivaDebitDisplayCF" disabled value="${formatCurrency(0)}">
                            <input type="hidden" name="ivaDebit" value="0">
                        </div>
                    </div>
                `}
                
                <div style="display:flex; gap:10px; margin-top: 10px;">
                    <button type="submit">Registrar Venta</button>
                    <button type="button" @click=${handlePrintTicket} style="background-color:#444;">Imprimir Ticket</button>
                </div>
            </form>
        </div>
    `;
}

// --- PURCHASE VIEW ---

function handlePurchaseSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = getFormData(form);
    
    let notificationMessage = '';
    let notificationSuccess = false;

    try {
        if (!data.supplierNrc) {
             throw new Error("El registro de compra requiere el NRC del proveedor.");
        }
        
        // Before saving, calculate total based on inputs
        // --- Ensure IVA Crédito is calculated as 13% of Compra Gravada when not provided ---
        data.taxableAmount = parseFloat(data.taxableAmount) || 0;
        data.exemptAmount = parseFloat(data.exemptAmount) || 0;
        data.ivaCredit = parseFloat(data.ivaCredit) || 0;
        data.ivaWithheld = parseFloat(data.ivaWithheld) || 0;

        if (!data.ivaCredit || data.ivaCredit === 0) {
            data.ivaCredit = calculateVat(data.taxableAmount);
        }

        const totalCalculated = (data.taxableAmount || 0) + (data.exemptAmount || 0) + (data.ivaCredit || 0) - (data.ivaWithheld || 0);
        data.total = totalCalculated;

        const newPurchase = addPurchase({
            ...data,
            date: data.date || new Date().toISOString().substring(0, 10)
        });
        
        notificationMessage = `Compra registrada exitosamente. Documento correlativo interno #${newPurchase.correlative}`;
        notificationSuccess = true;

        form.reset();
        
        document.getElementById('taxableAmountP').value = 0.00;
        document.getElementById('exemptAmountP').value = 0.00;
        document.getElementById('ivaCreditP').value = 0.00;
        document.getElementById('ivaWithheldP').value = 0.00;
        document.getElementById('totalDisplayP').value = formatCurrency(0);


    } catch (error) {
        console.error(error);
        notificationMessage = `Error al registrar la compra: ${error.message}`;
        notificationSuccess = false;
    } finally {
        // Set notification state and schedule clear
        showNotification(notificationMessage, notificationSuccess);
        
        // Force re-render to update the list and display notification
        forceRender(); 
    }
}

function calculatePurchaseTotal(e) {
    const form = e.target.closest('form');
    if (!form) return;

    const taxableAmount = parseFloat(form.querySelector('#taxableAmountP').value) || 0;
    const exemptAmount = parseFloat(form.querySelector('#exemptAmountP').value) || 0;
    // Always calculate IVA Crédito from la Base Gravada (13%) to ensure correct fiscal amount,
    // rounding to 2 decimals for accounting accuracy.
    let ivaCredit = calculateVat(taxableAmount);
    const ivaWithheld = parseFloat(form.querySelector('#ivaWithheldP').value) || 0;

    // Suggest default IVA credit if taxable is changed and IVA is zero
    // Update IVA Crédito input to reflect the calculated value
    form.querySelector('#ivaCreditP').value = ivaCredit.toFixed(2);
    
    const total = taxableAmount + exemptAmount + ivaCredit - ivaWithheld;

    form.querySelector('#totalDisplayP').value = formatCurrency(total);
    form.querySelector('input[name="total"]').value = total.toFixed(2);
}


function PurchaseForm() {
    const suppliers = getAll('suppliers');
    
    return html`
        <div class="card">
            <h3>Registro de Compras (Crédito Fiscal)</h3>
            <form @submit=${handlePurchaseSubmit} @input=${calculatePurchaseTotal}>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <!-- Row 1: Date and Document Type -->
                    <div class="form-group">
                        <label for="date">Fecha de Documento</label>
                        <input type="date" id="dateP" name="date" required value=${new Date().toISOString().substring(0, 10)}>
                    </div>
                    
                    <div class="form-group">
                        <label for="documentTypeP">Tipo de Documento Recibido</label>
                        <select id="documentTypeP" name="documentType" required>
                            <option value="CCF">Comprobante de Crédito Fiscal (CCF)</option>
                            <option value="Importacion">Documento Único de Importación (DUI)</option>
                            <option value="Otros">Otros Documentos Legales</option>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <!-- Row 2: Supplier NRC and Document Number -->
                    <div class="form-group">
                        <label for="supplierNrc">Proveedor (NRC)</label>
                        <select id="supplierNrc" name="supplierNrc" required>
                            <option value="">Seleccione Proveedor (Debe tener NRC)</option>
                            ${suppliers.filter(s => s.nrc).map(supplier => html`
                                <option value="${supplier.nrc}">${supplier.name} (NRC: ${supplier.nrc})</option>
                            `)}
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="documentNumberP">Número de Documento del Proveedor</label>
                        <input type="text" id="documentNumberP" name="documentNumber" required>
                    </div>
                </div>

                <p style="font-weight: bold; margin-bottom: 10px; margin-top: 15px;">Montos</p>
                
                <div class="dashboard-grid" style="grid-template-columns: repeat(2, 1fr);">
                    <div class="form-group">
                        <label for="taxableAmountP">Compra Gravada (Base Imponible)</label>
                        <input type="number" id="taxableAmountP" name="taxableAmount" step="0.01" value="0.00" required>
                    </div>
                    <div class="form-group">
                        <label for="exemptAmountP">Compra Exenta</label>
                        <input type="number" id="exemptAmountP" name="exemptAmount" step="0.01" value="0.00" required>
                    </div>
                </div>

                <div class="dashboard-grid" style="grid-template-columns: repeat(3, 1fr);">
                    <div class="form-group">
                        <label for="ivaCreditP">IVA Crédito Fiscal</label>
                        <input type="number" id="ivaCreditP" name="ivaCredit" step="0.01" value="0.00" required>
                    </div>
                    <div class="form-group">
                        <label for="ivaWithheldP">Retención de IVA (2%)</label>
                        <input type="number" id="ivaWithheldP" name="ivaWithheld" step="0.01" value="0.00">
                    </div>
                    <div class="form-group">
                        <label>TOTAL DOCUMENTO</label>
                        <input type="text" id="totalDisplayP" disabled value="${formatCurrency(0)}">
                        <input type="hidden" name="total" value="0">
                    </div>
                </div>

                <button type="submit" style="margin-top: 10px;">Registrar Compra</button>
            </form>
        </div>
    `;
}

// --- LIST VIEWS ---

function RecordListView(records, isSales) {
    if (records.length === 0) {
        return html`<p>No hay ${isSales ? 'ventas' : 'compras'} registradas.</p>`;
    }

    if (isSales) {
        // Sales Table Headers - MAKE EDITABLE
        return html`
            <table class="data-table editable-table">
                <thead>
                    <tr>
                        <th>Correlativo Int.</th>
                        <th>Fecha</th>
                        <th>Tipo Doc.</th>
                        <th>NRC Cliente</th>
                        <th>Ítems</th>
                        <th>Detalle Venta</th>
                        <th>Gravado</th>
                        <th>Exento</th>
                        <th>IVA Débito</th>
                        <th>Total</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map(record => {
                        const isEditing = record.id === editingId;
                        const isCCF = record.documentType === 'CCF';
                        const items = record.items || [];
                        return html`
                        <tr>
                            <td>${record.correlative}</td>
                            <td data-field="date" contenteditable=${isEditing}>${record.date}</td>
                            <td data-field="documentType" contenteditable=${isEditing} title="CCF o CF">${record.documentType}</td>
                            <td data-field="clientNrc" contenteditable=${isEditing && isCCF}>${record.clientNrc || 'N/A (CF)'}</td>
                            <td>${items.length}</td>
                            <td data-field="description" contenteditable=${isEditing} class="description-cell" title="Detalle de la Venta">
                                ${record.description || (items.length ? items.map(it=>`${it.qty} x ${it.desc} — ${formatCurrency(it.price*it.qty)}`).join(' | ') : '')}
                            </td>
                            <td data-field="taxableAmount" contenteditable=${isEditing && isCCF} class="numeric-cell" title=${isCCF ? 'Editable' : 'Derivado de Total'}>${formatCurrency(record.taxableAmount, false)}</td>
                            <td data-field="exemptAmount" contenteditable=${isEditing && isCCF} class="numeric-cell" title=${isCCF ? 'Editable' : 'Siempre 0.00'}>${formatCurrency(record.exemptAmount, false)}</td>
                            <td class="numeric-cell">${formatCurrency(record.ivaDebit)}</td>
                            <td data-field="total" contenteditable=${isEditing && !isCCF} class="numeric-cell" title=${!isCCF ? 'Editable (CF Bruto)' : 'Derivado de Gravado/Exento/IVA'}>${formatCurrency(record.total, false)}</td>
                            <td>
                                ${isEditing 
                                    ? html`<button class="save-btn" @click=${(e) => handleRecordSave(e, record.id)}>Guardar</button>
                                           <button class="cancel-btn" @click=${handleRecordCancel} style="background-color: var(--error-color);">Cancelar</button>`
                                    : html`<button class="action-icon-btn" @click=${() => printTicketForRecord(record.id)} title="Imprimir Ticket">🖨️</button>
                                           <button class="edit-btn action-icon-btn" @click=${(e) => handleRecordEdit(e, record.id)} ?disabled=${editingId !== null} title="Editar">&#x270E;</button>
                                           <button class="delete-btn action-icon-btn" @click=${(e) => handleRecordDelete(e, record.id)} ?disabled=${editingId !== null} title="Eliminar">&#x274C;</button>`
                                }
                            </td>
                        </tr>
                        `;
                    })}
                </tbody>
            </table>
        `;
    } else {
        // Purchase Table Headers - MAKE EDITABLE
        return html`
            <table class="data-table editable-table">
                <thead>
                    <tr>
                        <th>Correlativo Int.</th>
                        <th>Fecha</th>
                        <th>Tipo Doc.</th>
                        <th>NRC Prov.</th>
                        <th>Num. Doc.</th>
                        <th>Gravado</th>
                        <th>Exento</th>
                        <th>IVA Crédito</th>
                        <th>Retención</th>
                        <th>Total</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map(record => {
                        const isEditing = record.id === editingId;
                        
                        return html`
                        <tr>
                            <td>${record.correlative}</td>
                            <td data-field="date" contenteditable=${isEditing}>${record.date}</td>
                            <td data-field="documentType" contenteditable=${isEditing}>${record.documentType}</td>
                            <td data-field="supplierNrc" contenteditable=${isEditing}>${record.supplierNrc}</td>
                            <td data-field="documentNumber" contenteditable=${isEditing}>${record.documentNumber}</td>
                            
                            <!-- Displaying raw numbers for easier editing, mandatory numeric inputs on save -->
                            <td data-field="taxableAmount" contenteditable=${isEditing} class="numeric-cell">${formatCurrency(record.taxableAmount, false)}</td>
                            <td data-field="exemptAmount" contenteditable=${isEditing} class="numeric-cell">${formatCurrency(record.exemptAmount, false)}</td>
                            <td data-field="ivaCredit" contenteditable=${isEditing} class="numeric-cell">${formatCurrency(record.ivaCredit, false)}</td>
                            <td data-field="ivaWithheld" contenteditable=${isEditing} class="numeric-cell">${formatCurrency(record.ivaWithheld, false)}</td>
                            
                            <td class="numeric-cell">${formatCurrency(record.total)}</td>
                            
                            <td>
                                ${isEditing 
                                    ? html`
                                        <button class="save-btn" @click=${(e) => handleRecordSave(e, record.id)}>Guardar</button>
                                        <button class="cancel-btn" @click=${handleRecordCancel} style="background-color: var(--error-color);">Cancelar</button>
                                    `
                                    : html`
                                        <button class="edit-btn action-icon-btn" @click=${(e) => handleRecordEdit(e, record.id)} ?disabled=${editingId !== null} title="Editar">&#x270E;</button>
                                        <button class="delete-btn action-icon-btn" @click=${(e) => handleRecordDelete(e, record.id)} ?disabled=${editingId !== null} title="Eliminar">&#x274C;</button>
                                    `
                                }
                            </td>
                        </tr>
                    `;})}
                </tbody>
            </table>
        `;
    }
}


// NEW: local date parser (same behavior as other views)
function parseLocalDate(dateStr) {
    if (!dateStr) return new Date(NaN);
    if (dateStr instanceof Date) return dateStr;
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length >= 3) {
        const [y, m, d] = parts.map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    return new Date(dateStr);
}

export function RecordsView(type) {
    recordType = type;
    const isSales = recordType === 'salesRecords';
    // For sales show by internal correlativo order (ascending). For purchases keep newest-first by date.
    const records = getAll(recordType).slice().sort((a, b) => {
        if (isSales) {
            // Correlativos may be numeric; coerce safely and sort ascending
            const ca = Number(a.correlative) || 0;
            const cb = Number(b.correlative) || 0;
            return ca - cb;
        }
        // Purchases: sort by internal correlativo DESCENDING for logical sequence (new)
        const pa = Number(a.correlative) || 0;
        const pb = Number(b.correlative) || 0;
        return pb - pa;
    });
    const title = isSales ? 'Control de Ventas' : 'Control de Compras';

    // Apply document type filter for sales list if active
    const filteredRecords = (isSales && salesDocFilter && salesDocFilter !== 'all')
        ? records.filter(r => (r.documentType || '').toUpperCase() === salesDocFilter)
        : records;

    // NEW: Apply month filter after other filters (if a specific month is selected)
    const filteredRecordsByMonth = (isSales && salesMonthFilter && salesMonthFilter !== 'all')
        ? filteredRecords.filter(r => {
            const d = parseLocalDate(r.date);
            // compare month in local timezone: getMonth() + 1
            return (d.getMonth() + 1) === parseInt(salesMonthFilter);
        })
        : filteredRecords;

    return html`
        ${ConfirmationModal()}
        <h2>${title}</h2>

        ${notification ? html`
            <div class="message ${notification.isSuccess ? 'success' : 'error'}">
                ${notification.message}
            </div>
        ` : nothing}

        ${isSales ? SalesForm() : PurchaseForm()}

        ${isSales ? html`
            <div style="display:flex; gap:12px; align-items:center; margin-top:18px;">
                <label style="font-weight:700;">Filtrar por Tipo de Documento:</label>
                <select @change=${handleSalesDocFilterChange} aria-label="Filtrar Tipo Documento">
                    <option value="all" ?selected=${salesDocFilter === 'all'}>Todos</option>
                    <option value="CCF" ?selected=${salesDocFilter === 'CCF'}>CCF</option>
                    <option value="CF" ?selected=${salesDocFilter === 'CF'}>CF</option>
                </select>

                <!-- NEW: Month filter -->
                <label style="font-weight:700; margin-left:12px;">Filtrar por Mes:</label>
                <select @change=${handleSalesMonthFilterChange} aria-label="Filtrar Mes">
                    <option value="all" ?selected=${salesMonthFilter === 'all'}>Todos</option>
                    ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => html`
                        <option value="${m}" ?selected=${String(m) === String(salesMonthFilter)}>${m}</option>
                    `)}
                </select>
            </div>
            
            <div class="card" style="margin-top: 12px;">
                <h3>Listado de ${title}</h3>
                ${RecordListView(filteredRecordsByMonth, isSales)}
            </div>
        ` : html`
            <div class="card" style="margin-top: 20px;">
                <h3>Listado de ${title}</h3>
                ${RecordListView(filteredRecords, isSales)}
            </div>
        `}
    `;
}

function printTicketForRecord(recordId){
    const r=getAll(recordType).find(x=>x.id===recordId); if(!r)return; const info=getCompanyInfo(); const doc=r.documentType||'CCF',cor=r.correlative||'',date=r.date||new Date().toISOString().substring(0,10),clientNrc=r.clientNrc||'',desc=r.description||'',items=r.items||[]; 
    // --- lookup client name to show under NRC ---
    let clientName = '';
    if (clientNrc) {
        try {
            const clients = getAll('clients') || [];
            const cl = clients.find(c => c.nrc === clientNrc);
            clientName = cl ? cl.name : '';
        } catch (err) {
            clientName = '';
        }
    }
    // Ensure local pieces are created in the correct order and avoid using uninitialized variables
    let total = parseFloat(r.total) || 0;
    let base = parseFloat(r.taxableAmount) || 0;
    let iva = parseFloat(r.ivaDebit) || 0;
    if (doc === 'CF') {
        base = Math.round((total / (1 + VAT_RATE)) * 100) / 100;
        iva = Math.round((total - base) * 100) / 100;
    }
    const w = window.open('', 'TICKET', 'width=380,height=640');
    const css = 'body{font-family:"Noto Sans",system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:12px;color:#333} .h{font-weight:700;text-align:center;margin-bottom:8px} .s{font-size:.9em;color:#555} hr{border:0;border-top:1px dashed #999;margin:10px 0} .r{display:flex;justify-content:space-between;margin:4px 0} button{background:#333;color:#fff;border:0;border-radius:4px;padding:8px 12px;cursor:pointer} .c{text-align:center;margin-top:12px}';
    const ivals = doc === 'CF' ? '' : `<div class="r"><span>Subtotal</span><span>$${base.toFixed(2)}</span></div><div class="r"><span>IVA (13%)</span><span>$${iva.toFixed(2)}</span></div>`;
    const client = clientNrc ? `<div class="s">Cliente NRC: ${clientNrc}</div>${clientName ? `<div class="s">Nombre: ${clientName}</div>` : ''}` : '';
    const descrHtml = desc ? `<div class="s">Detalle: ${desc}</div>` : '';
    const itemsHtml = items.length ? `<hr><div class="s">Ítems</div>${items.map(it => `<div class="r"><span>${it.qty} x ${it.desc}</span><span>$${(it.price * it.qty).toFixed(2)}</span></div>`).join('')}` : '';
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket_${doc}_${cor}</title><link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap" rel="stylesheet"><style>${css}</style></head><body><div class="h">${doc} N° ${cor}</div><div class="s" style="text-align:center">${info.name||''}</div><div class="s" style="text-align:center">${info.activity||''}</div><div class="s" style="text-align:center">${info.address||''}</div><div class="s" style="text-align:center">NIT: ${info.nit||''}  NRC: ${info.nrc||''}  Tel: ${info.phone||''}</div><hr><div class="s">Fecha: ${date}</div>${client}${descrHtml}${itemsHtml}<hr>${ivals}<div class="r"><span>Total ${doc==='CF'?'(c/ IVA)':''}</span><span>$${total.toFixed(2)}</span></div><div class="c"><button onclick="window.print()">Guardar PDF</button></div></body></html>`);
    w.document.close();
    w.focus();
}