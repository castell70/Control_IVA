import { html } from 'lit-html';
import { getAll, VAT_RATE } from '../data-store.js';
import { formatCurrency } from '../utils/form-utils.js';
import { forceRender } from '../router.js';

let selectedMonth = new Date().getMonth() + 1;
let selectedYear = new Date().getFullYear();
let reportType = 'sales'; // 'sales' or 'purchases'

// NEW: robust local date parser to avoid timezone conversion issues
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

function handlePeriodChange(e) {
    if (e.target.id === 'reportMonth') {
        selectedMonth = parseInt(e.target.value);
    } else if (e.target.id === 'reportYear') {
        selectedYear = parseInt(e.target.value);
    } else if (e.target.id === 'reportType') {
        reportType = e.target.value;
    }
    // Force re-render of reports
    forceRender();
}

function filterRecordsByPeriod(records) {
    return records.filter(record => {
        const date = parseLocalDate(record.date);
        // Ensure date parsing works correctly (Dates are stored YYYY-MM-DD)
        // Use local month (getMonth) to be consistent with other views and avoid timezone shifts
        return date.getMonth() + 1 === selectedMonth && date.getFullYear() === selectedYear;
    }).sort((a, b) => {
        // Use parsed local dates for stable ordering
        return parseLocalDate(a.date) - parseLocalDate(b.date);
    });
}

// --- Sales Book Generation ---

function SalesBookReport(sales) {
    if (sales.length === 0) {
        return html`<p>No hay registros de ventas para ${selectedMonth}/${selectedYear}.</p>`;
    }

    const ccfSales = sales.filter(s => s.documentType === 'CCF');
    const cfSales = sales.filter(s => s.documentType === 'CF');

    // Assuming we need client details for CCF book
    const clients = getAll('clients');
    const getClient = (nrc) => clients.find(c => c.nrc === nrc);

    let totalIvaDebitCCF = 0;
    let totalTaxableCCF = 0;
    let totalExemptCCF = 0;

    // 1. Libro de Ventas a Contribuyentes (CCF)
    const ccfTable = html`
        <h4>1. Libro de Ventas a Contribuyentes (CCF)</h4>
        <div style="max-height: 400px; overflow-y: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Fecha</th>
                    <th>Correlativo</th>
                    <th>NRC Cliente</th>
                    <th>NIT Cliente</th>
                    <th>Nombre Cliente</th>
                    <th>Ventas Gravadas</th>
                    <th>Ventas Exentas</th>
                    <th>IVA Débito</th>
                    <th>Total CCF</th>
                </tr>
            </thead>
            <tbody>
                ${ccfSales.map((sale, index) => {
                    totalIvaDebitCCF += sale.ivaDebit;
                    totalTaxableCCF += sale.taxableAmount;
                    totalExemptCCF += sale.exemptAmount;
                    const client = getClient(sale.clientNrc);

                    return html`
                        <tr>
                            <td>${index + 1}</td>
                            <td>${sale.date}</td>
                            <td>${sale.correlative}</td>
                            <td>${sale.clientNrc}</td>
                            <td>${client?.nit || 'N/A'}</td>
                            <td>${client?.name || 'Cliente Desconocido'}</td>
                            <td>${formatCurrency(sale.taxableAmount)}</td>
                            <td>${formatCurrency(sale.exemptAmount)}</td>
                            <td>${formatCurrency(sale.ivaDebit)}</td>
                            <td>${formatCurrency(sale.total)}</td>
                        </tr>
                    `;
                })}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="6" style="text-align: right;"><strong>TOTALES CCF:</strong></td>
                    <td><strong>${formatCurrency(totalTaxableCCF)}</strong></td>
                    <td><strong>${formatCurrency(totalExemptCCF)}</strong></td>
                    <td><strong>${formatCurrency(totalIvaDebitCCF)}</strong></td>
                    <td><strong>${formatCurrency(totalTaxableCCF + totalExemptCCF + totalIvaDebitCCF)}</strong></td>
                </tr>
            </tfoot>
        </table>
        </div>
    `;

    // 2. Libro de Ventas a Consumidor Final (CF) - Summarized
    const totalCF = cfSales.reduce((acc, s) => acc + s.total, 0);
    const totalIvaDebitCF = cfSales.reduce((acc, s) => acc + s.ivaDebit, 0);
    const totalTaxableCF = cfSales.reduce((acc, s) => acc + s.taxableAmount, 0);

    const cfSummary = html`
        <h4>2. Libro de Ventas a Consumidor Final (CF) - Resumen Mensual</h4>
        <div class="card">
            <div style="max-height: 400px; overflow-y: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Fecha</th>
                        <th>Correlativo</th>
                        <th>Detalle</th>
                        <th>Base Imponible</th>
                        <th>IVA Débito</th>
                        <th>Total CF</th>
                    </tr>
                </thead>
                <tbody>
                    ${cfSales.map((s, i) => html`
                        <tr>
                            <td>${i + 1}</td>
                            <td>${s.date}</td>
                            <td>${s.correlative || 'N/A'}</td>
                            <td class="description-cell">${s.description || ''}</td>
                            <td class="numeric-cell">${formatCurrency(s.taxableAmount, false)}</td>
                            <td class="numeric-cell">${formatCurrency(s.ivaDebit, false)}</td>
                            <td class="numeric-cell">${formatCurrency(s.total, false)}</td>
                        </tr>
                    `)}
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="4" style="text-align: right;"><strong>TOTALES CF:</strong></td>
                        <td><strong>${formatCurrency(totalTaxableCF)}</strong></td>
                        <td><strong>${formatCurrency(totalIvaDebitCF)}</strong></td>
                        <td><strong>${formatCurrency(totalCF)}</strong></td>
                    </tr>
                </tfoot>
            </table>
            </div>
        </div>
    `;
    
    const grandTotalIvaDebit = totalIvaDebitCCF + totalIvaDebitCF;

    return html`
        <h3>Libro de IVA Ventas (${selectedMonth}/${selectedYear})</h3>
        ${ccfSales.length > 0 ? ccfTable : html`<p>No se encontraron CCF en este período.</p>`}
        <hr style="margin: 20px 0;">
        ${cfSales.length > 0 ? cfSummary : html`<p>No se encontraron CF en este período.</p>`}
        
        <h4 style="margin-top: 20px;">Resumen Total IVA Débito Fiscal del Mes: ${formatCurrency(grandTotalIvaDebit)}</h4>
    `;
}


// --- Purchase Book Generation ---

function PurchaseBookReport(purchases) {
    if (purchases.length === 0) {
        return html`<p>No hay registros de compras para ${selectedMonth}/${selectedYear}.</p>`;
    }

    const suppliers = getAll('suppliers');
    const getSupplier = (nrc) => suppliers.find(s => s.nrc === nrc);

    let totalIvaCredit = 0;
    let totalRetained = 0;
    let totalTaxablePurchase = 0;
    let totalExemptPurchase = 0;
    let grandTotalPurchase = 0;

    const purchaseTable = html`
        <h4>Libro de Compras y Registros de Importación</h4>
        <div style="max-height: 400px; overflow-y: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Fecha</th>
                    <th>Tipo Doc.</th>
                    <th>NRC Prov.</th>
                    <th>NIT Prov.</th>
                    <th>Nombre Proveedor</th>
                    <th>Doc. No.</th>
                    <th>Gravado</th>
                    <th>Exento</th>
                    <th>IVA Crédito</th>
                    <th>Retención IVA</th>
                    <th>Total Doc.</th>
                </tr>
            </thead>
            <tbody>
                ${purchases.map((purchase, index) => {
                    totalIvaCredit += purchase.ivaCredit;
                    totalRetained += purchase.ivaWithheld;
                    totalTaxablePurchase += purchase.taxableAmount;
                    totalExemptPurchase += purchase.exemptAmount;
                    grandTotalPurchase += purchase.total;

                    const supplier = getSupplier(purchase.supplierNrc);

                    return html`
                        <tr>
                            <td>${index + 1}</td>
                            <td>${purchase.date}</td>
                            <td>${purchase.documentType}</td>
                            <td>${purchase.supplierNrc}</td>
                            <td>${supplier?.nit || 'N/A'}</td>
                            <td>${supplier?.name || 'Proveedor Desconocido'}</td>
                            <td>${purchase.documentNumber}</td>
                            <td>${formatCurrency(purchase.taxableAmount)}</td>
                            <td>${formatCurrency(purchase.exemptAmount)}</td>
                            <td>${formatCurrency(purchase.ivaCredit)}</td>
                            <td>${formatCurrency(purchase.ivaWithheld)}</td>
                            <td>${formatCurrency(purchase.total)}</td>
                        </tr>
                    `;
                })}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="7" style="text-align: right;"><strong>TOTALES COMPRAS:</strong></td>
                    <td><strong>${formatCurrency(totalTaxablePurchase)}</strong></td>
                    <td><strong>${formatCurrency(totalExemptPurchase)}</strong></td>
                    <td><strong>${formatCurrency(totalIvaCredit)}</strong></td>
                    <td><strong>${formatCurrency(totalRetained)}</strong></td>
                    <td><strong>${formatCurrency(grandTotalPurchase)}</strong></td>
                </tr>
            </tfoot>
        </table>
        </div>
    `;

    return html`
        <h3>Libro de IVA Compras (${selectedMonth}/${selectedYear})</h3>
        ${purchaseTable}
        <h4 style="margin-top: 20px;">Resumen Total IVA Crédito Fiscal del Mes: ${formatCurrency(totalIvaCredit)}</h4>
    `;
}


function renderReportContent() {
    if (reportType === 'sales') {
        const sales = getAll('salesRecords');
        const filteredSales = filterRecordsByPeriod(sales);
        return SalesBookReport(filteredSales);
    } else {
        const purchases = getAll('purchaseRecords');
        const filteredPurchases = filterRecordsByPeriod(purchases);
        return PurchaseBookReport(filteredPurchases);
    }
}

export function ReportsView() {
    const currentYear = new Date().getFullYear();

    // Generate years dynamically (last 5 years)
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

    return html`
        <h2>Generación de Libros de IVA</h2>
        <div class="card" style="margin-bottom: 20px;">
            <h3>Selección de Período y Tipo de Libro</h3>
            <div class="dashboard-grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 15px;" @change=${handlePeriodChange}>
                <div class="form-group">
                    <label for="reportType">Tipo de Reporte</label>
                    <select id="reportType">
                        <option value="sales" ?selected=${reportType === 'sales'}>Libro de Ventas</option>
                        <option value="purchases" ?selected=${reportType === 'purchases'}>Libro de Compras</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="reportMonth">Mes</label>
                    <select id="reportMonth">
                        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => html`
                            <option value="${m}" ?selected=${m === selectedMonth}>${m}</option>
                        `)}
                    </select>
                </div>
                <div class="form-group">
                    <label for="reportYear">Año</label>
                    <select id="reportYear">
                        ${years.map(y => html`
                            <option value="${y}" ?selected=${y === selectedYear}>${y}</option>
                        `)}
                    </select>
                </div>
            </div>
            <p style="margin-top: 10px;">Los reportes generados cumplen con los requisitos de la Ley de IVA en El Salvador. Recuerde validar la información con sus correlativos oficiales.</p>
        </div>

        <div class="card" style="overflow-x: auto;">
            ${renderReportContent()}
        </div>
    `;
}