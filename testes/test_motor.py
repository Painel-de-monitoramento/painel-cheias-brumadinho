# Testes de aceitação do motor de decisão e paridade Python x JavaScript
# Uso: python -m unittest discover -s testes -v
import json, os, subprocess, sys, unittest, shutil
AQUI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(AQUI))
import motor
CASOS = json.load(open(os.path.join(AQUI, 'casos.json')))


class Aceitacao(unittest.TestCase):
    def test_casos(self):
        for c in CASOS:
            with self.subTest(c['nome']):
                r = motor.decidir(c['entrada']); e = c['esperado']
                if 'nivel' in e: self.assertEqual(r['nivel'], e['nivel'])
                if 'status' in e: self.assertEqual(r['status'], e['status'])
                if 'bruto' in e: self.assertEqual(r['nivel_bruto'], e['bruto'])
                if 'solo' in e: self.assertEqual(r['solo']['estado'], e['solo'])

    def test_transicoes_registradas(self):
        c = next(c for c in CASOS if c['nome'].startswith('Alerta ativo, régua descendo 12'))
        r = motor.decidir(c['entrada']); h = r['estado']['historico']
        self.assertEqual((h[-1]['de'], h[-1]['para']), (2, 0)); self.assertIn('12 h', h[-1]['causa'])


@unittest.skipUnless(shutil.which('node'), 'node ausente')
class Paridade(unittest.TestCase):
    def test_mesmo_resultado(self):
        js = json.loads(subprocess.check_output(['node', os.path.join(AQUI, 'rodar_js.js')]))
        for c, rj in zip(CASOS, js):
            with self.subTest(c['nome']):
                rp = json.loads(json.dumps(motor.decidir(c['entrada']), ensure_ascii=False))
                self.assertEqual(rp, rj)


if __name__ == '__main__': unittest.main()
