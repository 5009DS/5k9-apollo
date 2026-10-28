import { store, consentimentoValido, modeloDe } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { toast } from '../components/toast.js';
import { midia } from '../lib/midia.js';
import { ACEITOS } from '../lib/fotos.js';
import { marcarAtivo } from '../lib/ui.js';
import { esc, plural, numero, tamanho, haQuanto } from '../lib/formato.js';
import {
    STATUS, statusHTML, seloHTML, vazioHTML, kpiHTML, caminhoDoCliente, copiarLinkDoCliente,
} from '../lib/pecas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   GALERIA — as fotos de um projeto, do lado da equipe.

   O README: "aprovar, marcar, ver o que o cliente escolheu". Três coisas
   acontecem aqui:

     1. ENVIAR. A foto entra, o derivado com marca é gerado (lib/fotos.js) e
        o original fica guardado à parte, sem endereço na tela do cliente.
     2. AUTORIZAR. Sem consentimento registrado, a foto não entra no link —
        o sistema recusa, não avisa. Por isso o selo está em toda miniatura,
        e a autorização se registra em lote: um termo cobre o ensaio inteiro.
     3. LER A ESCOLHA. O que o cliente marcou aparece na própria miniatura,
        e o filtro "Escolhidas" é a lista que vai para o tratamento.

   ── FILTRO NÃO REDESENHA A PÁGINA ─────────────────────────────────────────
   A mesma lição do lib/ui.js do Chronos: trocar o filtro ou marcar uma foto
   muda o que a GRADE mostra, e só ela é refeita. A página inteira só se
   redesenha quando o dado muda — envio, ficha salva, exclusão.
   ═══════════════════════════════════════════════════════════════════════════ */

const FILTROS = [
    { id: 'todas',           rotulo: 'Todas',           passa: () => true },
    { id: 'escolhidas',      rotulo: 'Escolhidas',      passa: (p, ctx) => ctx.escolhas.has(p.id) },
    { id: 'sem_autorizacao', rotulo: 'Sem autorização', passa: (p, ctx) => !consentimentoValido(ctx.consent.get(p.id)) },
];

/* Sobrevive ao redesenho da mesma galeria, e zera ao trocar de projeto:
   marcar vinte fotos, salvar a ficha de uma e perder as vinte marcadas seria
   o tipo de coisa que faz alguém desistir da ação em lote. */
let estado = { projetoId: null, filtro: 'todas', marcadas: new Set(), erros: [] };
let enviando = false;

export const renderGaleria = async (container, projetoId) => {
    if (estado.projetoId !== projetoId) {
        const pedido = new URLSearchParams(window.location.search).get('filtro');
        estado = {
            projetoId,
            filtro: FILTROS.some(f => f.id === pedido) ? pedido : 'todas',
            marcadas: new Set(), erros: [],
        };
    }

    const dados = await store.doProjeto(projetoId);
    if (!dados) return naoEncontrado(container, projetoId);

    const { projeto, cliente, pecas, versoes, consentimentos, selecoes } = dados;

    const versao = new Map();
    for (const v of versoes) {
        if (!versao.has(v.peca_id) || v.numero > versao.get(v.peca_id).numero) versao.set(v.peca_id, v);
    }
    const consent = new Map(consentimentos.map(c => [c.peca_id, c]));
    const escolhas = new Map();
    for (const s of selecoes) {
        if (!escolhas.has(s.peca_id)) escolhas.set(s.peca_id, []);
        escolhas.get(s.peca_id).push(s);
    }

    const fotos = pecas.filter(p => versao.has(p.id));
    const ctx = { projeto, cliente, fotos, versao, consent, escolhas };

    // Marcada que não existe mais (excluída) sai da seleção em lote.
    const ids = new Set(fotos.map(p => p.id));
    estado.marcadas.forEach(id => { if (!ids.has(id)) estado.marcadas.delete(id); });

    const noLink = fotos.filter(p => consentimentoValido(consent.get(p.id)));
    const apresentacao = modeloDe(projeto) === 'apresentacao';
    const escolhidas = fotos.filter(p => escolhas.has(p.id));

    const { content } = renderShell(container, {
        path: `/galeria/${projetoId}`,
        crumbs: [{ href: '/', label: 'Projetos' }],
        title: esc(projeto.nome),
        subtitle: `${esc(cliente?.nome || 'Cliente removido')} · ${plural(fotos.length, 'foto', 'fotos')}`,
        actions: `
            ${apresentacao ? `
                <a class="ds-btn ds-btn--ghost" href="/projeto/${esc(projetoId)}/pagina">
                    <i data-lucide="presentation"></i> Montar página
                </a>` : cliente ? `
                <a class="ds-btn ds-btn--ghost" href="${caminhoDoCliente(cliente)}" target="_blank" rel="noopener">
                    <i data-lucide="external-link"></i> Ver como o cliente vê
                </a>` : ''}
            ${cliente ? `
                <button class="ds-btn ds-btn--ghost" id="gl-link">
                    <i data-lucide="link"></i> Copiar link
                </button>` : ''}
            <button class="ds-btn ds-btn--primary" id="gl-enviar">
                <i data-lucide="upload"></i> Enviar ${apresentacao ? 'imagens' : 'fotos'}
            </button>
            <input type="file" id="gl-arquivos" multiple accept="${ACEITOS.join(',')}" hidden>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    content.innerHTML = `
        <div class="ap-kpis">
            ${kpiHTML('images', 'Fotos', numero(fotos.length), 'marca')}
            ${kpiHTML('eye', 'No link do cliente', numero(projeto.arquivado_em ? 0 : noLink.length), 'info')}
            ${kpiHTML('shield-alert', 'Sem autorização', numero(fotos.length - noLink.length), 'atencao')}
            ${kpiHTML('heart', 'Escolhidas pelo cliente', numero(escolhidas.length), 'ok')}
        </div>

        ${projeto.arquivado_em ? `
            <p class="ds-hint ds-hint--aviso"><i data-lucide="archive"></i>
                Projeto arquivado: nenhuma foto dele aparece no link do cliente. Reabra pelo painel.</p>` : ''}

        ${apresentacao ? `
            <p class="ds-hint"><i data-lucide="presentation"></i>
                Estas são as imagens da apresentação. O cliente não as vê soltas: elas aparecem só dentro
                dos blocos da página, e sem marca d'água. Mockup e logo sem ninguém na imagem:
                registre a autorização como "sem pessoa identificável".</p>` : ''}

        <article class="ds-card ap-secao gl-area" id="gl-area">
            <div class="ap-secao__cabeca">
                <div class="ap-filtros" role="group" aria-label="Filtrar fotos">
                    ${FILTROS.map(f => `
                        <button class="ap-filtro ${f.id === estado.filtro ? 'is-active' : ''}"
                                data-filtro="${f.id}" aria-pressed="${f.id === estado.filtro}">
                            ${f.rotulo} <span class="gl-conta">${fotos.filter(p => f.passa(p, ctx)).length}</span>
                        </button>`).join('')}
                </div>
                <div class="gl-lote" id="gl-lote"></div>
            </div>

            <div class="gl-progresso" id="gl-progresso" hidden></div>
            <div id="gl-erros">${errosHTML()}</div>

            <div id="gl-grade"></div>

            ${store.modo === 'local' ? `
                <p class="ds-hint"><i data-lucide="hard-drive"></i>
                    Modo local: as fotos ficam só neste navegador. O cliente vê uma cópia de até 2048 px
                    com a marca d'água queimada; o original fica guardado à parte e não tem endereço no link dele.</p>` : ''}
        </article>
    `;

    const pintar = () => {
        pintarGrade(content, ctx);
        pintarLote(content, ctx, () => renderGaleria(container, projetoId));
    };
    pintar();

    // ── Eventos ─────────────────────────────────────────────────────────
    const redesenhar = () => renderGaleria(container, projetoId);

    document.getElementById('gl-link')?.addEventListener('click', () => copiarLinkDoCliente(cliente, store.modo));

    const entrada = document.getElementById('gl-arquivos');
    document.getElementById('gl-enviar').addEventListener('click', () => entrada.click());
    entrada.addEventListener('change', () => {
        enviar(container, projetoId, [...entrada.files], fotos.length);
        entrada.value = '';
    });
    content.querySelector('#gl-escolher')?.addEventListener('click', () => entrada.click());

    ligarArrastar(content.querySelector('#gl-area'), (arquivos) =>
        enviar(container, projetoId, arquivos, fotos.length));

    content.querySelectorAll('[data-filtro]').forEach(b =>
        b.addEventListener('click', () => {
            estado.filtro = b.dataset.filtro;
            marcarAtivo(content, 'filtro', estado.filtro);
            pintar();
        }));

    // Delegação: a grade é refeita a cada filtro, o ouvinte fica no pai.
    const grade = content.querySelector('#gl-grade');
    grade.addEventListener('change', (e) => {
        const caixa = e.target.closest('[data-marcar]');
        if (!caixa) return;
        if (caixa.checked) estado.marcadas.add(caixa.dataset.marcar);
        else estado.marcadas.delete(caixa.dataset.marcar);
        caixa.closest('.gl-foto')?.classList.toggle('is-marcada', caixa.checked);
        pintarLote(content, ctx, redesenhar);
    });
    grade.addEventListener('click', (e) => {
        const abrir = e.target.closest('[data-abrir]');
        if (abrir) abrirFicha(ctx, abrir.dataset.abrir, redesenhar);
    });

    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────
// Grade e ação em lote
// ─────────────────────────────────────────────────────────────────────────

const visiveis = (ctx) => {
    const filtro = FILTROS.find(f => f.id === estado.filtro) || FILTROS[0];
    return ctx.fotos.filter(p => filtro.passa(p, ctx));
};

const pintarGrade = (raiz, ctx) => {
    const alvo = raiz.querySelector('#gl-grade');
    if (!ctx.fotos.length) {
        alvo.innerHTML = `
            <div class="gl-soltar">
                ${vazioHTML('image-up', 'Arraste as fotos para cá',
                    'JPG, PNG, WebP ou SVG, quantas quiser. Elas entram sem autorização de uso de imagem — e só aparecem para o cliente depois que ela for registrada.',
                    `<button class="ds-btn ds-btn--ghost" id="gl-escolher">Escolher arquivos</button>`)}
            </div>`;
        return;
    }

    const lista = visiveis(ctx);
    if (!lista.length) {
        alvo.innerHTML = vazioHTML('filter-x', 'Nenhuma foto neste filtro',
            estado.filtro === 'escolhidas' ? 'O cliente ainda não escolheu nenhuma foto deste projeto.'
                                           : 'Todas as fotos deste projeto têm autorização registrada.');
        return;
    }

    alvo.innerHTML = `<div class="gl-grade">${lista.map(p => fotoHTML(p, ctx)).join('')}</div>`;
    pintarImagens(alvo);
    if (window.lucide) lucide.createIcons();
};

const fotoHTML = (p, ctx) => {
    const v = ctx.versao.get(p.id);
    const n = new Set((ctx.escolhas.get(p.id) || []).map(s => s.sessao)).size;
    const marcada = estado.marcadas.has(p.id);
    return `
        <figure class="gl-foto ${marcada ? 'is-marcada' : ''}">
            <button class="gl-foto__abrir" data-abrir="${esc(p.id)}" aria-label="Abrir a ficha de ${esc(p.titulo)}">
                <img data-chave="${esc(v.capa_chave)}" alt="" loading="lazy">
            </button>
            <label class="gl-foto__marcar" title="Marcar para ação em lote">
                <input type="checkbox" data-marcar="${esc(p.id)}" ${marcada ? 'checked' : ''}
                       aria-label="Marcar ${esc(p.titulo)}">
            </label>
            ${n ? `<span class="gl-foto__escolha" title="Escolhida por ${plural(n, 'pessoa', 'pessoas')}">
                       <i data-lucide="heart"></i>${n > 1 ? n : ''}</span>` : ''}
            <figcaption class="gl-foto__legenda">
                <span class="gl-foto__titulo">${esc(p.titulo)}</span>
                <span class="gl-foto__chips">${seloHTML(ctx.consent.get(p.id))}${p.status !== 'a_revisar' ? statusHTML(p.status) : ''}</span>
            </figcaption>
        </figure>`;
};

const pintarImagens = (raiz) => {
    raiz.querySelectorAll('img[data-chave]').forEach(async (img) => {
        const url = await midia.url(img.dataset.chave).catch(() => null);
        if (url) img.src = url;
        else img.closest('.gl-foto, .gl-ficha')?.classList.add('is-sem-arquivo');
    });
};

const pintarLote = (raiz, ctx, redesenhar) => {
    const alvo = raiz.querySelector('#gl-lote');
    const n = estado.marcadas.size;
    const naTela = visiveis(ctx);
    const todasMarcadas = naTela.length && naTela.every(p => estado.marcadas.has(p.id));

    alvo.innerHTML = `
        ${ctx.fotos.length ? `
            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="gl-todas">
                ${todasMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
            </button>` : ''}
        ${n ? `
            <span class="gl-lote__conta">${plural(n, 'marcada', 'marcadas')}</span>
            <button class="ds-btn ds-btn--primary ds-btn--sm" id="gl-autorizar">
                <i data-lucide="shield-check"></i> Registrar autorização
            </button>
            <button class="ds-btn ds-btn--ghost ds-btn--sm gl-lote__excluir" id="gl-excluir">Excluir</button>` : ''}`;

    alvo.querySelector('#gl-todas')?.addEventListener('click', () => {
        naTela.forEach(p => todasMarcadas ? estado.marcadas.delete(p.id) : estado.marcadas.add(p.id));
        pintarGrade(raiz, ctx);
        pintarLote(raiz, ctx, redesenhar);
    });
    alvo.querySelector('#gl-autorizar')?.addEventListener('click', () =>
        formularioAutorizacao([...estado.marcadas], redesenhar));

    // Confirmação em dois toques no próprio botão, como o Excluir dos
    // formulários: sem diálogo empilhado, e sem apagar no primeiro clique.
    const excluir = alvo.querySelector('#gl-excluir');
    excluir?.addEventListener('click', async () => {
        if (excluir.dataset.confirmando !== 'sim') {
            excluir.dataset.confirmando = 'sim';
            excluir.classList.add('is-confirmando');
            excluir.textContent = `Confirmar: excluir ${n}`;
            setTimeout(() => {
                if (!excluir.isConnected) return;
                excluir.dataset.confirmando = '';
                excluir.classList.remove('is-confirmando');
                excluir.textContent = 'Excluir';
            }, 4000);
            return;
        }
        excluir.disabled = true;
        for (const id of estado.marcadas) await store.pecas.excluir(id);
        toast(`${plural(n, 'foto excluída', 'fotos excluídas')}, com os arquivos.`);
        estado.marcadas.clear();
        redesenhar();
    });
    if (window.lucide) lucide.createIcons();
};

const errosHTML = () => estado.erros.length ? `
    <div class="ds-hint ds-hint--aviso gl-erros">
        <i data-lucide="triangle-alert"></i>
        <div>
            <b>${plural(estado.erros.length, 'arquivo não entrou', 'arquivos não entraram')}</b>
            <ul>${estado.erros.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
        </div>
    </div>` : '';

// ─────────────────────────────────────────────────────────────────────────
// Envio
// ─────────────────────────────────────────────────────────────────────────

/* Uma foto por vez, e não todas em paralelo: cada uma é decodificada inteira
   na memória para gerar o derivado, e vinte fotos de 24 MP ao mesmo tempo
   derrubam a aba do celular — e às vezes a do computador. */
const enviar = async (container, projetoId, arquivos, jaExistem) => {
    if (enviando || !arquivos.length) return;
    enviando = true;
    estado.erros = [];

    const avisarSaida = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisarSaida);

    const progresso = container.querySelector('#gl-progresso');
    const errosEl = container.querySelector('#gl-erros');
    if (errosEl) errosEl.innerHTML = '';
    let feitos = 0;

    try {
        for (const [i, arquivo] of arquivos.entries()) {
            if (progresso?.isConnected) {
                progresso.hidden = false;
                progresso.innerHTML = `
                    <div class="gl-progresso__texto">
                        <span>Preparando ${i + 1} de ${arquivos.length}</span>
                        <small>${esc(arquivo.name)}</small>
                    </div>
                    <div class="gl-progresso__barra"><span style="width:${Math.round((i / arquivos.length) * 100)}%"></span></div>`;
            }
            try {
                await store.enviarFoto(projetoId, arquivo, jaExistem + i);
                feitos++;
            } catch (e) {
                console.error('[galeria] falha ao enviar', arquivo.name, e);
                estado.erros.push(e.message || `${arquivo.name}: não foi possível enviar.`);
            }
        }
    } finally {
        enviando = false;
        window.removeEventListener('beforeunload', avisarSaida);
    }

    if (feitos) {
        toast(`${plural(feitos, 'foto enviada', 'fotos enviadas')}. Elas aparecem no link depois da autorização de imagem.`);
    }
    // Só redesenha se a pessoa continua nesta galeria: o envio segue rodando
    // quando ela navega, e redesenhar aqui jogaria a galeria por cima da
    // tela em que ela está agora.
    if (window.location.pathname === `/galeria/${projetoId}`) renderGaleria(container, projetoId);
};

const ligarArrastar = (area, aoSoltar) => {
    if (!area) return;
    let profundidade = 0;   // dragenter/leave disparam em cada filho
    area.addEventListener('dragenter', (e) => {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        e.preventDefault();
        profundidade++;
        area.classList.add('is-soltando');
    });
    area.addEventListener('dragover', (e) => {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    });
    area.addEventListener('dragleave', () => {
        if (--profundidade <= 0) { profundidade = 0; area.classList.remove('is-soltando'); }
    });
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        profundidade = 0;
        area.classList.remove('is-soltando');
        aoSoltar([...(e.dataTransfer?.files || [])]);
    });
};

// ─────────────────────────────────────────────────────────────────────────
// Ficha da foto e autorização em lote
// ─────────────────────────────────────────────────────────────────────────

/* "Sem pessoa identificável" é um motivo, não uma exceção: vira uma linha de
   consentimento como outra qualquer, com data (README, "Consentimento de
   imagem não é burocracia"). Escolhido, os campos de termo somem — não há
   termo, nem prazo, nem escopo para registrar. */
const CAMPOS_AUTORIZACAO = [
    { nome: 'motivo', rotulo: 'Motivo', tipo: 'select', opcoes: [
        { valor: 'termo', rotulo: 'Termo assinado pela pessoa da imagem' },
        { valor: 'sem_pessoa', rotulo: 'Sem pessoa identificável (mockup, logo, objeto)' },
    ] },
    { nome: 'autorizado', rotulo: 'Uso de imagem autorizado', tipo: 'checkbox',
      dica: 'Sem isto a foto não aparece no link do cliente. Registre só o que está assinado.' },
    { nome: 'validade', rotulo: 'Vale até', tipo: 'data', largura: 'metade',
      dica: 'Em branco: sem prazo. Vencida, a foto sai do link sozinha.' },
    { nome: 'escopo', rotulo: 'Para que uso', tipo: 'lista', largura: 'metade',
      placeholder: 'redes sociais, site' },
    { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea',
      placeholder: 'Termo assinado em 12/10, via WhatsApp' },
];

const ligarMotivo = (painel) => {
    const motivo = painel.querySelector('[name="motivo"]');
    if (!motivo) return;
    const aplicar = () => ['autorizado', 'validade', 'escopo'].forEach(nome => {
        const campo = painel.querySelector(`[data-campo="${nome}"]`);
        if (campo) campo.hidden = motivo.value === 'sem_pessoa';
    });
    motivo.addEventListener('change', aplicar);
    aplicar();
};

const abrirFicha = (ctx, pecaId, redesenhar) => {
    const peca = ctx.fotos.find(p => p.id === pecaId);
    if (!peca) return;
    const v = ctx.versao.get(peca.id);
    const c = ctx.consent.get(peca.id);
    const escolhas = ctx.escolhas.get(peca.id) || [];
    const pessoas = new Set(escolhas.map(s => s.sessao)).size;
    const ultima = escolhas.map(s => s.criado_em).sort().pop();
    const noLink = consentimentoValido(c) && !ctx.projeto.arquivado_em;

    abrirFormulario({
        titulo: 'Ficha da foto',
        subtitulo: esc(peca.titulo),
        topo: `
            <div class="gl-ficha">
                <img class="gl-ficha__img" data-chave="${esc(peca.tipo === 'video' ? v.capa_chave : v.proxy_chave)}" alt=""
                     width="${v.largura}" height="${v.altura}">
                <dl class="gl-ficha__dados">
                    <div><dt>Original</dt><dd>${numero(v.largura)} × ${numero(v.altura)} px · ${tamanho(v.bytes)}</dd></div>
                    <div><dt>Versão</dt><dd>V${v.numero} · enviada ${haQuanto(v.criado_em)}</dd></div>
                    <div><dt>No link do cliente</dt><dd>${noLink
                        ? (modeloDe(ctx.projeto) === 'apresentacao' ? 'Liberada para os blocos da página' : 'Sim')
                        : ctx.projeto.arquivado_em ? 'Não — o projeto está arquivado'
                        : 'Não — falta autorização de uso de imagem'}</dd></div>
                    <div><dt>Marca d'água</dt><dd>${v.marca_dagua === false ? 'Sem marca' : 'Queimada na cópia do cliente'}</dd></div>
                    <div><dt>Escolhida</dt><dd>${pessoas ? `Por ${plural(pessoas, 'pessoa', 'pessoas')}, ${haQuanto(ultima)}` : 'Ainda não'}</dd></div>
                </dl>
            </div>`,
        campos: [
            { nome: 'titulo', rotulo: 'Título', obrigatorio: true },
            { nome: 'status', rotulo: 'Status', tipo: 'select',
              opcoes: STATUS.map(s => ({ valor: s.valor, rotulo: s.rotulo })) },
            ...CAMPOS_AUTORIZACAO,
        ],
        valores: {
            ...peca,
            motivo: c?.motivo || 'termo',
            autorizado: c?.autorizado || false, validade: c?.validade || null,
            escopo: c?.escopo || [], observacao: c?.observacao || null,
        },
        aoMontar: (painel) => { pintarImagens(painel); ligarMotivo(painel); },
        aoSalvar: async (dados) => {
            await store.pecas.salvar({ ...peca, titulo: dados.titulo, status: dados.status || 'a_revisar' });
            // Sem linha de consentimento e sem nada preenchido: não cria uma
            // linha "não autorizado" que ninguém registrou.
            const mexeu = c || dados.motivo === 'sem_pessoa' || dados.autorizado || dados.validade
                       || dados.escopo.length || dados.observacao;
            if (mexeu) {
                await store.consentir([peca.id], {
                    motivo: dados.motivo, autorizado: dados.autorizado, validade: dados.validade,
                    escopo: dados.escopo, observacao: dados.observacao,
                });
            }
            toast('Foto salva.');
            redesenhar();
        },
        aoExcluir: async () => {
            await store.pecas.excluir(peca.id);
            estado.marcadas.delete(peca.id);
            toast('Foto excluída, com os arquivos.');
            redesenhar();
        },
    });
};

const formularioAutorizacao = (pecaIds, redesenhar) => abrirFormulario({
    titulo: 'Autorização de uso de imagem',
    subtitulo: plural(pecaIds.length, 'foto marcada', 'fotos marcadas'),
    topo: `
        <p class="ds-hint ds-hint--aviso"><i data-lucide="shield-alert"></i>
            Vale para todas as fotos marcadas e substitui a autorização que cada uma tinha.
            Registre só o que o cliente assinou.</p>`,
    campos: CAMPOS_AUTORIZACAO,
    valores: { motivo: 'termo', autorizado: true },
    rotuloSalvar: 'Registrar',
    aoMontar: ligarMotivo,
    aoSalvar: async (dados) => {
        await store.consentir(pecaIds, dados);
        toast(dados.motivo === 'sem_pessoa'
            ? `${plural(pecaIds.length, 'foto marcada', 'fotos marcadas')} como sem pessoa identificável.`
            : dados.autorizado
            ? `Autorização registrada em ${plural(pecaIds.length, 'foto', 'fotos')}.`
            : `${plural(pecaIds.length, 'foto marcada', 'fotos marcadas')} como não autorizada${pecaIds.length > 1 ? 's' : ''}.`);
        estado.marcadas.clear();
        redesenhar();
    },
});

const naoEncontrado = (container, projetoId) => {
    const { content } = renderShell(container, {
        path: `/galeria/${projetoId}`,
        crumbs: [{ href: '/', label: 'Projetos' }],
        title: 'Projeto não encontrado',
    });
    content.innerHTML = `<article class="ds-card ap-secao">
        ${vazioHTML('folder-x', 'Este projeto não existe mais', 'Ele pode ter sido excluído. Os outros estão no painel.',
            '<a class="ds-btn ds-btn--ghost" href="/">Ver projetos</a>')}
    </article>`;
    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────

const ESTILOS = `<style>
    .gl-conta { margin-left: 4px; font-variant-numeric: tabular-nums; opacity: 0.7; }

    .gl-lote { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
    .gl-lote__conta { font-size: var(--text-sm); color: var(--text-secondary); padding: 0 var(--space-2); }
    .gl-lote__excluir:hover, .gl-lote__excluir.is-confirmando {
        background: var(--danger-muted); border-color: var(--danger); color: var(--danger);
    }

    /* A área inteira aceita o arrastar, não só o retângulo do vazio: quem
       arrasta vinte fotos solta onde o mouse estiver. */
    .gl-area { transition: border-color var(--dur-fast), background-color var(--dur-fast); }
    .gl-area.is-soltando { border-color: var(--accent); background: var(--accent-muted); }
    .gl-soltar { border: 1px dashed var(--border-strong); border-radius: var(--radius-md); }

    .gl-progresso { display: flex; flex-direction: column; gap: var(--space-2); }
    .gl-progresso[hidden] { display: none; }
    .gl-progresso__texto { display: flex; align-items: baseline; gap: var(--space-3); font-size: var(--text-sm); }
    .gl-progresso__texto small { color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gl-progresso__barra { height: 4px; border-radius: var(--radius-pill); background: var(--surface-3); overflow: hidden; }
    .gl-progresso__barra span {
        display: block; height: 100%; border-radius: inherit;
        background: var(--gradient-violet); transition: width var(--dur-base) var(--ease-out);
    }

    .gl-erros ul { margin: var(--space-2) 0 0; padding-left: var(--space-5); }

    .gl-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-3); }

    .gl-foto {
        position: relative; margin: 0;
        display: flex; flex-direction: column;
        border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
        background: var(--surface-1); overflow: hidden;
        transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
    }
    .gl-foto:hover { border-color: var(--border-default); }
    .gl-foto.is-marcada { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }

    /* overflow:hidden não é enfeite: sem ele o aspect-ratio deixa a foto em
       retrato esticar o quadrado até a altura natural dela. */
    .gl-foto__abrir {
        display: block; padding: 0; border: none; background: var(--surface-3);
        aspect-ratio: 1; overflow: hidden; cursor: zoom-in;
    }
    .gl-foto__abrir img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .gl-foto.is-sem-arquivo .gl-foto__abrir::after {
        content: 'Arquivo não está neste navegador';
        display: flex; align-items: center; justify-content: center; height: 100%;
        padding: var(--space-3); text-align: center;
        font-size: var(--text-xs); color: var(--text-tertiary);
    }

    .gl-foto__marcar {
        position: absolute; top: var(--space-2); left: var(--space-2);
        width: 30px; height: 30px; border-radius: var(--radius-sm);
        display: flex; align-items: center; justify-content: center;
        background: var(--glass-bg); -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
        cursor: pointer;
    }
    .gl-foto__marcar input { width: 17px; height: 17px; margin: 0; accent-color: var(--accent); cursor: pointer; }

    .gl-foto__escolha {
        position: absolute; top: var(--space-2); right: var(--space-2);
        height: 26px; min-width: 26px; padding: 0 var(--space-2);
        display: inline-flex; align-items: center; justify-content: center; gap: 4px;
        border-radius: var(--radius-pill);
        background: var(--success); color: var(--accent-contrast);
        font-size: var(--text-xs); font-weight: 700;
    }
    .gl-foto__escolha i, .gl-foto__escolha svg { width: 13px; height: 13px; fill: currentColor; }

    .gl-foto__legenda { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); }
    .gl-foto__titulo {
        font-size: var(--text-xs); font-weight: 600; color: var(--text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .gl-foto__chips { display: flex; gap: var(--space-1); flex-wrap: wrap; }

    /* ── Ficha ────────────────────────────────────────────────────────── */
    .gl-ficha { display: flex; flex-direction: column; gap: var(--space-4); }
    .gl-ficha__img {
        width: 100%; height: auto; max-height: 46vh; object-fit: contain;
        border-radius: var(--radius-md); background: var(--surface-3); display: block;
    }
    .gl-ficha__dados { margin: 0; display: grid; gap: var(--space-2); }
    .gl-ficha__dados div { display: flex; justify-content: space-between; gap: var(--space-4); font-size: var(--text-sm); }
    .gl-ficha__dados dt { color: var(--text-tertiary); }
    .gl-ficha__dados dd { margin: 0; color: var(--text-primary); text-align: right; }

    @media (max-width: 520px) {
        .gl-grade { grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
    }
</style>`;
