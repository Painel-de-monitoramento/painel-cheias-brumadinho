# Validação estrita do data.json antes da publicação. Uso: python validar.py data.json [--agora AAAA-MM-DDTHH:MM]
# Erros (impedem a publicação): JSON não estrito (NaN, Infinity), tipo incorreto (inclusive booleano no lugar de número),
# data inválida ou no futuro, limites não crescentes, cobertura fora de 0 a 1, séries fora de ordem, incoerência de status.
# Sinalizações (não impedem): valores extremos plausíveis, que podem ser uma cheia real e devem ser investigados, não descartados.
import json, math, sys, datetime as dt

TZ = dt.timezone(dt.timedelta(hours=-3))
TOL_FUTURO = dt.timedelta(minutes=5)
# Critérios do RT-BRU-HID-001 Rev04. Uma revisão do estudo exige alterar, no mesmo pull request, este arquivo,
# coletor.py (LIM e AJUSTE_UMIDO) e comum.js (CRITERIOS); qualquer divergência impede a publicação.
CRITERIOS = {'limites': {'Z1': [140, 185, 235, 260], 'Z2': [155, 210, 260, 290], 'Z3': [170, 230, 285, 320],
                         'BV': [300, 600, 950, 1150], 'AF': [5.0, 7.0, 9.0, 10.5]}, 'ajuste_umido': 30}


def _const(c): raise ValueError(f'constante não permitida no JSON: {c}')


def carregar(caminho):
    with open(caminho, encoding='utf-8') as f:
        return json.load(f, parse_constant=_const)


def validar(d, agora=None):
    agora = agora or dt.datetime.now(TZ).replace(tzinfo=None)
    erros, flags = [], []

    def numero(v): return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

    def req(obj, chave, tipo, cam, nulo=False):
        if not isinstance(obj, dict) or chave not in obj: erros.append(f'{cam}.{chave} ausente'); return None
        v = obj[chave]
        if v is None and nulo: return None
        ok = numero(v) if tipo == 'num' else (isinstance(v, int) and not isinstance(v, bool)) if tipo == 'int' else isinstance(v, tipo)
        if not ok: erros.append(f'{cam}.{chave} com tipo {type(v).__name__}')
        return v if ok else None

    def data(v, cam, nulo=True, futuro_ok=False):
        if v is None:
            if not nulo: erros.append(f'{cam} ausente')
            return None
        if not isinstance(v, str): erros.append(f'{cam} não é texto'); return None
        try: t = dt.datetime.fromisoformat(v.replace(' ', 'T')[:19])
        except ValueError: erros.append(f'{cam} com data inválida: {v}'); return None
        if not futuro_ok and t > agora + TOL_FUTURO: erros.append(f'{cam} no futuro: {v}')
        return t

    for k, t in [('versao', 'int'), ('coleta', str), ('geracao_snapshot', str), ('id_snapshot', str), ('limites', dict), ('solo', dict),
                 ('nivel', dict), ('zonas', dict), ('af', dict), ('bv', dict), ('estacoes', list), ('previsao', list), ('alertas', list),
                 ('qualidade', dict), ('niveis_nomes', list)]:
        req(d, k, t, 'raiz')
    if erros: return erros, flags
    coleta = data(d['coleta'], 'coleta', nulo=False); data(d['geracao_snapshot'], 'geracao_snapshot', nulo=False)

    # limites: quatro valores numéricos estritamente crescentes
    for k in ('Z1', 'Z2', 'Z3', 'BV', 'AF'):
        L = d['limites'].get(k)
        if not (isinstance(L, list) and len(L) == 4 and all(numero(x) for x in L)): erros.append(f'limites.{k} inválido'); continue
        if any(b <= a for a, b in zip(L, L[1:])): erros.append(f'limites.{k} não crescente')

    for k, v in CRITERIOS['limites'].items():
        if [float(x) for x in (d['limites'].get(k) or []) if numero(x)] != [float(x) for x in v]: erros.append(f'limites.{k} diferente do estudo')
    if d.get('ajuste_umido') != CRITERIOS['ajuste_umido']: erros.append('ajuste_umido diferente do estudo')

    nv = d['nivel']
    st = req(nv, 'status', str, 'nivel'); at = req(nv, 'atual', 'int', 'nivel', nulo=True)
    if st not in ('valido', 'degradado', 'indeterminado'): erros.append('nivel.status inválido')
    if at is not None and not 0 <= at <= 4: erros.append('nivel.atual fora de 0 a 4')
    br = req(nv, 'bruto', 'int', 'nivel', nulo=True)
    if st == 'valido' and (at is None or br is None): erros.append('nivel válido sem nível calculado')
    if st != 'indeterminado' and br is None: erros.append('status calculável sem nível bruto')
    for i, ind in enumerate(nv.get('indicadores') or []):
        if ind.get('estado') == 'ok' and ind.get('nivel') is None: erros.append(f'indicador {i} ok sem nível')
        if ind.get('estado') == 'indisponivel' and ind.get('nivel') is not None and i < 2: erros.append(f'indicador {i} indisponível com nível')

    for z in ('Z1', 'Z2', 'Z3'):
        Z = d['zonas'].get(z)
        if not isinstance(Z, dict): erros.append(f'zona {z} ausente'); continue
        for k in ('P24', 'P72', 'P5', 'P30', 'prev72'):
            v = req(Z, k, 'num', z, nulo=True)
            if v is not None and v < 0: erros.append(f'{z}.{k} negativo')
        for k in ('cob24', 'cob72', 'cob5', 'cob30', 'cob5_medida', 'cob5_estimada', 'cob5_espacial'):
            v = req(Z, k, 'num', z)
            if v is not None and not 0 <= v <= 1: erros.append(f'{z}.{k} fora de 0 a 1')
        if all(numero(Z.get(k)) for k in ('cob5', 'cob5_medida', 'cob5_estimada')) and abs(Z['cob5_medida'] + Z['cob5_estimada'] - Z['cob5']) > 0.02:
            erros.append(f'{z}: cobertura medida + estimada diferente da temporal')
        if numero(Z.get('P24')) and numero(Z.get('P72')) and Z['P24'] > Z['P72'] + 0.05: erros.append(f'{z}: P24 maior que P72')
        if numero(Z.get('P5')) and numero(Z.get('P30')) and Z['P5'] > Z['P30'] + 0.05: erros.append(f'{z}: P5 maior que P30')
        if numero(Z.get('P5')) and Z['P5'] > 400: flags.append(f'{z}: chuva de 5 dias de {Z["P5"]} mm, acima da maior registrada nos eventos; verificar')
        dd = [x.get('d') for x in Z.get('diario') or []]
        if dd != sorted(dd): erros.append(f'{z}.diario fora de ordem')
        for x in Z.get('diario') or []:
            if x.get('obs') is not None and (not numero(x['obs']) or x['obs'] < 0): erros.append(f'{z}.diario {x.get("d")} inválido')

    for k, var, lo, hi, ext in (('af', 'h', 0, 25, 11.75), ('af', 'q', 0, 6000, 1717), ('bv', 'q', 0, 6000, 1400)):
        v = req(d[k], var, 'num', k, nulo=True)
        if v is not None and not lo <= v <= hi: erros.append(f'{k}.{var} fisicamente impossível: {v}')
        elif v is not None and v > ext: flags.append(f'{k}.{var} = {v}, acima do maior valor histórico de referência ({ext}); confirmar com a régua')
    for k, var in (('af', 'h_t'), ('af', 'q_t'), ('bv', 'q_t')):
        t = data(d[k].get(var), f'{k}.{var}')
        if t and coleta and t > coleta + TOL_FUTURO: erros.append(f'{k}.{var} posterior à coleta')
    for k, ser in (('af', 'serie'), ('af', 'serie_q'), ('bv', 'serie')):
        s = d[k].get(ser) or []
        ts = [p[0] for p in s]
        if ts != sorted(ts) or len(set(ts)) != len(ts): erros.append(f'{k}.{ser} fora de ordem ou com horário repetido')
        if any(not numero(p[1]) for p in s): erros.append(f'{k}.{ser} com valor não numérico')
        for a, b in zip(s, s[1:]):
            if ser == 'serie' and k == 'af' and abs(b[1] - a[1]) > 1.5:
                flags.append(f'af.serie: salto de {b[1] - a[1]:+.2f} m entre {a[0]} e {b[0]}; verificar'); break

    for e in d['estacoes']:
        if not isinstance(e, dict) or not isinstance(e.get('cod'), str): erros.append('estação sem código'); continue
        for v, x in (e.get('variaveis') or {}).items():
            if x is None: continue
            data(x.get('t'), f'estação {e["cod"]} {v}')
            if not numero(x.get('valor')): erros.append(f'estação {e["cod"]} {v} sem valor numérico')
    for p in d['previsao']:
        if not isinstance(p.get('nivel'), int) or isinstance(p.get('nivel'), bool) or not 0 <= p['nivel'] <= 4: erros.append(f'previsão {p.get("d")} com nível inválido')
    return erros, flags


if __name__ == '__main__':
    caminho = sys.argv[1]
    agora = None
    if '--agora' in sys.argv: agora = dt.datetime.fromisoformat(sys.argv[sys.argv.index('--agora') + 1])
    try:
        d = carregar(caminho)
    except Exception as e:
        print(f'data.json inválido: {e}'); sys.exit(1)
    erros, flags = validar(d, agora)
    for f in flags: print('SINALIZAÇÃO:', f)
    if erros:
        print('data.json inválido:\n' + '\n'.join(erros)); sys.exit(1)
    print('data.json válido', d['coleta'], d['nivel']['status'], d['id_snapshot'])
