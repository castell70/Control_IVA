import { html } from 'lit-html';
import { getAll } from '../data-store.js';
import { formatCurrency } from '../utils/form-utils.js';
import { navigate } from '../router.js';
import { forceRender } from '../router.js';

let selectedMonth = new Date().getMonth() + 1; // 1-12
let selectedYear = new Date().getFullYear();

function setPeriod(month, year) { selectedMonth = month; selectedYear = year; forceRender(); }

// NEW: parse stored YYYY-MM-DD into local Date to avoid timezone shifts
function parseLocalDate(dateStr) {
    if (!dateStr) return new Date(NaN);
    // If already a Date object, return it
    if (dateStr instanceof Date) return dateStr;
    // Ensure format YYYY-MM-DD is treated as local midnight
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length >= 3) {
        const [y, m, d] = parts.map(Number);
        return new Date(y, (m || 1) - 1, d || 1);
    }
    return new Date(dateStr);
}

function calculateSummary() {
    const sales = getAll('salesRecords');
    const purchases = getAll('purchaseRecords');
    
    // Filter parameters for selected period (Monthly) - selectedMonth is 1-12
    const currentPeriodSales = sales.filter(s => {
        const date = parseLocalDate(s.date);
        return (date.getMonth() + 1) === selectedMonth && date.getFullYear() === selectedYear;
    });
    const currentPeriodPurchases = purchases.filter(p => {
        const date = parseLocalDate(p.date);
        return (date.getMonth() + 1) === selectedMonth && date.getFullYear() === selectedYear;
    });
    
    // --- Start Annual Calculations (New) ---
    const currentYearSales = sales.filter(s => {
        const date = parseLocalDate(s.date);
        return date.getFullYear() === selectedYear;
    });

    const currentYearPurchases = purchases.filter(p => {
        const date = parseLocalDate(p.date);
        return date.getFullYear() === selectedYear;
    });

    // Calculate annual totals excluding IVA: Taxable + Exempt
    const annualSalesExcludingIva = currentYearSales.reduce((sum, s) => sum + s.taxableAmount + s.exemptAmount, 0);
    const annualPurchasesExcludingIva = currentYearPurchases.reduce((sum, p) => sum + p.taxableAmount + p.exemptAmount, 0);
    // Calculate annual totals including IVA (use 'total' which already includes IVA)
    const annualSalesIncludingIva = currentYearSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    // --- End Annual Calculations ---


    const summary = {
        // Monthly
        totalSales: currentPeriodSales.reduce((sum, s) => sum + s.total, 0),
        ivaDebit: currentPeriodSales.reduce((sum, s) => sum + s.ivaDebit, 0),
        
        totalPurchases: currentPeriodPurchases.reduce((sum, p) => sum + p.total, 0),
        ivaCredit: currentPeriodPurchases.reduce((sum, p) => sum + p.ivaCredit, 0),

        // Annual (New)
        annualSalesExcludingIva,
        annualPurchasesExcludingIva
       ,annualSalesIncludingIva
    };
    
    summary.ivaToPay = summary.ivaDebit - summary.ivaCredit;

    // Calculation requested by user: (Total Sales - Total Purchases) - IVA to Pay
    // This results in the Gross Margin based on Taxable/Exempt amounts + IVA Withheld
    summary.utility = summary.totalSales - summary.totalPurchases - summary.ivaToPay;

    return summary;
}

// Añadir import dinámico y función para renderizar el gráfico
function computeMonthlyTotals(year) {
    // Chart removed — keep a no-op to avoid breaking references if any
    return { sales: Array(12).fill(0), purchases: Array(12).fill(0) };
}

async function attachMonthlyChart(year) {
    // intentionally left blank — chart functionality removed
    return;
}

export function HomeView() {
    const summary = calculateSummary();
    const currentYear = new Date().getFullYear();
    const years = Array.from({length:6},(_,i)=> currentYear - i);

    return html`
        <div style="display:flex;justify-content:space-between;align-items:end;margin-bottom:10px;">
            <h2 style="margin:0;">Resumen del Período (${selectedMonth}/${selectedYear})</h2>
            <div style="display:flex;gap:10px;align-items:center;">
                <label style="font-weight:700;">Mes:</label>
                <select @change=${(e)=> { setPeriod(parseInt(e.target.value), selectedYear); }} aria-label="Seleccionar Mes">
                    ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=> html`<option value="${m}" ?selected=${m===selectedMonth}>${m}</option>`)}
                </select>
                <label style="font-weight:700;">Año:</label>
                <select @change=${(e)=> { setPeriod(selectedMonth, parseInt(e.target.value)); }} aria-label="Seleccionar Año">
                    ${years.map(y=> html`<option value="${y}" ?selected=${y===selectedYear}>${y}</option>`)}
                </select>
            </div>
        </div>
        <div class="dashboard-grid">
            
            <div class="card">
                <h3>Ventas Totales (Mes)</h3>
                <p style="font-size: 1.5em; font-weight: bold; color: var(--success-color);">
                    ${formatCurrency(summary.totalSales)}
                </p>
                <button @click=${() => navigate('#/sales')}>Ver Detalle</button>
            </div>
            
            <div class="card">
                <h3>IVA Débito Fiscal</h3>
                <p style="font-size: 1.5em; font-weight: bold; color: var(--accent-color);">
                    ${formatCurrency(summary.ivaDebit)}
                </p>
            </div>
            
            <div class="card">
                <h3>Compras Totales (Mes)</h3>
                <p style="font-size: 1.5em; font-weight: bold; color: #cc6600;">
                    ${formatCurrency(summary.totalPurchases)}
                </p>
                <button @click=${() => navigate('#/purchases')}>Ver Detalle</button>
            </div>

            <div class="card">
                <h3>IVA Crédito Fiscal</h3>
                <p style="font-size: 1.5em; font-weight: bold; color: var(--accent-color);">
                    ${formatCurrency(summary.ivaCredit)}
                </p>
            </div>
            
            <div class="card">
                <h3>Resultado IVA del Mes</h3>
                <p style="font-size: 1.7em; font-weight: bold; color: ${summary.ivaToPay >= 0 ? 'var(--error-color)' : 'var(--success-color)'};">
                    ${formatCurrency(Math.abs(summary.ivaToPay))}
                </p>
                <p>${summary.ivaToPay >= 0 ? 'IVA a Pagar' : 'Crédito Fiscal Remanente'}</p>
                <button @click=${() => navigate('#/reports')}>Generar Libros Oficiales</button>
            </div>
            
            <div class="card">
                <h3>Utilidad Bruta Estimada (Mes)</h3>
                <p style="font-size: 1.7em; font-weight: bold; color: ${summary.utility >= 0 ? 'var(--success-color)' : 'var(--error-color)'};">
                    ${formatCurrency(summary.utility)}
                </p>
                <p>Resultado antes de gastos de operación</p>
                <button @click=${() => navigate('#/sales')}>Detalle Operaciones</button>
            </div>

            <!-- Annual Accumulators Integrated -->
            <div class="card">
                <h3>Ventas Acumuladas (Sin IVA)</h3>
                <p style="font-size: 1.5em; font-weight: bold; color: var(--success-color);">
                    ${formatCurrency(summary.annualSalesExcludingIva)}
                </p>
                <p style="font-size: 0.9em; margin-top: 5px; font-weight: normal; color: #666;">(Acumulado Anual: Gravadas + Exentas)</p>
            </div>
            
            <div class="card">
                <h3>Compras Acumuladas (Sin IVA)</h3>
                <p style="font-size: 1.5em; font-weight: bold; color: #cc6600;">
                    ${formatCurrency(summary.annualPurchasesExcludingIva)}
                </p>
                <p style="font-size: 0.9em; margin-top: 5px; font-weight: normal; color: #666;">(Acumulado Anual: Gravadas + Exentas)</p>
            </div>
            
            <div class="card">
                <h3>Ventas Acumuladas (Con IVA)</h3>
                <p style="font-size: 1.5em; font-weight: bold; color: var(--primary-color);">
                    ${formatCurrency(summary.annualSalesIncludingIva)}
                </p>
                <p style="font-size: 0.9em; margin-top: 5px; font-weight: normal; color: #666;">(Acumulado Anual: Total incluyendo IVA)</p>
            </div>

        </div>
    `;
}

// Monthly chart removed — no attachment needed