// Funções comuns às três abas: formatação, leitura de arquivos com tempo limite, gráficos com alternativa em texto,
// frescor dos dados e confirmação da publicação. Todo texto de fonte externa passa por esc() ou textContent.
window.C = (() => {
  const HEX = ['#2e9e5b', '#f2c230', '#f08a24', '#d93a26', '#8e1537'];
  const TXT = ['#ffffff', '#111111', '#111111', '#ffffff', '#ffffff'];
  const CINZA = '#8a99a3';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const ok = v => typeof v === 'number' && Number.isFinite(v);
  const f = (v, d = 0) => !ok(v) ? 'sem dado' : Number(v).toLocaleString('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d});
  const ms = s => s ? new Date(String(s).replace(' ', 'T').slice(0, 19) + (String(s).length <= 16 ? ':00' : '') + '-03:00').getTime() : NaN;
  const dtf = s => { if (!s) return 'sem dado'; const t = ms(s); if (!Number.isFinite(t)) return 'sem dado';
    return new Date(t).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'}); };
  const hm = s => s ? dtf(s).slice(-5) : 'sem dado';
  const ddm = s => s.slice(8, 10) + '/' + s.slice(5, 7);
  const idade = t => { const x = ms(t); return Number.isFinite(x) ? (Date.now() - x) / 36e5 : null; };
  const idh = h => h == null ? '' : h < 0 ? 'horário no futuro' : h < 1 ? `há ${Math.round(h * 60)} min` : h < 48 ? `há ${f(h, 1)} h` : `há ${f(h / 24, 0)} dias`;
  const FRESCOR = {atualizado: 'Em dia', atrasado: 'Atraso na fonte', desatualizado: 'Atraso na fonte', indisponivel: 'Indisponível para decisão', futuro: 'Horário no futuro', 'sem dado': 'Sem dado'};
  const selo = fr => `<span class="fr fr-${esc(fr || 'sem dado').replace(' ', '-')}">${esc(FRESCOR[fr] || fr || 'Sem dado')}</span>`;

  // leitura de arquivo do próprio site com tempo limite e verificação de JSON
  async function json(url, ms_ = 15000) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms_);
    try {
      const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), {cache: 'no-store', signal: ctl.signal});
      if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
      const tx = await r.text();
      try { return JSON.parse(tx); } catch (e) { throw new Error(`conteúdo inválido em ${url}`); }
    } catch (e) { throw e.name === 'AbortError' ? new Error(`${url} sem resposta em ${ms_ / 1000} s`) : e; }
    finally { clearTimeout(to); }
  }

  // gráficos: se a biblioteca não carregar, o painel mostra o resumo em texto e segue funcionando
  const temPlotly = () => typeof window.Plotly !== 'undefined';
  function plot(id, traces, layout, cfg, resumo) {
    const el = document.getElementById(id); if (!el) return;
    if (!temPlotly()) { el.classList.add('semgrafico'); el.innerHTML = `<p class="note">Gráfico indisponível (biblioteca de gráficos não carregou). ${esc(resumo || '')}</p>`; return; }
    try { Plotly.react(el, traces, layout, cfg); } catch (e) { el.innerHTML = `<p class="note">Falha ao desenhar o gráfico. ${esc(resumo || '')}</p>`; console.error(e); }
  }
  const PL = {paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: {family: 'IBM Plex Sans', color: '#333', size: 12}, margin: {l: 48, r: 12, t: 10, b: 36},
    xaxis: {gridcolor: '#eceff1', linecolor: '#c9d2d8'}, yaxis: {gridcolor: '#eceff1', linecolor: '#c9d2d8', rangemode: 'tozero'}, showlegend: false, hovermode: 'x unified',
    hoverlabel: {bgcolor: '#fff', bordercolor: '#c9d2d8', font: {color: '#111'}}};
  const CFG = {displaylogo: false, responsive: true, modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d']};
  const estreito = () => window.matchMedia('(max-width: 600px)').matches;

  // publicação efetiva: confirmada pela API pública de implantações do GitHub; sem resposta, fica "não confirmada"
  async function publicacao() {
    let v = null; try { v = await json('versao.json', 8000); } catch (e) { return {confirmada: false, motivo: 'versao.json indisponível'}; }
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch('https://api.github.com/repos/yurismvieira-dot/painel-cheias-brumadinho/deployments?environment=github-pages&per_page=5', {signal: ctl.signal}); clearTimeout(to);
      if (!r.ok) throw new Error(r.status);
      const lista = (await r.json()).filter(x => x.sha === v.commit);
      if (!lista.length) return {...v, confirmada: false, motivo: 'implantação deste snapshot não localizada'};
      let porCommit = null;
      for (const dep of lista) {
        const s = await fetch(dep.statuses_url).then(x => x.json()), suc = s.find(x => x.state === 'success');
        if (!suc) continue;
        if (String(suc.log_url || suc.target_url || '').includes(String(v.run_id))) return {...v, confirmada: true, publicado: suc.created_at, vinculo: 'execução'};
        porCommit = porCommit || suc;
      }
      return porCommit ? {...v, confirmada: true, publicado: porCommit.created_at, vinculo: 'commit'} : {...v, confirmada: false, motivo: 'implantação sem confirmação de sucesso'};
    } catch (e) { return {...v, confirmada: false, motivo: 'sem resposta da API do GitHub'}; }
  }
  // tendência: reta de mínimos quadrados das últimas `horas`, projetada `proj` horas. A faixa provável (80%) vem de um
  // retroteste do mesmo método na própria série: em cada hora dos últimos 30 dias, a reta das 6 h anteriores foi projetada
  // e comparada com a leitura real; P10 e P90 desses erros, para cada horizonte, formam a faixa.
  function reta(P) { const n = P.length, mx = P.reduce((a, p) => a + p[0], 0) / n, my = P.reduce((a, p) => a + p[1], 0) / n, sxx = P.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    if (!sxx) return null; const b = P.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx; return t => my + b * (t - mx); }
  function tendencia(serie, horas, proj) {
    const P = (serie || []).filter(p => p && p[1] != null).map(p => [Date.parse(String(p[0]).slice(0, 16) + ':00Z'), p[1]]).filter(p => Number.isFinite(p[0]));
    if (P.length < 3) return null;
    const H = 36e5, fim = P[P.length - 1][0], jan = (t0, t1) => P.filter(p => p[0] > t0 && p[0] <= t1);
    const W = jan(fim - horas * H, fim); if (W.length < 3 || (fim - W[0][0]) < horas * H * 0.5) return null;
    const g = reta(W); if (!g) return null;
    // retroteste
    const err = Array.from({length: proj}, () => []), perto = t => { let lo = 0, hi = P.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (P[m][0] < t) lo = m + 1; else hi = m; } return P[lo]; };
    for (let t = fim - 30 * 24 * H; t <= fim - H; t += H) { const w = jan(t - horas * H, t); if (w.length < 3 || t - w[0][0] < horas * H * 0.5) continue; const r = reta(w); if (!r) continue;
      for (let h = 1; h <= proj; h++) { const tt = t + h * H; if (tt > fim) break; const v = perto(tt); if (Math.abs(v[0] - tt) <= 0.6 * H) err[h - 1].push(v[1] - r(tt)); } }
    const q = (a, p) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i); return s.length ? s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo) : null; };
    const iso = t => new Date(t).toISOString().slice(0, 16), xs = [], c = [], lo = [], hi = [], v0 = P[P.length - 1][1];
    xs.push(iso(fim)); c.push(v0); lo.push(v0); hi.push(v0);
    for (let h = 1; h <= proj; h++) { const t = fim + h * H, v = g(t) - g(fim) + v0, e = err[h - 1]; xs.push(iso(t)); c.push(Math.max(0, v));
      lo.push(Math.max(0, v + (e.length >= 20 ? q(e, 0.1) : 0))); hi.push(Math.max(0, v + (e.length >= 20 ? q(e, 0.9) : 0))); }
    return {x: xs, c, lo, hi, taxa_h: (g(fim) - g(fim - H)), t1: xs[xs.length - 1], faixa: err[proj - 1].length >= 20};
  }
  // traços: faixa provável, projeção central tracejada; o texto vai na legenda, não dentro do gráfico
  const trTraces = (T, nome, u, nd) => T ? [
    {type: 'scatter', mode: 'lines', x: T.x, y: T.hi, line: {width: 0}, hoverinfo: 'skip', showlegend: false},
    ...(T.faixa ? [{type: 'scatter', mode: 'lines', x: T.x, y: T.lo, fill: 'tonexty', fillcolor: 'rgba(31,111,178,.20)', line: {width: 0}, name: 'Faixa provável da projeção (80%)', hovertemplate: `Faixa provável: %{y:.${nd}f} ${u}<extra></extra>`}] : []),
    {type: 'scatter', mode: 'lines', x: T.x, y: T.c, name: nome, line: {color: '#1f5fbf', width: 3, dash: 'dash'}, hovertemplate: `Projeção: %{y:.${nd}f} ${u}<extra></extra>`}] : [];
  return {tendencia, trTraces, HEX, TXT, CINZA, esc, ok, f, ms, dtf, hm, ddm, idade, idh, selo, FRESCOR, json, plot, PL, CFG, estreito, publicacao, temPlotly};
})();
