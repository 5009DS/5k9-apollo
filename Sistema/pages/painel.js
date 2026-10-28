import { store, gerarToken, consentimentoValido, modeloDe } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { abrirMenu } from '../components/menu.js';
import { toast } from '../components/toast.js';
import { navegar } from '../lib/rotas.js';
import { midia } from '../lib/midia.js';
import { esc, haQuanto, plural, numero } from '../lib/formato.js';
import { vazioHTML, kpiHTML, caminhoDoCliente, caminhoDaApresentacao, copiarLinkDoCliente } from '../lib/pecas.js';
import { conversas } from '../lib/conversa.js';

/* ═══════════════════════════════════════════════════════════════════════════
   PAINEL — os projetos e, antes deles, o que o cliente fez.

   O README pede que a primeira tela abra pelo que o cliente comentou e
   ninguém respondeu. Na entrega de fotos ainda não há comentário: o gesto do
   cliente é ESCOLHER. Então o topo é "O que o cliente escolheu", e some
   quando não há escolha recente — uma seção vazia no topo ensina a não
   olhar para ela.
   ═══════════════════════════════════════════════════════════════════════════ */

const RECENTE_DIAS = 14;
let verArquivados = false;

export const renderPainel = async (container) => {
    const [base, publicacoes, aprovacoes, comentarios] = await Promise.all([
        store.tudo(), store.publicacoes.listar(), store.aprovacoes.listar(), store.comentarios.listar(),
    ]);
    const t = { ...base, publicacoes, aprovacoes, comentarios };
    const local = store.modo === 'local';

    const { content } = renderShell(container, {
        path: '/',
        title: 'Projetos',
        subtitle: 'O material pronto de cada cliente, e o que ele fez com ele.',
        actions: `
            ${local ? `
                <button class="ds-btn ds-btn--ghost" id="pn-cliente"
                        title="Ligado ao banco, o cliente vem do Chronos e não é cadastrado aqui.">
                    <i data-lucide="user-plus"></i> Novo cliente
                </button>` : ''}
            <button class="ds-btn ds-btn--primary" id="pn-novo">
                <i data-lucide="plus"></i> Novo projeto
            </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    const consent = new Map(t.consentimentos.map(c => [c.peca_id, c]));
    const comArquivo = new Set(t.versoes.map(v => v.peca_id));
    const abertos = t.projetos.filter(p => !p.arquivado_em);
    const arquivados = t.projetos.filter(p => p.arquivado_em);
    // Os indicadores falam das FOTOS de seleção: imagem de apresentação não
    // está "no link" sozinha — só dentro dos blocos da página.
    const idsAbertos = new Set(abertos.filter(p => modeloDe(p) === 'selecao').map(p => p.id));
    const fotosAbertas = t.pecas.filter(p => idsAbertos.has(p.projeto_id) && comArquivo.has(p.id));
    const noLink = fotosAbertas.filter(p => consentimentoValido(consent.get(p.id)));
    const escolhidas = new Set(t.selecoes.map(s => s.peca_id));

    const lista = verArquivados ? arquivados : abertos;

    content.innerHTML = `
        <div class="ap-kpis">
            ${kpiHTML('folder-open', 'Projetos abertos', numero(abertos.length), 'marca')}
            ${kpiHTML('images', 'Fotos no link do cliente', numero(noLink.length), 'info')}
            ${kpiHTML('shield-alert', 'Sem autorização de imagem', numero(fotosAbertas.length - noLink.length), 'atencao')}
            ${kpiHTML('heart', 'Escolhidas pelo cliente', numero(fotosAbertas.filter(p => escolhidas.has(p.id)).length), 'ok')}
        </div>

        ${atividadeHTML(t)}

        <article class="ds-card ap-secao">
            <div class="ap-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">${verArquivados ? 'Projetos arquivados' : 'Projetos abertos'}</h2>
                    <span class="ds-card-sub">${plural(lista.length, 'projeto', 'projetos')}</span>
                </div>
                ${arquivados.length || verArquivados ? `
                    <div class="ap-filtros">
                        <button class="ap-filtro ${verArquivados ? '' : 'is-active'}" data-arquivados="nao">Abertos</button>
                        <button class="ap-filtro ${verArquivados ? 'is-active' : ''}" data-arquivados="sim">Arquivados (${arquivados.length})</button>
                    </div>` : ''}
            </div>
            ${listaHTML(t, lista, local)}
        </article>
    `;

    // ── Eventos ─────────────────────────────────────────────────────────
    const redesenhar = () => renderPainel(container);
    const novoCliente = () => formularioCliente(redesenhar);
    const novoProjeto = () => t.clientes.length
        ? formularioProjeto(null, t.clientes, redesenhar)
        : toast('Cadastre um cliente antes do primeiro projeto.');

    document.getElementById('pn-novo').addEventListener('click', novoProjeto);
    document.getElementById('pn-cliente')?.addEventListener('click', novoCliente);
    content.querySelector('#pn-cliente-vazio')?.addEventListener('click', novoCliente);
    content.querySelector('#pn-novo-vazio')?.addEventListener('click', novoProjeto);

    content.querySelectorAll('[data-arquivados]').forEach(b =>
        b.addEventListener('click', () => { verArquivados = b.dataset.arquivados === 'sim'; redesenhar(); }));

    // Apresentação abre na organização da página; seleção, na galeria.
    const destino = (id) => {
        const p = t.projetos.find(x => x.id === id);
        return modeloDe(p) === 'apresentacao' ? `/projeto/${id}/pagina` : `/galeria/${id}`;
    };
    content.querySelectorAll('[data-abrir]').forEach(el => {
        el.addEventListener('click', () => navegar(destino(el.dataset.abrir)));
        // A linha do projeto é um <div> (tem um botão dentro), então o Enter
        // não vem de graça como num <a>.
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target === el) navegar(destino(el.dataset.abrir));
        });
    });

    content.querySelectorAll('[data-menu]').forEach(botao =>
        botao.addEventListener('click', (e) => {
            e.stopPropagation();
            const projeto = t.projetos.find(p => p.id === botao.dataset.menu);
            const cliente = t.clientes.find(c => c.id === projeto.cliente_id);
            const apresentacao = modeloDe(projeto) === 'apresentacao';
            const publicada = t.publicacoes.some(p => p.projeto_id === projeto.id);
            abrirMenu(botao, [
                ...(apresentacao ? [
                    { id: 'pagina', label: 'Montar página', icon: 'presentation',
                      onClick: () => navegar(`/projeto/${projeto.id}/pagina`) },
                    { id: 'abrir', label: 'Imagens', icon: 'images',
                      onClick: () => navegar(`/galeria/${projeto.id}`) },
                ] : [
                    { id: 'abrir', label: 'Abrir galeria', icon: 'images',
                      onClick: () => navegar(`/galeria/${projeto.id}`) },
                    { id: 'pagina', label: 'Mudar o formato', icon: 'presentation',
                      onClick: () => navegar(`/projeto/${projeto.id}/pagina`) },
                ]),
                ...(!apresentacao || publicada ? [{
                    id: 'previa', label: 'Ver como o cliente vê', icon: 'external-link',
                    href: apresentacao ? caminhoDaApresentacao(cliente, projeto) : caminhoDoCliente(cliente),
                    externo: true }] : []),
                { id: 'link', label: 'Copiar link do cliente', icon: 'link',
                  onClick: () => copiarLinkDoCliente(cliente, store.modo) },
                { id: 'editar', label: 'Editar projeto', icon: 'pencil', separadorAntes: true,
                  onClick: () => formularioProjeto(projeto, t.clientes, redesenhar) },
                { id: 'arquivar', label: projeto.arquivado_em ? 'Reabrir projeto' : 'Arquivar projeto',
                  icon: projeto.arquivado_em ? 'archive-restore' : 'archive',
                  onClick: () => arquivar(projeto, redesenhar) },
            ]);
        }));

    pintarCapas(content);
    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────

/* O que o cliente fez, numa lista só: pedido de ajuste esperando resposta
   (sempre, de qualquer idade — é a falha mais cara deixá-lo parado),
   aprovação e escolha de fotos dos últimos dias.

   Escolha agrupa por projeto: "escolheu 12 fotos em Ensaio de outubro".
   Doze linhas de "escolheu uma foto" é o mesmo aviso repetido doze vezes. */
const atividadeHTML = (t) => {
    const limite = Date.now() - RECENTE_DIAS * 86_400_000;
    const pecaPorId = new Map(t.pecas.map(p => [p.id, p]));
    const pubPorId = new Map(t.publicacoes.map(p => [p.id, p]));
    const projeto = (id) => t.projetos.find(p => p.id === id);
    const clienteDe = (p) => t.clientes.find(c => c.id === p?.cliente_id);
    const itens = [];

    const porProjeto = new Map();
    for (const s of t.selecoes) {
        if (Date.parse(s.criado_em) < limite) continue;
        const peca = pecaPorId.get(s.peca_id);
        if (!peca) continue;
        const g = porProjeto.get(peca.projeto_id) || { fotos: new Set(), visitantes: new Set(), ultima: '' };
        g.fotos.add(s.peca_id);
        g.visitantes.add(s.sessao);
        if (s.criado_em > g.ultima) g.ultima = s.criado_em;
        porProjeto.set(peca.projeto_id, g);
    }
    for (const [projetoId, g] of porProjeto) {
        const p = projeto(projetoId);
        itens.push({ projetoId, quando: g.ultima, peso: 0, icone: 'heart', tom: 'ok',
            titulo: `${clienteDe(p)?.nome || 'Cliente'} escolheu ${plural(g.fotos.size, 'foto', 'fotos')}`,
            sub: `${p?.nome || ''}${g.visitantes.size > 1 ? ` · ${g.visitantes.size} pessoas escolhendo` : ''}` });
    }

    for (const a of t.aprovacoes) {
        if (a.decisao !== 'aprovado' || Date.parse(a.criado_em) < limite) continue;
        const pub = pubPorId.get(a.publicacao_id);
        const p = projeto(pub?.projeto_id);
        if (!p) continue;
        itens.push({ projetoId: p.id, quando: a.criado_em, peso: 0, icone: 'circle-check', tom: 'ok',
            titulo: `${a.quem_nome} aprovou a versão ${pub.numero}`, sub: p.nome });
    }

    const porPublicacao = new Map();
    for (const c of t.comentarios) {
        if (!c.publicacao_id) continue;
        if (!porPublicacao.has(c.publicacao_id)) porPublicacao.set(c.publicacao_id, []);
        porPublicacao.get(c.publicacao_id).push(c);
    }
    for (const [pubId, lista] of porPublicacao) {
        const pub = pubPorId.get(pubId);
        const p = projeto(pub?.projeto_id);
        if (!p) continue;
        for (const f of conversas(lista).fios) {
            if (f.estado !== 'pendente') continue;
            itens.push({ projetoId: p.id, quando: f.raiz.criado_em, peso: 1, icone: 'message-circle-warning', tom: 'atencao',
                titulo: `${f.raiz.autor} pediu ajuste na versão ${pub.numero}`,
                sub: `${p.nome} · "${String(f.raiz.texto || '').slice(0, 90)}"` });
        }
    }

    if (!itens.length) return '';
    itens.sort((a, b) => b.peso - a.peso || String(b.quando).localeCompare(String(a.quando)));
    const pendentes = itens.filter(i => i.peso).length;

    return `
        <article class="ds-card ds-card--lit ap-secao">
            <div class="ap-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">O que o cliente fez</h2>
                    <span class="ds-card-sub">${pendentes ? `${plural(pendentes, 'pedido esperando', 'pedidos esperando')} resposta · ` : ''}últimos ${RECENTE_DIAS} dias</span>
                </div>
            </div>
            <div class="pn-escolhas">${itens.map(i => `
                <button class="pn-escolha" data-abrir="${esc(i.projetoId)}">
                    <span class="pn-escolha__icone pn-escolha__icone--${i.tom}"><i data-lucide="${i.icone}"></i></span>
                    <span class="pn-escolha__texto">
                        <b>${esc(i.titulo)}</b>
                        <small>${esc(i.sub)}</small>
                    </span>
                    <span class="pn-escolha__quando">${haQuanto(i.quando)}</span>
                </button>`).join('')}</div>
        </article>`;
};

const listaHTML = (t, lista, local) => {
    if (!t.clientes.length) {
        return vazioHTML('user-plus', 'Comece pelo cliente',
            local ? 'No modo local o cliente é cadastrado aqui. Ligado ao banco, ele vem do Chronos, com o mesmo link.'
                  : 'Traga o cliente do Chronos para criar o primeiro projeto.',
            local ? `<button class="ds-btn ds-btn--primary" id="pn-cliente-vazio">Cadastrar cliente</button>` : '');
    }
    if (!lista.length) {
        return verArquivados
            ? vazioHTML('archive', 'Nenhum projeto arquivado', 'Projeto arquivado sai do painel e do link do cliente.')
            : vazioHTML('folder-plus', 'Nenhum projeto ainda',
                'Um projeto é um pacote de entregas: o ensaio de outubro, as fotos do evento.',
                `<button class="ds-btn ds-btn--primary" id="pn-novo-vazio">Criar projeto</button>`);
    }

    const comArquivo = new Map(t.versoes.map(v => [v.peca_id, v]));
    const consent = new Map(t.consentimentos.map(c => [c.peca_id, c]));
    const escolhidas = new Set(t.selecoes.map(s => s.peca_id));

    return `<div class="pn-lista">${[...lista]
        .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))
        .map(p => {
            const cliente = t.clientes.find(c => c.id === p.cliente_id);
            const fotos = t.pecas.filter(x => x.projeto_id === p.id && comArquivo.has(x.id))
                .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
            const semAut = fotos.filter(x => !consentimentoValido(consent.get(x.id))).length;
            const esc_ = fotos.filter(x => escolhidas.has(x.id)).length;
            const capa = fotos[0] ? comArquivo.get(fotos[0].id)?.capa_chave : null;
            const apresentacao = modeloDe(p) === 'apresentacao';
            return `
                <div class="pn-projeto" data-abrir="${esc(p.id)}" role="link" tabindex="0">
                    <span class="pn-projeto__capa">
                        ${capa ? `<img alt="" data-chave="${esc(capa)}">` : `<i data-lucide="${apresentacao ? 'presentation' : 'image'}"></i>`}
                    </span>
                    <span class="pn-projeto__texto">
                        <b>${esc(p.nome)}</b>
                        <small>${esc(cliente?.nome || 'Cliente removido')} · ${apresentacao ? 'apresentação · ' : ''}${plural(fotos.length,
                            apresentacao ? 'imagem' : 'foto', apresentacao ? 'imagens' : 'fotos')} · criado ${haQuanto(p.criado_em)}</small>
                    </span>
                    <span class="pn-projeto__chips">
                        ${apresentacao ? situacaoApresentacao(t, p) : `
                            ${semAut ? `<span class="ap-selo ap-selo--falta"><i data-lucide="shield-alert"></i>${semAut} sem autorização</span>` : ''}
                            ${esc_ ? `<span class="ap-selo ap-selo--ok"><i data-lucide="heart"></i>${esc_} escolhida${esc_ > 1 ? 's' : ''}</span>` : ''}`}
                    </span>
                    <button class="ds-icon-btn" data-menu="${esc(p.id)}" aria-label="Ações do projeto ${esc(p.nome)}">
                        <i data-lucide="ellipsis"></i>
                    </button>
                </div>`;
        }).join('')}</div>`;
};

/* Em que pé está uma apresentação, lido de longe: rascunho, com o cliente,
   ajuste pedido ou aprovada — sempre da versão mais nova. */
const situacaoApresentacao = (t, projeto) => {
    const pub = t.publicacoes.filter(p => p.projeto_id === projeto.id).sort((a, b) => b.numero - a.numero)[0];
    if (!pub) return '<span class="ap-status"><i data-lucide="pencil-line"></i>Rascunho</span>';
    if (t.aprovacoes.some(a => a.publicacao_id === pub.id && a.decisao === 'aprovado')) {
        return `<span class="ap-status ap-status--aprovado"><i data-lucide="circle-check"></i>Versão ${pub.numero} aprovada</span>`;
    }
    const pendente = conversas(t.comentarios.filter(c => c.publicacao_id === pub.id)).pendentes;
    if (pendente) return `<span class="ap-status ap-status--em_ajuste"><i data-lucide="message-circle-warning"></i>Ajuste pedido na versão ${pub.numero}</span>`;
    return `<span class="ap-status ap-status--a_revisar"><i data-lucide="eye"></i>Versão ${pub.numero} com o cliente</span>`;
};

/* As capas chegam depois do desenho: cada uma é uma leitura no IndexedDB, e
   esperar todas antes de mostrar a lista atrasaria a tela pelo arquivo mais
   lento. */
const pintarCapas = (raiz) => {
    raiz.querySelectorAll('img[data-chave]').forEach(async (img) => {
        const url = await midia.url(img.dataset.chave).catch(() => null);
        if (url) img.src = url;
    });
};

// ─────────────────────────────────────────────────────────────────────────

const formularioCliente = (aoTerminar) => abrirFormulario({
    titulo: 'Novo cliente',
    subtitulo: 'Só no modo local — ligado ao banco, o cliente vem do Chronos.',
    campos: [
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Clínica Exemplo' },
        { nome: 'empresa', rotulo: 'Empresa', placeholder: 'Opcional' },
    ],
    rotuloSalvar: 'Cadastrar',
    aoSalvar: async (dados) => {
        await store.clientes.salvar({
            nome: dados.nome, empresa: dados.empresa, token: gerarToken(),
            apelido: null, ativo: true,
        });
        toast(`${esc(dados.nome)} cadastrado.`);
        aoTerminar();
    },
});

const formularioProjeto = (projeto, clientes, aoTerminar) => abrirFormulario({
    titulo: projeto ? 'Editar projeto' : 'Novo projeto',
    subtitulo: projeto ? '' : 'Um pacote de entregas de um cliente.',
    campos: [
        { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', obrigatorio: true,
          opcoes: [...clientes].sort((a, b) => a.nome.localeCompare(b.nome))
              .map(c => ({ valor: c.id, rotulo: c.nome })) },
        { nome: 'nome', rotulo: 'Nome do projeto', obrigatorio: true, placeholder: 'Ensaio de outubro' },
        // O formato só no projeto novo: depois, ele muda na organização da
        // página, onde dá para ver o que a troca significa.
        ...(projeto ? [] : [{ nome: 'modelo', rotulo: 'Formato', tipo: 'select', opcoes: [
            { valor: 'selecao', rotulo: 'Seleção de fotos — o cliente escolhe' },
            { valor: 'apresentacao', rotulo: 'Apresentação — página em blocos, o cliente aprova' },
        ] }]),
        { nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea',
          dica: 'Aparece para o cliente, acima das fotos.' },
    ],
    valores: projeto,
    rotuloSalvar: projeto ? 'Salvar' : 'Criar projeto',
    aoSalvar: async (dados) => {
        const linha = await store.projetos.salvar({
            ...dados, arquivado_em: dados.arquivado_em ?? null,
        });
        if (projeto) { toast('Projeto salvo.'); aoTerminar(); }
        else navegar(modeloDe(linha) === 'apresentacao' ? `/projeto/${linha.id}/pagina` : `/galeria/${linha.id}`);
    },
    // Excluir apaga as fotos junto, inclusive os arquivos. Arquivar é o gesto
    // do dia a dia; excluir existe para limpar teste do modo local.
    aoExcluir: projeto ? async () => {
        await store.projetos.excluir(projeto.id);
        toast('Projeto excluído, com as fotos dele.');
        aoTerminar();
    } : null,
});

const arquivar = async (projeto, aoTerminar) => {
    const arquivado_em = projeto.arquivado_em ? null : new Date().toISOString();
    await store.projetos.salvar({ ...projeto, arquivado_em });
    toast(arquivado_em ? 'Projeto arquivado. Ele saiu do link do cliente.' : 'Projeto reaberto.');
    aoTerminar();
};

// ─────────────────────────────────────────────────────────────────────────

const ESTILOS = `<style>
    .pn-escolhas, .pn-lista { display: flex; flex-direction: column; gap: var(--space-2); }

    .pn-escolha, .pn-projeto {
        display: flex; align-items: center; gap: var(--space-4);
        width: 100%; padding: var(--space-3) var(--space-4);
        border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
        background: var(--surface-1); color: var(--text-primary);
        font-family: var(--font-sans); text-align: left; cursor: pointer;
        transition: background-color var(--dur-fast), border-color var(--dur-fast);
    }
    .pn-escolha:hover, .pn-projeto:hover { background: var(--surface-3); border-color: var(--border-default); }
    .pn-projeto:focus-visible, .pn-escolha:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

    .pn-escolha__icone {
        width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--success-muted); color: var(--success);
    }
    .pn-escolha__icone i, .pn-escolha__icone svg { width: 15px; height: 15px; }
    .pn-escolha__icone--atencao { background: var(--warning-muted); color: var(--warning); }

    .pn-escolha__texto, .pn-projeto__texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .pn-escolha__texto b, .pn-projeto__texto b { font-size: var(--text-sm); font-weight: 600; }
    .pn-escolha__texto small, .pn-projeto__texto small {
        font-size: var(--text-xs); color: var(--text-tertiary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .pn-escolha__quando { font-size: var(--text-xs); color: var(--text-tertiary); white-space: nowrap; }

    .pn-projeto__capa {
        width: 56px; height: 56px; flex-shrink: 0; overflow: hidden;
        border-radius: var(--radius-sm); background: var(--surface-3); color: var(--text-tertiary);
        display: inline-flex; align-items: center; justify-content: center;
    }
    .pn-projeto__capa img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .pn-projeto__capa i, .pn-projeto__capa svg { width: 18px; height: 18px; }
    .pn-projeto__chips { display: flex; gap: var(--space-2); flex-wrap: wrap; justify-content: flex-end; }

    @media (max-width: 720px) {
        .pn-projeto { flex-wrap: wrap; }
        .pn-projeto__chips { order: 4; width: 100%; justify-content: flex-start; }
    }
</style>`;
