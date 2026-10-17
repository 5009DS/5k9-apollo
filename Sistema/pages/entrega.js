import { store } from '../store.js';
import { navegar } from '../lib/rotas.js';
import { midia } from '../lib/midia.js';
import { esc, plural } from '../lib/formato.js';
import { vazioHTML } from '../lib/pecas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   ENTREGA — a tela do cliente. /e/:token e /e/:token/:peca.

   "As três últimas são a razão do sistema existir. Tudo o mais serve para
   alimentá-las." (README). Esta é a primeira delas, na versão de fotos.

   ── O QUE ELA NÃO É ───────────────────────────────────────────────────────
   Não parece um sistema: sem topnav, sem trocador, sem link para o painel.
   Cabeçalho do link do Chronos — logo e nome do cliente —, porque
   o dia em que as duas casas se juntarem (Cronograma · Vídeos · Fotos) o
   cliente não pode notar a costura.

   ── NASCE PEQUENA ─────────────────────────────────────────────────────────
   CSS em min-width, o contrário das telas da equipe. Ela abre no celular,
   vindo de um link do WhatsApp; a mesa é o caso secundário.

   ── ESCOLHER SALVA NA HORA ────────────────────────────────────────────────
   Não existe "enviar seleção". Cada toque grava, e a equipe já vê. Um botão
   de enviar no fim é o passo que o cliente esquece — e aí as quarenta fotos
   escolhidas no consultório nunca chegam.

   Quem escolhe é o APARELHO (a sessão), não uma conta: o link é sem senha, e
   a médica e o marketing abrindo o mesmo link escolhem cada um a sua lista.
   ═══════════════════════════════════════════════════════════════════════════ */

const CHAVE_SESSAO = '5k9_apollo_visitante';
let sessaoEmMemoria = null;

/* O id deste aparelho. Sem localStorage (aba anônima com armazenamento
   bloqueado), a escolha vale enquanto a página estiver aberta — melhor que
   não deixar escolher. */
const sessaoDoVisitante = () => {
    try {
        let s = localStorage.getItem(CHAVE_SESSAO);
        if (!s) { s = crypto.randomUUID(); localStorage.setItem(CHAVE_SESSAO, s); }
        return s;
    } catch {
        return sessaoEmMemoria || (sessaoEmMemoria = crypto.randomUUID());
    }
};

/* De onde a pessoa saiu para abrir uma foto, por token. Fechar a foto volta
   à mesma altura da grade, e não ao topo de trezentas fotos. */
const rolagem = new Map();
let soEscolhidas = false;

export const renderEntrega = async (container, token, pecaId) => {
    injectStyles();
    container.innerHTML = `<div class="en-carregando">Carregando…</div>`;

    const sessao = sessaoDoVisitante();
    let visao;
    try {
        visao = await store.entrega(token, sessao);
    } catch (e) {
        console.error('[entrega] falha ao carregar:', e);
        return desenharAviso(container, 'wifi-off', 'Não conseguimos carregar agora',
            'Verifique a conexão e tente de novo. Se continuar, avise a equipe.');
    }

    /* Mesma tela para link inválido e cliente desativado — o motivo do
       Chronos: distinguir os dois transformaria a tela num oráculo que
       confirma tokens válidos. */
    if (!visao) {
        return desenharAviso(container, 'link-2-off', 'Este link não está disponível',
            'Ele pode ter sido substituído por um novo. Peça o link atualizado para a equipe da 5K9.');
    }

    if (pecaId) return desenharFoto(container, token, sessao, visao, pecaId);
    return desenharGaleria(container, token, sessao, visao);
};

// ═══════════════════════════════════════════════════════════════════════════
// GALERIA
// ═══════════════════════════════════════════════════════════════════════════

const desenharGaleria = (container, token, sessao, visao) => {
    const { cliente, projetos, pecas } = visao;
    const escolhidas = new Set(visao.escolhidas);
    // Apresentação vira um cartão que abre a página dela; seleção, a grade.
    const apresentacoes = projetos.filter(p => p.modelo === 'apresentacao');
    const deSelecao = projetos.filter(p => p.modelo !== 'apresentacao');

    container.innerHTML = `
        <div class="en">
            ${cabecalho(cliente)}
            <main class="en-corpo">
                ${apresentacoes.length ? `
                    <section class="en-apresentacoes">
                        ${apresentacoes.map(p => apresentacaoHTML(token, p)).join('')}
                    </section>` : ''}
                ${pecas.length ? `
                    <div class="en-filtros" role="group" aria-label="Mostrar">
                        <button class="en-filtro ${soEscolhidas ? '' : 'is-active'}" data-so="nao" aria-pressed="${!soEscolhidas}">
                            Todas <span>${pecas.length}</span>
                        </button>
                        <button class="en-filtro ${soEscolhidas ? 'is-active' : ''}" data-so="sim" aria-pressed="${soEscolhidas}">
                            Suas escolhas <span id="en-conta-filtro">${escolhidas.size}</span>
                        </button>
                    </div>
                    ${deSelecao.map(p => secaoHTML(token, p, pecas.filter(x => x.projeto_id === p.id), escolhidas)).join('')}
                    <p class="en-vazio-filtro" id="en-vazio-filtro" hidden>
                        Você ainda não escolheu nenhuma foto. Toque no coração de uma foto para escolher.</p>`
                : apresentacoes.length ? '' : vazioHTML('images', 'Nada por aqui ainda',
                    'Quando a equipe liberar o material, ele aparece neste link.')}
            </main>
            ${pecas.length ? `
                <div class="en-barra" id="en-barra">
                    <span class="en-barra__texto" id="en-barra-texto">${barraTexto(escolhidas.size)}</span>
                </div>` : ''}
        </div>`;

    aplicarFiltro(container, escolhidas);
    pintarImagens(container);

    container.querySelectorAll('[data-so]').forEach(b =>
        b.addEventListener('click', () => {
            soEscolhidas = b.dataset.so === 'sim';
            container.querySelectorAll('[data-so]').forEach(x => {
                const ativo = x === b;
                x.classList.toggle('is-active', ativo);
                x.setAttribute('aria-pressed', String(ativo));
            });
            aplicarFiltro(container, escolhidas);
        }));

    container.querySelectorAll('[data-abrir]').forEach(a =>
        a.addEventListener('click', () => rolagem.set(token, window.scrollY)));

    container.querySelectorAll('[data-escolher]').forEach(botao =>
        botao.addEventListener('click', () =>
            alternarEscolha(token, sessao, botao.dataset.escolher, escolhidas, container)));

    // Voltando de uma foto: a mesma altura de antes. As miniaturas têm
    // proporção fixa, então a altura da página não muda quando elas chegam.
    const y = rolagem.get(token);
    window.scrollTo(0, y || 0);

    if (window.lucide) lucide.createIcons();
};

/* O cartão da apresentação diz, antes do clique, o que se espera do
   cliente: "aguardando sua aprovação" é a chamada que o link existe para
   fazer. */
const apresentacaoHTML = (token, p) => `
    <a class="en-apr" href="/e/${encodeURIComponent(token)}/p/${encodeURIComponent(p.id)}">
        <span class="en-apr__capa">
            ${p.capa ? `<img data-chave="${esc(p.capa.capa_chave || p.capa.proxy_chave)}" alt="">` : '<i data-lucide="presentation"></i>'}
        </span>
        <span class="en-apr__texto">
            <small>Apresentação · versão ${p.publicacao.numero}</small>
            <b>${esc(p.nome)}</b>
            <span class="en-apr__estado ${p.aprovada ? 'is-aprovada' : ''}">
                ${p.aprovada ? `Aprovada por ${esc(p.aprovada.quem_nome)}` : 'Aguardando sua aprovação'}</span>
        </span>
        <i data-lucide="arrow-right" class="en-apr__seta"></i>
    </a>`;

const secaoHTML = (token, projeto, pecas, escolhidas) => `
    <section class="en-projeto">
        <header class="en-projeto__cabeca">
            <h2>${esc(projeto.nome)}</h2>
            <span>${plural(pecas.length, 'foto', 'fotos')}</span>
        </header>
        ${projeto.descricao ? `<p class="en-projeto__texto">${esc(projeto.descricao)}</p>` : ''}
        <div class="en-grade">
            ${pecas.map(p => `
                <div class="en-foto ${escolhidas.has(p.id) ? 'is-escolhida' : ''}" data-peca="${esc(p.id)}">
                    <a class="en-foto__abrir" data-abrir href="/e/${encodeURIComponent(token)}/${encodeURIComponent(p.id)}"
                       aria-label="Abrir foto ${esc(p.titulo)}">
                        <img data-chave="${esc(p.versao.capa_chave)}" alt="" loading="lazy">
                    </a>
                    <button class="en-coracao" data-escolher="${esc(p.id)}"
                            aria-pressed="${escolhidas.has(p.id)}"
                            aria-label="${escolhidas.has(p.id) ? 'Tirar das escolhas' : 'Escolher esta foto'}">
                        <i data-lucide="heart"></i>
                    </button>
                </div>`).join('')}
        </div>
    </section>`;

const barraTexto = (n) => n
    ? `<b>Você escolheu ${plural(n, 'foto', 'fotos')}.</b> Fica salvo na hora — a equipe já vê.`
    : 'Toque no coração das fotos que você quer. Fica salvo na hora.';

const aplicarFiltro = (container, escolhidas) => {
    let alguma = false;
    container.querySelectorAll('.en-foto').forEach(f => {
        const mostra = !soEscolhidas || escolhidas.has(f.dataset.peca);
        f.hidden = !mostra;
        if (mostra) alguma = true;
    });
    container.querySelectorAll('.en-projeto').forEach(s => {
        s.hidden = soEscolhidas && !s.querySelector('.en-foto:not([hidden])');
    });
    const vazio = container.querySelector('#en-vazio-filtro');
    if (vazio) vazio.hidden = !(soEscolhidas && !alguma);
};

/* Otimista: o coração acende no toque, e apaga de volta se o banco recusar.
   Esperar a resposta para acender faria o toque parecer não ter pegado — e
   a pessoa tocaria de novo, desfazendo o que queria. */
const alternarEscolha = async (token, sessao, pecaId, escolhidas, container) => {
    const marcar = !escolhidas.has(pecaId);
    const pintar = (marcado) => {
        if (marcado) escolhidas.add(pecaId); else escolhidas.delete(pecaId);
        container.querySelectorAll(`[data-escolher="${CSS.escape(pecaId)}"]`).forEach(b => {
            b.setAttribute('aria-pressed', String(marcado));
            b.setAttribute('aria-label', marcado ? 'Tirar das escolhas' : 'Escolher esta foto');
            b.closest('.en-foto, .en-visor')?.classList.toggle('is-escolhida', marcado);
            const rotulo = b.querySelector('.en-escolher__rotulo');
            if (rotulo) rotulo.textContent = marcado ? 'Escolhida' : 'Escolher esta foto';
        });
        const texto = container.querySelector('#en-barra-texto');
        if (texto) texto.innerHTML = barraTexto(escolhidas.size);
        const conta = container.querySelector('#en-conta-filtro');
        if (conta) conta.textContent = String(escolhidas.size);
    };

    pintar(marcar);
    try {
        await store.selecionar(token, pecaId, marcar, sessao);
        if (soEscolhidas) aplicarFiltro(container, escolhidas);
    } catch (e) {
        pintar(!marcar);
        avisoRapido(container, e.message || 'Não foi possível salvar sua escolha. Tente de novo.');
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// A FOTO
// ═══════════════════════════════════════════════════════════════════════════

const desenharFoto = (container, token, sessao, visao, pecaId) => {
    const peca = visao.pecas.find(p => p.id === pecaId);
    if (!peca) {
        return desenharAviso(container, 'image-off', 'Esta foto não está mais aqui',
            'Ela pode ter saído da entrega. As outras continuam no link.',
            `<a class="ds-btn ds-btn--ghost" href="/e/${encodeURIComponent(token)}">Ver as fotos</a>`);
    }

    // Anda dentro do projeto da foto: é a ordem em que a pessoa estava vendo.
    const doProjeto = visao.pecas.filter(p => p.projeto_id === peca.projeto_id);
    const i = doProjeto.findIndex(p => p.id === pecaId);
    const anterior = doProjeto[i - 1];
    const proxima = doProjeto[i + 1];
    const escolhidas = new Set(visao.escolhidas);
    const escolhida = escolhidas.has(peca.id);
    const base = `/e/${encodeURIComponent(token)}`;
    const projeto = visao.projetos.find(p => p.id === peca.projeto_id);

    container.innerHTML = `
        <div class="en-visor ${escolhida ? 'is-escolhida' : ''}" role="dialog" aria-label="Foto ${i + 1} de ${doProjeto.length}">
            <header class="en-visor__topo">
                <a class="ds-icon-btn en-visor__fechar" href="${base}" aria-label="Voltar para as fotos">
                    <i data-lucide="x"></i>
                </a>
                <span class="en-visor__conta">${esc(projeto?.nome || '')} · ${i + 1} de ${doProjeto.length}</span>
            </header>

            <div class="en-visor__palco" id="en-palco">
                <img class="en-visor__img" id="en-img" alt="${esc(peca.titulo)}"
                     width="${peca.versao.largura}" height="${peca.versao.altura}">
                ${anterior ? `<button class="en-visor__seta en-visor__seta--antes" data-ir="${esc(anterior.id)}" aria-label="Foto anterior"><i data-lucide="chevron-left"></i></button>` : ''}
                ${proxima ? `<button class="en-visor__seta en-visor__seta--depois" data-ir="${esc(proxima.id)}" aria-label="Próxima foto"><i data-lucide="chevron-right"></i></button>` : ''}
            </div>

            <footer class="en-visor__base">
                <button class="en-escolher" data-escolher="${esc(peca.id)}" aria-pressed="${escolhida}"
                        aria-label="${escolhida ? 'Tirar das escolhas' : 'Escolher esta foto'}">
                    <i data-lucide="heart"></i>
                    <span class="en-escolher__rotulo">${escolhida ? 'Escolhida' : 'Escolher esta foto'}</span>
                </button>
            </footer>
        </div>`;

    /* A miniatura primeiro, que já está em cache da grade, e a foto grande
       por cima quando chegar: tela preta esperando 2048 px no 4G é o que faz
       o cliente achar que travou. */
    const img = container.querySelector('#en-img');
    midia.url(peca.versao.capa_chave).then(u => { if (u && !img.dataset.grande) img.src = u; }).catch(() => {});
    midia.url(peca.versao.proxy_chave).then(u => {
        if (!u) return;
        const grande = new Image();
        grande.onload = () => { img.dataset.grande = '1'; img.src = u; };
        grande.src = u;
    }).catch(() => {});
    // A próxima e a anterior já descem agora, para o deslizar não esperar.
    [anterior, proxima].filter(Boolean).forEach(p => midia.url(p.versao.proxy_chave).catch(() => {}));

    const ir = (id) => navegar(`${base}/${encodeURIComponent(id)}`, { substituir: true });

    container.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => ir(b.dataset.ir)));
    container.querySelector('[data-escolher]').addEventListener('click', () =>
        alternarEscolha(token, sessao, peca.id, escolhidas, container));

    // Teclado: setas andam, Esc fecha. Solto ao sair, senão cada foto vista
    // deixaria mais um ouvinte vivo no documento.
    const tecla = (e) => {
        if (e.key === 'ArrowLeft' && anterior) ir(anterior.id);
        else if (e.key === 'ArrowRight' && proxima) ir(proxima.id);
        else if (e.key === 'Escape') navegar(base);
    };
    document.addEventListener('keydown', tecla);
    window.addEventListener('popstate', () => document.removeEventListener('keydown', tecla), { once: true });

    // Deslizar no celular. Só o gesto horizontal claro conta: um arrasto
    // diagonal é a pessoa tentando dar zoom ou rolar, não trocar de foto.
    const palco = container.querySelector('#en-palco');
    let inicio = null;
    palco.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) inicio = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    palco.addEventListener('touchend', (e) => {
        if (!inicio) return;
        const dx = e.changedTouches[0].clientX - inicio.x;
        const dy = e.changedTouches[0].clientY - inicio.y;
        inicio = null;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0 && proxima) ir(proxima.id);
        if (dx > 0 && anterior) ir(anterior.id);
    });

    if (window.lucide) lucide.createIcons();
};

// ═══════════════════════════════════════════════════════════════════════════
// Pedaços comuns
// ═══════════════════════════════════════════════════════════════════════════

const cabecalho = (cliente) => `
    <header class="en-topo">
        <div class="en-topo__marca">
            <img class="en-logo" src="/assets/logo/5k9-lockup-horizontal-white.png"
                 alt="5K9 Studio" width="816" height="185">
        </div>
        <h1 class="en-nome ds-display">${esc(cliente.nome)}</h1>
        <p class="en-sub">Suas entregas</p>
    </header>`;

const pintarImagens = (raiz) => {
    raiz.querySelectorAll('img[data-chave]').forEach(async (img) => {
        const url = await midia.url(img.dataset.chave).catch(() => null);
        if (url) img.src = url;
        else img.closest('.en-foto')?.classList.add('is-sem-arquivo');
    });
};

const desenharAviso = (container, icone, titulo, texto, acao = '') => {
    container.innerHTML = `
        <div class="en en--aviso">
            <div class="en-aviso">
                <img class="en-logo" src="/assets/logo/5k9-lockup-horizontal-white.png"
                     alt="5K9 Studio" width="816" height="185">
                ${vazioHTML(icone, titulo, texto, acao)}
            </div>
        </div>`;
    if (window.lucide) lucide.createIcons();
};

const avisoRapido = (container, mensagem) => {
    container.querySelector('.en-erro')?.remove();
    const el = document.createElement('p');
    el.className = 'en-erro';
    el.setAttribute('role', 'alert');
    el.textContent = mensagem;
    container.appendChild(el);
    setTimeout(() => el.remove(), 5000);
};

// ═══════════════════════════════════════════════════════════════════════════
function injectStyles() {
    if (document.getElementById('entrega-styles')) return;
    const style = document.createElement('style');
    style.id = 'entrega-styles';
    style.textContent = `
        /* ── Base: o celular. Tudo que cresce, cresce em min-width. ──────── */
        .en {
            flex: 1; min-width: 0; min-height: 100vh;
            display: flex; flex-direction: column;
            background: var(--surface-base);
            font-family: var(--font-sans); color: var(--text-primary);
        }
        .en-carregando {
            flex: 1; display: flex; align-items: center; justify-content: center; min-height: 100vh;
            font-family: var(--font-sans); color: var(--text-tertiary); font-size: var(--text-sm);
        }

        .en-topo {
            display: flex; flex-direction: column; gap: var(--space-3);
            padding: max(var(--space-5), env(safe-area-inset-top)) var(--space-4) var(--space-5);
            border-bottom: 1px solid var(--border-subtle);
        }
        .en-topo__marca { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
        /* Regra do DS: lockup dimensionado pela ALTURA, largura em auto. */
        .en-logo { height: 20px; width: auto; display: block; }
        html[data-theme="light"] .en-logo { content: url("/assets/logo/5k9-lockup-horizontal-ink.png"); }
        .en-nome { margin: 0; font-size: 30px; line-height: 1.05; letter-spacing: var(--tracking-display); }
        .en-sub { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); }

        /* Espaço no fim para a barra fixa não cobrir a última fileira. */
        .en-corpo {
            flex: 1; display: flex; flex-direction: column; gap: var(--space-8);
            padding: var(--space-5) var(--space-4) calc(96px + env(safe-area-inset-bottom));
        }

        .en-filtros { display: flex; gap: var(--space-2); }
        .en-filtro {
            height: 36px; padding: 0 var(--space-4);
            border: 1px solid var(--border-default); border-radius: var(--radius-pill);
            background: transparent; color: var(--text-secondary);
            font-family: var(--font-sans); font-size: var(--text-sm); font-weight: 500; cursor: pointer;
        }
        .en-filtro span { margin-left: 4px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
        .en-filtro.is-active { background: var(--accent-muted); border-color: var(--accent-border); color: var(--accent); }
        .en-filtro.is-active span { color: inherit; }
        .en-vazio-filtro { margin: 0; font-size: var(--text-sm); color: var(--text-tertiary); }
        .en-vazio-filtro[hidden], .en-projeto[hidden], .en-foto[hidden] { display: none; }

        .en-apresentacoes { display: flex; flex-direction: column; gap: var(--space-3); }
        .en-apr {
            display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3);
            border: 1px solid var(--border-default); border-radius: var(--radius-lg);
            background: var(--surface-1); color: var(--text-primary); text-decoration: none;
            -webkit-tap-highlight-color: transparent;
        }
        .en-apr__capa {
            width: 88px; height: 88px; flex-shrink: 0; border-radius: var(--radius-md); overflow: hidden;
            display: flex; align-items: center; justify-content: center;
            background: var(--accent-muted); color: var(--accent);
        }
        .en-apr__capa img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .en-apr__capa svg { width: 28px; height: 28px; }
        .en-apr__texto { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .en-apr__texto small { font-size: var(--text-xs); color: var(--text-tertiary); }
        .en-apr__texto b { font-size: var(--text-body); font-weight: 600; }
        .en-apr__estado { align-self: flex-start; padding: 2px 10px; border-radius: var(--radius-pill);
                          font-size: var(--text-xs); font-weight: 600; background: var(--accent-muted); color: var(--accent); }
        .en-apr__estado.is-aprovada { background: var(--success-muted); color: var(--success); }
        .en-apr__seta { width: 20px; height: 20px; color: var(--text-tertiary); flex-shrink: 0; }

        .en-projeto { display: flex; flex-direction: column; gap: var(--space-3); }
        .en-projeto__cabeca { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
        .en-projeto__cabeca h2 { margin: 0; font-size: var(--text-h3); font-weight: 600; letter-spacing: var(--tracking-tight); }
        .en-projeto__cabeca span { font-size: var(--text-xs); color: var(--text-tertiary); white-space: nowrap; }
        .en-projeto__texto { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); max-width: 60ch; }

        .en-grade { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }

        .en-foto {
            position: relative; display: block; aspect-ratio: 1;
            border-radius: var(--radius-sm); overflow: hidden;
            background: var(--surface-3);
            -webkit-tap-highlight-color: transparent;
        }
        .en-foto__abrir { display: block; width: 100%; height: 100%; }
        .en-foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .en-foto.is-escolhida { outline: 2px solid var(--success); outline-offset: -2px; }
        .en-foto.is-sem-arquivo::after {
            content: 'Foto indisponível neste aparelho';
            position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
            padding: var(--space-3); text-align: center;
            font-size: var(--text-xs); color: var(--text-tertiary);
        }

        /* 44px: o coração é o botão mais tocado da tela, e no celular o dedo
           não acerta 30px no canto de uma foto. */
        .en-coracao {
            position: absolute; right: 4px; bottom: 4px;
            width: 44px; height: 44px; border: none; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            background: var(--glass-bg); color: var(--text-primary);
            -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
            cursor: pointer;
        }
        .en-coracao i, .en-coracao svg { width: 20px; height: 20px; }
        .en-coracao[aria-pressed="true"] { background: var(--success); color: var(--accent-contrast); }
        .en-coracao[aria-pressed="true"] svg, .en-escolher[aria-pressed="true"] svg { fill: currentColor; }

        .en-barra {
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
            padding: var(--space-3) var(--space-4) max(var(--space-3), env(safe-area-inset-bottom));
            background: var(--glass-bg);
            -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
            border-top: 1px solid var(--glass-border);
        }
        .en-barra__texto { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
        .en-barra__texto b { color: var(--text-primary); }

        .en--aviso { align-items: center; justify-content: center; padding: var(--space-6) var(--space-4); }
        .en-aviso { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }

        .en-erro {
            position: fixed; left: var(--space-4); right: var(--space-4); bottom: calc(80px + env(safe-area-inset-bottom));
            z-index: 60; margin: 0; padding: var(--space-3) var(--space-4);
            border-radius: var(--radius-md); background: var(--danger-muted); color: var(--danger);
            font-family: var(--font-sans); font-size: var(--text-sm);
        }

        /* ── A foto em tela cheia ──────────────────────────────────────── */
        .en-visor {
            position: fixed; inset: 0; z-index: 100;
            display: flex; flex-direction: column;
            background: var(--surface-base); color: var(--text-primary);
            font-family: var(--font-sans);
        }
        .en-visor__topo {
            display: flex; align-items: center; gap: var(--space-3);
            padding: max(var(--space-3), env(safe-area-inset-top)) var(--space-4) var(--space-3);
        }
        .en-visor__fechar { width: 40px; height: 40px; text-decoration: none; }
        .en-visor__conta { font-size: var(--text-sm); color: var(--text-secondary); min-width: 0;
                           white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .en-visor__palco {
            position: relative; flex: 1; min-height: 0;
            display: flex; align-items: center; justify-content: center;
            padding: 0 var(--space-2);
            touch-action: pan-y pinch-zoom;
        }
        /* Ocupa o palco inteiro e o contain encaixa: a miniatura e a foto
           grande caem no mesmo retângulo, e a troca de uma pela outra não
           faz a imagem pular de tamanho. */
        .en-visor__img { width: 100%; height: 100%; object-fit: contain; display: block; }

        .en-visor__seta {
            position: absolute; top: 50%; transform: translateY(-50%);
            width: 44px; height: 44px; border: none; border-radius: 50%;
            display: none; align-items: center; justify-content: center;
            background: var(--glass-bg); color: var(--text-primary); cursor: pointer;
            -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
        }
        .en-visor__seta i, .en-visor__seta svg { width: 22px; height: 22px; }
        .en-visor__seta--antes { left: var(--space-4); }
        .en-visor__seta--depois { right: var(--space-4); }

        .en-visor__base {
            display: flex; justify-content: center;
            padding: var(--space-3) var(--space-4) max(var(--space-4), env(safe-area-inset-bottom));
        }
        .en-escolher {
            display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
            width: 100%; max-width: 360px; height: 52px; border-radius: var(--radius-pill);
            border: 1px solid var(--border-default); background: var(--surface-2); color: var(--text-primary);
            font-family: var(--font-sans); font-size: var(--text-body); font-weight: 600; cursor: pointer;
        }
        .en-escolher i, .en-escolher svg { width: 20px; height: 20px; }
        .en-escolher[aria-pressed="true"] { background: var(--success); border-color: var(--success); color: var(--accent-contrast); }

        /* ── Crescendo ─────────────────────────────────────────────────── */
        @media (min-width: 640px) {
            .en-grade { grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }
            .en-topo, .en-corpo { padding-left: var(--space-8); padding-right: var(--space-8); }
            .en-barra { padding-left: var(--space-8); padding-right: var(--space-8); }
        }
        @media (min-width: 1024px) {
            .en-topo { padding-top: var(--space-8); }
            .en-topo, .en-corpo, .en-barra__texto { width: 100%; max-width: 1200px; margin: 0 auto; }
            .en-topo { border-bottom: none; }
            .en-grade { grid-template-columns: repeat(4, 1fr); }
            .en-nome { font-size: 44px; }
            .en-barra { display: flex; justify-content: center; }
            /* No mouse as setas aparecem; no toque quem troca é o deslizar. */
            .en-visor__seta { display: flex; }
        }
        @media (hover: hover) and (min-width: 640px) {
            .en-visor__seta { display: flex; }
        }
    `;
    document.head.appendChild(style);
}
