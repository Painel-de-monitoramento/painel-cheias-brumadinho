# Monitoramento de cheias do Rio Paraopeba em Brumadinho

Painel público com o nível de controle da sede de Brumadinho, a chuva acumulada por zona, a régua de Alberto Flores e a vazão em Belo Vale, conforme os níveis de controle e a regra de decisão do estudo RT-BRU-HID-001 Rev04 (Yuri Silva Mendes Vieira, Engenheiro Geotécnico).

- `index.html`: o painel.
- `coletor.py`: baixa a telemetria da ANA e a chuva estimada e prevista (Open-Meteo, com met.no como alternativa), aplica a regra de decisão e grava `data.json`.
- `.github/workflows/atualizar.yml`: roda o coletor a cada 15 minutos e publica o painel no GitHub Pages.
- `tel_cache.json` e `modelo_hist.json`: histórico usado pelo coletor entre execuções.

Os dados de telemetria são brutos e provisórios. O painel é ferramenta de apoio e não substitui os avisos oficiais da Defesa Civil, do CEMADEN e do IGAM.
