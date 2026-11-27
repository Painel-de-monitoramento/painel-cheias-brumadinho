# Cliente da Plataforma de Entrega de Dados (PED) do CEMADEN.
# Credenciais somente por variáveis de ambiente (segredos do GitHub): CEMADEN_USUARIO e CEMADEN_SENHA.
# Nunca imprime o token nem a senha. Fonte obrigatória: "DADOS DA REDE OBSERVACIONAL DO CEMADEN/MCTIC".
# Uso de diagnóstico (não altera nada): python cemaden.py --diagnostico
import json, os, sys, time, urllib.request, urllib.parse, datetime as dt

TOKEN_URL = 'https://sgaa.cemaden.gov.br/SGAA/rest/controle-token/tokens'
BASE = 'https://sws.cemaden.gov.br/PED/rest'
REDE = '11'
# municípios da Z1 (Alto Paraopeba / Maranhão) e vizinhos da Z2 cujos pluviômetros podem ser avaliados
MUNICIPIOS = ['CONGONHAS', 'CONSELHEIRO LAFAIETE', 'OURO BRANCO', 'CRISTIANO OTONI', 'QUELUZITO', 'CASA GRANDE',
              'CATAS ALTAS DA NORUEGA', 'SANTANA DOS MONTES', 'LAMIM', 'CARANAIBA', 'JECEABA', 'SAO BRAS DO SUACUI',
              'ENTRE RIOS DE MINAS', 'BELO VALE', 'BRUMADINHO']
_ult = [0.0]


def _espera():   # limite de 12 requisições por minuto para usuário externo: no máximo 1 a cada 5,5 s
    d = time.time() - _ult[0]
    if d < 5.5: time.sleep(5.5 - d)
    _ult[0] = time.time()


def token():
    u, s = os.environ.get('CEMADEN_USUARIO'), os.environ.get('CEMADEN_SENHA')
    if not u or not s: raise RuntimeError('credenciais do CEMADEN ausentes (segredos CEMADEN_USUARIO e CEMADEN_SENHA)')
    _espera()
    req = urllib.request.Request(TOKEN_URL, data=json.dumps({'email': u, 'password': s}).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=40) as r:
        j = json.loads(r.read())
    t = j.get('token') if isinstance(j, dict) else None
    if not t: raise RuntimeError('resposta do serviço de token sem campo "token" (chaves: %s)' % (list(j) if isinstance(j, dict) else type(j).__name__))
    return t


def get(tk, caminho, **q):
    _espera()
    u = BASE + caminho + '?' + urllib.parse.urlencode({k: v for k, v in q.items() if v is not None})
    req = urllib.request.Request(u, headers={'token': tk})
    with urllib.request.urlopen(req, timeout=60) as r:
        tx = r.read().decode('utf-8', 'ignore')
    try: return json.loads(tx)
    except ValueError: return tx


def _norm(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', str(s).upper()) if unicodedata.category(c) != 'Mn')


def diagnostico():
    tk = token(); print('token obtido (não exibido)')
    cid = get(tk, '/pcds-cadastro/cidades', uf='MG', formato='JSON')
    print('cidades: tipo', type(cid).__name__, 'exemplo', json.dumps(cid[:2] if isinstance(cid, list) else cid, ensure_ascii=False)[:400])
    alvo = []
    if isinstance(cid, list):
        for c in cid:
            txt = _norm(json.dumps(c, ensure_ascii=False))
            if any(m in txt for m in MUNICIPIOS): alvo.append(c)
    print('municípios encontrados:', json.dumps(alvo, ensure_ascii=False)[:1500])
    agora = dt.datetime.utcnow(); ini = (agora - dt.timedelta(hours=3)).strftime('%Y%m%d%H%M'); fim = agora.strftime('%Y%m%d%H%M')
    for c in alvo:
        cod = next((c[k] for k in ('codibge', 'cod_ibge', 'codigo_ibge', 'ibge') if k in c), None)
        if not cod: continue
        est = get(tk, '/pcds-cadastro/estacoes', codibge=cod, formato='JSON')
        print('\nestações', cod, json.dumps(est, ensure_ascii=False)[:1500])
        rec = get(tk, '/pcds/pcds-dados-recentes', uf='MG', codibge=cod, rede=REDE, formato='JSON')
        print('recentes', cod, 'tipo', type(rec).__name__, 'n', len(rec) if isinstance(rec, list) else '-', json.dumps(rec[:3] if isinstance(rec, list) else rec, ensure_ascii=False)[:1200])
    dr = get(tk, '/pcds/dados_rede', uf='MG', municipio=next((c.get('codibge') for c in alvo if 'CONGONHAS' in _norm(json.dumps(c))), None), rede=REDE, inicio=ini, fim=fim)
    print('\ndados_rede Congonhas (UTC %s a %s):' % (ini, fim), (json.dumps(dr, ensure_ascii=False) if not isinstance(dr, str) else dr)[:2000])


if __name__ == '__main__':
    if '--diagnostico' in sys.argv:
        try: diagnostico()
        except Exception as e: print('ERRO', type(e).__name__, str(e)[:300]); sys.exit(1)
