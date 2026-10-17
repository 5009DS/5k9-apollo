/* ═══════════════════════════════════════════════════════════════════════════
   CONVERSA — o que já foi dito sobre uma entrega, e de quem é a vez.

   A regra é a do Chronos (lib/conversa.js de lá), e o README é preciso sobre
   o que isso quer dizer:

     · COPIADO SEM MUDAR UMA LINHA, entre as duas marcas abaixo: ATOS, ato,
       ESTADOS, estadoMeta, daEquipe, emOrdem, estadoDaConversa, foiEditado e
       novidadesPara — a parte que decide de quem é a vez. Ela só lê `origem`,
       `tipo` e `criado_em`, e por isso essas colunas têm os mesmos nomes e
       valores nos dois bancos.
     · DESTE SISTEMA, depois da segunda marca: o agrupamento e a montagem da
       entrada. O Chronos agrupa por fala; o Apollo agrupa pelo comentário que
       abriu o fio (`pai_id`).

   Mudança na regra de estado é feita nos dois arquivos no mesmo dia, ou não é
   feita.

   O estado é a ÚLTIMA entrada visível ao cliente:

       cliente pediu por último    → PENDENTE   (a bola está com a equipe)
       equipe falou por último     → RESPONDIDO (a bola está com o cliente)
       alguém aprovou por último   → FECHADO

   Entrada interna não entra na conta (README, função 5): quem chama descarta
   `interno = true` antes — `conversas()` abaixo já faz isso.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── GÊMEO DO CHRONOS — início ───────────────────────────────────────────
/* Os cinco tipos de entrada. `origem` diz o lado; `tipo` diz o ato.

   'resposta' existe separado de 'ajustado' porque "mudamos o texto" e "não
   vamos mudar, e aqui está o motivo" são desfechos diferentes, e o segundo é
   frequente demais para ficar sem palavra própria. Colapsar os dois ensinaria
   a equipe a marcar como ajustado o que não foi ajustado. */
export const ATOS = {
    ajuste:   { origem: 'cliente', rotulo: 'Pediu ajuste',    icone: 'message-circle',      tom: 'atencao' },
    ajustado: { origem: 'equipe',  rotulo: 'Ajustamos',       icone: 'pencil-line',         tom: 'ok' },
    resposta: { origem: 'equipe',  rotulo: 'A equipe respondeu', icone: 'message-square-reply', tom: 'info' },
    aprovado: { origem: null,      rotulo: 'Aprovado',        icone: 'circle-check',        tom: 'ok' },
};

export const ato = (r) => ATOS[r?.tipo] || ATOS.resposta;

/** A entrada veio da equipe? Registros antigos não têm `origem` — são do cliente. */
export const daEquipe = (r) => (r?.origem || 'cliente') === 'equipe';

export const ESTADOS = {
    pendente: {
        rotulo: 'Aguardando a equipe', curto: 'pendente',
        icone: 'message-circle-warning', tom: 'atencao',
        // O que cada lado lê. A mesma conversa, ditas para quem tem o dever de
        // agir e para quem está esperando — dizer "pendente" ao cliente o
        // deixaria achando que a bola é dele.
        cliente: 'A equipe está vendo isto',
    },
    respondido: {
        rotulo: 'Respondido', curto: 'respondido',
        icone: 'message-square-reply', tom: 'info',
        cliente: 'A equipe respondeu — veja se ficou bom',
    },
    fechado: {
        rotulo: 'Assunto encerrado', curto: 'encerrado',
        icone: 'circle-check', tom: 'ok',
        cliente: 'Assunto encerrado',
    },
};

export const estadoMeta = (id) => ESTADOS[id] || ESTADOS.pendente;

/** Do mais antigo para o mais novo — a ordem em que a conversa aconteceu. */
export const emOrdem = (entradas) =>
    [...(entradas || [])].sort((a, b) =>
        String(a.criado_em).localeCompare(String(b.criado_em)));

/**
 * De quem é a vez.
 *
 * @param {object[]} entradas  as entradas de UMA conversa, em qualquer ordem
 * @returns {'pendente'|'respondido'|'fechado'|null}  null quando não há conversa
 */
export const estadoDaConversa = (entradas) => {
    const lista = emOrdem(entradas);
    if (!lista.length) return null;

    const ultima = lista[lista.length - 1];
    if (ultima.tipo === 'aprovado') return 'fechado';
    return daEquipe(ultima) ? 'respondido' : 'pendente';
};

/** A equipe chegou a mexer no texto por causa desta conversa? */
export const foiEditado = (entradas) =>
    (entradas || []).some(r => r.tipo === 'ajustado');


/**
 * O que a equipe fez desde a última visita do cliente.
 *
 * `desde` é ISO, e vem do navegador dele. Sem `desde` — primeira visita, ou
 * navegador que apagou o dado — devolve lista vazia, e não a lista inteira:
 * marcar tudo como "novidade" na primeira visita é a maneira mais rápida de
 * ensinar que o destaque não significa nada.
 */
export const novidadesPara = (historico, desde) => {
    if (!desde) return [];
    return (historico || []).filter(r =>
        daEquipe(r) && String(r.criado_em) > String(desde));
};
// ── GÊMEO DO CHRONOS — fim ──────────────────────────────────────────────

/**
 * Os fios de um conjunto de comentários, agrupados pelo que abriu cada um.
 *
 * Entrada interna fica de fora ANTES da conta: se uma nota da equipe dentro
 * do fio entrasse, a equipe veria "respondido" onde o cliente — que nunca
 * recebe a nota — vê "pendente".
 *
 * @returns {{ fios: {raiz: object, entradas: object[], estado: string}[],
 *             pendentes: number, respondidos: number }}
 */
export const conversas = (comentarios) => {
    const visiveis = (comentarios || []).filter(c => !c.interno);
    const porRaiz = new Map();
    for (const c of visiveis) {
        const raiz = c.pai_id || c.id;
        if (!porRaiz.has(raiz)) porRaiz.set(raiz, []);
        porRaiz.get(raiz).push(c);
    }

    let pendentes = 0;
    let respondidos = 0;
    const fios = [];
    for (const [id, entradas] of porRaiz) {
        const ordenadas = emOrdem(entradas);
        const raiz = ordenadas.find(e => e.id === id) || ordenadas[0];
        const estado = estadoDaConversa(ordenadas);
        if (estado === 'pendente') pendentes++;
        if (estado === 'respondido') respondidos++;
        fios.push({ raiz, entradas: ordenadas, estado });
    }
    fios.sort((a, b) => String(b.raiz.criado_em).localeCompare(String(a.raiz.criado_em)));
    return { fios, pendentes, respondidos };
};

/**
 * Uma resposta da equipe dentro de um fio, pronta para gravar.
 * Sempre presa ao comentário que abriu o fio, e à mesma publicação ou versão.
 */
export const entradaDaEquipe = ({ raiz, tipo, texto, autor }) => ({
    versao_id: raiz.versao_id || null,
    publicacao_id: raiz.publicacao_id || null,
    pai_id: raiz.id,
    origem: 'equipe',
    tipo,
    autor: (autor || '').trim() || 'Equipe 5K9',
    interno: false,
    texto: (texto || '').trim() || null,
});
