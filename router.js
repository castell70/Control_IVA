import { html, render } from 'lit-html';

const routes = {};
// const appContainer = document.getElementById('app-container');
// const navMenu = document.getElementById('nav-menu');

function getAppContainer() { return document.getElementById('app-container'); }
function getNavMenu() { return document.getElementById('nav-menu'); }

export function registerRoute(path, componentFn, title) {
    routes[path] = { component: componentFn, title };
}

function navigate(path) {
    if (window.location.hash !== path) {
        window.location.hash = path;
    }
    // Defer actual render to the next animation frame to avoid nested lit-html updates
    requestAnimationFrame(() => renderCurrentRoute());
}

function renderNav() {
    const navMenu = getNavMenu();
    if (!navMenu) return;
    const navTemplate = html`
        ${Object.keys(routes).map(path => {
            const isActive = window.location.hash === path || (window.location.hash === '' && path === '#/');
            return html`
                <a href="${path}" class="${isActive ? 'active' : ''}">${routes[path].title}</a>
            `;
        })}
    `;
    render(navTemplate, navMenu);
}

function renderCurrentRoute() {
    const appContainer = getAppContainer();
    if (!appContainer) {
        console.warn('App container not found for rendering route:', window.location.hash);
        return;
    }
    const hash = window.location.hash || '#/';
    
    const route = routes[hash];
    if (route) {
        document.title = `Sistema VTA-IVA | ${route.title}`;
        try {
            // Defer component render slightly to prevent "parentNode null" during nested updates
            requestAnimationFrame(() => {
                try { render(route.component(), appContainer); } catch (err) { console.error('Render component error:', err); }
            });
        } catch (err) {
            console.error('Error scheduling component render:', err);
        }
    } else {
        render(html`
            <div class="card error">
                <h2>404 - Página no encontrada</h2>
                <p>La ruta ${hash} no existe.</p>
                <button @click=${() => navigate('#/')}>Ir a Inicio</button>
            </div>
        `, appContainer);
    }
    // Update navigation active status safely
    try {
        requestAnimationFrame(renderNav);
    } catch (err) {
        console.error('Error scheduling nav render:', err);
    }
}

export function initializeRouter() {
    window.addEventListener('hashchange', renderCurrentRoute);
    window.addEventListener('load', () => {
        // If no hash is set, navigate to home explicitly
        if (!window.location.hash) {
             navigate('#/');
        } else {
             renderCurrentRoute();
        }
    });
}

export function forceRender() { requestAnimationFrame(() => renderCurrentRoute()); }
export { navigate };