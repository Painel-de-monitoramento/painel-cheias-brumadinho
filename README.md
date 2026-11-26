# Monitoramento de cheias do Rio Paraopeba em Brumadinho

Painel público com o nível de controle da sede de Brumadinho, a chuva acumulada por zona, a régua de Alberto Flores e a vazão em Belo Vale, conforme os níveis de controle e a regra de decisão do estudo RT-BRU-HID-001 Rev04 (Yuri Silva Mendes Vieira, Engenheiro Geotécnico).

## Arquivos

- `index.html` e `simulador.html`: painel em tempo real e simulador.
- `motor.js` e `motor.py`: motor único de decisão (mesma lógica nas duas linguagens). Ausência é null, cobertura por janela, estado indeterminado, histerese de rebaixamento.
- `coletor.py`: baixa a telemetria da ANA e a chuva estimada e prevista (Open-Meteo, met.no como reserva), chama o motor e grava `data.json` e `estado.json` de forma atômica.
- `aovivo.js`: atualização no navegador com o mesmo motor; só pode elevar o nível publicado, nunca rebaixar.
- `validar.py`: validação estrutural do `data.json` antes da publicação.
- `testes/`: casos de aceitação e teste de paridade Python x JavaScript (`python -m unittest discover -s testes -v`).
- `estado.json`: nível vigente, horário e causa, e histórico das transições (gerado pelo coletor).
- `tel_cache.json` e `modelo_hist.json`: histórico usado pelo coletor entre execuções.

## Pendência: HidroWebService autenticado (P0-01)

O coletor usa o serviço legado `telemetriaws1.ana.gov.br`, que segue respondendo em 26/11/2026. A migração para o HidroWebService depende de credencial da ANA, que ainda não existe. Passos:

1. Enviar e-mail para hidro@ana.gov.br com o assunto "[CPF] - Solicitação de acesso à API HidroWebService para consumo de dados", conforme o manual público da ANA (versão 14/03/2025).
2. Recebida a credencial, cadastrar no repositório em Settings > Secrets and variables > Actions > New repository secret: `ANA_HIDRO_USUARIO` e `ANA_HIDRO_SENHA`. O workflow já repassa esses segredos ao coletor como variáveis de ambiente. A credencial nunca deve aparecer em arquivo do repositório, no JavaScript ou no JSON público.
3. Implementar e testar o cliente com uma consulta real das estações 40740000 e 40710001 antes de considerar a integração validada. Sem credencial, o coletor permanece no serviço legado (modo degradado documentado).

Os dados de telemetria são brutos e provisórios. O painel é ferramenta de apoio e não substitui os avisos oficiais da Defesa Civil, do CEMADEN e do IGAM.
