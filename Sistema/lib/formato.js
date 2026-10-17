/* ═══════════════════════════════════════════════════════════════════════════
   FORMATO — datas, tamanhos e escape.

   Recorte do lib/formato.js do Chronos: só o que o Apollo usa, com as mesmas
   funções e a mesma regra de data. O que é de cronograma (semana, mês,
   apelido de conteúdo, tempo de fala) ficou lá.

   ── Por que datas são STRING 'AAAA-MM-DD', nunca Date ─────────────────────
   `new Date('2026-08-13')` é interpretado como UTC e, em fuso negativo, volta
   como 12/08 às 21h. Onde um Date é inevitável, ele é construído com
   `new Date(ano, mes - 1, dia)`, que é LOCAL.

   Carimbo de criação (`criado_em`) é outra coisa: é um instante, não um dia,
   e vem em ISO com fuso. Esse vai para `haQuanto`, que mede a distância em
   milissegundos e nunca fatia a string.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                             'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Hoje em 'AAAA-MM-DD', no fuso local. */
export const hoje = () => paraIso(new Date());

/** Date local → 'AAAA-MM-DD'. */
export const paraIso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 'AAAA-MM-DD' → Date LOCAL (meia-noite). Uso interno; ver o cabeçalho. */
export const paraData = (iso) => {
    const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(a, (m || 1) - 1, d || 1);
};

/** '2026-08-13' → '13/08/2026' */
export const dataBR = (iso) => {
    const p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—';
};

/** Diferença em dias entre hoje e uma data ISO. Negativo = já passou. */
export const diasAte = (iso) => {
    if (!iso) return null;
    return Math.round((paraData(iso) - paraData(hoje())) / 86_400_000);
};

/**
 * Há quanto tempo um instante aconteceu: 'agora', 'há 5 min', 'há 2 h',
 * 'ontem', 'há 3 dias', e a data depois de uma semana.
 *
 * Para `criado_em`, que é instante com fuso. Fatiar a string como se fosse
 * dia erraria por um a cada noite: 22h em Brasília já é amanhã em UTC.
 */
export const haQuanto = (instante) => {
    const t = Date.parse(instante || '');
    if (Number.isNaN(t)) return '—';
    const min = Math.round((Date.now() - t) / 60_000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;

    const d = new Date(t);
    const dias = -diasAte(paraIso(d));
    if (dias <= 1) return 'ontem';
    if (dias <= 6) return `há ${dias} dias`;
    return dataBR(paraIso(d));
};

/** Escapa texto vindo do usuário antes de entrar em template de HTML. */
export const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const numero = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);

/** Singular ou plural pelo número: plural(3, 'foto', 'fotos') → '3 fotos'. */
export const plural = (n, um, varios) => `${numero(n)} ${n === 1 ? um : varios}`;

/** Bytes em linguagem de gente, com vírgula: 2_480_000 → '2,4 MB'. */
export const tamanho = (bytes) => {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    const unidades = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < unidades.length - 1) { v /= 1024; i++; }
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unidades[i]}`;
};

/** O nome do arquivo sem a extensão: 'A7_03539.JPG' → 'A7_03539'. */
export const semExtensao = (nome) => String(nome || '').replace(/\.[^.]+$/, '') || 'sem nome';
