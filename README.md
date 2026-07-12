# SaneData — Painel de Priorização em Saneamento & Saúde Pública

Painel interativo para priorização de investimentos em saneamento e saúde pública nos municípios de Pernambuco, desenvolvido no âmbito do PPGECAM.

**Demo:** https://sanerdata.vercel.app/

## Telas

- **Tela Inicial** — abertura institucional e navegação.
- **Apresentação** — o que é o SaneData, como o índice de priorização é
  calculado (resumo) e como usar cada tela do painel.
- **Dashboard** — índice de priorização (ranking clicável, mapa geográfico
  por camada, decomposição, distribuição, índice por mesorregião,
  investimento em saneamento por município, matriz de correlação, pontos
  de atenção com modo curadoria) e "Município em foco" (evolução temporal,
  comparação com a média, correlação/dispersão).
- **Relatórios** — ranking completo do ano com investimento em saneamento
  por município e exportação em CSV, Excel, imagem e impressão/PDF.
- **Comparações** — dois municípios lado a lado.

## Estrutura

- `index.html`, `css/`, `js/` — aplicação.
- `data/raw/` — dados brutos (IBGE, SINISA/DATASUS etc.).
- `data/scripts/` — scripts de coleta e processamento dos dados.
- `data/processed/` — dados tratados consumidos pela aplicação.
- `docs/` — memorial descritivo, decisões de metodologia e notas para a dissertação.
