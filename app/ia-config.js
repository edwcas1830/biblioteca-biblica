'use strict';
// Dirección del servidor de la IA integrada (Cloudflare Worker «biblia-ia», ver servidor/ia/LEEME.md).
// Vacía = la IA integrada todavía no está activa y la pantalla lo dice. Al activarla, agregar el mismo
// origen a connect-src de la CSP de index.html (lo comprueba tests/ia-biblia.test.cjs).
window.BIBLIA_IA_URL = 'https://biblia-ia.thebest1830.workers.dev';
