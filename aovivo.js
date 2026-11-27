// Camada ao vivo: lê a telemetria da ANA e a chuva do modelo direto no navegador e recalcula os indicadores
// com o mesmo motor do coletor (motor.js). Regras:
// - ausência de dado é null, nunca zero; acumulados observados só com horas concluídas (a hora em curso aparece à parte);
// - convenção única de intervalos [início, fim): ANA no fim do intervalo, Open-Meteo na hora anterior (ver dados.py);
// - o navegador só eleva o nível publicado; uma elevação local fica guardada no navegador e só é desfeita pela confirmação
//   do servidor ou por uma decisão válida de rebaixamento do motor (todos os indicadores válidos e régua descendo 12 h);
// - cada fonte tem tempo limite, nova tentativa com espera crescente e registro de falhas.
window.AoVivo = (() => {
  const EST = [['40740000','Z3'],['40710001','Z3'],['40680001','Z2'],['40686000','Z2'],['40700050','Z2'],['40700080','Z2'],
    ['40712500','Z3'],['40712000','Z3'],['40712600','Z3'],['2043133','Z1'],['2043013','Z1']];
  const GRADE = {Z1:[[-20.881,-43.817],[-20.761,-43.697],[-20.641,-43.937],[-20.521,-43.817]],
    Z2:[[-20.851,-44.179],[-20.731,-44.059],[-20.611,-44.179],[-20.611,-43.939]],
    Z3:[[-20.343,-44.299],[-20.223,-44.179],[-20.463,-44.059],[-20.343,-43.939]]};
  const ZS = ['Z1','Z2','Z3'], H = 3600e3, TIMEOUT = 20000, TOL_FUT = 5 * 60e3, CHAVE = 'painel_cheias_estado_local_v1';
  const cache = {}, fontes = {}; let full = false, om = null, omAt = 0;
  const ms = s => new Date(String(s).trim().replace(' ', 'T').slice(0, 16) + ':00-03:00').getTime();
  const loc = t => new Date(t - 3 * H).toISOString().slice(0, 16);
  const dmy = t => { const d = new Date(t - 3 * H); return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`; };
  const dayStart = t => { const d = new Date(t - 3 * H); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 3 * H; };
  const fl = t => Math.floor(t / H) * H;
  const horaAna = t => fl(t - 1000);          // registro das 10:00 pertence à hora [09:00, 10:00)
  const horaOM = t => t - H;                  // Open-Meteo: valor no horário t é a soma de [t - 1 h, t)
  const r1 = v => v == null ? null : Math.round(v * 10) / 10;
  const num = v => { if (v == null || String(v).trim() === '') return null; const x = +v; return Number.isFinite(x) ? x : null; };

  function frescor(idadeH, cadMin) {
    if (idadeH == null) return 'sem dado';
    if (idadeH < -TOL_FUT / H) return 'futuro';
    const c = (cadMin || 15) / 60;
    return idadeH <= c + 0.5 ? 'atualizado' : idadeH <= c + 1 ? 'atrasado' : idadeH <= 3 ? 'desatualizado' : 'indisponivel';
  }
  const cadencia = ts => { const t = [...new Set(ts)].sort((a, b) => a - b), d = []; for (let i = 1; i < t.length; i++) d.push((t[i] - t[i - 1]) / 60e3); d.sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : null; };

  function registrar(f, ok, erro) {
    const s = fontes[f] || (fontes[f] = {falhas: 0});
    s.tentativa = Date.now();
    if (ok) { s.sucesso = s.tentativa; s.falhas = 0; s.erro = null; s.proxima = 0; }
    else { s.falhas++; s.erro = String(erro && erro.message || erro).slice(0, 120); s.proxima = s.tentativa + Math.min(30 * 60e3, 60e3 * 2 ** s.falhas); }
  }
  async function buscar(url, tipo) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), TIMEOUT);
    try { const r = await fetch(url, {signal: ctl.signal, cache: 'no-store'}); if (!r.ok) throw new Error('HTTP ' + r.status); return tipo === 'json' ? await r.json() : await r.text(); }
    catch (e) { throw e.name === 'AbortError' ? new Error(`sem resposta em ${TIMEOUT / 1000} s`) : e; }
    finally { clearTimeout(to); }
  }
  async function ana(cod, dias) {
    const f = 'ANA ' + cod, s = fontes[f];
    if (s && s.proxima > Date.now()) return;      // aguardando nova tentativa após falha (espera crescente)
    const now = Date.now(), u = `https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao=${cod}&dataInicio=${dmy(now - dias * 86400e3)}&dataFim=${dmy(now + 86400e3)}`;
    try {
      const t = await buscar(u, 'text');
      const x = new DOMParser().parseFromString(t, 'text/xml'), rows = x.getElementsByTagName('DadosHidrometereologicos');
      const g = (e, k) => num(e.getElementsByTagName(k)[0]?.textContent);
      const m = cache[cod] || (cache[cod] = new Map()); let fut = 0;
      for (const e of rows) { const sd = e.getElementsByTagName('DataHora')[0]?.textContent; if (!sd) continue; const t0 = ms(sd); if (!Number.isFinite(t0)) continue;
        if (t0 > now + TOL_FUT) { fut++; continue; } m.set(t0, [g(e,'Nivel'), g(e,'Vazao'), g(e,'Chuva')]); }
      for (const k of [...m.keys()]) if (k < now - 8 * 86400e3 || k > Date.now() + TOL_FUT) m.delete(k);
      registrar(f, true); fontes[f].futuros = fut;
    } catch (e) { registrar(f, false, e); }
  }
  async function modelo() {
    if (om && Date.now() - omAt < 30 * 60e3) return;
    const s = fontes['Open-Meteo']; if (s && s.proxima > Date.now()) return;
    const pts = Object.entries(GRADE).flatMap(([z, ps]) => ps.map(p => [z, p]));
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p=>p[1][0]).join(',')}&longitude=${pts.map(p=>p[1][1]).join(',')}&hourly=precipitation&past_days=6&forecast_days=4&timezone=America%2FSao_Paulo`;
    try {
      const js = await buscar(u, 'json'), acc = {Z1:{}, Z2:{}, Z3:{}};
      js.forEach((d, i) => { const z = pts[i][0]; d.hourly.time.forEach((t, k) => { const v = num(d.hourly.precipitation[k]); if (v == null) return; const tt = horaOM(ms(t)); (acc[z][tt] = acc[z][tt] || []).push(v); }); });
      om = {}; for (const z in acc) { om[z] = {}; for (const t in acc[z]) om[z][t] = acc[z][t].reduce((a, b) => a + b, 0) / acc[z][t].length; }
      omAt = Date.now(); registrar('Open-Meteo', true);
    } catch (e) { registrar('Open-Meteo', false, e); }
  }
  async function limitado(tarefas, n) { const fila = [...tarefas]; await Promise.all(Array.from({length: n}, async () => { while (fila.length) await fila.shift()(); })); }

  const janela = (s, a, b) => { let x = 0, n = 0, tot = 0; for (let t = a; t < b; t += H) { tot++; const v = s && s[t]; if (v != null) { x += v; n++; } } return {v: n ? x : null, cob: tot ? n / tot : 0}; };
  const rotulo = (src, a, b) => { const st = new Set(); for (let t = a; t < b; t += H) if (src[t]) st.add(src[t]); return !st.size ? 'sem dado' : st.size > 1 ? 'misto' : st.has('M') ? 'medicao' : 'modelo'; };
  function cob(src, peso, a, b) { let m = 0, e = 0, p = 0, n = 0; for (let t = a; t < b; t += H) { n++; if (src[t] === 'M') { m++; p += peso[t] || 0; } else if (src[t] === 'E') e++; }
    const r = x => +x.toFixed(2); return {temporal: n ? r((m + e) / n) : 0, medida: n ? r(m / n) : 0, estimada: n ? r(e / n) : 0, espacial: n ? r(p / n) : 0}; }

  // chuva horária de uma estação (hora aceita como medida com ao menos 75% dos registros esperados)
  function chuvaHoraria(c) {
    const m = cache[c]; if (!m) return null;
    const ts = [...m.entries()].filter(([, r]) => r[2] != null).map(([t]) => t), cad = cadencia(ts) || 60, esp = cad <= 60 ? Math.max(1, Math.round(60 / cad)) : 1, min = Math.max(1, Math.ceil(0.75 * esp));
    const acc = {}, n = {};
    for (const [t, r] of m) if (r[2] != null && r[2] >= 0 && r[2] < 200) { const k = horaAna(t); acc[k] = (acc[k] || 0) + r[2]; n[k] = (n[k] || 0) + 1; }
    const s = {}; for (const k in acc) if (n[k] >= min) s[k] = acc[k];
    return {s, acc, n};
  }

  // ---------- estado local (item 22): elevação detectada no navegador persiste entre atualizações e reinícios
  function lerLocal() { try { const j = JSON.parse(localStorage.getItem(CHAVE)); return j && j.nivel != null ? j : null; } catch (e) { return null; } }
  function gravarLocal(v) { try { v ? localStorage.setItem(CHAVE, JSON.stringify(v)) : localStorage.removeItem(CHAVE); } catch (e) {} }

  function estadoServidor(base) { return base.estado || (base.nivel && base.nivel.atual != null ? {nivel: base.nivel.atual, desde: base.nivel.desde, causa: base.nivel.causa, historico: []} : null); }

  // recalcula decisão, alertas e qualidade para o instante "now" (também usado sem rede, para envelhecer os dados)
  function decidirLocal(d, base, now) {
    const N = d.niveis_nomes, L = d.limites, srv = estadoServidor(base);
    let lo = lerLocal();
    if (lo && srv && srv.nivel != null) {
      // servidor já confirmou o nível (ou um nível maior), ou registrou rebaixamento válido depois da elevação local
      const rebaixouDepois = (srv.historico || []).some(h => h.t > lo.desde && h.de != null && h.de >= lo.nivel && h.para < h.de);
      if (srv.nivel >= lo.nivel || rebaixouDepois) { lo = null; gravarLocal(null); }
    }
    const usaLocal = !!lo;
    const entrada = {agora: loc(now), limites: L, ajuste_umido: d.ajuste_umido, areas: d.areas,
      af: {h: d.af.h, t: d.af.h_t || d.af.t, q_ontem: d._q_ontem ?? d.solo.af_q_ontem, q_ontem_cobertura: d._q_ontem_cob ?? d.solo.af_q_ontem_cobertura ?? null},
      bv: {q: d.bv.q, t: d.bv.q_t || d.bv.t},
      zonas: Object.fromEntries(ZS.map(z => [z, {P5: d.zonas[z].P5, cob5: d.zonas[z].cob5 ?? 0, P30: d.zonas[z].P30 ?? null, cob30: d.zonas[z].cob30 ?? 0}])),
      serie_af: (d.af.serie || []).filter(p => p[0] >= loc(fl(now) - 30 * H))};
    let dec = Motor.decidir({...entrada, estado_anterior: usaLocal ? lo : srv, somente_subir: !usaLocal});
    if (usaLocal && srv && srv.nivel != null && dec.nivel != null && dec.nivel <= srv.nivel) {
      // rebaixamento válido da elevação local (nunca abaixo do nível publicado pelo servidor)
      gravarLocal(null); dec = Motor.decidir({...entrada, estado_anterior: srv, somente_subir: true});
    }
    const oficial = srv ? srv.nivel : null, elevado = dec.nivel != null && (oficial == null || dec.nivel > oficial);
    if (elevado) gravarLocal({...dec.estado, snapshot: base.id_snapshot || base.coleta, gravado: loc(now)}); else if (!usaLocal) gravarLocal(null);
    d.solo = dec.solo;
    for (const z of ZS) Object.assign(d.zonas[z], {nivel: dec.zonas[z].nivel, estado: dec.zonas[z].estado, limites: dec.limites_zona[z]});
    d.af.nivel = dec.indicadores[0].nivel; d.bv.nivel = dec.indicadores[1].nivel;
    d.nivel = {atual: dec.nivel, bruto: dec.nivel_bruto, bruto_solo_umido: dec.nivel_bruto_solo_umido, status: dec.status,
      indicadores: dec.indicadores.map(i => ({nome: i.nome, nivel: i.nivel, estado: i.estado, idade_h: i.idade_h, motivo: i.motivo})),
      desde: dec.estado?.desde ?? base.nivel?.desde, causa: dec.estado?.causa ?? base.nivel?.causa, motivo: dec.motivo_manutencao, descida_h: dec.descida_h,
      oficial, elevado_ao_vivo: elevado, local: elevado ? {nivel: dec.nivel, desde: dec.estado?.desde} : null};
    // previsão: validade pela idade do último sucesso, nunca por um selo herdado
    const pm = d.previsao_meta || (d.previsao_meta = {}), ultimo = pm.ultimo_sucesso ? ms(pm.ultimo_sucesso) : null, ip = ultimo == null ? null : (now - ultimo) / H;
    pm.idade_h = ip == null ? null : +ip.toFixed(2);
    pm.estado = ip == null ? 'indisponivel' : ip <= 3 ? 'ok' : ip <= 12 ? 'desatualizada' : 'indisponivel';
    if (pm.estado === 'indisponivel') d.previsao = [];
    // estações: frescor por variável recalculado com o relógio atual
    for (const e of d.estacoes || []) { for (const v of Object.values(e.variaveis || {})) if (v) { v.idade_h = +((now - ms(v.t)) / H).toFixed(2); v.frescor = frescor(v.idade_h, v.cadencia_min); }
      const vs = Object.values(e.variaveis || {}).filter(Boolean); e.ok = vs.length > 0 && vs.every(v => v.frescor !== 'indisponivel' && v.frescor !== 'futuro'); }
    // alertas
    const al = dec.indicadores.filter(i => i.nivel > 0).map(i => ({tipo: 'nivel', nivel: i.nivel, texto: `${i.nome} indica ${N[i.nivel]}`}));
    if (elevado && oficial != null) al.unshift({tipo: 'nivel', nivel: dec.nivel, texto: `Elevação para ${N[dec.nivel]} detectada pela telemetria ao vivo neste navegador; o nível publicado pelo servidor é ${N[oficial]}`});
    const nref = dec.nivel ?? 0;
    for (const p of d.previsao) if (p.nivel > nref) al.push({tipo: 'previsao', nivel: p.nivel, texto: `A previsão de chuva para ${p.d.slice(8)}/${p.d.slice(5, 7)} leva a ${N[p.nivel]} pela regra de chuva${p.parcial ? ' (previsão parcial)' : ''}${pm.estado === 'desatualizada' ? ` (previsão obtida há ${Math.round(ip)} h)` : ''}`});
    const nu = dec.nivel_bruto_solo_umido; if (nu != null && (dec.nivel_bruto == null || nu > dec.nivel_bruto)) al.push({tipo: 'cenario', nivel: nu, texto: `Umidade do solo indeterminada: se o solo estiver úmido, a regra de chuva indica ${N[nu]}`});
    for (const i of dec.indicadores.slice(0, 2)) if (i.estado !== 'ok') al.push({tipo: 'dado', nivel: 0, texto: `${i.nome} sem leitura válida: ${i.motivo}${i.idade_h != null && i.idade_h > 0 ? ` (última há ${Math.round(i.idade_h)} h)` : ''}`});
    for (const z of ZS) { const e = dec.zonas[z], Z = d.zonas[z];
      if (e.estado !== 'ok') al.push({tipo: 'dado', nivel: 0, texto: `Chuva de 5 dias em ${z} com cobertura de ${Math.round(e.cob5 * 100)}%${e.estado === 'parcial' ? ' (valor parcial)' : ' (sem dado)'}`});
      else if (Z.cob5_medida != null && Z.cob5_medida < 0.5) al.push({tipo: 'dado', nivel: 0, texto: `Chuva de 5 dias em ${z}: ${Math.round(Z.cob5_medida * 100)}% das horas medidas por pluviômetro e ${Math.round((Z.cob5_estimada ?? 0) * 100)}% estimadas por modelo`}); }
    if (dec.solo.estado === 'indeterminado') al.push({tipo: 'dado', nivel: 0, texto: `Umidade do solo indeterminada: ${dec.solo.criterio}`});
    if (dec.motivo_manutencao && dec.motivo_manutencao !== 'rebaixamento reservado ao coletor') al.push({tipo: 'dado', nivel: 0, texto: `Nível mantido em ${N[dec.nivel]}: ${dec.motivo_manutencao}`});
    if (pm.estado === 'indisponivel') al.push({tipo: 'dado', nivel: 0, texto: 'Previsão de chuva indisponível ou com mais de 12 h; a projeção pela regra de chuva foi ocultada'});
    else if (pm.estado === 'desatualizada') al.push({tipo: 'dado', nivel: 0, texto: `Previsão de chuva desatualizada: obtida há ${Math.round(ip)} h`});
    for (const [f, s] of Object.entries(fontes)) if (s.futuros && /4074000|4071000/.test(f)) al.push({tipo: 'dado', nivel: 0, texto: `${s.futuros} registro(s) de ${f} com horário no futuro foram descartados`});
    d.alertas = al;
    d.qualidade = {...(d.qualidade || {}),
      nivel: {medicao: d.af.h_t || d.af.t, idade_h: dec.indicadores[0].idade_h, estado: dec.indicadores[0].estado, motivo: dec.indicadores[0].motivo, frescor: frescor(dec.indicadores[0].idade_h, 15)},
      vazao: {medicao: d.bv.q_t || d.bv.t, idade_h: dec.indicadores[1].idade_h, estado: dec.indicadores[1].estado, motivo: dec.indicadores[1].motivo, frescor: frescor(dec.indicadores[1].idade_h, 15)},
      chuva: Object.fromEntries(ZS.map(z => [z, {cob5: d.zonas[z].cob5, cob5_medida: d.zonas[z].cob5_medida, cob5_estimada: d.zonas[z].cob5_estimada, cob5_espacial: d.zonas[z].cob5_espacial, fonte: d.zonas[z].fonte, estado: d.zonas[z].estado}])),
      previsao: {fonte: pm.fonte, estado: pm.estado, idade_h: pm.idade_h}};
    d.verificado = loc(now);
    return d;
  }

  async function atualizar(base) {
    const d = structuredClone(base), now = Date.now();
    if (!d.areas) d.areas = {Z1: 1337, Z2: 1428, Z3: 1193};
    await Promise.all([limitado(EST.map(([c]) => () => ana(c, full ? 2 : 6)), 4), modelo()]);
    full = true;
    const M = om && Date.now() - omAt < 3 * H ? om : null, h1 = fl(now), h0 = h1 - 6 * 86400e3;   // h1: início da hora em curso
    if (M) d.previsao_meta = {...(d.previsao_meta || {}), fonte: 'Open-Meteo', obtida: loc(omAt), ultimo_sucesso: loc(omAt)};
    const ch = {}; for (const [c] of EST) { const r = chuvaHoraria(c); if (r) ch[c] = r; }
    const zs = {}, src = {}, peso = {}, usados = {}, parcial = {};
    for (const z of ZS) {
      const cods = EST.filter(e => e[1] === z && ch[e[0]] && Object.keys(ch[e[0]].s).length > 48).map(e => e[0]); usados[z] = cods; const s = {}, sr = {}, pw = {};
      for (let t = h0; t < h1; t += H) { const v = cods.map(c => ch[c].s[t]).filter(x => x != null);
        if (v.length) { s[t] = v.reduce((a,b)=>a+b,0) / v.length; sr[t] = 'M'; pw[t] = v.length / cods.length; } else if (M && M[z][t] != null) { s[t] = M[z][t]; sr[t] = 'E'; } }
      const pp = cods.map(c => ch[c].acc[h1]).filter(x => x != null);
      parcial[z] = pp.length ? {inicio: loc(h1), mm: r1(pp.reduce((a,b)=>a+b,0) / pp.length), pluviometros: pp.length} : null;
      zs[z] = s; src[z] = sr; peso[z] = pw;
    }
    // régua e vazões: cada variável com o próprio horário
    const last = (c, i) => { const m = cache[c]; if (!m) return null; let best = null; for (const [t, r] of m) if (r[i] != null && (!best || t > best[0])) best = [t, r[i]]; return best; };
    const uaf = last('40740000', 0), uafq = last('40740000', 1), ubv = last('40710001', 1), ubvh = last('40710001', 0);
    const novo = (u, t) => u && (!t || u[0] >= ms(t));
    if (novo(uaf, d.af.h_t || d.af.t)) {
      d.af.h = uaf[1] / 100; d.af.h_t = d.af.t = loc(uaf[0]);
      let ant = null; for (const [t, r] of cache['40740000']) if (r[0] != null && t <= uaf[0] - 3 * H && (!ant || t > ant[0])) ant = [t, r[0]];
      d.af.tendencia_cm_h = ant ? +(((uaf[1] - ant[1]) / ((uaf[0] - ant[0]) / H))).toFixed(1) : d.af.tendencia_cm_h;
    }
    if (novo(uafq, d.af.q_t)) { d.af.q = uafq[1]; d.af.q_t = loc(uafq[0]); }
    if (novo(ubv, d.bv.q_t || d.bv.t)) { d.bv.q = ubv[1]; d.bv.q_t = d.bv.t = loc(ubv[0]); }
    if (novo(ubvh, d.bv.h_t)) { d.bv.h = ubvh[1] / 100; d.bv.h_t = loc(ubvh[0]); }
    const merge = (serie, c, i, div) => { const m = cache[c]; if (!m) return serie; const hh = {}; for (const [t, r] of m) if (r[i] != null) (hh[fl(t)] = hh[fl(t)] || []).push(r[i] / div);
      const map = new Map(serie.map(p => [p[0], p[1]])); for (const t in hh) map.set(loc(+t), +(hh[t].reduce((a,b)=>a+b,0) / hh[t].length).toFixed(2)); return [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1); };
    d.af.serie = merge(d.af.serie, '40740000', 0, 100); d.bv.serie = merge(d.bv.serie, '40710001', 1, 1);
    if (d.reguas) for (const c in d.reguas) { const lim = loc(fl(now) - 10 * 86400e3); d.reguas[c] = merge(d.reguas[c], c, 0, 100).filter(p => p[0] >= lim && p[1] > 0 && p[1] < 30); }
    // vazão média de ontem: cobertura real (nunca 100% presumido)
    const ont = dayStart(now) - 86400e3, qh = {};
    if (cache['40740000']) for (const [t, r] of cache['40740000']) if (t >= ont && t < ont + 86400e3 && r[1] != null) (qh[fl(t)] = qh[fl(t)] || []).push(r[1]);
    const qv = Object.values(qh).map(v => v.reduce((a, b) => a + b, 0) / v.length);
    if (qv.length) { d._q_ontem = qv.reduce((a, b) => a + b, 0) / qv.length; d._q_ontem_cob = qv.length / 24; }
    // zonas: janelas recalculadas com horas concluídas; P30 vem do coletor (o navegador só tem 6 dias)
    for (const z of ZS) {
      const Z = d.zonas[z], s = zs[z], w = k => janela(s, h1 - k * H, h1), w24 = w(24), w72 = w(72), w5 = w(120), c5 = cob(src[z], peso[z], h1 - 120 * H, h1);
      Z.hora_parcial = parcial[z];
      // só substitui o valor do servidor se a janela ao vivo for ao menos tão medida e tão completa quanto ele
      // (sem a ANA, uma estimativa só de modelo nunca substitui uma chuva medida)
      if (Z.P5 == null || (c5.medida >= (Z.cob5_medida ?? 0) - 0.02 && w5.cob >= (Z.cob5 ?? 0))) {
        let f5 = ''; for (let t = h1 - 120 * H; t < h1; t += H) f5 += src[z][t] || '-';
        Object.assign(Z, {P24: r1(w24.v), P72: r1(w72.v), P5: r1(w5.v), cob24: +w24.cob.toFixed(2), cob72: +w72.cob.toFixed(2), cob5: +w5.cob.toFixed(2),
          cob5_medida: c5.medida, cob5_estimada: c5.estimada, cob5_espacial: c5.espacial, fontes5: f5, fim_acumulado: loc(h1),
          fonte: rotulo(src[z], h1 - 120 * H, h1), pluviometros: usados[z]});
        const dd = new Map(Z.diario.map(x => [x.d, x]));
        for (let t = dayStart(now) - 5 * 86400e3; t <= dayStart(now); t += 86400e3) { const k = loc(t).slice(0, 10), o = dd.get(k) || {d: k, mod: null}, b = Math.min(t + 86400e3, h1); if (b <= t) continue; const j = janela(s, t, b);
          o.obs = r1(j.v); o.cob = +j.cob.toFixed(2); o.cob_medida = cob(src[z], peso[z], t, b).medida; o.fonte = rotulo(src[z], t, b); o.ate = b < t + 86400e3 ? loc(b) : null; dd.set(k, o); }
        Z.diario = [...dd.values()].sort((a, b) => a.d < b.d ? -1 : 1).slice(-31);
      }
      if (M) {
        const p5m = janela(M[z], h1 - 120 * H, h1), p72 = janela(M[z], h1, h1 + 72 * H);
        Z.P5_modelo = r1(p5m.v); Z.prev72 = p72.cob >= 0.9 ? r1(p72.v) : null; Z.prev72_cob = +p72.cob.toFixed(2);
        const pv = new Map(Z.previsao.map(x => [x.d, x]));
        for (let k = 0; k < 4; k++) { const t = dayStart(now) + k * 86400e3, a = Math.max(t, h1), b = t + 86400e3, j = b > a ? janela(M[z], a, b) : {v: null, cob: 0}; pv.set(loc(t).slice(0, 10), {d: loc(t).slice(0, 10), prev: r1(j.v), cob: +j.cob.toFixed(2), desde: loc(a)}); }
        Z.previsao = [...pv.values()].filter(x => x.d >= loc(dayStart(now)).slice(0, 10)).sort((a, b) => a.d < b.d ? -1 : 1);
      }
    }
    // projeção pela regra de chuva: observado (horas concluídas) + previsto (a partir da hora em curso), sem dupla contagem
    if (M) {
      const lz = ZS.map(z => [z, d.zonas[z].limites || L[z]]); d.fonte_previsao = 'Open-Meteo'; d.previsao = [];
      for (let k = 1; k <= 3; k++) { const fim = dayStart(now) + (k + 1) * 86400e3, ini = fim - 120 * H, P5 = {}, nv = {}, cb = {};
        for (const z of ZS) { const o = janela(zs[z], ini, Math.min(h1, fim)), f = janela(M[z], Math.max(ini, h1), fim), ho = Math.max(0, (Math.min(h1, fim) - ini) / H), hf = (fim - Math.max(ini, h1)) / H;
          cb[z] = +((o.cob * ho + f.cob * hf) / 120).toFixed(2); P5[z] = o.v == null && f.v == null ? null : r1((o.v || 0) + (f.v || 0)); nv[z] = Motor.nivel(P5[z], d.zonas[z].limites); }
        const oo = Object.values(nv).sort((a, b) => b - a); d.previsao.push({d: loc(fim - 86400e3).slice(0, 10), P5, cob: cb, niveis: nv, nivel: Math.max(oo[1], Math.max(oo[0] - 1, 0)), parcial: Math.min(...Object.values(cb)) < 0.9}); }
    }
    // estações: situação por variável (nível, vazão e chuva com horários próprios)
    for (const e of d.estacoes) { const m = cache[e.cod]; if (!m || !m.size) continue; e.variaveis = e.variaveis || {};
      [['nivel', 0, 100, 2], ['vazao', 1, 1, 1], ['chuva', 2, 1, 1]].forEach(([k, i, div, nd]) => {
        if (k === 'nivel' && e.cod === '40700080') return;
        const u = last(e.cod, i); if (!u) return; const old = e.variaveis[k]; if (old && ms(old.t) > u[0]) return;
        const ts = [...m.entries()].filter(([, r]) => r[i] != null).map(([t]) => t);
        e.variaveis[k] = {t: loc(u[0]), valor: +(u[1] / div).toFixed(nd), cadencia_min: cadencia(ts.slice(-200)) || old?.cadencia_min || null}; });
      const vs = Object.values(e.variaveis).filter(Boolean); e.ultimo = vs.length ? vs.map(v => v.t).sort().pop().replace('T', ' ') : e.ultimo;
      e.nivel = e.variaveis.nivel?.valor ?? null; e.vazao = e.variaveis.vazao?.valor ?? null;
      const c = ch[e.cod]?.s || {}; let c24 = 0, nh = 0; for (let t = h1 - 24 * H; t < h1; t += H) if (c[t] != null) { c24 += c[t]; nh++; }
      if (ch[e.cod]) { e.chuva24 = nh ? +c24.toFixed(1) : null; e.chuva24_cob = +(nh / 24).toFixed(2); }
      e.coleta_navegador = fontes['ANA ' + e.cod] || null; }
    const nf = EST.filter(([c]) => fontes['ANA ' + c] && fontes['ANA ' + c].falhas > 0).length;
    d.ao_vivo = {leitura: d.af.h_t || d.af.t, ok: !!uaf && !(fontes['ANA 40740000']?.falhas) && !(fontes['ANA 40710001']?.falhas), falhas: nf, fontes: structuredClone(fontes)};
    return decidirLocal(d, base, now);
  }
  const reavaliar = (d, base) => decidirLocal(structuredClone(d), base, Date.now());
  return {atualizar, reavaliar, frescor, fontes, _t: {horaAna, horaOM, janela, cob, chuvaHoraria, cache, decidirLocal, lerLocal, gravarLocal, CHAVE}};
})();
