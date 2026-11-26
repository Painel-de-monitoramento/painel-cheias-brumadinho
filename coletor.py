# Coletor do painel de monitoramento de cheias do Rio Paraopeba em Brumadinho
# Baseado no RT-BRU-HID-001 Rev04 (níveis de controle e regra de decisão, seções 10.3 e 10.4)
# Fontes: ANA telemetria (telemetriaws1.ana.gov.br) e Open-Meteo (chuva estimada por modelo e previsão)
# Uso: python3 coletor.py saida.json
import re, sys, json, time, math, urllib.request, datetime as dt
from collections import defaultdict

TZ = dt.timezone(dt.timedelta(hours=-3))
NOW = dt.datetime.now(TZ).replace(tzinfo=None)
NIVEIS = ['Normal', 'Atenção', 'Alerta', 'Alerta máximo', 'Emergência']
LIM = {  # limites do quadro de níveis (solo normal): Atenção, Alerta, Alerta máximo, Emergência
    'Z1': [140, 185, 235, 260], 'Z2': [155, 210, 260, 290], 'Z3': [170, 230, 285, 320],
    'BV': [300, 600, 950, 1150], 'AF': [5.0, 7.0, 9.0, 10.5]}
AJUSTE_UMIDO = 30
ZONAS = {'Z1': 'Alto Paraopeba / Maranhão', 'Z2': 'Camapuã / Brumado', 'Z3': 'Médio Paraopeba'}
EST = [  # código, nome, zona, papel
    ('40740000', 'Alberto Flores', 'Z3', 'régua de referência'),
    ('40710001', 'Belo Vale', 'Z3', 'vazão de controle'),
    ('40680001', 'Entre Rios de Minas', 'Z2', 'chuva e vazão'),
    ('40686000', 'Rio Camapuã (PCH Salto do Paraopeba)', 'Z2', 'chuva'),
    ('40700050', 'Paraopeba montante (PCH Salto do Paraopeba)', 'Z2', 'chuva'),
    ('40700080', 'PCH Salto do Paraopeba barramento', 'Z2', 'chuva'),
    ('40712500', 'Bonfim', 'Z3', 'chuva')]
GRADE = {  # pontos de grade do modelo dentro de cada zona (lat, lon)
 'Z1': [[-20.881, -43.817], [-20.761, -43.697], [-20.641, -43.937], [-20.521, -43.817]],
 'Z2': [[-20.851, -44.179], [-20.731, -44.059], [-20.611, -44.179], [-20.611, -43.939]],
 'Z3': [[-20.343, -44.299], [-20.223, -44.179], [-20.463, -44.059], [-20.343, -43.939]]}

def get(url, tries=3, timeout=60):
    for k in range(tries):
        try:
            return urllib.request.urlopen(url, timeout=timeout).read()
        except Exception as e:
            err = e; time.sleep(5 * (k + 1))
    raise err

def ana(cod, dias=36):
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

def hr(ts): return ts.replace(minute=0, second=0, microsecond=0)

# ---------- telemetria
import os
TCACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tel_cache.json')
try: tc = json.load(open(TCACHE))
except Exception: tc = {}
tel = {}
for cod, *_ in EST:
    old = [(dt.datetime.fromisoformat(r[0]), *r[1:]) for r in tc.get(cod, [])]
    dias = 3 if old and (NOW - old[0][0]).days >= 30 else 36
    try: new = ana(cod, dias)
    except Exception as e: new = []; print('falha', cod, e, file=sys.stderr)
    m = {r[0]: r for r in old}; m.update({r[0]: r for r in new})
    tel[cod] = sorted(r for t, r in m.items() if t >= NOW - dt.timedelta(days=37))
tc = {c: [[r[0].isoformat(), *r[1:]] for r in rows] for c, rows in tel.items()}
json.dump(tc, open(TCACHE, 'w'))

H0 = hr(NOW) - dt.timedelta(days=35)
horas = [H0 + dt.timedelta(hours=i) for i in range(int((hr(NOW) - H0).total_seconds() // 3600) + 1)]
chuva_h = {}  # chuva horária por estação (None = sem dado)
for cod, rows in tel.items():
    acc = defaultdict(float); has = set()
    for ts, n, q, c in rows:
        if c is not None and 0 <= c < 200: acc[hr(ts)] += c; has.add(hr(ts))
    chuva_h[cod] = {h: (acc[h] if h in has else None) for h in horas}

# ---------- modelo (Open-Meteo)
pts = [(z, p) for z in GRADE for p in GRADE[z]]
u = ('https://api.open-meteo.com/v1/forecast?latitude=' + ','.join(str(p[0]) for _, p in pts) +
     '&longitude=' + ','.join(str(p[1]) for _, p in pts) +
     '&hourly=precipitation&past_days=31&forecast_days=7&timezone=America%2FSao_Paulo')
import os
BASE = os.path.dirname(os.path.abspath(__file__))
HIST = os.path.join(BASE, 'modelo_hist.json')
try: hist = json.load(open(HIST))
except Exception: hist = {z: {} for z in GRADE}
mod = {z: {} for z in GRADE}; fonte_prev = None; modelo_hora = NOW.strftime('%Y-%m-%dT%H:%M')
# 1) Open-Meteo: passado (31 dias) e previsão (7 dias)
try:
    om = json.loads(get(u, tries=2))
    for (z, _), d in zip(pts, om):
        for t, v in zip(d['hourly']['time'], d['hourly']['precipitation']):
            mod[z].setdefault(dt.datetime.fromisoformat(t), []).append(v or 0.0)
    mod = {z: {t: sum(v) / len(v) for t, v in mod[z].items()} for z in mod}
    for z in mod:
        for t, v in mod[z].items():
            if t <= hr(NOW): hist.setdefault(z, {})[t.strftime('%Y-%m-%dT%H:00')] = round(v, 3)
    fonte_prev = 'Open-Meteo'
except Exception as e:
    print('Open-Meteo indisponível', e, file=sys.stderr)
    # 2) met.no (previsão) e histórico acumulado do modelo
    mod = {z: {} for z in GRADE}
    try:
        for z, p in pts:
            req = urllib.request.Request(f'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={p[0]:.3f}&lon={p[1]:.3f}', headers={'User-Agent': 'BrumadinhoCheiasPainel/1.0'})
            js = json.loads(urllib.request.urlopen(req, timeout=60).read()); time.sleep(0.3)
            for it in js['properties']['timeseries']:
                t = dt.datetime.fromisoformat(it['time'].replace('Z', '+00:00')).astimezone(TZ).replace(tzinfo=None)
                dd = it['data']
                if 'next_1_hours' in dd:
                    mod[z].setdefault(t, []).append(dd['next_1_hours']['details'].get('precipitation_amount', 0.0))
                elif 'next_6_hours' in dd:
                    v6 = dd['next_6_hours']['details'].get('precipitation_amount', 0.0) / 6
                    for i in range(6):
                        if t + dt.timedelta(hours=i) not in mod[z] or len(mod[z][t + dt.timedelta(hours=i)]) < GRADE[z].index(p) + 1:
                            mod[z].setdefault(t + dt.timedelta(hours=i), []).append(v6)
        mod = {z: {t: sum(v) / len(v) for t, v in mod[z].items()} for z in mod}
        for z in mod:  # a hora corrente prevista entra como estimativa da chuva da hora
            k = hr(NOW).strftime('%Y-%m-%dT%H:00')
            if k not in hist.get(z, {}) and hr(NOW) in mod[z]: hist.setdefault(z, {})[k] = round(mod[z][hr(NOW)], 3)
        fonte_prev = 'met.no'
    except Exception as e2:
        print('met.no indisponível', e2, file=sys.stderr)
    for z in mod:
        for k, v in hist.get(z, {}).items():
            t = dt.datetime.fromisoformat(k)
            if t < hr(NOW): mod[z][t] = v
lim_hist = (NOW - dt.timedelta(days=40)).strftime('%Y-%m-%dT%H:00')
hist = {z: {k: v for k, v in hist.get(z, {}).items() if k >= lim_hist} for z in GRADE}
json.dump(hist, open(HIST, 'w'))
modelo_ok = fonte_prev is not None
# ---------- chuva por zona (observada = média dos pluviômetros telemétricos com dado; sem pluviômetro = modelo)
def zona_obs(z):
    cods = [c for c, _, zz, _ in EST if zz == z]
    serie = {}; fonte = 'pluviômetros'
    usados = [c for c in cods if sum(v is not None for v in chuva_h.get(c, {}).values()) > 24 * 3]
    if not usados and not modelo_ok:
        return {h: None for h in horas}, 'sem dado', []
    if not usados:
        fonte = 'modelo'
        return {h: mod[z].get(h) for h in horas}, fonte, []
    for h in horas:
        v = [chuva_h[c][h] for c in usados if chuva_h[c].get(h) is not None]
        serie[h] = sum(v) / len(v) if v else (mod[z].get(h) if modelo_ok else None)
    return serie, fonte, usados

def soma(serie, a, b):
    return sum((serie.get(a + dt.timedelta(hours=i)) or 0) for i in range(int((b - a).total_seconds() // 3600)))

def nivel(v, lim):
    k = 0
    for i, t in enumerate(lim):
        if v is not None and v >= t: k = i + 1
    return k

agora = hr(NOW) + dt.timedelta(hours=1)
zonas = {}; P30 = []
for z in ZONAS:
    s, fonte, usados = zona_obs(z)
    P5 = soma(s, agora - dt.timedelta(hours=120), agora)
    P30.append(soma(s, agora - dt.timedelta(days=30), agora))
    dias = []
    for k in range(30, -1, -1):
        d0 = dt.datetime.combine(NOW.date() - dt.timedelta(days=k), dt.time())
        dias.append({'d': d0.strftime('%Y-%m-%d'), 'obs': round(soma(s, d0, min(d0 + dt.timedelta(days=1), agora)), 1),
                     'mod': round(soma(mod[z], d0, d0 + dt.timedelta(days=1)), 1) if modelo_ok else None})
    prev = []
    for k in range(0, 7):
        d0 = dt.datetime.combine(NOW.date() + dt.timedelta(days=k), dt.time())
        a = max(d0, agora); b = d0 + dt.timedelta(days=1)
        prev.append({'d': d0.strftime('%Y-%m-%d'), 'prev': round(soma(mod[z], a, b), 1) if (modelo_ok and b > a) else 0.0})
    zonas[z] = {'nome': ZONAS[z], 'fonte': fonte, 'pluviometros': usados, 's': s,
                'P24': round(soma(s, agora - dt.timedelta(hours=24), agora), 1),
                'P72': round(soma(s, agora - dt.timedelta(hours=72), agora), 1),
                'P5': round(P5, 1), 'P30': round(P30[-1], 1),
                'P5_modelo': round(soma(mod[z], agora - dt.timedelta(hours=120), agora), 1) if modelo_ok else None,
                'prev72': round(soma(mod[z], agora, agora + dt.timedelta(hours=72)), 1) if modelo_ok else None,
                'diario': dias, 'previsao': prev}

# ---------- vazão e nível
def serie_hora(cod, idx):
    acc = defaultdict(list)
    for r in tel.get(cod, []):
        if r[idx] is not None: acc[hr(r[0])].append(r[idx])
    return {h: sum(v) / len(v) for h, v in acc.items()}
af_n = {h: v / 100 for h, v in serie_hora('40740000', 1).items()}
af_q = serie_hora('40740000', 2); bv_q = serie_hora('40710001', 2)
def ultimo(cod, idx):
    for r in reversed(tel.get(cod, [])):
        if r[idx] is not None: return r
    return None
uaf = ultimo('40740000', 1); ubv = ultimo('40710001', 2)
af_h = uaf[1] / 100 if uaf else None; bv_q_now = ubv[2] if ubv else None
ontem = NOW.date() - dt.timedelta(days=1)
qd = [v for h, v in af_q.items() if h.date() == ontem]
af_q_ontem = sum(qd) / len(qd) if qd else None
p30_bacia = sum(P30) / len(P30)
umido = (af_q_ontem is not None and af_q_ontem > 90) or p30_bacia > 370
adj = AJUSTE_UMIDO if umido else 0
def lim_chuva(z): return [t - adj for t in LIM[z]]

# tendência da régua (cm/h nas últimas 3 h)
tend = None
if uaf:
    ant = [r for r in tel['40740000'] if r[1] is not None and r[0] <= uaf[0] - dt.timedelta(hours=3)]
    if ant: tend = round((uaf[1] - ant[-1][1]) / ((uaf[0] - ant[-1][0]).total_seconds() / 3600), 1)

# ---------- regra de decisão (seção 10.4)
Lz = {z: nivel(zonas[z]['P5'], lim_chuva(z)) for z in ZONAS}
for z in ZONAS: zonas[z]['nivel'] = Lz[z]; zonas[z]['limites'] = lim_chuva(z)
ordz = sorted(Lz.values(), reverse=True)
R2 = ordz[1]; Rpre = max(ordz[0] - 1, 0)
L_af = nivel(af_h, LIM['AF']); L_bv = nivel(bv_q_now, LIM['BV'])
cand = [('Régua de Alberto Flores', L_af), ('Vazão em Belo Vale', L_bv), ('Chuva em duas zonas', R2), ('Chuva em uma zona (pré-aviso)', Rpre)]
nivel_atual = max(v for _, v in cand)

def stale(r, h=3): return r is None or (NOW - r[0]).total_seconds() > h * 3600

# previsão: chuva observada + prevista (modelo) até o fim de cada dia
proj = []
if modelo_ok:
    for k in range(1, 4):
        fim = dt.datetime.combine(NOW.date() + dt.timedelta(days=k), dt.time()) + dt.timedelta(days=1)
        Lp = {}; vals = {}
        for z in ZONAS:
            ini = fim - dt.timedelta(hours=120)
            obs = soma(zonas[z]['s'], ini, min(agora, fim)) if ini < agora else 0
            fc = soma(mod[z], max(ini, agora), fim)
            vals[z] = round(obs + fc, 1); Lp[z] = nivel(vals[z], lim_chuva(z))
        o = sorted(Lp.values(), reverse=True)
        proj.append({'d': (fim - dt.timedelta(days=1)).strftime('%Y-%m-%d'), 'P5': vals, 'niveis': Lp, 'nivel': max(o[1], max(o[0] - 1, 0))})

alertas = []
for nome, v in cand:
    if v > 0: alertas.append({'tipo': 'nivel', 'nivel': v, 'texto': f'{nome} indica {NIVEIS[v]}'})
for p in proj:
    if p['nivel'] > nivel_atual:
        alertas.append({'tipo': 'previsao', 'nivel': p['nivel'], 'texto': f"A previsão de chuva para {p['d'][8:]}/{p['d'][5:7]} leva a {NIVEIS[p['nivel']]} pela regra de chuva"})
if stale(uaf): alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': 'Régua de Alberto Flores sem transmissão há mais de 3 horas'})
if stale(ubv): alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': 'Belo Vale sem transmissão há mais de 3 horas'})
if not modelo_ok: alertas.append({'tipo': 'dado', 'nivel': 0, 'texto': 'Previsão de chuva indisponível nesta atualização'})

est = []
for cod, nome, z, papel in EST:
    rows = tel.get(cod, []); u = rows[-1] if rows else None
    ch = chuva_h.get(cod, {}); c24 = [ch[h] for h in horas[-24:] if ch.get(h) is not None]
    un = ultimo(cod, 1); uq = ultimo(cod, 2)
    est.append({'cod': cod, 'nome': nome, 'zona': z, 'papel': papel,
                'ultimo': u[0].strftime('%Y-%m-%d %H:%M') if u else None,
                'nivel': round(un[1] / 100, 2) if un else None, 'vazao': round(uq[2], 1) if uq else None,
                'chuva24': round(sum(c24), 1) if c24 else None, 'ok': not stale(u)})

def ser(d, nd=2): return [[h.strftime('%Y-%m-%dT%H:%M'), round(v, nd)] for h, v in sorted(d.items()) if h >= H0]
for z in zonas: del zonas[z]['s']
out = {'atualizado': NOW.strftime('%Y-%m-%dT%H:%M'), 'niveis_nomes': NIVEIS, 'limites': LIM, 'ajuste_umido': AJUSTE_UMIDO,
       'solo': {'umido': umido, 'af_q_ontem': round(af_q_ontem, 1) if af_q_ontem else None, 'p30_bacia': round(p30_bacia, 1)},
       'nivel': {'atual': nivel_atual, 'indicadores': [{'nome': n, 'nivel': v} for n, v in cand]},
       'previsao': proj, 'alertas': alertas, 'zonas': zonas,
       'af': {'h': round(af_h, 2) if af_h is not None else None, 't': uaf[0].strftime('%Y-%m-%dT%H:%M') if uaf else None,
              'q': round(uaf[2], 1) if uaf and uaf[2] is not None else None, 'tendencia_cm_h': tend, 'nivel': L_af,
              'serie': ser(af_n), 'serie_q': ser(af_q, 1)},
       'bv': {'q': round(bv_q_now, 1) if bv_q_now is not None else None, 't': ubv[0].strftime('%Y-%m-%dT%H:%M') if ubv else None,
              'nivel': L_bv, 'serie': ser(bv_q, 1)},
       'estacoes': est, 'modelo_ok': modelo_ok, 'fonte_previsao': fonte_prev}
json.dump(out, open(sys.argv[1] if len(sys.argv) > 1 else 'data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('ok', out['atualizado'], 'nivel', NIVEIS[nivel_atual], 'solo umido' if umido else 'solo normal')
