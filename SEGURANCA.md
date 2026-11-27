# Segurança do painel de cheias (revisão de 27/11/2026)

Objetivo: impedir que terceiros assumam o controle do site, manipulem informações hidrológicas, emitam falsos alertas, roubem credenciais ou interrompam o monitoramento durante uma cheia. Nenhuma infraestrutura é invulnerável; a estratégia combina prevenção, detecção, contenção e recuperação.

Os testes automáticos de segurança (`testes/test_seguranca.py`) rodam em toda coleta (a cada 15 minutos) e em toda alteração do código. Se algum falhar, a publicação é bloqueada e o painel continua com o último snapshot válido, exibindo a idade real dos dados.

Legenda: **Implementado** (no código, com teste) · **Manual** (configuração na conta GitHub, só o dono pode fazer) · **Fora do alcance** (exige domínio próprio, mudança de hospedagem ou serviço pago).

## Relatório dos 30 requisitos

| Item | Requisito | Situação | O que foi feito ou o que falta | Teste |
|---|---|---|---|---|
| 01 | Proteger o repositório contra alterações não autorizadas | Manual | Ativar 2FA (item 02), proteger a `main` (item 03) e revisar colaboradores e chaves (roteiro abaixo). | Não automatizável |
| 02 | 2FA e passkeys | Manual | Roteiro, passo 1. | Não automatizável |
| 03 | Proteger a branch principal | Manual | Roteiro, passo 2. O robô de coleta continua gravando dados com o `GITHUB_TOKEN`. | Não automatizável |
| 04 | Proteção contra XSS | Implementado | Todo texto de fonte externa passa por `esc()` ou `textContent`; sem script embutido, sem `eval`, `new Function`, `document.write`, `insertAdjacentHTML` ou eventos inline; CSP `script-src 'self'`. | `test_sem_script_embutido_nem_eventos_inline`, `test_sem_eval_nem_html_de_fonte_externa_sem_escape` |
| 05 | Content Security Policy | Implementado | CSP nas 4 páginas: scripts só do próprio site, conexões só para ANA, Open-Meteo e API do GitHub, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `upgrade-insecure-requests`. | `test_csp_restritiva` |
| 06 | Comunicação só por HTTPS | Implementado + Manual | `upgrade-insecure-requests` na CSP e todas as fontes em HTTPS. Falta marcar **Enforce HTTPS** em Settings > Pages (roteiro, passo 4). | `test_csp_restritiva` |
| 07 | Proteção contra DDoS | Fora do alcance (parcial) | O GitHub Pages é servido por CDN com mitigação própria. O painel não tem servidor próprio a derrubar; a telemetria é lida pelo navegador direto da ANA. Proteção adicional exige domínio próprio (item 22). | Não aplicável |
| 08 | Proteger credenciais e chaves | Implementado + Manual | Credenciais (ANA, CEMADEN) só em GitHub Secrets, nunca em arquivo, JSON ou JavaScript. `.gitignore` bloqueia `.env`, `*.pem`, `*.key`, `*.p12`. | `test_sem_credenciais_no_repositorio`, `test_arquivos_sensiveis_ignorados` |
| 09 | Verificação automática de vazamento | Implementado + Manual | Varredura de padrões de token em todo arquivo do repositório a cada execução. Ativar também o **Secret scanning** e o **Push protection** do GitHub (roteiro, passo 3). | `test_sem_credenciais_no_repositorio` |
| 10 | Monitorar vulnerabilidades das dependências | Implementado + Manual | `.github/dependabot.yml` (ações do GitHub, semanal). Plotly fica em `vendor/`, sem gerenciador de pacotes: conferir a cada 3 meses em https://github.com/plotly/plotly.js/security. Ativar **Dependabot alerts** (roteiro, passo 3). | Configuração |
| 11 | SRI nos scripts externos | Implementado | Plotly hospedado no próprio site, com `integrity` (SHA-384). O teste recalcula o hash do arquivo e exige SRI em qualquer script de outro domínio. | `test_sri_confere_com_o_arquivo` |
| 12 | Permissões mínimas no GitHub Actions | Implementado | `permissions: {}` por padrão; cada job recebe só o necessário. Sem `pull_request_target`, sem texto de terceiros interpolado em comando. | `test_workflows_fixados_e_com_permissoes_minimas` |
| 13 | Proteger os JSON contra manipulação | Implementado | O workflow valida o `data.json` antes de publicar (`validar.py`); o navegador recusa snapshot com estrutura inválida, versão errada, horário no futuro ou critérios diferentes dos do estudo (`C.snapshot()`). | `test_snapshot_publicado_passa_na_validacao` |
| 14 | Autenticidade e integridade dos dados publicados | Implementado (parcial) | Cada snapshot tem `id_snapshot` (SHA-256) e `versao.json` com execução e commit; a aba principal confirma a publicação pela API de implantações do GitHub. Assinatura criptográfica verificável no navegador exigiria chave fora do repositório: não implementada. | `test_snapshot_publicado_passa_na_validacao` |
| 15 | Impedir alteração não autorizada dos critérios e níveis | Implementado | Limites e ajuste de solo úmido gravados em 3 camadas (`coletor.py`, `validar.py`, `comum.js`). Divergência bloqueia a publicação e o navegador recusa o dado. Uma revisão do estudo exige alterar as 3 no mesmo pull request. | `test_criterios_iguais_em_todas_as_camadas` |
| 16 | Monitorar alterações suspeitas no código | Manual | Com a `main` protegida, toda alteração de código passa por pull request revisado. Ativar notificações de push (roteiro, passo 5). | Não automatizável |
| 17 | Backups independentes | Manual | Roteiro, passo 6 (cópia mensal com `git clone --mirror`). | Não automatizável |
| 18 | Recuperação após incidentes | Implementado | Procedimento de resposta abaixo. O workflow mantém o último snapshot válido quando a coleta falha; `git revert` desfaz qualquer alteração. | Procedimento |
| 19 | Notificar o administrador | Manual | O GitHub envia e-mail quando uma execução falha. Ativar alertas de segurança por e-mail (roteiro, passo 5). | Configuração |
| 20 | Monitoramento externo de disponibilidade | Manual | Roteiro, passo 7 (UptimeRobot gratuito apontando para `operacao.json`). | Não automatizável |
| 21 | Testes de segurança a cada alteração | Implementado | `testes/test_seguranca.py` roda no workflow antes de toda coleta e publicação. | Toda a suíte |
| 22 | Cloudflare com domínio próprio | Fora do alcance | Exige domínio próprio (cerca de R$ 40 por ano no registro.br). Com domínio, o plano gratuito do Cloudflare adiciona cabeçalhos HTTP (`frame-ancestors`, HSTS) e proteção contra ataques. Não é necessário para operar. | Não aplicável |
| 23 | Impedir publicação de dados corrompidos | Implementado | Leituras fisicamente impossíveis (cota fora de 0 a 30 m, vazão fora de 0 a 6000 m³/s) viram ausência no coletor e no navegador; JSON com NaN, tipos errados, datas no futuro ou coberturas fora de 0 a 1 não é publicado. | `testes/test_dados.py`, validação no workflow |
| 24 | Auditoria e rastreabilidade | Implementado | Cada coleta é um commit ("Dados dd/mm hh:mm"); `estado.json` guarda o histórico das transições de nível com horário e causa; `operacao.json` guarda o resultado de cada tentativa. | Histórico do git |
| 25 | Boas práticas OWASP | Implementado (parcial) | Itens aplicáveis a site estático: injeção e XSS (04), configuração de segurança (05, 12), componentes vulneráveis (10, 11), integridade de software e dados (13 a 15, 26), falhas de registro (24). Não há login, formulário nem servidor próprio. | Suíte de segurança |
| 26 | Fixar versões por hash | Implementado | Todas as ações do GitHub fixadas por SHA de 40 caracteres; Plotly fixado na versão 2.35.2 com SRI. | `test_workflows_fixados_e_com_permissoes_minimas` |
| 27 | Proteção contra clickjacking | Implementado | O GitHub Pages não permite o cabeçalho `frame-ancestors` (e ele é ignorado em `<meta>`). A página se oculta quando aberta dentro de um frame de outro site e tenta abrir-se na janela principal. Verificado em navegador. | `test_protecao_contra_incorporacao` |
| 28 | Falha nunca vira falso "Normal" | Implementado | Normal só é afirmado com régua e Belo Vale válidos (até 3 h) e duas zonas de chuva completas **e com janela atualizada** (nova nesta revisão); caso contrário, "indeterminado" com aviso. Dado indisponível é sempre nulo, nunca zero. Snapshot recusado mostra erro, nunca nível. | `testes/casos.json` (3 casos novos), paridade Python x JavaScript |
| 29 | Resposta a incidentes | Implementado | Procedimento abaixo. | Procedimento |
| 30 | Auditorias periódicas | Manual | Trimestral: rodar a suíte, revisar acessos e chaves, conferir Plotly, testar a restauração do backup. | Calendário |

## Roteiro do que só o dono da conta pode fazer (cerca de 30 minutos)

1. **2FA e passkey**: github.com > foto > Settings > Password and authentication > Enable two-factor authentication (use um aplicativo autenticador). Em seguida, Passkeys > Add a passkey. Guarde os códigos de recuperação fora do computador.
2. **Proteção da `main`**: no repositório, Settings > Rules > Rulesets > New branch ruleset. Alvo: `main`. Marque *Restrict deletions*, *Block force pushes* e *Require a pull request before merging*. Em *Bypass list*, adicione **GitHub Actions** (para o robô continuar gravando os dados a cada 15 minutos). Salve como *Active*.
3. **Varredura do GitHub**: Settings > Code security > ative *Dependabot alerts*, *Dependabot security updates*, *Secret scanning* e *Push protection*.
4. **HTTPS obrigatório**: Settings > Pages > marque *Enforce HTTPS*.
5. **Notificações**: github.com > Settings > Notifications > marque e-mail em *Actions* (somente falhas) e em *Security alerts*. No repositório, *Watch* > *Custom* > *Security alerts*.
6. **Backup mensal**: em um computador com Git, `git clone --mirror https://github.com/yurismvieira-dot/painel-cheias-brumadinho.git` e guarde a pasta em local fora do GitHub (OneDrive ou disco externo).
7. **Monitor externo** (gratuito): em uptimerobot.com, crie um monitor *Keyword* para `https://yurismvieira-dot.github.io/painel-cheias-brumadinho/operacao.json` com intervalo de 5 minutos e alerta por e-mail quando a palavra `"resultado": "ok"` não aparecer por mais de 1 hora.
8. **Acessos**: Settings > Collaborators (deve estar vazio ou só com pessoas conhecidas) e Settings > Deploy keys (vazio). Em github.com > Settings > Applications, revogue aplicativos que não reconhecer.

## Resposta a incidentes

**Sinais**: alerta do monitor externo; e-mail de execução falhando; nível ou alerta no painel sem correspondência com a régua; commit que você não fez; aviso do GitHub de credencial exposta.

1. **Conter (primeiros 15 minutos)**: avise a Defesa Civil que o painel está sob verificação e que valem os avisos oficiais (Defesa Civil, CEMADEN, IGAM). Se houver suspeita de invasão da conta, troque a senha do GitHub, encerre as sessões (Settings > Sessions) e revogue tokens (Settings > Developer settings).
2. **Parar a publicação se necessário**: Actions > *Atualizar painel de cheias* > ... > *Disable workflow*. O site continua no ar com o último snapshot, mostrando a idade dos dados.
3. **Identificar**: compare o histórico de commits (`git log`) com o esperado; commits "Dados ..." são do robô `painel-cheias`; qualquer outro deve ter sido feito por você.
4. **Recuperar**: `git revert` do commit indevido (ou restauração a partir do backup do passo 6), confira com `python -m unittest discover -s testes`, reative o workflow e acompanhe uma execução completa.
5. **Credencial exposta** (ANA ou CEMADEN): peça nova credencial ao órgão, atualize em Settings > Secrets, e remova a antiga.
6. **Registrar**: data, sinal observado, causa, ação e horário da normalização, no `CHANGELOG.md`.
