# Testes do tratamento de dados (dados.py), do validador (validar.py), da independência de fuso do motor
# e da camada ao vivo do navegador (aovivo.js, executada no Node). Uso: python -m unittest discover -s testes -v
import datetime as dt, json, os, subprocess, sys, shutil, unittest, copy
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(AQUI); sys.path.insert(0, RAIZ)
import dados, validar, motor
T = dt.datetime.fromisoformat


class Intervalos(unittest.TestCase):
    def test_ana_fim_do_intervalo(self):
        self.assertEqual(dados.hora_ana(T('2026-11-26T10:00')), T('2026-11-26T09:00'))
        self.assertEqual(dados.hora_ana(T('2026-11-26T10:15')), T('2026-11-26T10:00'))
        self.assertEqual(dados.hora_ana(T('2026-11-27T00:00')), T('2026-11-26T23:00'))

    def test_openmeteo_hora_anterior_cruzando_meia_noite(self):
        # valores do Open-Meteo às 23:00, 00:00 e 01:00 representam 22-23 h, 23-24 h e 00-01 h
        bruto = {T('2026-11-26T23:00'): 1.0, T('2026-11-27T00:00'): 2.0, T('2026-11-27T01:00'): 4.0}
        s = {dados.hora_openmeteo(t): v for t, v in bruto.items()}
        self.assertEqual(sorted(s), [T('2026-11-26T22:00'), T('2026-11-26T23:00'), T('2026-11-27T00:00')])
        dia26, _ = dados.janela(s, T('2026-11-26T00:00'), T('2026-11-27T00:00'))
        dia27, _ = dados.janela(s, T('2026-11-27T00:00'), T('2026-11-28T00:00'))
        self.assertEqual((dia26, dia27), (3.0, 4.0))          # volume preservado e dia correto
        self.assertEqual(sum(bruto.values()), dia26 + dia27)

    def test_metno_inicio(self):
        self.assertEqual(dados.hora_metno(T('2026-11-26T10:00')), T('2026-11-26T10:00'))

    def test_hora_incompleta_fora_do_acumulado(self):
        # às 15:20 o acumulado observado termina às 15:00; chuva com chave 15:00 (hora em curso) não entra
        agora = T('2026-11-26T15:20'); fim = dados.hr(agora)
        s = {T('2026-11-26T13:00'): 1.0, T('2026-11-26T14:00'): 2.0, T('2026-11-26T15:00'): 50.0}
        v, cob = dados.janela(s, fim - dt.timedelta(hours=3), fim)
        self.assertEqual(v, 3.0); self.assertAlmostEqual(cob, 2 / 3)

    def test_chuva_horaria_exige_registros_da_hora(self):
        h0 = T('2026-11-26T10:00'); horas = [h0, h0 + dt.timedelta(hours=1)]
        reg = [(h0 + dt.timedelta(minutes=15 * k), 0.5) for k in range(1, 5)]          # 10:15..11:00: hora 10 completa
        reg += [(h0 + dt.timedelta(minutes=75), 1.0)]                                 # 11:15: só 1 de 4 na hora 11
        s, n, esp = dados.chuva_horaria(reg, horas)
        self.assertEqual(esp, 4); self.assertEqual(s[h0], 2.0); self.assertIsNone(s[horas[1]])

    def test_ausencia_nao_vira_zero(self):
        s = {T('2026-11-26T10:00'): None, T('2026-11-26T11:00'): 0.0}
        self.assertEqual(dados.janela(s, T('2026-11-26T10:00'), T('2026-11-26T12:00')), (0.0, 0.5))
        self.assertEqual(dados.janela({}, T('2026-11-26T10:00'), T('2026-11-26T12:00')), (None, 0))

    def test_num_rejeita_nao_finitos(self):
        for x in ('NaN', 'inf', '-Infinity', '', '  ', None, 'abc'): self.assertIsNone(dados.num(x), x)
        self.assertEqual(dados.num(' 12.5 '), 12.5); self.assertEqual(dados.num('0'), 0.0)


class Cobertura(unittest.TestCase):
    def test_120h_estimadas(self):
        a = T('2026-11-21T00:00'); hs = [a + dt.timedelta(hours=i) for i in range(120)]
        c = dados.cobertura({h: 'E' for h in hs}, {}, a, a + dt.timedelta(hours=120))
        self.assertEqual(c, {'temporal': 1.0, 'medida': 0.0, 'estimada': 1.0, 'espacial': 0.0})

    def test_mista_e_espacial(self):
        a = T('2026-11-21T00:00'); hs = [a + dt.timedelta(hours=i) for i in range(10)]
        fonte = {h: ('M' if i < 6 else 'E') for i, h in enumerate(hs)}; peso = {h: 0.5 for h in hs[:6]}
        c = dados.cobertura(fonte, peso, a, a + dt.timedelta(hours=10))
        self.assertEqual((c['temporal'], c['medida'], c['estimada'], c['espacial']), (1.0, 0.6, 0.4, 0.3))


class Frescor(unittest.TestCase):
    def test_classes(self):
        self.assertEqual(dados.frescor(-20 / 60), 'futuro')
        self.assertEqual(dados.frescor(-4 / 60), 'atualizado')
        self.assertEqual(dados.frescor(0.6), 'atualizado')       # cadência 15 min + atraso normal da ANA: até 2 h
        self.assertEqual(dados.frescor(1.9), 'atualizado')
        self.assertEqual(dados.frescor(2.5), 'atrasado')
        self.assertEqual(dados.frescor(3.2), 'indisponivel')
        self.assertEqual(dados.frescor(1.4, 60), 'atualizado')   # estação horária
        self.assertEqual(dados.frescor(None), 'sem dado')


class FusoDoMotor(unittest.TestCase):
    def test_mesmo_resultado_em_qualquer_fuso(self):
        cod = ('import json,sys;sys.path.insert(0,%r);import motor;C=json.load(open(%r));'
               'print(json.dumps([motor.decidir(c["entrada"]) for c in C],sort_keys=True))') % (RAIZ, os.path.join(AQUI, 'casos.json'))
        saidas = {tz: subprocess.check_output([sys.executable, '-c', cod], env={**os.environ, 'TZ': tz}) for tz in ('UTC', 'America/Sao_Paulo', 'Asia/Tokyo')}
        self.assertEqual(len(set(saidas.values())), 1)

    def test_leitura_futura_20_min(self):
        s = motor.situacao(5.0, '2026-11-26T18:20', '2026-11-26T18:00')
        self.assertFalse(s['ok']); self.assertIn('futuro', s['motivo'])


class Validador(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = json.load(open(os.path.join(AQUI, 'fixture_data.json')))
        cls.agora = dt.datetime.fromisoformat(cls.base['coleta']) + dt.timedelta(minutes=2)

    def erros(self, d): return validar.validar(d, self.agora)

    def test_fixture_valido(self):
        e, f = self.erros(copy.deepcopy(self.base)); self.assertEqual(e, [])

    def test_nan_e_infinito_impedem(self):
        for c in ('NaN', 'Infinity', '-Infinity'):
            tx = json.dumps(self.base).replace('"ajuste_umido": 30', f'"ajuste_umido": {c}', 1)
            with self.assertRaises(ValueError): json.loads(tx, parse_constant=validar._const)

    def test_tipo_incorreto_e_booleano(self):
        d = copy.deepcopy(self.base); d['af']['h'] = True; self.assertTrue(any('af.h' in x for x in self.erros(d)[0]))
        d = copy.deepcopy(self.base); d['bv']['q'] = '56'; self.assertTrue(any('bv.q' in x for x in self.erros(d)[0]))

    def test_data_invalida_e_futura(self):
        d = copy.deepcopy(self.base); d['coleta'] = '2026-13-40T99:00'; self.assertTrue(self.erros(d)[0])
        d = copy.deepcopy(self.base); d['af']['h_t'] = (self.agora + dt.timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M'); self.assertTrue(self.erros(d)[0])

    def test_limites_e_cobertura(self):
        d = copy.deepcopy(self.base); d['limites']['AF'] = [5, 9, 7, 10.5]; self.assertTrue(any('crescente' in x for x in self.erros(d)[0]))
        d = copy.deepcopy(self.base); d['zonas']['Z1']['cob5'] = 1.4; self.assertTrue(self.erros(d)[0])

    def test_status_incoerente(self):
        d = copy.deepcopy(self.base); d['nivel']['status'] = 'valido'; d['nivel']['bruto'] = None; self.assertTrue(self.erros(d)[0])

    def test_extremo_plausivel_gera_sinalizacao_nao_erro(self):
        d = copy.deepcopy(self.base); d['af']['h'] = 12.4
        e, f = self.erros(d); self.assertEqual(e, []); self.assertTrue(any('af.h' in x for x in f))
        d['af']['h'] = -1; self.assertTrue(self.erros(d)[0])


@unittest.skipUnless(shutil.which('node'), 'node ausente')
class NavegadorAoVivo(unittest.TestCase):
    def test_aovivo(self):
        r = subprocess.run(['node', os.path.join(AQUI, 'test_aovivo.js')], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_probabilidade(self):
        r = subprocess.run(['node', os.path.join(AQUI, 'test_probabilidade.js')], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == '__main__': unittest.main()
