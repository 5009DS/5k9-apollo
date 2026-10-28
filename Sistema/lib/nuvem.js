/* ═══════════════════════════════════════════════════════════════════════════
   NUVEM — a versão publicada, num lugar que o cliente alcança.

   O atalho antes do Teste 1 (db/nuvem.sql explica o desenho): a equipe monta
   no navegador, e Publicar sobe a versão congelada e os arquivos dela para o
   Supabase do Forms. O link do cliente lê de lá, em qualquer aparelho.

   Dois lados, como no Chronos:
     · a equipe usa a biblioteca supabase-js — há login, sessão e envio;
     · o cliente usa fetch puro nas duas funções públicas — sem baixar
       ~100 kB de biblioteca antes da primeira imagem aparecer.
   ═══════════════════════════════════════════════════════════════════════════ */

import { SUPABASE_URL, SUPABASE_ANON, CONFIGURADO } from './supabase-config.js';
import { midia } from './midia.js';

export { CONFIGURADO };

const SUPABASE_JS = 'https://esm.sh/@supabase/supabase-js@2.117.1/es2022/supabase-js.bundle.mjs';
const BUCKET = 'apollo';

let sb = null;
/* Uma instância só: dois createClient() disputam a mesma sessão salva e um
   derruba o outro (nota do Chronos, db/remoto.js). */
const cliente = async () => {
    if (sb) return sb;
    const { createClient } = await import(SUPABASE_JS);
    sb = createClient(SUPABASE_URL, SUPABASE_ANON);
    return sb;
};

/** O endereço público de um arquivo publicado — o que o <img> do cliente abre. */
export const urlPublica = (chave) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`
    + String(chave).split('/').map(encodeURIComponent).join('/');

/* As funções da porta do cliente, por fetch. A mensagem que a função levanta
   foi escrita para ser lida por gente e vai direto para a tela. */
const rpc = async (funcao, corpo) => {
    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcao}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
    });
    const texto = await resposta.text();
    const dados = texto ? JSON.parse(texto) : null;
    if (!resposta.ok) {
        console.error(`[nuvem] ${funcao}:`, dados || resposta.status);
        throw new Error(dados?.message || `Falha ao falar com o banco (${resposta.status}).`);
    }
    return dados;
};

const falhou = (contexto, error) => {
    console.error(`[nuvem] ${contexto}:`, error);
    throw new Error(error.message || `Falha ao ${contexto}.`);
};

/* As chaves de arquivo que uma versão usa — imagem, capa, vídeo e a fonte com
   licença para web. Só existem na visão o que tem autorização: o que está
   bloqueado já saiu como null em montarApresentacao (db/local.js). */
const chavesDe = (visao) => {
    const achadas = new Set();
    const andar = (v) => {
        if (Array.isArray(v)) return v.forEach(andar);
        if (!v || typeof v !== 'object') return;
        ['proxy_chave', 'capa_chave', 'fonte_chave'].forEach(k => { if (typeof v[k] === 'string') achadas.add(v[k]); });
        Object.values(v).forEach(andar);
    };
    andar(visao.blocos);
    return [...achadas];
};

/** Erro de quem tentou publicar sem estar logado — a tela pede o login. */
export class SemSessao extends Error {
    constructor() { super('Entre com o login da equipe para publicar.'); this.code = 'SEM_SESSAO'; }
}

export const nuvem = {
    // ── A equipe ────────────────────────────────────────────────────────
    sessao: async () => {
        if (!CONFIGURADO) return null;
        const { data: { session } } = await (await cliente()).auth.getSession();
        return session?.user || null;
    },

    entrar: async (email, senha) => {
        const { error } = await (await cliente()).auth.signInWithPassword({ email, password: senha });
        if (error) {
            throw new Error(/invalid login/i.test(error.message)
                ? 'E-mail ou senha incorretos. É o mesmo login do Forms e do Chronos.' : error.message);
        }
    },

    /**
     * Sobe uma versão publicada: primeiro os arquivos, depois a linha — a
     * linha apontando para um arquivo que não chegou seria imagem quebrada no
     * celular do cliente. Arquivo que já está lá (versão anterior) é pulado.
     *
     * @param {{ visao, projeto, cliente, numero }} p  visao como a do cliente
     * @param {(feito:number, total:number) => void} aoAvancar
     */
    publicar: async ({ visao, projeto, cliente: dono, numero }, aoAvancar = () => {}) => {
        if (!(await nuvem.sessao())) throw new SemSessao();
        const s = await cliente();
        const chaves = chavesDe(visao);
        for (const [i, chave] of chaves.entries()) {
            aoAvancar(i, chaves.length);
            const arquivo = await midia.ler(chave);
            if (!arquivo) continue;
            const { error } = await s.storage.from(BUCKET).upload(chave, arquivo, {
                contentType: arquivo.type || undefined, cacheControl: '31536000', upsert: false,
            });
            // Já existe: a chave é imutável (v1, v2…), então é o mesmo arquivo.
            if (error && !/exists|duplicate/i.test(error.message)) falhou(`enviar ${chave}`, error);
        }
        aoAvancar(chaves.length, chaves.length);
        const { error } = await s.from('ap_publicadas').upsert({
            projeto_id: projeto.id, numero,
            cliente_token: dono.token, cliente_apelido: dono.apelido || null,
            projeto_apelido: projeto.apelido || null,
            visao: { ...visao, previa: false },
        }, { onConflict: 'projeto_id,numero' });
        if (error) falhou('gravar a versão', error);
    },

    /** O link personalizado mudou: as versões já publicadas acompanham. */
    atualizarApelidos: async ({ cliente: dono, projeto }) => {
        if (!(await nuvem.sessao())) return;
        const s = await cliente();
        const a = await s.from('ap_publicadas').update({ cliente_apelido: dono.apelido || null })
            .eq('cliente_token', dono.token);
        if (a.error) falhou('atualizar o link do cliente', a.error);
        const b = await s.from('ap_publicadas').update({ projeto_apelido: projeto.apelido || null })
            .eq('projeto_id', projeto.id);
        if (b.error) falhou('atualizar o link do projeto', b.error);
    },

    /** Quais números deste projeto já estão na nuvem. */
    numerosPublicados: async (projetoId) => {
        if (!(await nuvem.sessao())) return null;
        const { data, error } = await (await cliente()).from('ap_publicadas')
            .select('numero').eq('projeto_id', projetoId);
        if (error) falhou('ler as versões', error);
        return new Set(data.map(d => d.numero));
    },

    /** Tudo o que o cliente e a equipe disseram neste projeto. */
    retornosDe: async (projetoId) => {
        if (!(await nuvem.sessao())) return [];
        const { data, error } = await (await cliente()).from('ap_retornos')
            .select('*').eq('projeto_id', projetoId).order('criado_em');
        if (error) falhou('ler os retornos', error);
        return data;
    },

    /** A resposta da equipe, para o cliente ver no celular dele também. */
    responder: async (linha) => {
        if (!(await nuvem.sessao())) return;
        const { error } = await (await cliente()).from('ap_retornos').upsert(linha);
        if (error) falhou('enviar a resposta', error);
    },

    // ── O cliente ───────────────────────────────────────────────────────
    apresentacao: (clienteLink, projetoLink) =>
        rpc('ap_apresentacao', { p_cliente: clienteLink, p_projeto: projetoLink }),

    registrarRetorno: ({ clienteLink, projetoLink, numero, tipo, nome, texto = null }) =>
        rpc('ap_registrar_retorno', {
            p_cliente: clienteLink, p_projeto: projetoLink, p_numero: Number(numero),
            p_tipo: tipo, p_nome: nome, p_texto: texto,
        }),
};
