/* ═══════════════════════════════════════════════════════════════════════════
   FOTOS — do arquivo da câmera ao que o cliente vê.

   O README é direto sobre foto: "a marca é queimada no derivado que o cliente
   vê, e o arquivo limpo não tem URL". Este módulo faz o derivado.

   Para cada foto saem dois arquivos, os dois com a marca QUEIMADA nos pixels
   (menos na apresentação, onde ela nasce desligada — ver store.enviarFoto):

     proxy   até 2048 px no lado maior — a tela cheia do cliente
     capa    até 640 px — a grade

   E o original segue intocado, como master, sem endereço nenhum na tela do
   cliente (ver db/local.js, entrega()).

   ── POR QUE NO NAVEGADOR ──────────────────────────────────────────────────
   Para vídeo o README manda o ffmpeg do estúdio fazer o proxy. Para foto não
   precisa: o navegador decodifica JPG, PNG e WebP sozinho, e o canvas escreve
   a marca sem servidor nenhum. É o mesmo argumento da "máquina que já tem o
   arquivo e está ociosa", sem o script para rodar.

   ── A MARCA, E O QUE ELA NÃO É ────────────────────────────────────────────
   Duas camadas: o lockup no canto, legível, e o nome repetido em diagonal,
   bem apagado, cobrindo a foto inteira. O canto sozinho sai com um recorte;
   a diagonal é o que obriga a retocar a foto inteira para tirar. Nenhuma das
   duas é marca forense (README: "não é o medo de vocês").

   HEIC (iPhone) e RAW não abrem: o navegador não decodifica. A tela recusa
   com o nome do arquivo em vez de criar uma peça vazia.

   ── TRANSPARÊNCIA E SVG ───────────────────────────────────────────────────
   Logo chega em PNG transparente ou SVG, e JPEG não tem transparência: o
   fundo viraria preto, e o bloco de logo da apresentação mostraria um
   quadrado escuro onde devia haver a marca no fundo escolhido. Então PNG,
   WebP e SVG saem em PNG; foto sai em JPEG. O SVG é rasterizado aqui — o
   derivado é sempre bitmap, e um SVG de fora nunca é servido como SVG (ele
   pode carregar script).
   ═══════════════════════════════════════════════════════════════════════════ */

const LADO_PROXY = 2048;
const LADO_CAPA = 640;
const QUALIDADE = 0.86;

export const ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

/** Formatos que podem ter transparência — e por isso não viram JPEG. */
const COM_ALFA = ['image/png', 'image/webp', 'image/svg+xml'];

/** A extensão da chave pelo tipo do derivado: 'png' ou 'jpg'. */
export const extensaoDe = (blob) => (blob?.type === 'image/png' ? 'png' : 'jpg');

/* Cor de marca d'água não é cor de interface: ela vive DENTRO da foto, e a
   regra dos tokens (nada de cor literal) vale para a tela, não para pixels
   queimados. Branco com sombra escura lê sobre céu e sobre parede. */
const MARCA = {
    canto:    { arquivo: '/assets/logo/5k9-lockup-horizontal-white.png', opacidade: 0.72, fracao: 0.20 },
    diagonal: { arquivo: '/assets/logo/5k9-wordmark-white.png',          opacidade: 0.09, fracao: 0.16 },
};

const imagens = new Map();
const carregar = (src) => {
    if (!imagens.has(src)) {
        imagens.set(src, new Promise((ok, falha) => {
            const img = new Image();
            img.onload = () => ok(img);
            img.onerror = () => { imagens.delete(src); falha(new Error('A marca d\'água não carregou.')); };
            img.src = src;
        }));
    }
    return imagens.get(src);
};

const queimarMarca = async (ctx, largura, altura) => {
    const [canto, diagonal] = await Promise.all([
        carregar(MARCA.canto.arquivo), carregar(MARCA.diagonal.arquivo),
    ]);
    const menor = Math.min(largura, altura);

    // Diagonal: o nome repetido em grade, girado, cobrindo além das bordas
    // para a rotação não deixar canto descoberto.
    const dl = menor * MARCA.diagonal.fracao;
    const da = dl * (diagonal.naturalHeight / diagonal.naturalWidth);
    ctx.save();
    ctx.globalAlpha = MARCA.diagonal.opacidade;
    ctx.translate(largura / 2, altura / 2);
    ctx.rotate(-Math.PI / 6);
    const alcance = Math.hypot(largura, altura) / 2;
    const passoX = dl * 2.2, passoY = da * 4;
    for (let y = -alcance; y < alcance; y += passoY) {
        const desloca = (Math.round(y / passoY) % 2) * (passoX / 2);
        for (let x = -alcance - desloca; x < alcance; x += passoX) ctx.drawImage(diagonal, x, y, dl, da);
    }
    ctx.restore();

    // Canto: o lockup, com sombra para não sumir em fundo claro.
    const cl = Math.max(80, largura * MARCA.canto.fracao);
    const ca = cl * (canto.naturalHeight / canto.naturalWidth);
    const margem = menor * 0.035;
    ctx.save();
    ctx.globalAlpha = MARCA.canto.opacidade;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = ca * 0.35;
    ctx.drawImage(canto, largura - cl - margem, altura - ca - margem, cl, ca);
    ctx.restore();
};

/* `fonte` é qualquer coisa que o drawImage aceite e que tenha largura e
   altura: o ImageBitmap da foto, ou o <img> do SVG com o tamanho calculado. */
const derivar = async (fonte, lado, comMarca, tipo) => {
    const escala = Math.min(1, lado / Math.max(fonte.largura, fonte.altura));
    const largura = Math.max(1, Math.round(fonte.largura * escala));
    const altura = Math.max(1, Math.round(fonte.altura * escala));

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fonte.imagem, 0, 0, largura, altura);
    if (comMarca) await queimarMarca(ctx, largura, altura);

    const blob = await new Promise(ok => canvas.toBlob(ok, tipo, QUALIDADE));
    if (!blob) throw new Error('O navegador não conseguiu gerar a imagem.');
    return blob;
};

/* O tamanho de um SVG não é óbvio: width/height podem faltar, vir em
   porcentagem ou só existir no viewBox. A proporção sai do que houver, e o
   desenho é feito no tamanho do proxy — vetor não perde nada ao crescer. */
const abrirSvg = async (arquivo) => {
    const texto = await arquivo.text();
    const raiz = new DOMParser().parseFromString(texto, 'image/svg+xml').documentElement;
    if (raiz.nodeName !== 'svg') throw new Error('svg inválido');

    const numero = (v) => (/^\s*[\d.]+\s*(px)?\s*$/.test(v || '') ? parseFloat(v) : null);
    const caixa = (raiz.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    let largura = numero(raiz.getAttribute('width')) || (caixa.length === 4 ? caixa[2] : null);
    let altura = numero(raiz.getAttribute('height')) || (caixa.length === 4 ? caixa[3] : null);
    if (!largura || !altura) { largura = 1000; altura = 1000; }

    // Sobe até o lado do proxy, mantendo a proporção.
    const escala = LADO_PROXY / Math.max(largura, altura);
    largura = Math.round(largura * escala);
    altura = Math.round(altura * escala);

    const url = URL.createObjectURL(arquivo);
    try {
        const img = new Image();
        img.width = largura;
        img.height = altura;
        await new Promise((ok, falha) => { img.onload = ok; img.onerror = falha; img.src = url; });
        return { imagem: img, largura, altura, fechar: () => URL.revokeObjectURL(url) };
    } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
    }
};

const abrirBitmap = async (arquivo) => {
    /* from-image: a câmera grava a foto deitada e escreve no EXIF que ela
       é de pé. Sem isto, o retrato chegaria ao cliente de lado. */
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    return { imagem: bitmap, largura: bitmap.width, altura: bitmap.height, fechar: () => bitmap.close() };
};

/**
 * Prepara uma imagem para entrar no sistema.
 *
 * @param {File} arquivo
 * @returns {Promise<{largura:number, altura:number, bytes:number, proxy:Blob, capa:Blob}>}
 *          largura e altura do ORIGINAL, já na orientação certa (no SVG, as do
 *          desenho rasterizado)
 */
export const prepararFoto = async (arquivo, { marca = true } = {}) => {
    if (!ACEITOS.includes(arquivo.type)) {
        throw new Error(`${arquivo.name}: formato não aceito. Envie JPG, PNG, WebP ou SVG `
                      + '(HEIC e RAW o navegador não abre).');
    }

    let fonte;
    try {
        fonte = arquivo.type === 'image/svg+xml' ? await abrirSvg(arquivo) : await abrirBitmap(arquivo);
    } catch {
        throw new Error(`${arquivo.name}: o navegador não conseguiu abrir este arquivo.`);
    }

    const tipo = COM_ALFA.includes(arquivo.type) ? 'image/png' : 'image/jpeg';
    try {
        const proxy = await derivar(fonte, LADO_PROXY, marca, tipo);
        const capa = await derivar(fonte, LADO_CAPA, marca, tipo);
        return { largura: fonte.largura, altura: fonte.altura, bytes: arquivo.size, proxy, capa };
    } finally {
        fonte.fechar();
    }
};
