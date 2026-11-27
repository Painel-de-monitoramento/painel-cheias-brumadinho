# Testes automáticos de segurança, executados a cada coleta e a cada alteração (workflow atualizar.yml).
# Não substituem um teste de invasão; verificam as proteções que dependem do código do repositório.
import base64, hashlib, json, os, re, subprocess, sys, unittest
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.dirname(AQUI); sys.path.insert(0, RAIZ)
HTML = ['index.html', 'probabilidade.html', 'simulador.html', 'estacoes.html']
def ler(f):
    with open(os.path.join(RAIZ, f), encoding='utf-8') as fh: return fh.read()


def rastreados():
    try: return subprocess.check_output(['git', 'ls-files'], cwd=RAIZ, text=True).split()
    except Exception: return [f for f in os.listdir(RAIZ) if os.path.isfile(os.path.join(RAIZ, f))]


class Paginas(unittest.TestCase):
    def test_csp_restritiva(self):
        for f in HTML:
            with self.subTest(f):
                m = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', ler(f)); self.assertTrue(m, 'CSP ausente')
                csp = m.group(1)
                self.assertIn("script-src 'self'", csp)
                for proibido in ("'unsafe-eval'", "script-src 'self' 'unsafe-inline'", 'script-src *', 'http:'):
                    self.assertNotIn(proibido, csp)
                for d in ("object-src 'none'", "base-uri 'self'", "form-action 'none'", 'upgrade-insecure-requests'): self.assertIn(d, csp)

    def test_sem_script_embutido_nem_eventos_inline(self):
        for f in HTML:
            with self.subTest(f):
                s = ler(f)
                self.assertFalse(re.search(r'<script(?![^>]*\bsrc=)[^>]*>', s), 'script embutido no HTML')
                self.assertFalse(re.search(r'\son[a-z]+\s*=', s, re.I), 'atributo de evento inline (onclick etc.)')
                self.assertFalse(re.search(r'javascript:', s, re.I))

    def test_sri_confere_com_o_arquivo(self):
        for f in HTML:
            for src, integ in re.findall(r'<script src="(vendor/[^"]+)" integrity="([^"]+)"', ler(f)):
                with self.subTest(f=f, src=src):
                    alg, b64 = integ.split('-', 1)
                    with open(os.path.join(RAIZ, src), 'rb') as fh: dig = getattr(hashlib, alg)(fh.read()).digest()
                    self.assertEqual(base64.b64encode(dig).decode(), b64, 'hash SRI não confere com o arquivo em vendor/')
            # todo script externo (fora do próprio site) precisa de SRI
            for tag in re.findall(r'<script[^>]+src="https?://[^"]+"[^>]*>', ler(f)):
                self.assertIn('integrity=', tag)

    def test_sem_eval_nem_html_de_fonte_externa_sem_escape(self):
        for f in [x for x in rastreados() if x.endswith('.js') and not x.startswith(('vendor/', 'testes/'))]:
            with self.subTest(f):
                s = ler(f)
                self.assertNotRegex(s, r'\beval\s*\(|new Function\s*\(|document\.write\s*\(')
                self.assertNotIn('insertAdjacentHTML', s)

    def test_protecao_contra_incorporacao(self):
        self.assertIn('window.top !== window.self', ler('comum.js'))
        for f in HTML:
            s = ler(f); self.assertLess(s.index('comum.js'), s.index('aovivo.js'), f)


class Repositorio(unittest.TestCase):
    PADROES = [r'ghp_[A-Za-z0-9]{36}', r'github_pat_[A-Za-z0-9_]{40,}', r'gh[ousr]_[A-Za-z0-9]{36}', r'AKIA[0-9A-Z]{16}',
               r'-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----', r'xox[baprs]-[A-Za-z0-9-]{10,}', r'AIza[0-9A-Za-z_\-]{35}',
               r'(?i)(senha|password|passwd|token|secret)\s*[=:]\s*["\'][^"\'\s$]{6,}["\']']

    def test_sem_credenciais_no_repositorio(self):
        for f in rastreados():
            if f.startswith('vendor/') or f.endswith(('.png', '.jpg', '.bundle', '.zip')) or f == 'testes/test_seguranca.py': continue
            try: s = ler(f)
            except Exception: continue
            for p in self.PADROES:
                with self.subTest(f=f, padrao=p): self.assertIsNone(re.search(p, s), f'possível credencial em {f}')

    def test_arquivos_sensiveis_ignorados(self):
        g = ler('.gitignore')
        for p in ('.env', '*.pem', '*.key'): self.assertIn(p, g)

    def test_workflows_fixados_e_com_permissoes_minimas(self):
        wd = os.path.join(RAIZ, '.github', 'workflows')
        for f in os.listdir(wd):
            with self.subTest(f):
                s = ler(os.path.join('.github', 'workflows', f))
                for uso in re.findall(r'uses:\s*([^\s#]+)', s):
                    self.assertRegex(uso, r'@[0-9a-f]{40}$', f'ação não fixada por SHA: {uso}')
                self.assertRegex(s, r'(?m)^permissions:', 'permissões padrão do workflow não declaradas')
                self.assertNotIn('pull_request_target', s, 'gatilho perigoso para repositório público')
                self.assertNotRegex(s, r'\$\{\{\s*github\.event\.(issue|comment|pull_request|head_commit)\.', 'texto de terceiros interpolado em comando')
                self.assertNotIn('permissions: write-all', s)

    def test_criterios_iguais_em_todas_as_camadas(self):
        import validar
        col = ler('coletor.py'); js = ler('comum.js')
        for k, v in validar.CRITERIOS['limites'].items():
            m = re.search(rf"'{k}':\s*\[([^\]]+)\]", col); self.assertTrue(m, k)
            self.assertEqual([float(x) for x in m.group(1).split(',')], [float(x) for x in v], f'coletor.py {k}')
            m = re.search(rf'{k}:\s*\[([^\]]+)\]', js[js.index('CRITERIOS'):]); self.assertTrue(m, k)
            self.assertEqual([float(x) for x in m.group(1).split(',')], [float(x) for x in v], f'comum.js {k}')
        self.assertIn(f"AJUSTE_UMIDO = {validar.CRITERIOS['ajuste_umido']}", col)

    def test_snapshot_publicado_passa_na_validacao(self):
        import validar
        erros, _ = validar.validar(validar.carregar(os.path.join(RAIZ, 'data.json')), agora=None)
        self.assertEqual([e for e in erros if 'no futuro' not in e and 'posterior' not in e], [])


if __name__ == '__main__': unittest.main()
