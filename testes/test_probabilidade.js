// Testes da aba de probabilidade (probabilidade.js) no Node. Itens da auditoria de 27/11/2026:
// desconto de solo úmido aplicado uma única vez, horas faltantes na previsão por conjunto,
// "risco baixo" no lugar de 0% fora do domínio do modelo e horizonte efetivo da previsão.
const fs = require('fs'), path = require('path'), assert = require('assert');
const P = require('../probabilidade.js');
const H = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'historico.json'), 'utf8'));
let falhas = 0; const teste = (n, f) => { try { f(); console.log('ok  ', n); } catch (e) { falhas++; console.log('FALHA', n, '\n', e.message); } };
const ZS = ['Z1', 'Z2', 'Z3'], LIM = {Z1: [140, 185, 235, 260], Z2: [155, 210, 260, 290], Z3: [170, 230, 285, 320], BV: [300, 600, 950, 1150], AF: [5, 7, 9, 10.5]};
const somaDia = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const HOJE = '2026-11-27';

// snapshot mínimo: solo úmido, limites das zonas já descontados pelo servidor (como no data.json real)
function snap(obsDia) {
  const z = {};
  for (const k of ZS) z[k] = {limites: LIM[k].map(t => t - 30), fim_acumulado: HOJE + 'T13:00',
    diario: Array.from({length: 6}, (_, i) => ({d: somaDia(HOJE, i - 5), obs: obsDia}))};
  return {limites: LIM, ajuste_umido: 30, solo: {estado: 'umido', af_q_ontem: 100}, af: {h: 3.1, q: 100}, zonas: z};
}
// conjunto sintético: chuva diária fixa em todos os membros
function conj(diaria, membros = 10, dias = 11) {
  const z = {};
  for (const k of ZS) z[k] = Array.from({length: membros}, () => Object.fromEntries(Array.from({length: dias}, (_, i) => [somaDia(HOJE, i), diaria])));
  return {modelo: 'teste', membros, z};
}

teste('desconto de 30 mm aplicado uma única vez (limite úmido de Z1 = 110 mm, não 80 mm)', () => {
  // janela do 5º dia = medido de hoje + previsto de hoje + 4 dias previstos = 6 x chuva diária
  // 14 mm/dia -> 84 mm: acima de 80 (desconto duplicado) e abaixo de 110 (desconto correto) em Z1
  const R = P.calcular(snap(14), H, conj(14));
  assert.strictEqual(Math.max(...R.regra.map(r => r[4])), 0, 'a regra de chuva não pode acionar com 84 mm e limite de 110 mm');
  // 19 mm/dia -> 114 mm: só Z1 passa do limite úmido correto (Z1 110, Z2 125); uma zona dá o nível inferior (0)
  const R2 = P.calcular(snap(19), H, conj(19));
  assert.strictEqual(R2.regra[0][4], 0, 'com desconto duplicado Z2 (95) também passaria e acionaria Atenção');
});

teste('dia de previsão com horas faltantes não entra como chuva menor', () => {
  // resposta do Open-Meteo com 12 pontos e 10 membros, 24 h por dia; no 2º dia faltam 6 h em todos os membros
  const t0 = Date.parse(HOJE + 'T14:00:00Z'), n = 24 * 4, tempo = Array.from({length: n}, (_, h) => new Date(t0 + h * 36e5).toISOString().slice(0, 16));
  const hourly = {time: tempo};
  for (let m = 0; m < 10; m++) hourly[m ? `precipitation_member${String(m).padStart(2, '0')}` : 'precipitation'] = tempo.map((t, h) => t.startsWith(somaDia(HOJE, 2)) && h % 4 === 0 ? null : 1);
  const locs = Array.from({length: 12}, () => ({hourly}));
  const E = P.lerConjunto(locs, 'teste', HOJE + 'T13:00');
  assert.strictEqual(E.z.Z1[0][somaDia(HOJE, 2)], null, 'dia incompleto deve ficar sem valor (null), não com soma parcial');
  assert.ok(E.z.Z1[0][somaDia(HOJE, 1)] > 23, 'dia completo mantém a soma');
});

teste('chuva abaixo do domínio do modelo é sinalizada (risco baixo), não tratada como 0% confiável', () => {
  const R = P.calcular(snap(2), H, conj(2));
  assert.ok(R.fora[4][0], 'cenários abaixo de 100 mm devem marcar "fora do domínio"');
  assert.ok(R.pCota[4][0] < 0.01);
});

teste('horizonte efetivo: previsão de 6 dias encerra o cálculo no 6º dia', () => {
  const R = P.calcular(snap(5), H, conj(5, 10, 6));
  assert.strictEqual(R.ultimo, 5, 'o último dia calculado deve ser o 6º (índice 5)');
});

if (falhas) { console.log(`${falhas} falha(s)`); process.exit(1); }
