// Aba de estações: situação de cada variável (nível, vazão, chuva) com horário e frescor próprios.
(() => {
const {esc, f, dtf, hm, idh, selo} = C, $ = id => document.getElementById(id);
let D = null, BASE = null, busy = false, falha = null;
const USO = (e, d) => e.cod === '40740000' ? 'Régua de referência (limites de cota)' : e.cod === '40710001' ? 'Vazão de controle (limites de vazão)' :
  e.usada_chuva || (d.zonas[e.zona]?.pluviometros || []).includes(e.cod) ? `Pluviômetro da zona ${e.zona}` + (e.cod === '40700050' ? '; régua do eixo (referência histórica)' : '') :
  e.cod === '40700050' ? 'Régua do eixo (referência histórica)' : `Candidata (${e.zona}), fora do cálculo`;
const cel = (v, u, nd) => v ? `<b>${f(v.valor, nd)} ${u}</b><br><small>${esc(dtf(v.t))} · ${esc(idh(v.idade_h))}</small><br>${selo(v.frescor)}` : '<span class="note">não transmite</span>';
function kpi(tit, v, u, nd, extra) {
  return `<div class="kpi kpi-s"><span>${esc(tit)}</span><b class="${v && (v.frescor === 'indisponivel' || v.frescor === 'futuro') ? 'old' : ''}">${v ? f(v.valor, nd) + ' ' + u : 'sem dado'}</b><em>${v ? esc(dtf(v.t)) + ' · ' + esc(idh(v.idade_h)) + ' ' + selo(v.frescor) : ''}${extra ? '<br>' + esc(extra) : ''}</em></div>`;
}
function render(d) {
  const e = c => d.estacoes.find(x => x.cod === c) || {variaveis: {}}, af = e('40740000').variaveis, bv = e('40710001').variaveis;
  $('ctl').innerHTML = kpi('Régua em Alberto Flores', af.nivel, 'm', 2, `Atenção em ${f(d.limites.AF[0], 1)} m`) + kpi('Vazão em Belo Vale', bv.vazao, 'm³/s', 0, `Atenção em ${f(d.limites.BV[0])} m³/s`)
    + kpi('Vazão em Alberto Flores', af.vazao, 'm³/s', 0, 'Base da umidade do solo (média de ontem)') + kpi('Régua em Belo Vale', bv.nivel, 'm', 2, 'Sem limite de cota no estudo');
  $('tbEst').innerHTML = d.estacoes.map(x => { const v = x.variaveis || {}, nav = x.coleta_navegador;
    const col = [x.coleta_ok === false ? `Servidor: falhou${x.erro ? ' (' + esc(x.erro) + ')' : ''}` : 'Servidor: ok',
      nav ? `Navegador: ${nav.falhas ? 'falhou ' + nav.falhas + 'x' + (nav.erro ? ' (' + esc(nav.erro) + ')' : '') : 'ok às ' + hm(new Date(nav.sucesso - 3 * 36e5).toISOString().slice(0, 16))}` : ''].filter(Boolean).join('<br>');
    return `<tr><td data-l="Estação"><b>${esc(x.nome)}</b><br><small>${esc(x.cod)} · ${esc(x.zona)}</small></td><td data-l="Uso">${esc(USO(x, d))}</td>
      <td data-l="Nível">${cel(v.nivel, 'm', 2)}</td><td data-l="Vazão">${cel(v.vazao, 'm³/s', 1)}</td>
      <td data-l="Chuva">${v.chuva ? cel(v.chuva, 'mm', 1) + `<br><small>24 h: ${f(x.chuva24, 1)} mm, ${f((x.chuva24_cob ?? 0) * 100, 0)}% das horas</small>` : cel(null)}</td><td data-l="Coleta"><small>${col}</small></td></tr>`; }).join('');
  const Z = d.zonas.Z1;
  $('z1').innerHTML = `<p><b>Situação atual da Z1:</b> ${esc((Z.pluviometros || []).length ? 'pluviômetro ' + Z.pluviometros.join(', ') : 'sem pluviômetro com dado')}; nos últimos 5 dias, ${f((Z.cob5_medida ?? 0) * 100, 0)}% das horas foram medidas e ${f((Z.cob5_estimada ?? 0) * 100, 0)}% estimadas por modelo.${Z.fontes5 ? ' Sequência das últimas 48 h (M = medida, E = estimada, - = sem dado): <code>' + esc(Z.fontes5.slice(-48)) + '</code>' : ''}</p>`;
  $('upd').textContent = falha ? `Falha ao atualizar (${falha}) · dados de ${dtf(d.coleta)}` : d.ao_vivo ? `Verificado às ${hm(d.verificado)}` : `Última coleta ${dtf(d.coleta)} · conectando à telemetria`;
  $('dot').className = 'dot' + (falha || (C.idade(d.coleta) > 1 && !(d.ao_vivo && d.ao_vivo.ok)) ? ' old' : '');
}
async function load() {
  if (busy) return; busy = true;
  try { BASE = await C.json('data.json'); falha = null; D = AoVivo.reavaliar(BASE, BASE); render(D); }
  catch (err) { falha = err.message; if (D) render(D); else { $('warn').hidden = false; $('warn').textContent = `Não foi possível ler os dados (${err.message}).`; } busy = false; return; }
  try { D = await AoVivo.atualizar(BASE); render(D); } catch (err) { console.error(err); falha = 'telemetria ao vivo: ' + err.message; render(D); }
  busy = false;
}
$('btnUpd').addEventListener('click', load);
load(); setInterval(load, 5 * 60e3); setInterval(() => { if (D && BASE && !busy) { D = AoVivo.reavaliar(D, BASE); render(D); } }, 60e3);
})();
