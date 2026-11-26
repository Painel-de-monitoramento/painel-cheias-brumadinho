# Coletor do painel de monitoramento de cheias do Rio Paraopeba em Brumadinho
# Baseado no RT-BRU-HID-001 Rev04 (níveis de controle e regra de decisão, seções 10.3 e 10.4)
# Fontes: telemetria da ANA, chuva estimada por modelo e previsão (Open-Meteo, met.no como reserva)
# Regras de dados: ausência é null, nunca zero; cobertura calculada por janela; decisão pelo motor único (motor.py)
# Uso: python coletor.py data.json
import re, sys, os, json, time, urllib.request, datetime as dt
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import motor

BASE = os.path.dirname(os.path.abspath(__file__))
TZ = dt.timezone(dt.timedelta(hours=-3))
NOW = dt.datetime.now(TZ).replace(tzinfo=None)
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
    ('40680001', 'Entre Rios de Minas', 'Z2', 'chuva e vazão'),
    ('40686000', 'Rio Camapuã (PCH Salto do Paraopeba)', 'Z2', 'chuva'),
    ('40700050', 'Paraopeba montante (PCH Salto do Paraopeba)', 'Z2', 'chuva'),
    ('40700080', 'PCH Salto do Paraopeba barramento', 'Z2', 'chuva'),
    ('40712500', 'Bonfim', 'Z3', 'chuva'),
    ('40712000', 'CGH Caquende jusante', 'Z3', 'chuva'),
    ('40712600', 'CGH Juliões jusante', 'Z3', 'chuva'),
    ('2043013', 'Congonhas linígrafo', 'Z1', 'chuva (candidata)'),
    ('2043133', 'Conselheiro Lafaiete (IGAM)', 'Z1', 'chuva')]
GRADE = {  # pontos de grade do modelo dentro de cada zona (lat, lon)
 'Z1': [[-20.881, -43.817], [-20.761, -43.697], [-20.641, -43.937], [-20.521, -43.817]],
 'Z2': [[-20.851, -44.179], [-20.731, -44.059], [-20.611, -44.179], [-20.611, -43.939]],
 'Z3': [[-20.343, -44.299], [-20.223, -44.179], [-20.463, -44.059], [-20.343, -43.939]]}
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
    with open(tmp, 'w') as f: json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, caminho)


def ler(caminho, padrao):
    try: return json.load(open(caminho))
    except Exception: return padrao


def hr(ts): return ts.replace(minute=0, second=0, microsecond=0)
def iso(ts): return ts.strftime('%Y-%m-%dT%H:%M') if ts else None


# ---------- telemetria ANA (serviço legado; HidroWebService autenticado entra quando houver credenciais)
def ana(cod, dias):
    d2 = NOW.date() + dt.timedelta(days=1); d1 = d2 - dt.timedelta(days=dias)
    u = (f'https://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao={cod}'
         f'&dataInicio={d1:%d/%m/%Y}&dataFim={d2:%d/%m/%Y}')
    t = get(u).decode('utf-8', 'ignore'); out = []
    for r in re.findall(r'<DadosHidrometereologicos[^>]*>(.*?)</DadosHidrometereologicos>', t, re.S):
        d = dict(re.findall(r'<(\w+)>([^<]*)</\1>', r))
        f = lambda k: float(d[k]) if d.get(k, '').strip() else None
        try: ts = dt.datetime.strptime(d['DataHora'].strip(), '%Y-%m-%d %H:%M:%S')
        except Exception: continue
        if ts <= NOW + dt.timedelta(minutes=30): out.append((ts, f('Nivel'), f('Vazao'), f('Chuva')))
    return sorted(set(out))


TCACHE = os.path.join(BASE, 'tel_cache.json')
tc = ler(TCACHE, {})
coleta_ok = {}


def baixar(item):
    cod = item[0]
    old = [(dt.datetime.fromisoformat(r[0]), *r[1:]) for r in tc.get(cod, [])]
    dias = 3 if old and (NOW - old[0][0]).days >= 30 else 36
    try: return cod, old, ana(cod, dias), None
    except Exception as e: return cod, old, [], e


tel = {}
with ThreadPoolExecutor(max_workers=6) as ex:
    for cod, old, new, err in ex.map(baixar, EST):
        coleta_ok[cod] = err is None
        if err: log('ANA falhou', cod, type(err).__name__, err)
        m = {r[0]: r for r in old}; m.update({r[0]: r for r in new})
        tel[cod] = sorted(r for t, r in m.items() if t >= NOW - dt.timedelta(days=37))
escrever(TCACHE, {c: [[r[0].isoformat(), *r[1:]] for r in rows] for c, rows in tel.items()})

H0 = hr(NOW) - dt.timedelta(days=35)
horas = [H0 + dt.timedelta(hours=i) for i in range(int((hr(NOW) - H0).total_seconds() // 3600) + 1)]
chuva_h = {}  # chuva horária por estação; hora sem registro = None
for cod, rows in tel.items():
    acc = defaultdict(float); has = set()
    for ts, n, q, c in rows:
        if c is not None and 0 <= c < 200: acc[hr(ts)] += c; has.add(hr(ts))
    chuva_h[cod] = {h: (acc[h] if h in has else None) for h in horas}

# ---------- modelo (Open-Meteo, reserva met.no + histórico próprio)
pts = [(z, p) for z in GRADE for p in GRADE[z]]
u = ('https://api.open-meteo.com/v1/forecast?latitude=' + ','.join(str(p[0]) for _, p in pts) +
     '&longitude=' + ','.join(str(p[1]) for _, p in pts) +
     '&hourly=precipitation&past_days=31&forecast_days=7&timezone=America%2FSao_Paulo')
HIST = os.path.join(BASE, 'modelo_hist.json')
hist = ler(HIST, {z: {} for z in GRADE})


def media(v):
    v = [x for x in v if x is not None]
    return sum(v) / len(v) if v else None


mod = {z: {} for z in GRADE}; fonte_prev = None
try:
    om = json.loads(get(u))
    for (z, _), d in zip(pts, om):
        for t, v in zip(d['hourly']['time'], d['hourly']['precipitation']):
            mod[z].setdefault(dt.datetime.fromisoformat(t), []).append(v)
    mod = {z: {t: media(v) for t, v in mod[z].items()} for z in mod}
    for z in mod:
        for t, v in mod[z].items():
            if t <= hr(NOW) and v is not None: hist.setdefault(z, {})[t.strftime('%Y-%m-%dT%H:00')] = round(v, 3)
    fonte_prev = 'Open-Meteo'
except Exception as e:
    log('Open-Meteo indisponível', e)
    mod = {z: {} for z in GRADE}
    try:
        for z, p in pts:
            js = json.loads(get(f'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={p[0]:.3f}&lon={p[1]:.3f}',
                                headers={'User-Agent': 'BrumadinhoCheiasPainel/1.0'})); time.sleep(0.3)
            for it in js['properties']['timeseries']:
                t = dt.datetime.fromisoformat(it['time'].replace('Z', '+00:00')).astimezone(TZ).replace(tzinfo=None)
                dd = it['data']
                if 'next_1_hours' in dd:
                    mod[z].setdefault(t, []).append(dd['next_1_hours']['details'].get('precipitation_amount'))
                elif 'next_6_hours' in dd:
                    v6 = dd['next_6_hours']['details'].get('precipitation_amount')
                    for i in range(6):
                        tt = t + dt.timedelta(hours=i)
                        if len(mod[z].get(tt, [])) < GRADE[z].index(p) + 1:
                            mod[z].setdefault(tt, []).append(None if v6 is None else v6 / 6)
        mod = {z: {t: media(v) for t, v in mod[z].items()} for z in mod}
        for z in mod:
            k = hr(NOW).strftime('%Y-%m-%dT%H:00')
            if k not in hist.get(z, {}) and mod[z].get(hr(NOW)) is not None: hist.setdefault(z, {})[k] = round(mod[z][hr(NOW)], 3)
        fonte_prev = 'met.no'
    except Exception as e2:
        log('met.no indisponível', e2)
    for z in mod:
        for k, v in hist.get(z, {}).items():
            t = dt.datetime.fromisoformat(k)
            if t < hr(NOW): mod[z][t] = v
lim_hist = (NOW - dt.timedelta(days=40)).strftime('%Y-%m-%dT%H:00')
escrever(HIST, {z: {k: v for k, v in hist.get(z, {}).items() if k >= lim_hist} for z in GRADE})
prev_ok = fonte_prev is not None


# ---------- chuva por zona: média dos pluviômetros com dado na hora; sem pluviômetro na hora, estimativa do modelo
def zona_obs(z):
    cods = [c for c, _, zz, _ in EST if zz == z]
    usados = [c for c in cods if sum(v is not None for v in chuva_h.get(c, {}).values()) > 72]
    serie, src = {}, {}
    for h in horas:
        v = [chuva_h[c][h] for c in usados if chuva_h[c].get(h) is not None]
        if v: serie[h] = sum(v) / len(v); src[h] = 'medicao'
        elif mod[z].get(h) is not None: serie[h] = mod[z][h]; src[h] = 'modelo'
        else: serie[h] = None
    return serie, src, usados


def janela(serie, a, b):
    """Soma sem preencher lacunas. Retorna (valor ou None, cobertura 0 a 1)."""
    n = int((b - a).total_seconds() // 3600); v = [serie.get(a + dt.timedelta(hours=i)) for i in range(n)]
    ok = [x for x in v if x is not None]
    return (sum(ok) if ok else None), (len(ok) / n if n else 0)


def fonte_janela(src, a, b):
    s = {src.get(a + dt.timedelta(hours=i)) for i in range(int((b - a).total_seconds() // 3600))} - {None}
    return 'sem dado' if not s else ('misto' if len(s) > 1 else s.pop())


agora = hr(NOW) + dt.timedelta(hours=1)
zonas, Zin = {}, {}
for z in ZONAS:
    s, src, usados = zona_obs(z)
    w = {k: janela(s, agora - dt.timedelta(hours=k), agora) for k in (24, 72, 120, 720)}
    ult = max((h for h in horas if src.get(h) == 'medicao'), default=None)
    dias = []
    for k in range(30, -1, -1):
        d0 = dt.datetime.combine(NOW.date() - dt.timedelta(days=k), dt.time()); d1 = min(d0 + dt.timedelta(days=1), agora)
        v, cob = janela(s, d0, d1); mv, _ = janela(mod[z], d0, d0 + dt.timedelta(days=1))
        dias.append({'d': d0.strftime('%Y-%m-%d'), 'obs': None if v is None else round(v, 1), 'cob': round(cob, 2),
                     'fonte': fonte_janela(src, d0, d1), 'mod': None if mv is None else round(mv, 1)})
    prev = []
    for k in range(0, 7):
        d0 = dt.datetime.combine(NOW.date() + dt.timedelta(days=k), dt.time()); a = max(d0, agora); b = d0 + dt.timedelta(days=1)
        v, cob = janela(mod[z], a, b) if (prev_ok and b > a) else (None, 0)
        prev.append({'d': d0.strftime('%Y-%m-%d'), 'prev': None if v is None else round(v, 1), 'cob': round(cob, 2)})
    p72, c72 = janela(mod[z], agora, agora + dt.timedelta(hours=72)) if prev_ok else (None, 0)
    p5m, _ = janela(mod[z], agora - dt.timedelta(hours=120), agora)
    r = lambda v: None if v is None else round(v, 1)
    zonas[z] = {'nome': ZONAS[z], 'fonte': fonte_janela(src, agora - dt.timedelta(hours=120), agora), 'pluviometros': usados,
                'ultima_medicao': iso(ult),
                'P24': r(w[24][0]), 'P72': r(w[72][0]), 'P5': r(w[120][0]), 'P30': r(w[720][0]),
                'cob24': round(w[24][1], 2), 'cob72': round(w[72][1], 2), 'cob5': round(w[120][1], 2), 'cob30': round(w[720][1], 2),
                'P5_modelo': r(p5m), 'prev72': r(p72) if c72 >= 0.9 else None, 'prev72_cob': round(c72, 2),
                'diario': dias, 'previsao': prev, '_s': s}
    Zin[z] = {'P5': w[120][0], 'cob5': w[120][1], 'P30': w[720][0], 'cob30': w[720][1]}


# ---------- vazão e nível
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
uaf = ultimo('40740000', 1); ubv = ultimo('40710001', 2); uafq = ultimo('40740000', 2)
ontem = NOW.date() - dt.timedelta(days=1)
qd = [v for h, v in af_q.items() if h.date() == ontem]
af_q_ontem = sum(qd) / len(qd) if qd else None
tend = None
if uaf:
    ant = [x for x in tel['40740000'] if x[1] is not None and x[0] <= uaf[0] - dt.timedelta(hours=3)]
    if ant: tend = round((uaf[1] - ant[-1][1]) / ((uaf[0] - ant[-1][0]).total_seconds() / 3600), 1)
serie_af24 = [[iso(h), round(v, 3)] for h, v in sorted(af_n.items()) if h >= hr(NOW) - dt.timedelta(hours=30)]

# ---------- réguas ao longo do trecho (cota horária dos últimos 10 dias, sem preencher lacunas)
REGUAS = ['40680001', '40686000', '40700050', '40710001', '40712000', '40712600', '40740000']
reguas = {}
for cod in REGUAS:
    sh = {h: v / 100 for h, v in serie_hora(cod, 1).items() if h >= hr(NOW) - dt.timedelta(days=10) and 0 < v < 3000}
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

# ---------- projeção pela regra de chuva (observado + previsto), sem tratar previsão ausente como zero
lz = dec['limites_zona']; proj = []
if prev_ok:
    for k in range(1, 4):
        fim = dt.datetime.combine(NOW.date() + dt.timedelta(days=k), dt.time()) + dt.timedelta(days=1)
        ini = fim - dt.timedelta(hours=120); vals, Lp, cobs = {}, {}, {}
        for z in ZONAS:
            o, co = janela(zonas[z]['_s'], ini, min(agora, fim)) if ini < agora else (0, 1)
            fc, cf = janela(mod[z], max(ini, agora), fim)
            ho = max(0, (min(agora, fim) - ini).total_seconds() / 3600); hf = (fim - max(ini, agora)).total_seconds() / 3600
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
for i in dec['indicadores'][:2]:
    if i['estado'] != 'ok': alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"{i['nome']} sem leitura válida nas últimas 3 horas" + (f" (última há {i['idade_h']:.0f} h)" if i['idade_h'] is not None else '')})
for z in ZONAS:
    e = dec['zonas'][z]
    if e['estado'] != 'ok': alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"Chuva de 5 dias em {z} com cobertura de {e['cob5'] * 100:.0f}%" + (' (valor parcial)' if e['estado'] == 'parcial' else ' (sem dado)')})
if dec['solo']['estado'] == 'indeterminado': alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"Umidade do solo indeterminada: {dec['solo']['criterio']}"})
if dec['motivo_manutencao']: alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': f"Nível mantido em {NIVEIS[dec['nivel']]}: {dec['motivo_manutencao']}"})
if not prev_ok: alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': 'Previsão de chuva indisponível nesta atualização'})


def stale(row, h=3): return row is None or (NOW - row[0]).total_seconds() > h * 3600


est = []
for cod, nome, z, papel in EST:
    rows = tel.get(cod, []); u0 = rows[-1] if rows else None
    if papel.endswith('(candidata)') and not rows: continue
    ch = chuva_h.get(cod, {}); c24 = [ch[h] for h in horas[-24:] if ch.get(h) is not None]
    un = ultimo(cod, 1); uq = ultimo(cod, 2)
    est.append({'cod': cod, 'nome': nome, 'zona': z, 'papel': papel, 'ultimo': u0[0].strftime('%Y-%m-%d %H:%M') if u0 else None,
                'nivel': round(un[1] / 100, 2) if un else None, 'vazao': round(uq[2], 1) if uq else None,
                'chuva24': round(sum(c24), 1) if c24 else None, 'chuva24_cob': round(len(c24) / 24, 2),
                'ok': not stale(u0), 'coleta_ok': coleta_ok.get(cod, False)})


def ser(d, nd=2): return [[iso(h), round(v, nd)] for h, v in sorted(d.items()) if h >= H0]


for z in zonas: del zonas[z]['_s']
ind_out = [{'nome': i['nome'], 'nivel': i['nivel'], 'estado': i['estado'], 'idade_h': i['idade_h']} for i in dec['indicadores']]
idade = lambda t: None if t is None else round((NOW - t).total_seconds() / 3600, 2)
out = {'versao': 2, 'atualizado': iso(NOW), 'coleta': iso(NOW), 'publicacao': None,
       'niveis_nomes': NIVEIS, 'limites': LIM, 'ajuste_umido': AJUSTE_UMIDO, 'areas': AREAS,
       'solo': {**dec['solo']},
       'nivel': {'atual': dec['nivel'], 'bruto': dec['nivel_bruto'], 'status': dec['status'], 'indicadores': ind_out,
                 'desde': (dec['estado'] or {}).get('desde'), 'causa': (dec['estado'] or {}).get('causa'),
                 'motivo': dec['motivo_manutencao'], 'descida_h': dec['descida_h']},
       'estado': dec['estado'],
       'qualidade': {'nivel': {'medicao': iso(uaf[0]) if uaf else None, 'idade_h': idade(uaf[0]) if uaf else None, 'estado': dec['indicadores'][0]['estado']},
                     'vazao': {'medicao': iso(ubv[0]) if ubv else None, 'idade_h': idade(ubv[0]) if ubv else None, 'estado': dec['indicadores'][1]['estado']},
                     'chuva': {z: {'ultima_medicao': zonas[z]['ultima_medicao'], 'cob5': zonas[z]['cob5'], 'fonte': zonas[z]['fonte'], 'estado': zonas[z]['estado']} for z in ZONAS},
                     'previsao': {'fonte': fonte_prev, 'estado': 'ok' if prev_ok else 'indisponivel'}},
       'previsao': proj, 'alertas': alertas, 'zonas': zonas,
       'af': {'h': round(uaf[1] / 100, 2) if uaf else None, 't': iso(uaf[0]) if uaf else None,
              'q': round(uafq[2], 1) if uafq else None, 'tendencia_cm_h': tend, 'nivel': dec['indicadores'][0]['nivel'],
              'serie': ser(af_n), 'serie_q': ser(af_q, 1)},
       'bv': {'q': round(ubv[2], 1) if ubv else None, 't': iso(ubv[0]) if ubv else None, 'nivel': dec['indicadores'][1]['nivel'], 'serie': ser(bv_q, 1)},
       'reguas': reguas, 'estacoes': est, 'modelo_ok': prev_ok, 'fonte_previsao': fonte_prev,
       'fonte_telemetria': 'ANA telemetriaws1 (serviço legado)', 'log': LOG[-30:]}
out['publicacao'] = dt.datetime.now(TZ).strftime('%Y-%m-%dT%H:%M')
escrever(sys.argv[1] if len(sys.argv) > 1 else 'data.json', out)
print('ok', out['atualizado'], 'nivel', NIVEIS[dec['nivel']] if dec['nivel'] is not None else 'indeterminado', dec['status'], 'solo', dec['solo']['estado'])
