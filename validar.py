# Validação do data.json antes da publicação (estrutura mínima e tipos). Uso: python validar.py data.json
import json, sys
d = json.load(open(sys.argv[1])); erros = []
def req(obj, chave, tipos, cam):
    if chave not in obj: erros.append(f'{cam}.{chave} ausente'); return None
    if not isinstance(obj[chave], tipos): erros.append(f'{cam}.{chave} com tipo {type(obj[chave]).__name__}')
    return obj[chave]
N = (int, float, type(None))
for k, t in [('versao', int), ('atualizado', str), ('coleta', str), ('publicacao', str), ('limites', dict), ('solo', dict),
             ('nivel', dict), ('zonas', dict), ('af', dict), ('bv', dict), ('estacoes', list), ('previsao', list), ('alertas', list), ('qualidade', dict)]:
    req(d, k, t, 'raiz')
nv = d.get('nivel', {})
req(nv, 'atual', (int, type(None)), 'nivel'); req(nv, 'status', str, 'nivel')
if nv.get('status') not in ('valido', 'degradado', 'indeterminado'): erros.append('nivel.status inválido')
if nv.get('atual') is not None and not 0 <= nv['atual'] <= 4: erros.append('nivel.atual fora de 0 a 4')
for z in ('Z1', 'Z2', 'Z3'):
    Z = d.get('zonas', {}).get(z)
    if Z is None: erros.append(f'zona {z} ausente'); continue
    for k in ('P24', 'P72', 'P5', 'P30', 'prev72'): req(Z, k, N, z)
    for k in ('cob24', 'cob72', 'cob5', 'cob30'):
        v = req(Z, k, (int, float), z)
        if isinstance(v, (int, float)) and not 0 <= v <= 1: erros.append(f'{z}.{k} fora de 0 a 1')
req(d.get('af', {}), 'h', N, 'af'); req(d.get('bv', {}), 'q', N, 'bv')
if erros:
    print('data.json inválido:\n' + '\n'.join(erros)); sys.exit(1)
print('data.json válido', d['atualizado'], d['nivel']['status'])
