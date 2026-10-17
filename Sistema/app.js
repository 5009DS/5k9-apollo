import { theme } from './theme.js';
import { navegar, caminhoAtual, interceptarLinks } from './lib/rotas.js';
import { guardarRolagem } from './components/pageshell.js';

/* ═══════════════════════════════════════════════════════════════════════════
   5K9 APOLLO — roteador.

   O mesmo do Chronos: SPA sobre a History API, sem build, padrões com
   parâmetro, telas baixadas quando abertas.

   EXISTE ROTA PÚBLICA. Tudo sob /e/ (e, quando existir, /l/) é aberto por
   gente de fora, sem sessão, quase sempre no celular. Hoje não há portão de
   login — o modo local não tem sessão —, mas a separação já fica aqui, porque
   é a ela que o portão vai obedecer quando o banco entrar.
   ═══════════════════════════════════════════════════════════════════════════ */

const tela = (caminho, nome) => async (...args) => (await import(caminho))[nome](...args);

const renderPainel       = tela('./pages/painel.js', 'renderPainel');
const renderGaleria      = tela('./pages/galeria.js', 'renderGaleria');
const renderPagina       = tela('./pages/pagina.js', 'renderPagina');
const renderPrevia       = tela('./pages/apresentacao.js', 'renderPrevia');
const renderEntrega      = tela('./pages/entrega.js', 'renderEntrega');
const renderApresentacao = tela('./pages/apresentacao.js', 'renderApresentacao');

const app = document.getElementById('app');

theme.init();

/* `:algo` casa um segmento e vira argumento do render, na ordem. */
const ROTAS = [
    ['/',                () => renderPainel(app)],
    ['/galeria/:id',     (id) => renderGaleria(app, id)],
    /* /projeto/:id é a tela de pastas e peças do README — vídeo, foto,
       documento lado a lado. Enquanto toda peça for foto, ela seria a mesma
       galeria com outro nome; o endereço já fica valendo e leva para lá. */
    ['/projeto/:id',     (id) => navegar(`/galeria/${encodeURIComponent(id)}`, { substituir: true })],
    ['/projeto/:id/pagina', (id) => renderPagina(app, id)],
    // A prévia mora num iframe da organização da página (pages/pagina.js).
    ['/projeto/:id/previa', (id) => renderPrevia(app, id)],
    ['/e/:token',        (token) => renderEntrega(app, token, null)],
    ['/e/:token/:peca',  (token, peca) => renderEntrega(app, token, peca)],
    ['/e/:token/p/:projeto', (token, projeto) => renderApresentacao(app, token, projeto)],
];

const casar = (caminho, padrao) => {
    const a = caminho.split('/').filter(Boolean);
    const b = padrao.split('/').filter(Boolean);
    if (a.length !== b.length) return null;
    const args = [];
    for (let i = 0; i < b.length; i++) {
        if (b[i].startsWith(':')) args.push(decodeURIComponent(a[i]));
        else if (b[i] !== a[i]) return null;
    }
    return args;
};

const resolver = (caminho) => {
    for (const [padrao, render] of ROTAS) {
        const args = casar(caminho, padrao);
        if (args) return () => render(...args);
    }
    return null;
};

/** A rota é a do cliente? /e/ é o link do cliente; /l/, o link avulso. */
export const ehPublica = (caminho) => caminho.startsWith('/e/') || caminho.startsWith('/l/');

let caminhoCorrente = null;

const roteador = async () => {
    const caminho = caminhoAtual();
    if (caminho === caminhoCorrente) return;

    guardarRolagem(caminhoCorrente);

    app.innerHTML = '';
    const render = resolver(caminho);
    if (render) {
        try {
            await render();
        } catch (e) {
            console.error('[app] falha ao desenhar a página:', e);
            app.innerHTML = erroHTML(e);
        }
    } else {
        app.innerHTML = naoEncontrado();
    }
    requestAnimationFrame(() => { if (window.lucide) lucide.createIcons(); });
    caminhoCorrente = caminho;
};

const esc = (t) => String(t ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Uma falha ao carregar não pode deixar a tela em branco sem explicação.
const erroHTML = (e) => `
    <div class="app-aviso">
        <h2>Algo quebrou ao montar esta tela</h2>
        <p>${esc(e?.message || e)}</p>
        <a href="/" class="ds-btn ds-btn--ghost ds-btn--sm">Voltar ao início</a>
    </div>`;

/* Na rota pública, sem link para o painel: o cliente não tem painel. */
const naoEncontrado = () => ehPublica(caminhoAtual()) ? `
    <div class="app-aviso">
        <h2>Este link não está disponível</h2>
        <p>Peça o link atualizado para a equipe da 5K9.</p>
    </div>` : `
    <div class="app-aviso">
        <h2>Página não encontrada</h2>
        <p>O endereço não corresponde a nenhuma tela do Apollo.</p>
        <a href="/" class="ds-btn ds-btn--ghost ds-btn--sm">Ir para o início</a>
    </div>`;

window.addEventListener('popstate', roteador);
interceptarLinks();
roteador();

export { roteador };
