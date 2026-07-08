# data/raw

Dados originais, sem tratamento, como baixados das fontes oficiais. Gerado
e cacheado automaticamente pelos scripts em `data/scripts/` — não editar
manualmente, exceto a subpasta `sinisa/` (ver abaixo). Pastas:

- `ibge/` — respostas cruas da API de Localidades e da API SIDRA (IBGE).
- `sinan/` — arquivos `.dbc`/`.dbf` de dengue e chikungunya baixados do FTP
  do DATASUS (`02_sinan_saude.py`).
- `sih/` — arquivos `.dbc`/`.dbf` de internações do SIH-SUS, já recortados
  para Pernambuco (`03_sih_diarreia.py`).
- `sinisa/` — **único ponto de entrada manual do pipeline**: coloque aqui
  o CSV/XLSX baixado manualmente da Série Histórica do SNIS/SINISA (ver
  instruções em `data/scripts/README.md`, seção do script 04). Vazio até
  esse passo manual ser feito.

Estes arquivos podem ser grandes (os `.dbf` nacionais de dengue chegam a
alguns GB) e são cache de reexecução, não histórico versionado — se for
usar Git neste projeto, vale adicionar `data/raw/*` a um `.gitignore`.
