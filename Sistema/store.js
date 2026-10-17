/* ═══════════════════════════════════════════════════════════════════════════
   STORE — camada de dados do 5K9 Apollo.

   Mesmo papel do store do Chronos: as páginas pedem `store.pecas.listar()` e
   nunca sabem qual adaptador está por baixo.

   ── SÓ O ADAPTADOR LOCAL, POR ENQUANTO ────────────────────────────────────
   O adaptador remoto (db/remoto.js, as tabelas `ap_` no Supabase do Forms) e
   o R2 entram com a Etapa 1 completa. Até lá o Apollo roda inteiro neste
   navegador — serve para montar e conferir a entrega de fotos, inclusive a
   tela do cliente, e não para mandar link a ninguém.

   Quando o remoto entrar, o cache de leitura do Chronos vem junto com ele: em
   modo local cada leitura é um JSON.parse do localStorage, e um cache aqui
   seria código para resolver um problema que ainda não existe.

   As coleções (as tabelas do README, sem o prefixo):
     clientes        no modo local, o par de vz_clientes (ver db/local.js)
     projetos        um pacote de entregas de um cliente
     pecas           a coisa que se revisa — aqui, a foto
     versoes         o arquivo: chaves de master, proxy e capa, e a ficha
     consentimentos  autorização de uso de imagem, uma por peça
     selecoes        as fotos que o cliente escolheu
     blocos          o rascunho da página de uma apresentação
     publicacoes     a página congelada a cada "Publicar" — V1, V2…
     aprovacoes      a prova do "aprovo", com o retrato da versão
     comentarios     pedidos de ajuste e respostas, em fios
   ═══════════════════════════════════════════════════════════════════════════ */

import { local, consentimentoValido, modeloDe } from './db/local.js';
import { midia } from './lib/midia.js';
import { prepararFoto, extensaoDe } from './lib/fotos.js';
import { semExtensao } from './lib/formato.js';
import { entradaDaEquipe } from './lib/conversa.js';

const db = local;

const colecao = (nome) => ({
    listar: () => db.listar(nome),
    salvar: (registro) => db.salvar(nome, registro),
    excluir: (id) => db.excluir(nome, id),
});

/**
 * Token de link público — o mesmo gerador do Chronos.
 *
 * 10 caracteres de um alfabeto sem 0/O e 1/I/l: o token é lido em voz alta
 * por telefone e digitado à mão com mais frequência do que se imagina.
 * Ligado ao banco, o token do cliente vem de vz_clientes e não é gerado aqui.
 */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
export const gerarToken = () => Array.from(
    crypto.getRandomValues(new Uint8Array(10)),
    (n) => ALFABETO[n % ALFABETO.length]).join('');

export { consentimentoValido, modeloDe };

/* A página da apresentação comparada com a última publicada: o que muda é a
   lista de blocos (tipo e conteúdo, na ordem) e o visual. Ids e carimbos
   ficam de fora — reordenar e voltar atrás não é mudança. */
const assinatura = (blocos, visual) => JSON.stringify({
    blocos: (blocos || []).map(b => ({ tipo: b.tipo, dados: b.dados || {} })),
    visual: visual || null,
});

export const store = {
    modo: db.modo,
    exigeLogin: false,
    usuario: () => null,

    clientes:       colecao('clientes'),
    projetos:       colecao('projetos'),
    pecas:          colecao('pecas'),
    versoes:        colecao('versoes'),
    consentimentos: colecao('consentimentos'),
    selecoes:       colecao('selecoes'),
    blocos:         colecao('blocos'),
    publicacoes:    colecao('publicacoes'),
    aprovacoes:     colecao('aprovacoes'),
    comentarios:    colecao('comentarios'),

    /** Tudo de uma vez — o que o painel consome. */
    tudo: async () => {
        const [clientes, projetos, pecas, versoes, consentimentos, selecoes] = await Promise.all([
            store.clientes.listar(), store.projetos.listar(), store.pecas.listar(),
            store.versoes.listar(), store.consentimentos.listar(), store.selecoes.listar(),
        ]);
        return { clientes, projetos, pecas, versoes, consentimentos, selecoes };
    },

    /** Um projeto com tudo que a galeria da equipe precisa. */
    doProjeto: async (projetoId) => {
        const t = await store.tudo();
        const projeto = t.projetos.find(p => p.id === projetoId) || null;
        if (!projeto) return null;
        const pecas = t.pecas.filter(p => p.projeto_id === projetoId)
            .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)
                         || String(a.criado_em).localeCompare(String(b.criado_em)));
        const ids = new Set(pecas.map(p => p.id));
        return {
            projeto,
            cliente: t.clientes.find(c => c.id === projeto.cliente_id) || null,
            pecas,
            versoes: t.versoes.filter(v => ids.has(v.peca_id)),
            consentimentos: t.consentimentos.filter(c => ids.has(c.peca_id)),
            selecoes: t.selecoes.filter(s => ids.has(s.peca_id)),
        };
    },

    /**
     * Uma foto nova: prepara os derivados, guarda os três arquivos e só então
     * grava as linhas.
     *
     * A ordem importa. Arquivo primeiro, linha depois: uma linha de versão
     * apontando para um arquivo que não chegou seria uma foto quebrada na
     * tela do cliente. Se a linha falhar, os arquivos já gravados saem.
     */
    enviarFoto: async (projetoId, arquivo, ordem = 0) => {
        /* A marca d'água depende do formato (README, "Marca d'água desligada
           por padrão"): na apresentação o material é a marca do próprio
           cliente, e o "5K9" em diagonal por cima do logo dele estragaria o
           que a página existe para mostrar. */
        const projeto = (await store.projetos.listar()).find(p => p.id === projetoId);
        const marca = modeloDe(projeto) !== 'apresentacao';
        const preparado = await prepararFoto(arquivo, { marca });

        const pecaId = crypto.randomUUID();
        const chaves = {
            master_chave: `master/${pecaId}/v1/${arquivo.name}`,
            proxy_chave:  `proxy/${pecaId}/v1.${extensaoDe(preparado.proxy)}`,
            capa_chave:   `proxy/${pecaId}/v1-capa.${extensaoDe(preparado.capa)}`,
        };

        await midia.guardar(chaves.master_chave, arquivo);
        await midia.guardar(chaves.proxy_chave, preparado.proxy);
        await midia.guardar(chaves.capa_chave, preparado.capa);

        try {
            const peca = await store.pecas.salvar({
                id: pecaId, projeto_id: projetoId, pasta_id: null, tipo: 'foto',
                titulo: semExtensao(arquivo.name), status: 'a_revisar', etiquetas: [],
                responsavel: null, prazo: null, ordem, arquivado_em: null,
            });
            const versao = await store.versoes.salvar({
                peca_id: pecaId, numero: 1, ...chaves,
                hls_prefixo: null, tira_chave: null, onda_chave: null,
                fps_num: null, fps_den: null, duracao_quadros: null, tc_inicial: null,
                largura: preparado.largura, altura: preparado.altura, bytes: preparado.bytes,
                marca_dagua: marca, enviado_por: null, notas: null,
            });
            return { peca, versao };
        } catch (e) {
            await midia.apagar(Object.values(chaves));
            throw e;
        }
    },

    /**
     * Registra a mesma autorização de uso de imagem em várias peças.
     *
     * Em lote porque é assim que ela existe: um termo assinado cobre o ensaio
     * inteiro, não foto por foto. Mas é sempre um gesto explícito — nunca
     * acontece sozinho ao enviar.
     */
    consentir: async (pecaIds, { motivo = 'termo', autorizado, validade = null, escopo = [], observacao = null }) => {
        const registrado_em = new Date().toISOString();
        const semPessoa = motivo === 'sem_pessoa';
        for (const pecaId of pecaIds) {
            await store.consentimentos.salvar({
                id: pecaId, peca_id: pecaId, motivo: semPessoa ? 'sem_pessoa' : 'termo',
                // "Sem pessoa identificável" libera sem termo e sem prazo: não
                // há de quem pedir autorização, nem autorização para vencer.
                autorizado: semPessoa ? true : !!autorizado,
                validade: semPessoa ? null : validade,
                escopo: semPessoa ? [] : (escopo || []),
                observacao, registrado_por: null, documento_chave: null, registrado_em,
            });
        }
    },

    // ── Página da apresentação (lado da equipe) ─────────────────────────
    /** Os blocos de um projeto, na ordem da página. */
    blocosDe: async (projetoId) => (await store.blocos.listar())
        .filter(b => b.projeto_id === projetoId)
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),

    /** Grava a ordem atual, 0..n, numa passada. */
    reordenar: async (ids) => {
        const todos = await store.blocos.listar();
        for (const [i, id] of ids.entries()) {
            const b = todos.find(x => x.id === id);
            if (b && b.ordem !== i) await store.blocos.salvar({ ...b, ordem: i });
        }
    },

    /** Publicações de um projeto, da mais nova para a mais velha. */
    publicacoesDe: async (projetoId) => (await store.publicacoes.listar())
        .filter(p => p.projeto_id === projetoId)
        .sort((a, b) => b.numero - a.numero),

    /** O rascunho mudou desde a última publicação? */
    temMudancas: async (projetoId) => {
        const [blocos, pubs, projeto] = await Promise.all([
            store.blocosDe(projetoId), store.publicacoesDe(projetoId),
            store.projetos.listar().then(l => l.find(p => p.id === projetoId)),
        ]);
        if (!pubs[0]) return blocos.length > 0;
        return assinatura(blocos, projeto?.visual) !== assinatura(pubs[0].blocos, pubs[0].visual);
    },

    /**
     * Publica o rascunho como uma versão nova.
     *
     * Congela uma CÓPIA dos blocos: editar o rascunho depois não mexe no que
     * o cliente está vendo — nem, principalmente, no que ele já aprovou.
     */
    publicar: async (projetoId) => {
        const [blocos, pubs, projeto] = await Promise.all([
            store.blocosDe(projetoId), store.publicacoesDe(projetoId),
            store.projetos.listar().then(l => l.find(p => p.id === projetoId)),
        ]);
        if (!blocos.length) throw new Error('A página está vazia. Adicione ao menos um bloco antes de publicar.');
        return store.publicacoes.salvar({
            projeto_id: projetoId,
            numero: (pubs[0]?.numero || 0) + 1,
            blocos: structuredClone(blocos.map(({ id, tipo, dados }) => ({ id, tipo, dados }))),
            visual: projeto?.visual ? structuredClone(projeto.visual) : null,
            publicado_por: null,
        });
    },

    /** A resposta da equipe dentro de um fio do cliente. */
    responder: (raiz, { tipo, texto, autor }) =>
        store.comentarios.salvar(entradaDaEquipe({ raiz, tipo, texto, autor })),

    /**
     * O arquivo de fonte de um bloco de tipografia.
     * Guardado como arquivo do projeto, não como peça: fonte não é imagem de
     * ninguém, e não passa por consentimento — passa pela licença (README).
     */
    enviarFonte: async (projetoId, arquivo) => {
        const ext = (arquivo.name.split('.').pop() || '').toLowerCase();
        if (!['woff2', 'woff', 'otf', 'ttf'].includes(ext)) {
            throw new Error(`${arquivo.name}: envie a fonte em WOFF2, WOFF, OTF ou TTF.`);
        }
        const fonte_chave = `fonte/${projetoId}/${crypto.randomUUID()}.${ext}`;
        await midia.guardar(fonte_chave, arquivo);
        return { fonte_chave, arquivo_nome: arquivo.name };
    },

    // ── Tela pública ────────────────────────────────────────────────────
    /** O que o link do cliente mostra, ou null quando o link não vale. */
    entrega: (token, sessao) => db.entrega(token, sessao),

    /** Marca ou desmarca uma foto na seleção de quem está vendo. */
    selecionar: (token, pecaId, marcado, sessao) => db.selecionar(token, pecaId, marcado, sessao),

    /** A última publicação de uma apresentação, para o cliente. */
    apresentacao: (token, projetoId) => db.apresentacao(token, projetoId),

    /** O rascunho, na mesma forma — só para a prévia da equipe. */
    previa: (projetoId) => db.previa(projetoId),

    aprovarPublicacao: (token, projetoId, numero, nome) =>
        db.aprovarPublicacao(token, projetoId, numero, nome),

    pedirAjuste: (token, projetoId, numero, nome, texto) =>
        db.pedirAjuste(token, projetoId, numero, nome, texto),
};
