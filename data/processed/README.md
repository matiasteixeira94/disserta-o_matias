# data/processed

Dados já limpos/normalizados/padronizados, gerados a partir de `data/raw`
pelos scripts em `data/scripts/` (não editar manualmente — rode o pipeline
de novo para regenerar). Arquivos:

- `municipios_pe.csv` — município, código IBGE, população por ano (01).
- `saude_notificacoes_pe.csv` — notificações de dengue/chikungunya por
  município/ano (02).
- `saude_internacoes_dda_pe.csv` — internações por doença infecciosa
  intestinal (proxy de diarreia aguda) por município/ano (03).
- `saude_cobertura_pe.csv` / `saude_cobertura_diarreia_pe.csv` — anos em
  que o download de cada indicador de saúde foi 100% bem-sucedido (02/03);
  usados pelo script 05 para diferenciar "zero casos" (ano coberto, sem
  notificação) de "sem dado ainda" (ano não baixado) — nunca inventam um
  valor, só evitam confundir os dois casos.
- `saneamento_pe.csv` — déficit de água/esgoto/resíduos por município/ano
  (04 — só existe depois do passo manual de importação do SINISA/SNIS).
- **`painel_pe.json`** — junção final de tudo acima (05); é o único
  arquivo que o front-end (`js/data.js`) lê, via `fetch`. Campos ainda não
  apurados aparecem como `null`, nunca como um valor fictício.
- `malha_municipios_pe.geojson` — polígonos dos 185 municípios de PE (06),
  usados pelo mapa geográfico (`js/geo.js`); cada feature tem só `codarea`
  (código IBGE de 7 dígitos, casado com `codigo_ibge` do painel) e a
  geometria. Independente do restante do pipeline.
