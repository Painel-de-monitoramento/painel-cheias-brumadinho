// Testes da camada ao vivo (aovivo.js) no Node: convenção de intervalos, histerese da elevação local (item 22),
// envelhecimento sem rede (item 17), previsão antiga (item 03) e cobertura da vazão de ontem (item 16).
const fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
const raiz = path.join(__dirname, '..');
const loja = {};
function carregar() {   // nova instância do módulo (simula recarregar a página), com o mesmo armazenamento local
  const ctx = {console, Date, Math, JSON, structuredClone, Promise, setTimeout, clearTimeout, AbortController, Number, String, Object, Array, Set, Map, isNaN};
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.localStorage = {getItem: k => (k in loja ? loja[k] : null), setItem: (k, v) => { loja[k] = String(v); }, removeItem: k => { delete loja[k]; }};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'motor.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(raiz, 'aovivo.js'), 'utf8'), ctx);
  return ctx;
}
const H = 36e5, base0 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture_data.json'), 'utf8'));
const loc = t => new Date(t - 3 * H).toISOString().slice(0, 16), ms = s => Date.parse(s + ':00-03:00');
let falhas = 0; const teste = (n, f) => { try { f(); console.log('ok  ', n); } catch (e) { falhas++; console.log('FALHA', n, '\n', e.message); } };

// cenário: leituras recentes em relação a "agora"
const agora = ms(base0.coleta) + 10 * 60e3;
function snapshot(nivelServidor, historico) {
  const b = structuredClone(base0);
  b.af.h = 2.5; b.af.h_t = b.af.t = loc(agora - 20 * 60e3); b.bv.q = 50; b.bv.q_t = b.bv.t = loc(agora - 20 * 60e3);
  b.estado = {nivel: nivelServidor, desde: loc(agora - 48 * H), causa: 'teste', historico: historico || []};
  b.nivel.atual = nivelServidor; b.solo.af_q_ontem = 40; b.solo.af_q_ontem_cobertura = 1;
  for (const z of ['Z1', 'Z2', 'Z3']) Object.assign(b.zonas[z], {P5: 10, cob5: 1, P30: 100, cob30: 1});
  // série horária em subida (sem descida contínua): rebaixamento não é permitido pela regra das 12 h
  b.af.serie = Array.from({length: 30}, (_, i) => [loc(Math.floor(agora / H) * H - (29 - i) * H), +(2.0 + 0.02 * i).toFixed(2)]);
  return b;
}

let A = carregar().AoVivo;
teste('intervalos: ANA no fim do intervalo e Open-Meteo na hora anterior', () => {
  assert.strictEqual(loc(A._t.horaAna(ms('2026-11-26T10:00'))), '2026-11-26T09:00');
  assert.strictEqual(loc(A._t.horaAna(ms('2026-11-26T10:15'))), '2026-11-26T10:00');
  assert.strictEqual(loc(A._t.horaOM(ms('2026-11-27T00:00'))), '2026-11-26T23:00');
});
teste('cobertura: 120 h estimadas = 100% temporal e 0% medida', () => {
  const src = {}, a = ms('2026-11-21T00:00'); for (let i = 0; i < 120; i++) src[a + i * H] = 'E';
  const c = A._t.cob(src, {}, a, a + 120 * H); assert.deepStrictEqual([c.temporal, c.medida, c.estimada], [1, 0, 1]);
});
teste('frescor igual ao do coletor', () => {
  assert.strictEqual(A.frescor(-20 / 60), 'futuro'); assert.strictEqual(A.frescor(0.6), 'atualizado'); assert.strictEqual(A.frescor(1.1), 'atrasado');
  assert.strictEqual(A.frescor(2.5), 'desatualizado'); assert.strictEqual(A.frescor(3.2), 'indisponivel'); assert.strictEqual(A.frescor(1.4, 60), 'atualizado');
});

// item 22: servidor = 0, ao vivo = 2, nova leitura = 0 -> mantém 2
teste('elevação local persiste quando a leitura seguinte volta abaixo do limite', () => {
  const b = snapshot(0), d = structuredClone(b); d.af.h = 7.2;
  let r = A._t.decidirLocal(d, b, agora); assert.strictEqual(r.nivel.atual, 2); assert.ok(r.nivel.elevado_ao_vivo);
  const d2 = structuredClone(b); d2.af.h = 2.5;   // régua volta a 2,5 m sem 12 h de descida
  r = A._t.decidirLocal(d2, b, agora + 15 * 60e3); assert.strictEqual(r.nivel.atual, 2, 'rebaixou sem histerese');
});
teste('elevação local sobrevive a recarregar a página', () => {
  A = carregar().AoVivo; const b = snapshot(0), d = structuredClone(b);
  const r = A._t.decidirLocal(d, b, agora + 30 * 60e3); assert.strictEqual(r.nivel.atual, 2); assert.strictEqual(r.nivel.oficial, 0);
});
teste('falta de dados não rebaixa a elevação local', () => {
  const b = snapshot(0), d = structuredClone(b); d.af.h = null; d.bv.q = null;
  const r = A._t.decidirLocal(d, b, agora + 40 * 60e3); assert.strictEqual(r.nivel.atual, 2);
});
teste('rebaixamento local só com decisão válida: todos os indicadores e 12 h de descida', () => {
  const b = snapshot(0), d = structuredClone(b), t0 = agora + 60 * 60e3;
  d.af.h_t = d.af.t = loc(t0 - 10 * 60e3); d.bv.q_t = d.bv.t = loc(t0 - 10 * 60e3);
  d.af.serie = Array.from({length: 14}, (_, i) => [loc(Math.floor(t0 / H) * H - (13 - i) * H), +(4 - 0.1 * i).toFixed(2)]);
  const r = A._t.decidirLocal(d, b, t0); assert.strictEqual(r.nivel.atual, 0); assert.strictEqual(A._t.lerLocal(), null);
});
teste('confirmação do servidor limpa a elevação local', () => {
  const b = snapshot(0), d = structuredClone(b); d.af.h = 7.2; A._t.decidirLocal(d, b, agora);
  assert.ok(A._t.lerLocal());
  const b2 = snapshot(2), d2 = structuredClone(b2);
  const r = A._t.decidirLocal(d2, b2, agora + 20 * 60e3); assert.strictEqual(r.nivel.atual, 2); assert.strictEqual(A._t.lerLocal(), null);
});

// item 17: sem rede, a régua envelhece e deixa de valer, mas o nível vigente não cai
teste('sem rede por mais de 3 h: dados expiram e o alerta não é rebaixado', () => {
  const b = snapshot(2); b.af.h = 7.2; const r = A._t.decidirLocal(structuredClone(b), b, agora + 4 * H);
  assert.strictEqual(r.nivel.status, 'indeterminado'); assert.strictEqual(r.nivel.atual, 2);
  assert.strictEqual(r.nivel.indicadores[0].estado, 'indisponivel'); assert.strictEqual(r.qualidade.nivel.frescor, 'indisponivel');
});
// item 03: previsão antiga não mantém selo de atual
teste('previsão com mais de 12 h é retirada e sinalizada; de 3 a 12 h fica desatualizada', () => {
  const b = snapshot(0); b.previsao_meta = {fonte: 'Open-Meteo', ultimo_sucesso: loc(agora - 5 * H), estado: 'ok'};
  let r = A._t.decidirLocal(structuredClone(b), b, agora); assert.strictEqual(r.previsao_meta.estado, 'desatualizada');
  b.previsao_meta.ultimo_sucesso = loc(agora - 13 * H); r = A._t.decidirLocal(structuredClone(b), b, agora);
  assert.strictEqual(r.previsao_meta.estado, 'indisponivel'); assert.strictEqual(r.previsao.length, 0);
  assert.ok(r.alertas.some(a => /Previsão de chuva indisponível/.test(a.texto)));
});
// item 16: vazão de ontem sem cobertura conhecida não é presumida completa
teste('vazão de ontem sem cobertura = solo indeterminado e status degradado', () => {
  const b = snapshot(0); b.solo.af_q_ontem_cobertura = null; const r = A._t.decidirLocal(structuredClone(b), b, agora);
  assert.strictEqual(r.solo.estado, 'indeterminado'); assert.notStrictEqual(r.nivel.status, 'valido');
});
process.exit(falhas ? 1 : 0);
