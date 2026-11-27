# Funções puras de tratamento de dados usadas pelo coletor (testadas em testes/test_dados.py).
# Convenção única de intervalos: a chave horária h representa o intervalo [h, h + 1 h), horário local de Brasília.
import datetime as dt
import math

TOL_FUTURO = dt.timedelta(minutes=5)   # leitura com horário até 5 min à frente do relógio é aceita (diferença de relógio)
H = dt.timedelta(hours=1)


def hr(ts): return ts.replace(minute=0, second=0, microsecond=0)


def hora_ana(ts):
    """Telemetria da ANA: a chuva de cada registro é a acumulada no intervalo que TERMINA no horário do registro.
    O registro das 10:00 pertence à hora [09:00, 10:00); o das 10:15, à hora [10:00, 11:00)."""
    return hr(ts - dt.timedelta(seconds=1))


def hora_openmeteo(ts):
    """Open-Meteo: 'precipitation' no horário t é a soma da hora anterior, isto é, do intervalo [t - 1 h, t)."""
    return ts - H


def hora_metno(ts):
    """met.no: 'next_1_hours' no horário t é o intervalo [t, t + 1 h)."""
    return ts


def futuro(ts, agora): return ts > agora + TOL_FUTURO


def num(v):
    """Converte texto em número finito; vazio, NaN e infinito viram None (ausência, nunca zero)."""
    if v is None: return None
    try: x = float(str(v).strip())
    except ValueError: return None
    return x if math.isfinite(x) else None


def cadencia_min(tempos):
    """Intervalo típico (mediana, em minutos) entre registros consecutivos."""
    t = sorted(set(tempos))
    d = sorted((b - a).total_seconds() / 60 for a, b in zip(t, t[1:]) if b > a)
    return d[len(d) // 2] if d else None


def chuva_horaria(registros, horas):
    """Soma a chuva de registros (ts, mm) em horas [h, h+1). Hora só é aceita como medida se recebeu ao menos 75% dos
    registros esperados pela cadência da estação. Retorna {h: mm ou None} e {h: n de registros}."""
    cad = cadencia_min([t for t, v in registros if v is not None]) or 60
    esperado = max(1, round(60 / cad)) if cad <= 60 else 1
    acc, n = {}, {}
    for ts, v in registros:
        if v is None or not (0 <= v < 200): continue
        k = hora_ana(ts); acc[k] = acc.get(k, 0.0) + v; n[k] = n.get(k, 0) + 1
    minimo = max(1, math.ceil(0.75 * esperado))
    return {h: (acc[h] if n.get(h, 0) >= minimo else None) for h in horas}, n, esperado


def chuva_horaria_variavel(registros, horas):
    """Estações de cadência variável (CEMADEN: a cada 10 min com chuva, a cada hora sem chuva). Cada registro traz a chuva
    acumulada desde o anterior, no fim do intervalo; a hora é aceita como medida com ao menos um registro."""
    acc, n = {}, {}
    for ts, v in registros:
        if v is None or not (0 <= v < 200): continue
        k = hora_ana(ts); acc[k] = acc.get(k, 0.0) + v; n[k] = n.get(k, 0) + 1
    return {h: acc.get(h) for h in horas}, n


def janela(serie, a, b):
    """Soma sem preencher lacunas no intervalo [a, b). Retorna (valor ou None, cobertura 0 a 1)."""
    n = int((b - a).total_seconds() // 3600)
    v = [serie.get(a + dt.timedelta(hours=i)) for i in range(n)]
    ok = [x for x in v if x is not None]
    return (sum(ok) if ok else None), (len(ok) / n if n else 0)


def cobertura(fonte, peso, a, b):
    """Coberturas separadas na janela [a, b): temporal (medida ou estimada), medida, estimada e espacial
    (fração média dos pluviômetros da zona que mediram, contando zero nas horas sem medição)."""
    n = int((b - a).total_seconds() // 3600)
    hs = [a + dt.timedelta(hours=i) for i in range(n)]
    m = sum(1 for h in hs if fonte.get(h) == 'M'); e = sum(1 for h in hs if fonte.get(h) == 'E')
    esp = sum(peso.get(h, 0) for h in hs) / n if n else 0
    r = lambda x: round(x, 2)
    return {'temporal': r((m + e) / n) if n else 0, 'medida': r(m / n) if n else 0, 'estimada': r(e / n) if n else 0, 'espacial': r(esp)}


def frescor(idade_h, cadencia_min_=15):
    """Classificação da idade de uma leitura, ajustada à cadência real da estação (audit., seção 1):
    atualizado até cadência + 30 min; atrasado até cadência + 60 min; desatualizado até 3 h; acima disso indisponível."""
    if idade_h is None: return 'sem dado'
    if idade_h < -TOL_FUTURO.total_seconds() / 3600: return 'futuro'
    c = (cadencia_min_ or 15) / 60
    if idade_h <= c + 0.5: return 'atualizado'
    if idade_h <= c + 1: return 'atrasado'
    if idade_h <= 3: return 'desatualizado'
    return 'indisponivel'
