/* ═══════════════════════════════════════════════════════════════════════════
   MÍDIA — onde os arquivos moram, em MODO LOCAL.

   No desenho final os bytes vão para o R2 (README, "Armazenamento e custo") e
   o banco guarda só a CHAVE de cada arquivo. Este módulo é o R2 do modo local:
   a mesma ideia de chave → arquivo, guardada no IndexedDB deste navegador.

   As chaves já seguem o desenho dos buckets, para nada precisar mudar no banco
   quando o R2 entrar:

       master/<peca>/v1/<nome original>   o arquivo de origem   (apollo-master)
       proxy/<peca>/v1.jpg                o derivado com marca  (apollo-proxy)
       proxy/<peca>/v1-capa.jpg           a miniatura com marca (apollo-proxy)

   ── POR QUE INDEXEDDB E NÃO localStorage ──────────────────────────────────
   O localStorage guarda texto e para em torno de 5 MB — uma foto de câmera
   sozinha já passa disso. O IndexedDB guarda Blob direto, sem converter para
   base64, e o limite é uma fração do disco.

   ── O LIMITE QUE CONTINUA VALENDO ─────────────────────────────────────────
   Os arquivos existem SÓ neste navegador. Limpar os dados do site apaga as
   fotos, e o link do cliente não abre em outro aparelho. É o mesmo aviso do
   modo local do Chronos, mais pesado aqui porque o que se perde é material
   entregue, não texto.
   ═══════════════════════════════════════════════════════════════════════════ */

const BANCO = '5k9_apollo_midia';
const LOJA = 'arquivos';

let conexao = null;

const abrir = () => conexao || (conexao = new Promise((ok, falha) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(LOJA);
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => { conexao = null; falha(pedido.error); };
}));

/* Uma transação por operação, e a promessa resolve no `oncomplete`, não no
   `onsuccess` do pedido: só ali o arquivo está de fato gravado. Resolver antes
   deixaria a página gravar a linha da versão apontando para um arquivo que
   uma falha de cota ainda pode desfazer. */
const transacao = async (modo, fazer) => {
    const db = await abrir();
    return new Promise((ok, falha) => {
        const tx = db.transaction(LOJA, modo);
        const pedido = fazer(tx.objectStore(LOJA));
        tx.oncomplete = () => ok(pedido?.result);
        tx.onerror = () => falha(traduzir(tx.error));
        tx.onabort = () => falha(traduzir(tx.error));
    });
};

const traduzir = (erro) => {
    if (erro?.name === 'QuotaExceededError') {
        return new Error('O navegador não tem mais espaço para fotos no modo local. '
                       + 'Apague um projeto de teste ou libere espaço no disco.');
    }
    return erro || new Error('Não foi possível gravar o arquivo neste navegador.');
};

/* Endereços já criados, por chave. Um object URL por arquivo e por visita:
   recriar a cada desenho da grade vazaria memória a cada clique de filtro. */
const enderecos = new Map();

export const midia = {
    guardar: (chave, arquivo) => transacao('readwrite', (loja) => loja.put(arquivo, chave)),

    ler: (chave) => transacao('readonly', (loja) => loja.get(chave)),

    /** Apaga várias chaves de uma vez. Chave que não existe é ignorada. */
    apagar: async (chaves) => {
        const lista = (chaves || []).filter(Boolean);
        if (!lista.length) return;
        await transacao('readwrite', (loja) => { lista.forEach(c => loja.delete(c)); });
        lista.forEach(c => {
            const url = enderecos.get(c);
            if (url) { URL.revokeObjectURL(url); enderecos.delete(c); }
        });
    },

    /**
     * Um endereço que um <img> consegue abrir, ou null se o arquivo não está
     * aqui — o caso de quem abre o link do cliente em outro navegador.
     */
    url: async (chave) => {
        if (!chave) return null;
        if (enderecos.has(chave)) return enderecos.get(chave);
        const arquivo = await midia.ler(chave);
        if (!arquivo) return null;
        const url = URL.createObjectURL(arquivo);
        enderecos.set(chave, url);
        return url;
    },
};

/** As chaves de uma versão, na ordem em que aparecem na linha. */
export const chavesDaVersao = (v) =>
    [v?.master_chave, v?.proxy_chave, v?.capa_chave, v?.tira_chave, v?.onda_chave].filter(Boolean);
