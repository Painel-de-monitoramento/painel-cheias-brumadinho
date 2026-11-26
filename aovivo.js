// Camada ao vivo: lê a telemetria da ANA e a chuva do modelo direto no navegador e recalcula os indicadores
// com o mesmo motor do coletor (motor.js). O navegador só pode elevar o nível publicado pelo coletor, nunca rebaixar.
// Ausência de dado é null, nunca zero.
window.AoVivo = (() => {
  const EST = [['40740000','Z3'],['40710001','Z3'],['40680001','Z2'],['40686000','Z2'],['40700050','Z2'],['40700080','Z2'],
    ['40712500','Z3'],['40712000','Z3'],['40712600','Z3'],['2043133','Z1'],['2043013','Z1']];
  const GRADE = {Z1:[[-20.881,-43.817],[-20.761,-43.697],[-20.641,-43.937],[-20.521,-43.817]],
    Z2:[[-20.851,-44.179],[-20.731,-44.059],[-20.611,-44.179],[-20.611,-43.939]],
    Z3:[[-20.343,-44.299],[-20.223,-44.179],[-20.463,-44.059],[-20.343,-43.939]]};
  const H = 3600e3, cache = {}, falhas = {}; let full = false, om = null, omAt = 0;
  const ms = s => new Date(s.trim().replace(' ', 'T') + (s.trim().length > 16 ? '' : ':00') + '-03:00').getTime();
  const loc = t => new Date(t - 3 * H).toISOString().slice(0, 16);
  const dmy = t => { const d = new Date(t - 3 * H); return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`; };
  const dayStart = t => { const d = new Date(t - 3 * H); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 3 * H; };
  const fl = h => Math.floor(h / H) * H;
  const r1 = v => v == null ? null : Math.round(v * 10) / 10;
  async function ana(cod, dias) {
    const now = Date.now(), u = `https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao=${cod}&dataInicio=${dmy(now - dias * 86400e3)}&dataFim=${dmy(now + 86400e3)}`;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 40000);
    try {
      const t = await fetch(u, {signal: ctl.signal}).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
      const x = new DOMParser().parseFromString(t, 'text/xml'), rows = x.getElementsByTagName('DadosHidrometereologicos');
      const g = (e, k) => { const v = e.getElementsByTagName(k)[0]?.textContent?.trim(); return v ? +v : null; };
      const m = cache[cod] || (cache[cod] = new Map());
      for (const e of rows) { const s = e.getElementsByTagName('DataHora')[0]?.textContent; if (!s) continue; const t0 = ms(s); if (t0 > now + 1800e3) continue; m.set(t0, [g(e,'Nivel'), g(e,'Vazao'), g(e,'Chuva')]); }
      for (const k of [...m.keys()]) if (k < now - 8 * 86400e3) m.delete(k);
      falhas[cod] = false;
    } catch (e) { falhas[cod] = true; throw e; } finally { clearTimeout(to); }
  }
  async function modelo() {
    if (om && Date.now() - omAt < 30 * 60e3) return om;
    const pts = Object.entries(GRADE).flatMap(([z, ps]) => ps.map(p => [z, p]));
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p=>p[1][0]).join(',')}&longitude=${pts.map(p=>p[1][1]).join(',')}&hourly=precipitation&past_days=6&forecast_days=4&timezone=America%2FSao_Paulo`;
    const js = await fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const acc = {Z1:{}, Z2:{}, Z3:{}};
    js.forEach((d, i) => { const z = pts[i][0]; d.hourly.time.forEach((t, k) => { const v = d.hourly.precipitation[k]; if (v == null) return; const tt = ms(t); (acc[z][tt] = acc[z][tt] || []).push(v); }); });
    om = {}; for (const z in acc) { om[z] = {}; for (const t in acc[z]) om[z][t] = acc[z][t].reduce((a, b) => a + b, 0) / acc[z][t].length; }
    omAt = Date.now(); return om;
  }
  // soma sem preencher lacuna: {v, cob}
  const janela = (s, a, b) => { let x = 0, n = 0, tot = 0; for (let t = a; t < b; t += H) { tot++; const v = s && s[t]; if (v != null) { x += v; n++; } } return {v: n ? x : null, cob: tot ? n / tot : 0}; };
  const fonte = (src, a, b) => { const st = new Set(); for (let t = a; t < b; t += H) if (src[t]) st.add(src[t]); return !st.size ? 'sem dado' : st.size > 1 ? 'misto' : [...st][0]; };

  async function atualizar(base) {
    const d = structuredClone(base), now = Date.now(), N = d.niveis_nomes, L = d.limites;
    if (!d.areas) d.areas = {Z1: 1337, Z2: 1428, Z3: 1193};
    await Promise.allSettled(EST.map(([c]) => ana(c, full ? 2 : 6)));
    full = true;
    let M = null; try { M = await modelo(); } catch (e) { M = null; }
    const agora = fl(now) + H, h0 = agora - 6 * 86400e3;
    // chuva horária por estação (hora sem registro fica ausente)
    const ch = {};
    for (const [c] of EST) { const m = cache[c]; if (!m) continue; const s = {}; for (const [t, r] of m) if (r[2] != null && r[2] >= 0 && r[2] < 200) { const k = fl(t); s[k] = (s[k] || 0) + r[2]; } ch[c] = s; }
    const zs = {}, src = {}, usados = {};
    for (const z of ['Z1','Z2','Z3']) {
      const cods = EST.filter(e => e[1] === z && ch[e[0]] && Object.keys(ch[e[0]]).length > 48).map(e => e[0]); usados[z] = cods; const s = {}, sr = {};
      for (let t = h0; t < agora; t += H) { const v = cods.map(c => ch[c][t]).filter(x => x != null);
        if (v.length) { s[t] = v.reduce((a,b)=>a+b,0) / v.length; sr[t] = 'medicao'; } else if (M && M[z][t] != null) { s[t] = M[z][t]; sr[t] = 'modelo'; } }
      zs[z] = s; src[z] = sr;
    }
    const last = (c, i) => { const m = cache[c]; if (!m) return null; let best = null; for (const [t, r] of m) if (r[i] != null && (!best || t > best[0])) best = [t, r[i]]; return best; };
    const uaf = last('40740000', 0), uafq = last('40740000', 1), ubv = last('40710001', 1);
    if (uaf && (!d.af.t || uaf[0] >= ms(d.af.t))) {
      d.af.h = uaf[1] / 100; d.af.t = loc(uaf[0]); d.af.q = uafq ? uafq[1] : d.af.q;
      let ant = null; for (const [t, r] of cache['40740000']) if (r[0] != null && t <= uaf[0] - 3 * H && (!ant || t > ant[0])) ant = [t, r[0]];
      d.af.tendencia_cm_h = ant ? +(((uaf[1] - ant[1]) / ((uaf[0] - ant[0]) / H))).toFixed(1) : d.af.tendencia_cm_h;
    }
    if (ubv && (!d.bv.t || ubv[0] >= ms(d.bv.t))) { d.bv.q = ubv[1]; d.bv.t = loc(ubv[0]); }
    const merge = (serie, c, i, div) => { const m = cache[c]; if (!m) return serie; const hh = {}; for (const [t, r] of m) if (r[i] != null) (hh[fl(t)] = hh[fl(t)] || []).push(r[i] / div);
      const map = new Map(serie.map(p => [p[0], p[1]])); for (const t in hh) map.set(loc(+t), +(hh[t].reduce((a,b)=>a+b,0) / hh[t].length).toFixed(2)); return [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1); };
    d.af.serie = merge(d.af.serie, '40740000', 0, 100); d.bv.serie = merge(d.bv.serie, '40710001', 1, 1);
    if (d.reguas) for (const c in d.reguas) { const lim = loc(fl(now) - 10 * 86400e3); d.reguas[c] = merge(d.reguas[c], c, 0, 100).filter(p => p[0] >= lim && p[1] > 0 && p[1] < 30); }
    const ont = dayStart(now) - 86400e3, qy = []; if (cache['40740000']) for (const [t, r] of cache['40740000']) if (t >= ont && t < ont + 86400e3 && r[1] != null) qy.push([fl(t), r[1]]);
    const qyh = new Set(qy.map(x => x[0]));
    const qOntem = qy.length ? qy.reduce((a, b) => a + b[1], 0) / qy.length : d.solo.af_q_ontem, qCob = qy.length ? qyh.size / 24 : (d.solo.af_q_ontem != null ? 1 : 0);
    // zonas: janelas recalculadas; P30 vem do coletor (o navegador só tem 6 dias)
    const Zin = {};
    for (const z of ['Z1','Z2','Z3']) {
      const Z = d.zonas[z], s = zs[z], w = k => janela(s, agora - k * H, agora);
      const w24 = w(24), w72 = w(72), w5 = w(120);
      if (w5.cob >= (Z.cob5 ?? 0) || Z.P5 == null) {
        Object.assign(Z, {P24: r1(w24.v), P72: r1(w72.v), P5: r1(w5.v), cob24: +w24.cob.toFixed(2), cob72: +w72.cob.toFixed(2), cob5: +w5.cob.toFixed(2), fonte: fonte(src[z], agora - 120 * H, agora), pluviometros: usados[z]});
        const dd = new Map(Z.diario.map(x => [x.d, x]));
        for (let t = dayStart(now) - 5 * 86400e3; t <= dayStart(now); t += 86400e3) { const k = loc(t).slice(0, 10), o = dd.get(k) || {d: k, mod: null}, b = Math.min(t + 86400e3, agora), j = janela(s, t, b);
          o.obs = r1(j.v); o.cob = +j.cob.toFixed(2); o.fonte = fonte(src[z], t, b); dd.set(k, o); }
        Z.diario = [...dd.values()].sort((a, b) => a.d < b.d ? -1 : 1).slice(-31);
      }
      if (M) {
        const p5m = janela(M[z], agora - 120 * H, agora), p72 = janela(M[z], agora, agora + 72 * H);
        Z.P5_modelo = r1(p5m.v); Z.prev72 = p72.cob >= 0.9 ? r1(p72.v) : null; Z.prev72_cob = +p72.cob.toFixed(2);
        const pv = new Map(Z.previsao.map(x => [x.d, x]));
        for (let k = 0; k < 4; k++) { const t = dayStart(now) + k * 86400e3, a = Math.max(t, agora), b = t + 86400e3, j = b > a ? janela(M[z], a, b) : {v: null, cob: 0}; pv.set(loc(t).slice(0, 10), {d: loc(t).slice(0, 10), prev: r1(j.v), cob: +j.cob.toFixed(2)}); }
        Z.previsao = [...pv.values()].filter(x => x.d >= loc(dayStart(now)).slice(0, 10)).sort((a, b) => a.d < b.d ? -1 : 1);
      }
      Zin[z] = {P5: Z.P5, cob5: Z.cob5 ?? 0, P30: Z.P30 ?? null, cob30: Z.cob30 ?? 0};
    }
    const serieAf = d.af.serie.filter(p => p[0] >= loc(fl(now) - 30 * H));
    const dec = Motor.decidir({agora: loc(now), limites: L, ajuste_umido: d.ajuste_umido, areas: d.areas,
      af: {h: d.af.h, t: d.af.t, q_ontem: qOntem, q_ontem_cobertura: qCob}, bv: {q: d.bv.q, t: d.bv.t},
      zonas: Zin, serie_af: serieAf, estado_anterior: base.estado || (base.nivel && base.nivel.atual != null ? {nivel: base.nivel.atual, desde: base.nivel.desde, causa: base.nivel.causa, historico: []} : null), somente_subir: true});
    d.solo = dec.solo;
    for (const z of ['Z1','Z2','Z3']) Object.assign(d.zonas[z], {nivel: dec.zonas[z].nivel, estado: dec.zonas[z].estado, limites: dec.limites_zona[z]});
    d.af.nivel = dec.indicadores[0].nivel; d.bv.nivel = dec.indicadores[1].nivel;
    const elevado = dec.nivel != null && (base.nivel?.atual == null || dec.nivel > base.nivel.atual);
    d.nivel = {atual: dec.nivel, bruto: dec.nivel_bruto, status: dec.status, indicadores: dec.indicadores.map(i => ({nome: i.nome, nivel: i.nivel, estado: i.estado, idade_h: i.idade_h})),
      desde: dec.estado?.desde ?? base.nivel?.desde, causa: dec.estado?.causa ?? base.nivel?.causa, motivo: dec.motivo_manutencao, descida_h: dec.descida_h,
      oficial: base.nivel?.atual ?? null, elevado_ao_vivo: elevado};
    // projeção pela regra de chuva
    if (M) {
      d.fonte_previsao = 'Open-Meteo'; d.previsao = [];
      for (let k = 1; k <= 3; k++) { const fim = dayStart(now) + (k + 1) * 86400e3, ini = fim - 120 * H, P5 = {}, nv = {}, cob = {};
        for (const z of ['Z1','Z2','Z3']) { const o = janela(zs[z], ini, Math.min(agora, fim)), f = janela(M[z], Math.max(ini, agora), fim), ho = Math.max(0, (Math.min(agora, fim) - ini) / H), hf = (fim - Math.max(ini, agora)) / H;
          cob[z] = +((o.cob * ho + f.cob * hf) / 120).toFixed(2); P5[z] = o.v == null && f.v == null ? null : r1((o.v || 0) + (f.v || 0)); nv[z] = Motor.nivel(P5[z], dec.limites_zona[z]); }
        const oo = Object.values(nv).sort((a, b) => b - a); d.previsao.push({d: loc(fim - 86400e3).slice(0, 10), P5, cob, niveis: nv, nivel: Math.max(oo[1], Math.max(oo[0] - 1, 0)), parcial: Math.min(...Object.values(cob)) < 0.9}); }
    }
    for (const e of d.estacoes) { const m = cache[e.cod]; if (!m || !m.size) continue; const tl = Math.max(...m.keys()), n = last(e.cod, 0), q = last(e.cod, 1), c = ch[e.cod] || {};
      let c24 = 0, nh = 0; for (let t = agora - 24 * H; t < agora; t += H) if (c[t] != null) { c24 += c[t]; nh++; }
      Object.assign(e, {ultimo: loc(tl).replace('T', ' '), nivel: n ? +(n[1] / 100).toFixed(2) : e.nivel, vazao: q ? +q[1].toFixed(1) : e.vazao, chuva24: nh ? +c24.toFixed(1) : null, chuva24_cob: +(nh / 24).toFixed(2), ok: now - tl < 3 * H}); }
    // alertas
    const al = dec.indicadores.filter(i => i.nivel > 0).map(i => ({tipo: 'nivel', nivel: i.nivel, texto: `${i.nome} indica ${N[i.nivel]}`}));
    const nref = dec.nivel ?? 0;
    for (const p of d.previsao) if (p.nivel > nref) al.push({tipo: 'previsao', nivel: p.nivel, texto: `A previsão de chuva para ${p.d.slice(8)}/${p.d.slice(5, 7)} leva a ${N[p.nivel]} pela regra de chuva${p.parcial ? ' (previsão parcial)' : ''}`});
    for (const i of dec.indicadores.slice(0, 2)) if (i.estado !== 'ok') al.push({tipo: 'dado', nivel: 0, texto: `${i.nome} sem leitura válida nas últimas 3 horas${i.idade_h != null ? ` (última há ${Math.round(i.idade_h)} h)` : ''}`});
    for (const z of ['Z1','Z2','Z3']) { const e = dec.zonas[z]; if (e.estado !== 'ok') al.push({tipo: 'dado', nivel: 0, texto: `Chuva de 5 dias em ${z} com cobertura de ${Math.round(e.cob5 * 100)}%${e.estado === 'parcial' ? ' (valor parcial)' : ' (sem dado)'}`}); }
    if (dec.solo.estado === 'indeterminado') al.push({tipo: 'dado', nivel: 0, texto: `Umidade do solo indeterminada: ${dec.solo.criterio}`});
    if (dec.motivo_manutencao && dec.motivo_manutencao !== 'rebaixamento reservado ao coletor') al.push({tipo: 'dado', nivel: 0, texto: `Nível mantido em ${N[dec.nivel]}: ${dec.motivo_manutencao}`});
    if (!M && !d.modelo_ok) al.push({tipo: 'dado', nivel: 0, texto: 'Previsão de chuva indisponível nesta atualização'});
    d.alertas = al;
    const nf = Object.values(falhas).filter(Boolean).length;
    d.qualidade = {...(d.qualidade || {}),
      nivel: {medicao: d.af.t, idade_h: dec.indicadores[0].idade_h, estado: dec.indicadores[0].estado},
      vazao: {medicao: d.bv.t, idade_h: dec.indicadores[1].idade_h, estado: dec.indicadores[1].estado},
      chuva: Object.fromEntries(['Z1','Z2','Z3'].map(z => [z, {cob5: d.zonas[z].cob5, fonte: d.zonas[z].fonte, estado: d.zonas[z].estado}])),
      previsao: {fonte: M ? 'Open-Meteo' : d.fonte_previsao, estado: M || d.modelo_ok ? 'ok' : 'indisponivel'}};
    d.verificado = loc(now); d.ao_vivo = {leitura: d.af.t, ok: !!uaf && nf < EST.length, falhas: nf};
    return d;
  }
  return {atualizar};
})();
