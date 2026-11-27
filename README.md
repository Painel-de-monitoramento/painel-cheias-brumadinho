# Monitoramento de cheias do Rio Paraopeba em Brumadinho

Painel público com o nível de controle da sede de Brumadinho, a chuva acumulada por zona, a régua de Alberto Flores e a vazão em Belo Vale, conforme os níveis de controle e a regra de decisão do estudo RT-BRU-HID-001 Rev04 (Yuri Silva Mendes Vieira, Engenheiro Geotécnico).

## Arquivos

- `index.html`, `simulador.html` e `estacoes.html`: painel em tempo real, simulador e aba de estações e leituras. A lógica de cada página fica em `painel.js`, `simulador.js` e `estacoes.js` (sem script embutido no HTML, o que permite a política de segurança de conteúdo); funções comuns em `comum.js`.
- `vendor/plotly-2.35.2.min.js`: biblioteca de gráficos hospedada no próprio site, com verificação de integridade (SRI). Sem ela, as páginas continuam mostrando nível, alertas e resumos em texto.
- `dados.py`: convenção única de intervalos (`[início, fim)`), conversão das fontes (ANA no fim do intervalo, Open-Meteo na hora anterior, met.no no início), cobertura medida, estimada, temporal e espacial, frescor por cadência.
- `operacao.json`: resultado da última tentativa de coleta (ok, degradado ou falha), falhas consecutivas e última coleta válida. `versao.json` (gerado na montagem do site): execução, commit e identificador do snapshot publicado.
- `RELATORIO_AUDITORIA.md`: rastreabilidade dos 22 apontamentos da auditoria de 26/11/2026.
- `SEGURANCA.md`: relatório dos 30 requisitos de segurança, roteiro de configuração da conta GitHub e resposta a incidentes (revisão de 27/11/2026).
- `motor.js` e `motor.py`: motor único de decisão (mesma lógica nas duas linguagens). Ausência é null, cobertura por janela, estado indeterminado, histerese de rebaixamento.
- `coletor.py`: baixa a telemetria da ANA e a chuva estimada e prevista (Open-Meteo, met.no como reserva), chama o motor e grava `data.json` e `estado.json` de forma atômica.
- `aovivo.js`: atualização no navegador com o mesmo motor; só pode elevar o nível publicado, nunca rebaixar.
- `validar.py`: validação estrutural do `data.json` antes da publicação.
- `testes/`: casos de aceitação do motor, paridade Python x JavaScript, independência de fuso, tratamento de dados, validador e camada ao vivo (`python -m unittest discover -s testes -v`, requer Node para a paridade e a camada ao vivo).
- `estado.json`: nível vigente, horário e causa, e histórico das transições (gerado pelo coletor).
- `tel_cache.json` e `modelo_hist.json`: histórico usado pelo coletor entre execuções.

## Pendência: HidroWebService autenticado (P0-01)

O coletor usa o serviço legado `telemetriaws1.ana.gov.br`, que segue respondendo em 26/11/2026. A migração para o HidroWebService depende de credencial da ANA, que ainda não existe. Passos:

1. Enviar e-mail para hidro@ana.gov.br com o assunto "[CPF] - Solicitação de acesso à API HidroWebService para consumo de dados", conforme o manual público da ANA (versão 14/03/2025).
2. Recebida a credencial, cadastrar no repositório em Settings > Secrets and variables > Actions > New repository secret: `ANA_HIDRO_USUARIO` e `ANA_HIDRO_SENHA`. O workflow já repassa esses segredos ao coletor como variáveis de ambiente. A credencial nunca deve aparecer em arquivo do repositório, no JavaScript ou no JSON público.
3. Implementar e testar o cliente com uma consulta real das estações 40740000 e 40710001 antes de considerar a integração validada. Sem credencial, o coletor permanece no serviço legado (modo degradado documentado).

Os dados de telemetria são brutos e provisórios. O painel é ferramenta de apoio e não substitui os avisos oficiais da Defesa Civil, do CEMADEN e do IGAM.

## Pendência: pluviômetros automáticos da Z1 (CEMADEN)

A Z1 tem um único pluviômetro automático na telemetria pública da ANA (IGAM 2043133, Conselheiro Lafaiete), que transmite de forma intermitente, em geral entre 6 h e 18 h. Por isso, em cerca de metade das horas a chuva da Z1 é estimada por modelo; o painel mostra essa proporção. Os pluviômetros automáticos do CEMADEN em Congonhas e Conselheiro Lafaiete (2043099 a 2043108 no inventário da ANA) não estão na telemetria da ANA, e o INMET Ouro Branco (2043052) também não. O acesso ao CEMADEN é pela Plataforma de Entrega de Dados (https://ped.cemaden.gov.br), com cadastro e token temporário (limite de 12 requisições por minuto para usuário externo). Passos:

1. Cadastrar-se na PED do CEMADEN e confirmar o procedimento de obtenção do token e os endereços da API com o próprio CEMADEN.
2. Cadastrar as credenciais como segredos do repositório (`CEMADEN_USUARIO`, `CEMADEN_SENHA`), nunca em arquivo.
3. Implementar o cliente no coletor somente depois de uma consulta real bem-sucedida às estações de Congonhas e Conselheiro Lafaiete, com teste automatizado, e incluir as estações na lista `EST` da zona Z1. Até lá, a Z1 permanece medida em parte e estimada em parte, com a proporção exibida.

## Implantação, monitoramento e reversão

- Proteção da branch `main`: exigir revisão de pull request e a verificação "coletar" aprovada; ativar 2FA na conta. O robô do workflow grava dados na `main` com o `GITHUB_TOKEN`; se a proteção bloquear esse push, liberar apenas o GitHub Actions na regra.
- Alertas: o GitHub envia e-mail ao dono do repositório quando uma execução agendada falha. Agora a execução fica vermelha sempre que a coleta não é completa (inclusive quando o último snapshot válido é republicado). Para um monitor independente, configure um serviço externo de verificação de página (por exemplo, um verificador de disponibilidade gratuito) apontando para `operacao.json` e alertando quando `falhas_consecutivas` for maior que 2 ou quando `ultima_tentativa` tiver mais de 1 hora.
- Reversão: `git revert` do merge desta revisão volta o site ao estado anterior; `data.json`, `estado.json` e caches continuam compatíveis (o coletor anterior lê os mesmos arquivos; o `modelo_hist.json` convertido só desloca em 1 h as estimativas guardadas do modelo).
