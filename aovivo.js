// Atualização ao vivo: lê a telemetria da ANA e a chuva do Open-Meteo direto no navegador
// e recalcula os níveis de controle (regra de decisão do RT-BRU-HID-001 Rev04) sobre a base data.json.
window.AoVivo = (() => {
  const EST = [['40740000','Z3'],['40710001','Z3'],['40680001','Z2'],['40686000','Z2'],['40700050','Z2'],['40700080','Z2'],['40712500','Z3']];
  const GRADE = {Z1:[[-20.881,-43.817],[-20.761,-43.697],[-20.641,-43.937],[-20.521,-43.817]],
    Z2:[[-20.851,-44.179],[-20.731,-44.059],[-20.611,-44.179],[-20.611,-43.939]],
    Z3:[[-20.343,-44.299],[-20.223,-44.179],[-20.463,-44.059],[-20.343,-43.939]]};
  const H = 3600e3, cache = {}; let full = false, om = null, omAt = 0;
  const ms = s => new Date(s.trim().replace(' ', 'T') + (s.length > 16 ? '' : ':00') + '-03:00').getTime();
  const loc = t => { const d = new Date(t - 3 * H); return d.toISOString().slice(0, 16); };
  const dmy = t => { const d = new Date(t - 3 * H); return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`; };
  const dayStart = t => { const d = new Date(t - 3 * H); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 3 * H; };
  const fl = h => Math.floor(h / H) * H;
  async function ana(cod, dias) {
    const now = Date.now(), u = `https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao=${cod}&dataInicio=${dmy(now - dias * 86400e3)}&dataFim=${dmy(now + 86400e3)}`;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 40000);
    const t = await fetch(u, {signal: ctl.signal}).then(r => r.text()).finally(() => clearTimeout(to));
    const x = new DOMParser().parseFromString(t, 'text/xml'), rows = x.getElementsByTagName('DadosHidrometereologicos');
    const g = (e, k) => { const v = e.getElementsByTagName(k)[0]?.textContent?.trim(); return v ? +v : null; };
    const m = cache[cod] || (cache[cod] = new Map());
    for (const e of rows) { const s = e.getElementsByTagName('DataHora')[0]?.textContent; if (!s) continue; const t0 = ms(s); if (t0 > now + 1800e3) continue; m.set(t0, [g(e,'Nivel'), g(e,'Vazao'), g(e,'Chuva')]); }
    for (const k of [...m.keys()]) if (k < now - 8 * 86400e3) m.delete(k);
  }
  async function modelo() {
    if (om && Date.now() - omAt < 30 * 60e3) return om;
    const pts = Object.entries(GRADE).flatMap(([z, ps]) => ps.map(p => [z, p]));
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p=>p[1][0]).join(',')}&longitude=${pts.map(p=>p[1][1]).join(',')}&hourly=precipitation&past_days=6&forecast_days=4&timezone=America%2FSao_Paulo`;
    const js = await fetch(u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const acc = {Z1:{}, Z2:{}, Z3:{}};
    js.forEach((d, i) => { const z = pts[i][0]; d.hourly.time.forEach((t, k) => { const tt = ms(t); (acc[z][tt] = acc[z][tt] || []).push(d.hourly.precipitation[k] || 0); }); });
    om = {}; for (const z in acc) { om[z] = {}; for (const t in acc[z]) om[z][t] = acc[z][t].reduce((a, b) => a + b, 0) / acc[z][t].length; }
    omAt = Date.now(); return om;
  }
  const nivel = (v, l) => l.reduce((k, t, i) => v != null && v >= t ? i + 1 : k, 0);
  async function atualizar(base) {
    const d = structuredClone(base), now = Date.now(), N = d.niveis_nomes, L = d.limites;
    await Promise.allSettled(EST.map(([c]) => ana(c, full ? 2 : 6)));
    full = true;
    let M = null; try { M = await modelo(); } catch (e) { M = null; }
    const agora = fl(now) + H, h0 = agora - 6 * 86400e3;
    const ch = {};
    for (const [c] of EST) { const m = cache[c]; if (!m) continue; const s = {}; for (const [t, r] of m) if (r[2] != null && r[2] >= 0 && r[2] < 200) { const k = fl(t); s[k] = (s[k] || 0) + r[2]; } ch[c] = s; }
    const zs = {}, usados = {};
    for (const z of ['Z1','Z2','Z3']) {
      const cods = EST.filter(e => e[1] === z && ch[e[0]] && Object.keys(ch[e[0]]).length > 48).map(e => e[0]); usados[z] = cods; const s = {};
      for (let t = h0; t < agora; t += H) { const v = cods.map(c => ch[c][t]).filter(x => x != null); s[t] = v.length ? v.reduce((a,b)=>a+b,0) / v.length : (M ? (M[z][t] || 0) : null); }
      zs[z] = (cods.length || M) ? s : null;
    }
    const soma = (s, a, b) => { let x = 0; for (let t = a; t < b; t += H) x += (s && s[t]) || 0; return x; };
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
    const ont = dayStart(now) - 86400e3, qy = []; if (cache['40740000']) for (const [t, r] of cache['40740000']) if (t >= ont && t < ont + 86400e3 && r[1] != null) qy.push(r[1]);
    if (qy.length >= 12) d.solo.af_q_ontem = +(qy.reduce((a,b)=>a+b,0) / qy.length).toFixed(1);
    const umido = (d.solo.af_q_ontem ?? 0) > 90 || d.solo.p30_bacia > 370; d.solo.umido = umido;
    const adj = umido ? d.ajuste_umido : 0;
    for (const z of ['Z1','Z2','Z3']) {
      const Z = d.zonas[z], s = zs[z]; Z.limites = L[z].map(t => t - adj);
      if (s) {
        Z.P24 = +soma(s, agora - 24 * H, agora).toFixed(1); Z.P72 = +soma(s, agora - 72 * H, agora).toFixed(1); Z.P5 = +soma(s, agora - 120 * H, agora).toFixed(1);
        Z.fonte = usados[z].length ? 'pluviômetros' : 'modelo'; Z.pluviometros = usados[z];
        const dd = new Map(Z.diario.map(x => [x.d, x]));
        for (let t = dayStart(now) - 5 * 86400e3; t <= dayStart(now); t += 86400e3) { const k = loc(t).slice(0, 10), o = dd.get(k) || {d: k, mod: null}; o.obs = +soma(s, t, Math.min(t + 86400e3, agora)).toFixed(1); dd.set(k, o); }
        Z.diario = [...dd.values()].sort((a, b) => a.d < b.d ? -1 : 1).slice(-31);
      }
      if (M) {
        Z.P5_modelo = +soma(M[z], agora - 120 * H, agora).toFixed(1); Z.prev72 = +soma(M[z], agora, agora + 72 * H).toFixed(1);
        const pv = new Map(Z.previsao.map(x => [x.d, x]));
        for (let k = 0; k < 4; k++) { const t = dayStart(now) + k * 86400e3, a = Math.max(t, agora), b = t + 86400e3; pv.set(loc(t).slice(0, 10), {d: loc(t).slice(0, 10), prev: +(b > a ? soma(M[z], a, b) : 0).toFixed(1)}); }
        Z.previsao = [...pv.values()].filter(x => x.d >= loc(dayStart(now)).slice(0, 10)).sort((a, b) => a.d < b.d ? -1 : 1);
      }
      Z.nivel = nivel(Z.P5, Z.limites);
    }
    const o = ['Z1','Z2','Z3'].map(z => d.zonas[z].nivel).sort((a, b) => b - a);
    const cand = [['Régua de Alberto Flores', nivel(d.af.h, L.AF)], ['Vazão em Belo Vale', nivel(d.bv.q, L.BV)], ['Chuva em duas zonas', o[1]], ['Chuva em uma zona (pré-aviso)', Math.max(o[0] - 1, 0)]];
    d.af.nivel = cand[0][1]; d.bv.nivel = cand[1][1];
    d.nivel = {atual: Math.max(...cand.map(c => c[1])), indicadores: cand.map(([nome, nv]) => ({nome, nivel: nv}))};
    if (M) {
      d.fonte_previsao = 'Open-Meteo'; d.previsao = [];
      for (let k = 1; k <= 3; k++) { const fim = dayStart(now) + (k + 1) * 86400e3, ini = fim - 120 * H, P5 = {}, nv = {};
        for (const z of ['Z1','Z2','Z3']) { P5[z] = +(soma(zs[z] || {}, ini, Math.min(agora, fim)) + soma(M[z], Math.max(ini, agora), fim)).toFixed(1); nv[z] = nivel(P5[z], d.zonas[z].limites); }
        const oo = Object.values(nv).sort((a, b) => b - a); d.previsao.push({d: loc(fim - 86400e3).slice(0, 10), P5, niveis: nv, nivel: Math.max(oo[1], Math.max(oo[0] - 1, 0))}); }
    }
    for (const e of d.estacoes) { const m = cache[e.cod]; if (!m || !m.size) continue; const tl = Math.max(...m.keys()), n = last(e.cod, 0), q = last(e.cod, 1), c = ch[e.cod] || {};
      let c24 = 0, has = false; for (let t = agora - 24 * H; t < agora; t += H) if (c[t] != null) { c24 += c[t]; has = true; }
      Object.assign(e, {ultimo: loc(tl).replace('T', ' '), nivel: n ? +(n[1] / 100).toFixed(2) : e.nivel, vazao: q ? +q[1].toFixed(1) : e.vazao, chuva24: has ? +c24.toFixed(1) : e.chuva24, ok: now - tl < 3 * H}); }
    const al = d.nivel.indicadores.filter(i => i.nivel > 0).map(i => ({tipo: 'nivel', nivel: i.nivel, texto: `${i.nome} indica ${N[i.nivel]}`}));
    for (const p of d.previsao) if (p.nivel > d.nivel.atual) al.push({tipo: 'previsao', nivel: p.nivel, texto: `A previsão de chuva para ${p.d.slice(8)}/${p.d.slice(5, 7)} leva a ${N[p.nivel]} pela regra de chuva`});
    if (!uaf || now - uaf[0] > 3 * H) al.push({tipo: 'dado', nivel: 0, texto: 'Régua de Alberto Flores sem transmissão há mais de 3 horas'});
    if (!ubv || now - ubv[0] > 3 * H) al.push({tipo: 'dado', nivel: 0, texto: 'Belo Vale sem transmissão há mais de 3 horas'});
    d.alertas = al;
    d.atualizado = loc(now); d.ao_vivo = {leitura: d.af.t, ok: !!uaf};
    return d;
  }
  return {atualizar};
})();
