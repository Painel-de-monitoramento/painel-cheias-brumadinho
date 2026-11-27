# Testes do cliente do CEMADEN com resposta real gravada no diagnóstico de 27/11/2026 (sem acesso à rede).
import datetime as dt, os, sys, unittest
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(AQUI))
import cemaden, dados

CSV = """OBS.: Rede com horario UTC!
cod.estacao;nome;municipio;uf;latitude;longitude;datahora;sensor;valor;qualificacao;offset
311800702A;Dom Oscar;CONGONHAS;MG;-20.504;-43.87;2026-11-27 00:20:00;intensidade_precipitacao;0.0;0000;
311800702A;Dom Oscar;CONGONHAS;MG;-20.504;-43.87;2026-11-27 00:20:00;chuva;0.0;0000;
311800702A;Dom Oscar;CONGONHAS;MG;-20.504;-43.87;2026-11-27 01:20:00;chuva;1.2;0000;
311800702A;Dom Oscar;CONGONHAS;MG;-20.504;-43.87;2026-11-27 01:30:00;chuva;0.8;0000;
311800704A;Joaquim Murtinho;CONGONHAS;MG;-20.557;-43.816;2026-11-27 00:20:00;chuva;0.0;0000;
315910002A;G2-315910002A;SANTANA DOS MONTES;MG;-20.788524;-43.688171;2026-11-27 01:10:00;chuva;0.2;0004;
311800702A;Dom Oscar;CONGONHAS;MG;-20.504;-43.87;data ruim;chuva;0.0;0000;
311800702A;Dom Oscar;CONGONHAS;MG;-20.504;-43.87;2026-11-27 02:20:00;chuva;NaN;0000;
"""


class Cemaden(unittest.TestCase):
    def test_parse_utc_para_local_e_somente_chuva(self):
        r = cemaden.parse_csv(CSV)
        self.assertEqual(len(r), 5)                                   # intensidade, data ruim e NaN descartados
        self.assertEqual(r[0]['t'], dt.datetime(2026, 11, 26, 21, 20))  # 00:20 UTC = 21:20 em Brasília
        self.assertTrue(all(x['valor'] >= 0 for x in r))

    def test_somente_estacoes_dentro_da_z1(self):
        dentro = {x['cod'] for x in cemaden.parse_csv(CSV) if cemaden.dentro(*cemaden.projeta(x['lon'], x['lat']), cemaden.POLIGONO['Z1'])}
        self.assertEqual(dentro, {'311800702A', '311800704A'})         # Santana dos Montes fica fora da Z1

    def test_hora_de_cadencia_variavel(self):
        regs = [(x['t'], x['valor']) for x in cemaden.parse_csv(CSV) if x['cod'] == '311800702A']
        h0 = dt.datetime(2026, 11, 26, 21); horas = [h0 + dt.timedelta(hours=i) for i in range(3)]
        s, n = dados.chuva_horaria_variavel(regs, horas)
        self.assertEqual(s[h0], 0.0); self.assertEqual(s[horas[1]], 2.0); self.assertIsNone(s[horas[2]])

    def test_atualizar_sem_credenciais_nao_consulta(self):
        os.environ.pop('CEMADEN_USUARIO', None); os.environ.pop('CEMADEN_SENHA', None)
        cache, sit = cemaden.atualizar({}, dt.datetime(2026, 11, 27, 0, 0))
        self.assertFalse(sit['configurado']); self.assertEqual(sit['consultas'], 0)

    def test_atualizar_com_resposta_gravada_e_falha(self):
        os.environ['CEMADEN_USUARIO'] = 'x'; os.environ['CEMADEN_SENHA'] = 'y'
        tk, gt, esp = cemaden.token, cemaden.get, cemaden._espera
        try:
            cemaden._espera = lambda: None; cemaden.token = lambda: 'tk'; cemaden.get = lambda *a, **k: CSV
            cache, sit = cemaden.atualizar({}, dt.datetime(2026, 11, 27, 0, 0))
            self.assertTrue(sit['ok']); self.assertEqual(set(cache['estacoes']), {'311800702A', '311800704A'})
            self.assertEqual(cache['registros']['311800702A']['2026-11-26T22:20'], 1.2)
            self.assertTrue(cache['retro_ate'] < '2026-11-24')         # histórico antigo avança um lote por execução
            def falha(*a, **k): raise OSError('sem resposta')
            cemaden.get = falha
            cache2, sit2 = cemaden.atualizar(cache, dt.datetime(2026, 11, 27, 0, 15))
            self.assertFalse(sit2['ok']); self.assertIn('sem resposta', sit2['erro'])
            self.assertIn('311800702A', cache2['registros'])            # falha não apaga o histórico
        finally:
            cemaden.token, cemaden.get, cemaden._espera = tk, gt, esp
            os.environ.pop('CEMADEN_USUARIO', None); os.environ.pop('CEMADEN_SENHA', None)


if __name__ == '__main__': unittest.main()
