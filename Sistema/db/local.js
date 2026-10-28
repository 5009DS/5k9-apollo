/* ═══════════════════════════════════════════════════════════════════════════
   ADAPTADOR LOCAL — localStorage para as linhas, IndexedDB para os arquivos.

   É o banco do modo local: as mesmas coleções das tabelas `ap_` do README,
   sem o prefixo, com as mesmas cascatas e o mesmo recorte da tela do cliente.
   Os arquivos ficam em lib/midia.js; aqui só passam as chaves.

   ── O CLIENTE, EM MODO LOCAL ──────────────────────────────────────────────
   Ligado ao banco, o Apollo NÃO tem cadastro de cliente: ele lê vz_clientes,
   do Chronos, e usa o mesmo token (README, "O cliente tem um link só"). Em
   modo local não há Chronos para ler — o localStorage é por endereço, e o
   Chronos roda em outra porta —, então existe uma coleção `clientes` aqui com
   os campos de vz_clientes que o Apollo usa. Ela some quando o banco entrar.

   ── O QUE ESTE ARQUIVO PROMETE ────────────────────────────────────────────
   As regras que o README põe no banco estão repetidas aqui, porque a prévia
   do cliente só vale se recusar o mesmo que o banco vai recusar:

     · peça sem consentimento válido não aparece no link (entrega, e dentro
       dos blocos da apresentação);
     · o link não devolve chave de master, responsável, prazo nem etiqueta;
     · escolher foto exige que ela seja daquele link (selecionar);
     · aprovar e pedir ajuste valem só para a versão publicada MAIS NOVA, e a
       versão aprovada não recebe pedido de ajuste;
     · apagar o que tem aprovação é recusado — a aprovação é prova.
   ═══════════════════════════════════════════════════════════════════════════ */

import { midia, chavesDaVersao } from '../lib/midia.js';
import { hoje } from '../lib/formato.js';

const CHAVE = (colecao) => `5k9_apollo_${colecao}`;

const ler = (colecao) => {
    try { return JSON.parse(localStorage.getItem(CHAVE(colecao))) || []; }
    catch { return []; }
};

const gravar = (colecao, linhas) =>
    localStorage.setItem(CHAVE(colecao), JSON.stringify(linhas));

/** O formato do projeto. Projeto gravado antes dos formatos é seleção. */
export const modeloDe = (projeto) => projeto?.modelo || 'selecao';

/* As cascatas do esquema, na forma [filha, coluna que aponta para o pai].
   Todas são `on delete cascade` no README. Consentimento tem a peça como
   chave primária, e aqui o `id` dele é o próprio peca_id. */
const FILHOS = {
    clientes:     [['projetos', 'cliente_id']],
    projetos:     [['pecas', 'projeto_id'], ['blocos', 'projeto_id'], ['publicacoes', 'projeto_id']],
    pecas:        [['versoes', 'peca_id'], ['consentimentos', 'peca_id'], ['selecoes', 'peca_id']],
    publicacoes:  [['comentarios', 'publicacao_id']],
};

/* `ap_aprovacoes.publicacao_id` é `on delete restrict`: o banco recusa apagar
   a publicação aprovada — e, pela cascata, o projeto e o cliente dela. Aqui a
   conferência vem antes de apagar qualquer coisa, para não deixar meia
   cascata feita quando a recusa chegar. */
const publicacoesAbaixo = (colecao, id) => {
    if (colecao === 'publicacoes') return [id];
    let projetos = [];
    if (colecao === 'projetos') projetos = [id];
    if (colecao === 'clientes') projetos = ler('projetos').filter(p => p.cliente_id === id).map(p => p.id);
    return ler('publicacoes').filter(p => projetos.includes(p.projeto_id)).map(p => p.id);
};

const conferirAprovacoes = (colecao, id) => {
    const alvos = new Set(publicacoesAbaixo(colecao, id));
    if (!alvos.size) return;
    if (ler('aprovacoes').some(a => alvos.has(a.publicacao_id))) {
        throw new Error('Há uma versão aprovada pelo cliente aqui, e a aprovação é prova — '
                      + 'não dá para apagar. Arquive o projeto.');
    }
};

const apagarEmCascata = (colecao, id, chavesSoltas) => {
    const linhas = ler(colecao);
    const alvo = linhas.find(l => l.id === id);
    if (!alvo) return;
    // Versão apagada leva os arquivos junto. No R2 isso será regra de ciclo
    // de vida do bucket; aqui, sem o apagar, o IndexedDB só cresceria.
    if (colecao === 'versoes') chavesSoltas.push(...chavesDaVersao(alvo));
    // Fonte enviada para um bloco sai junto com o bloco.
    if (colecao === 'blocos') chavesSoltas.push(...chavesDeFonte(alvo.dados));
    gravar(colecao, linhas.filter(l => l.id !== id));

    for (const [filha, coluna] of FILHOS[colecao] || []) {
        for (const linha of ler(filha).filter(x => x[coluna] === id)) {
            apagarEmCascata(filha, linha.id, chavesSoltas);
        }
    }
};

/** A versão mais recente de cada peça, por número. */
const ultimasVersoes = () => {
    const ultima = new Map();
    for (const v of ler('versoes')) {
        const atual = ultima.get(v.peca_id);
        if (!atual || v.numero > atual.numero) ultima.set(v.peca_id, v);
    }
    return ultima;
};

/** O consentimento vale hoje? Autorizado, e dentro da validade se houver. */
export const consentimentoValido = (c) =>
    c?.autorizado === true && (!c.validade || c.validade >= hoje());

/* ═══════════════════════════════════════════════════════════════════════════
   IMAGEM E FONTE DENTRO DOS BLOCOS

   Bloco nunca guarda arquivo: guarda `{ peca: <id> }`. Na hora de mostrar,
   a referência vira a imagem — se, e só se, a peça tem consentimento válido.
   Uma convenção só, procurada no `dados` inteiro, para a função do banco
   poder fazer a mesma coisa com um jsonb sem conhecer cada tipo de bloco.

   Fonte é `{ fonte_chave, licenca_web }`. Sem licença para web, a chave não
   sai: o arquivo da fonte do cliente não vai para um site que não pode usá-lo.
   ═══════════════════════════════════════════════════════════════════════════ */

const ehRefPeca = (v) => v && typeof v === 'object' && !Array.isArray(v)
    && typeof v.peca === 'string' && Object.keys(v).length === 1;

function chavesDeFonte(dados) {
    const achadas = [];
    const andar = (v) => {
        if (Array.isArray(v)) return v.forEach(andar);
        if (!v || typeof v !== 'object') return;
        if (typeof v.fonte_chave === 'string') achadas.push(v.fonte_chave);
        Object.values(v).forEach(andar);
    };
    andar(dados);
    return achadas;
}

const resolvedor = ({ previa }) => {
    const pecas = new Map(ler('pecas').map(p => [p.id, p]));
    const versoes = ultimasVersoes();
    const consent = new Map(ler('consentimentos').map(c => [c.peca_id, c]));

    const imagem = (id) => {
        const peca = pecas.get(id);
        const v = versoes.get(id);
        if (!peca || !v) return previa ? { faltando: true } : null;
        if (!consentimentoValido(consent.get(id))) {
            // A prévia mostra o buraco e diz por quê; o cliente nem sabe que
            // havia uma imagem ali.
            return previa ? { bloqueada: true, peca: id, titulo: peca.titulo } : null;
        }
        return { peca: id, tipo: peca.tipo, proxy_chave: v.proxy_chave, capa_chave: v.capa_chave,
                 largura: v.largura, altura: v.altura };
    };

    const andar = (v) => {
        if (Array.isArray(v)) return v.map(andar);
        if (!v || typeof v !== 'object') return v;
        if (ehRefPeca(v)) return imagem(v.peca);
        const saida = {};
        for (const [k, x] of Object.entries(v)) saida[k] = andar(x);
        if (typeof saida.fonte_chave === 'string' && !saida.licenca_web) delete saida.fonte_chave;
        return saida;
    };
    return andar;
};

const ultimaPublicacao = (projetoId) => ler('publicacoes')
    .filter(p => p.projeto_id === projetoId)
    .sort((a, b) => b.numero - a.numero)[0] || null;

const aprovacaoDe = (publicacaoId) => ler('aprovacoes')
    .filter(a => a.publicacao_id === publicacaoId && a.decisao === 'aprovado')
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0] || null;

/** O cliente do token, ou null. Token OU apelido, como no Chronos. */
const clienteDoToken = (token) => ler('clientes').find(c =>
    (c.token === token || (c.apelido && c.apelido === token)) && c.ativo !== false) || null;

/** O projeto de apresentação, publicado, deste cliente — ou null. */
const apresentacaoDoToken = (token, projetoId) => {
    const cliente = clienteDoToken(token);
    if (!cliente) return null;
    // O projeto pelo id ou pelo apelido do link personalizado — os dois
    // endereços valem, para o link antigo já mandado não quebrar.
    const projeto = ler('projetos').find(p => (p.id === projetoId || (p.apelido && p.apelido === projetoId))
                                          && p.cliente_id === cliente.id
                                          && !p.arquivado_em && modeloDe(p) === 'apresentacao');
    if (!projeto) return null;
    const publicacao = ultimaPublicacao(projeto.id);
    if (!publicacao) return null;
    return { cliente, projeto, publicacao };
};

/* A forma da apresentação, igual para o cliente e para a prévia da equipe —
   a prévia só vale se for a mesma tela. */
const montarApresentacao = ({ cliente, projeto, blocos, numero, publicada_em, previa }) => {
    const resolver = resolvedor({ previa });
    return {
        previa: !!previa,
        cliente: { nome: cliente?.nome || '' },
        projeto: { id: projeto.id, nome: projeto.nome, descricao: projeto.descricao || null },
        visual: projeto.visual || null,
        publicacao: { numero, criado_em: publicada_em },
        blocos: (blocos || []).map(b => ({ id: b.id, tipo: b.tipo, dados: resolver(b.dados || {}) })),
    };
};

const comentarioPublico = ({ id, pai_id, origem, tipo, autor, texto, criado_em }) =>
    ({ id, pai_id, origem, tipo, autor, texto, criado_em });

export const local = {
    modo: 'local',

    // Sem banco não há sessão; o app trata isso como acesso aberto.
    sessao: async () => null,

    listar: async (colecao) => ler(colecao),

    /**
     * Insere ou atualiza pelo id. Devolve a linha gravada.
     * `criado_em` só é carimbado na inserção — mesma regra do Chronos.
     */
    salvar: async (colecao, registro) => {
        const linhas = ler(colecao);
        const id = registro.id || crypto.randomUUID();
        const i = linhas.findIndex(l => l.id === id);
        const linha = {
            ...(i > -1 ? linhas[i] : { criado_em: new Date().toISOString() }),
            ...registro,
            id,
        };
        if (i > -1) linhas[i] = linha; else linhas.unshift(linha);
        gravar(colecao, linhas);
        return linha;
    },

    excluir: async (colecao, id) => {
        conferirAprovacoes(colecao, id);
        const chavesSoltas = [];
        apagarEmCascata(colecao, id, chavesSoltas);
        await midia.apagar(chavesSoltas);
    },

    /* ═══════════════════════════════════════════════════════════════════════
       A TELA DO CLIENTE

       O par local de `ap_abrir(token)` + `ap_peca(token, peca)`: tudo que o
       link do cliente pode ver, numa ida só, já recortado. A tela nunca
       recebe mais do que mostra — o que não vem aqui não existe para ela.
       ═══════════════════════════════════════════════════════════════════════ */
    entrega: async (token, sessao) => {
        const cliente = clienteDoToken(token);
        if (!cliente) return null;

        const consentimentos = new Map(ler('consentimentos').map(c => [c.peca_id, c]));
        const versoes = ultimasVersoes();

        const projetos = ler('projetos').filter(p => p.cliente_id === cliente.id && !p.arquivado_em);
        // Só projeto de SELEÇÃO vira grade de fotos. As imagens de uma
        // apresentação aparecem dentro dela, nunca soltas para escolher.
        const deSelecao = new Set(projetos.filter(p => modeloDe(p) === 'selecao').map(p => p.id));

        /* Peça entra quando tem arquivo E consentimento válido. Sem o segundo
           o sistema RECUSA, não avisa (README, "Consentimento de imagem não é
           burocracia"): a foto simplesmente não está no link. */
        const pecas = ler('pecas')
            .filter(p => deSelecao.has(p.projeto_id) && !p.arquivado_em
                      && versoes.has(p.id) && consentimentoValido(consentimentos.get(p.id)))
            .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)
                         || String(a.criado_em).localeCompare(String(b.criado_em)))
            .map(p => {
                const v = versoes.get(p.id);
                return {
                    id: p.id, projeto_id: p.projeto_id, tipo: p.tipo, titulo: p.titulo,
                    // Só o que o cliente vê: o derivado com marca. master_chave
                    // NÃO sai daqui — o original não tem endereço na tela dele.
                    versao: { numero: v.numero, largura: v.largura, altura: v.altura,
                              proxy_chave: v.proxy_chave, capa_chave: v.capa_chave },
                };
            });

        const comPeca = new Set(pecas.map(p => p.projeto_id));
        const visiveis = new Set(pecas.map(p => p.id));
        const resolver = resolvedor({ previa: false });

        const listados = projetos
            .map(p => {
                const base = { id: p.id, nome: p.nome, descricao: p.descricao || null,
                               criado_em: p.criado_em, modelo: modeloDe(p) };
                if (base.modelo === 'selecao') return comPeca.has(p.id) ? base : null;
                if (base.modelo !== 'apresentacao') return null;
                // Apresentação aparece só depois de publicada, com o resumo
                // que o cartão dela precisa: versão, capa, se já foi aprovada.
                const pub = ultimaPublicacao(p.id);
                if (!pub) return null;
                const capa = (pub.blocos || []).find(b => b.tipo === 'capa');
                const aprovacao = aprovacaoDe(pub.id);
                return {
                    ...base,
                    publicacao: { numero: pub.numero, criado_em: pub.criado_em },
                    capa: capa ? resolver(capa.dados?.imagem || null) : null,
                    aprovada: aprovacao ? { quem_nome: aprovacao.quem_nome, criado_em: aprovacao.criado_em } : null,
                };
            })
            .filter(Boolean)
            .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));

        return {
            // Nome e empresa. Token, contato e e-mail ficam do lado de cá.
            cliente: { nome: cliente.nome, empresa: cliente.empresa || null },
            projetos: listados,
            pecas,
            escolhidas: sessao
                ? ler('selecoes').filter(s => s.sessao === sessao && visiveis.has(s.peca_id)).map(s => s.peca_id)
                : [],
        };
    },

    /** O par local de `ap_selecionar(token, peca, marcado)`. */
    selecionar: async (token, pecaId, marcado, sessao) => {
        if (String(sessao || '').length < 8) throw new Error('Não foi possível registrar sua escolha.');

        // A peça precisa estar no link DESTE token. Sem esta conferência,
        // quem tem um link válido escolheria foto de outro cliente mandando
        // o id na mão — e escolheria foto sem consentimento.
        const visao = await local.entrega(token, null);
        if (!visao) throw new Error('Este link não está mais disponível.');
        if (!visao.pecas.some(p => p.id === pecaId)) {
            throw new Error('Esta foto não está mais disponível neste link.');
        }

        const linhas = ler('selecoes');
        const existente = linhas.find(s => s.peca_id === pecaId && s.sessao === sessao);
        if (marcado && !existente) {
            await local.salvar('selecoes', { peca_id: pecaId, sessao, nota: null });
        } else if (!marcado && existente) {
            gravar('selecoes', linhas.filter(s => s.id !== existente.id));
        }
        return marcado;
    },

    /* ═══════════════════════════════════════════════════════════════════════
       A APRESENTAÇÃO

       O par local de `ap_apresentacao(token, projeto)`: a ÚLTIMA publicação,
       com as imagens já resolvidas, a aprovação dela e a conversa visível.
       Rascunho nunca sai daqui — o cliente vê o que foi publicado.
       ═══════════════════════════════════════════════════════════════════════ */
    apresentacao: async (token, projetoId) => {
        const achado = apresentacaoDoToken(token, projetoId);
        if (!achado) return null;
        const { cliente, projeto, publicacao } = achado;
        const aprovacao = aprovacaoDe(publicacao.id);
        return {
            ...montarApresentacao({
                cliente, projeto: { ...projeto, visual: publicacao.visual ?? projeto.visual },
                blocos: publicacao.blocos, numero: publicacao.numero, publicada_em: publicacao.criado_em,
            }),
            aprovacao: aprovacao ? { quem_nome: aprovacao.quem_nome, criado_em: aprovacao.criado_em } : null,
            comentarios: ler('comentarios')
                .filter(c => c.publicacao_id === publicacao.id && !c.interno)
                .map(comentarioPublico),
        };
    },

    /**
     * Uma versão publicada na forma que o cliente recebe, sem conversa —
     * é o que sobe para a nuvem (lib/nuvem.js). Imagem sem autorização já
     * sai como null daqui, e por isso nunca chega a ser enviada.
     */
    visaoPublicada: async (projetoId, numero) => {
        const projeto = ler('projetos').find(p => p.id === projetoId);
        const publicacao = ler('publicacoes').find(p => p.projeto_id === projetoId && p.numero === Number(numero));
        if (!projeto || !publicacao) return null;
        const cliente = ler('clientes').find(c => c.id === projeto.cliente_id);
        return {
            cliente, projeto,
            visao: montarApresentacao({
                cliente, projeto: { ...projeto, visual: publicacao.visual ?? projeto.visual },
                blocos: publicacao.blocos, numero: publicacao.numero, publicada_em: publicacao.criado_em,
            }),
        };
    },

    /** A prévia da equipe: o RASCUNHO, na mesma forma que o cliente recebe. */
    previa: async (projetoId) => {
        const projeto = ler('projetos').find(p => p.id === projetoId);
        if (!projeto) return null;
        const cliente = ler('clientes').find(c => c.id === projeto.cliente_id);
        const blocos = ler('blocos').filter(b => b.projeto_id === projetoId)
            .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
        const ultima = ultimaPublicacao(projetoId);
        return {
            ...montarApresentacao({
                cliente, projeto, blocos, previa: true,
                numero: (ultima?.numero || 0) + 1, publicada_em: null,
            }),
            aprovacao: null,
            comentarios: [],
        };
    },

    /** O par local de `ap_aprovar(token, projeto, numero, nome)`. */
    aprovarPublicacao: async (token, projetoId, numero, nome) => {
        const quem = String(nome || '').trim();
        if (!quem) throw new Error('Escreva seu nome para registrar a aprovação.');
        const { publicacao, projeto } = conferirVersaoAtual(token, projetoId, numero);

        const ja = aprovacaoDe(publicacao.id);
        if (ja) throw new Error(`Esta versão já foi aprovada por ${ja.quem_nome}.`);

        return local.salvar('aprovacoes', {
            versao_id: null, publicacao_id: publicacao.id, etapa_id: null,
            decisao: 'aprovado', quem_nome: quem, quem_email: null, ip_hash: null,
            // O retrato: o que estava na tela no instante do "aprovo". É o que
            // responde "eu nunca aprovei isso" três semanas depois.
            retrato: { projeto: projeto.nome, numero: publicacao.numero,
                       publicada_em: publicacao.criado_em, blocos: publicacao.blocos },
        });
    },

    /** O pedido de ajuste do cliente: um comentário que abre fio. */
    pedirAjuste: async (token, projetoId, numero, nome, texto) => {
        const quem = String(nome || '').trim();
        const pedido = String(texto || '').trim();
        if (!quem) throw new Error('Escreva seu nome para a equipe saber quem pediu.');
        if (!pedido) throw new Error('Escreva o que você quer que mude.');
        const { publicacao } = conferirVersaoAtual(token, projetoId, numero);

        const ja = aprovacaoDe(publicacao.id);
        if (ja) {
            throw new Error('Esta versão já foi aprovada — ela não muda mais. '
                          + 'Fale com a equipe se precisar de algo.');
        }

        return local.salvar('comentarios', {
            versao_id: null, publicacao_id: publicacao.id, pai_id: null,
            // Quem entra por esta porta é o cliente, sempre — o lado não vem
            // por parâmetro (mesma regra do Chronos, db/migracao-conversa.sql).
            origem: 'cliente', tipo: 'ajuste', autor: quem, interno: false,
            quadro: null, quadro_fim: null, texto: pedido, anotacao: null,
            herdado_de: null, editado_em: null,
        });
    },
};

/* Aprovar ou pedir ajuste numa versão velha é recusado: a equipe publicou a
   V3 enquanto o cliente olhava a V2 numa aba esquecida, e um "aprovo" ali não
   pode valer para o que ele não viu. */
function conferirVersaoAtual(token, projetoId, numero) {
    const achado = apresentacaoDoToken(token, projetoId);
    if (!achado) throw new Error('Este link não está mais disponível.');
    if (achado.publicacao.numero !== Number(numero)) {
        throw new Error('A equipe publicou uma versão mais nova desta apresentação. '
                      + 'Recarregue a página para ver.');
    }
    return achado;
}
