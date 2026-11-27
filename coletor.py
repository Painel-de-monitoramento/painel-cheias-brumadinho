# Coletor do painel de monitoramento de cheias do Rio Paraopeba em Brumadinho
# Baseado no RT-BRU-HID-001 Rev04 (níveis de controle e regra de decisão, seções 10.3 e 10.4)
# Fontes: telemetria da ANA, chuva estimada por modelo e previsão (Open-Meteo, met.no como reserva)
# Regras de dados: ausência é null, nunca zero; acumulados observados só com horas concluídas; convenção de intervalos
# [início, fim) comum a todas as fontes (dados.py); cobertura medida, estimada, temporal e espacial separadas;
# decisão pelo motor único (motor.py).
# Uso: python coletor.py data.json
# Saída 0 = coleta completa; 2 = snapshot gravado, mas a régua ou Belo Vale não foram baixados nesta execução;
# qualquer outro código = falha sem snapshot válido.
import re, sys, os, json, time, hashlib, urllib.request, datetime as dt
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import motor, cemaden
from dados import hr, hora_openmeteo, hora_metno, futuro, num, cadencia_min, chuva_horaria, chuva_horaria_variavel, janela, cobertura, frescor

BASE = os.path.dirname(os.path.abspath(__file__))
TZ = dt.timezone(dt.timedelta(hours=-3))
NOW = dt.datetime.now(TZ).replace(tzinfo=None)
H_ATUAL = hr(NOW)          # hora em curso [H_ATUAL, H_ATUAL + 1 h): ainda incompleta
FIM_OBS = H_ATUAL          # os acumulados observados terminam na última hora concluída
NIVEIS = ['Normal', 'Atenção', 'Alerta', 'Alerta máximo', 'Emergência']
LIM = {  # limites do quadro de níveis (solo normal): Atenção, Alerta, Alerta máximo, Emergência
    'Z1': [140, 185, 235, 260], 'Z2': [155, 210, 260, 290], 'Z3': [170, 230, 285, 320],
    'BV': [300, 600, 950, 1150], 'AF': [5.0, 7.0, 9.0, 10.5]}
AJUSTE_UMIDO = 30
AREAS = {'Z1': 1337, 'Z2': 1428, 'Z3': 1193}
ZONAS = {'Z1': 'Alto Paraopeba / Maranhão', 'Z2': 'Camapuã / Brumado', 'Z3': 'Médio Paraopeba'}
EST = [  # código, nome, zona, papel. Estações candidatas só entram no cálculo se transmitirem dado.
    ('40740000', 'Alberto Flores', 'Z3', 'régua de referência'),
    ('40710001', 'Belo Vale', 'Z3', 'vazão de controle'),
    ('40680001', 'Entre Rios de Minas', 'Z2', 'chuva'),
    ('40686000', 'PCH Salto do Paraopeba Rio Camapuã', 'Z2', 'chuva'),
    ('40700050', 'PCH Salto do Paraopeba montante', 'Z2', 'chuva e régua do eixo'),
    ('40700080', 'PCH Salto do Paraopeba barramento', 'Z2', 'chuva'),
    ('40712500', 'Bonfim', 'Z3', 'chuva (candidata)'),
    ('40712000', 'CGH Caquende jusante', 'Z3', 'chuva'),
    ('40712600', 'CGH Juliões jusante', 'Z3', 'chuva'),
    ('2043013', 'Congonhas linígrafo', 'Z1', 'chuva (candidata)'),
    ('2043133', 'Conselheiro Lafaiete (IGAM)', 'Z1', 'chuva')]
GRADE = {  # pontos de grade do modelo dentro de cada zona (lat, lon)
 'Z1': [[-20.881, -43.817], [-20.761, -43.697], [-20.641, -43.937], [-20.521, -43.817]],
 'Z2': [[-20.851, -44.179], [-20.731, -44.059], [-20.611, -44.179], [-20.611, -43.939]],
 'Z3': [[-20.343, -44.299], [-20.223, -44.179], [-20.463, -44.059], [-20.343, -43.939]]}
REGUAS = ['40700050', '40710001', '40740000']   # eixo do Paraopeba, de montante para jusante
LOG = []


def log(*a):
    m = ' '.join(str(x) for x in a); LOG.append(m); print(m, file=sys.stderr)


def get(url, tries=2, timeout=45, headers=None):
    err = None
    for k in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=timeout).read()
        except Exception as e:
            err = e; time.sleep(4 * (k + 1))
    raise err


def escrever(caminho, obj):  # gravação atômica
    tmp = caminho + '.tmp'
    with open(tmp, 'w') as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    os.replace(tmp, caminho)


def ler(caminho, padrao):
    try: return json.load(open(caminho))
    except Exception: return padrao


def iso(ts): return ts.strftime('%Y-%m-%dT%H:%M') if ts else None
def r1(v): return None if v is None else round(v, 1)


# ---------- telemetria ANA (serviço legado; HidroWebService autenticado entra quando houver credenciais)
FUTUROS = defaultdict(int)


def ana(cod, dias):
    d2 = NOW.date() + dt.timedelta(days=1); d1 = d2 - dt.timedelta(days=dias)
    u = (f'https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao={cod}'
         f'&dataInicio={d1:%d/%m/%Y}&dataFim={d2:%d/%m/%Y}')
    t = get(u).decode('utf-8', 'ignore'); out = []
    for r in re.findall(r'<DadosHidrometereologicos[^>]*>(.*?)</DadosHidrometereologicos>', t, re.S):
        d = dict(re.findall(r'<(\w+)>([^<]*)</\1>', r))
        try: ts = dt.datetime.strptime(d['DataHora'].strip(), '%Y-%m-%d %H:%M:%S')
        except Exception: continue
        if futuro(ts, NOW): FUTUROS[cod] += 1; continue      # horário à frente do relógio: rejeitado e registrado
        out.append((ts, num(d.get('Nivel')), num(d.get('Vazao')), num(d.get('Chuva'))))
    return sorted(set(out))


TCACHE = os.path.join(BASE, 'tel_cache.json')
tc = ler(TCACHE, {})
coleta = {}   # por estação: resultado da última tentativa


def baixar(item):
    cod = item[0]
    old = [(dt.datetime.fromisoformat(r[0]), *r[1:]) for r in tc.get(cod, [])]
    old = [r for r in old if not futuro(r[0], NOW)]
    dias = 3 if old and (NOW - old[0][0]).days >= 30 else 36
    try: return cod, old, ana(cod, dias), None
    except Exception as e: return cod, old, [], e


tel = {}
with ThreadPoolExecutor(max_workers=4) as ex:
    for cod, old, new, err in ex.map(baixar, EST):
        coleta[cod] = {'ok': err is None, 'erro': None if err is None else f'{type(err).__name__}: {str(err)[:120]}'}
        if err: log('ANA falhou', cod, type(err).__name__, err)
        m = {r[0]: r for r in old}; m.update({r[0]: r for r in new})
        tel[cod] = sorted(r for t, r in m.items() if t >= NOW - dt.timedelta(days=37))
for cod, n in FUTUROS.items(): log('registros com horário no futuro rejeitados', cod, n)
escrever(TCACHE, {c: [[r[0].isoformat(), *r[1:]] for r in rows] for c, rows in tel.items()})

H0 = H_ATUAL - dt.timedelta(days=35)
horas = [H0 + dt.timedelta(hours=i) for i in range(int((H_ATUAL - H0).total_seconds() // 3600) + 1)]
chuva_h, chuva_n, chuva_esp = {}, {}, {}   # chuva horária por estação (hora sem medição completa = None)
for cod, rows in tel.items():
    chuva_h[cod], chuva_n[cod], chuva_esp[cod] = chuva_horaria([(r[0], r[3]) for r in rows], horas)

# ---------- pluviômetros automáticos do CEMADEN na Z1 (só com os segredos CEMADEN_USUARIO e CEMADEN_SENHA)
CCACHE = os.path.join(BASE, 'cemaden_cache.json')
cem_cache, CEM_SIT = cemaden.atualizar(ler(CCACHE, {}), NOW, log)
if CEM_SIT['configurado']: escrever(CCACHE, cem_cache)
CEM = {}   # código -> metadados; os registros entram na chuva horária como as estações da ANA
for cod, m in cem_cache.get('estacoes', {}).items():
    regs = [(dt.datetime.fromisoformat(k), v) for k, v in cem_cache.get('registros', {}).get(cod, {}).items()]
    regs = [r for r in regs if not futuro(r[0], NOW)]
    if not regs: continue
    CEM[cod] = {**m, 'ultimo': max(r[0] for r in regs)}
    chuva_h[cod], chuva_n[cod] = chuva_horaria_variavel(regs, horas); chuva_esp[cod] = 1

# ---------- modelo (Open-Meteo, reserva met.no + histórico próprio), chave horária no início do intervalo
pts = [(z, p) for z in GRADE for p in GRADE[z]]
u = ('https://api.open-meteo.com/v1/forecast?latitude=' + ','.join(str(p[0]) for _, p in pts) +
     '&longitude=' + ','.join(str(p[1]) for _, p in pts) +
     '&hourly=precipitation&past_days=31&forecast_days=7&timezone=America%2FSao_Paulo')
HIST = os.path.join(BASE, 'modelo_hist.json')
hist = ler(HIST, {})
meta_prev = hist.pop('_meta', {}) if isinstance(hist, dict) else {}
if meta_prev.get('convencao') != 'inicio':   # histórico antigo gravado com a chave no fim do intervalo do Open-Meteo
    hist = {z: {(dt.datetime.fromisoformat(k) - dt.timedelta(hours=1)).strftime('%Y-%m-%dT%H:00'): v for k, v in hist.get(z, {}).items()} for z in GRADE}
    log('modelo_hist.json convertido para a convenção de início do intervalo')
for z in GRADE: hist.setdefault(z, {})


def media(v):
    v = [x for x in v if x is not None]
    return sum(v) / len(v) if v else None


mod = {z: {} for z in GRADE}; fonte_prev = None
try:
    om = json.loads(get(u))
    for (z, _), d in zip(pts, om):
        for t, v in zip(d['hourly']['time'], d['hourly']['precipitation']):
            mod[z].setdefault(hora_openmeteo(dt.datetime.fromisoformat(t)), []).append(num(v))
    mod = {z: {t: media(v) for t, v in mod[z].items()} for z in mod}
    for z in mod:
        for t, v in mod[z].items():
            if t < H_ATUAL and v is not None: hist[z][t.strftime('%Y-%m-%dT%H:00')] = round(v, 3)
    fonte_prev = 'Open-Meteo'
except Exception as e:
    log('Open-Meteo indisponível', e)
    mod = {z: {} for z in GRADE}
    try:
        for z, p in pts:
            js = json.loads(get(f'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={p[0]:.3f}&lon={p[1]:.3f}',
                                headers={'User-Agent': 'BrumadinhoCheiasPainel/1.0'})); time.sleep(0.3)
            for it in js['properties']['timeseries']:
                t = hora_metno(dt.datetime.fromisoformat(it['time'].replace('Z', '+00:00')).astimezone(TZ).replace(tzinfo=None))
                dd = it['data']
                if 'next_1_hours' in dd:
                    mod[z].setdefault(t, []).append(num(dd['next_1_hours']['details'].get('precipitation_amount')))
                elif 'next_6_hours' in dd:
                    v6 = num(dd['next_6_hours']['details'].get('precipitation_amount'))
                    for i in range(6):
                        tt = t + dt.timedelta(hours=i)
                        if len(mod[z].get(tt, [])) < GRADE[z].index(p) + 1:
                            mod[z].setdefault(tt, []).append(None if v6 is None else v6 / 6)
        mod = {z: {t: media(v) for t, v in mod[z].items()} for z in mod}
        fonte_prev = 'met.no'
    except Exception as e2:
        log('met.no indisponível', e2)
    for z in mod:   # horas passadas: estimativa guardada de execuções anteriores (nunca a previsão atual)
        for k, v in hist.get(z, {}).items():
            t = dt.datetime.fromisoformat(k)
            if t < H_ATUAL: mod[z][t] = v
prev_ok = fonte_prev is not None
if prev_ok: meta_prev.update(ultimo_sucesso=iso(NOW), fonte=fonte_prev)
meta_prev.update(ultima_tentativa=iso(NOW), convencao='inicio')
lim_hist = (NOW - dt.timedelta(days=40)).strftime('%Y-%m-%dT%H:00')
escrever(HIST, {**{z: {k: v for k, v in hist.get(z, {}).items() if k >= lim_hist} for z in GRADE}, '_meta': meta_prev})


# ---------- chuva por zona: média dos pluviômetros com hora medida; sem medição, estimativa do modelo
def zona_obs(z):
    cods = [c for c, _, zz, _ in EST if zz == z] + sorted(c for c, m in CEM.items() if m['zona'] == z)
    usados = [c for c in cods if sum(v is not None for v in chuva_h.get(c, {}).values()) > 72]
    serie, fonte, peso = {}, {}, {}
    for h in horas:
        if h >= FIM_OBS: continue
        v = [chuva_h[c][h] for c in usados if chuva_h[c].get(h) is not None]
        if v: serie[h] = sum(v) / len(v); fonte[h] = 'M'; peso[h] = len(v) / len(usados)
        elif mod[z].get(h) is not None: serie[h] = mod[z][h]; fonte[h] = 'E'
        else: serie[h] = None
    # hora em curso: somente medição parcial, apresentada à parte e fora dos acumulados
    parc = []
    for c in usados:
        if c in CEM:
            p = [v for k, v in cem_cache['registros'].get(c, {}).items() if hr(dt.datetime.fromisoformat(k) - dt.timedelta(seconds=1)) == H_ATUAL]
        else:
            p = [r[3] for r in tel[c] if r[3] is not None and 0 <= r[3] < 200 and hr(r[0] - dt.timedelta(seconds=1)) == H_ATUAL]
        if p: parc.append(sum(p))
    return serie, fonte, peso, usados, ({'inicio': iso(H_ATUAL), 'mm': r1(sum(parc) / len(parc)), 'pluviometros': len(parc)} if parc else None)


def rotulo(fonte, a, b):
    s = {fonte.get(a + dt.timedelta(hours=i)) for i in range(int((b - a).total_seconds() // 3600))} - {None}
    return 'sem dado' if not s else ('misto' if len(s) > 1 else {'M': 'medicao', 'E': 'modelo'}[s.pop()])


zonas, Zin, SER = {}, {}, {}
for z in ZONAS:
    s, fonte, peso, usados, parcial = zona_obs(z); SER[z] = s
    w = {k: janela(s, FIM_OBS - dt.timedelta(hours=k), FIM_OBS) for k in (24, 72, 120, 720)}
    cob5 = cobertura(fonte, peso, FIM_OBS - dt.timedelta(hours=120), FIM_OBS)
    ult = max((h for h in fonte if fonte[h] == 'M'), default=None)
    dias = []
    for k in range(30, -1, -1):
        d0 = dt.datetime.combine(NOW.date() - dt.timedelta(days=k), dt.time()); d1 = min(d0 + dt.timedelta(days=1), FIM_OBS)
        if d1 <= d0: continue
        v, cob = janela(s, d0, d1); mv, _ = janela(mod[z], d0, d1); cb = cobertura(fonte, peso, d0, d1)
        dias.append({'d': d0.strftime('%Y-%m-%d'), 'obs': r1(v), 'cob': round(cob, 2), 'cob_medida': cb['medida'],
                     'fonte': rotulo(fonte, d0, d1), 'mod': r1(mv), 'ate': iso(d1) if d1 < d0 + dt.timedelta(days=1) else None})
    prev = []
    for k in range(0, 7):
        d0 = dt.datetime.combine(NOW.date() + dt.timedelta(days=k), dt.time()); a = max(d0, H_ATUAL); b = d0 + dt.timedelta(days=1)
        v, cob = janela(mod[z], a, b) if (prev_ok and b > a) else (None, 0)
        prev.append({'d': d0.strftime('%Y-%m-%d'), 'prev': r1(v), 'cob': round(cob, 2), 'desde': iso(a)})
    p72, c72 = janela(mod[z], H_ATUAL, H_ATUAL + dt.timedelta(hours=72)) if prev_ok else (None, 0)
    p5m, _ = janela(mod[z], FIM_OBS - dt.timedelta(hours=120), FIM_OBS)
    f5 = ''.join({'M': 'M', 'E': 'E'}.get(fonte.get(FIM_OBS - dt.timedelta(hours=120 - i)), '-') for i in range(120))
    zonas[z] = {'nome': ZONAS[z], 'fonte': rotulo(fonte, FIM_OBS - dt.timedelta(hours=120), FIM_OBS),
                'pluviometros': usados,
                'pluviometros_5d': {c: round(sum(1 for i in range(120) if chuva_h[c].get(FIM_OBS - dt.timedelta(hours=120 - i)) is not None) / 120, 2) for c in usados},
                'ultima_medicao': iso(ult + dt.timedelta(hours=1)) if ult else None, 'fim_acumulado': iso(FIM_OBS), 'hora_parcial': parcial,
                'P24': r1(w[24][0]), 'P72': r1(w[72][0]), 'P5': r1(w[120][0]), 'P30': r1(w[720][0]),
                'cob24': round(w[24][1], 2), 'cob72': round(w[72][1], 2), 'cob5': round(w[120][1], 2), 'cob30': round(w[720][1], 2),
                'cob5_medida': cob5['medida'], 'cob5_estimada': cob5['estimada'], 'cob5_espacial': cob5['espacial'], 'fontes5': f5,
                'P5_modelo': r1(p5m), 'prev72': r1(p72) if c72 >= 0.9 else None, 'prev72_cob': round(c72, 2),
                'diario': dias, 'previsao': prev}
    Zin[z] = {'P5': w[120][0], 'cob5': w[120][1], 'P30': w[720][0], 'cob30': w[720][1]}


# ---------- vazão e nível (cada variável com seu próprio horário)
def serie_hora(cod, idx):
    acc = defaultdict(list)
    for row in tel.get(cod, []):
        if row[idx] is not None: acc[hr(row[0])].append(row[idx])
    return {h: sum(v) / len(v) for h, v in acc.items()}


def ultimo(cod, idx):
    for row in reversed(tel.get(cod, [])):
        if row[idx] is not None: return row
    return None


af_n = {h: v / 100 for h, v in serie_hora('40740000', 1).items()}
af_q = serie_hora('40740000', 2); bv_q = serie_hora('40710001', 2)
uaf = ultimo('40740000', 1); uafq = ultimo('40740000', 2); ubv = ultimo('40710001', 2); ubvh = ultimo('40710001', 1)
ontem = NOW.date() - dt.timedelta(days=1)
qd = [v for h, v in af_q.items() if h.date() == ontem]
af_q_ontem = sum(qd) / len(qd) if qd else None
tend = None
if uaf:
    ant = [x for x in tel['40740000'] if x[1] is not None and x[0] <= uaf[0] - dt.timedelta(hours=3)]
    if ant: tend = round((uaf[1] - ant[-1][1]) / ((uaf[0] - ant[-1][0]).total_seconds() / 3600), 1)
serie_af24 = [[iso(h), round(v, 3)] for h, v in sorted(af_n.items()) if h >= H_ATUAL - dt.timedelta(hours=30)]

# ---------- réguas do eixo principal (cota horária dos últimos 10 dias, sem preencher lacunas)
reguas = {}
for cod in REGUAS:
    sh = {h: v / 100 for h, v in serie_hora(cod, 1).items() if h >= H_ATUAL - dt.timedelta(days=10) and 0 < v < 3000}
    reguas[cod] = [[iso(h), round(v, 2)] for h, v in sorted(sh.items())]

# ---------- decisão (motor único, com histerese persistida)
ESTADO = os.path.join(BASE, 'estado.json')
estado_ant = ler(ESTADO, None)
entrada = {'agora': iso(NOW), 'limites': LIM, 'ajuste_umido': AJUSTE_UMIDO, 'areas': AREAS,
           'af': {'h': uaf[1] / 100 if uaf else None, 't': iso(uaf[0]) if uaf else None,
                  'q_ontem': af_q_ontem, 'q_ontem_cobertura': len(qd) / 24},
           'bv': {'q': ubv[2] if ubv else None, 't': iso(ubv[0]) if ubv else None},
           'zonas': Zin, 'serie_af': serie_af24, 'estado_anterior': estado_ant}
dec = motor.decidir(entrada)
for z in ZONAS:
    zonas[z]['nivel'] = dec['zonas'][z]['nivel']; zonas[z]['estado'] = dec['zonas'][z]['estado']; zonas[z]['limites'] = dec['limites_zona'][z]
if dec['estado']:
    if not estado_ant or dec['estado'] != estado_ant: escrever(ESTADO, dec['estado'])
    h = dec['estado']['historico']
    if h and h[-1]['t'] == iso(NOW): log('TRANSIÇÃO', h[-1])

# ---------- projeção pela regra de chuva (observado em horas concluídas + previsto a partir da hora em curso)
lz = dec['limites_zona']; proj = []
if prev_ok:
    for k in range(1, 4):
        fim = dt.datetime.combine(NOW.date() + dt.timedelta(days=k), dt.time()) + dt.timedelta(days=1)
        ini = fim - dt.timedelta(hours=120); vals, Lp, cobs = {}, {}, {}
        for z in ZONAS:
            o, co = janela(SER[z], ini, min(FIM_OBS, fim)) if ini < FIM_OBS else (0, 1)
            fc, cf = janela(mod[z], max(ini, FIM_OBS), fim)
            ho = max(0, (min(FIM_OBS, fim) - ini).total_seconds() / 3600); hf = (fim - max(ini, FIM_OBS)).total_seconds() / 3600
            cobs[z] = round((co * ho + cf * hf) / 120, 2)
            vals[z] = None if (o is None and fc is None) else round((o or 0) + (fc or 0), 1)
            Lp[z] = motor.nivel(vals[z], lz[z])
        o = sorted(Lp.values(), reverse=True)
        proj.append({'d': (fim - dt.timedelta(days=1)).strftime('%Y-%m-%d'), 'P5': vals, 'cob': cobs, 'niveis': Lp,
                     'nivel': max(o[1], max(o[0] - 1, 0)), 'parcial': min(cobs.values()) < 0.9})

# ---------- alertas
alertas = []
for i in dec['indicadores']:
    if i['nivel']: alertas.append({'tipo': 'nivel', 'nivel': i['nivel'], 'texto': f"{i['nome']} indica {NIVEIS[i['nivel']]}"})
nref = dec['nivel'] or 0
for p in proj:
    if p['nivel'] > nref:
        alertas.append({'tipo': 'previsao', 'nivel': p['nivel'], 'texto': f"A previsão de chuva para {p['d'][8:]}/{p['d'][5:7]} leva a {NIVEIS[p['nivel']]} pela regra de chuva" + (' (previsão parcial)' if p['parcial'] else '')})
nu = dec['nivel_bruto_solo_umido']
if nu is not None and (dec['nivel_bruto'] is None or nu > dec['nivel_bruto']):
    alertas.append({'tipo': 'cenario', 'nivel': nu, 'texto': f"Umidade do solo indeterminada: se o solo estiver úmido, a regra de chuva indica {NIVEIS[nu]}"})
for i in dec['indicadores'][:2]:
    if i['estado'] != 'ok': alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"{i['nome']} sem leitura válida: {i['motivo']}" + (f" (última há {i['idade_h']:.0f} h)" if i['idade_h'] is not None and i['idade_h'] > 0 else '')})
for z in ZONAS:
    e = dec['zonas'][z]; Z = zonas[z]
    if e['estado'] != 'ok': alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"Chuva de 5 dias em {z} com cobertura de {e['cob5'] * 100:.0f}%" + (' (valor parcial)' if e['estado'] == 'parcial' else ' (sem dado)')})
    elif Z['cob5_medida'] < 0.5: alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"Chuva de 5 dias em {z}: {Z['cob5_medida'] * 100:.0f}% das horas medidas por pluviômetro e {Z['cob5_estimada'] * 100:.0f}% estimadas por modelo"})
if dec['solo']['estado'] == 'indeterminado': alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"Umidade do solo indeterminada: {dec['solo']['criterio']}"})
if dec['motivo_manutencao']: alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"Nível mantido em {NIVEIS[dec['nivel']]}: {dec['motivo_manutencao']}"})
if not prev_ok: alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': 'Previsão de chuva indisponível nesta atualização'})
if CEM_SIT['configurado'] and not CEM_SIT['ok']:
    alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': 'Pluviômetros do CEMADEN indisponíveis nesta atualização' + (f" (último sucesso {CEM_SIT['ultimo_sucesso'].replace('T', ' ')})" if CEM_SIT.get('ultimo_sucesso') else '')})
for cod in ('40740000', '40710001'):
    if FUTUROS.get(cod): alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"{FUTUROS[cod]} registro(s) da estação {cod} com horário no futuro foram descartados (possível erro de relógio)"})


# ---------- situação de cada estação por variável
def var(cod, idx, div=1, nd=2):
    rows = [r for r in tel.get(cod, []) if r[idx] is not None]
    if not rows: return None
    u0 = rows[-1]; cad = cadencia_min([r[0] for r in rows[-200:]]); i = (NOW - u0[0]).total_seconds() / 3600
    return {'t': iso(u0[0]), 'valor': round(u0[idx] / div, nd), 'idade_h': round(i, 2), 'cadencia_min': cad, 'frescor': frescor(i, cad)}


est = []
for cod, nome, z, papel in EST:
    rows = tel.get(cod, [])
    if papel.endswith('(candidata)') and not rows: continue
    ch = chuva_h.get(cod, {}); c24 = [ch[h] for h in horas if FIM_OBS - dt.timedelta(hours=24) <= h < FIM_OBS and ch.get(h) is not None]
    vn = var(cod, 1, 100) if cod != '40700080' else None   # barramento mede o reservatório, não o rio
    vq = var(cod, 2, 1, 1); vc = var(cod, 3, 1, 1)
    vs = [v for v in (vn, vq, vc) if v]
    est.append({'cod': cod, 'nome': nome, 'zona': z, 'papel': papel, 'usada_chuva': cod in zonas[z]['pluviometros'],
                'ultimo': max(v['t'] for v in vs).replace('T', ' ') if vs else None,
                'nivel': vn['valor'] if vn else None, 'vazao': vq['valor'] if vq else None,
                'chuva24': r1(sum(c24)) if c24 else None, 'chuva24_cob': round(len(c24) / 24, 2),
                'variaveis': {'nivel': vn, 'vazao': vq, 'chuva': vc},
                'ok': bool(vs) and all(v['frescor'] not in ('indisponivel', 'futuro') for v in vs),
                'coleta_ok': coleta.get(cod, {}).get('ok', False), 'erro': coleta.get(cod, {}).get('erro')})

for cod, m in sorted(CEM.items()):
    ch = chuva_h.get(cod, {}); c24 = [ch[h] for h in horas if FIM_OBS - dt.timedelta(hours=24) <= h < FIM_OBS and ch.get(h) is not None]
    i = (NOW - m['ultimo']).total_seconds() / 3600
    vc = {'t': iso(m['ultimo']), 'valor': r1(cem_cache['registros'][cod][iso(m['ultimo'])]), 'idade_h': round(i, 2), 'cadencia_min': 60, 'frescor': frescor(i, 60)}
    est.append({'cod': cod, 'nome': f"{m['nome']} ({m['municipio'].title()})", 'zona': m['zona'], 'papel': 'chuva (CEMADEN)', 'rede': 'CEMADEN',
                'usada_chuva': cod in zonas[m['zona']]['pluviometros'], 'lat': m['lat'], 'lon': m['lon'], 'mapa': [m['x'], m['y']],
                'ultimo': iso(m['ultimo']).replace('T', ' '), 'nivel': None, 'vazao': None,
                'chuva24': r1(sum(c24)) if c24 else None, 'chuva24_cob': round(len(c24) / 24, 2),
                'variaveis': {'nivel': None, 'vazao': None, 'chuva': vc}, 'ok': vc['frescor'] not in ('indisponivel', 'futuro'),
                'coleta_ok': CEM_SIT['ok'], 'erro': CEM_SIT['erro']})


def ser(d, nd=2): return [[iso(h), round(v, nd)] for h, v in sorted(d.items()) if h >= H0]


ind_out = [{'nome': i['nome'], 'nivel': i['nivel'], 'estado': i['estado'], 'idade_h': i['idade_h'], 'motivo': i['motivo']} for i in dec['indicadores']]
idade = lambda t: None if t is None else round((NOW - t).total_seconds() / 3600, 2)
qv = lambda row, i: {'medicao': iso(row[0]) if row else None, 'idade_h': idade(row[0]) if row else None,
                     'estado': dec['indicadores'][i]['estado'], 'motivo': dec['indicadores'][i]['motivo'],
                     'frescor': frescor(idade(row[0]), 15) if row else 'sem dado'}
out = {'versao': 3, 'coleta': iso(NOW), 'atualizado': iso(NOW),
       'niveis_nomes': NIVEIS, 'limites': LIM, 'ajuste_umido': AJUSTE_UMIDO, 'areas': AREAS,
       'convencao_intervalos': 'chave horária = início do intervalo [h, h+1h), horário de Brasília; acumulados observados até a última hora concluída',
       'solo': {**dec['solo']},
       'nivel': {'atual': dec['nivel'], 'bruto': dec['nivel_bruto'], 'bruto_solo_umido': dec['nivel_bruto_solo_umido'], 'status': dec['status'], 'indicadores': ind_out,
                 'desde': (dec['estado'] or {}).get('desde'), 'causa': (dec['estado'] or {}).get('causa'),
                 'motivo': dec['motivo_manutencao'], 'descida_h': dec['descida_h']},
       'estado': dec['estado'],
       'qualidade': {'nivel': qv(uaf, 0), 'vazao': qv(ubv, 1),
                     'chuva': {z: {'ultima_medicao': zonas[z]['ultima_medicao'], 'cob5': zonas[z]['cob5'], 'cob5_medida': zonas[z]['cob5_medida'],
                                   'cob5_estimada': zonas[z]['cob5_estimada'], 'cob5_espacial': zonas[z]['cob5_espacial'],
                                   'fonte': zonas[z]['fonte'], 'estado': zonas[z]['estado']} for z in ZONAS},
                     'previsao': {'fonte': fonte_prev, 'estado': 'ok' if prev_ok else 'indisponivel'}},
       'previsao_meta': {'fonte': fonte_prev, 'obtida': iso(NOW) if prev_ok else None, 'ultima_tentativa': meta_prev.get('ultima_tentativa'),
                         'ultimo_sucesso': meta_prev.get('ultimo_sucesso'), 'fonte_ultimo_sucesso': meta_prev.get('fonte'),
                         'estado': 'ok' if prev_ok else 'indisponivel'},
       'previsao': proj, 'alertas': alertas, 'zonas': zonas,
       'af': {'h': round(uaf[1] / 100, 2) if uaf else None, 'h_t': iso(uaf[0]) if uaf else None, 't': iso(uaf[0]) if uaf else None,
              'q': round(uafq[2], 1) if uafq else None, 'q_t': iso(uafq[0]) if uafq else None,
              'tendencia_cm_h': tend, 'nivel': dec['indicadores'][0]['nivel'], 'serie': ser(af_n), 'serie_q': ser(af_q, 1)},
       'bv': {'q': round(ubv[2], 1) if ubv else None, 'q_t': iso(ubv[0]) if ubv else None, 't': iso(ubv[0]) if ubv else None,
              'h': round(ubvh[1] / 100, 2) if ubvh else None, 'h_t': iso(ubvh[0]) if ubvh else None,
              'nivel': dec['indicadores'][1]['nivel'], 'serie': ser(bv_q, 1)},
       'reguas': reguas, 'estacoes': est, 'modelo_ok': prev_ok, 'fonte_previsao': fonte_prev,
       'fonte_telemetria': 'ANA telemetriaws1 (serviço legado)' + ('; Dados da Rede Observacional do CEMADEN/MCTIC' if CEM else ''),
       'cemaden': CEM_SIT, 'coleta_estacoes': coleta, 'log': LOG[-30:]}
out['geracao_snapshot'] = dt.datetime.now(TZ).strftime('%Y-%m-%dT%H:%M:%S')
import validar   # sinalizações de qualidade (valores extremos plausíveis) seguem no próprio snapshot, sem descartar o dado
out['id_snapshot'] = ''
_err, out['qualidade']['flags'] = validar.validar(out)
out['id_snapshot'] = hashlib.sha256(json.dumps(out, ensure_ascii=False, sort_keys=True, allow_nan=False).encode()).hexdigest()[:16]
escrever(sys.argv[1] if len(sys.argv) > 1 else 'data.json', out)
falhas_criticas = [c for c in ('40740000', '40710001') if not coleta.get(c, {}).get('ok')]
print('ok' if not falhas_criticas else 'degradado', out['coleta'], 'nivel', NIVEIS[dec['nivel']] if dec['nivel'] is not None else 'indeterminado', dec['status'], 'solo', dec['solo']['estado'])
if falhas_criticas:   # snapshot gravado (idades reais, cache preservado), mas a coleta é sinalizada como falha
    log('coleta das estações críticas falhou:', ', '.join(falhas_criticas)); sys.exit(2)
