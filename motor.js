// Motor de decisão único dos níveis de controle (RT-BRU-HID-001 Rev04, seções 10.3 e 10.4).
// A mesma lógica existe em motor.py (coletor). O teste de paridade (testes/paridade.py) roda os dois sobre os mesmos casos.
// Entradas ausentes são null, nunca zero. Dado parcial acima do limite aciona; dado insuficiente gera estado indeterminado.
(function (root) {
  const IDADE_MAX_H = 3, COB_OK = 0.9, COB_Q_ONTEM = 0.5, HORAS_DESCIDA = 12, TOL_DESCIDA = 0.005;
  const NOMES = {AF: 'Régua de Alberto Flores', BV: 'Vazão em Belo Vale', R2: 'Chuva em duas zonas', R1: 'Chuva em uma zona (pré-aviso)'};
  const ZS = ['Z1', 'Z2', 'Z3'];
  const ms = s => Date.parse(String(s).slice(0, 16) + ':00Z');
  const nivel = (v, l) => { let k = 0; if (v == null) return 0; l.forEach((t, i) => { if (v >= t) k = i + 1; }); return k; };
  const r1 = v => v == null ? null : Math.round(v * 10) / 10;

  function idade(t, agora) { return t ? (ms(agora) - ms(t)) / 36e5 : null; }

  // horas de descida contínua da régua até a última leitura horária, sem lacunas
  function descida(serie) {
    if (!serie || serie.length < 2) return 0;
    let n = serie.length - 1, h = 0;
    while (n > 0) {
      const dt = (ms(serie[n][0]) - ms(serie[n - 1][0])) / 36e5;
      if (Math.abs(dt - 1) > 0.01 || serie[n][1] == null || serie[n - 1][1] == null) break;
      if (serie[n][1] - serie[n - 1][1] > TOL_DESCIDA) break;
      h += 1; n -= 1;
    }
    const ini = serie[serie.length - 1 - h], fim = serie[serie.length - 1];
    return h > 0 && fim[1] < ini[1] ? h : 0;
  }

  function solo(inp) {
    const L = inp.limites_umidade || {q: 90, p30: 370}, af = inp.af || {};
    const qv = af.q_ontem != null && (af.q_ontem_cobertura ?? 1) >= COB_Q_ONTEM ? af.q_ontem : null;
    let num = 0, den = 0, cobOk = true, falta = false;
    for (const z of ZS) {
      const Z = (inp.zonas || {})[z] || {}, a = inp.areas[z];
      if (Z.P30 == null) { falta = true; continue; }
      num += a * Z.P30; den += a; if ((Z.cob30 ?? 0) < COB_OK) cobOk = false;
    }
    const tot = ZS.reduce((s, z) => s + inp.areas[z], 0);
    const p30 = falta ? null : num / tot;           // média ponderada pela área (1337·Z1 + 1428·Z2 + 1193·Z3) / 3958
    const p30valido = p30 != null && cobOk;
    let estado, criterio;
    if (qv != null && qv > L.q) { estado = 'umido'; criterio = `vazão média de ontem em Alberto Flores ${r1(qv)} m³/s acima de ${L.q}`; }
    else if (p30 != null && p30 > L.p30) { estado = 'umido'; criterio = `chuva de 30 dias na bacia ${r1(p30)} mm acima de ${L.p30}`; }
    else if (qv != null && p30valido) { estado = 'normal'; criterio = 'vazão de ontem e chuva de 30 dias abaixo dos critérios'; }
    else { estado = 'indeterminado'; criterio = qv == null ? 'sem vazão média de ontem em Alberto Flores' : 'chuva de 30 dias incompleta'; }
    return {estado, umido: estado === 'umido', af_q_ontem: r1(qv), p30_bacia: r1(p30), p30_completa: p30valido, criterio};
  }

  function decidir(inp) {
    const L = inp.limites, agora = inp.agora, S = solo(inp), adj = S.umido ? inp.ajuste_umido : 0;
    const ind = [];
    // rio
    const iaf = idade(inp.af && inp.af.t, agora), ibv = idade(inp.bv && inp.bv.t, agora);
    const afOk = inp.af && inp.af.h != null && iaf != null && iaf <= IDADE_MAX_H;
    const bvOk = inp.bv && inp.bv.q != null && ibv != null && ibv <= IDADE_MAX_H;
    ind.push({id: 'AF', nome: NOMES.AF, nivel: afOk ? nivel(inp.af.h, L.AF) : null, estado: afOk ? 'ok' : 'indisponivel', idade_h: r1(iaf)});
    ind.push({id: 'BV', nome: NOMES.BV, nivel: bvOk ? nivel(inp.bv.q, L.BV) : null, estado: bvOk ? 'ok' : 'indisponivel', idade_h: r1(ibv)});
    // chuva por zona
    const zn = {}, zl = {};
    for (const z of ZS) {
      const Z = (inp.zonas || {})[z] || {}, lim = L[z].map(t => t - adj); zl[z] = lim;
      const est = Z.P5 == null || !(Z.cob5 > 0) ? 'indisponivel' : Z.cob5 >= COB_OK ? 'ok' : 'parcial';
      zn[z] = {nivel: est === 'indisponivel' ? null : nivel(Z.P5, lim), estado: est, P5: Z.P5 == null ? null : r1(Z.P5), cob5: Z.cob5 ?? 0};
    }
    const disp = ZS.filter(z => zn[z].estado !== 'indisponivel'), ord = disp.map(z => zn[z].nivel).sort((a, b) => b - a);
    const zOk = ZS.filter(z => zn[z].estado === 'ok').length;
    const R2 = ord.length >= 2 ? ord[1] : null, R1 = ord.length ? Math.max(ord[0] - 1, 0) : null;
    // R2 com uma zona indisponível ainda é limite inferior; com duas indisponíveis não se calcula
    ind.push({id: 'R2', nome: NOMES.R2, nivel: R2, estado: R2 == null ? 'indisponivel' : zOk === 3 ? 'ok' : 'parcial', idade_h: null});
    ind.push({id: 'R1', nome: NOMES.R1, nivel: R1, estado: R1 == null ? 'indisponivel' : zOk === 3 ? 'ok' : 'parcial', idade_h: null});
    const vals = ind.filter(i => i.nivel != null).map(i => i.nivel);
    const bruto = vals.length ? Math.max(...vals) : null;
    const tudoOk = ind.every(i => i.estado === 'ok');
    let status;
    if (bruto == null) status = 'indeterminado';
    else if (bruto === 0 && (!afOk || !bvOk || disp.length < 2)) status = 'indeterminado';
    else status = tudoOk ? 'valido' : 'degradado';
    const causa = bruto ? ind.filter(i => i.nivel === bruto).map(i => i.nome).join(', ') : null;

    // histerese: sobe na hora, desce só com todos os indicadores válidos abaixo e régua descendo 12 h sem lacuna
    const ant = inp.estado_anterior || null, hist = ant && ant.historico ? ant.historico.slice(-99) : [];
    let est = ant ? {nivel: ant.nivel, desde: ant.desde, causa: ant.causa} : null, motivo = null;
    const hDesc = descida(inp.serie_af);
    if (bruto != null && status !== 'indeterminado') {
      if (!est || est.nivel == null) {
        est = {nivel: bruto, desde: agora, causa: causa || 'indicadores abaixo do limite de Atenção'};
        hist.push({t: agora, de: null, para: bruto, causa: est.causa});
      } else if (bruto > est.nivel) {
        hist.push({t: agora, de: est.nivel, para: bruto, causa});
        est = {nivel: bruto, desde: agora, causa};
      } else if (bruto < est.nivel) {
        if (inp.somente_subir) motivo = 'rebaixamento reservado ao coletor';
        else if (!tudoOk) motivo = 'rebaixamento bloqueado: há indicador sem dado válido';
        else if (hDesc < HORAS_DESCIDA) motivo = `rebaixamento aguardando descida contínua da régua por ${HORAS_DESCIDA} h (${hDesc} h até agora)`;
        else {
          const c = `todos os indicadores abaixo do limite e régua em descida há ${hDesc} h`;
          hist.push({t: agora, de: est.nivel, para: bruto, causa: c});
          est = {nivel: bruto, desde: agora, causa: c};
        }
      }
    } else if (est && est.nivel != null) motivo = 'dados insuficientes: mantido o último nível publicado';
    return {
      nivel: est ? est.nivel : null, nivel_bruto: bruto, status, indicadores: ind, zonas: zn, limites_zona: zl, solo: S,
      descida_h: hDesc, motivo_manutencao: motivo,
      estado: est ? {...est, historico: hist} : null
    };
  }
  const api = {decidir, solo, descida, nivel, NOMES};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Motor = api;
})(typeof window !== 'undefined' ? window : globalThis);
