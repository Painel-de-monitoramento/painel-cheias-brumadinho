# Registro de alterações, revisão 27/11/2026 (auditoria de cálculo e segurança)

Gatilhos e limites do estudo não foram alterados. 11 testes novos (39 no total), todos aprovados; 3 dos 4 testes da aba de probabilidade falham no código anterior, confirmando os erros.

## Cálculo
- **Desconto de solo úmido aplicado duas vezes (probabilidade.js)**: a regra de chuva da aba de probabilidade usava os limites já descontados do `data.json` e descontava de novo 30 mm (Z1 com solo úmido em 80 mm em vez de 110 mm). Passa a partir dos limites do quadro (`D.limites`), com um único desconto.
- **Chuva acumulada desatualizada (motor.py e motor.js)**: a janela de 5 dias encerrada há mais de 3 h passa ao estado `desatualizada`. O valor ainda pode elevar o nível, mas não conta como zona completa; sem duas zonas completas, Normal não é afirmado (estado indeterminado). Aviso no painel de alertas e no selo da zona.
- **0% artificial (probabilidade.js)**: quando a chuva prevista fica abaixo da menor chuva de enchente registrada (100 mm), o modelo não calcula probabilidade; a página mostra "Risco baixo*" com nota explicativa, nunca 0%.
- **Horizonte de 10 dias (probabilidade.js)**: títulos dos cartões, cabeçalhos da tabela e resumo usam o número de dias efetivamente coberto pela previsão.
- **Horas faltantes na previsão por conjunto (probabilidade.js)**: dia com menos de 90% das horas previstas não entra no cálculo (antes a soma parcial subestimava a chuva).
- **Pluviômetros do navegador = pluviômetros do servidor (aovivo.js)**: o navegador usa a lista publicada pelo coletor; se o servidor usou pluviômetro que o navegador não lê (CEMADEN), a janela da zona não é substituída no navegador.
- **Valores anômalos (coletor.py e aovivo.js)**: cota fora de 0 a 30 m e vazão fora de 0 a 6000 m³/s viram ausência e são registradas; antes um único valor impossível bloqueava a publicação inteira. Salto de 1 m ou mais na régua entre leituras consecutivas gera aviso para conferência local (o valor é mantido, pode ser cheia real).
- Rebaixamento com série horária incompleta: já bloqueado (a descida de 12 h exige série contínua); coberto pelos casos existentes.

## Segurança
- Relatório dos 30 requisitos, roteiro de configuração da conta e procedimento de resposta a incidentes em `SEGURANCA.md`.
- `testes/test_seguranca.py`: CSP, ausência de script embutido e de `eval`, SRI conferido contra o arquivo, varredura de credenciais, ações fixadas por SHA, permissões mínimas, critérios iguais nas 3 camadas.
- Verificação do `data.json` no navegador (`C.snapshot()`): estrutura, versão, horário e critérios do estudo; snapshot recusado mostra erro, nunca nível.
- `validar.py` bloqueia publicação com limites ou ajuste de solo úmido diferentes do estudo.
- Proteção contra incorporação em outro site (clickjacking) e `upgrade-insecure-requests` na CSP.
- `.github/dependabot.yml` para as ações do GitHub; `.gitignore` bloqueia `.env`, chaves e certificados.

# Registro de alterações, revisão 26/11/2026

Atende ao relatório de revisão do painel (itens P0 e P1) e aos pedidos de ajuste do simulador e do mapa. Gatilhos do estudo não foram alterados.

## P0-01 HidroWebService
- Não integrado: depende de credencial da ANA. Segredos `ANA_HIDRO_USUARIO` e `ANA_HIDRO_SENHA` já previstos no workflow; instruções no README. Coleta segue pelo serviço legado (testado em 26/11/2026 18:11, régua 2,77 m às 17:00, Belo Vale 45,6 m³/s às 17:30).

## P0-02 Ausência não é zero
- Coletor e navegador deixam de preencher lacunas com zero (telemetria e modelo).
- Cobertura calculada para 24 h, 72 h, 5 dias e 30 dias; zona classificada como ok (≥ 90%), parcial ou indisponível.
- Valor parcial que atinge limite aciona o nível.
- Sem régua e Belo Vale válidos (leitura de até 3 h) e sem indicador acionado, o nível é Indeterminado, nunca Normal.
- Previsão ausente ou parcial é exibida como tal, nunca como zero.

## P0-03 Rebaixamento com histerese
- `estado.json` guarda nível vigente, horário, causa e histórico das transições.
- Elevação imediata. Rebaixamento só com todos os indicadores válidos abaixo do limite e régua em descida contínua por 12 h sem lacuna.

## P0-04 Motor único
- `motor.py` (coletor) e `motor.js` (navegador) com a mesma lógica e teste de paridade.
- O navegador consome o estado publicado e só pode antecipar elevação.
- Cabeçalho mostra separadamente medição da régua, medição de Belo Vale, coleta do servidor e publicação, com idade real.

## P1-01 Representatividade da chuva
- Pluviômetros telemétricos acrescentados: Z1 Conselheiro Lafaiete IGAM 2043133 (Z1 deixa de depender só do modelo), Z3 CGH Caquende 40712000 e CGH Juliões 40712600. Congonhas 2043013 fica como candidata (sem dado na telemetria).
- Fonte de cada janela rotulada como medição, modelo ou misto.

## P1-02 Umidade do solo
- P30 da bacia ponderada pela área: (1337·Z1 + 1428·Z2 + 1193·Z3) / 3958.
- Solo indeterminado quando nenhum critério comprova umidade e falta um dos dados; limites de solo normal mantidos e o fato é sinalizado.

## P1-03 Workflow
- Testes de aceitação e paridade antes da coleta.
- Coleta com duas tentativas, validação do JSON (`validar.py`) e gravação atômica.
- Falha na coleta mantém o último snapshot válido e gera anotação de erro.
- Removidos os `|| true`; push com três tentativas e erro explícito.
- Downloads da ANA em paralelo com timeout menor, para caber no limite do job.

## P1-04 Visualização
- Chuva diária separada em medida, estimada ou mista (hachurada) e prevista.
- Botões de 24 h, 72 h, 7 dias e 30 dias nos gráficos da régua e de Belo Vale.
- Lacunas de mais de 2 h aparecem interrompendo a curva.

## Simulador
- Régua de Alberto Flores simulada, com faixa provável de 80%.
- Vazão de pico simulada em Belo Vale (ln Q_BV = 0,944 + 0,849 ln Q_AF, picos das 9 enchentes, r = 0,96) e nível correspondente entrando na regra.
- Título com a enchente carregada; some ao mover qualquer controle.
- Eventos identificados como MM/AAAA.

## Mapa
- Régua (Alberto Flores) e medição de vazão (Belo Vale) com símbolos próprios.
- 88 estações da bacia (fluviométricas, pluviométricas e meteorológica), telemétricas cheias e convencionais vazadas, com camadas liga/desliga.

## Testes (18 casos, todos aprovados)
AF 5,00 m Atenção; BV 950 Alerta máximo; Z1 185 e Z2 210 Alerta; só Z2 210 Atenção; solo úmido Z1 110 e Z2 125 Atenção; AF 9,41 Alerta máximo; AF 10,54 Emergência; todas as fontes ausentes Indeterminado; régua e Belo Vale defasados Indeterminado; chuva parcial acima do limite aciona; descida 11 h mantém; descida 12 h rebaixa; lacuna não rebaixa; indicador indisponível bloqueia rebaixamento; navegador não rebaixa; subida imediata; solo indeterminado; P30 ponderada. Paridade Python x JavaScript idêntica nos 18 casos.

## Réguas ao longo do trecho (novo)
- Tabela com as 7 réguas telemétricas das zonas Z2 e Z3 (Entre Rios, PCH Salto do Paraopeba Camapuã e montante, Belo Vale, CGH Caquende, CGH Juliões, Alberto Flores): cota e vazão atuais, variação em 24 h, cota nas cheias de 2020 e 2022 e maior cota registrada.
- Gráfico dos últimos 10 dias com todas as réguas na mesma escala (0% = rio baixo, 100% = maior cheia da estação).
- Referências históricas (`reguas.json`) extraídas da telemetria da ANA, períodos chuvosos de 2014/15 a 2025/26, com remoção de valores travados de sensor (ex.: 12,86 m na PCH montante em 04/2019 e 10,92 m em Caquende em 2025).
- PCH Salto do Paraopeba barramento (40700080) excluída: mede o reservatório, sem relação com a cheia. Z1 sem régua telemétrica em operação.
