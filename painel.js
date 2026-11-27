// Painel em tempo real. Lógica de exibição; a decisão vem de motor.js (coletor e navegador) e de aovivo.js.
(() => {
const GEO = {"W":400,"H":442,"zonas":{"Z1":"M290.9,152.4 L314.7,165.7 L326.5,159.3 L332.7,163.3 L338.8,161.6 L343.5,172.0 L347.4,172.3 L353.4,168.0 L364.2,168.9 L370.1,160.4 L373.8,160.4 L374.0,167.5 L370.2,171.0 L380.8,179.7 L373.5,184.1 L372.3,193.8 L362.7,197.6 L392.0,204.5 L395.8,214.4 L393.3,219.8 L385.5,221.8 L385.3,228.0 L399.5,242.8 L399.5,250.0 L389.6,253.4 L393.0,262.3 L386.5,265.9 L380.2,282.4 L374.9,284.7 L377.8,294.0 L372.5,295.4 L370.2,309.4 L364.2,313.4 L365.4,316.1 L356.6,328.6 L341.8,328.2 L338.3,342.0 L329.9,343.3 L332.0,359.5 L325.3,362.7 L322.8,369.5 L330.3,381.4 L328.0,387.0 L324.7,385.8 L328.3,394.1 L326.4,398.5 L318.5,399.2 L318.1,404.4 L311.1,407.9 L308.7,415.3 L297.7,409.4 L285.6,412.2 L283.4,419.7 L277.2,415.4 L261.2,422.5 L253.4,416.8 L243.8,427.2 L237.9,421.8 L231.9,428.9 L224.2,431.1 L220.1,426.6 L223.0,398.9 L218.1,395.3 L220.6,392.3 L218.4,388.7 L222.8,385.9 L220.7,381.4 L223.6,372.3 L219.0,366.3 L224.6,352.7 L223.1,347.5 L216.0,343.2 L213.5,332.0 L202.1,325.3 L209.1,318.7 L207.1,305.8 L211.8,304.3 L203.6,277.1 L222.1,270.0 L223.4,261.4 L228.0,257.3 L228.1,245.5 L235.1,238.4 L231.4,234.9 L232.4,225.9 L221.9,228.4 L213.8,219.5 L218.3,213.9 L217.1,199.4 L234.3,184.9 L232.8,174.8 L236.9,173.7 L238.9,160.2 L249.0,153.3 L251.2,160.2 L255.0,155.7 L265.3,159.8 L275.9,151.8 L286.8,155.1 L290.9,152.4 ZM311.4,162.4 L311.6,162.2 L311.6,162.4 L311.4,162.4 Z","Z2":"M184.7,148.0 L176.7,155.4 L168.0,153.7 L163.3,169.5 L150.0,179.3 L151.2,183.4 L140.7,194.1 L132.9,193.0 L129.7,200.8 L121.7,200.3 L120.0,205.4 L112.5,203.3 L103.4,207.1 L101.1,214.5 L94.0,214.4 L88.9,223.3 L89.6,232.0 L85.0,232.7 L83.3,241.4 L76.8,243.1 L78.6,249.4 L73.2,252.2 L76.3,256.4 L59.6,264.9 L62.4,274.8 L71.1,277.7 L66.8,282.7 L69.2,284.8 L67.6,289.9 L61.2,288.0 L55.3,296.4 L49.9,297.7 L49.1,303.4 L54.0,303.4 L55.6,307.8 L52.0,314.7 L57.4,319.7 L46.7,324.4 L49.6,329.6 L45.5,331.8 L46.1,342.0 L38.4,344.2 L32.8,350.9 L37.5,364.6 L47.3,371.3 L48.8,385.6 L54.7,391.1 L53.5,403.2 L63.3,407.6 L73.6,404.8 L79.8,408.2 L86.5,406.5 L90.2,408.8 L90.4,414.5 L99.0,420.1 L100.1,425.5 L106.4,423.3 L113.8,429.6 L120.9,423.7 L136.2,429.3 L138.0,435.2 L142.7,435.5 L147.5,441.3 L154.8,428.1 L166.9,437.5 L172.0,433.3 L180.7,440.5 L192.7,437.2 L199.8,441.9 L214.1,426.0 L220.4,426.3 L224.0,408.8 L223.0,398.9 L218.1,395.3 L220.6,392.3 L218.4,388.7 L222.8,385.9 L220.7,381.4 L223.6,372.3 L219.0,366.3 L224.6,352.7 L223.1,347.5 L216.0,343.2 L213.5,332.0 L202.1,325.3 L209.1,318.7 L207.1,305.8 L211.8,304.3 L203.6,277.1 L222.1,270.0 L223.4,261.4 L228.0,257.3 L228.1,245.5 L234.0,242.0 L232.4,225.9 L220.9,228.0 L213.0,217.2 L218.3,213.9 L215.6,205.9 L218.1,197.6 L234.3,184.9 L232.8,174.8 L236.9,173.7 L239.9,158.6 L233.6,155.0 L232.7,161.5 L227.7,164.0 L207.3,155.0 L198.5,157.5 L196.1,152.8 L184.7,148.0 Z","Z3":"M89.6,232.0 L89.8,232.2 L89.6,232.2 L89.6,232.0 ZM151.3,183.4 L151.2,183.5 L151.2,183.4 L151.3,183.4 ZM63.2,129.9 L68.5,119.6 L65.5,111.7 L72.3,104.2 L72.9,88.6 L77.4,88.6 L78.9,79.8 L85.7,77.2 L98.3,81.6 L103.7,79.4 L97.8,70.1 L91.8,69.2 L89.5,61.7 L93.1,57.7 L91.2,51.2 L94.0,42.0 L98.4,39.2 L96.0,36.3 L98.4,31.7 L90.6,22.2 L93.7,14.7 L109.8,13.0 L121.1,18.3 L124.6,14.2 L133.8,14.8 L135.6,10.3 L139.2,11.9 L148.9,7.4 L156.3,13.8 L162.1,7.0 L168.9,9.5 L181.7,2.9 L188.1,4.5 L198.2,0.0 L208.8,2.1 L211.2,19.3 L206.7,24.3 L207.6,39.3 L215.6,67.3 L225.1,80.1 L229.5,96.9 L231.3,125.5 L236.4,142.4 L232.7,161.5 L229.5,164.2 L220.7,162.5 L206.2,154.8 L198.5,157.5 L196.1,152.8 L185.2,148.0 L176.7,155.4 L168.3,153.4 L163.3,169.5 L150.0,179.3 L151.2,183.4 L140.7,194.1 L132.9,193.0 L129.7,200.8 L121.7,200.3 L120.0,205.4 L112.5,203.3 L103.4,207.1 L101.1,214.5 L94.0,214.4 L88.9,223.3 L89.6,232.0 L85.0,232.7 L83.3,241.4 L76.8,243.1 L78.6,249.4 L73.2,252.2 L76.3,256.4 L59.6,264.9 L62.4,274.8 L46.4,273.8 L41.0,280.3 L34.3,281.9 L20.9,273.3 L17.2,262.3 L27.7,259.1 L26.8,254.3 L9.8,240.1 L7.3,226.9 L1.4,223.6 L13.0,207.3 L12.1,203.0 L4.7,204.8 L0.0,200.2 L9.4,187.8 L9.7,177.8 L15.6,169.0 L34.8,164.3 L38.7,157.8 L47.0,153.6 L45.7,150.1 L51.2,146.6 L55.3,130.6 L63.2,129.9 Z"},"cent":{"Z1":[292.3,291.4],"Z2":[133.1,294.9],"Z3":[144.0,140.9]},"rios":"M298.0,-46.0 L298.7,-56.1 L296.0,-64.9 L288.3,-72.4 L295.4,-77.7 L295.5,-81.8 L291.5,-86.2 L295.4,-86.0 L295.4,-89.6 L301.6,-88.3 L304.6,-97.4 L304.0,-102.3 L298.0,-108.2 M-137.1,173.5 L-150.1,160.1 L-148.1,155.6 L-150.3,151.8 L-158.4,146.6 L-160.2,140.9 L-157.5,137.1 L-159.8,132.6 L-164.3,132.6 L-164.8,127.3 L-171.7,124.4 L-169.3,121.2 L-172.5,113.5 L-169.0,111.6 L-176.3,107.9 L-176.3,104.3 L-190.8,102.0 L-197.3,104.6 L-205.4,97.4 L-204.4,92.2 L-214.8,84.1 L-218.3,71.2 L-231.6,56.5 L-225.7,52.5 L-227.8,45.5 L-226.2,44.7 L-232.8,44.1 L-239.5,32.8 L-242.9,33.4 L-240.5,30.7 L-249.4,22.2 L-253.1,14.7 M206.8,220.3 L206.7,209.2 L203.3,199.8 L191.2,196.8 L197.7,192.9 L198.9,196.2 L201.5,195.3 L202.3,191.2 L193.3,188.4 L198.9,183.7 L199.1,180.0 L196.5,179.1 L201.4,176.7 L196.2,174.6 L198.8,171.7 L183.7,173.4 L190.0,164.6 L183.7,163.6 L180.8,165.7 L178.2,161.1 L183.1,157.1 L180.6,153.1 L184.1,149.7 L181.0,146.0 L186.7,143.5 L180.5,139.2 L181.0,132.4 L177.5,132.1 L172.6,126.2 L176.4,122.8 L176.7,115.5 L173.4,112.9 L162.4,116.4 L161.1,119.7 L156.0,119.0 L157.7,113.4 L154.2,113.4 L160.1,105.8 L156.3,105.1 L158.7,103.1 L156.3,99.8 L151.3,103.9 L147.5,103.4 L146.5,97.5 L150.3,94.9 L149.5,90.4 L144.1,90.6 L141.8,87.8 L137.0,92.1 L140.4,95.4 L132.3,94.3 L128.0,97.5 L127.0,92.8 L131.2,90.7 L125.3,86.0 L131.5,82.7 L127.6,80.0 L130.0,75.1 L126.2,74.1 L129.7,70.3 L127.0,65.9 L129.7,60.5 L120.0,57.6 L116.9,59.7 L114.6,55.9 L110.2,57.0 L113.8,47.2 L118.2,51.1 L125.3,52.0 L133.2,44.4 L126.1,37.2 L126.5,29.2 L123.5,29.2 L118.7,23.4 L110.2,25.1 L113.5,19.5 L105.1,18.1 L106.1,8.3 L96.1,4.5 L93.1,0.6 L89.9,2.4 L88.6,0.0 L81.5,-1.2 L83.6,-4.2 L80.4,-7.1 L78.0,-0.6 L74.5,-5.3 L79.5,-15.6 L77.1,-26.5 L79.4,-38.9 L75.6,-44.3 L84.1,-47.3 L85.4,-51.5 L80.9,-56.2 L73.2,-52.9 L75.0,-56.4 L68.2,-59.6 L62.7,-58.2 L62.0,-52.5 L59.1,-52.3 L56.4,-56.8 L53.2,-54.4 L47.9,-62.7 L53.1,-66.1 L50.8,-69.2 L53.8,-71.1 L49.3,-78.6 L46.3,-79.8 L43.5,-77.4 L41.1,-89.8 L43.1,-91.9 L38.1,-101.0 L30.7,-101.1 L27.2,-108.2 M59.1,538.8 L56.8,535.8 L51.2,536.4 L49.3,528.2 L46.3,526.5 L47.6,521.7 L41.7,519.6 L42.0,513.5 L37.5,512.2 L34.5,505.7 L30.1,503.4 L29.2,508.5 L22.2,510.4 L23.6,513.8 L16.0,516.9 L17.5,519.9 L13.3,518.5 L7.9,520.9 L9.7,525.5 L6.7,527.4 L3.3,526.2 L5.4,523.7 L2.4,520.2 L-3.0,520.6 L-5.4,525.5 L-10.1,527.3 L-10.3,530.8 L-17.1,525.9 L-20.9,534.5 L-31.6,533.9 L-31.1,528.2 L-35.2,532.0 L-35.2,535.8 L-44.0,530.2 L-44.3,534.5 L-47.6,534.7 L-54.1,541.6 L-59.9,534.4 L-61.1,537.3 L-70.6,538.6 L-75.7,536.7 L-77.1,538.9 L-87.5,533.8 L-102.2,534.4 L-108.2,528.6 L-112.6,531.8 L-110.2,535.1 L-115.3,536.5 L-120.2,532.9 L-121.8,536.1 L-130.9,538.8 L-131.2,527.6 L-137.1,525.8 L-137.4,529.9 L-150.4,535.4 L-159.8,530.6 L-164.2,531.8 L-168.9,538.6 L-175.4,536.7 L-182.0,546.8 L-197.6,547.7 L-199.4,549.7 L-195.5,553.7 L-199.5,556.8 L-211.5,554.5 L-217.2,559.2 L-222.7,552.4 L-222.4,549.2 L-231.6,540.4 L-238.2,547.1 L-242.8,542.6 L-245.0,544.8 L-248.7,543.8 L-249.4,540.1 L-253.1,542.6","est":{"40740000":[105.7,13.4,"Alberto Flores"],"40710001":[183.7,148.9,"Belo Vale"],"40680001":[155.5,290.3,"Entre Rios"],"40686000":[201.3,233.7,"Camapu\u00e3"],"40700050":[211.9,223.6,"Salto do Paraopeba"],"40700080":[203.5,204.6,"Salto (barr.)"],"40712500":[91.6,129.9,"Bonfim"]},"sede":[83.6,0.1]};
// posição no mapa das estações que podem entrar no cálculo (mesma projeção do mapa das zonas)
const POS = {'40740000': [105.7, 13.4, 'Alberto Flores'], '40710001': [183.7, 148.9, 'Belo Vale'], '40680001': [155.5, 290.3, 'Entre Rios de Minas'],
  '40686000': [201.3, 233.7, 'PCH Salto do Paraopeba Rio Camapuã'], '40700050': [211.9, 223.6, 'PCH Salto do Paraopeba montante'],
  '40700080': [203.5, 204.6, 'PCH Salto do Paraopeba barramento'], '40712500': [91.6, 129.9, 'Bonfim'], '40712000': [91.0, 135.4, 'CGH Caquende jusante'],
  '40712600': [85.2, 123.4, 'CGH Juliões jusante'], '2043133': [334.1, 270.5, 'Conselheiro Lafaiete (IGAM)'], '2043013': [291.3, 212.7, 'Congonhas linígrafo']};
const {HEX, TXT, CINZA, esc, f, dtf, hm, ddm, idade, idh, selo, PL, CFG, plot} = C;
const SIT = ['Sem risco de inundação', 'Água na planície e nas áreas baixas da beira-rio', 'Edificações da beira-rio atingidas', 'Centro alagado (referência 2012)', 'Nível de 2022 ou superior'];
const FONTE = {medicao: 'medição', modelo: 'modelo', misto: 'misto', 'sem dado': 'sem dado'};
const $ = id => document.getElementById(id);
const chip = (n, N, e) => n == null ? `<span class="chip nd">Sem dado</span>` : `<span class="chip" style="background:${HEX[n]};color:${TXT[n]}">${esc(N[n])}${e === 'parcial' ? ' · parcial' : ''}</span>`;
let ZOOM = 720, FIT = false, D = null, BASE = null, OP = null, PUB = null, RG = null, busy = false, ultimaFalha = null, ultimaOk = null;

function gaps(serie, maxh) { const o = []; for (let i = 0; i < serie.length; i++) { if (i && (new Date(serie[i][0]) - new Date(serie[i - 1][0])) / 36e5 > maxh) o.push([serie[i - 1][0], null]); o.push(serie[i]); } return o; }
function xr(serie) { if (!serie.length) return undefined; const e = new Date(serie[serie.length - 1][0] + ':00Z').getTime(), a = e - ZOOM * 36e5; const iso = t => new Date(t).toISOString().slice(0, 16).replace('T', ' '); return [iso(a), iso(e + Math.max(1, ZOOM / 24) * 36e5)]; }
const bands = (lims, top) => { const s = [], ys = [0, ...lims, top]; for (let i = 0; i < ys.length - 1; i++) s.push({type: 'rect', xref: 'paper', x0: 0, x1: 1, y0: ys[i], y1: ys[i + 1], fillcolor: HEX[i], opacity: .08, line: {width: 0}, layer: 'below'}); return s; };
const hlines = lims => lims.map((v, i) => ({type: 'line', xref: 'paper', x0: 0, x1: 1, y0: v, y1: v, line: {color: HEX[i + 1], width: 1.5, dash: 'dot'}}));
const hlabels = (lims, N, u) => lims.map((v, i) => ({xref: 'paper', x: 1, y: v, xanchor: 'right', yanchor: 'bottom', text: `${N[i + 1]} ${f(v, u === 'm' ? 1 : 0)} ${u}`, showarrow: false, font: {size: 11, color: HEX[i + 1]}}));

// mostrador de chuva: sem dado, sem ponteiro (nunca posiciona em zero)
function gauge(v, lim, n) {
  const top = Math.max(lim[3] * 1.25, C.ok(v) ? v * 1.05 : 0), W = 220, H = 128, cx = 110, cy = 112, R = 92, r = 70, ang = x => Math.PI * (1 - Math.min(x, top) / top);
  const arc = (a0, a1, c) => { const p = (a, rr) => [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r); return `<path d="M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 0 0 ${x3},${y3} Z" fill="${c}"/>`; };
  const ys = [0, ...lim, top]; let s = ''; for (let i = 0; i < 5; i++) s += arc(ang(ys[i]), ang(ys[i + 1]), C.ok(v) ? HEX[i] + (i === n ? '' : '55') : '#d5dbdf');
  lim.forEach(t => { const a = ang(t); s += `<text x="${cx + (R + 10) * Math.cos(a)}" y="${cy - (R + 10) * Math.sin(a)}" font-size="10" fill="#555" text-anchor="middle">${t}</text>`; });
  if (C.ok(v)) { const a = ang(v); s += `<line x1="${cx}" y1="${cy}" x2="${cx + (R + 2) * Math.cos(a)}" y2="${cy - (R + 2) * Math.sin(a)}" stroke="#111" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="6" fill="#111"/>`; }
  else s += `<text x="${cx}" y="${cy - 18}" font-size="14" font-weight="600" fill="#555" text-anchor="middle">Sem informação</text>`;
  return `<svg viewBox="0 -12 ${W} ${H + 12}" class="gauge" role="img" aria-label="${C.ok(v) ? f(v, 0) + ' mm em 5 dias' : 'sem informação'}">${s}</svg>`;
}

function tempos(d) {
  const it = [];
  it.push(`Régua medida às ${hm(d.af.h_t || d.af.t)} ${idh(idade(d.af.h_t || d.af.t))}`);
  it.push(`Vazão de Belo Vale medida às ${hm(d.bv.q_t || d.bv.t)} ${idh(idade(d.bv.q_t || d.bv.t))}`);
  const fa = d.zonas.Z1.fim_acumulado; if (fa) it.push(`Chuva acumulada até ${hm(fa)}`);
  it.push(`Snapshot gerado ${dtf(d.geracao_snapshot || d.coleta)}${d.id_snapshot ? ' (' + d.id_snapshot.slice(0, 8) + ')' : ''}`);
  if (PUB) it.push(PUB.confirmada ? `Publicação confirmada ${dtf(new Date(PUB.publicado).toLocaleString('sv', {timeZone: 'America/Sao_Paulo'}))}` : `Publicação não confirmada (${PUB.motivo})`);
  if (OP) it.push(`Última tentativa de coleta ${dtf(OP.ultima_tentativa)}: ${OP.resultado === 'ok' ? 'completa' : OP.resultado === 'degradado' ? 'parcial' : 'falhou'}`);
  if (d.verificado) it.push(`Verificado neste navegador às ${hm(d.verificado)}`);
  return it.map(x => `<span>${esc(x)}</span>`).join('');
}

function render(d) {
  const N = d.niveis_nomes, L = d.limites, st = d.nivel.status || 'valido', n0 = d.nivel.atual, Q = d.qualidade || {};
  const col = d.coleta || d.atualizado, age = idade(col), viv = d.ao_vivo && d.ao_vivo.ok;
  $('upd').textContent = ultimaFalha ? `Falha ao atualizar às ${hm(ultimaFalha.t)} (${ultimaFalha.msg}) · exibindo dados de ${dtf(col)}`
    : viv ? `Ao vivo · verificado às ${hm(d.verificado)}` : d.ao_vivo ? 'Telemetria ao vivo indisponível · exibindo a última coleta publicada' : `Última coleta ${dtf(col)} · conectando à telemetria`;
  $('tempos').innerHTML = tempos(d);
  const velho = age == null || age > 1; $('dot').className = 'dot' + ((velho && !viv) || ultimaFalha ? ' old' : '');
  const msg = [];
  if (velho) msg.push(`A última coleta publicada pelo servidor tem ${f(age, 1)} horas${viv ? '; os valores abaixo foram atualizados diretamente da telemetria neste navegador' : ''}. A rotina automática de atualização pode estar atrasada.`);
  if (OP && OP.resultado !== 'ok' && OP.falhas_consecutivas) msg.push(`As últimas ${OP.falhas_consecutivas} tentativas de coleta do servidor não foram completas (${OP.mensagem}).`);
  if (st === 'indeterminado') msg.push(n0 ? `Dados insuficientes para recalcular o nível; mantido ${N[n0]}, o último nível registrado. Consulte diretamente a régua e a Defesa Civil.` : 'Nível indeterminado: não há leitura válida suficiente (régua, Belo Vale e duas zonas de chuva completas) para afirmar a condição atual. Consulte diretamente a régua e a Defesa Civil.');
  $('warn').hidden = !msg.length; $('warn').textContent = msg.join(' ');
  // faixa de nível: um nível acima de Normal nunca é ocultado por falta de dados
  const n = st === 'indeterminado' && !n0 ? null : n0;
  const bn = $('banner'), cn = n == null ? CINZA : HEX[n]; bn.style.background = cn; bn.style.color = n == null ? '#fff' : TXT[n];
  $('bnV').textContent = n == null ? 'Indeterminado' : N[n] + (st === 'indeterminado' ? ' · mantido' : st === 'degradado' ? ' · dados parciais' : '');
  const drv = d.nivel.indicadores.filter(i => i.nivel === d.nivel.bruto && i.nivel > 0).map(i => i.nome.toLowerCase());
  $('bnT').textContent = n == null ? 'Sem leitura válida suficiente e nenhum indicador acionado.' :
    st === 'indeterminado' ? `${SIT[n]}. Nível mantido: há dados insuficientes para confirmar ou rebaixar.` :
    n === 0 ? (st === 'valido' ? 'Nenhum indicador atingiu o limite de Atenção. ' + SIT[0] + '.' : 'Nenhum indicador disponível atingiu o limite de Atenção, mas há dado parcial; o Normal não é confirmado por todos os indicadores.') :
    `${SIT[n]}.${drv.length ? ' Indicado por ' + drv.join(', ') + '.' : ''}`;
  // horário da verificação sempre visível; "desde" só aparece quando há nível acima de Normal, para não parecer dado parado
  const verif = `Dados verificados às ${hm(d.verificado || d.coleta)}; régua medida às ${hm(d.af.h_t || d.af.t)}.`;
  $('bnS').textContent = [n ? `${N[n]} desde ${dtf(d.nivel.desde)}${d.nivel.causa ? ' (' + d.nivel.causa.toLowerCase() + ')' : ''}.` : '', verif,
    d.nivel.elevado_ao_vivo ? `Elevação detectada pela telemetria ao vivo neste navegador; nível publicado pelo servidor: ${d.nivel.oficial == null ? 'indeterminado' : N[d.nivel.oficial]}.` : '',
    d.nivel.motivo && d.nivel.motivo !== 'rebaixamento reservado ao coletor' ? 'Rebaixamento: ' + d.nivel.motivo + '.' : ''].filter(Boolean).join(' ');
  document.querySelectorAll('#steps li').forEach((li, i) => { li.className = n != null && i === n ? 'cur' : n != null && i < n ? 'past' : ''; li.style.setProperty('--c', HEX[i]); });
  const af = d.af, bv = d.bv, Z = d.zonas;
  $('kAF').textContent = af.h == null ? 'sem dado' : `${f(af.h, 2)} m`; $('kAF').className = Q.nivel?.estado === 'indisponivel' ? 'old' : '';
  $('kAFt').innerHTML = `${af.tendencia_cm_h == null ? '' : esc(`${af.tendencia_cm_h > 0.5 ? 'Subindo' : af.tendencia_cm_h < -0.5 ? 'Descendo' : 'Estável'} ${f(Math.abs(af.tendencia_cm_h), 1)} cm/h · `)}${esc(dtf(af.h_t || af.t))} ${selo(Q.nivel?.frescor)}`;
  $('kBV').textContent = bv.q == null ? 'sem dado' : `${f(bv.q, 0)} m³/s`; $('kBV').className = Q.vazao?.estado === 'indisponivel' ? 'old' : '';
  $('kBVt').innerHTML = `${esc(`Atenção em ${f(L.BV[0])} m³/s · ${dtf(bv.q_t || bv.t)}`)} ${selo(Q.vazao?.frescor)}`;
  const zv = Object.keys(Z).filter(z => C.ok(Z[z].P5));
  if (zv.length) { const zmax = zv.reduce((a, b) => Z[b].P5 > Z[a].P5 ? b : a);
    $('kP5').textContent = `${f(Z[zmax].P5, 0)} mm`;
    $('kP5t').textContent = `Zona ${zmax} · Atenção em ${Z[zmax].limites[0]} mm · ${Math.round((Z[zmax].cob5_medida ?? 0) * 100)}% medida${zv.length < 3 ? ' · zona sem dado: ' + Object.keys(Z).filter(z => !zv.includes(z)).join(', ') : ''}`; }
  else { $('kP5').textContent = 'sem dado'; $('kP5t').textContent = 'Nenhuma zona com chuva disponível'; }
  $('kSolo').textContent = d.solo.estado === 'indeterminado' ? 'Indeterminado' : d.solo.umido ? 'Úmido' : 'Normal';
  $('kSolot').textContent = `Alberto Flores ontem ${f(d.solo.af_q_ontem, 0)} m³/s · 30 dias na bacia ${f(d.solo.p30_bacia, 0)} mm${d.solo.estado === 'indeterminado' ? ' · ' + d.solo.criterio : ''}`;
  $('ind').innerHTML = d.nivel.indicadores.map(i => `<div><span>${esc(i.nome)}${i.idade_h != null ? ` <small>${esc(idh(i.idade_h))}</small>` : ''}${i.motivo && i.estado !== 'ok' ? ` <small>· ${esc(i.motivo)}</small>` : ''}</span>${chip(i.nivel, N, i.estado)}</div>`).join('')
    + (d.nivel.bruto_solo_umido != null && d.nivel.bruto_solo_umido > (d.nivel.bruto ?? -1) ? `<div><span>Cenário com solo úmido (umidade indeterminada)</span>${chip(d.nivel.bruto_solo_umido, N)}</div>` : '');
  const cor = a => a.tipo === 'dado' ? CINZA : HEX[a.nivel];
  $('alerts').innerHTML = d.alertas.length ? d.alertas.map(a => `<li style="border-left-color:${cor(a)}">${a.tipo === 'previsao' ? '<b>Previsão. </b>' : a.tipo === 'dado' ? '<b>Dados. </b>' : a.tipo === 'cenario' ? '<b>Cenário. </b>' : ''}${esc(a.texto)}</li>`).join('') : '<li style="border-left-color:var(--n0)">Nenhum alerta ativo. Todos os indicadores estão abaixo do limite de Atenção.</li>';
  const pm = d.previsao_meta || {};
  $('fprev').textContent = `Chuva observada somada à prevista para os próximos dias. ${pm.fonte ? 'Fonte: ' + pm.fonte + '. ' : ''}${pm.ultimo_sucesso ? 'Previsão obtida ' + dtf(pm.ultimo_sucesso) + (pm.estado === 'desatualizada' ? ' (desatualizada)' : '') + '.' : ''}`;
  $('fc').innerHTML = d.previsao.length ? d.previsao.map(p => `<div style="border-top:5px solid ${HEX[p.nivel]}"><span>${ddm(p.d)}</span><b>${esc(N[p.nivel])}</b><small>Z1 ${f(p.P5.Z1, 0)} · Z2 ${f(p.P5.Z2, 0)} · Z3 ${f(p.P5.Z3, 0)} mm${p.parcial ? ' · previsão parcial' : ''}</small></div>`).join('') : '<div>Previsão indisponível ou desatualizada</div>';
  mapa(d, N);
  zonas(d, N);
  regua(d, N, L);
  reguas(d);
  $('tbLim').innerHTML = [1, 2, 3, 4].map(i => `<tr><td>${chip(i, N)}</td><td class="n">${f(L.AF[i - 1], 1)} m</td><td class="n">${f(L.BV[i - 1])} m³/s</td><td class="n">${L.Z1[i - 1]} / ${L.Z2[i - 1]} / ${L.Z3[i - 1]} mm</td><td>${SIT[i]}</td></tr>`).join('');
}

function mapa(d, N) {
  const Z = d.zonas; let s = '';
  for (const z in GEO.zonas) { const zn = Z[z]?.nivel; s += `<path d="${GEO.zonas[z]}" fill="${zn == null ? '#b8c2c8' : HEX[zn]}" fill-opacity="${zn ? 0.6 : 0.28}" stroke="#fff" stroke-width="2"><title>${z} ${esc(Z[z]?.nome)}: ${f(Z[z]?.P5, 0)} mm em 5 dias</title></path>`; }
  s += `<path d="${GEO.rios}" fill="none" stroke="#1f6fb2" stroke-width="2"/>`;
  const est = c => (d.estacoes || []).find(e => e.cod === c);
  // pluviômetros que entram no cálculo da chuva das zonas
  const usados = [...new Set(Object.values(Z).flatMap(z => z.pluviometros || []))];
  for (const c of usados) { if (c === '40740000' || c === '40710001' || !POS[c]) continue; const [x, y, nm] = POS[c], e = est(c), fr = e?.variaveis?.chuva?.frescor, vivo = fr === 'atualizado' || fr === 'atrasado';
    s += `<circle cx="${x}" cy="${y}" r="5" fill="${vivo ? '#2e7d4f' : '#fff'}" stroke="${vivo ? '#14532d' : CINZA}" stroke-width="1.8"><title>${esc(nm)} (${c}) · pluviômetro usado na chuva da zona · ${esc(C.FRESCOR[fr] || 'sem dado')}</title></circle>`; }
  { const [x, y] = POS['40740000'], fr = d.qualidade?.nivel?.frescor, nv = d.af.nivel, h = d.af.h, hh = C.ok(h) ? Math.min(26, Math.max(2, h / 13 * 26)) : 0;
    s += `<g><title>Régua de Alberto Flores (40740000) · cota ${f(h, 2)} m · ${esc(C.FRESCOR[fr] || 'sem dado')}</title><rect x="${x - 4}" y="${y - 14}" width="8" height="26" fill="#fff" stroke="#111" stroke-width="1.6"/>${[0, 1, 2, 3, 4].map(i => `<line x1="${x - 4}" x2="${x + (i % 2 ? 0 : 3)}" y1="${y - 10 + i * 5}" y2="${y - 10 + i * 5}" stroke="#111" stroke-width="1.2"/>`).join('')}${hh ? `<rect x="${x - 4}" y="${y + 12 - hh}" width="8" height="${hh}" fill="${nv == null ? CINZA : HEX[nv]}" opacity=".85"/>` : ''}</g><text x="${x + 9}" y="${y + 2}" class="ml">Régua · Alberto Flores</text>`; }
  { const [x, y] = POS['40710001'], nv = d.bv.nivel;
    s += `<g><title>Medição de vazão em Belo Vale (40710001) · ${f(d.bv.q, 0)} m³/s${nv == null ? ' · sem leitura válida' : ''}</title><rect x="${x - 7}" y="${y - 7}" width="14" height="14" fill="${nv == null ? '#fff' : HEX[nv]}" stroke="${nv == null ? CINZA : '#111'}" stroke-width="1.6" transform="rotate(45 ${x} ${y})"/></g><text x="${x + 11}" y="${y + 4}" class="ml">Vazão · Belo Vale</text>`; }
  const [sx, sy] = GEO.sede; s += `<rect x="${sx - 7}" y="${sy - 7}" width="14" height="14" fill="#111" stroke="#fff" stroke-width="2"/><text x="${sx - 10}" y="${sy - 8}" text-anchor="end" class="ml">Brumadinho (sede)</text>`;
  for (const z in GEO.cent) { const [x, y] = GEO.cent[z], np = (Z[z].pluviometros || []).length; s += `<text class="zl" x="${x}" y="${y}" text-anchor="middle">${z}</text><text class="zv" x="${x}" y="${y + 18}" text-anchor="middle">${f(Z[z]?.P5, 0)} mm</text><text class="zs" x="${x}" y="${y + 33}" text-anchor="middle">${np} pluviômetro${np === 1 ? '' : 's'} · ${Math.round((Z[z].cob5_medida ?? 0) * 100)}% medida</text>`; }
  const m = $('map'); m.setAttribute('viewBox', `-10 -24 ${GEO.W + 20} ${GEO.H + 34}`); m.innerHTML = s;
  $('leg').innerHTML = N.map((t, i) => `<span><i style="background:${HEX[i]}"></i>${esc(t)}</span>`).join('') + '<span><i class="sq"></i>Sede</span><span><svg width="12" height="18"><rect x="2" y="1" width="8" height="16" fill="#fff" stroke="#111" stroke-width="1.5"/></svg>Régua (Alberto Flores)</span><span><svg width="16" height="16"><rect x="4" y="4" width="8" height="8" fill="#fff" stroke="#111" stroke-width="1.5" transform="rotate(45 8 8)"/></svg>Medição de vazão (Belo Vale)</span><span><svg width="14" height="14"><circle cx="7" cy="7" r="4.5" fill="#2e7d4f" stroke="#14532d" stroke-width="1.5"/></svg>Pluviômetro em uso, transmitindo</span><span><svg width="14" height="14"><circle cx="7" cy="7" r="4.5" fill="#fff" stroke="#8a99a3" stroke-width="1.5"/></svg>Pluviômetro em uso, sem transmissão recente</span>';
}

function zonas(d, N) {
  const Z = d.zonas;
  $('zones').innerHTML = Object.keys(Z).map(z => { const v = Z[z];
    const pl = v.pluviometros && v.pluviometros.length ? 'Pluviômetros ' + esc(v.pluviometros.join(', ')) : 'Sem pluviômetro telemétrico com dado; estimativa por modelo meteorológico';
    return `<div class="card"><div class="ch"><b>${z} · ${esc(v.nome)}</b>${chip(v.nivel, N)}</div>
    <div class="note"><span class="src s-${esc(v.fonte)}">${esc(FONTE[v.fonte] || v.fonte)}</span> ${pl}. Em 5 dias: ${f((v.cob5_medida ?? 0) * 100, 0)}% das horas medidas, ${f((v.cob5_estimada ?? 0) * 100, 0)}% estimadas por modelo, cobertura espacial dos pluviômetros ${f((v.cob5_espacial ?? 0) * 100, 0)}%.${v.fim_acumulado ? ' Acumulado até ' + esc(hm(v.fim_acumulado)) + '.' : ''}${v.hora_parcial ? ` Hora em curso (parcial, medida): ${f(v.hora_parcial.mm, 1)} mm.` : ''}</div>
    <div class="gw">${gauge(v.P5, v.limites, v.nivel ?? -1)}<div class="gv">${f(v.P5, 0)}<small>mm em 5 dias</small></div></div>
    <div class="row4"><div>24 h<b>${f(v.P24, 0)}</b></div><div>72 h<b>${f(v.P72, 0)}</b></div><div>30 dias<b>${f(v.P30, 0)}</b></div><div>Prev. 72 h<b>${f(v.prev72, 0)}</b></div></div>
    <div class="fig" id="g${z}"></div></div>`; }).join('');
  for (const z in Z) { const v = Z[z], dd = v.diario.map(x => x.d), ob = v.diario.map(x => x.obs), fo = v.diario.map(x => x.fonte || 'medicao'), px = v.previsao.map(x => x.d), py = v.previsao.map(x => x.prev);
    const tot = {}; dd.forEach((x, i) => { if (ob[i] != null) tot[x] = (tot[x] || 0) + ob[i]; else if (!(x in tot)) tot[x] = null; }); px.forEach((x, i) => { if (py[i] != null) tot[x] = (tot[x] || 0) + py[i]; else if (!(x in tot)) tot[x] = null; });
    const xs = Object.keys(tot).sort(), vals = xs.map(x => tot[x]), p5 = vals.map((_, i) => { if (i < 4) return null; const w = vals.slice(i - 4, i + 1); return w.some(x => x == null) ? null : w.reduce((a, b) => a + b, 0); });
    const om = ob.map((y, i) => fo[i] === 'medicao' ? y : null), oe = ob.map((y, i) => fo[i] !== 'medicao' ? y : null), lim = v.limites, top = Math.max(lim[3] * 1.15, ...p5.filter(x => x != null));
    plot('g' + z, [{type: 'bar', x: dd, y: om, name: 'Medida', marker: {color: '#1f6fb2'}, hovertemplate: '%{y:.1f} mm medida'},
      {type: 'bar', x: dd, y: oe, name: 'Estimada ou mista', marker: {color: '#5aa0d6', pattern: {shape: '/', fillmode: 'overlay', fgcolor: '#ffffff', fgopacity: 0.6, size: 6}}, hovertemplate: '%{y:.1f} mm estimada'},
      {type: 'bar', x: px, y: py, name: 'Prevista', marker: {color: '#c6dcef', line: {color: '#5aa0d6', width: 1}}, hovertemplate: '%{y:.1f} mm prevista'},
      {type: 'scatter', mode: 'lines', x: xs, y: p5, name: 'Chuva de 5 dias', connectgaps: false, line: {color: '#111', width: 2}, hovertemplate: '%{y:.0f} mm'}],
      {...PL, showlegend: z === 'Z1', legend: {orientation: 'h', y: 1.18, font: {size: 10}}, barmode: 'stack', yaxis: {...PL.yaxis, title: {text: 'mm', font: {size: 11}}, range: [0, top]}, xaxis: {...PL.xaxis, type: 'date', tickformat: '%d/%m'}, bargap: .15,
        shapes: [...hlines(lim), dd.length ? {type: 'line', x0: dd[dd.length - 1], x1: dd[dd.length - 1], yref: 'paper', y0: 0, y1: 1, line: {color: CINZA, width: 1, dash: 'dash'}} : null].filter(Boolean), annotations: hlabels(lim, N, 'mm')}, CFG,
      `Chuva de 5 dias em ${z}: ${f(v.P5, 0)} mm.`); }
}

function regua(d, N, L) {
  const af = d.af, Lr = L.AF, H = Math.max(12.5, C.ok(af.h) ? Math.ceil(af.h + 1) : 0), RH = 380, y = v => RH - 14 - (v / H) * (RH - 28); let r = ''; const ys = [0, ...Lr, H];
  for (let i = 0; i < 5; i++) r += `<rect x="58" y="${y(ys[i + 1])}" width="34" height="${y(ys[i]) - y(ys[i + 1])}" fill="${HEX[i]}" fill-opacity=".9"/>`;
  for (let k = 0; k <= Math.floor(H); k++) r += `<line x1="50" x2="58" y1="${y(k)}" y2="${y(k)}" stroke="#555"/><text x="44" y="${y(k) + 4}" text-anchor="end" font-size="11" fill="#555">${k}</text>`;
  [['1997', 11.75], ['2008', 11.20], ['2022', 10.54], ['2012', 9.41]].forEach(([a, v]) => { r += `<line x1="92" x2="104" y1="${y(v)}" y2="${y(v)}" stroke="#111"/><text x="108" y="${y(v) + 4}" font-size="11" fill="#333">${a} ${f(v, 2)}</text>`; });
  if (C.ok(af.h)) r += `<rect x="58" y="${y(af.h)}" width="34" height="${y(0) - y(af.h)}" fill="${d.qualidade?.nivel?.estado === 'indisponivel' ? CINZA : '#1f6fb2'}" fill-opacity=".85"/><polygon points="96,${y(af.h)} 110,${y(af.h) - 7} 110,${y(af.h) + 7}" fill="#111"/><text x="114" y="${y(af.h) + 5}" font-size="14" font-weight="700" fill="#111">${f(af.h, 2)} m</text>`;
  else r += `<text x="100" y="${RH / 2}" font-size="13" fill="#555">Sem leitura</text>`;
  $('regua').setAttribute('viewBox', `0 0 200 ${RH}`); $('regua').innerHTML = r;
  const sA = gaps(af.serie, 2), ax = sA.map(p => p[0]), ay = sA.map(p => p[1]), vA = ay.filter(x => x != null), topA = FIT && vA.length ? Math.max(...vA) * 1.25 : Math.max(11.5, ...vA);
  plot('gAF', [{type: 'scatter', mode: 'lines', x: ax, y: ay, connectgaps: false, line: {color: '#1f6fb2', width: 2}, fill: 'tozeroy', fillcolor: 'rgba(31,111,178,.10)', hovertemplate: '%{y:.2f} m'}],
    {...PL, yaxis: {...PL.yaxis, title: {text: 'Cota na régua (m)', font: {size: 11}}, range: [0, topA]}, xaxis: {...PL.xaxis, type: 'date', tickformat: ZOOM <= 72 ? '%d/%m %Hh' : '%d/%m', range: xr(af.serie)}, shapes: [...bands(Lr, topA), ...hlines(Lr)], annotations: hlabels(Lr, N, 'm')}, CFG,
    `Última cota: ${f(af.h, 2)} m às ${hm(af.h_t || af.t)}.`);
  const bv = d.bv, sB = gaps(bv.serie, 2), bx = sB.map(p => p[0]), by = sB.map(p => p[1]), vB = by.filter(x => x != null), Lb = L.BV, topB = FIT && vB.length ? Math.max(...vB) * 1.25 : Math.max(Lb[3] * 1.15, ...vB);
  plot('gBV', [{type: 'scatter', mode: 'lines', x: bx, y: by, connectgaps: false, line: {color: '#1f6fb2', width: 2}, fill: 'tozeroy', fillcolor: 'rgba(31,111,178,.10)', hovertemplate: '%{y:.0f} m³/s'}],
    {...PL, yaxis: {...PL.yaxis, title: {text: 'Vazão (m³/s)', font: {size: 11}}, range: [0, topB]}, xaxis: {...PL.xaxis, type: 'date', tickformat: ZOOM <= 72 ? '%d/%m %Hh' : '%d/%m', range: xr(bv.serie)}, shapes: [...bands(Lb, topB), ...hlines(Lb)], annotations: hlabels(Lb, N, 'm³/s')}, CFG,
    `Última vazão: ${f(bv.q, 0)} m³/s às ${hm(bv.q_t || bv.t)}.`);
}

const RGC = {'40700050': '#8f6b9a', '40710001': '#f08a24', '40740000': '#1f6fb2'};
const EIXO = ['40700050', '40710001', '40740000'];
function reguas(d) {
  if (!RG || !d.reguas) return; const L = d.limites, cods = EIXO.filter(c => RG[c] && d.reguas[c]);
  const val = (sr, t) => { let b = null; for (const p of sr) if (p[0] <= t) b = p; return b; };
  const param = c => c === '40740000' ? `Limites de controle: Atenção ${f(L.AF[0], 1)} m, Alerta ${f(L.AF[1], 1)} m, Alerta máximo ${f(L.AF[2], 1)} m, Emergência ${f(L.AF[3], 1)} m` :
    c === '40710001' ? `Limites de vazão: Atenção ${f(L.BV[0])}, Alerta ${f(L.BV[1])}, Alerta máximo ${f(L.BV[2])}, Emergência ${f(L.BV[3])} m³/s; pico chega à sede em 12 a 24 h` :
    'Sem limite de controle no estudo; referência: cotas das cheias de 2020 e 2022 nesta régua';
  $('tbRg').innerHTML = cods.map(c => { const r = RG[c], sr = d.reguas[c], u = sr[sr.length - 1], age = u ? idade(u[0]) : null, ok = u && age <= 3;
    let v24 = null; if (u) { const t0 = new Date(new Date(u[0] + ':00Z').getTime() - 864e5).toISOString().slice(0, 16), a = val(sr, t0); if (a && (new Date(a[0] + ':00Z') - new Date(t0 + ':00Z')) > -3 * 36e5) v24 = (u[1] - a[1]) * 100; }
    const rel = h => (h - r.base) / (r.max.h - r.base), pc = u ? Math.max(0, rel(u[1])) : null, e20 = r.eventos['2020'], e22 = r.eventos['2022'];
    const cor = pc == null ? '#b8c2c8' : pc >= .9 ? '#8e1537' : pc >= .7 ? '#d93a26' : pc >= .5 ? '#f08a24' : '#2e9e5b';
    const e = (d.estacoes || []).find(e => e.cod === c), vq = e?.variaveis?.vazao;
    return `<tr${ok ? '' : ' class="velho"'}><td><b>${esc(r.nome)}</b><br><small>${esc(r.rio)} · ${c} · ${r.zona}</small></td><td class="n">${u ? f(u[1], 2) + ' m' : 'sem dado'}<br><small>${u ? (ok ? 'às ' + hm(u[0]) : 'leitura de ' + dtf(u[0])) : ''}</small>${vq ? `<br><small>${f(vq.valor, 0)} m³/s às ${hm(vq.t)}</small>` : ''}</td>
     <td class="n">${v24 == null ? 'sem dado' : (v24 >= 0 ? '+' : '') + f(v24, 0) + ' cm'}</td><td><small>${esc(param(c))}</small></td><td class="n">${e20 ? f(e20.h, 2) + ' m' : 'sem dado'}</td><td class="n">${e22 ? f(e22.h, 2) + ' m' : 'sem dado'}</td>
     <td class="n">${f(r.max.h, 2)} m<br><small>${ddm(r.max.d)}/${r.max.d.slice(0, 4)} · registro desde ${r.inicio.slice(5)}/${r.inicio.slice(0, 4)}</small></td>
     <td><div class="pbar"><i style="width:${Math.min(100, (pc || 0) * 100)}%;background:${cor}"></i>${e20 ? `<s style="left:${Math.min(100, rel(e20.h) * 100)}%" title="2020"></s>` : ''}${e22 ? `<s style="left:${Math.min(100, rel(e22.h) * 100)}%" title="2022"></s>` : ''}</div><small>${pc == null ? 'sem dado' : f(pc * 100, 0) + '% da subida até a maior cheia'}</small></td></tr>`; }).join('');
  const tr = cods.map(c => { const g = gaps(d.reguas[c], 2); return {type: 'scatter', mode: 'lines', name: `${RG[c].nome} (${RG[c].zona})`, x: g.map(p => p[0]), y: g.map(p => p[1] == null ? null : (p[1] - RG[c].base) / (RG[c].max.h - RG[c].base) * 100), connectgaps: false,
    line: {color: RGC[c], width: 2.2}, hovertemplate: `${esc(RG[c].nome)}: %{y:.0f}%<extra></extra>`}; });
  plot('gRg', tr, {...PL, hovermode: 'x unified', showlegend: true, legend: {orientation: 'h', y: -0.2}, yaxis: {...PL.yaxis, title: {text: '% da subida até a maior cheia', font: {size: 11}}, range: [-5, 110]}, xaxis: {...PL.xaxis, type: 'date', tickformat: '%d/%m'},
    shapes: [{type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 100, y1: 100, line: {color: '#8e1537', width: 1.5, dash: 'dash'}}]}, CFG, 'Réguas do eixo na tabela acima.');
}

async function load() {
  if (busy) return; busy = true;
  try {
    const [b, op] = await Promise.all([C.json('data.json'), C.json('operacao.json', 8000).catch(() => null)]);
    BASE = b; OP = op; ultimaFalha = null; ultimaOk = Date.now();
    if (!D || (D.coleta || '') <= (BASE.coleta || '')) { D = AoVivo.reavaliar(BASE, BASE); render(D); }
  } catch (e) {
    ultimaFalha = {t: new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 16), msg: e.message};
    if (D) { D = AoVivo.reavaliar(D, BASE); render(D); }
    else { $('warn').hidden = false; $('warn').textContent = `Não foi possível ler os dados (${e.message}). Nova tentativa em 1 minuto; use o botão Atualizar para tentar agora.`; $('upd').textContent = 'Sem dados'; }
    busy = false; return;
  }
  try { D = await AoVivo.atualizar(BASE); render(D); }
  catch (e) { console.error(e); ultimaFalha = {t: new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 16), msg: 'telemetria ao vivo: ' + e.message}; D = AoVivo.reavaliar(D, BASE); render(D); }
  busy = false;
}
// sem rede, as idades e a validade das leituras continuam sendo recalculadas a cada minuto
function tique() { if (D && BASE && !busy) { D = AoVivo.reavaliar(D, BASE); render(D); } if (!BASE && !busy) load(); }

$('btnUpd').addEventListener('click', () => load());
for (const bt of document.querySelectorAll('.fit')) bt.addEventListener('click', () => { FIT = !FIT; for (const x of document.querySelectorAll('.fit')) { x.textContent = FIT ? 'Mostrar escala dos limites' : 'Ampliar escala aos dados'; x.setAttribute('aria-pressed', FIT); } if (D) render(D); });
for (const b of document.querySelectorAll('.zoom button')) b.addEventListener('click', () => { ZOOM = +b.dataset.z; for (const x of document.querySelectorAll('.zoom button')) x.classList.toggle('on', +x.dataset.z === ZOOM); if (D) render(D); });
C.json('reguas.json').then(j => { RG = j; if (D) reguas(D); }).catch(() => {});
C.publicacao().then(p => { PUB = p; if (D) $('tempos').innerHTML = tempos(D); });
load(); setInterval(load, 5 * 60 * 1000); setInterval(tique, 60 * 1000);
})();
