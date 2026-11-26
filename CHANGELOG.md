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
