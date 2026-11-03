// Sincronização do Robô B3 entre aparelhos.
// Guarda os dados da carteira (um bloco por "grupo" de aparelhos) no Netlify Blobs do próprio site.
// O acesso é pela chave secreta do grupo (gerada no navegador, nunca gravada aqui: só o hash dela vira nome do bloco).
// Mescla documento por documento: vence a edição mais recente; apagar vira "lápide" para o apagado também chegar aos outros aparelhos.
import { createHash } from 'node:crypto';

export const config = { path: '/api/sync' };

const STORE_NAME = 'robo-b3-sync';
const MAX_BODY = 900000;          // caracteres por pedido
const MAX_DOCS = 4000;            // documentos por grupo
const MAX_DOC = 60000;            // caracteres por documento
const MAX_STATE = 2500000;        // caracteres do grupo inteiro
const MAX_GROUPS = 40;            // grupos neste site (uso pessoal: 1 ou 2)
const TOMB_MS = 120 * 86400000;   // lápides com mais de 120 dias são limpas
const FUTURE_MS = 15000;          // carimbo no futuro (relógio errado) é cortado para agora + 15 s
const TRIES = 6;

const ID_RE = /^[A-Za-z0-9_-]{32,64}$/;
const PATH_RE = /^[a-z][a-z0-9_]{0,29}\/[A-Za-z0-9_\-.~:@+]{1,120}$/;

const hash = (id) => createHash('sha256').update('robo-b3:' + id).digest('hex');
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
const fail = (status, err) => reply(status, { ok: false, err });

// Pedido -> resposta. `store` tem: get(chave) -> {data, etag} | null; setIfMatch(chave, dados, etag) -> bool; setIfNew(chave, dados) -> bool;
// set(chave, dados); del(chave); count(prefixo) -> número. Assim o mesmo código roda no Netlify e nos testes.
export async function handle(req, store, now = Date.now()) {
  if (req.method === 'GET') return reply(200, { ok: true, app: 'robo-b3-sync', v: 1 });
  if (req.method !== 'POST') return fail(405, 'method');
  let text;
  try { text = await req.text(); } catch (e) { return fail(400, 'bad_request'); }
  if (text.length > MAX_BODY) return fail(413, 'too_big');
  let b;
  try { b = JSON.parse(text); } catch (e) { return fail(400, 'bad_request'); }
  if (!isObj(b) || b.v !== 1 || typeof b.id !== 'string' || !ID_RE.test(b.id)) return fail(400, 'bad_request');
  const h = hash(b.id), gk = 'g/' + h, xk = 'x/' + h;

  if (b.op === 'create') {
    if (await store.get(xk)) return fail(410, 'wiped');
    if (await store.get(gk)) return fail(409, 'exists');
    if ((await store.count('g/')) >= MAX_GROUPS) return fail(429, 'limit');
    const ok = await store.setIfNew(gk, { v: 1, created: now, docs: {} });
    return ok ? reply(200, { ok: true, now }) : fail(409, 'exists');
  }

  if (b.op === 'wipe') {
    const cur = await store.get(gk);
    if (!cur) return (await store.get(xk)) ? reply(200, { ok: true, now }) : fail(404, 'unknown');
    await store.set(xk, { v: 1, wiped: now });
    await store.del(gk);
    return reply(200, { ok: true, now });
  }

  if (b.op !== 'sync') return fail(400, 'bad_request');
  const changes = isObj(b.changes) ? b.changes : {}, have = isObj(b.have) ? b.have : {};
  const cKeys = Object.keys(changes);
  if (cKeys.length > MAX_DOCS || Object.keys(have).length > MAX_DOCS) return fail(413, 'too_big');
  // valida os documentos que chegam (nada de caminho estranho nem documento gigante)
  const inc = [];
  for (const p of cKeys) {
    const c = changes[p];
    if (!PATH_RE.test(p) || !isObj(c) || !Number.isFinite(c.t) || c.t < 1) return fail(400, 'bad_request');
    if (c.v !== null && !isObj(c.v)) return fail(400, 'bad_request');
    if (c.v !== null && JSON.stringify(c.v).length > MAX_DOC) return fail(413, 'too_big');
    inc.push([p, Math.min(Math.floor(c.t), now + FUTURE_MS), c.v]);
  }

  for (let n = 0; n < TRIES; n++) {
    const cur = await store.get(gk);
    if (!cur) return (await store.get(xk)) ? fail(410, 'wiped') : fail(404, 'unknown');
    const docs = Object.assign(Object.create(null), cur.data.docs);
    let changed = false;
    for (const [p, t, v] of inc) {
      const old = docs[p];
      if (!old || t > old.t) { docs[p] = { t, v }; changed = true; }
    }
    for (const p of Object.keys(docs)) if (docs[p].v === null && now - docs[p].t > TOMB_MS) { delete docs[p]; changed = true; }
    if (Object.keys(docs).length > MAX_DOCS) return fail(413, 'too_big');
    const next = { v: 1, created: cur.data.created, docs };
    if (changed) {
      if (JSON.stringify(next).length > MAX_STATE) return fail(413, 'too_big');
      if (!(await store.setIfMatch(gk, next, cur.etag))) continue; // alguém gravou no meio: lê de novo e refaz
    }
    const out = Object.create(null), want = [];
    for (const p of Object.keys(docs)) { const h0 = have[p]; if (!Number.isFinite(h0) || docs[p].t > h0) out[p] = docs[p]; }
    for (const p of Object.keys(have)) { if (PATH_RE.test(p) && Number.isFinite(have[p]) && (!docs[p] || have[p] > docs[p].t)) want.push(p); }
    return reply(200, { ok: true, now, docs: out, want: want.slice(0, MAX_DOCS) });
  }
  return fail(503, 'busy');
}

// No Netlify: o repositório de blocos do site (sempre leitura "forte": lê o que acabou de ser gravado).
async function netlifyStore() {
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name: STORE_NAME, consistency: 'strong' });
  return {
    async get(key) {
      const r = await s.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      return r && r.data ? { data: r.data, etag: r.etag } : null;
    },
    async setIfMatch(key, data, etag) { const r = await s.setJSON(key, data, { onlyIfMatch: etag }); return !!(r && r.modified); },
    async setIfNew(key, data) { const r = await s.setJSON(key, data, { onlyIfNew: true }); return !!(r && r.modified); },
    async set(key, data) { await s.setJSON(key, data); },
    async del(key) { await s.delete(key); },
    async count(prefix) { const r = await s.list({ prefix }); return (r.blobs || []).length; }
  };
}

export default async (req) => {
  try { return await handle(req, await netlifyStore()); }
  catch (e) { console.error('sync: erro', e && e.message); return fail(500, 'server'); }
};
