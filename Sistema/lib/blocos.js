/* ═══════════════════════════════════════════════════════════════════════════
   BLOCOS — o catálogo da apresentação.

   Cada tipo de bloco declara, num lugar só, as três coisas que precisam
   concordar entre si:

     campos    o que a equipe preenche na organização da página
     padrao    o conteúdo com que o bloco nasce
     desenhar  o HTML que o CLIENTE vê — e a prévia da equipe, que é a mesma
               função; prévia desenhada à parte mente no primeiro detalhe

   Bloco novo é uma entrada aqui, desenhada com cuidado uma vez (README,
   "Blocos fixos, ordem livre"). Não existe posicionar elemento à mão.

   ── IMAGEM E FONTE ────────────────────────────────────────────────────────
   No rascunho, imagem é `{ peca: <id> }` e fonte é `{ fonte_chave,
   licenca_web }`. Na hora de desenhar elas já chegam RESOLVIDAS pelo banco
   (db/local.js): a imagem vira as chaves do derivado — ou some, se a peça
   não tem consentimento —, e a fonte sem licença para web chega sem chave.
   `desenhar` nunca decide o que o cliente pode ver; só mostra o que veio.

   ── MOLDURA 5K9, CONTEÚDO DO CLIENTE ──────────────────────────────────────
   Tipografia de interface, grade e ritmo são da 5K9. A cor de destaque é do
   cliente e chega como `--apr-destaque`. Cor literal só aparece onde ela é
   CONTEÚDO — o hex de uma paleta, o fundo escolhido para um logo.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc } from './formato.js';
import { midia } from './midia.js';

// ─────────────────────────────────────────────────────────────────────────
// Ajudantes de desenho
// ─────────────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;
export const hexValido = (v) => HEX.test(String(v || '').trim());

const rgbDe = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/* Texto sobre uma cor qualquer: claro ou escuro, pela luminância relativa
   (WCAG). Devolve token, não cor — --ink e --paper não mudam com o tema. */
export const contraste = (hex) => {
    if (!hexValido(hex)) return 'var(--paper)';
    const [r, g, b] = rgbDe(hex).map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.4 ? 'var(--ink)' : 'var(--paper)';
};

/** Parágrafos: linha em branco separa; quebra simples vira <br>. */
const paragrafos = (texto) => String(texto || '').trim().split(/\n\s*\n/).filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

/* A imagem resolvida, ou o aviso da prévia. O src é pintado depois
   (pintarImagens), porque o endereço sai do IndexedDB de forma assíncrona. */
/* `proporcao`: a caixa já nasce com a proporção da imagem. Sem isto, imagem
   com largura automática tem zero de altura até carregar, e a página pula
   quando ela chega. */
const imgHTML = (img, { classe = '', grande = true, alt = '', estilo = '', proporcao = false, teto = 85 } = {}) => {
    if (!img) return '';
    if (img.bloqueada) {
        return `<div class="apr-buraco ${classe}"><span>Sem autorização de imagem — o cliente não vê
                <b>${esc(img.titulo || '')}</b></span></div>`;
    }
    if (img.faltando) return `<div class="apr-buraco ${classe}"><span>Imagem removida</span></div>`;
    const chave = grande ? img.proxy_chave : (img.capa_chave || img.proxy_chave);
    if (proporcao) estilo = proporcional(estilo, img, teto);
    return `<img class="${classe}" data-chave="${esc(chave)}" alt="${esc(alt)}" ${estilo ? `style="${estilo}"` : ''}
                 width="${Number(img.largura) || 1600}" height="${Number(img.altura) || 1000}" loading="lazy">`;
};

// Largura = a menor entre a coluna e "teto da tela × proporção": a altura que
// sai disso nunca passa do teto, nem antes de carregar.
const proporcional = (estilo, m, teto) => {
    if (!m.largura || !m.altura) return estilo;
    const r = `${m.largura} / ${m.altura}`;
    return `${estilo}; aspect-ratio: ${r}; height: auto; width: min(100%, calc(${teto}svh * ${r}))`;
};

/* O vídeo do bloco de vídeo: mudo, em loop e tocando sozinho — é vinheta,
   não conteúdo para assistir com som. O src e a capa são pintados depois,
   como na imagem (pintarMidia). */
const videoHTML = (v, { alt = '', proporcao = false, teto = 85 } = {}) => {
    if (!v) return '';
    if (v.bloqueada) {
        return `<div class="apr-buraco"><span>Sem autorização de imagem — o cliente não vê
                <b>${esc(v.titulo || '')}</b></span></div>`;
    }
    if (v.faltando) return '<div class="apr-buraco"><span>Vídeo removido</span></div>';
    const estilo = proporcao ? proporcional('', v, teto) : '';
    return `<video data-chave="${esc(v.proxy_chave)}" data-capa="${esc(v.capa_chave || '')}"
                   ${alt ? `aria-label="${esc(alt)}"` : ''} ${estilo ? `style="${estilo}"` : ''}
                   width="${Number(v.largura) || 1600}" height="${Number(v.altura) || 900}"
                   muted loop playsinline autoplay preload="metadata"></video>`;
};

const cabecaSecao = (d, ctx) => `
    <header class="apr-secao__cabeca">
        <span class="apr-olho">${ctx.numero ? `<b>${String(ctx.numero).padStart(2, '0')}</b>` : ''}${esc(d.rotulo || '')}</span>
        ${d.titulo ? `<h2 class="apr-titulo">${esc(d.titulo)}</h2>` : ''}
    </header>`;

const vazio = (texto, ctx) => ctx.previa ? `<p class="apr-vazio">${esc(texto)}</p>` : '';

// ─────────────────────────────────────────────────────────────────────────
// O catálogo
// ─────────────────────────────────────────────────────────────────────────

/* Opções de fundo para o logo: claro, escuro, a cor de destaque ou uma cor
   da paleta digitada à mão. É o que um manual de marca mostra — a marca no
   fundo em que ela vai viver. */
const FUNDOS = [
    { valor: 'claro',    rotulo: 'Claro' },
    { valor: 'escuro',   rotulo: 'Escuro' },
    { valor: 'destaque', rotulo: 'Cor de destaque' },
    { valor: 'cor',      rotulo: 'Outra cor' },
];
const fundoDoLogo = (item) => {
    if (item.fundo === 'escuro') return { fundo: 'var(--ink)', texto: 'var(--paper)' };
    if (item.fundo === 'destaque') return { fundo: 'var(--apr-destaque)', texto: 'var(--apr-sobre-destaque)' };
    if (item.fundo === 'cor' && hexValido(item.cor)) return { fundo: item.cor, texto: contraste(item.cor) };
    return { fundo: 'var(--paper)', texto: 'var(--ink)' };
};

/* Quando a imagem precisa ser cortada para caber (a capa em tela cheia, a
   imagem de ponta a ponta), a equipe escolhe o que fica: um rosto no alto de
   um retrato não pode ser cortado porque o centro foi o padrão. */
const ENQUADRAMENTOS = [
    { valor: 'centro', rotulo: 'Centro' },
    { valor: 'topo',   rotulo: 'Parte de cima' },
    { valor: 'base',   rotulo: 'Parte de baixo' },
];
const posicao = (v) => `object-position: center ${v === 'topo' ? 'top' : v === 'base' ? 'bottom' : 'center'}`;

/* As larguras da imagem e do vídeo — os dois ocupam a página do mesmo jeito,
   e um vídeo no meio de uma sequência de slides precisa casar com eles. */
const LARGURAS = [
    { valor: 'inteira', rotulo: 'De ponta a ponta' },
    { valor: 'margem', rotulo: 'Com margem' },
    { valor: 'slide', rotulo: 'Slide' },
];
const larguraDe = (v) => (['margem', 'slide'].includes(v) ? v : 'inteira');
const resumoLargura = (v) => ({ margem: 'com margem', slide: 'slide' }[v] || 'de ponta a ponta');

export const BLOCOS = {
    capa: {
        rotulo: 'Capa', icone: 'panel-top',
        descricao: 'Imagem em tela cheia, com o título.',
        padrao: (ctx) => ({ titulo: ctx?.projeto?.nome || 'Identidade visual', subtitulo: '', imagem: null, enquadramento: 'centro' }),
        campos: [
            { nome: 'imagem', rotulo: 'Imagem de fundo', tipo: 'imagem',
              dica: 'Sem imagem, a capa usa a cor de destaque.' },
            { nome: 'enquadramento', rotulo: 'O que fica visível', tipo: 'escolha', opcoes: ENQUADRAMENTOS,
              dica: 'A capa ocupa a tela inteira e corta as bordas — no celular, em pé, corta as laterais.' },
            { nome: 'titulo', rotulo: 'Título', tipo: 'texto' },
            { nome: 'subtitulo', rotulo: 'Subtítulo', tipo: 'texto' },
        ],
        resumo: (d) => d.titulo,
        desenhar: (d, ctx) => `
            <section class="apr-capa ${d.imagem && !d.imagem.bloqueada && !d.imagem.faltando ? 'tem-imagem' : ''}">
                <div class="apr-capa__fundo">${imgHTML(d.imagem, { classe: 'apr-capa__img', estilo: posicao(d.enquadramento) })}</div>
                <div class="apr-capa__texto">
                    <span class="apr-capa__cliente">${esc(ctx.cliente?.nome || '')}</span>
                    <h1 class="apr-capa__titulo">${esc(d.titulo || '')}</h1>
                    ${d.subtitulo ? `<p class="apr-capa__sub">${esc(d.subtitulo)}</p>` : ''}
                </div>
                <span class="apr-capa__rolar" aria-hidden="true"><i data-lucide="arrow-down"></i></span>
            </section>`,
    },

    texto: {
        rotulo: 'Texto', icone: 'text',
        descricao: 'O conceito — a ideia por trás da marca.',
        numerada: true,
        padrao: () => ({ rotulo: 'Conceito', titulo: '', texto: '' }),
        campos: [
            { nome: 'rotulo', rotulo: 'Rótulo da seção', tipo: 'texto', placeholder: 'Conceito' },
            { nome: 'titulo', rotulo: 'Título', tipo: 'texto' },
            { nome: 'texto', rotulo: 'Texto', tipo: 'area',
              dica: 'Linha em branco separa parágrafos.' },
        ],
        resumo: (d) => d.titulo || d.rotulo,
        desenhar: (d, ctx) => `
            <section class="apr-secao apr-texto">
                <div class="apr-largura apr-texto__grade">
                    ${cabecaSecao(d, ctx)}
                    <div class="apr-texto__corpo">${paragrafos(d.texto) || vazio('Escreva o texto deste bloco.', ctx)}</div>
                </div>
            </section>`,
    },

    logo: {
        rotulo: 'Logo', icone: 'badge',
        descricao: 'A marca e as variações, cada uma no seu fundo.',
        numerada: true,
        padrao: () => ({ rotulo: 'Marca', titulo: '', texto: '', itens: [] }),
        campos: [
            { nome: 'rotulo', rotulo: 'Rótulo da seção', tipo: 'texto', placeholder: 'Marca' },
            { nome: 'titulo', rotulo: 'Título', tipo: 'texto' },
            { nome: 'texto', rotulo: 'Texto', tipo: 'area' },
            { nome: 'itens', rotulo: 'Versões da marca', tipo: 'lista', rotuloItem: 'versão',
              novo: () => ({ imagem: null, legenda: '', fundo: 'claro', cor: '' }),
              campos: [
                  { nome: 'imagem', rotulo: 'Arquivo da marca', tipo: 'imagem',
                    dica: 'PNG transparente ou SVG.' },
                  { nome: 'legenda', rotulo: 'Legenda', tipo: 'texto', placeholder: 'Versão principal' },
                  { nome: 'fundo', rotulo: 'Fundo', tipo: 'escolha', opcoes: FUNDOS },
                  { nome: 'cor', rotulo: 'Cor do fundo', tipo: 'cor', quando: (item) => item.fundo === 'cor' },
              ] },
        ],
        resumo: (d) => `${(d.itens || []).length} versão(ões)`,
        desenhar: (d, ctx) => `
            <section class="apr-secao apr-logo">
                <div class="apr-largura">
                    ${cabecaSecao(d, ctx)}
                    ${d.texto ? `<div class="apr-lead">${paragrafos(d.texto)}</div>` : ''}
                    <div class="apr-logo__grade">
                        ${(d.itens || []).map((item, i) => {
                            const f = fundoDoLogo(item);
                            return `
                                <figure class="apr-logo__item ${linhaInteira(i, (d.itens || []).length) ? 'is-principal' : ''}"
                                        style="--logo-fundo:${f.fundo}; --logo-texto:${f.texto}">
                                    <div class="apr-logo__palco">${imgHTML(item.imagem, { classe: 'apr-logo__img', alt: item.legenda })
                                        || vazio('Escolha o arquivo da marca.', ctx)}</div>
                                    ${item.legenda ? `<figcaption>${esc(item.legenda)}</figcaption>` : ''}
                                </figure>`;
                        }).join('') || vazio('Adicione a primeira versão da marca.', ctx)}
                    </div>
                </div>
            </section>`,
    },

    paleta: {
        rotulo: 'Paleta', icone: 'palette',
        descricao: 'As cores, com os códigos para copiar.',
        numerada: true,
        padrao: () => ({ rotulo: 'Cores', titulo: '', texto: '', cores: [] }),
        campos: [
            { nome: 'rotulo', rotulo: 'Rótulo da seção', tipo: 'texto', placeholder: 'Cores' },
            { nome: 'titulo', rotulo: 'Título', tipo: 'texto' },
            { nome: 'texto', rotulo: 'Texto', tipo: 'area' },
            { nome: 'cores', rotulo: 'Cores', tipo: 'lista', rotuloItem: 'cor',
              novo: () => ({ nome: '', hex: '#7F00E1', cmyk: '', pantone: '' }),
              campos: [
                  { nome: 'nome', rotulo: 'Nome', tipo: 'texto', placeholder: 'Violeta' },
                  { nome: 'hex', rotulo: 'Cor', tipo: 'cor' },
                  /* CMYK e Pantone vêm do designer, nunca calculados: a conta
                     a partir do RGB ignora o perfil de impressão e entregaria
                     um número errado com cara de oficial. */
                  { nome: 'cmyk', rotulo: 'CMYK', tipo: 'texto', placeholder: '60 100 0 0', largura: 'metade' },
                  { nome: 'pantone', rotulo: 'Pantone', tipo: 'texto', placeholder: '2597 C', largura: 'metade' },
              ] },
        ],
        resumo: (d) => (d.cores || []).map(c => c.nome || c.hex).join(', ') || 'sem cores',
        desenhar: (d, ctx) => {
            const cores = (d.cores || []).filter(c => hexValido(c.hex));
            return `
            <section class="apr-secao apr-paleta">
                <div class="apr-largura">
                    ${cabecaSecao(d, ctx)}
                    ${d.texto ? `<div class="apr-lead">${paragrafos(d.texto)}</div>` : ''}
                    ${cores.length ? paletaHTML(cores) : vazio('Adicione as cores da marca.', ctx)}
                </div>
            </section>`;
        },
    },

    tipografia: {
        rotulo: 'Tipografia', icone: 'type',
        descricao: 'As fontes da marca, com amostra.',
        numerada: true,
        padrao: () => ({ rotulo: 'Tipografia', titulo: '', fontes: [] }),
        campos: [
            { nome: 'rotulo', rotulo: 'Rótulo da seção', tipo: 'texto', placeholder: 'Tipografia' },
            { nome: 'titulo', rotulo: 'Título', tipo: 'texto' },
            { nome: 'fontes', rotulo: 'Fontes', tipo: 'lista', rotuloItem: 'fonte',
              novo: () => ({ nome: '', uso: '', classificacao: '', estilos: '', descricao: '', pesos: '',
                             fonte_chave: null, arquivo_nome: '', licenca_web: false, amostra: null }),
              campos: [
                  { nome: 'nome', rotulo: 'Nome da fonte', tipo: 'texto', placeholder: 'Instrument Sans' },
                  { nome: 'uso', rotulo: 'Uso', tipo: 'texto', placeholder: 'Títulos e destaques' },
                  { nome: 'classificacao', rotulo: 'Classificação', tipo: 'texto', placeholder: 'Grotesca', largura: 'metade' },
                  { nome: 'estilos', rotulo: 'Estilos', tipo: 'texto', placeholder: '12 estilos', largura: 'metade' },
                  { nome: 'descricao', rotulo: 'Por que esta fonte', tipo: 'area' },
                  { nome: 'pesos', rotulo: 'Pesos em destaque', tipo: 'texto', placeholder: 'ExtraLight, Medium, Bold',
                    dica: 'Separados por vírgula. Pesos diferentes só aparecem com fonte variável; com arquivo de um peso só, as colunas saem iguais.' },
                  { nome: 'fonte_chave', rotulo: 'Arquivo da fonte', tipo: 'fonte' },
                  { nome: 'licenca_web', rotulo: 'A licença permite uso na web', tipo: 'sim',
                    dica: 'Sem isto, o arquivo não vai para a página — a amostra usa a imagem abaixo.' },
                  { nome: 'amostra', rotulo: 'Amostra em imagem', tipo: 'imagem',
                    dica: 'Para fonte sem licença web: um print da amostra.' },
              ] },
        ],
        resumo: (d) => (d.fontes || []).map(f => f.nome).filter(Boolean).join(', ') || 'sem fontes',
        desenhar: (d, ctx) => `
            <section class="apr-secao apr-tipo">
                <div class="apr-largura">
                    ${cabecaSecao(d, ctx)}
                    <div class="apr-tipo__lista">
                        ${(d.fontes || []).map((f, i) => fonteHTML(f, `apr-fonte-${ctx.bloco?.id || 'b'}-${i}`, ctx)).join('')
                          || vazio('Adicione as fontes da marca.', ctx)}
                    </div>
                </div>
            </section>`,
    },

    aplicacoes: {
        rotulo: 'Aplicações', icone: 'layout-grid',
        descricao: 'Mockups: cartão, fachada, redes, uniforme.',
        numerada: true,
        padrao: () => ({ rotulo: 'Aplicações', titulo: '', texto: '', disposicao: 'mosaico', itens: [] }),
        campos: [
            { nome: 'rotulo', rotulo: 'Rótulo da seção', tipo: 'texto', placeholder: 'Aplicações' },
            { nome: 'titulo', rotulo: 'Título', tipo: 'texto' },
            { nome: 'texto', rotulo: 'Texto', tipo: 'area' },
            /* Mockup chega em toda proporção — 16:9, retrato, quadrado. O
               mosaico respeita cada uma e encaixa as colunas; a grade iguala
               as alturas cortando um pouco das bordas. */
            { nome: 'disposicao', rotulo: 'Disposição', tipo: 'escolha', opcoes: [
                { valor: 'mosaico', rotulo: 'Mosaico — cada imagem inteira, na proporção dela' },
                { valor: 'grade',   rotulo: 'Grade — mesma altura, corta um pouco das bordas' },
            ] },
            { nome: 'itens', rotulo: 'Aplicações', tipo: 'lista', rotuloItem: 'aplicação',
              novo: () => ({ imagem: null, legenda: '', destaque: false }),
              campos: [
                  { nome: 'imagem', rotulo: 'Imagem', tipo: 'imagem' },
                  { nome: 'legenda', rotulo: 'Legenda', tipo: 'texto', placeholder: 'Cartão de visita' },
                  { nome: 'destaque', rotulo: 'Ocupar a linha inteira', tipo: 'sim',
                    dica: 'Sozinha, na largura toda — sem passar da altura da tela.' },
              ] },
        ],
        resumo: (d) => `${(d.itens || []).length} aplicação(ões)`,
        desenhar: (d, ctx) => `
            <section class="apr-secao apr-apl">
                <div class="apr-largura">
                    ${cabecaSecao(d, ctx)}
                    ${d.texto ? `<div class="apr-lead">${paragrafos(d.texto)}</div>` : ''}
                    ${aplicacoesHTML(d, ctx) || vazio('Adicione as aplicações.', ctx)}
                </div>
            </section>`,
    },

    imagem: {
        rotulo: 'Imagem', icone: 'image',
        descricao: 'Uma imagem inteira, sem moldura.',
        padrao: () => ({ imagem: null, legenda: '', largura: 'inteira', enquadramento: 'centro' }),
        campos: [
            { nome: 'imagem', rotulo: 'Imagem', tipo: 'imagem' },
            { nome: 'largura', rotulo: 'Largura', tipo: 'escolha', opcoes: LARGURAS,
              dica: 'De ponta a ponta, imagem mais alta que a tela é cortada; com margem, ela cabe inteira. Slide é para telas de uma apresentação em sequência: grandes e quase coladas umas nas outras.' },
            { nome: 'enquadramento', rotulo: 'O que fica visível no corte', tipo: 'escolha', opcoes: ENQUADRAMENTOS },
            { nome: 'legenda', rotulo: 'Legenda', tipo: 'texto' },
        ],
        resumo: (d) => d.legenda || resumoLargura(d.largura),
        desenhar: (d, ctx) => {
            const largura = larguraDe(d.largura);
            const img = imgHTML(d.imagem, { alt: d.legenda, estilo: posicao(d.enquadramento),
                                            proporcao: largura !== 'inteira', teto: tetoDe(largura, ctx) });
            if (!img && !ctx.previa) return '';
            return `
                <section class="apr-imagem apr-imagem--${largura}">
                    <figure>
                        ${img || vazio('Escolha a imagem.', ctx)}
                        ${d.legenda ? `<figcaption>${esc(d.legenda)}</figcaption>` : ''}
                    </figure>
                </section>`;
        },
    },

    video: {
        rotulo: 'Vídeo', icone: 'film',
        descricao: 'Um vídeo curto em loop, que toca sozinho e sem som.',
        padrao: () => ({ video: null, legenda: '', largura: 'margem' }),
        campos: [
            { nome: 'video', rotulo: 'Vídeo', tipo: 'video',
              dica: 'MP4 ou WebM, curto: a animação do logo, uma vinheta. Toca sozinho, em loop e sem som.' },
            { nome: 'largura', rotulo: 'Largura', tipo: 'escolha', opcoes: LARGURAS,
              dica: 'Os mesmos tamanhos da imagem: no meio de uma sequência de slides, escolha Slide.' },
            { nome: 'legenda', rotulo: 'Legenda', tipo: 'texto' },
        ],
        resumo: (d) => d.legenda || resumoLargura(d.largura),
        desenhar: (d, ctx) => {
            const largura = larguraDe(d.largura);
            const video = videoHTML(d.video, { alt: d.legenda, proporcao: largura !== 'inteira',
                                               teto: tetoDe(largura, ctx) });
            if (!video && !ctx.previa) return '';
            return `
                <section class="apr-imagem apr-imagem--${largura}">
                    <figure>
                        ${video || vazio('Escolha o vídeo.', ctx)}
                        ${d.legenda ? `<figcaption>${esc(d.legenda)}</figcaption>` : ''}
                    </figure>
                </section>`;
        },
    },

    antes_depois: {
        rotulo: 'Antes e depois', icone: 'columns-2',
        descricao: 'A marca antiga e a nova, com divisor arrastável.',
        numerada: true,
        padrao: () => ({ rotulo: 'Antes e depois', titulo: '', antes: null, depois: null, fundo: 'claro', legenda: '' }),
        campos: [
            { nome: 'rotulo', rotulo: 'Rótulo da seção', tipo: 'texto', placeholder: 'Antes e depois' },
            { nome: 'titulo', rotulo: 'Título', tipo: 'texto' },
            { nome: 'antes', rotulo: 'Antes', tipo: 'imagem' },
            { nome: 'depois', rotulo: 'Depois', tipo: 'imagem' },
            /* Logo de tinta escura some no fundo escuro da página. O fundo
               do comparador é escolhido, como no bloco de logo. */
            { nome: 'fundo', rotulo: 'Fundo', tipo: 'escolha', opcoes: FUNDOS.slice(0, 2) },
            { nome: 'legenda', rotulo: 'Legenda', tipo: 'texto' },
        ],
        resumo: (d) => d.titulo || d.rotulo,
        desenhar: (d, ctx) => {
            const usavel = (i) => i && !i.bloqueada && !i.faltando;
            const pronto = usavel(d.antes) && usavel(d.depois);
            const proporcao = pronto ? `${d.depois.largura} / ${d.depois.altura}` : '16 / 9';
            return `
                <section class="apr-secao apr-ad">
                    <div class="apr-largura">
                        ${cabecaSecao(d, ctx)}
                        ${pronto ? `
                            <div class="apr-ad__palco" data-antes-depois
                                 style="aspect-ratio:${proporcao}; --pos: 50%; background:${d.fundo === 'escuro' ? 'var(--ink)' : 'var(--paper)'}">
                                ${imgHTML(d.depois, { classe: 'apr-ad__img apr-ad__depois', alt: 'Depois' })}
                                ${imgHTML(d.antes, { classe: 'apr-ad__img apr-ad__antes', alt: 'Antes' })}
                                <span class="apr-ad__linha" aria-hidden="true"></span>
                                <span class="apr-ad__rotulo apr-ad__rotulo--antes">Antes</span>
                                <span class="apr-ad__rotulo apr-ad__rotulo--depois">Depois</span>
                                <input class="apr-ad__controle" type="range" min="0" max="100" value="50"
                                       aria-label="Arraste para comparar antes e depois">
                            </div>` : ctx.previa ? `
                            <div class="apr-ad__dupla">
                                ${imgHTML(d.antes) || vazio('Escolha a imagem de antes.', ctx)}
                                ${imgHTML(d.depois) || vazio('Escolha a imagem de depois.', ctx)}
                            </div>` : ''}
                        ${d.legenda ? `<p class="apr-legenda">${esc(d.legenda)}</p>` : ''}
                    </div>
                </section>`;
        },
    },

    /* O fechamento é da moldura: sempre existe, sempre por último, e é onde o
       cliente aprova ou pede ajuste. A equipe edita o texto, não o lugar. */
    fechamento: {
        rotulo: 'Fechamento', icone: 'circle-check',
        descricao: 'Aprovar ou pedir ajuste.',
        fixo: true,
        padrao: () => ({ titulo: 'O que você achou?',
                         texto: 'Se estiver tudo certo, aprove esta versão. Se quiser mudar alguma coisa, peça o ajuste — a equipe recebe na hora.' }),
        campos: [
            { nome: 'titulo', rotulo: 'Título', tipo: 'texto' },
            { nome: 'texto', rotulo: 'Texto', tipo: 'area' },
        ],
        resumo: () => 'Aprovar ou pedir ajuste',
        desenhar: (d) => `
            <section class="apr-secao apr-fim">
                <div class="apr-largura apr-fim__grade">
                    <div>
                        <h2 class="apr-titulo">${esc(d.titulo || 'O que você achou?')}</h2>
                        ${paragrafos(d.texto)}
                    </div>
                    <div class="apr-decisao" data-decisao></div>
                </div>
            </section>`,
    },
};

/* ── PALETA EM MOSAICO ─────────────────────────────────────────────────
   A primeira metade das cores empilha numa coluna larga; o resto vira
   colunas altas ao lado, da altura da pilha inteira. É a ordem da lista
   que decide: as cores principais vêm primeiro. No celular, uma embaixo
   da outra. */
function paletaHTML(cores) {
    const naPilha = cores.length === 1 ? 1 : Math.ceil(cores.length / 2);
    const colunas = cores.length - naPilha;
    // A pilha fica com pouco mais da metade quando há duas colunas ao lado.
    const trilhos = colunas
        ? `minmax(0, ${colunas === 1 ? 1.5 : 2.8}fr) repeat(${colunas}, minmax(0, 1fr))`
        : '1fr';
    const painel = (c, lugar) => {
        const hex = c.hex.toUpperCase();
        const valor = (rotulo, v) => `
            <button class="apr-copiar" data-copiar="${esc(v)}" type="button">
                <span>${rotulo}</span><b>${esc(v)}</b></button>`;
        return `
            <article class="apr-cor" style="background:${hex}; color:${contraste(hex)}; ${lugar}">
                <h3 class="apr-cor__nome">${esc(c.nome || hex)}</h3>
                <div class="apr-cor__valores">
                    ${valor('RGB', rgbDe(hex).join(', '))}
                    ${valor('HEX', hex)}
                    ${c.cmyk ? valor('CMYK', c.cmyk) : ''}
                    ${c.pantone ? valor('Pantone', c.pantone) : ''}
                </div>
            </article>`;
    };
    return `
        <div class="apr-paleta__mosaico" style="--pilha:${naPilha}; --trilhos:${trilhos}">
            ${cores.map((c, i) => painel(c, i < naPilha
                ? `--coluna:1; --linha:${i + 1}`
                : `--coluna:${i - naPilha + 2}; --linha:1 / -1`)).join('')}
        </div>`;
}

/* ── TIPOGRAFIA ────────────────────────────────────────────────────────
   À esquerda, a ficha: o nome escrito na própria fonte, a linha com
   classificação, uso e estilos, o porquê e o alfabeto. À direita, um "a"
   enorme por peso, cada um cortado pela coluna seguinte. Os pesos chegam
   por nome ("Bold") ou número ("700"). */
const PESOS = {
    thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300,
    regular: 400, normal: 400, book: 400, medium: 500, semibold: 600, demibold: 600,
    bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900,
};
const pesosDe = (texto) => String(texto || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 4)
    .map(s => {
        const numero = s.match(/\d{3}/)?.[0];
        const nome = s.replace(/\d{3}/, '').trim();
        const peso = numero ? Number(numero) : PESOS[nome.toLowerCase().replace(/[\s_-]/g, '')] || 400;
        return { nome: nome || String(peso), peso: Math.min(1000, Math.max(1, peso)) };
    });

function fonteHTML(f, familia, ctx) {
    const comArquivo = f.fonte_chave && f.licenca_web;
    const meta = [f.classificacao, f.uso, f.estilos].filter(Boolean);
    const pesos = pesosDe(f.pesos);
    const lado = comArquivo ? `
            <div class="apr-fonte__pesos">
                ${(pesos.length ? pesos : [{ nome: '', peso: null }]).map(p => `
                    <div class="apr-fonte__peso">
                        ${p.nome ? `<span>${esc(p.nome)}</span>` : ''}
                        <b class="apr-fonte__a" ${p.peso ? `style="font-weight:${p.peso}"` : ''} aria-hidden="true">a</b>
                    </div>`).join('')}
            </div>`
        : f.amostra ? `<div class="apr-fonte__imagem">${imgHTML(f.amostra, { alt: f.nome })}</div>`
        : vazio('Envie o arquivo da fonte (com licença web) ou uma amostra em imagem.', ctx);
    const fonte = comArquivo
        ? `data-fonte-chave="${esc(f.fonte_chave)}" data-fonte-familia="${familia}" style="font-family:'${familia}', var(--font-sans)"`
        : '';
    return `
        <article class="apr-fonte ${lado ? '' : 'is-so-ficha'}" ${fonte}>
            <div class="apr-fonte__ficha">
                <h3 class="apr-fonte__nome">${esc(f.nome || 'Fonte')}</h3>
                ${meta.length ? `<div class="apr-fonte__meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>` : ''}
                <div class="apr-fonte__corpo">
                    ${f.descricao ? paragrafos(f.descricao) : ''}
                    ${comArquivo ? `<p class="apr-fonte__glifos">ABCDEFGHIJKLMNOPQRSTUVWXYZ
                        abcdefghijklmnopqrstuvwxyz 0123456789!@#$%&amp;*()?</p>` : ''}
                </div>
            </div>
            ${lado}
        </article>`;
}

/* ── NENHUMA IMAGEM SOZINHA EM COLUNA DUPLA ────────────────────────────
   Em duas colunas, toda imagem tem companheira ao lado, com a base
   alinhada. A que sobra — a terceira de três, a quinta de cinco — não fica
   embaixo com um buraco ao lado: ocupa a linha inteira. É a regra que o
   bloco de logo já seguia com a versão principal, agora para todo mundo. */
const linhaInteira = (i, total) => i === 0 || (i === total - 1 && (total - 1) % 2 === 1);

/* As aplicações em trechos: cada item em destaque é uma linha sozinha, e os
   outros seguidos andam de dois em dois — a ordem que a equipe montou é a
   ordem que o cliente lê.

   Mosaico: o par divide a largura NA PROPORÇÃO das duas imagens, e as duas
   saem com a mesma altura, inteiras, sem corte. Grade: o par é 4:3 e corta
   as bordas. Nos dois, a que sobra no fim de um trecho vira linha inteira. */
function aplicacoesHTML(d, ctx) {
    const disposicao = d.disposicao === 'grade' ? 'grade' : 'mosaico';
    const trechos = [];
    let corrente = [];
    const fechar = () => { if (corrente.length) trechos.push(corrente); corrente = []; };

    for (const item of d.itens || []) {
        const usavel = item.imagem && !item.imagem.bloqueada && !item.imagem.faltando;
        if (!usavel && !imgHTML(item.imagem) && !ctx.previa) continue;
        const entrada = {
            item,
            razao: usavel && item.imagem.largura && item.imagem.altura ? item.imagem.largura / item.imagem.altura : 4 / 3,
        };
        if (item.destaque) { fechar(); trechos.push([{ ...entrada, sozinha: true }]); }
        else corrente.push(entrada);
    }
    fechar();

    const figura = ({ item }, { sozinha = false, estilo = '' } = {}) => `
        <figure class="apr-apl__item" ${estilo ? `style="${estilo}"` : ''}>
            ${imgHTML(item.imagem, { alt: item.legenda, proporcao: sozinha }) || vazio('Escolha a imagem.', ctx)}
            ${item.legenda ? `<figcaption>${esc(item.legenda)}</figcaption>` : ''}
        </figure>`;
    const sozinhaHTML = (e) => `<div class="apr-apl__destaque">${figura(e, { sozinha: true })}</div>`;

    const linhas = [];
    for (const trecho of trechos) {
        for (let i = 0; i < trecho.length; i += 2) {
            const [a, b] = [trecho[i], trecho[i + 1]];
            if (!b || a.sozinha) { linhas.push(sozinhaHTML(a)); continue; }
            linhas.push(disposicao === 'grade'
                ? `<div class="apr-apl__grade">${figura(a)}${figura(b)}</div>`
                // flex-grow na proporção: larguras proporcionais = alturas iguais.
                : `<div class="apr-apl__par">${figura(a, { estilo: `--r: ${a.razao.toFixed(4)}` })}${figura(b, { estilo: `--r: ${b.razao.toFixed(4)}` })}</div>`);
        }
    }
    return linhas.join('');
}

/** Os tipos que a equipe pode adicionar, na ordem do menu. */
export const ADICIONAVEIS = ['capa', 'texto', 'logo', 'paleta', 'tipografia', 'aplicacoes', 'imagem', 'video', 'antes_depois'];

/** A página que nasce quando o projeto vira apresentação. */
export const PAGINA_INICIAL = ['capa', 'texto', 'logo', 'paleta', 'tipografia', 'aplicacoes', 'fechamento'];

// ─────────────────────────────────────────────────────────────────────────
// A página
// ─────────────────────────────────────────────────────────────────────────

/** A cor de destaque, validada, e o texto que vai em cima dela. */
export const variaveisDeVisual = (visual) => {
    const destaque = hexValido(visual?.destaque) ? visual.destaque : null;
    return destaque
        ? `--apr-destaque:${destaque}; --apr-sobre-destaque:${contraste(destaque)}`
        : '--apr-destaque:var(--accent); --apr-sobre-destaque:var(--accent-contrast)';
};

/**
 * A página é uma sequência de telas? Todo bloco, fora o fechamento, é imagem
 * ou vídeo na largura Slide. Aí ela vira modo telas (apresentacao.js): cada
 * tela ocupa a tela inteira, a rolagem trava em uma por vez e o topo sai —
 * as telas já trazem a marca do estúdio desenhada nelas.
 */
export const ehTelas = (blocos) => {
    const miolo = (blocos || []).filter(b => b.tipo !== 'fechamento');
    return miolo.length > 0
        && miolo.every(b => ['imagem', 'video'].includes(b.tipo) && b.dados?.largura === 'slide');
};

/* Teto de altura, em % da tela: no modo telas, o slide pode ir até a borda. */
const tetoDe = (largura, ctx) => (largura === 'slide' ? (ctx.telas ? 100 : 92) : 85);

/**
 * Os blocos de uma apresentação, em HTML. A moldura (topo e rodapé) é de
 * quem chama; aqui só o miolo — e o fechamento, que existe sempre: uma
 * página publicada antes dele existir ainda precisa do lugar de aprovar.
 */
export const desenharBlocos = (visao) => {
    const blocos = [...(visao.blocos || [])];
    if (!blocos.some(b => b.tipo === 'fechamento')) {
        blocos.push({ id: 'fechamento', tipo: 'fechamento', dados: BLOCOS.fechamento.padrao() });
    }
    const telas = ehTelas(blocos);
    let numero = 0;
    return blocos.map(b => {
        const tipo = BLOCOS[b.tipo];
        if (!tipo) return '';
        const ctx = {
            previa: visao.previa, cliente: visao.cliente, projeto: visao.projeto, bloco: b,
            numero: tipo.numerada ? ++numero : null, telas,
        };
        return `<div class="apr-bloco" data-bloco="${esc(b.id)}" data-tipo="${esc(b.tipo)}">${tipo.desenhar(b.dados || {}, ctx)}</div>`;
    }).join('');
};

/** Pinta as imagens e carrega as fontes. Imagem que não está aqui vira aviso. */
export const pintarMidia = (raiz) => {
    raiz.querySelectorAll('img[data-chave]').forEach(async (img) => {
        const url = await midia.url(img.dataset.chave).catch(() => null);
        if (url) img.src = url;
        else img.replaceWith(Object.assign(document.createElement('div'), {
            className: `apr-buraco ${img.className}`, textContent: 'Imagem indisponível neste aparelho',
        }));
    });
    raiz.querySelectorAll('video[data-chave]').forEach(async (video) => {
        const [url, capa] = await Promise.all([video.dataset.chave, video.dataset.capa]
            .map(c => midia.url(c).catch(() => null)));
        if (!url) {
            return video.replaceWith(Object.assign(document.createElement('div'), {
                className: 'apr-buraco', textContent: 'Vídeo indisponível neste aparelho',
            }));
        }
        if (capa) video.poster = capa;
        // O atributo `muted` vindo de innerHTML não liga a propriedade em todo
        // navegador, e sem ela o autoplay é recusado.
        video.muted = true;
        video.src = url;
        // Quem pediu menos movimento vê a capa e decide se toca.
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            video.removeAttribute('autoplay');
            video.controls = true;
            return;
        }
        video.play().catch(() => { video.controls = true; });
    });
    raiz.querySelectorAll('[data-fonte-chave]').forEach(async (el) => {
        const familia = el.dataset.fonteFamilia;
        if ([...document.fonts].some(f => f.family === familia)) return;
        const url = await midia.url(el.dataset.fonteChave).catch(() => null);
        if (!url) return;
        try {
            // Faixa inteira de pesos: fonte variável mostra cada peso de
            // verdade; fonte de um peso só fica igual, em vez de o navegador
            // engrossar ou afinar o desenho por conta própria.
            const fonte = new FontFace(familia, `url(${url})`, { weight: '1 1000' });
            await fonte.load();
            document.fonts.add(fonte);
        } catch {
            el.insertAdjacentHTML('beforeend', '<p class="apr-vazio">O arquivo desta fonte não abriu.</p>');
        }
    });
};

/** O que o bloco faz sozinho: copiar códigos de cor e arrastar o antes/depois. */
export const ligarBlocos = (raiz) => {
    raiz.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(b.dataset.copiar);
            b.classList.add('is-copiado');
            const antes = b.querySelector('span').textContent;
            b.querySelector('span').textContent = 'Copiado';
            setTimeout(() => { b.classList.remove('is-copiado'); b.querySelector('span').textContent = antes; }, 1400);
        } catch { /* sem área de transferência: o valor continua na tela para copiar à mão */ }
    }));
    raiz.querySelectorAll('[data-antes-depois]').forEach(palco => {
        const controle = palco.querySelector('input[type=range]');
        controle?.addEventListener('input', () => palco.style.setProperty('--pos', `${controle.value}%`));
    });
};

// ─────────────────────────────────────────────────────────────────────────

export const ESTILOS_BLOCOS = `
    /* ── Ritmo ────────────────────────────────────────────────────────────
       Nasce no celular e cresce em min-width, como toda tela do cliente. */
    .apr-largura { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 var(--space-5); }
    .apr-secao { padding: clamp(64px, 12vw, 160px) 0; border-top: 1px solid var(--border-subtle); }
    .apr-bloco:first-child .apr-secao { border-top: none; }
    .apr-secao__cabeca { display: flex; flex-direction: column; gap: var(--space-4); margin-bottom: clamp(32px, 5vw, 64px); }

    .apr-olho {
        display: inline-flex; align-items: baseline; gap: var(--space-3);
        font-size: var(--text-xs); font-weight: 600; letter-spacing: var(--tracking-wide);
        text-transform: uppercase; color: var(--text-tertiary);
    }
    .apr-olho b { color: var(--apr-destaque); font-variant-numeric: tabular-nums; }

    .apr-titulo {
        margin: 0; max-width: 18ch;
        font-size: clamp(36px, 7vw, 88px); line-height: 0.95;
        font-weight: 700; font-stretch: 75%; font-variation-settings: 'wdth' 75;
        text-transform: uppercase; letter-spacing: var(--tracking-display);
        color: var(--text-primary);
    }
    .apr-lead { max-width: 62ch; margin-bottom: clamp(32px, 5vw, 56px); }
    .apr-lead p, .apr-texto__corpo p, .apr-fim p {
        margin: 0 0 1em; font-size: clamp(17px, 1.6vw, 21px); line-height: 1.6; color: var(--text-secondary);
    }
    .apr-legenda, .apr-secao figcaption {
        margin-top: var(--space-3); font-size: var(--text-sm); color: var(--text-tertiary);
    }
    .apr-vazio {
        margin: 0; padding: var(--space-5); border: 1px dashed var(--border-strong);
        border-radius: var(--radius-md); font-size: var(--text-sm); color: var(--text-tertiary);
    }
    .apr-buraco {
        display: flex; align-items: center; justify-content: center; min-height: 160px;
        padding: var(--space-5); text-align: center;
        background: repeating-linear-gradient(45deg, var(--surface-2) 0 12px, var(--surface-3) 12px 24px);
        border-radius: var(--radius-md); font-size: var(--text-sm); color: var(--text-secondary);
    }
    .apr-buraco b { display: block; margin-top: 4px; color: var(--text-primary); }

    /* ── Capa ─────────────────────────────────────────────────────────── */
    .apr-capa {
        position: relative; min-height: 100svh; overflow: hidden;
        display: flex; align-items: flex-end;
        background: radial-gradient(120% 90% at 20% 10%,
                    color-mix(in srgb, var(--apr-destaque) 85%, var(--paper)) 0%, var(--apr-destaque) 45%,
                    color-mix(in srgb, var(--apr-destaque) 55%, var(--ink)) 100%);
        color: var(--apr-sobre-destaque);
    }
    .apr-capa.tem-imagem { color: var(--paper); background: var(--ink); }
    .apr-capa__fundo { position: absolute; inset: 0; }
    .apr-capa__fundo .apr-buraco { position: absolute; inset: 0; border-radius: 0; }
    .apr-capa__img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .apr-capa.tem-imagem .apr-capa__fundo::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(to top, color-mix(in srgb, var(--ink) 78%, transparent) 0%,
                    color-mix(in srgb, var(--ink) 20%, transparent) 55%, transparent 100%);
    }
    .apr-capa__texto {
        position: relative; z-index: 1; width: 100%; max-width: 1200px; margin: 0 auto;
        padding: 0 var(--space-5) clamp(56px, 10vh, 120px);
        display: flex; flex-direction: column; gap: var(--space-4);
    }
    .apr-capa__cliente { font-size: var(--text-sm); font-weight: 600; letter-spacing: var(--tracking-wide); text-transform: uppercase; opacity: 0.8; }
    .apr-capa__titulo {
        margin: 0; color: inherit; max-width: 14ch;
        font-size: clamp(52px, 13vw, 168px); line-height: 0.88;
        font-weight: 700; font-stretch: 75%; font-variation-settings: 'wdth' 75;
        text-transform: uppercase; letter-spacing: var(--tracking-display);
    }
    .apr-capa__sub { margin: 0; max-width: 46ch; font-size: clamp(17px, 1.8vw, 22px); line-height: 1.5; opacity: 0.88; }
    .apr-capa__rolar {
        position: absolute; z-index: 1; right: var(--space-5); bottom: var(--space-6);
        width: 44px; height: 44px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        border: 1px solid currentColor; opacity: 0.6;
    }
    .apr-capa__rolar svg { width: 18px; height: 18px; }

    /* ── Texto ────────────────────────────────────────────────────────── */
    .apr-texto__grade { display: grid; gap: var(--space-6); }
    .apr-texto__corpo p:first-child { font-size: clamp(20px, 2.2vw, 28px); line-height: 1.45; color: var(--text-primary); }

    /* ── Logo ─────────────────────────────────────────────────────────── */
    .apr-logo__grade { display: grid; grid-template-columns: 1fr; gap: var(--space-3); }
    .apr-logo__item { margin: 0; display: flex; flex-direction: column; }
    .apr-logo__palco {
        aspect-ratio: 4 / 3; border-radius: var(--radius-lg); overflow: hidden;
        display: flex; align-items: center; justify-content: center; padding: 16%;
        background: var(--logo-fundo); color: var(--logo-texto);
        border: 1px solid var(--border-subtle);
    }
    .apr-logo__item.is-principal .apr-logo__palco { aspect-ratio: 16 / 9; padding: 12% 22%; }
    .apr-logo__img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; }
    .apr-logo__palco .apr-vazio, .apr-logo__palco .apr-buraco { width: 100%; }

    /* ── Paleta ───────────────────────────────────────────────────────── */
    .apr-paleta__mosaico {
        display: flex; flex-direction: column; overflow: hidden;
        border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);
    }
    .apr-cor {
        container-type: inline-size;
        min-height: 176px; padding: var(--space-5);
        display: flex; flex-direction: column; justify-content: space-between; gap: var(--space-6);
    }
    /* O título herda a cor do painel: a trava de títulos do DS (html.ds h3)
       pintaria o nome de claro em cima do marfim. */
    .apr-cor h3.apr-cor__nome { margin: 0; font-family: var(--font-sans); font-size: clamp(18px, 1.8vw, 24px); font-weight: 500; letter-spacing: var(--tracking-tight); color: inherit; }
    .apr-cor__valores { display: flex; flex-direction: column; align-items: flex-start; }
    .apr-copiar {
        display: grid; grid-template-columns: 4.5em auto; align-items: baseline; gap: var(--space-3);
        min-height: 28px; padding: 2px var(--space-2); margin-left: calc(-1 * var(--space-2));
        border: none; border-radius: var(--radius-sm); background: none; color: inherit; text-align: left;
        font-family: var(--font-sans); cursor: pointer; transition: background-color var(--dur-fast);
    }
    .apr-copiar span { font-size: var(--text-xs); opacity: 0.72; letter-spacing: var(--tracking-wide); text-transform: uppercase; }
    /* Código de cor não quebra: "245 198" numa linha e "110" na outra é um
       código errado para quem copia com os olhos. */
    .apr-copiar b { font-size: var(--text-sm); font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .apr-copiar:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
    .apr-copiar.is-copiado span { opacity: 1; }
    /* Coluna estreita: o rótulo sobe para cima do código, e o código
       continua inteiro numa linha. */
    @container (max-width: 210px) {
        .apr-copiar { grid-template-columns: 1fr; gap: 0; padding-top: 4px; padding-bottom: 4px; }
    }

    /* ── Tipografia ───────────────────────────────────────────────────── */
    .apr-tipo__lista { display: flex; flex-direction: column; gap: clamp(64px, 10vw, 140px); }
    .apr-fonte { display: grid; gap: var(--space-8); color: var(--text-primary); }
    .apr-fonte h3.apr-fonte__nome {
        margin: 0; font-family: inherit; color: inherit;
        font-size: clamp(44px, 17cqi, 128px); line-height: 0.95; font-weight: 500; letter-spacing: var(--tracking-tight);
        overflow-wrap: break-word;
    }
    .apr-fonte__meta {
        display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2) var(--space-5);
        margin-top: clamp(40px, 8vw, 120px); padding-top: var(--space-3);
        border-top: 1px solid var(--border-strong); font-size: var(--text-sm); color: var(--text-secondary);
    }
    /* O nome mede pela ficha, não pela tela: palavra longa encolhe em vez
       de quebrar no meio. */
    .apr-fonte__ficha { min-width: 0; container-type: inline-size; }
    .apr-fonte__corpo { margin-top: clamp(32px, 5vw, 64px); }
    .apr-fonte__corpo p:not(.apr-fonte__glifos) {
        margin: 0 0 1em; max-width: 52ch; font-size: var(--text-sm); line-height: 1.55; color: var(--text-secondary);
    }
    .apr-fonte__glifos { margin: var(--space-6) 0 0; font-size: clamp(24px, 3vw, 34px); line-height: 1.15; overflow-wrap: anywhere; }

    /* Uma coluna por peso. O "a" passa da largura de propósito: a coluna
       seguinte o corta, e o que sobra é a forma da letra. */
    .apr-fonte__pesos { display: flex; min-height: clamp(280px, 44vw, 600px); border-right: 1px solid var(--border-strong); }
    .apr-fonte__peso {
        position: relative; flex: 1 1 0; min-width: 0; overflow: hidden;
        padding: var(--space-4); border-left: 1px solid var(--border-strong);
    }
    .apr-fonte__peso:last-child { flex-grow: 1.7; }
    .apr-fonte__peso span { position: relative; z-index: 1; font-size: var(--text-sm); color: var(--text-secondary); }
    .apr-fonte__a {
        position: absolute; left: var(--space-3); bottom: -0.1em;
        font-size: clamp(200px, 30vw, 440px); line-height: 1; font-weight: inherit;
    }
    .apr-fonte__imagem img { width: 100%; height: auto; display: block; border-radius: var(--radius-md); }

    /* ── Aplicações ───────────────────────────────────────────────────── */
    .apr-apl { --apr-vao: var(--space-3); }
    .apr-apl .apr-largura > div + div { margin-top: var(--apr-vao); }
    .apr-apl__item { margin: 0; }
    .apr-apl__item img { width: 100%; height: auto; display: block; border-radius: var(--radius-lg); background: var(--surface-2); }

    /* Mosaico: o par lado a lado, cada imagem inteira e as duas com a mesma
       altura. No celular, uma por linha. */
    .apr-apl__par { display: flex; flex-direction: column; gap: var(--apr-vao); }
    .apr-apl__par .apr-apl__item { min-width: 0; }

    /* Grade: mesma altura, a imagem preenche e corta as bordas. */
    .apr-apl__grade { display: grid; grid-template-columns: 1fr; gap: var(--apr-vao); }
    .apr-apl__grade .apr-apl__item img { aspect-ratio: 4 / 3; object-fit: cover; }

    /* Destaque: a linha inteira, mas nunca mais alta que a tela — um
       quadrado de 1080 não vira uma parede de 1200 px. */
    .apr-apl__destaque .apr-apl__item { display: flex; flex-direction: column; align-items: center; }
    .apr-apl__destaque .apr-apl__item img { width: auto; max-width: 100%; max-height: 85svh; }

    /* ── Imagem inteira ───────────────────────────────────────────────── */
    .apr-imagem figure { margin: 0; }
    /* Teto de altura: de ponta a ponta, imagem mais alta que a tela é
       cortada no enquadramento escolhido; com margem, ela encolhe inteira. */
    .apr-imagem :is(img, video) { width: 100%; height: auto; display: block; }
    .apr-imagem--inteira :is(img, video) { max-height: 90svh; object-fit: cover; }
    .apr-imagem--margem figure { display: flex; flex-direction: column; align-items: center; }
    .apr-imagem--margem :is(img, video) { width: auto; max-width: 100%; max-height: 85svh; }
    .apr-imagem figcaption { padding: 0 var(--space-5); }
    .apr-imagem--margem { padding: clamp(32px, 6vw, 80px) var(--space-5); }
    .apr-imagem--margem figure { max-width: 1200px; margin: 0 auto; }
    .apr-imagem--margem :is(img, video) { border-radius: var(--radius-lg); }
    /* Slide: telas de uma apresentação lidas em sequência. Maiores que "com
       margem" e quase coladas — o respiro de seção entre cada uma faria a
       sequência parecer uma pilha de imagens soltas. */
    .apr-imagem--slide { padding: clamp(4px, 0.6vw, 8px) var(--space-3); }
    .apr-imagem--slide figure { display: flex; flex-direction: column; align-items: center; max-width: 1600px; margin: 0 auto; }
    .apr-imagem--slide :is(img, video) { width: auto; max-width: 100%; max-height: 92svh; border-radius: var(--radius-md); }
    .apr-bloco:first-child .apr-imagem--slide { padding-top: clamp(16px, 3vw, 40px); }

    /* ── Antes e depois ───────────────────────────────────────────────── */
    .apr-ad__palco {
        position: relative; width: 100%; overflow: hidden; border-radius: var(--radius-lg);
        background: var(--surface-2); user-select: none;
    }
    .apr-ad__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    /* Cada lado recortado no SEU pedaço da linha. Recortar só o de cima
       funciona com foto, mas logo é PNG transparente: o "depois" aparecia
       por baixo do "antes" e as duas marcas se sobrepunham. */
    .apr-ad__antes { clip-path: inset(0 calc(100% - var(--pos)) 0 0); }
    .apr-ad__depois { clip-path: inset(0 0 0 var(--pos)); }
    .apr-ad__linha {
        position: absolute; top: 0; bottom: 0; left: var(--pos); width: 2px; transform: translateX(-1px);
        background: var(--paper); box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 30%, transparent);
        pointer-events: none;
    }
    .apr-ad__linha::after {
        content: '⟷'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: var(--paper); color: var(--ink); font-size: 18px;
    }
    .apr-ad__rotulo {
        position: absolute; top: var(--space-3); padding: 4px 10px; border-radius: var(--radius-pill);
        background: color-mix(in srgb, var(--ink) 60%, transparent); color: var(--paper);
        font-size: var(--text-xs); font-weight: 600; pointer-events: none;
    }
    .apr-ad__rotulo--antes { left: var(--space-3); }
    .apr-ad__rotulo--depois { right: var(--space-3); }
    .apr-ad__controle { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: ew-resize; margin: 0; }
    .apr-ad__dupla { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
    .apr-ad__dupla img { width: 100%; height: auto; border-radius: var(--radius-md); }

    /* ── Fechamento ───────────────────────────────────────────────────── */
    .apr-fim { background: var(--surface-1); }
    .apr-fim__grade { display: grid; gap: var(--space-8); }

    /* ── Crescendo ────────────────────────────────────────────────────── */
    @media (min-width: 720px) {
        .apr-largura { padding: 0 var(--space-8); }
        .apr-capa__texto { padding-left: var(--space-8); padding-right: var(--space-8); }
        .apr-logo__grade { grid-template-columns: repeat(2, 1fr); }
        .apr-logo__item.is-principal { grid-column: 1 / -1; }
        .apr-paleta__mosaico {
            display: grid;
            grid-template-columns: var(--trilhos);
            grid-template-rows: repeat(var(--pilha), minmax(clamp(200px, 22vw, 280px), auto));
        }
        .apr-cor { grid-column: var(--coluna); grid-row: var(--linha); }
        .apr-apl { --apr-vao: var(--space-4); }
        .apr-apl__par { flex-direction: row; align-items: flex-start; }
        .apr-apl__par .apr-apl__item { flex: var(--r) 1 0; }
        .apr-apl__grade { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 1024px) {
        .apr-texto__grade { grid-template-columns: 5fr 7fr; gap: var(--space-12); }
        .apr-texto__grade .apr-secao__cabeca { position: sticky; top: var(--space-8); align-self: start; }
        .apr-fim__grade { grid-template-columns: 1fr 1fr; align-items: start; }
        .apr-fonte { grid-template-columns: 1fr 1fr; gap: var(--space-10); }
        .apr-fonte.is-so-ficha { grid-template-columns: 1fr; }
        .apr-fonte__corpo { padding-left: 25%; }
    }
`;
