// Probabilidade de enchente em Brumadinho nos próximos 5 e 10 dias.
// Chuva: medida (data.json) + previsão por conjunto do Open-Meteo (ECMWF IFS 0,25°, reserva GFS 0,25°), lida no navegador.
// Regra de chuva e relação chuva-vazão do estudo (historico.json); erro do modelo somado à incerteza da chuva.
// Chuva ausente nunca vira zero: dia sem medição usa a estimativa do modelo meteorológico; sem nenhuma das duas, o cálculo é bloqueado.
(() => {
const ZS = ['Z1', 'Z2', 'Z3'];
const GRADE = {Z1: [[-20.881, -43.817], [-20.761, -43.697], [-20.641, -43.937], [-20.521, -43.817]],
  Z2: [[-20.851, -44.179], [-20.731, -44.059], [-20.611, -44.179], [-20.611, -43.939]],
  Z3: [[-20.343, -44.299], [-20.223, -44.179], [-20.463, -44.059], [-20.343, -43.939]]};
const MODELOS = [['ecmwf_ifs025', 'ECMWF IFS 0,25°'], ['gfs025', 'GFS 0,25°']];
const PMIN = 100;            // abaixo disso não há enchente registrada (menor: 107 mm em 1992)
const DIAS = 11;             // hoje + 10 dias
const NQ = 41;               // pontos de quadratura do erro do modelo

// ---------- funções numéricas
function phi(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2); return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; }
function invphi(p) { // Acklam
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572], c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 1 - 0.02425 ? Math.sqrt(-2 * Math.log(1 - p)) : null;
  if (q == null) { const r = p - 0.5, s = r * r; return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1); }
  const v = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  return p < 0.5 ? v : -v;
}
const ZQ = Array.from({length: NQ}, (_, i) => invphi((i + 0.5) / NQ));
function interp(x, X, Y, logx) { const g = v => logx ? Math.log(v) : v; if (x <= X[0]) return Y[0]; for (let i = 1; i < X.length; i++) if (x <= X[i]) { const t = (g(x) - g(X[i - 1])) / (g(X[i]) - g(X[i - 1])); return Y[i - 1] + t * (Y[i] - Y[i - 1]); } const n = X.length - 1; return Y[n] + (g(x) - g(X[n])) * (Y[n] - Y[n - 1]) / (g(X[n]) - g(X[n - 1])); }
const quant = (arr, p) => { const s = [...arr].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const somaDia = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// ---------- previsão por conjunto: média dos 4 pontos de cada zona, por membro, em totais diários (hora local, início do intervalo)
function lerConjunto(js, nomeModelo, fim) {
  const locs = Array.isArray(js) ? js : [js];
  if (locs.length !== 12) throw new Error('resposta com número inesperado de pontos');
  const chaves = Object.keys(locs[0].hourly).filter(k => k.startsWith('precipitation'));
  if (chaves.length < 10) throw new Error('conjunto com poucos membros');
  const tempo = locs[0].hourly.time, out = {modelo: nomeModelo, membros: chaves.length, z: {}};
  ZS.forEach((z, zi) => {
    out.z[z] = chaves.map(k => { const dia = {};
      for (let h = 0; h < tempo.length; h++) {
        const ini = new Date(Date.parse(tempo[h] + ':00Z') - 36e5).toISOString().slice(0, 16);   // valor da hora anterior ao rótulo
        if (ini < fim) continue;                                                                     // horas já cobertas pela medição
        const vs = [0, 1, 2, 3].map(p => locs[zi * 4 + p].hourly[k][h]).filter(v => v != null);
        if (vs.length < 2) continue;
        const dd = ini.slice(0, 10); dia[dd] = (dia[dd] || 0) + vs.reduce((a, b) => a + b, 0) / vs.length;
      }
      return dia; });
  });
  return out;
}
async function conjunto(fim) {
  const chave = 'ens:' + fim.slice(0, 13);
  try { const c = sessionStorage.getItem(chave); if (c) return JSON.parse(c); } catch (e) { /* armazenamento indisponível */ }
  const pts = ZS.flatMap(z => GRADE[z]), erros = [];
  for (const [m, nome] of MODELOS) {
    const url = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${pts.map(p => p[0]).join(',')}&longitude=${pts.map(p => p[1]).join(',')}&hourly=precipitation&models=${m}&forecast_days=${DIAS + 1}&timezone=America%2FSao_Paulo`;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(url, {signal: ctl.signal}); clearTimeout(to);
      const js = await r.json(); if (!r.ok || js.error) throw new Error(js.reason || 'HTTP ' + r.status);
      const out = lerConjunto(js, nome, fim); out.obtido = new Date().toISOString();
      try { sessionStorage.setItem(chave, JSON.stringify(out)); localStorage.setItem('ens:ultimo', JSON.stringify(out)); } catch (e) { /* sem cache */ }
      return out;
    } catch (e) { erros.push(`${nome}: ${e.name === 'AbortError' ? 'sem resposta' : e.message}`); }
  }
  const err = new Error(erros.join('; ')); throw err;
}
// reserva: previsão determinística do painel (um cenário só; resta apenas o erro do modelo)
function deterministico(D) {
  const out = {modelo: 'previsão determinística do painel (sem conjunto)', membros: 1, z: {}, reserva: true};
  for (const z of ZS) { const dia = {}; for (const p of D.zonas[z].previsao || []) if (p.prev != null) dia[p.d] = p.prev; out.z[z] = [dia]; }
  return out;
}

// ---------- cálculo
function calcular(D, H, E) {
  const M = H.modelo, L = D.limites, hoje = (D.zonas.Z1.fim_acumulado || D.coleta).slice(0, 10), umido = D.solo.estado !== 'normal';
  const adj = umido ? (D.ajuste_umido || 30) : 0, qb = D.af.q ?? D.solo.af_q_ontem, h0 = D.af.h;
  if (qb == null || h0 == null) throw new Error('sem vazão ou cota atual de Alberto Flores');
  const areaT = ZS.reduce((a, z) => a + M.areas[z], 0), dias = Array.from({length: DIAS}, (_, k) => somaDia(hoje, k));
  // chuva já medida (ou estimada pelo modelo onde faltou medição) nos 4 dias anteriores e na parte de hoje
  const obs = {};
  for (const z of ZS) { obs[z] = {};
    for (const r of D.zonas[z].diario || []) { const v = r.obs ?? r.mod; if (v != null) obs[z][r.d] = v; }
    for (let k = -4; k <= 0; k++) { const d = somaDia(hoje, k); if (obs[z][d] == null) throw new Error(`chuva de ${z} em ${d.slice(8)}/${d.slice(5, 7)} indisponível`); } }
  const nivel = (v, l) => l.reduce((k, t, i) => v >= t ? i + 1 : k, 0);
  const lnQlim = L.AF.map(h => Math.log(interp(h, H.curva.h, H.curva.Q, false)));
  const nm = E.membros, out = {dias, membros: nm, Pb: [], regra: [], mu: [], dias_def: dias};
  for (let m = 0; m < nm; m++) {
    const pb = [], rg = [], mu = [];
    for (let k = 0; k < DIAS; k++) {
      let num = 0, ok = true; const lz = [];
      for (const z of ZS) {
        let s = 0;
        for (let j = k - 4; j <= k; j++) { const d = somaDia(hoje, j); const o = j <= 0 ? obs[z][d] : 0, p = j >= 0 ? E.z[z][m][d] : 0;
          if (j >= 0 && p == null && !(j === 0)) { ok = false; break; } s += o + (p || 0); }
        if (!ok) break;
        num += s * M.areas[z]; lz.push(nivel(s, D.zonas[z].limites.map(t => t - adj)));
      }
      if (!ok) { pb.push(null); rg.push(null); mu.push(null); continue; }
      const P = num / areaT; lz.sort((a, b) => b - a);
      pb.push(P); rg.push(Math.max(lz[1], Math.max(lz[0] - 1, 0))); mu.push(P >= PMIN ? M.a + M.b * P + M.c * Math.log(qb) : null);
    }
    out.Pb.push(pb); out.regra.push(rg); out.mu.push(mu);
  }
  const validos = dias.map((_, k) => out.Pb.filter(p => p[k] != null).length);
  out.ultimo = validos.reduce((a, v, k) => v >= Math.max(1, nm * 0.8) ? k : a, -1);
  // probabilidade acumulada até o dia k, por nível
  const acum = (k, i) => { let s = 0, n = 0;
    for (let m = 0; m < nm; m++) { let mx = null, ok = false;
      for (let j = 0; j <= k; j++) { if (out.Pb[m][j] == null) continue; ok = true; const u = out.mu[m][j]; if (u != null && (mx == null || u > mx)) mx = u; }
      if (!ok) continue; n++; s += h0 >= L.AF[i] ? 1 : mx == null ? 0 : phi((mx - lnQlim[i]) / M.s); }
    return n ? s / n : null; };
  const acumRegra = (k, i) => { let s = 0, n = 0;
    for (let m = 0; m < nm; m++) { const r = out.regra[m].slice(0, k + 1).filter(v => v != null); if (!r.length) continue; n++; if (Math.max(...r) >= i + 1) s++; }
    return n ? s / n : null; };
  out.pCota = dias.map((_, k) => L.AF.map((_, i) => k <= out.ultimo ? acum(k, i) : null));
  out.pRegra = dias.map((_, k) => L.AF.map((_, i) => k <= out.ultimo ? acumRegra(k, i) : null));
  // cota provável por dia: mistura dos cenários com o erro do modelo
  const cota = Q => interp(Q, H.curva.Q, H.curva.h, true);
  out.cota = dias.map((_, k) => { if (k > out.ultimo) return null; const amostra = [];
    for (let m = 0; m < nm; m++) { if (out.Pb[m][k] == null) continue; const u = out.mu[m][k];
      for (const z of ZQ) amostra.push(u == null ? h0 : Math.max(h0, cota(Math.exp(u + z * M.s)))); }
    return [quant(amostra, 0.1), quant(amostra, 0.5), quant(amostra, 0.9)]; });
  out.chuva = dias.map((_, k) => { const v = out.Pb.map(p => p[k]).filter(x => x != null); return v.length ? [quant(v, 0.1), quant(v, 0.5), quant(v, 0.9)] : null; });
  Object.assign(out, {h0, qb, umido, adj, hoje});
  return out;
}

// ---------- apresentação
if (typeof document === 'undefined') { module.exports = {calcular, lerConjunto, phi, invphi}; return; }
const {HEX, TXT, esc, f, dtf, hm, PL, CFG, plot} = C, $ = id => document.getElementById(id);
const N = ['Normal', 'Atenção', 'Alerta', 'Alerta máximo', 'Emergência'];
const SIT = ['', 'Água na planície e nas áreas baixas da beira-rio', 'Edificações da beira-rio atingidas', 'Centro alagado (referência 2012)', 'Nível de 2022 ou superior'];
const CLS = [[0.05, 'Muito baixa', '#2e9e5b'], [0.2, 'Baixa', '#7cb342'], [0.5, 'Moderada', '#f2c230'], [0.8, 'Alta', '#f08a24'], [1.01, 'Muito alta', '#d93a26']];
const classe = p => CLS.find(c => p < c[0]);
const pct = p => p == null ? 'sem dado' : p < 0.005 ? 'menos de 1%' : p > 0.995 ? 'mais de 99%' : f(p * 100, 0) + '%';
const pcc = p => p == null ? 'sem dado' : p < 0.005 ? '< 1%' : p > 0.995 ? '> 99%' : f(p * 100, 0) + '%';
const dm = d => `${d.slice(8)}/${d.slice(5, 7)}`;
let D = null, H = null, E = null, falhaE = null, busy = false;

function render() {
  let R;
  try { R = calcular(D, H, E); } catch (e) { $('warn').hidden = false; $('warn').textContent = `Não foi possível calcular a probabilidade: ${e.message}.`; return; }
  const k5 = Math.min(4, R.ultimo), k10 = Math.min(9, R.ultimo), d5 = R.dias[k5], d10 = R.dias[k10];
  const w = [];
  if (falhaE) w.push(`Previsão por conjunto indisponível (${falhaE}). ${E.reserva ? 'O cálculo usa a previsão determinística do painel: a incerteza da chuva não está representada e a probabilidade fica menos confiável.' : `Usando o conjunto obtido em ${dtf(new Date(E.obtido).toLocaleString('sv', {timeZone: 'America/Sao_Paulo'}))}.`}`);
  if (R.ultimo < 9) w.push(`A previsão disponível cobre só até ${dm(R.dias[R.ultimo])}; o período de 10 dias foi encurtado.`);
  $('warn').hidden = !w.length; $('warn').textContent = w.join(' ');
  $('fonte').textContent = `Chuva medida até ${hm(D.zonas.Z1.fim_acumulado)} de ${dm(R.hoje)}, previsão ${E.reserva ? '' : 'por conjunto '}${E.modelo}${E.membros > 1 ? ` com ${E.membros} cenários` : ''}, régua de Alberto Flores em ${f(R.h0, 2)} m e vazão de ${f(R.qb, 0)} m³/s, solo ${R.umido ? 'úmido (limites de chuva reduzidos em ' + R.adj + ' mm)' : 'normal'}.`;
  $('h5').textContent = `Próximos 5 dias (até ${dm(d5)})`; $('h10').textContent = `Próximos 10 dias (até ${dm(d10)})`;
  // cartões principais: Atenção (rio sai da calha) e Alerta (edificações atingidas)
  const card = (tit, sub, p) => { const c = classe(p); return `<div class="pb-card" style="border-top-color:${c[2]}"><span>${esc(tit)}</span><b>${pcc(p)}</b><i style="background:${c[2]};color:${c[2] === '#f2c230' ? '#111' : '#fff'}">${c[1]}</i><small>${esc(sub)}</small></div>`; };
  $('head').innerHTML = card(`Rio sai da calha em 5 dias`, `Atenção, régua ≥ ${f(D.limites.AF[0], 1)} m, até ${dm(d5)}`, R.pCota[k5][0]) + card(`Edificações atingidas em 5 dias`, `Alerta, régua ≥ ${f(D.limites.AF[1], 1)} m, até ${dm(d5)}`, R.pCota[k5][1])
    + card(`Rio sai da calha em 10 dias`, `Atenção, régua ≥ ${f(D.limites.AF[0], 1)} m, até ${dm(d10)}`, R.pCota[k10][0]) + card(`Edificações atingidas em 10 dias`, `Alerta, régua ≥ ${f(D.limites.AF[1], 1)} m, até ${dm(d10)}`, R.pCota[k10][1]);
  const c5 = R.chuva[k5], c10 = R.chuva[k10], pico = R.chuva.slice(0, k10 + 1).reduce((a, c, k) => c && (!a || c[1] > a[1][1]) ? [k, c] : a, null);
  $('resumo').textContent = `Até ${dm(d5)}, a probabilidade de a régua de Alberto Flores atingir ${f(D.limites.AF[0], 1)} m (água na planície) é ${classe(R.pCota[k5][0])[1].toLowerCase()}, de ${pct(R.pCota[k5][0])}, e a de atingir ${f(D.limites.AF[1], 1)} m (edificações da beira-rio) é de ${pct(R.pCota[k5][1])}. `
    + `Em 10 dias essas probabilidades são de ${pct(R.pCota[k10][0])} e ${pct(R.pCota[k10][1])}. `
    + (pico ? `A maior chuva de 5 dias prevista na bacia ocorre em ${dm(R.dias[pico[0]])}, com ${f(pico[1][1], 0)} mm no cenário central e ${f(pico[1][2], 0)} mm em 1 a cada 10 cenários, ${pico[1][2] < PMIN ? 'abaixo' : pico[1][1] < PMIN ? 'com o cenário central abaixo, mas os cenários mais chuvosos acima' : 'acima'} dos ${PMIN} mm a partir dos quais houve enchente no histórico.` : '');
  // tabela por nível
  $('tbP').innerHTML = [0, 1, 2, 3].map(i => { const cel = p => { const c = classe(p ?? 0); return `<td class="n"><b>${pcc(p)}</b> <span class="pbc" style="background:${c[2]};color:${c[2] === '#f2c230' ? '#111' : '#fff'}">${c[1]}</span></td>`; };
    return `<tr><td><span class="chip" style="background:${HEX[i + 1]};color:${TXT[i + 1]}">${N[i + 1]}</span><br><small>régua ≥ ${f(D.limites.AF[i], 1)} m</small></td><td>${SIT[i + 1]}</td>${cel(R.pCota[k5][i])}${cel(R.pCota[k10][i])}</tr>`; }).join('')
    + `<tr class="pbr"><td><b>Regra de chuva</b><br><small>aciona Atenção</small></td><td>Chuva de 5 dias no limite de Atenção em duas zonas (gatilho antecipado do estudo)</td><td class="n"><b>${pcc(R.pRegra[k5][0])}</b></td><td class="n"><b>${pcc(R.pRegra[k10][0])}</b></td></tr>`
    + `<tr class="pbr"><td><b>Regra de chuva</b><br><small>aciona Alerta</small></td><td>Chuva de 5 dias no limite de Alerta em duas zonas</td><td class="n"><b>${pcc(R.pRegra[k5][1])}</b></td><td class="n"><b>${pcc(R.pRegra[k10][1])}</b></td></tr>`;
  graficos(R);
}

function graficos(R) {
  const e = C.estreito(), k = R.ultimo, x = R.dias.slice(0, k + 1), xl = x.map((d, i) => i === 0 ? 'Hoje' : dm(d));
  const leg = {orientation: 'h', x: 0, y: -0.16, yanchor: 'top', traceorder: 'normal', font: {size: 12}}, mg = {...PL.margin, b: e ? 110 : 80, r: 16};
  const xa = {...PL.xaxis, type: 'category', tickangle: 0, tickfont: {size: e ? 10 : 12}};
  // probabilidade acumulada
  const lp = [0, 1, 2].map(i => ({type: 'scatter', mode: 'lines+markers', x: xl, y: R.pCota.slice(0, k + 1).map(p => p[i] * 100), name: `Régua atinge ${N[i + 1]} (${f(D.limites.AF[i], 1)} m)`, line: {color: HEX[i + 1], width: 2.5}, marker: {size: 6},
    hovertemplate: `${N[i + 1]}: %{y:.0f}%<extra></extra>`}));
  lp.push({type: 'scatter', mode: 'lines', x: xl, y: R.pRegra.slice(0, k + 1).map(p => p[0] * 100), name: 'Regra de chuva aciona Atenção', line: {color: HEX[1], width: 2, dash: 'dash'}, hovertemplate: 'Regra de chuva, Atenção: %{y:.0f}%<extra></extra>'});
  plot('gP', lp, {...PL, margin: mg, xaxis: xa, yaxis: {...PL.yaxis, title: {text: 'Probabilidade acumulada (%)', font: {size: 11}}, range: [0, 100], ticksuffix: '%'}, showlegend: true, legend: leg}, CFG, 'Probabilidade acumulada por dia.');
  // cota provável
  const L = D.limites.AF, cq = R.cota.slice(0, k + 1), top = Math.max(12, ...cq.map(c => c[2] + 1));
  plot('gH', [
    {type: 'scatter', mode: 'lines', x: xl, y: cq.map(c => c[2]), line: {width: 0}, hoverinfo: 'skip', showlegend: false},
    {type: 'scatter', mode: 'lines', x: xl, y: cq.map(c => c[0]), fill: 'tonexty', fillcolor: 'rgba(31,111,178,.18)', line: {width: 0}, name: 'Faixa provável (80% dos cenários, P10 a P90)', hovertemplate: 'P10 a P90: %{y:.2f} m<extra></extra>'},
    {type: 'scatter', mode: 'lines', x: xl, y: cq.map(c => c[1]), name: 'Cenário central (P50)', line: {color: '#1f5fbf', width: 3, dash: 'dash'}, hovertemplate: 'P50: %{y:.2f} m<extra></extra>'},
    ...L.map((v, i) => ({type: 'scatter', mode: 'lines', x: [xl[0], xl[xl.length - 1]], y: [v, v], name: `${N[i + 1]} (${f(v, 1)} m)`, line: {color: HEX[i + 1], width: 1.5, dash: 'dot'}, hoverinfo: 'skip'}))],
    {...PL, margin: mg, xaxis: xa, yaxis: {...PL.yaxis, title: {text: 'Cota na régua de Alberto Flores (m)', font: {size: 11}}, range: [0, top], ticksuffix: ' m'}, showlegend: true, legend: leg, hovermode: 'x unified'}, CFG, 'Cota provável por dia.');
  // chuva de 5 dias na bacia
  const cc = R.chuva.slice(0, k + 1), topc = Math.max(PMIN * 1.3, ...cc.map(c => c[2] * 1.1));
  plot('gC', [
    {type: 'scatter', mode: 'lines', x: xl, y: cc.map(c => c[2]), line: {width: 0}, hoverinfo: 'skip', showlegend: false},
    {type: 'scatter', mode: 'lines', x: xl, y: cc.map(c => c[0]), fill: 'tonexty', fillcolor: 'rgba(31,111,178,.18)', line: {width: 0}, name: 'Faixa provável (P10 a P90)', hovertemplate: 'P10 a P90: %{y:.0f} mm<extra></extra>'},
    {type: 'scatter', mode: 'lines', x: xl, y: cc.map(c => c[1]), name: 'Cenário central (P50)', line: {color: '#1f5fbf', width: 3, dash: 'dash'}, hovertemplate: 'P50: %{y:.0f} mm<extra></extra>'},
    {type: 'scatter', mode: 'lines', x: [xl[0], xl[xl.length - 1]], y: [PMIN, PMIN], name: `${PMIN} mm: abaixo disso não houve enchente registrada`, line: {color: '#8e1537', width: 1.5, dash: 'dot'}, hoverinfo: 'skip'}],
    {...PL, margin: mg, xaxis: xa, yaxis: {...PL.yaxis, title: {text: 'Chuva média de 5 dias na bacia (mm)', font: {size: 11}}, range: [0, topc], ticksuffix: ' mm'}, showlegend: true, legend: leg, hovermode: 'x unified'}, CFG, 'Chuva de 5 dias prevista.');
}

function status() {
  $('upd').textContent = D.ao_vivo && D.ao_vivo.ok ? `Ao vivo · verificado às ${hm(D.verificado)}` : `Última coleta ${dtf(D.coleta)}`;
  $('dot').className = 'dot' + (falhaE || C.idade(D.coleta) > 1 && !(D.ao_vivo && D.ao_vivo.ok) ? ' old' : '');
}
async function load(forcar) {
  if (busy) return; busy = true;
  try {
    const BASE = await C.json('data.json'); D = AoVivo.reavaliar(BASE, BASE); status();
    if (forcar) try { sessionStorage.clear(); } catch (e) { /* sem cache */ }
    try { E = await conjunto(D.zonas.Z1.fim_acumulado); falhaE = null; }
    catch (e) { falhaE = e.message; let u = null; try { u = JSON.parse(localStorage.getItem('ens:ultimo')); } catch (x) { /* sem cache */ }
      E = u && (Date.now() - Date.parse(u.obtido)) < 36 * 36e5 ? u : deterministico(D); }
    status(); render();
    try { D = await AoVivo.atualizar(BASE); status(); render(); } catch (e) { console.error(e); }
  } catch (e) { $('warn').hidden = false; $('warn').textContent = `Não foi possível carregar os dados (${e.message}).`; $('upd').textContent = 'Sem dados'; }
  busy = false;
}
(async () => {
  try { H = await C.json('historico.json'); } catch (e) { $('warn').hidden = false; $('warn').textContent = `Não foi possível carregar o histórico do estudo (${e.message}).`; return; }
  $('btnUpd').addEventListener('click', () => load(true));
  await load(false); setInterval(() => load(false), 30 * 60e3);
})();
})();
