# Relatório de rastreabilidade: auditoria do painel de cheias (Revisão 01, 26/11/2026)

Branch `revisao-auditoria-2026-11-26`, criada a partir da `main` em 2905a1b. Nenhum merge e nenhuma publicação foram feitos. Os limites hidrológicos, as fórmulas e os parâmetros calibrados do RT-BRU-HID-001 Rev04 não foram alterados.

**Testes executados**
- 23 testes Python: 26 casos de aceitação, paridade Python x JavaScript, fuso horário, dados, validador e camada ao vivo no Node, com 11 cenários. Comando: `python -m unittest discover -s testes -v`.
- 34 verificações no Chromium, em desktop 1366 px e em celular (iPhone 13), com falhas simuladas: ANA fora do ar, Plotly bloqueado, Plotly adulterado, `data.json` com HTTP 500, `data.json` inválido, falha depois de uma carga válida, chuva ausente no simulador, valores históricos e cenário extremo.
- Coleta real em 26/11/2026, duas vezes:
  - às 22:25, com a ANA fora do ar: resultado indeterminado, nível mantido e coleta sinalizada;
  - às 22:54, completa: nível Normal válido.

**Legenda de status:** Corrigido = reproduzido no código e corrigido com teste. Corrigido com ressalva = corrigido, com limitação descrita no item.

| Item | Prioridade | Status | Arquivos |
|---|---|---|---|
| 01 Dados ausentes como zero no simulador | P0 | Corrigido | simulador.js |
| 02 Simulador sem atualização | P0 | Corrigido | simulador.js |
| 03 Previsão antiga como disponível | P0 | Corrigido | coletor.py, aovivo.js, painel.js |
| 04 Normalidade com dados parciais | P0 | Corrigido | motor.py, motor.js, painel.js |
| 05 Critério de umidade divergente | P1 | Corrigido | simulador.js |
| 06 Medidor indica zero sem dado | P0 | Corrigido | painel.js |
| 07 Régua simulada limitada a 13 m | P1 | Corrigido | simulador.js |
| 08 Erros silenciosos de atualização | P0 | Corrigido | comum.js, painel.js, simulador.js, estacoes.js |
| 09 Disponibilidade da estação mascara variável | P1 | Corrigido | coletor.py, aovivo.js, estacoes.* |
| 10 Intervalos de chuva incompatíveis | P0 | Corrigido com ressalva | dados.py, coletor.py, aovivo.js |
| 11 Workflow verde com coleta falha | P0 | Corrigido | coletor.py, atualizar.yml |
| 12 Medição futura aceita | P0 | Corrigido | motor.*, dados.py, coletor.py, aovivo.js |
| 13 Hora incompleta na chuva observada | P0 | Corrigido | coletor.py, aovivo.js |
| 14 Cobertura de 100% estimada | P1 | Corrigido | dados.py, coletor.py, aovivo.js, painel.js |
| 15 Validação estrutural insuficiente | P0 | Corrigido | validar.py |
| 16 Solo indeterminado sem degradar | P0 | Corrigido | motor.*, aovivo.js |
| 17 Falhas sucessivas mantêm dado antigo | P0 | Corrigido | aovivo.js, painel.js |
| 18 Dependência externa sem integridade | P1 | Corrigido | vendor/, *.html, atualizar.yml |
| 19 Nível e vazão com horário único | P1 | Corrigido | coletor.py, aovivo.js, páginas |
| 20 Geração confundida com publicação | P1 | Corrigido com ressalva | coletor.py, atualizar.yml, comum.js |
| 21 Cenários históricos truncados | P1 | Corrigido | simulador.* |
| 22 Alerta ao vivo rebaixado sem histerese | P0 | Corrigido | aovivo.js |

---

## Itens P0

### 01. Dados ausentes tratados como chuva zero
- **Confirmado no código:** `simulador.html` usava `(Z[z].P5||0)`.
- **Correção (`simulador.js`, `sim()`):** quando a chuva observada de uma zona é nula, o cálculo automático fica bloqueado e o resultado mostra "Simulação incompleta". Aparece um campo de preenchimento manual, identificado como "informado manualmente". P5 = 0 continua válido.
- **Teste:** navegador no celular com P5 nulo em Z2 resultou em "Simulação incompleta" e no campo manual. O valor manual 0 foi aceito.

### 02. Simulador não atualiza
- **Confirmado no código:** só havia o carregamento inicial.
- **Correção:**
  - recarga do `data.json` e da telemetria a cada 5 min, com a idade da régua exibida;
  - os cenários automáticos ("situação atual" e "somente observada") são recalculados a cada recarga;
  - entradas manuais ou um evento carregado não são sobrescritos. O aviso diz que as condições mudaram e o botão "Recarregar condições atuais" aplica os dados novos.
- **Teste:** navegador confirmou que a entrada manual é preservada e que o modo mostrado é "Entradas manuais".

### 03. Previsão antiga marcada como disponível
- **Confirmado no código:** o cache de 30 min e o `modelo_ok` herdado mantinham o selo de previsão atual.
- **Correção:**
  - o coletor grava `previsao_meta` com `obtida`, `ultima_tentativa`, `ultimo_sucesso` e `fonte`;
  - o navegador calcula a validade pela idade do último sucesso: até 3 h atual, de 3 a 12 h desatualizada (com aviso), acima de 12 h indisponível (projeção ocultada e alerta).
- **Teste:** `test_aovivo.js` com previsão de 5 h e de 13 h.

### 04. Normalidade com dados parciais
- **Confirmado no código:** Normal era classificado como "degradado" com uma zona indisponível e outra parcial.
- **Correção (`decidir()`):**
  - Normal só é afirmado com régua e Belo Vale válidos e ao menos duas zonas com cobertura de 90%; caso contrário, o nível fica indeterminado;
  - o nível anterior continua guardado em `estado`;
  - a faixa do painel não esconde um nível acima de Normal quando os dados ficam insuficientes: mostra "Alerta · mantido", e não "Indeterminado".
- **Teste:** casos "Normal com só uma zona completa" e "duas completas e uma parcial", mais o navegador.

### 06. Medidor visual indica zero sem dados
- **Confirmado no código:** `ang(v||0)`, `HEX[d.af.nivel||0]` e `HEX[d.bv.nivel||0]`.
- **Correção:**
  - medidor sem ponteiro, com o texto "Sem informação";
  - régua e losango de vazão no mapa ficam cinzas sem leitura válida;
  - régua lateral com "Sem leitura";
  - "Maior chuva de 5 dias" ignora zonas nulas e as informa.
- **Teste:** navegador. O zero medido continua exibido como 0.

### 08. Erros silenciosos de atualização
- **Confirmado no código:** `catch(e){}` e `console.error` em `load()`.
- **Correção:**
  - `C.json()` usa tempo limite de 15 s e verifica o JSON;
  - o painel renderiza o snapshot válido imediatamente e depois atualiza a telemetria;
  - uma falha aparece no cabeçalho ("Falha ao atualizar às HH:MM (motivo) · exibindo dados de...") e no aviso, com o botão Atualizar para nova tentativa;
  - consultas não se sobrepõem.
- **Teste:** navegador com `data.json` em HTTP 500, `data.json` inválido e falha depois de uma carga válida (os dados permanecem na tela).

### 10. Intervalos temporais de chuva incompatíveis
- **Confirmado no código:** o Open-Meteo foi conferido na documentação ("soma da hora anterior"), mas era gravado na chave do fim do intervalo. O met.no usa o início do intervalo. A ANA era agrupada pelo piso do horário.
- **Correção:** convenção única `[início, fim)` em `dados.py`, replicada no `aovivo.js`:
  - ANA = fim do intervalo (o registro das 10:00 vai para 09–10 h);
  - Open-Meteo = hora anterior;
  - met.no = início.
  O histórico do modelo foi convertido uma vez (marcado com `convencao: inicio`). Observado e previsto não se sobrepõem.
- **Teste:** série sintética cruzando a meia-noite preserva o volume e o dia, nos dois testes (Python e Node).
- **Ressalva:** a convenção "fim do intervalo" da ANA segue a prática da telemetria, mas não está escrita na documentação pública do serviço legado. Convém confirmar com a ANA. Se estiver errada, o efeito é deslocar a hora, não o volume.

### 11. Workflow conclui com sucesso apesar de coleta falha
- **Confirmado no código:** `continue-on-error` com fallback deixava o job verde.
- **Correção:**
  - o coletor sai com código 2 quando a régua ou Belo Vale não foram baixados; o snapshot é gravado com as idades reais;
  - o workflow grava `operacao.json` com o resultado, as falhas consecutivas e a última coleta válida;
  - o site é publicado (fallback), mas o último passo deixa a execução vermelha sempre que a coleta não for completa. O GitHub envia e-mail de falha;
  - o painel mostra o resultado da última tentativa.
- **Teste:** simulação dos códigos 0, 2, 1, 1 e 0 (contador 0→1→2→3→0) e coleta real com a ANA fora do ar (saída 2).

### 12. Medição futura aceita como válida
- **Confirmado no código:** idade menor ou igual a 3 h aceitava valor negativo, e o parser aceitava até 30 min no futuro.
- **Correção:**
  - tolerância documentada de 5 min;
  - o motor recusa leituras além dela, com o motivo "horário da leitura no futuro";
  - o coletor e o navegador descartam e contam esses registros, com alerta para a régua e Belo Vale;
  - o motor em Python passou a calcular as diferenças em UTC explícito.
- **Teste:** leitura 20 min no futuro resulta em indeterminado; 4 min no futuro é aceita; resultados idênticos com TZ=UTC, America/Sao_Paulo e Asia/Tokyo.

### 13. Hora incompleta entra na chuva observada
- **Confirmado no código:** `agora = hora + 1h`.
- **Correção:** os acumulados terminam na última hora concluída (`fim_acumulado`). A chuva medida da hora em curso aparece à parte (`hora_parcial`). A previsão começa na hora em curso.
- **Teste:** às 15:20, chuva com chave 15:00 fica fora do acumulado até 15:00.

### 15. Validação estrutural insuficiente
- **Correção (`validar.py`):**
  - JSON estrito (NaN e Infinity recusados) e booleano recusado como número;
  - datas válidas e não futuras;
  - limites crescentes;
  - coberturas entre 0 e 1, e medida + estimada = temporal;
  - P24 ≤ P72 e P5 ≤ P30;
  - status coerente;
  - séries ordenadas e sem horário repetido;
  - horários de medição não posteriores à coleta.
  Valores extremos plausíveis (cota acima de 11,75 m, saltos) geram sinalização, também gravada em `qualidade.flags`, sem descartar o dado.
- **Teste:** 7 testes, incluindo NaN, Infinity, booleano, data inválida e futura, limites e o caso extremo (sinaliza, mas não bloqueia).

### 16. Solo indeterminado não degrada a qualidade geral
- **Confirmado no código:** a cobertura ausente da vazão de ontem era presumida 100%, nos dois motores e no navegador.
- **Correção:**
  - cobertura ausente = 0, o que leva a solo indeterminado;
  - solo indeterminado leva o status a "degradado", nunca válido;
  - o painel mostra o nível que a regra daria com solo úmido;
  - o rebaixamento só ocorre até esse cenário conservador.
  Os limites do estudo não mudaram.
- **Teste:** 4 casos novos, mais o teste da camada ao vivo.

### 17. Falhas sucessivas mantêm informação antiga
- **Correção:**
  - reavaliação local a cada 1 min, mesmo sem rede: as idades avançam, leituras com mais de 3 h deixam de valer e o nível fica indeterminado sem ser rebaixado;
  - cada fonte tem tempo limite de 20 s, nova tentativa com espera crescente (até 30 min) e registro de falhas, visível na aba Estações.
- **Teste:** relógio avançado 4 h sem rede: a régua fica indisponível, o status indeterminado e o Alerta é mantido.

### 22. Alerta ao vivo rebaixado sem histerese
- **Correção:**
  - a elevação detectada no navegador é guardada no armazenamento local e sobrevive a recarregar a página;
  - ela só é desfeita pela confirmação do servidor (nível maior ou igual) ou por uma decisão válida do motor (todos os indicadores válidos e régua descendo 12 h), nunca abaixo do nível do servidor;
  - o painel mostra o nível publicado e a elevação local separadamente.
- **Teste:** sequência servidor = 0, ao vivo = 2 e nova leitura = 0 mantém 2. Também foram testados: recarregar a página, falta de dados, rebaixamento com 12 h de descida e confirmação do servidor.

## Itens P1

### 05. Critério divergente de umidade
- **Correção:**
  - o simulador usa `Motor.solo()`, a mesma regra do painel;
  - há campos próprios para a vazão média de ontem e a chuva de 30 dias, separados da vazão de base da regressão;
  - com solo indeterminado, o simulador mostra os dois cenários e prevalece o maior;
  - nos eventos históricos, a vazão de base é usada como aproximação da vazão de ontem, com aviso.

### 07. Régua simulada limitada a 13 m
- **Correção:**
  - escala dinâmica: máximo entre 13 m e P90 + 1 m;
  - faixa hachurada de "extrapolação" acima da maior cheia observada (1717 m³/s, 1997);
  - avisos de domínio do modelo para chuva, vazão de base e fim da curva;
  - legenda "cota simulada, não é medição".
- **Teste:** cenário de 900 mm com Qbase de 450 resultou em 26,40 m, sem truncar e com a extrapolação indicada.

### 09. Disponibilidade da estação mascara variável ausente
- **Correção:**
  - `estacoes[].variaveis.{nivel, vazao, chuva}`, cada uma com horário, idade, cadência e frescor;
  - `ok` só é verdadeiro se todas as variáveis estiverem válidas;
  - nova aba "Estações e leituras" mostra a régua e a vazão de controle e cada variável por estação.
- **Teste:** navegador, desktop e celular.

### 14. Cobertura de 100% pode ser estimada
- **Correção:**
  - campos `cob5_medida`, `cob5_estimada` e `cob5_espacial`;
  - `fontes5`: hora a hora, M (medida), E (estimada) ou - (sem dado);
  - fração das horas medidas de cada pluviômetro;
  - o painel exibe a proporção e alerta quando a parte medida for menor que 50%.
  O status por zona continua pela cobertura temporal, como o estudo previa.
- **Teste:** 120 h estimadas = 100% temporal e 0% medida (Python e Node).

### 18. Dependência externa sem integridade
- **Correção:**
  - Plotly 2.35.2 hospedado em `vendor/` (obtido do npm), com SRI sha384;
  - CSP restrita: sem script embutido, todo JavaScript foi movido para arquivos;
  - ações do GitHub fixadas por SHA;
  - permissões do workflow separadas por job;
  - sem a biblioteca de gráficos, nível, alertas e resumos continuam em texto.
- **Teste:** Plotly bloqueado e Plotly adulterado (o SRI bloqueou e o nível continuou exibido). Nenhuma violação de CSP nas três páginas.

### 19. Nível e vazão usam horários diferentes
- **Correção:**
  - campos `af.h_t`, `af.q_t`, `bv.q_t` e `bv.h_t`, mantendo `t` por compatibilidade;
  - o cabeçalho e a aba Estações mostram cada horário;
  - a chuva informa "acumulada até".
- **Teste:** coleta real com régua às 22:00 e Belo Vale às 22:30, cada um com o próprio horário.

### 20. Geração do arquivo confundida com publicação
- **Correção:**
  - `publicacao` passa a ser `geracao_snapshot`;
  - novo `id_snapshot` (hash do conteúdo);
  - `versao.json` com execução e commit;
  - a página consulta a API pública de implantações do GitHub e só mostra "Publicação confirmada" com sucesso registrado; caso contrário, "não confirmada (motivo)".
- **Ressalva:** a consulta depende da API pública do GitHub (60 consultas por hora por IP). Ela não pôde ser testada contra a implantação real, porque o deploy só ocorre após o merge.

### 21. Cenários históricos truncados por sliders
- **Correção:**
  - campos numéricos ao lado dos controles, com passo de 1 mm;
  - os eventos carregam valores exatos (1997 Z2 = 364 mm; 2022 Z3 = 429 mm);
  - o controle amplia o alcance automaticamente;
  - aviso de domínio quando o valor está fora dos eventos de calibração.
- **Teste:** 01/2022 carregou Z3 = 429 mm exatos.

## Pedidos adicionais
- **Mapa:** mostra só as estações usadas no cálculo: régua de Alberto Flores, vazão de Belo Vale e os 7 pluviômetros das zonas. A cor indica se o pluviômetro transmite. O inventário de 88 estações foi removido.
- **Réguas:** ficaram só as do eixo do Paraopeba: PCH Salto do Paraopeba montante, Belo Vale e Alberto Flores, com o parâmetro de análise de cada uma. Foram retiradas as réguas de afluentes e do reservatório.
- **Terceira aba:** "Estações e leituras".
- **Celular:**
  - Causa: o simulador só mostrava conteúdo depois de toda a telemetria da ANA responder, até 40 s por estação; além disso, a página ficava 528 px mais larga que a tela.
  - Correção: o simulador agora abre em menos de 1 s com o snapshot e atualiza em segundo plano, sem rolagem horizontal nas três páginas.
- **Z1:** o pluviômetro automático 2043133 transmite só entre 6 h e 18 h, então 42% das horas são medidas. Nenhuma outra estação automática da Z1 está na telemetria da ANA. Os pluviômetros do CEMADEN exigem cadastro na PED e um token. Os passos estão no README.

## Pendências e riscos residuais
1. **CEMADEN na Z1:** depende de cadastro e de teste com consulta real (README).
2. **HidroWebService autenticado:** pendência anterior, sem mudança.
3. **Workflow sem execução real:** os passos foram simulados localmente, mas o workflow só roda no GitHub após o merge. A primeira execução converte `modelo_hist.json` e gera o `data.json` no formato novo.
4. **Workflow possivelmente parado:** a `main` não recebe commit de dados desde as 19:57. Vale conferir a aba Actions. Daqui não houve acesso à API do repositório.
5. **Itens da seção P2 da auditoria não implementados:** probabilidades calibradas, aba de comparação histórica e notificações. O intervalo P10–P90 existente foi rotulado e explicado.
6. **E-mails repetidos de falha:** com a ANA instável, as execuções vermelhas vão gerar e-mails repetidos. O monitor externo está sugerido no README.
7. **Rollback:** `git revert` do merge (README).
