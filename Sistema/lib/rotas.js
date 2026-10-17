/* ═══════════════════════════════════════════════════════════════════════════
   NAVEGAÇÃO — History API.

   As três funções de navegação do lib/rotas.js do Chronos, sem mudança. O que
   lá resolve endereço legível de conteúdo (mês + apelido) não tem par aqui:
   peça e projeto são abertos pelo id.

   Exige dois apoios fora daqui:
     · vercel.json — reescreve rota desconhecida para index.html;
     · .claude/static-server.js — o mesmo, no desenvolvimento local.
   Sem eles, abrir /galeria/abc direto devolve 404.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Navega sem recarregar a página. */
export const navegar = (caminho, { substituir = false } = {}) => {
    if (caminho === window.location.pathname) return;
    if (substituir) history.replaceState({}, '', caminho);
    else            history.pushState({}, '', caminho);
    // O popstate não dispara em push/replace feitos por código — o router
    // escuta esse evento, então avisamos na mão.
    window.dispatchEvent(new PopStateEvent('popstate'));
};

/** Caminho atual, sempre começando com "/". */
export const caminhoAtual = () => window.location.pathname || '/';

/**
 * Faz links comuns (<a href="/galeria/x">) navegarem sem recarregar.
 *
 * Um listener só, no documento: as páginas reescrevem o próprio HTML o
 * tempo todo, e ligar handler em cada link recriado seria trabalho perdido
 * a cada render.
 */
export const interceptarLinks = () => {
    document.addEventListener('click', (e) => {
        // Ctrl/Cmd/Shift-clique e botão do meio: a pessoa quer outra aba.
        if (e.defaultPrevented || e.button !== 0
            || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const a = e.target.closest('a');
        if (!a || a.target === '_blank' || a.hasAttribute('download')) return;

        const href = a.getAttribute('href');
        // Só caminhos internos. Externos, mailto:, tel: e âncoras seguem
        // o comportamento nativo.
        if (!href || !href.startsWith('/') || href.startsWith('//')) return;

        e.preventDefault();
        navegar(href);
    });
};
