# Motor de decisão único dos níveis de controle (RT-BRU-HID-001 Rev04, seções 10.3 e 10.4).
# Tradução linha a linha de motor.js. Qualquer alteração deve ser feita nos dois arquivos e validada por testes/test_motor.py.
# Horários são locais de Brasília (UTC-3) sem fuso no texto; as diferenças são calculadas tratando o texto como UTC,
# o que independe do fuso do computador que executa o motor.
import calendar, datetime as dt

IDADE_MAX_H, TOL_FUTURO_H, COB_OK, COB_Q_ONTEM, HORAS_DESCIDA, TOL_DESCIDA, ZONAS_MIN_NORMAL = 3, 5 / 60, 0.9, 0.5, 12, 0.005, 2
NOMES = {'AF': 'Régua de Alberto Flores', 'BV': 'Vazão em Belo Vale', 'R2': 'Chuva em duas zonas', 'R1': 'Chuva em uma zona (pré-aviso)'}
ZS = ['Z1', 'Z2', 'Z3']


def _ms(s): return calendar.timegm(dt.datetime.fromisoformat(str(s)[:16]).timetuple()) * 1000


def nivel(v, lim):
    if v is None: return 0
    k = 0
    for i, t in enumerate(lim):
        if v >= t: k = i + 1
    return k


def _r1(v):
    if v is None: return None
    x = round(v * 10 + (1e-9 if v >= 0 else -1e-9))  # arredondamento igual ao Math.round para valores usuais
    return x / 10


def _fmt(v):
    v = _r1(v)
    return str(int(v)) if v is not None and v == int(v) else str(v)


def _idade(t, agora): return (_ms(agora) - _ms(t)) / 36e5 if t else None


def situacao(v, t, agora):
    i = _idade(t, agora)
    if v is None or i is None: return {'ok': False, 'idade': i, 'motivo': 'sem leitura'}
    if i < -TOL_FUTURO_H: return {'ok': False, 'idade': i, 'motivo': 'horário da leitura no futuro'}
    if i > IDADE_MAX_H: return {'ok': False, 'idade': i, 'motivo': 'leitura com mais de 3 h'}
    return {'ok': True, 'idade': i, 'motivo': None}


def descida(serie):
    if not serie or len(serie) < 2: return 0
    n = len(serie) - 1; h = 0
    while n > 0:
        d = (_ms(serie[n][0]) - _ms(serie[n - 1][0])) / 36e5
        if abs(d - 1) > 0.01 or serie[n][1] is None or serie[n - 1][1] is None: break
        if serie[n][1] - serie[n - 1][1] > TOL_DESCIDA: break
        h += 1; n -= 1
    ini = serie[len(serie) - 1 - h]; fim = serie[-1]
    return h if h > 0 and fim[1] < ini[1] else 0


def solo(inp):
    L = inp.get('limites_umidade') or {'q': 90, 'p30': 370}; af = inp.get('af') or {}
    cobq = af.get('q_ontem_cobertura'); cobq = 0 if cobq is None else cobq
    qv = af.get('q_ontem') if af.get('q_ontem') is not None and cobq >= COB_Q_ONTEM else None
    num = 0; cob_ok = True; falta = False
    for z in ZS:
        Z = (inp.get('zonas') or {}).get(z) or {}; a = inp['areas'][z]
        if Z.get('P30') is None: falta = True; continue
        num += a * Z['P30']
        if (Z.get('cob30') or 0) < COB_OK: cob_ok = False
    tot = sum(inp['areas'][z] for z in ZS)
    p30 = None if falta else num / tot
    p30valido = p30 is not None and cob_ok
    if qv is not None and qv > L['q']:
        estado, criterio = 'umido', f"vazão média de ontem em Alberto Flores {_fmt(qv)} m³/s acima de {L['q']}"
    elif p30 is not None and p30 > L['p30']:
        estado, criterio = 'umido', f"chuva de 30 dias na bacia {_fmt(p30)} mm acima de {L['p30']}"
    elif qv is not None and p30valido:
        estado, criterio = 'normal', 'vazão de ontem e chuva de 30 dias abaixo dos critérios'
    else:
        estado = 'indeterminado'
        if qv is None:
            criterio = (f"vazão média de ontem em Alberto Flores com cobertura de {round(cobq * 100 + 1e-9)}%" if af.get('q_ontem') is not None
                        else 'sem vazão média de ontem em Alberto Flores')
        else: criterio = 'chuva de 30 dias incompleta'
    return {'estado': estado, 'umido': estado == 'umido', 'af_q_ontem': _r1(qv), 'af_q_ontem_cobertura': _r1(cobq), 'p30_bacia': _r1(p30),
            'p30_completa': p30valido, 'criterio': criterio}


def _chuva(inp, adj):
    L = inp['limites']; zn = {}; zl = {}
    for z in ZS:
        Z = (inp.get('zonas') or {}).get(z) or {}; lim = [t - adj for t in L[z]]; zl[z] = lim
        cob = Z.get('cob5') or 0
        est = 'indisponivel' if Z.get('P5') is None or not cob > 0 else ('ok' if cob >= COB_OK else 'parcial')
        # janela de 5 dias encerrada há mais de 3 h: o valor ainda pode elevar o nível, mas não conta como zona completa
        idf = _idade(Z.get('fim'), inp['agora']) if Z.get('fim') else None
        if est == 'ok' and idf is not None and idf > IDADE_MAX_H: est = 'desatualizada'
        zn[z] = {'nivel': None if est == 'indisponivel' else nivel(Z['P5'], lim), 'estado': est, 'P5': None if Z.get('P5') is None else _r1(Z['P5']), 'cob5': cob,
                 'idade_fim_h': _r1(idf)}
    disp = [z for z in ZS if zn[z]['estado'] != 'indisponivel']
    ordz = sorted([zn[z]['nivel'] for z in disp], reverse=True)
    z_ok = sum(1 for z in ZS if zn[z]['estado'] == 'ok')
    return {'zn': zn, 'zl': zl, 'disp': disp, 'zOk': z_ok, 'R2': ordz[1] if len(ordz) >= 2 else None, 'R1': max(ordz[0] - 1, 0) if ordz else None}


def decidir(inp):
    L = inp['limites']; agora = inp['agora']; S = solo(inp); adj = inp['ajuste_umido'] if S['umido'] else 0
    af = inp.get('af') or {}; bv = inp.get('bv') or {}
    ind = []
    sa = situacao(af.get('h'), af.get('t'), agora); sb = situacao(bv.get('q'), bv.get('t'), agora)
    af_ok = sa['ok']; bv_ok = sb['ok']
    ind.append({'id': 'AF', 'nome': NOMES['AF'], 'nivel': nivel(af['h'], L['AF']) if af_ok else None, 'estado': 'ok' if af_ok else 'indisponivel', 'idade_h': _r1(sa['idade']), 'motivo': sa['motivo']})
    ind.append({'id': 'BV', 'nome': NOMES['BV'], 'nivel': nivel(bv['q'], L['BV']) if bv_ok else None, 'estado': 'ok' if bv_ok else 'indisponivel', 'idade_h': _r1(sb['idade']), 'motivo': sb['motivo']})
    C = _chuva(inp, adj); zn = C['zn']; zl = C['zl']
    ind.append({'id': 'R2', 'nome': NOMES['R2'], 'nivel': C['R2'], 'estado': 'indisponivel' if C['R2'] is None else ('ok' if C['zOk'] == 3 else 'parcial'), 'idade_h': None, 'motivo': None})
    ind.append({'id': 'R1', 'nome': NOMES['R1'], 'nivel': C['R1'], 'estado': 'indisponivel' if C['R1'] is None else ('ok' if C['zOk'] == 3 else 'parcial'), 'idade_h': None, 'motivo': None})
    vals = [i['nivel'] for i in ind if i['nivel'] is not None]
    bruto = max(vals) if vals else None
    tudo_ok = all(i['estado'] == 'ok' for i in ind)
    bruto_umido = None
    if S['estado'] == 'indeterminado':
        Cu = _chuva(inp, inp['ajuste_umido'])
        vu = [v for v in (ind[0]['nivel'], ind[1]['nivel'], Cu['R2'], Cu['R1']) if v is not None]
        bruto_umido = max(vu) if vu else None
    if bruto is None: status = 'indeterminado'
    elif bruto == 0 and (not af_ok or not bv_ok or C['zOk'] < ZONAS_MIN_NORMAL): status = 'indeterminado'
    else: status = 'valido' if tudo_ok and S['estado'] != 'indeterminado' else 'degradado'
    causa = ', '.join(i['nome'] for i in ind if i['nivel'] == bruto) if bruto else None

    ant = inp.get('estado_anterior'); hist = list((ant or {}).get('historico') or [])[-99:]
    est = {'nivel': ant.get('nivel'), 'desde': ant.get('desde'), 'causa': ant.get('causa')} if ant else None
    motivo = None; hdesc = descida(inp.get('serie_af'))
    alvo = max(bruto, bruto_umido) if (bruto_umido is not None and bruto is not None) else bruto
    if bruto is not None and status != 'indeterminado':
        if not est or est['nivel'] is None:
            est = {'nivel': bruto, 'desde': agora, 'causa': causa or 'indicadores abaixo do limite de Atenção'}
            hist.append({'t': agora, 'de': None, 'para': bruto, 'causa': est['causa']})
        elif bruto > est['nivel']:
            hist.append({'t': agora, 'de': est['nivel'], 'para': bruto, 'causa': causa})
            est = {'nivel': bruto, 'desde': agora, 'causa': causa}
        elif bruto < est['nivel']:
            if inp.get('somente_subir'): motivo = 'rebaixamento reservado ao coletor'
            elif not tudo_ok: motivo = 'rebaixamento bloqueado: há indicador sem dado válido'
            elif alvo >= est['nivel']: motivo = 'rebaixamento bloqueado: umidade do solo indeterminada e, com solo úmido, a chuva manteria o nível'
            elif hdesc < HORAS_DESCIDA: motivo = f'rebaixamento aguardando descida contínua da régua por {HORAS_DESCIDA} h ({hdesc} h até agora)'
            else:
                c = f'todos os indicadores abaixo do limite e régua em descida há {hdesc} h'
                hist.append({'t': agora, 'de': est['nivel'], 'para': alvo, 'causa': c})
                est = {'nivel': alvo, 'desde': agora, 'causa': c}
    elif est and est['nivel'] is not None:
        motivo = 'dados insuficientes: mantido o último nível publicado'
    return {'nivel': est['nivel'] if est else None, 'nivel_bruto': bruto, 'nivel_bruto_solo_umido': bruto_umido, 'status': status, 'indicadores': ind, 'zonas': zn,
            'limites_zona': zl, 'solo': S, 'descida_h': hdesc, 'motivo_manutencao': motivo,
            'estado': dict(est, historico=hist) if est else None}
