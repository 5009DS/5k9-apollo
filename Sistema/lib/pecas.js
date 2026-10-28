/* ═══════════════════════════════════════════════════════════════════════════
   PEÇAS — os pedaços de HTML e as leituras que mais de uma tela usa.

   O status da peça e o selo de consentimento aparecem no painel, na galeria
   e na ficha da foto. Escritos em cada tela, divergiriam no primeiro ajuste
   de rótulo — e o rótulo do status é justamente o que se lê de longe.
   ═══════════════════════════════════════════════════════════════════════════ */

import { esc, dataBR } from './formato.js';
import { consentimentoValido } from '../store.js';
import { toast } from '../components/toast.js';

/* Os três status do README. Poucos e fixos: cada valor vira regra em código.
   O resto do estado interno é etiqueta. */
export const STATUS = [
    { valor: 'a_revisar', rotulo: 'A revisar', icone: 'eye' },
    { valor: 'em_ajuste', rotulo: 'Em ajuste', icone: 'pencil-line' },
    { valor: 'aprovado',  rotulo: 'Aprovado',  icone: 'circle-check' },
];

const statusMeta = (valor) => STATUS.find(s => s.valor === valor) || STATUS[0];

export const statusHTML = (valor) => {
    const s = statusMeta(valor);
    return `<span class="ap-status ap-status--${s.valor}"><i data-lucide="${s.icone}"></i>${s.rotulo}</span>`;
};

/** Em que pé está o consentimento: 'ok', 'vencido' ou 'falta'. */
export const situacaoConsentimento = (c) => {
    if (consentimentoValido(c)) return 'ok';
    if (c?.autorizado && c.validade) return 'vencido';
    return 'falta';
};

export const seloHTML = (c) => {
    const s = situacaoConsentimento(c);
    if (s === 'ok' && c.motivo === 'sem_pessoa') {
        return `<span class="ap-selo ap-selo--ok" title="Marcada como sem pessoa identificável">
                    <i data-lucide="shield-check"></i>Sem pessoa</span>`;
    }
    if (s === 'ok') {
        return `<span class="ap-selo ap-selo--ok" title="Uso de imagem autorizado${c.validade ? ` até ${dataBR(c.validade)}` : ''}">
                    <i data-lucide="shield-check"></i>Autorizada</span>`;
    }
    const rotulo = s === 'vencido' ? `Venceu em ${dataBR(c.validade)}` : 'Sem autorização';
    return `<span class="ap-selo ap-selo--falta" title="Não aparece no link do cliente">
                <i data-lucide="shield-alert"></i>${rotulo}</span>`;
};

export const vazioHTML = (icone, titulo, texto, acao = '') => `
    <div class="ap-vazio">
        <div class="ap-vazio__icone"><i data-lucide="${esc(icone)}"></i></div>
        <h3>${esc(titulo)}</h3>
        <p>${esc(texto)}</p>
        ${acao}
    </div>`;

export const kpiHTML = (icone, rotulo, valor, papel) => `
    <article class="ds-card ap-kpi ap-kpi--${papel}">
        <div class="ap-kpi__topo">
            <span class="ap-kpi__rotulo">${esc(rotulo)}</span>
            <span class="ap-kpi__icone"><i data-lucide="${esc(icone)}"></i></span>
        </div>
        <span class="ap-kpi__valor">${esc(valor)}</span>
    </article>`;

/** O caminho do link do cliente: o mesmo /e/ do README, pelo apelido ou token. */
export const caminhoDoCliente = (cliente) => `/e/${encodeURIComponent(cliente?.apelido || cliente?.token || '')}`;

/** A apresentação de um projeto dentro do link do cliente, pelo apelido ou id. */
export const caminhoDaApresentacao = (cliente, projeto) =>
    `${caminhoDoCliente(cliente)}/p/${encodeURIComponent(projeto?.apelido || projeto?.id || '')}`;

/**
 * Texto livre → apelido de link: "Dr. Daniel Winter" → "dr-daniel-winter".
 * Sem acento, minúsculo, só letra, número e hífen — é o que sobrevive a ser
 * lido em voz alta, digitado no celular e colado no WhatsApp sem virar %C3%A7.
 */
export const paraApelido = (texto) => String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** O link do cliente, completo, e copiado — com o aviso do modo local. */
export const copiarLinkDoCliente = async (cliente, modo) => {
    const url = `${window.location.origin}${caminhoDoCliente(cliente)}`;
    try {
        await navigator.clipboard.writeText(url);
        toast(modo === 'local'
            ? 'Link copiado. No modo local, ele só abre neste navegador.'
            : 'Link do cliente copiado.');
    } catch {
        // Sem permissão de área de transferência (http, iframe): mostra o
        // endereço para a pessoa copiar à mão, em vez de falhar calada.
        window.prompt('Copie o link do cliente:', url);
    }
};
