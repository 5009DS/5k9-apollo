import { store, consentimentoValido, modeloDe } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirMenu } from '../components/menu.js';
import { openDrawer, closeDrawer } from '../components/drawer.js';
import { toast } from '../components/toast.js';
import { midia } from '../lib/midia.js';
import { ACEITOS, VIDEOS } from '../lib/fotos.js';
import { conversas, ato, daEquipe, estadoMeta } from '../lib/conversa.js';
import { esc, haQuanto, plural } from '../lib/formato.js';
import { vazioHTML, caminhoDoCliente } from '../lib/pecas.js';
import { BLOCOS, ADICIONAVEIS, PAGINA_INICIAL, hexValido } from '../lib/blocos.js';

/* ═══════════════════════════════════════════════════════════════════════════
   ORGANIZAÇÃO DA PÁGINA — /projeto/:id/pagina.

   Onde o formato é escolhido e a apresentação é montada (README, "A
   organização da página"). Três colunas:

     blocos   a ordem da página — arrastar, adicionar, remover
     prévia   o rascunho desenhado pela MESMA tela do cliente, num iframe
     editor   os campos do bloco escolhido, gravados enquanto se digita

   ── RASCUNHO E PUBLICAÇÃO ─────────────────────────────────────────────────
   Tudo que se edita aqui é rascunho, e o cliente não vê. "Publicar" congela
   uma versão nova (store.publicar). O selo no topo diz se há mudança não
   publicada — é a pergunta que alguém faz antes de mandar o link.

   ── GRAVAR ENQUANTO DIGITA ────────────────────────────────────────────────
   Sem botão de salvar: cada campo grava sozinho, 400ms depois da última
   tecla, e a prévia se redesenha. Mudança de estrutura — item novo, imagem
   escolhida, ordem — grava na hora, porque redesenha o editor.
   ═══════════════════════════════════════════════════════════════════════════ */

const ESPERA = 400;

let estado = { projetoId: null, selecionado: null, aparelho: 'mesa' };

export const renderPagina = async (container, projetoId) => {
    if (estado.projetoId !== projetoId) estado = { projetoId, selecionado: null, aparelho: 'mesa' };

    const t = await store.tudo();
    const projeto = t.projetos.find(p => p.id === projetoId);
    if (!projeto) return naoEncontrado(container, projetoId);
    const cliente = t.clientes.find(c => c.id === projeto.cliente_id) || null;
    const modelo = modeloDe(projeto);

    // A apresentação nasce com a página sugerida, para ninguém começar de
    // uma tela em branco. Só na primeira vez: página esvaziada de propósito
    // continua vazia.
    if (modelo === 'apresentacao') {
        const blocos = await store.blocosDe(projetoId);
        const pubs = await store.publicacoesDe(projetoId);
        if (!blocos.length && !pubs.length) await semear(projeto);
    }

    const [blocos, pubs, temMudancas] = await Promise.all([
        store.blocosDe(projetoId), store.publicacoesDe(projetoId), store.temMudancas(projetoId),
    ]);
    if (!blocos.some(b => b.id === estado.selecionado)) estado.selecionado = blocos[0]?.id || null;

    const publicada = pubs[0];
    const { content } = renderShell(container, {
        path: `/projeto/${projetoId}/pagina`,
        crumbs: [{ href: '/', label: 'Projetos' }],
        title: esc(projeto.nome),
        subtitle: `${esc(cliente?.nome || 'Cliente removido')} · organização da página`,
        actions: `
            <a class="ds-btn ds-btn--ghost" href="/galeria/${esc(projetoId)}">
                <i data-lucide="images"></i> Imagens</a>
            ${modelo === 'apresentacao' && publicada && cliente ? `
                <a class="ds-btn ds-btn--ghost" href="${caminhoDoCliente(cliente)}/p/${esc(projetoId)}" target="_blank" rel="noopener">
                    <i data-lucide="external-link"></i> Ver como o cliente vê</a>` : ''}
            ${modelo === 'apresentacao' ? `
                <button class="ds-btn ds-btn--primary" id="pg-publicar" ${temMudancas ? '' : 'disabled'}>
                    <i data-lucide="send"></i> Publicar versão ${(publicada?.numero || 0) + 1}
                </button>` : ''}`,
    });
    container.insertAdjacentHTML('beforeend', ESTILOS);

    content.innerHTML = `
        <article class="ds-card ap-secao pg-formato">
            <div class="ap-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Formato</h2>
                    <span class="ds-card-sub">Como este projeto chega ao cliente</span>
                </div>
                ${modelo === 'apresentacao' ? `<span class="pg-situacao ${temMudancas ? 'is-pendente' : ''}">
                    <i data-lucide="${temMudancas ? 'pencil-line' : 'check'}"></i>
                    ${!publicada ? 'Ainda não publicada' : temMudancas ? `Mudanças não publicadas desde a versão ${publicada.numero}`
                      : `Versão ${publicada.numero} publicada ${haQuanto(publicada.criado_em)}`}</span>` : ''}
            </div>
            <div class="pg-opcoes" role="radiogroup" aria-label="Formato">
                ${opcaoFormato('selecao', 'Seleção de fotos', 'Grade com coração: o cliente escolhe. Ensaio, evento.', modelo)}
                ${opcaoFormato('apresentacao', 'Apresentação', 'Página editorial em blocos: identidade visual, campanha, case. O cliente aprova ou pede ajuste.', modelo)}
            </div>
        </article>

        ${modelo === 'apresentacao' ? `
            <div class="pg-grade">
                <aside class="ds-card pg-coluna pg-coluna--blocos">
                    ${destaqueHTML(projeto, blocos)}
                    <div class="pg-coluna__cabeca"><b>Blocos</b><small>arraste para ordenar</small></div>
                    <ol class="pg-blocos" id="pg-blocos">${blocos.map(b => blocoHTML(b)).join('')}</ol>
                    <button class="ds-btn ds-btn--ghost ds-btn--sm pg-adicionar" id="pg-adicionar" aria-haspopup="menu">
                        <i data-lucide="plus"></i> Adicionar bloco</button>
                </aside>

                <section class="ds-card pg-coluna pg-coluna--previa">
                    <div class="pg-previa__barra">
                        <div class="ap-filtros" role="group" aria-label="Aparelho da prévia">
                            <button class="ap-filtro ${estado.aparelho === 'celular' ? 'is-active' : ''}" data-aparelho="celular">
                                <i data-lucide="smartphone"></i> Celular</button>
                            <button class="ap-filtro ${estado.aparelho === 'mesa' ? 'is-active' : ''}" data-aparelho="mesa">
                                <i data-lucide="monitor"></i> Mesa</button>
                        </div>
                        <small>A mesma tela que o cliente vai ver</small>
                    </div>
                    <div class="pg-previa__moldura" id="pg-moldura" data-aparelho="${estado.aparelho}">
                        <iframe id="pg-iframe" src="/projeto/${esc(projetoId)}/previa" title="Prévia da apresentação"></iframe>
                    </div>
                </section>

                <aside class="ds-card pg-coluna pg-coluna--editor" id="pg-editor"></aside>
            </div>

            <article class="ds-card ap-secao" id="pg-versoes"></article>`
        : `
            <article class="ds-card ap-secao">
                ${vazioHTML('grid-3x3', 'A página é a grade das fotos',
                    'No formato seleção não há blocos para montar: o cliente vê as fotos autorizadas e escolhe com o coração.',
                    `<a class="ds-btn ds-btn--ghost" href="/galeria/${esc(projetoId)}">Abrir as imagens</a>`)}
            </article>`}
    `;

    const redesenhar = () => renderPagina(container, projetoId);

    content.querySelectorAll('[data-formato]').forEach(b => b.addEventListener('click', async () => {
        if (b.dataset.formato === modelo) return;
        await store.projetos.salvar({ ...projeto, modelo: b.dataset.formato });
        toast(b.dataset.formato === 'apresentacao'
            ? 'Agora é uma apresentação. A página começou com os blocos sugeridos.'
            : 'Agora é uma seleção de fotos. Os blocos ficam guardados, fora do link.');
        redesenhar();
    }));

    if (modelo !== 'apresentacao') { if (window.lucide) lucide.createIcons(); return; }

    const ctx = { container, content, projeto, cliente, blocos, redesenhar, t };
    ligarPublicar(ctx);
    ligarDestaque(ctx);
    ligarLista(ctx);
    ligarPrevia(ctx);
    desenharEditor(ctx);
    desenharVersoes(ctx);
    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────

const opcaoFormato = (valor, rotulo, texto, atual) => `
    <button class="pg-opcao ${valor === atual ? 'is-ativa' : ''}" data-formato="${valor}"
            role="radio" aria-checked="${valor === atual}">
        <i data-lucide="${valor === 'apresentacao' ? 'presentation' : 'grid-3x3'}"></i>
        <span><b>${rotulo}</b><small>${texto}</small></span>
    </button>`;

const semear = async (projeto) => {
    for (const [i, tipo] of PAGINA_INICIAL.entries()) {
        await store.blocos.salvar({
            projeto_id: projeto.id, tipo, ordem: i,
            dados: BLOCOS[tipo].padrao({ projeto }), editado_em: null,
        });
    }
};

const blocoHTML = (b) => {
    const tipo = BLOCOS[b.tipo] || { rotulo: b.tipo, icone: 'square', resumo: () => '' };
    const fixo = tipo.fixo;
    return `
        <li class="pg-bloco ${b.id === estado.selecionado ? 'is-ativo' : ''}" data-bloco="${esc(b.id)}"
            ${fixo ? '' : 'draggable="true"'}>
            <span class="pg-bloco__alca" aria-hidden="true">${fixo ? '<i data-lucide="lock"></i>' : '<i data-lucide="grip-vertical"></i>'}</span>
            <button class="pg-bloco__abrir" data-escolher="${esc(b.id)}">
                <span class="pg-bloco__icone"><i data-lucide="${tipo.icone}"></i></span>
                <span class="pg-bloco__texto">
                    <b>${esc(tipo.rotulo)}</b>
                    <small>${esc(tipo.resumo?.(b.dados || {}) || '')}</small>
                </span>
            </button>
            ${fixo ? '' : `
                <span class="pg-bloco__acoes">
                    <button class="pg-mini" data-mover="${esc(b.id)}" data-dir="-1" aria-label="Subir"><i data-lucide="chevron-up"></i></button>
                    <button class="pg-mini" data-mover="${esc(b.id)}" data-dir="1" aria-label="Descer"><i data-lucide="chevron-down"></i></button>
                    <button class="pg-mini pg-mini--perigo" data-remover="${esc(b.id)}" aria-label="Remover bloco"><i data-lucide="trash-2"></i></button>
                </span>`}
        </li>`;
};

/* A cor de destaque, com as cores da paleta como atalho: a cor que dá o tom
   da página do cliente quase sempre já está na paleta dele. */
const destaqueHTML = (projeto, blocos) => {
    const atual = hexValido(projeto.visual?.destaque) ? projeto.visual.destaque : '';
    const daPaleta = blocos.filter(b => b.tipo === 'paleta')
        .flatMap(b => (b.dados?.cores || []).map(c => c.hex)).filter(hexValido);
    return `
        <div class="pg-destaque">
            <div class="pg-coluna__cabeca"><b>Cor de destaque</b><small>dá o tom da página</small></div>
            <div class="pg-cor">
                <input type="color" id="pg-destaque-cor" value="${esc(atual || '#7F00E1')}" aria-label="Cor de destaque">
                <input type="text" class="ds-input" id="pg-destaque-hex" value="${esc(atual)}" placeholder="Roxo da 5K9" maxlength="7">
            </div>
            ${daPaleta.length ? `<div class="pg-chips">${[...new Set(daPaleta)].map(h => `
                <button class="pg-chip" data-destaque="${esc(h)}" style="background:${h}" title="${esc(h)}"
                        aria-label="Usar ${esc(h)}"></button>`).join('')}</div>` : ''}
        </div>`;
};

// ─────────────────────────────────────────────────────────────────────────
// Publicar, destaque, lista e prévia
// ─────────────────────────────────────────────────────────────────────────

const avisarPrevia = (mensagem) =>
    document.getElementById('pg-iframe')?.contentWindow?.postMessage(mensagem, window.location.origin);

/* Depois de gravar: a prévia relê o rascunho, e o selo de "mudanças não
   publicadas" e o botão de publicar acompanham. Sem redesenhar a página —
   o cursor continua no campo em que a pessoa estava. */
const depoisDeGravar = async (ctx) => {
    avisarPrevia({ tipo: 'apollo:redesenhar' });
    const mudou = await store.temMudancas(ctx.projeto.id);
    const botao = document.getElementById('pg-publicar');
    if (botao) botao.disabled = !mudou;
    const selo = ctx.content.querySelector('.pg-situacao');
    if (selo && mudou && !selo.classList.contains('is-pendente')) {
        selo.classList.add('is-pendente');
        selo.innerHTML = '<i data-lucide="pencil-line"></i> Mudanças não publicadas';
        if (window.lucide) lucide.createIcons();
    }
};

const ligarPublicar = (ctx) => {
    document.getElementById('pg-publicar')?.addEventListener('click', async (e) => {
        const botao = e.currentTarget;
        botao.disabled = true;
        try {
            const pub = await store.publicar(ctx.projeto.id);
            toast(`Versão ${pub.numero} publicada. O cliente já vê esta versão no link.`,
                ctx.cliente ? { label: 'Abrir', href: `${caminhoDoCliente(ctx.cliente)}/p/${ctx.projeto.id}` } : undefined);
            ctx.redesenhar();
        } catch (falha) {
            toast(esc(falha.message || 'Não foi possível publicar.'));
            botao.disabled = false;
        }
    });
};

const ligarDestaque = (ctx) => {
    const cor = ctx.content.querySelector('#pg-destaque-cor');
    const hex = ctx.content.querySelector('#pg-destaque-hex');
    let espera;
    const gravar = (valor) => {
        clearTimeout(espera);
        espera = setTimeout(async () => {
            const destaque = hexValido(valor) ? valor.toUpperCase() : null;
            ctx.projeto = await store.projetos.salvar({
                ...ctx.projeto, visual: { ...(ctx.projeto.visual || {}), destaque },
            });
            depoisDeGravar(ctx);
        }, ESPERA);
    };
    cor?.addEventListener('input', () => { hex.value = cor.value.toUpperCase(); gravar(cor.value); });
    hex?.addEventListener('input', () => {
        const v = hex.value.trim();
        if (hexValido(v)) cor.value = v;
        if (hexValido(v) || v === '') gravar(v);
    });
    ctx.content.querySelectorAll('[data-destaque]').forEach(b => b.addEventListener('click', () => {
        cor.value = b.dataset.destaque;
        hex.value = b.dataset.destaque.toUpperCase();
        gravar(b.dataset.destaque);
    }));
};

const ligarLista = (ctx) => {
    const lista = ctx.content.querySelector('#pg-blocos');

    const escolher = (id) => {
        estado.selecionado = id;
        lista.querySelectorAll('.pg-bloco').forEach(li => li.classList.toggle('is-ativo', li.dataset.bloco === id));
        desenharEditor(ctx);
        avisarPrevia({ tipo: 'apollo:ir', bloco: id });
    };
    lista.querySelectorAll('[data-escolher]').forEach(b => b.addEventListener('click', () => escolher(b.dataset.escolher)));

    /* Reordenar grava a ordem inteira, com o fechamento sempre no fim: ele é
       da moldura, e uma página que pede aprovação no meio não faz sentido. */
    const gravarOrdem = async (ids) => {
        const fixos = ids.filter(id => BLOCOS[ctx.blocos.find(b => b.id === id)?.tipo]?.fixo);
        const ordem = [...ids.filter(id => !fixos.includes(id)), ...fixos];
        await store.reordenar(ordem);
        ctx.redesenhar();
    };

    lista.querySelectorAll('[data-mover]').forEach(b => b.addEventListener('click', () => {
        const ids = ctx.blocos.map(x => x.id);
        const i = ids.indexOf(b.dataset.mover);
        const j = i + Number(b.dataset.dir);
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        gravarOrdem(ids);
    }));

    // Remover em dois toques, no próprio botão — sem diálogo empilhado.
    lista.querySelectorAll('[data-remover]').forEach(b => b.addEventListener('click', async () => {
        if (b.dataset.confirmando !== 'sim') {
            b.dataset.confirmando = 'sim';
            b.classList.add('is-confirmando');
            b.innerHTML = 'Remover?';
            setTimeout(() => {
                if (!b.isConnected) return;
                b.dataset.confirmando = '';
                b.classList.remove('is-confirmando');
                b.innerHTML = '<i data-lucide="trash-2"></i>';
                if (window.lucide) lucide.createIcons();
            }, 4000);
            return;
        }
        await store.blocos.excluir(b.dataset.remover);
        toast('Bloco removido do rascunho. A versão publicada não muda até publicar de novo.');
        ctx.redesenhar();
    }));

    // Arrastar: HTML5 nativo. Os botões de subir e descer continuam lá para
    // quem usa teclado e para o toque, onde arrastar em lista é ruim.
    let arrastado = null;
    lista.querySelectorAll('.pg-bloco[draggable]').forEach(li => {
        li.addEventListener('dragstart', (e) => {
            arrastado = li.dataset.bloco;
            li.classList.add('is-arrastando');
            e.dataTransfer.effectAllowed = 'move';
        });
        li.addEventListener('dragend', () => li.classList.remove('is-arrastando'));
    });
    lista.addEventListener('dragover', (e) => {
        if (!arrastado) return;
        e.preventDefault();
        const alvo = e.target.closest('.pg-bloco');
        lista.querySelectorAll('.pg-bloco').forEach(li => li.classList.toggle('is-alvo', li === alvo && li.dataset.bloco !== arrastado));
    });
    lista.addEventListener('drop', (e) => {
        e.preventDefault();
        const alvo = e.target.closest('.pg-bloco');
        if (!arrastado || !alvo || alvo.dataset.bloco === arrastado) { arrastado = null; return; }
        const ids = ctx.blocos.map(x => x.id).filter(id => id !== arrastado);
        ids.splice(ids.indexOf(alvo.dataset.bloco), 0, arrastado);
        arrastado = null;
        gravarOrdem(ids);
    });

    const adicionar = ctx.content.querySelector('#pg-adicionar');
    adicionar.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirMenu(adicionar, ADICIONAVEIS.map(tipo => ({
            id: tipo, label: BLOCOS[tipo].rotulo, icon: BLOCOS[tipo].icone,
            onClick: async () => {
                const novo = await store.blocos.salvar({
                    projeto_id: ctx.projeto.id, tipo, ordem: ctx.blocos.length,
                    dados: BLOCOS[tipo].padrao({ projeto: ctx.projeto }), editado_em: null,
                });
                estado.selecionado = novo.id;
                // Entra antes do fechamento: gravarOrdem põe o fixo no fim.
                await store.reordenar([...ctx.blocos.filter(b => !BLOCOS[b.tipo]?.fixo).map(b => b.id), novo.id,
                                       ...ctx.blocos.filter(b => BLOCOS[b.tipo]?.fixo).map(b => b.id)]);
                ctx.redesenhar();
            },
        })), { alinhar: 'esquerda' });
    });
};

/* O iframe tem o tamanho de verdade do aparelho — 390 px no celular, 1280 na
   mesa — e é reduzido para caber na coluna. Assim a página do cliente
   responde às próprias regras de tela, e não à largura da coluna. */
const APARELHOS = { celular: { largura: 390, altura: 844 }, mesa: { largura: 1280, altura: 860 } };

const ligarPrevia = (ctx) => {
    const moldura = ctx.content.querySelector('#pg-moldura');
    const iframe = ctx.content.querySelector('#pg-iframe');

    const ajustar = () => {
        const a = APARELHOS[estado.aparelho];
        const altura = Math.max(420, window.innerHeight - 260);
        const escala = Math.min(1, moldura.clientWidth / a.largura, estado.aparelho === 'celular' ? altura / a.altura : 1);
        const alturaIframe = estado.aparelho === 'celular' ? a.altura : altura / escala;
        iframe.style.width = `${a.largura}px`;
        iframe.style.height = `${alturaIframe}px`;
        iframe.style.transform = `scale(${escala})`;
        moldura.style.height = `${alturaIframe * escala}px`;
        moldura.dataset.aparelho = estado.aparelho;
    };
    ajustar();
    new ResizeObserver(ajustar).observe(moldura);

    iframe.addEventListener('load', () => {
        if (estado.selecionado) avisarPrevia({ tipo: 'apollo:ir', bloco: estado.selecionado });
    });

    ctx.content.querySelectorAll('[data-aparelho]').forEach(b => {
        if (b === moldura) return;
        b.addEventListener('click', () => {
            estado.aparelho = b.dataset.aparelho;
            ctx.content.querySelectorAll('button[data-aparelho]').forEach(x =>
                x.classList.toggle('is-active', x.dataset.aparelho === estado.aparelho));
            ajustar();
        });
    });
};

// ─────────────────────────────────────────────────────────────────────────
// Editor do bloco
// ─────────────────────────────────────────────────────────────────────────

const lerCaminho = (obj, caminho) => caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const gravarCaminho = (obj, caminho, valor) => {
    const partes = caminho.split('.');
    const ultimo = partes.pop();
    const pai = partes.reduce((o, k) => o[k], obj);
    pai[ultimo] = valor;
};

const desenharEditor = (ctx) => {
    const coluna = ctx.content.querySelector('#pg-editor');
    const bloco = ctx.blocos.find(b => b.id === estado.selecionado);
    if (!bloco) {
        coluna.innerHTML = vazioHTML('mouse-pointer-click', 'Escolha um bloco', 'Os campos dele aparecem aqui.');
        return;
    }
    const tipo = BLOCOS[bloco.tipo];
    const dados = structuredClone(bloco.dados || {});

    const pecas = new Map(ctx.t.pecas.filter(p => p.projeto_id === ctx.projeto.id).map(p => [p.id, p]));
    const versoes = new Map(ctx.t.versoes.map(v => [v.peca_id, v]));
    const consent = new Map(ctx.t.consentimentos.map(c => [c.peca_id, c]));
    const ed = { ctx, bloco, dados, pecas, versoes, consent };

    /* Os ouvintes vão num invólucro NOVO a cada desenho, e não na coluna: a
       coluna sobrevive à troca de bloco, e ouvinte ligado nela se acumularia
       — cada tecla acabaria gravando uma vez por bloco já aberto. */
    coluna.innerHTML = `
        <div class="pg-editor">
            <div class="pg-coluna__cabeca">
                <b><i data-lucide="${tipo.icone}"></i> ${esc(tipo.rotulo)}</b>
                <small>${esc(tipo.descricao)}</small>
            </div>
            <div class="pg-campos">${camposHTML(tipo.campos, dados, '', ed)}</div>
        </div>`;
    const alvo = coluna.firstElementChild;
    pintarMiniaturas(alvo);
    if (window.lucide) lucide.createIcons();

    let espera;
    const gravar = async ({ redesenharEditor = false } = {}) => {
        clearTimeout(espera);
        const salvo = await store.blocos.salvar({ ...bloco, dados: structuredClone(dados), editado_em: new Date().toISOString() });
        Object.assign(bloco, salvo);
        // O resumo na lista acompanha ("3 versões", o título novo).
        const li = ctx.content.querySelector(`.pg-bloco[data-bloco="${CSS.escape(bloco.id)}"] small`);
        if (li) li.textContent = tipo.resumo?.(dados) || '';
        if (redesenharEditor) desenharEditor(ctx);
        depoisDeGravar(ctx);
    };

    alvo.addEventListener('input', (e) => {
        const el = e.target.closest('[data-caminho]');
        if (!el) return;
        let valor = el.type === 'checkbox' ? el.checked : el.value;
        if (el.dataset.par === 'hex') {
            // O par de campos de cor: o seletor e o texto andam juntos.
            const irmao = el.parentElement.querySelector(el.type === 'color' ? 'input[type=text]' : 'input[type=color]');
            if (el.type === 'color') { valor = valor.toUpperCase(); irmao.value = valor; }
            else if (hexValido(valor)) irmao.value = valor;
            else return;
        }
        gravarCaminho(dados, el.dataset.caminho, valor);
        clearTimeout(espera);
        espera = setTimeout(() => gravar(), ESPERA);
    });
    // Escolha e caixa redesenham o editor: um campo pode depender delas
    // (a cor do fundo só aparece quando o fundo é "outra cor").
    alvo.addEventListener('change', (e) => {
        const el = e.target.closest('select[data-caminho], input[type=checkbox][data-caminho]');
        if (el) gravar({ redesenharEditor: true });
    });

    alvo.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.adicionarItem) {
            const lista = lerCaminho(dados, b.dataset.adicionarItem) || [];
            const campo = acharCampo(tipo.campos, b.dataset.adicionarItem);
            lista.push(campo.novo());
            gravarCaminho(dados, b.dataset.adicionarItem, lista);
            return gravar({ redesenharEditor: true });
        }
        if (b.dataset.moverItem) {
            const lista = lerCaminho(dados, b.dataset.moverItem);
            const i = Number(b.dataset.i), j = i + Number(b.dataset.dir);
            if (j < 0 || j >= lista.length) return;
            [lista[i], lista[j]] = [lista[j], lista[i]];
            return gravar({ redesenharEditor: true });
        }
        if (b.dataset.removerItem) {
            const lista = lerCaminho(dados, b.dataset.removerItem);
            const [fora] = lista.splice(Number(b.dataset.i), 1);
            if (fora?.fonte_chave) await midia.apagar([fora.fonte_chave]);
            return gravar({ redesenharEditor: true });
        }
        if (b.dataset.escolherImagem) {
            return escolherImagem(ed, (pecaId) => {
                gravarCaminho(dados, b.dataset.escolherImagem, pecaId ? { peca: pecaId } : null);
                gravar({ redesenharEditor: true });
            }, { video: 'video' in b.dataset });
        }
        if (b.dataset.tirarImagem) {
            gravarCaminho(dados, b.dataset.tirarImagem, null);
            return gravar({ redesenharEditor: true });
        }
        if (b.dataset.semPessoa) {
            await store.consentir([b.dataset.semPessoa], { motivo: 'sem_pessoa' });
            ctx.t.consentimentos = await store.consentimentos.listar();
            toast('Registrado: sem pessoa identificável. A imagem já pode aparecer para o cliente.');
            desenharEditor(ctx);
            return depoisDeGravar(ctx);
        }
        if (b.dataset.tirarFonte) {
            const item = lerCaminho(dados, b.dataset.tirarFonte);
            if (item?.fonte_chave) await midia.apagar([item.fonte_chave]);
            Object.assign(item, { fonte_chave: null, arquivo_nome: '' });
            return gravar({ redesenharEditor: true });
        }
    });

    alvo.querySelectorAll('input[type=file][data-fonte]').forEach(entrada => entrada.addEventListener('change', async () => {
        const arquivo = entrada.files?.[0];
        if (!arquivo) return;
        const item = lerCaminho(dados, entrada.dataset.fonte);
        try {
            const enviada = await store.enviarFonte(ctx.projeto.id, arquivo);
            if (item.fonte_chave) await midia.apagar([item.fonte_chave]);
            Object.assign(item, enviada);
            if (!item.nome) item.nome = arquivo.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
            gravar({ redesenharEditor: true });
        } catch (falha) {
            toast(esc(falha.message));
        }
    }));
};

const acharCampo = (campos, caminho) => {
    // 'itens' ou 'fontes' — o caminho de uma lista é o nome do campo nela.
    const nome = caminho.split('.').filter(p => !/^\d+$/.test(p)).pop();
    const procurar = (lista) => {
        for (const c of lista || []) {
            if (c.nome === nome && c.tipo === 'lista') return c;
            const dentro = procurar(c.campos);
            if (dentro) return dentro;
        }
        return null;
    };
    return procurar(campos);
};

const camposHTML = (campos, dados, prefixo, ed) => campos
    .filter(c => !c.quando || c.quando(dados || {}))
    .map(c => campoHTML(c, dados?.[c.nome], prefixo ? `${prefixo}.${c.nome}` : c.nome, dados, ed))
    .join('');

const rotulo = (c) => `<span class="pg-campo__rotulo">${esc(c.rotulo)}</span>`;
const dica = (c) => (c.dica ? `<span class="pg-campo__dica">${esc(c.dica)}</span>` : '');

const campoHTML = (c, valor, caminho, dono, ed) => {
    const metade = c.largura === 'metade' ? 'pg-campo--metade' : '';
    switch (c.tipo) {
        case 'area':
            return `<label class="pg-campo">${rotulo(c)}
                <textarea class="ds-input pg-area" rows="5" data-caminho="${caminho}"
                          placeholder="${esc(c.placeholder || '')}">${esc(valor || '')}</textarea>${dica(c)}</label>`;
        case 'escolha':
            return `<label class="pg-campo ${metade}">${rotulo(c)}
                <select class="ds-input" data-caminho="${caminho}">
                    ${c.opcoes.map(o => `<option value="${esc(o.valor)}" ${o.valor === valor ? 'selected' : ''}>${esc(o.rotulo)}</option>`).join('')}
                </select>${dica(c)}</label>`;
        case 'cor':
            return `<div class="pg-campo ${metade}">${rotulo(c)}
                <div class="pg-cor">
                    <input type="color" data-caminho="${caminho}" data-par="hex" value="${esc(hexValido(valor) ? valor : '#7F00E1')}">
                    <input type="text" class="ds-input" data-caminho="${caminho}" data-par="hex" value="${esc(valor || '')}" maxlength="7">
                </div>${dica(c)}</div>`;
        case 'sim':
            return `<label class="pg-campo pg-campo--sim">
                <input type="checkbox" data-caminho="${caminho}" ${valor ? 'checked' : ''}>
                <span>${esc(c.rotulo)}</span></label>${dica(c)}`;
        case 'imagem':
            return imagemHTML(c, valor, caminho, ed);
        case 'video':
            return imagemHTML(c, valor, caminho, ed, { video: true });
        case 'fonte': {
            const dono_ = caminho.split('.').slice(0, -1).join('.');
            return `<div class="pg-campo">${rotulo(c)}
                <div class="pg-fonte">
                    ${dono?.fonte_chave
                        ? `<span><i data-lucide="file-type"></i> ${esc(dono.arquivo_nome || 'arquivo da fonte')}</span>
                           <button class="pg-mini" data-tirar-fonte="${dono_}" aria-label="Tirar o arquivo"><i data-lucide="x"></i></button>`
                        : '<span class="pg-campo__dica">Nenhum arquivo</span>'}
                    <label class="ds-btn ds-btn--ghost ds-btn--sm">${dono?.fonte_chave ? 'Trocar' : 'Enviar'}
                        <input type="file" data-fonte="${dono_}" accept=".woff2,.woff,.otf,.ttf" hidden></label>
                </div>
                <span class="pg-campo__dica">WOFF2, WOFF, OTF ou TTF.</span></div>`;
        }
        case 'lista': {
            const itens = Array.isArray(valor) ? valor : [];
            return `<div class="pg-campo pg-lista">${rotulo(c)}
                ${itens.map((item, i) => `
                    <div class="pg-item">
                        <div class="pg-item__topo">
                            <b>${esc(c.rotuloItem)} ${i + 1}</b>
                            <span>
                                <button class="pg-mini" data-mover-item="${caminho}" data-i="${i}" data-dir="-1" aria-label="Subir"><i data-lucide="chevron-up"></i></button>
                                <button class="pg-mini" data-mover-item="${caminho}" data-i="${i}" data-dir="1" aria-label="Descer"><i data-lucide="chevron-down"></i></button>
                                <button class="pg-mini pg-mini--perigo" data-remover-item="${caminho}" data-i="${i}" aria-label="Remover"><i data-lucide="x"></i></button>
                            </span>
                        </div>
                        <div class="pg-item__campos">${camposHTML(c.campos, item, `${caminho}.${i}`, ed)}</div>
                    </div>`).join('')}
                <button class="ds-btn ds-btn--ghost ds-btn--sm" data-adicionar-item="${caminho}">
                    <i data-lucide="plus"></i> Adicionar ${esc(c.rotuloItem)}</button>
            </div>`;
        }
        default:
            return `<label class="pg-campo ${metade}">${rotulo(c)}
                <input class="ds-input" type="text" data-caminho="${caminho}" value="${esc(valor ?? '')}"
                       placeholder="${esc(c.placeholder || '')}" autocomplete="off">${dica(c)}</label>`;
    }
};

/* O campo de imagem mostra a escolhida e, se ela não tem autorização, diz
   na hora — com o gesto de "sem pessoa" ao alcance, porque é o caso comum
   aqui: mockup e logo não têm ninguém para assinar termo. O campo de vídeo
   é o mesmo, com a biblioteca mostrando só os vídeos. */
const imagemHTML = (c, valor, caminho, ed, { video = false } = {}) => {
    const pecaId = valor?.peca || null;
    const peca = pecaId ? ed.pecas.get(pecaId) : null;
    const v = pecaId ? ed.versoes.get(pecaId) : null;
    const liberada = pecaId && consentimentoValido(ed.consent.get(pecaId));
    return `<div class="pg-campo">${rotulo(c)}
        <div class="pg-imagem">
            <span class="pg-imagem__mini">${v ? `<img data-chave="${esc(v.capa_chave)}" alt="">` : `<i data-lucide="${video ? 'film' : 'image'}"></i>`}</span>
            <span class="pg-imagem__nome">${peca ? esc(peca.titulo) : pecaId ? (video ? 'Vídeo removido' : 'Imagem removida') : 'Nenhum' + (video ? '' : 'a')}</span>
            <button class="ds-btn ds-btn--ghost ds-btn--sm" data-escolher-imagem="${caminho}" ${video ? 'data-video' : ''}>${pecaId ? 'Trocar' : 'Escolher'}</button>
            ${pecaId ? `<button class="pg-mini" data-tirar-imagem="${caminho}" aria-label="Tirar a imagem"><i data-lucide="x"></i></button>` : ''}
        </div>
        ${peca && !liberada ? `
            <div class="pg-alerta">
                <span><i data-lucide="shield-alert"></i> Sem autorização de imagem: o cliente não vê esta imagem.</span>
                <span class="pg-alerta__acoes">
                    <button class="ds-btn ds-btn--ghost ds-btn--sm" data-sem-pessoa="${esc(pecaId)}">Não tem pessoa identificável</button>
                    <a href="/galeria/${esc(ed.ctx.projeto.id)}">Registrar termo</a>
                </span>
            </div>` : ''}
        ${dica(c)}</div>`;
};

const pintarMiniaturas = (raiz) => {
    raiz.querySelectorAll('img[data-chave]').forEach(async (img) => {
        const url = await midia.url(img.dataset.chave).catch(() => null);
        if (url) img.src = url;
    });
};

/* A biblioteca de imagens do projeto, num painel: escolher uma, ou enviar
   mais sem sair da página. As imagens são peças do projeto — é isso que
   mantém consentimento e original sem endereço valendo (README). Com
   `video`, a mesma biblioteca lista e recebe só vídeos. */
const escolherImagem = (ed, aoEscolher, { video = false } = {}) => {
    const montar = async () => {
        const [pecas, versoes, consent] = await Promise.all([
            store.pecas.listar(), store.versoes.listar(), store.consentimentos.listar(),
        ]);
        const doProjeto = pecas.filter(p => p.projeto_id === ed.ctx.projeto.id && (p.tipo === 'video') === video);
        const v = new Map(versoes.map(x => [x.peca_id, x]));
        const c = new Map(consent.map(x => [x.peca_id, x]));
        return doProjeto.filter(p => v.has(p.id))
            .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
            .map(p => ({ p, v: v.get(p.id), ok: consentimentoValido(c.get(p.id)) }));
    };

    const corpo = (lista) => lista.length ? `
        <div class="pg-biblio">
            ${lista.map(({ p, v, ok }) => `
                <button class="pg-biblio__item" data-peca="${esc(p.id)}" title="${esc(p.titulo)}">
                    <img data-chave="${esc(v.capa_chave)}" alt="">
                    <span>${esc(p.titulo)}</span>
                    ${ok ? '' : '<em><i data-lucide="shield-alert"></i></em>'}
                </button>`).join('')}
        </div>` : video
            ? vazioHTML('film', 'Nenhum vídeo neste projeto', 'Envie a animação em MP4 ou WebM.')
            : vazioHTML('image-up', 'Nenhuma imagem neste projeto', 'Envie os arquivos da marca e os mockups.');

    const painelHTML = async () => `
        <label class="ds-btn ds-btn--ghost ds-btn--sm pg-biblio__enviar">
            <i data-lucide="upload"></i> ${video ? 'Enviar vídeos' : 'Enviar imagens'}
            <input type="file" multiple accept="${(video ? VIDEOS : ACEITOS).join(',')}" hidden data-enviar>
        </label>
        <p class="pg-biblio__progresso" hidden></p>
        <div data-lista>${corpo(await montar())}</div>`;

    (async () => {
        const painel = openDrawer({
            title: video ? 'Escolher vídeo' : 'Escolher imagem',
            subtitle: `${video ? 'Vídeos' : 'Imagens'} deste projeto · o escudo marca os sem autorização`,
            body: await painelHTML(),
            footer: '<button class="ds-btn ds-btn--ghost" data-dw-close>Fechar</button>',
        });
        const ligar = () => {
            pintarMiniaturas(painel);
            painel.querySelectorAll('[data-peca]').forEach(b => b.addEventListener('click', () => {
                closeDrawer();
                aoEscolher(b.dataset.peca);
            }));
            if (window.lucide) lucide.createIcons();
        };
        ligar();
        painel.querySelector('[data-dw-close]')?.addEventListener('click', closeDrawer);

        const entrada = painel.querySelector('[data-enviar]');
        const progresso = painel.querySelector('.pg-biblio__progresso');
        entrada.addEventListener('change', async () => {
            const arquivos = [...entrada.files];
            entrada.value = '';
            const erros = [];
            for (const [i, arquivo] of arquivos.entries()) {
                progresso.hidden = false;
                progresso.textContent = `Preparando ${i + 1} de ${arquivos.length} — ${arquivo.name}`;
                try { await (video ? store.enviarVideo : store.enviarFoto)(ed.ctx.projeto.id, arquivo, 0); }
                catch (e) { erros.push(e.message); }
            }
            progresso.textContent = erros.length ? erros.join(' · ')
                : `${video ? plural(arquivos.length, 'vídeo enviado', 'vídeos enviados') : plural(arquivos.length, 'imagem enviada', 'imagens enviadas')}.`;
            ed.ctx.t = await store.tudo();
            painel.querySelector('[data-lista]').innerHTML = corpo(await montar());
            ligar();
        });
    })();
};

// ─────────────────────────────────────────────────────────────────────────
// Versões e retorno do cliente
// ─────────────────────────────────────────────────────────────────────────

const desenharVersoes = async (ctx) => {
    const alvo = ctx.content.querySelector('#pg-versoes');
    const [pubs, aprovacoes, comentarios] = await Promise.all([
        store.publicacoesDe(ctx.projeto.id), store.aprovacoes.listar(), store.comentarios.listar(),
    ]);

    alvo.innerHTML = `
        <div class="ap-secao__cabeca">
            <div>
                <h2 class="ds-card-title">Versões e retorno do cliente</h2>
                <span class="ds-card-sub">${pubs.length ? plural(pubs.length, 'versão publicada', 'versões publicadas')
                                                       : 'Nada publicado ainda'}</span>
            </div>
        </div>
        ${pubs.length ? pubs.map((p, i) => {
            const aprovacao = aprovacoes.filter(a => a.publicacao_id === p.id && a.decisao === 'aprovado')
                .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0];
            const { fios } = conversas(comentarios.filter(c => c.publicacao_id === p.id));
            const situacao = aprovacao
                ? `<span class="ap-selo ap-selo--ok"><i data-lucide="circle-check"></i>Aprovada por ${esc(aprovacao.quem_nome)} · ${haQuanto(aprovacao.criado_em)}</span>`
                : i === 0 ? '<span class="ap-status ap-status--a_revisar"><i data-lucide="eye"></i>Com o cliente</span>'
                : `<span class="ap-status">Substituída pela versão ${pubs[i - 1].numero}</span>`;
            return `
                <article class="pg-versao">
                    <header class="pg-versao__topo">
                        <b>Versão ${p.numero}</b>
                        <small>publicada ${haQuanto(p.criado_em)}</small>
                        ${situacao}
                    </header>
                    ${fios.map(f => fioHTML(f)).join('')}
                </article>`;
        }).join('') : vazioHTML('send', 'Ainda não publicada',
            'Monte a página e publique. O cliente só vê o que foi publicado — e aprova uma versão de cada vez.')}`;

    alvo.querySelectorAll('[data-responder]').forEach(b => b.addEventListener('click', () => {
        const form = alvo.querySelector(`form[data-fio="${CSS.escape(b.dataset.responder)}"]`);
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector('textarea').focus();
    }));
    alvo.querySelectorAll('form[data-fio]').forEach(form => form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const raiz = comentarios.find(c => c.id === form.dataset.fio);
        await store.responder(raiz, { tipo: form.tipo.value, texto: form.texto.value, autor: 'Equipe 5K9' });
        toast('Resposta registrada. O cliente vê na apresentação.');
        desenharVersoes(ctx);
    }));
    if (window.lucide) lucide.createIcons();
};

const fioHTML = (f) => {
    const meta = estadoMeta(f.estado);
    return `
        <div class="pg-fio">
            <div class="pg-fio__topo">
                <span class="pg-fio__estado pg-fio__estado--${f.estado}"><i data-lucide="${meta.icone}"></i>${esc(meta.rotulo)}</span>
                ${f.estado !== 'fechado' ? `<button class="ds-btn ds-btn--ghost ds-btn--sm" data-responder="${esc(f.raiz.id)}">Responder</button>` : ''}
            </div>
            ${f.entradas.map(e => `
                <div class="pg-fio__entrada ${daEquipe(e) ? 'is-equipe' : ''}">
                    <b>${daEquipe(e) ? esc(ato(e).rotulo) : `${esc(e.autor)} pediu ajuste`}</b>
                    <small>${haQuanto(e.criado_em)}</small>
                    ${e.texto ? `<p>${esc(e.texto)}</p>` : ''}
                </div>`).join('')}
            <form class="pg-fio__form" data-fio="${esc(f.raiz.id)}" hidden>
                <select class="ds-input" name="tipo">
                    <option value="ajustado">Ajustamos — está na próxima versão</option>
                    <option value="resposta">Respondemos — não vai mudar, e o porquê</option>
                    <option value="aprovado">Encerrar o assunto</option>
                </select>
                <textarea class="ds-input pg-area" name="texto" rows="3" placeholder="O que mudou, ou por que não muda"></textarea>
                <button class="ds-btn ds-btn--primary ds-btn--sm" type="submit">Enviar resposta</button>
            </form>
        </div>`;
};

const naoEncontrado = (container, projetoId) => {
    const { content } = renderShell(container, {
        path: `/projeto/${projetoId}/pagina`,
        crumbs: [{ href: '/', label: 'Projetos' }],
        title: 'Projeto não encontrado',
    });
    content.innerHTML = `<article class="ds-card ap-secao">
        ${vazioHTML('folder-x', 'Este projeto não existe mais', 'Ele pode ter sido excluído.',
            '<a class="ds-btn ds-btn--ghost" href="/">Ver projetos</a>')}</article>`;
    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────

const ESTILOS = `<style>
    .pg-situacao {
        display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 var(--space-3);
        border-radius: var(--radius-pill); background: var(--success-muted); color: var(--success);
        font-size: var(--text-xs); font-weight: 600;
    }
    .pg-situacao.is-pendente { background: var(--warning-muted); color: var(--warning); }
    .pg-situacao svg { width: 13px; height: 13px; }

    .pg-opcoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-3); }
    .pg-opcao {
        display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-4);
        border: 1px solid var(--border-default); border-radius: var(--radius-md);
        background: var(--surface-1); color: var(--text-primary); text-align: left; cursor: pointer;
        font-family: var(--font-sans); transition: border-color var(--dur-fast), background-color var(--dur-fast);
    }
    .pg-opcao:hover { border-color: var(--border-strong); }
    .pg-opcao.is-ativa { border-color: var(--accent); background: var(--accent-muted); }
    .pg-opcao svg { width: 20px; height: 20px; flex-shrink: 0; color: var(--accent); margin-top: 2px; }
    .pg-opcao b { display: block; font-size: var(--text-sm); }
    .pg-opcao small { font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-body); }

    .pg-grade { display: grid; grid-template-columns: 260px minmax(0, 1fr) 340px; gap: var(--bento-gap); align-items: start; }
    .pg-coluna { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
    .pg-coluna--blocos, .pg-coluna--editor { position: sticky; top: var(--space-4); max-height: calc(100vh - var(--space-8)); overflow-y: auto; }
    .pg-coluna__cabeca { display: flex; flex-direction: column; gap: 2px; }
    .pg-coluna__cabeca b { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
    .pg-coluna__cabeca b svg { width: 15px; height: 15px; color: var(--accent); }
    .pg-coluna__cabeca small { font-size: var(--text-xs); color: var(--text-tertiary); }

    .pg-destaque { display: flex; flex-direction: column; gap: var(--space-2); padding-bottom: var(--space-4); border-bottom: 1px solid var(--border-subtle); }
    .pg-cor { display: flex; gap: var(--space-2); align-items: center; }
    .pg-cor input[type=color] {
        width: 44px; height: 40px; flex-shrink: 0; padding: 3px; cursor: pointer;
        border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: var(--surface-3);
    }
    .pg-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .pg-chip { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border-strong); cursor: pointer; }

    .pg-blocos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .pg-bloco {
        display: flex; align-items: center; gap: 4px; padding: 4px;
        border: 1px solid transparent; border-radius: var(--radius-sm); background: var(--surface-1);
    }
    .pg-bloco.is-ativo { border-color: var(--accent); background: var(--accent-muted); }
    .pg-bloco.is-alvo { box-shadow: 0 -2px 0 var(--accent); }
    .pg-bloco.is-arrastando { opacity: 0.4; }
    .pg-bloco__alca { width: 18px; display: flex; justify-content: center; color: var(--text-disabled); cursor: grab; }
    .pg-bloco__alca svg { width: 14px; height: 14px; }
    .pg-bloco__abrir {
        flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-2);
        padding: 4px; border: none; background: none; color: var(--text-primary); text-align: left; cursor: pointer;
        font-family: var(--font-sans);
    }
    .pg-bloco__icone { width: 26px; height: 26px; flex-shrink: 0; border-radius: var(--radius-xs);
                       display: flex; align-items: center; justify-content: center; background: var(--surface-3); color: var(--text-secondary); }
    .pg-bloco__icone svg { width: 14px; height: 14px; }
    .pg-bloco__texto { display: flex; flex-direction: column; min-width: 0; }
    .pg-bloco__texto b { font-size: var(--text-sm); font-weight: 600; }
    .pg-bloco__texto small { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pg-bloco__acoes { display: flex; opacity: 0; transition: opacity var(--dur-fast); }
    .pg-bloco:hover .pg-bloco__acoes, .pg-bloco.is-ativo .pg-bloco__acoes, .pg-bloco__acoes:focus-within { opacity: 1; }
    .pg-mini {
        min-width: 26px; height: 26px; padding: 0 4px; border: none; border-radius: var(--radius-xs);
        display: inline-flex; align-items: center; justify-content: center;
        background: none; color: var(--text-tertiary); cursor: pointer; font-family: var(--font-sans); font-size: 11px; font-weight: 600;
    }
    .pg-mini svg { width: 14px; height: 14px; }
    .pg-mini:hover { background: var(--surface-3); color: var(--text-primary); }
    .pg-mini--perigo:hover, .pg-mini.is-confirmando { background: var(--danger-muted); color: var(--danger); }
    .pg-adicionar { align-self: flex-start; }

    .pg-previa__barra { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
    .pg-previa__barra small { font-size: var(--text-xs); color: var(--text-tertiary); }
    .pg-previa__barra .ap-filtro { display: inline-flex; align-items: center; gap: 6px; }
    .pg-previa__barra .ap-filtro svg { width: 14px; height: 14px; }
    .pg-previa__moldura { position: relative; overflow: hidden; border-radius: var(--radius-md); background: var(--surface-3); }
    .pg-previa__moldura iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: top left; background: var(--surface-base); }
    .pg-previa__moldura[data-aparelho="celular"] { display: flex; justify-content: center; }
    .pg-previa__moldura[data-aparelho="celular"] iframe { left: 50%; transform-origin: top center; translate: -50% 0;
                                                          border-radius: 28px; box-shadow: 0 0 0 8px var(--surface-4); }

    .pg-editor { display: flex; flex-direction: column; gap: var(--space-4); }
    .pg-campos { display: flex; flex-direction: column; gap: var(--space-4); }
    .pg-campo { display: flex; flex-direction: column; gap: var(--space-2); }
    .pg-campo__rotulo { font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary); }
    .pg-campo__dica { font-size: 11px; color: var(--text-tertiary); line-height: var(--leading-body); }
    .pg-campo--sim { flex-direction: row; align-items: center; gap: var(--space-2); font-size: var(--text-sm); cursor: pointer; }
    .pg-campo--sim input { width: 17px; height: 17px; accent-color: var(--accent); }
    .pg-area { height: auto; padding: var(--space-3); resize: vertical; line-height: var(--leading-body); font-family: var(--font-sans); }

    .pg-lista { gap: var(--space-3); }
    .pg-item { padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-1); }
    .pg-item__topo { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
    .pg-item__topo b { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--text-tertiary); }
    .pg-item__campos { display: flex; flex-direction: column; gap: var(--space-3); }

    .pg-imagem { display: flex; align-items: center; gap: var(--space-2); }
    .pg-imagem__mini { width: 44px; height: 44px; flex-shrink: 0; border-radius: var(--radius-xs); overflow: hidden;
                       display: flex; align-items: center; justify-content: center; background: var(--surface-3); color: var(--text-tertiary); }
    .pg-imagem__mini img { width: 100%; height: 100%; object-fit: cover; }
    .pg-imagem__mini svg { width: 16px; height: 16px; }
    .pg-imagem__nome { flex: 1; min-width: 0; font-size: var(--text-xs); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pg-alerta { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3);
                 border-radius: var(--radius-sm); background: var(--warning-muted); font-size: var(--text-xs); color: var(--text-secondary); }
    .pg-alerta svg { width: 13px; height: 13px; color: var(--warning); vertical-align: -2px; }
    .pg-alerta__acoes { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
    .pg-alerta a { color: var(--accent); font-weight: 600; }

    .pg-fonte { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); color: var(--text-secondary); }
    .pg-fonte > span { flex: 1; display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
    .pg-fonte svg { width: 14px; height: 14px; }

    .pg-biblio { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
    .pg-biblio__item { position: relative; padding: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
                       background: var(--surface-3); overflow: hidden; cursor: pointer; display: flex; flex-direction: column; }
    .pg-biblio__item img { width: 100%; aspect-ratio: 1; object-fit: contain; background: var(--surface-2); display: block; }
    .pg-biblio__item span { padding: 4px 6px; font-size: 11px; color: var(--text-secondary); text-align: left;
                            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pg-biblio__item em { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 50%;
                          display: flex; align-items: center; justify-content: center; background: var(--warning); color: var(--ink); }
    .pg-biblio__item em svg { width: 12px; height: 12px; }
    .pg-biblio__item:hover { border-color: var(--accent); }
    .pg-biblio__enviar { align-self: flex-start; }
    .pg-biblio__progresso { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); }

    .pg-versao { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4) 0; border-top: 1px solid var(--border-subtle); }
    .pg-versao:first-of-type { border-top: none; padding-top: 0; }
    .pg-versao__topo { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
    .pg-versao__topo b { font-size: var(--text-sm); }
    .pg-versao__topo small { font-size: var(--text-xs); color: var(--text-tertiary); }
    .pg-fio { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4);
              border-radius: var(--radius-md); background: var(--surface-1); border: 1px solid var(--border-subtle); }
    .pg-fio__topo { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
    .pg-fio__estado { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 var(--space-2);
                      border-radius: var(--radius-pill); font-size: var(--text-xs); font-weight: 600; background: var(--surface-3); color: var(--text-secondary); }
    .pg-fio__estado svg { width: 12px; height: 12px; }
    .pg-fio__estado--pendente { background: var(--warning-muted); color: var(--warning); }
    .pg-fio__estado--respondido { background: var(--info-muted); color: var(--info); }
    .pg-fio__estado--fechado { background: var(--success-muted); color: var(--success); }
    .pg-fio__entrada b { font-size: var(--text-sm); }
    .pg-fio__entrada small { margin-left: var(--space-2); font-size: var(--text-xs); color: var(--text-tertiary); }
    .pg-fio__entrada p { margin: 4px 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
    .pg-fio__entrada.is-equipe { padding-left: var(--space-3); border-left: 2px solid var(--accent); }
    .pg-fio__form { display: flex; flex-direction: column; gap: var(--space-2); }
    .pg-fio__form[hidden] { display: none; }
    .pg-fio__form button { align-self: flex-start; }

    /* Com o editor descendo para a linha de baixo, nenhuma coluna pode ficar
       grudada no topo: a de blocos rolava por cima do editor. */
    @media (max-width: 1180px) {
        .pg-grade { grid-template-columns: 240px minmax(0, 1fr); }
        .pg-coluna--blocos, .pg-coluna--editor { position: static; max-height: none; }
        .pg-coluna--editor { grid-column: 1 / -1; }
    }
    @media (max-width: 760px) {
        .pg-grade { grid-template-columns: 1fr; }
    }
</style>`;
