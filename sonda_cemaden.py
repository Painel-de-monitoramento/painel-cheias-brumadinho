# Sonda temporária: testa janelas e códigos na PED do CEMADEN. Imprime só status e tamanhos, nunca credenciais.
import json, urllib.request, urllib.error, datetime as dt
import cemaden as C
tk = C.token(); print('token ok')
try:
    cid = C.get(tk, '/pcds-cadastro/cidades', uf='MG', formato='JSON')
    alvo = [c for c in cid if any(n in C._norm(json.dumps(c, ensure_ascii=False)) for n in ('CONGONHAS', 'LAFAIETE'))]
    print('cidades:', alvo)
except Exception as e:
    print('cidades erro', e)
agora = dt.datetime.utcnow()
for ibge in ('3118007', '3118304'):
    for h in (3, 24, 48, 72):
        ini = (agora - dt.timedelta(hours=h)).strftime('%Y%m%d%H%M'); fim = agora.strftime('%Y%m%d%H%M')
        try:
            tx = C.get(tk, '/pcds/dados_rede', uf='MG', municipio=ibge, rede=C.REDE, inicio=ini, fim=fim)
            n = len(C.parse_csv(tx)) if isinstance(tx, str) else -1
            print(ibge, f'{h}h', 'ok', 'registros de chuva', n)
        except urllib.error.HTTPError as e:
            print(ibge, f'{h}h', 'HTTP', e.code, e.read().decode('utf-8', 'ignore')[:200])
