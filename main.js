import { initializeRouter, registerRoute } from './router.js';
import { HomeView } from './home-view.js';
import { EntitiesView } from './clients-suppliers-view.js';
import { RecordsView } from './sales-purchase-view.js';
import { ReportsView } from './reports-view.js';
import { DownloadView } from './download-view.js';


// Register Routes
registerRoute('#/', HomeView, 'Inicio');
registerRoute('#/clients', () => EntitiesView('clients'), 'Clientes');
registerRoute('#/suppliers', () => EntitiesView('suppliers'), 'Proveedores');
registerRoute('#/sales', () => RecordsView('salesRecords'), 'Registro de Ventas');
registerRoute('#/purchases', () => RecordsView('purchaseRecords'), 'Registro de Compras');
registerRoute('#/reports', ReportsView, 'Libros de IVA');
registerRoute('#/download', DownloadView, 'Herramientas');

// Initialize Router
initializeRouter();

console.log("Sistema VTA-IVA iniciado.");

// --- Floating Help Button Logic ---
const helpBtn = document.getElementById('help-floating-btn');

function buildHelpModalContent() {
    return `
    <div class="help-modal-overlay" id="help-modal" role="dialog" aria-modal="true" aria-label="Ayuda del Sistema">
        <div class="help-modal">
            <button class="close-help" id="close-help-btn">Cerrar</button>
            <h2>Ayuda — Sistema VTA-IVA</h2>
            <div class="section">
                <h3>Introducción</h3>
                <p>Sistema VTA-IVA es una herramienta ligera para registrar ventas y compras, calcular IVA y generar los libros oficiales en El Salvador.</p>
            </div>
            <div class="section">
                <h3>Objetivo</h3>
                <p>Facilitar el control diario de comprobantes, el cálculo automático del IVA (13%) y la generación de reportes mensuales y anualizados.</p>
            </div>
            <div class="section">
                <h3>Funciones principales (detalle)</h3>
                <ul>
                    <li><strong>Clientes / Proveedores:</strong> Registrar y editar datos, incluir contacto y actividad.</li>
                    <li><strong>Registro de Ventas:</strong> Soporta CCF (con NRC cliente, ítems, cálculo automático de base/IVA) y CF (monto bruto -> calcula base e IVA).</li>
                    <li><strong>Registro de Compras:</strong> Ingresar base gravada, exenta, IVA crédito (si no se ingresa se calcula al 13%), retención y total.</li>
                    <li><strong>Reportes:</strong> Genera Libro de Ventas (CCF detallado y CF resumen) y Libro de Compras con totales y exportación de datos.</li>
                    <li><strong>Respaldo / Restauración:</strong> Exportar/Importar JSON y CSV, restaurar backup completo y configuración de correlativos.</li>
                    <li><strong>Ticket / Imprimir:</strong> Generar ticket en nueva ventana con datos de la empresa y detalle del comprobante.</li>
                </ul>
            </div>
            <div class="section">
                <h3>Ejemplo completo</h3>
                <div class="example">
                    <p><strong>Paso a paso:</strong></p>
                    <ol>
                        <li>Vaya a <em>Clientes</em> y agregue: Nombre "Tienda Ejemplo", NRC "1234567-8", NIT "0101-123456-101-1".</li>
                        <li>Vaya a <em>Registro de Compras</em> y registre: Fecha hoy, Proveedor con NRC, Compra Gravada $200 (IVA crédito se calculará $26.00), total $226.</li>
                        <li>Vaya a <em>Registro de Ventas</em> y registre un CCF para el cliente con 2 ítems: 1 x Servicio $100, 1 x Producto $50 — base $150, IVA $19.50, total $169.50.</li>
                        <li>Abra <em>Libros de IVA</em> para el mes actual y verá el CCF detallado y el CF resumido con totales de base e IVA.</li>
                    </ol>
                    <pre>{
  "clients": [{"name":"Tienda Ejemplo","nrc":"1234567-8","nit":"0101-123456-101-1"}],
  "purchaseExample": {"taxableAmount":200,"ivaCredit":26,"total":226},
  "saleExample": {"items":[{"qty":1,"desc":"Servicio","price":100},{"qty":1,"desc":"Producto","price":50}]}
}</pre>
                </div>
                <div class="example-report" style="margin-top:8px;">
                    <h4>Reporte de Ventas - Ejemplo</h4>
                    <table class="data-table" style="font-size:0.9em;">
                        <thead>
                            <tr><th>Fecha</th><th>Correl.</th><th>Cliente</th><th>Base Gravada</th><th>IVA</th><th>Total</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${new Date().toISOString().substring(0,10)}</td>
                                <td>1</td>
                                <td>Tienda Ejemplo</td>
                                <td>$150.00</td>
                                <td>$19.50</td>
                                <td>$169.50</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div style="clear:both; margin-top:12px;">
                <button id="close-help-bottom" class="close-help">Cerrar</button>
            </div>
        </div>
    </div>
    `;
}

function openHelpModal() {
    // Prevent multiple modals
    if (document.getElementById('help-modal')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHelpModalContent();
    document.body.appendChild(wrapper.firstElementChild);
    const closeBtn = document.getElementById('close-help-btn');
    const closeBtnBottom = document.getElementById('close-help-bottom');
    function close() {
        const modal = document.getElementById('help-modal');
        if (modal) modal.remove();
        helpBtn.focus();
    }
    closeBtn?.addEventListener('click', close);
    closeBtnBottom?.addEventListener('click', close);
    // Close on overlay click
    document.getElementById('help-modal')?.addEventListener('click', (ev) => {
        if (ev.target === ev.currentTarget) close();
    });
    // Close on Escape
    document.addEventListener('keydown', function escHandler(e){
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    });
}

helpBtn?.addEventListener('click', openHelpModal);
