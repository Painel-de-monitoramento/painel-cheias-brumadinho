# Cliente da Plataforma de Entrega de Dados (PED) do CEMADEN, usado pelo coletor para medir a chuva da Z1.
# Credenciais somente por variáveis de ambiente (segredos do GitHub): CEMADEN_USUARIO e CEMADEN_SENHA.
# Nunca grava nem imprime o token ou a senha. Fonte obrigatória: "DADOS DA REDE OBSERVACIONAL DO CEMADEN/MCTIC".
# Formato verificado em consulta real (27/11/2026): /pcds/dados_rede aceita no máximo 1 dia por consulta e devolve CSV com separador ";" e horário UTC;
# o sensor "chuva" traz a chuva acumulada desde o registro anterior (a cada 10 min com chuva, a cada hora sem chuva).
# Uso de diagnóstico (não altera nada): python cemaden.py --diagnostico
import csv, io, json, os, sys, time, urllib.request, urllib.parse, datetime as dt

TOKEN_URL = 'https://sgaa.cemaden.gov.br/SGAA/rest/controle-token/tokens'
BASE = 'https://sws.cemaden.gov.br/PED/rest'
REDE = '11'
UTC_PARA_LOCAL = dt.timedelta(hours=-3)
# municípios consultados por zona; só entram as estações pluviométricas cuja posição cai dentro do polígono da zona
MUNICIPIOS = {'Z1': {'3118007': 'Congonhas', '3118304': 'Conselheiro Lafaiete'}}
# projeção (lon, lat) -> coordenadas do mapa do painel, ajustada em 4 estações com posição conhecida (resíduo < 0,05)
PROJ = ((560.6528, -0.3019, 24858.4512), (0.3371, -560.769, -11280.5828))
POLIGONO = {'Z1': [[290.9,152.4],[314.7,165.7],[326.5,159.3],[332.7,163.3],[338.8,161.6],[343.5,172.0],[347.4,172.3],[353.4,168.0],[364.2,168.9],[370.1,160.4],[373.8,160.4],[374.0,167.5],[370.2,171.0],[380.8,179.7],[373.5,184.1],[372.3,193.8],[362.7,197.6],[392.0,204.5],[395.8,214.4],[393.3,219.8],[385.5,221.8],[385.3,228.0],[399.5,242.8],[399.5,250.0],[389.6,253.4],[393.0,262.3],[386.5,265.9],[380.2,282.4],[374.9,284.7],[377.8,294.0],[372.5,295.4],[370.2,309.4],[364.2,313.4],[365.4,316.1],[356.6,328.6],[341.8,328.2],[338.3,342.0],[329.9,343.3],[332.0,359.5],[325.3,362.7],[322.8,369.5],[330.3,381.4],[328.0,387.0],[324.7,385.8],[328.3,394.1],[326.4,398.5],[318.5,399.2],[318.1,404.4],[311.1,407.9],[308.7,415.3],[297.7,409.4],[285.6,412.2],[283.4,419.7],[277.2,415.4],[261.2,422.5],[253.4,416.8],[243.8,427.2],[237.9,421.8],[231.9,428.9],[224.2,431.1],[220.1,426.6],[223.0,398.9],[218.1,395.3],[220.6,392.3],[218.4,388.7],[222.8,385.9],[220.7,381.4],[223.6,372.3],[219.0,366.3],[224.6,352.7],[223.1,347.5],[216.0,343.2],[213.5,332.0],[202.1,325.3],[209.1,318.7],[207.1,305.8],[211.8,304.3],[203.6,277.1],[222.1,270.0],[223.4,261.4],[228.0,257.3],[228.1,245.5],[235.1,238.4],[231.4,234.9],[232.4,225.9],[221.9,228.4],[213.8,219.5],[218.3,213.9],[217.1,199.4],[234.3,184.9],[232.8,174.8],[236.9,173.7],[238.9,160.2],[249.0,153.3],[251.2,160.2],[255.0,155.7],[265.3,159.8],[275.9,151.8],[286.8,155.1],[290.9,152.4]]}
JANELA_DIAS = 36            # histórico mantido (30 dias de P30 + folga)
LOTE_RETRO_DIAS = 3         # histórico antigo preenchido aos poucos, um lote por execução
_ult = [0.0]


def _espera():   # limite de 12 requisições por minuto para usuário externo: no máximo 1 a cada 5,5 s
    d = time.time() - _ult[0]
    if d < 5.5: time.sleep(5.5 - d)
    _ult[0] = time.time()


def credenciais(): return os.environ.get('CEMADEN_USUARIO'), os.environ.get('CEMADEN_SENHA')


def token():
    u, s = credenciais()
    if not u or not s: raise RuntimeError('credenciais do CEMADEN ausentes (segredos CEMADEN_USUARIO e CEMADEN_SENHA)')
    _espera()
    req = urllib.request.Request(TOKEN_URL, data=json.dumps({'email': u, 'password': s}).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=40) as r:
        j = json.loads(r.read())
    t = j.get('token') if isinstance(j, dict) else None
    if not t: raise RuntimeError('resposta do serviço de token sem campo "token"')
    return t


def get(tk, caminho, **q):
    _espera()
    u = BASE + caminho + '?' + urllib.parse.urlencode({k: v for k, v in q.items() if v is not None})
    req = urllib.request.Request(u, headers={'token': tk})
    with urllib.request.urlopen(req, timeout=60) as r:
        tx = r.read().decode('utf-8', 'ignore')
    try: return json.loads(tx)
    except ValueError: return tx


def projeta(lon, lat): return (PROJ[0][0] * lon + PROJ[0][1] * lat + PROJ[0][2], PROJ[1][0] * lon + PROJ[1][1] * lat + PROJ[1][2])


def dentro(x, y, P):
    c = False
    for i in range(len(P)):
        (x1, y1), (x2, y2) = P[i], P[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c


def parse_csv(tx):
    """CSV de /pcds/dados_rede -> lista de registros de chuva com horário local (UTC-3). Linhas inválidas são ignoradas."""
    linhas = [l for l in tx.splitlines() if l.strip() and not l.startswith('OBS')]
    out = []
    for r in csv.DictReader(io.StringIO('\n'.join(linhas)), delimiter=';'):
        if (r.get('sensor') or '').strip() != 'chuva': continue
        try:
            t = dt.datetime.strptime(r['datahora'].strip()[:19], '%Y-%m-%d %H:%M:%S') + UTC_PARA_LOCAL
            v = float(r['valor']); lat = float(r['latitude']); lon = float(r['longitude'])
        except (KeyError, ValueError, TypeError): continue
        if not (0 <= v < 200): continue
        out.append({'cod': r['cod.estacao'].strip(), 'nome': r['nome'].strip(), 'municipio': r['municipio'].strip(), 'lat': lat, 'lon': lon,
                    't': t, 'valor': v, 'qualificacao': (r.get('qualificacao') or '').strip()})
    return out


def _fmt_utc(t_local): return (t_local - UTC_PARA_LOCAL).strftime('%Y%m%d%H%M')


MAX_JANELA = dt.timedelta(hours=23, minutes=55)   # a PED recusa intervalos acima de 1 dia (HTTP 400, verificado em 27/11/2026)


def _fatias(janelas):
    for a, b in janelas:
        while a < b:
            c = min(b, a + MAX_JANELA); yield a, c; a = c


def atualizar(cache, agora, log=print):
    """Baixa os registros recentes e um lote do histórico antigo; devolve (cache, situação). Nunca levanta exceção."""
    cache = cache or {}
    reg = cache.setdefault('registros', {}); meta = cache.setdefault('estacoes', {})
    sit = {'configurado': all(credenciais()), 'ok': False, 'erro': None, 'consultas': 0}
    if not sit['configurado']: return cache, sit
    try:
        tk = token()
        ult = cache.get('ultimo_sucesso')
        ini = max(agora - dt.timedelta(days=3), (dt.datetime.fromisoformat(ult) - dt.timedelta(hours=2)) if ult else agora - dt.timedelta(days=3))
        janelas = [(ini, agora + dt.timedelta(minutes=5))]
        retro = dt.datetime.fromisoformat(cache['retro_ate']) if cache.get('retro_ate') else ini
        if retro > agora - dt.timedelta(days=JANELA_DIAS):
            janelas.append((retro - dt.timedelta(days=LOTE_RETRO_DIAS), retro))
        novos = 0; falhas = []
        for zona, muns in MUNICIPIOS.items():
            for cod_ibge in muns:
                for a, b in _fatias(janelas):
                    try:
                        tx = get(tk, '/pcds/dados_rede', uf='MG', municipio=cod_ibge, rede=REDE, inicio=_fmt_utc(a), fim=_fmt_utc(b))
                    except Exception as e:
                        falhas.append(e); log('CEMADEN: consulta falhou', cod_ibge, a.isoformat(timespec='minutes'), type(e).__name__); continue
                    sit['consultas'] += 1
                    if not isinstance(tx, str): log('CEMADEN: resposta inesperada para', cod_ibge, str(tx)[:120]); continue
                    for r in parse_csv(tx):
                        x, y = projeta(r['lon'], r['lat'])
                        if not dentro(x, y, POLIGONO[zona]): continue
                        meta[r['cod']] = {'nome': r['nome'], 'municipio': r['municipio'], 'lat': r['lat'], 'lon': r['lon'], 'zona': zona, 'x': round(x, 1), 'y': round(y, 1)}
                        lst = reg.setdefault(r['cod'], {}); k = r['t'].strftime('%Y-%m-%dT%H:%M')
                        if k not in lst: novos += 1
                        lst[k] = r['valor']
        if falhas and not sit['consultas']: raise falhas[-1]
        if len(janelas) > 1: cache['retro_ate'] = janelas[1][0].isoformat(timespec='minutes')
        elif not cache.get('retro_ate'): cache['retro_ate'] = ini.isoformat(timespec='minutes')
        lim = (agora - dt.timedelta(days=JANELA_DIAS + 1)).strftime('%Y-%m-%dT%H:%M')
        for c in reg: reg[c] = {k: v for k, v in sorted(reg[c].items()) if k >= lim}
        cache['ultimo_sucesso'] = agora.isoformat(timespec='minutes'); cache['erro'] = None
        sit.update(ok=True, novos=novos, estacoes=len(meta), historico_desde=cache.get('retro_ate'))
    except Exception as e:
        sit['erro'] = f'{type(e).__name__}: {str(e)[:160]}'; cache['erro'] = sit['erro']; log('CEMADEN falhou', sit['erro'])
    sit['ultimo_sucesso'] = cache.get('ultimo_sucesso')
    return cache, sit


def _norm(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', str(s).upper()) if unicodedata.category(c) != 'Mn')


def diagnostico():
    agora = dt.datetime.now(dt.timezone(UTC_PARA_LOCAL)).replace(tzinfo=None)
    cache, sit = atualizar({}, agora)
    print('situação:', json.dumps(sit, ensure_ascii=False))
    for c, m in sorted(cache.get('estacoes', {}).items()):
        r = cache['registros'].get(c, {})
        print(c, m['nome'], m['municipio'], m['zona'], 'registros', len(r), 'último', max(r) if r else None, 'soma', round(sum(r.values()), 1))


if __name__ == '__main__':
    if '--diagnostico' in sys.argv:
        try: diagnostico()
        except Exception as e: print('ERRO', type(e).__name__, str(e)[:300]); sys.exit(1)
