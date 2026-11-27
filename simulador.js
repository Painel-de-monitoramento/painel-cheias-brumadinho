// Simulador e tendências. Abre com o último snapshot imediatamente e atualiza a telemetria ao vivo em segundo plano.
// Regras: chuva observada ausente nunca vira zero (o cálculo fica bloqueado até preenchimento manual identificado);
// umidade do solo pela mesma regra do motor (Motor.solo); valores históricos exatos, sem truncagem pelos controles;
// cenários automáticos acompanham a atualização dos dados, entradas manuais nunca são sobrescritas.
(() => {
const {HEX, TXT, CINZA, esc, f, dtf, hm, idh, PL, CFG, plot} = C;
const N = ['Normal', 'Atenção', 'Alerta', 'Alerta máximo', 'Emergência'];
const SIT = ['Sem risco de inundação', 'Água na planície e nas áreas baixas da beira-rio', 'Edificações da beira-rio atingidas', 'Centro alagado (referência 2012)', 'Nível de 2022 ou superior'];
const ZS = ['Z1', 'Z2', 'Z3'], $ = id => document.getElementById(id);
let D = null, BASE = null, H = null, MODO = 'atual', CEN = null, busy = false, falha = null, pendente = false;
const nivel = (v, l) => l.reduce((k, t, i) => v != null && v >= t ? i + 1 : k, 0);
const val = id => { const x = $(id).value.trim(); if (x === '') return null; const v = +x.replace(',', '.'); return Number.isFinite(v) && v >= 0 ? v : null; };
function interp(x, X, Y, logx) { const g = v => logx ? Math.log(v) : v; if (x <= X[0]) return Y[0]; for (let i = 1; i < X.length; i++) if (x <= X[i]) { const t = (g(x) - g(X[i - 1])) / (g(X[i]) - g(X[i - 1])); return Y[i - 1] + t * (Y[i] - Y[i - 1]); } const n = X.length - 1; return Y[n] + (g(x) - g(X[n])) * (Y[n] - Y[n - 1]) / (g(X[n]) - g(X[n - 1])); }
const cota = Q => interp(Q, H.curva.Q, H.curva.h, true);
function trEq(Q) { const T = H.tr; if (Q < T.Q[0]) return '< 2 anos'; if (Q > T.Q[T.Q.length - 1]) return `> ${T.TR[T.TR.length - 1]} anos (fora da curva)`; return `${f(Math.exp(interp(Q, T.Q, T.TR.map(Math.log), true)), 0)} anos`; }
function lines(lims, u) { return {shapes: lims.map((v, i) => ({type: 'line', xref: 'paper', x0: 0, x1: 1, y0: v, y1: v, line: {color: HEX[i + 1], width: 1.5, dash: 'dot'}})), annotations: lims.map((v, i) => ({xref: 'paper', x: 1, y: v, xanchor: 'right', yanchor: 'bottom', text: `${N[i + 1]} ${f(v, 1)} ${u}`, showarrow: false, font: {size: 11, color: HEX[i + 1]}}))}; }

// campo numérico e controle deslizante sincronizados; o deslizante amplia o alcance para mostrar valores maiores, sem truncar
function par(idNum, idRange) {
  const n = $(idNum), r = $(idRange);
  r.addEventListener('input', () => { n.value = r.value; manual(); sim(); });
  n.addEventListener('input', () => { const v = val(idNum); if (v != null) { if (v > +r.max) r.max = Math.ceil(v); r.value = v; } manual(); sim(); });
}
const setPar = (idNum, idRange, v) => { $(idNum).value = v == null ? '' : +(+v).toFixed(1); const r = $(idRange); if (v != null) { if (v > +r.max) r.max = Math.ceil(v); r.value = v; } };
function manual() { if (MODO !== 'manual') { MODO = 'manual'; CEN = null; setScen(null); modo(); } }
const setScen = t => { const e = $('scen'); e.hidden = !t; e.textContent = t ? `Cenário carregado: enchente de ${t}` : ''; };
function modo() {
  $('modo').textContent = MODO === 'manual' ? `Entradas manuais: não são alteradas pelas atualizações automáticas.${pendente ? ' As condições atuais mudaram desde que você editou; use "Recarregar condições atuais" para aplicá-las.' : ''}`
    : MODO === 'evento' ? 'Enchente histórica carregada com os valores exatos do evento.' : `Cenário automático (${MODO === 'atual' ? 'situação atual com previsão' : 'somente chuva observada'}), atualizado a cada 5 minutos com os dados mais recentes.`;
}

function sim() {
  if (!D || !H) return;
  const Z = D.zonas, M = H.modelo, obs = $('obs').checked, qb = val('qb');
  const P = {}, falta = [];
  for (const z of ZS) {
    const a = val('a' + z) ?? 0, base = Z[z].P5, man = val('o' + z + 'm');
    // chuva observada ausente: bloqueia o cálculo automático e pede preenchimento manual identificado (P5 = 0 continua válido)
    const semObs = obs && MODO !== 'evento' && base == null;
    $('m' + z).hidden = !semObs;
    const o = !obs ? 0 : base != null ? base : man;
    if (obs && o == null) falta.push(z);
    P[z] = o == null ? null : o + a;
    $('s' + z).textContent = P[z] == null ? 'Chuva observada indisponível: informe o valor abaixo para simular.' :
      `Total em 5 dias: ${f(P[z], 0)} mm${obs ? ` (observado ${f(o, 0)} mm${base == null ? ', informado manualmente' : Z[z].cob5_medida != null ? `, ${Math.round(Z[z].cob5_medida * 100)}% medido` : ''})` : ''}`;
  }
  // umidade do solo: mesma regra do motor do painel
  const qo = val('qo'), p30 = val('p30');
  const S = Motor.solo({areas: M.areas, af: {q_ontem: qo, q_ontem_cobertura: qo == null ? 0 : 1}, zonas: Object.fromEntries(ZS.map(z => [z, {P30: p30, cob30: p30 == null ? 0 : 1}]))});
  $('solo').textContent = `Solo ${S.estado === 'umido' ? 'úmido' : S.estado}: ${S.criterio}.${S.estado === 'indeterminado' ? ' O resultado mostra o cenário de solo normal e o de solo úmido; o maior prevalece.' : ''}`;
  $('sqo').textContent = MODO === 'evento' ? 'No evento histórico, igual à vazão de base (aproximação; a série do dia anterior não está no histórico).' : 'Do painel: média horária do dia anterior. Acima de 90 m³/s o solo é úmido.';
  const r = $('res');
  if (falta.length || qb == null || qb <= 0) {
    r.style.background = CINZA; r.style.color = '#fff'; $('rN').textContent = 'Simulação incompleta';
    $('rT').textContent = falta.length ? `Falta a chuva observada de ${falta.join(', ')}. Informe o valor ou desmarque a soma da chuva observada.` : 'Informe a vazão de base.';
    $('rG').innerHTML = ''; $('rSvg').innerHTML = ''; plot('bvSim', [], PL, CFG); $('rNote').textContent = ''; return;
  }
  let num = 0, den = 0; for (const z of ZS) { num += P[z] * M.areas[z]; den += M.areas[z]; }
  const Pb = num / den, lq = M.a + M.b * Pb + M.c * Math.log(qb), Q = Math.exp(lq), Q10 = Math.exp(lq - 1.2816 * M.s), Q90 = Math.exp(lq + 1.2816 * M.s);
  const h = cota(Q), h10 = cota(Q10), h90 = cota(Q90);
  const B = M.bv, sb = Math.hypot(B.s, B.b * M.s), lb = B.a + B.b * lq, Qbv = Math.exp(lb), Qbv10 = Math.exp(lb - 1.2816 * sb), Qbv90 = Math.exp(lb + 1.2816 * sb), Lbv = nivel(Qbv, D.limites.BV);
  const chuvaNivel = adj => { const lz = ZS.map(z => nivel(P[z], D.limites[z].map(t => t - adj))).sort((a, b) => b - a); return Math.max(lz[1], Math.max(lz[0] - 1, 0)); };
  const LchN = chuvaNivel(0), LchU = chuvaNivel(D.ajuste_umido || 30), Lch = S.estado === 'umido' ? LchU : S.estado === 'normal' ? LchN : Math.max(LchN, LchU);
  const Lr = nivel(h, D.limites.AF), Lr90 = nivel(h90, D.limites.AF), n = Math.max(Lch, Lr, Lbv);
  const near0 = H.eventos.reduce((a, e) => Math.abs(Math.log(e.Q / Q)) < Math.abs(Math.log(a.Q / Q)) ? e : a), near = Math.abs(Math.log(near0.Q / Q)) < 0.35 ? near0 : null;
  r.style.background = HEX[n]; r.style.color = TXT[n]; $('rN').textContent = N[n];
  $('rT').textContent = `${SIT[n]}.${S.estado === 'indeterminado' && LchU > LchN ? ` Com solo úmido a chuva indicaria ${N[LchU]}.` : ''}`;
  $('rG').innerHTML = [['Pico em Alberto Flores', `${f(Q, 0)} m³/s`, `P10 a P90: ${f(Q10, 0)} a ${f(Q90, 0)}`], ['Cota na régua (P50)', `${f(h, 2)} m`, `P10 a P90: ${f(h10, 1)} a ${f(h90, 1)} m`], ['Tempo de retorno', trEq(Q), 'da vazão de pico (P50)'],
    ['Nível pela chuva', N[Lch], `chuva média na bacia ${f(Pb, 0)} mm`], ['Nível pela régua', N[Lr], `com P90, ${N[Lr90]}`], ['Vazão em Belo Vale', `${f(Qbv, 0)} m³/s`, `P10 a P90: ${f(Qbv10, 0)} a ${f(Qbv90, 0)}, ${N[Lbv]}`],
    ['Enchente mais parecida', near ? near.rot : 'Nenhuma', near ? `${f(near.cota, 2)} m, ${f(near.Q, 0)} m³/s` : (Q < near0.Q ? 'abaixo das enchentes registradas' : 'acima das enchentes registradas')]]
    .map(([a, b, c]) => `<div>${esc(a)}<b>${esc(b)}</b>${esc(c)}</div>`).join('');
  // domínio de validade: calibração com chuva média de 100 a 300 mm e vazão de base de 26 a 176 m³/s; curva observada até 1.717 m³/s
  const av = [], Pmax = Math.max(...H.eventos.map(e => e.P5.bacia)), qbr = [Math.min(...H.eventos.map(e => e.Qbase)), Math.max(...H.eventos.map(e => e.Qbase))], Qobs = Math.max(...H.eventos.map(e => e.Q));
  if (Pb < 100) av.push('chuva média abaixo de 100 mm, fora da faixa de calibração (eventos com 100 mm ou mais)');
  if (Pb > Pmax) av.push(`chuva média de ${f(Pb, 0)} mm acima da maior dos eventos de calibração (${f(Pmax, 0)} mm): extrapolação`);
  if (qb < qbr[0] || qb > qbr[1]) av.push(`vazão de base fora da faixa dos eventos (${qbr[0]} a ${qbr[1]} m³/s): extrapolação`);
  if (Q90 > Qobs) av.push(`vazão acima da maior cheia observada (${f(Qobs, 0)} m³/s em 1997): a cota vem da extrapolação da curva da régua`);
  if (Q90 > H.curva.Q[H.curva.Q.length - 1]) av.push('vazão além do fim da curva da régua: cota extrapolada linearmente');
  $('rNote').textContent = (av.length ? 'Atenção ao domínio do modelo: ' + av.join('; ') + '. ' : '') + 'P50 é o valor central; P10 e P90 delimitam o intervalo de 80% do modelo (erro padrão de 0,29 em ln Q), e não uma probabilidade calibrada de inundação. O simulador não substitui o acompanhamento da régua e de Belo Vale.';
  regua(h, h10, h90, n, Q90 > Qobs); bvbar(Qbv, Qbv10, Qbv90, Lbv);
  const ev = [...H.eventos].sort((a, b) => a.cota - b.cota), xs = [...ev.map(e => e.rot), 'Simulado'], ix = xs.map((_, i) => i), ns = ev.length, est = C.estreito();
  plot('gCmp', [
    {type: 'bar', x: ix.slice(0, ns), y: ev.map(e => e.cota), name: 'Cota máxima de cada enchente registrada (cor do nível atingido)', marker: {color: ev.map(e => HEX[nivel(e.cota, D.limites.AF)])}, text: ev.map(e => f(e.cota, 2) + ' m'), textposition: 'outside', cliponaxis: false, hovertemplate: '%{customdata}: %{y:.2f} m<extra></extra>', customdata: ev.map(e => e.rot)},
    {type: 'scatter', mode: 'lines', x: [ns - 0.4, ns + 0.4, ns + 0.4, ns - 0.4, ns - 0.4], y: [h10, h10, h90, h90, h10], fill: 'toself', fillcolor: 'rgba(31,111,178,.25)', line: {width: 0}, name: 'Faixa provável do cenário simulado (P10 a P90)', hovertemplate: `P10 a P90: ${f(h10, 2)} a ${f(h90, 2)} m<extra></extra>`},
    {type: 'bar', x: [ns], y: [h], name: 'Cota simulada (P50)', marker: {color: '#1f5fbf'}, width: [0.5], text: [f(h, 2) + ' m'], textposition: 'outside', cliponaxis: false, hovertemplate: `Simulado: ${f(h, 2)} m<extra></extra>`}],
    {...PL, margin: {...PL.margin, b: est ? 150 : 110}, barmode: 'overlay', xaxis: {...PL.xaxis, tickmode: 'array', tickvals: ix, ticktext: xs, tickangle: est ? -60 : 0, range: [-0.6, ns + 0.6]}, yaxis: {...PL.yaxis, title: {text: 'Cota máxima na régua (m)', font: {size: 11}}, range: [0, Math.max(13, h90 + 1)]}, ...lines(D.limites.AF, 'm'), showlegend: true, legend: {orientation: 'h', x: 0, y: est ? -0.35 : -0.14, yanchor: 'top', font: {size: 12}}}, CFG, `Cota simulada ${f(h, 2)} m.`);
}

// régua simulada com escala dinâmica: nenhuma cota é truncada; acima da maior cheia observada a faixa é marcada como extrapolação
function regua(h, h10, h90, n, extrap) {
  const L = D.limites.AF, top = Math.max(13, Math.ceil(h90 + 1)), H0 = 300, W = 230, y = v => 20 + (1 - v / top) * H0, x0 = 70, w = 46;
  const bands = [0, ...L, top].map((v, i, a) => i < a.length - 1 ? `<rect x="${x0}" y="${y(a[i + 1])}" width="${w}" height="${y(v) - y(a[i + 1])}" fill="${HEX[i]}" opacity=".85"/>` : '').join('');
  const passo = top > 20 ? 2 : 1; let ticks = ''; for (let v = 0; v <= top; v += passo) ticks += `<line x1="${x0 + w}" x2="${x0 + w + (v % 2 ? 5 : 8)}" y1="${y(v)}" y2="${y(v)}" stroke="#555"/><text x="${x0 - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#555">${v}</text>`;
  const ext = extrap ? `<rect x="${x0 - 4}" y="${y(top)}" width="${w + 8}" height="${y(11.75) - y(top)}" fill="url(#hx)" opacity=".5"/>` : '';
  const wl = `<rect x="${x0 - 4}" y="${y(h90)}" width="${w + 8}" height="${Math.max(2, y(h10) - y(h90))}" fill="#1f6fb2" opacity=".35"/><line x1="${x0 - 8}" x2="${x0 + w + 8}" y1="${y(h)}" y2="${y(h)}" stroke="#111" stroke-width="1.5"/><polygon points="${x0 + w + 9},${y(h)} ${x0 + w + 16},${y(h) - 4} ${x0 + w + 16},${y(h) + 4}" fill="#111"/>`;
  const faixas = [0, ...L, null].slice(0, 5).map((v, i) => `<span><i style="background:${HEX[i]}"></i>${N[i]} ${i < 4 ? `(${f(v, 1)} a ${f(L[i], 1)} m)` : `(acima de ${f(L[3], 1)} m)`}</span>`).join('');
  $('rSvg').innerHTML = `<svg viewBox="0 0 ${W} ${H0 + 40}" style="width:100%;max-width:260px;display:block;margin:auto" role="img" aria-label="Régua simulada com cota ${f(h, 2)} metros"><defs><pattern id="hx" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#8e1537" stroke-width="2"/></pattern></defs>${bands}${ext}${ticks}${wl}<text x="${x0 + w + 20}" y="${y(h) + 5}" font-size="15" font-weight="700" fill="#111">${f(h, 2)} m</text></svg>
    <div class="leg legsim"><span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" stroke="#111" stroke-width="1.5"/></svg>Cota simulada (P50), não é medição</span><span><i style="background:#1f6fb2;opacity:.45"></i>Faixa provável, P10 a P90 (intervalo de 80%)</span>${faixas}${extrap ? '<span><i class="hach2"></i>Acima da maior cheia observada: extrapolação</span>' : ''}</div>`;
}
function bvbar(q, q10, q90, l) {
  const L = D.limites.BV, mx = Math.max(1400, q90 * 1.1), e = C.estreito();
  plot('bvSim', [
    {type: 'bar', x: [0], y: [q], name: `Vazão de pico simulada (P50): ${f(q, 0)} m³/s`, marker: {color: HEX[l]}, width: [0.5], hovertemplate: `P50: ${f(q, 0)} m³/s<extra></extra>`},
    {type: 'scatter', mode: 'lines', x: [-0.4, 0.4, 0.4, -0.4, -0.4], y: [q10, q10, q90, q90, q10], fill: 'toself', fillcolor: 'rgba(31,111,178,.28)', line: {width: 0}, name: `Faixa provável (P10 a P90): ${f(q10, 0)} a ${f(q90, 0)} m³/s`, hovertemplate: `P10 a P90: ${f(q10, 0)} a ${f(q90, 0)} m³/s<extra></extra>`}],
    {...PL, hovermode: 'closest', margin: {l: 56, r: e ? 96 : 120, t: 10, b: 90}, xaxis: {...PL.xaxis, range: [-0.8, 0.8], tickvals: [0], ticktext: ['Belo Vale']}, yaxis: {...PL.yaxis, title: {text: 'Vazão de pico (m³/s)', font: {size: 11}}, range: [0, mx]}, shapes: lines(L, '').shapes,
      annotations: L.map((v, i) => ({xref: 'paper', x: 1.02, y: v, xanchor: 'left', yanchor: 'middle', text: `${N[i + 1]} ${f(v, 0)}`, showarrow: false, font: {size: e ? 10 : 11, color: '#111'}})), showlegend: true, legend: {orientation: 'h', x: 0, y: -0.12, yanchor: 'top', font: {size: 12}}}, CFG,
    `Vazão simulada em Belo Vale ${f(q, 0)} m³/s.`);
}

// cenários: atual e somente observado acompanham os dados; evento histórico usa valores exatos
function preset(p) {
  const Z = D.zonas; pendente = false;
  if (p === 'atual' || p === 'zero') {
    MODO = p; CEN = null; setScen(null); $('obs').checked = true;
    for (const z of ZS) { setPar('a' + z, 'r' + z, p === 'atual' ? (Z[z].prev72 ?? 0) : 0); $('o' + z + 'm').value = ''; }
    setPar('qb', 'rqb', D.af.q ?? null); $('qo').value = D.solo.af_q_ontem ?? ''; $('p30').value = D.solo.p30_bacia ?? '';
    if (p === 'atual' && ZS.some(z => Z[z].prev72 == null)) $('rNote').textContent = 'Previsão de 72 h indisponível em alguma zona; a chuva adicional dessa zona ficou em zero e deve ser informada.';
  } else {
    const e = H.eventos[+p]; MODO = 'evento'; CEN = e.rot; setScen(e.rot); $('obs').checked = false;
    for (const z of ZS) setPar('a' + z, 'r' + z, e.P5[z]);
    setPar('qb', 'rqb', e.Qbase); $('qo').value = e.Qbase; $('p30').value = '';
  }
  modo(); sim();
}

function trend() {
  const s = D.af.serie || [], L = D.limites.AF, h0 = D.af.h;
  if (!s.length || h0 == null) { $('tG').innerHTML = '<div>Sem série da régua disponível</div>'; plot('gTr', [], PL, CFG, 'Sem dados.'); return; }
  const T = C.tendencia(s, 6, 12), u = s[s.length - 1], t0 = C.ms(u[0]), ant = h => { let b = null; for (const p of s) if (C.ms(p[0]) <= t0 - h * 36e5 && p[1] != null) b = p; return b && t0 - C.ms(b[0]) <= (h + 2) * 36e5 ? b[1] : null; };
  const v6 = ant(6), v24 = ant(24), d6 = v6 == null ? null : (h0 - v6) * 100, d24 = v24 == null ? null : (h0 - v24) * 100;
  const sub = H.eventos.map(e => { const a = e.serie.find(r => r[0] === -1), b = e.serie.find(r => r[0] === 0); return a && b ? b[1] - a[1] : null; }).filter(v => v != null).sort((a, b) => a - b);
  const med = sub[Math.floor(sub.length / 2)], prox = L.findIndex(t => t > h0);
  let alvo = 'Todos os níveis já atingidos';
  if (prox >= 0 && T) { const k = T.hi.findIndex(v => v >= L[prox]), kc = T.c.findIndex(v => v >= L[prox]);
    alvo = kc > 0 ? `Atinge ${N[prox + 1]} em cerca de ${kc} h` : k > 0 ? `Pode atingir ${N[prox + 1]} em ${k} h ou mais` : `Não atinge ${N[prox + 1]} (${f(L[prox], 1)} m) em 12 h`; }
  const sg = v => v == null ? 'sem dado' : (v >= 0 ? '+' : '') + f(v, 0) + ' cm';
  $('tG').innerHTML = [
    `Cota agora<b>${f(h0, 2)} m</b>${esc('medida ' + idh(C.idade(D.af.h_t || D.af.t)))}`,
    `Variação em 6 h<b>${sg(d6)}</b>${T ? esc(`ritmo de ${T.taxa_h >= 0 ? '+' : ''}${f(T.taxa_h * 100, 1)} cm/h`) : ''}`,
    `Variação em 24 h<b>${sg(d24)}</b>${esc(`nas enchentes, o último dia antes do pico subiu de ${f(sub[0], 1)} a ${f(sub[sub.length - 1], 1)} m (mediana ${f(med, 1)} m)`)}`,
    `Projeção para 12 h<b>${T ? f(T.c[12], 2) + ' m' : 'sem dado'}</b>${T ? esc(`${alvo}; faixa provável de ${f(T.lo[12], 2)} a ${f(T.hi[12], 2)} m`) : ''}`].map(x => `<div>${x}</div>`).join('');
  const ini = new Date(t0 - 72 * 36e5 - 3 * 36e5).toISOString().slice(0, 16), sr = s.filter(p => p[0] >= ini), fim = T ? T.t1 : u[0], top = Math.max(L[0] + 1, ...sr.map(p => p[1] ?? 0), ...(T ? T.hi : [])) * 1.08, e = C.estreito();
  plot('gTr', [{type: 'scatter', mode: 'lines', x: sr.map(p => p[0]), y: sr.map(p => p[1]), name: 'Cota medida (últimos 3 dias)', line: {color: '#1f6fb2', width: 2}, hovertemplate: '%{y:.2f} m<extra></extra>'},
    ...C.trTraces(T, 'Projeção pela tendência das últimas 6 h', 'm', 2)],
    {...PL, margin: {...PL.margin, b: e ? 120 : 90}, hovermode: 'x unified', xaxis: {...PL.xaxis, type: 'date', tickformat: '%d/%m %Hh', range: [ini, fim], nticks: e ? 4 : 8},
      yaxis: {...PL.yaxis, title: {text: 'Cota na régua (m)', font: {size: 11}}, range: [0, top]}, ...lines(L.filter(t => t <= top), 'm'), showlegend: true, legend: {orientation: 'h', x: 0, y: -0.14, yanchor: 'top', traceorder: 'normal', font: {size: 12}}}, CFG, `Cota atual ${f(h0, 2)} m.`);
}
function chuva() {
  const cats = ['Atual', ...H.eventos.map(e => e.rot)];
  plot('gCh', ZS.map((z, i) => ({type: 'bar', name: z, x: cats, y: [D.zonas[z].P5, ...H.eventos.map(e => e.P5[z])], marker: {color: ['#1f6fb2', '#5aa0d6', '#9cc3e6'][i]}, hovertemplate: `${z}: %{y:.0f} mm<extra></extra>`})),
    {...PL, margin: {...PL.margin, b: 60}, xaxis: {...PL.xaxis, type: 'category', tickangle: C.estreito() ? -60 : 0}, barmode: 'group', yaxis: {...PL.yaxis, title: {text: 'Chuva de 5 dias (mm)', font: {size: 11}}}, showlegend: true, legend: {orientation: 'h', y: 1.08}}, CFG, 'Chuva atual e das enchentes.');
}
function status() {
  const col = D.coleta || D.atualizado;
  $('upd').textContent = falha ? `Falha ao atualizar (${falha}) · dados de ${dtf(col)}` : D.ao_vivo ? `Dados ao vivo verificados às ${hm(D.verificado)} · régua ${idh(C.idade(D.af.h_t || D.af.t))}` : `Dados de ${dtf(col)} · conectando à telemetria`;
  $('dot').className = 'dot' + (falha || C.idade(D.af.h_t || D.af.t) > 3 ? ' old' : '');
  const w = $('warn'), m = [];
  if (D.nivel?.status === 'indeterminado') m.push('Os dados atuais estão incompletos; a simulação a partir da situação atual deve ser lida com cautela.');
  if (C.idade(D.af.h_t || D.af.t) > 3) m.push(`A última leitura da régua tem ${f(C.idade(D.af.h_t || D.af.t), 1)} horas.`);
  w.hidden = !m.length; w.textContent = m.join(' ');
}
// aplica dados novos: cenário automático é recalculado; manual ou evento é preservado
function aplicar(novo, primeira) {
  const mudou = !D || (novo.verificado || novo.coleta) !== (D.verificado || D.coleta); D = novo; status();
  if (primeira) { preset('atual'); }
  else if (MODO === 'atual' || MODO === 'zero') preset(MODO);
  else { if (mudou) pendente = true; modo(); sim(); }
  trend(); chuva();
}
async function load(primeira) {
  if (busy) return; busy = true;
  try { BASE = await C.snapshot(); falha = null; aplicar(AoVivo.reavaliar(BASE, BASE), primeira && !D); }
  catch (e) { falha = e.message; if (D) status(); else { $('warn').hidden = false; $('warn').textContent = `Não foi possível carregar os dados (${e.message}).`; $('upd').textContent = 'Sem dados'; } busy = false; return; }
  busy = false;
  // telemetria ao vivo em segundo plano: a página já está utilizável com o snapshot
  try { const v = await AoVivo.atualizar(BASE); aplicar(v, false); } catch (e) { console.error(e); falha = 'telemetria ao vivo: ' + e.message; status(); }
}
(async () => {
  try { H = await C.json('historico.json'); } catch (e) { $('warn').hidden = false; $('warn').textContent = `Não foi possível carregar o histórico das enchentes (${e.message}).`; return; }
  $('presetsH').innerHTML = H.eventos.map((e, i) => `<button type="button" data-p="${i}">${esc(e.rot)} · ${f(e.cota, 2)} m</button>`).join('');
  for (const b of document.querySelectorAll('[data-p]')) b.addEventListener('click', () => { preset(b.dataset.p); $('res').scrollIntoView({behavior: 'smooth', block: 'center'}); });
  for (const z of ZS) { par('a' + z, 'r' + z); $('o' + z + 'm').addEventListener('input', () => { manual(); sim(); }); }
  par('qb', 'rqb');
  for (const id of ['qo', 'p30', 'obs']) $(id).addEventListener('input', () => { manual(); sim(); });
  $('btnRec').addEventListener('click', () => { preset('atual'); load(false); });
  await load(true);
  setInterval(() => load(false), 5 * 60e3);
  setInterval(() => { if (D && BASE && !busy) { D = AoVivo.reavaliar(D, BASE); status(); } }, 60e3);
})();
})();
