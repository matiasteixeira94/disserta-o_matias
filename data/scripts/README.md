# data/scripts — pipeline de dados (Painel de Priorização — Saneamento & Saúde Pública)

Pipeline em Python que importa, trata e padroniza dados **oficiais** de
IBGE, DATASUS (SINAN e SIH-SUS) e SINISA/SNIS para os municípios de
**Pernambuco**, no período de **2015 a 2024** (ajustável em `config.py`).
Não há nenhum dado fictício/ilustrativo em nenhum passo — quando uma fonte
ainda não foi processada, o campo correspondente fica `null` no JSON final,
nunca um valor inventado.

## Como rodar

```bash
cd data/scripts
pip install -r requirements.txt
python run_pipeline.py        # roda 01 a 05 em sequência
```

Ou passo a passo (útil para depurar uma fonte específica):

```bash
python 01_ibge_municipios.py     # municípios + população (IBGE)
python 02_sinan_saude.py         # dengue e chikungunya (SINAN/DATASUS)
python 03_sih_diarreia.py        # internações por diarreia aguda (SIH-SUS)
python 04_sinisa_saneamento.py   # déficit de saneamento (SINISA/SNIS) — passo manual, ver abaixo
python 05_build_painel.py        # junta tudo em data/processed/painel_pe.json
```

Todo download é cacheado em `data/raw/` — rodar de novo não baixa o que já
existe, então o pipeline é seguro e rápido para **atualizações futuras**
(reexecute `run_pipeline.py` periodicamente; ver seção "Atualizações
futuras" no fim deste arquivo).

## Fontes e o que cada script faz

### 01 — IBGE (município e população)
- **API de Localidades** (`servicodados.ibge.gov.br`): lista oficial dos
  185 municípios de PE, com código IBGE de 7 dígitos.
- **API SIDRA**, agregado 6579 ("População residente estimada"), variável
  9324: série anual de população por município.
- 100% automatizado, sem chave de API.
- Anos de Censo (ex.: 2022) não têm estimativa nesta tabela do SIDRA — a
  lacuna é preenchida por interpolação linear entre os anos com dado real
  adjacentes da própria série (marcado na coluna `pop_interpolada`), não
  por um valor inventado.

### 02 — SINAN (dengue e chikungunya)
- FTP público `ftp.datasus.gov.br/dissemin/publicos/SINAN/DADOS/FINAIS/`,
  arquivos nacionais `DENGBR<AA>.dbc` / `CHIKBR<AA>.dbc` (um por ano).
- 100% automatizado. Cada notificação é filtrada pelo município de
  **residência** do paciente (`ID_MN_RESI`) e contada por município/ano.
- **Não usamos o pacote `pysus`** para o download em si: as versões
  testadas (1.0.1 e 2.6.3) têm um bug de mistura de separador de caminho
  (`/` vs `\`) que quebra tanto o cliente novo (catálogo DuckLake em nuvem)
  quanto o cliente antigo (varredura recursiva de diretório) no Windows.
  Em vez disso, `lib/datasus.py` acessa o FTP diretamente (`ftplib`) e usa
  só `pyreaddbc` (dependência do próprio pysus) para descompactar o
  formato `.dbc` — isso é estável e não depende da parte com bug.
- A leitura do `.dbf` resultante usa um leitor binário rápido feito com
  `struct` (`lib.datasus.dbf_read_columns`) em vez da biblioteca `dbfread`
  linha a linha: para os arquivos nacionais de dengue (até ~1,6 milhão de
  registros/ano) isso reduz o tempo de leitura de ~3,5 minutos para
  ~1-2 segundos por arquivo, o que é o que torna viável reprocessar o
  histórico inteiro numa atualização futura.
- O `.dbf` descompactado (bem maior que o `.dbc` original — um único ano de
  dengue nacional chega a ~2 GB descompactado) é apagado logo depois de
  lido; só o `.dbc` fica cacheado em `data/raw/sinan/`. Reconstituir o
  `.dbf` a partir do `.dbc` cacheado leva poucos segundos, então isso não
  penaliza reexecuções — e evita que o cache ocupe dezenas de GB à toa.

### 03 — SIH-SUS (proxy de diarreia aguda)
- FTP público, arquivos **já recortados por UF**:
  `.../SIHSUS/200801_/Dados/RDPE<AA><MM>.dbc` (um por mês).
- **Por que SIH e não SINAN para "diarreia aguda"?** O SINAN só recebe
  notificação de **surtos** de doença diarreica aguda (Portaria GM/MS
  204/2016) — não existe uma série anual de casos individuais por
  município comparável a dengue/chikungunya nessa base. Por isso usamos
  como proxy as internações hospitalares (SIH-SUS) cujo diagnóstico
  principal (CID-10) está no capítulo "Doenças infecciosas intestinais"
  (A00-A09) — abordagem padrão na literatura de saúde ambiental. Ver
  `config.CID_DIARREIA_AGUDA_PREFIXOS` para trocar a definição, se a
  metodologia da tese exigir outro recorte.
- 100% automatizado.

### 04 — SINISA/SNIS (déficit de água, esgoto e resíduos) — **passo manual**
Diferente das outras três fontes, o SINISA (que sucedeu o SNIS em 2024)
**não tem API pública de download em massa**. Isso foi verificado
diretamente antes de decidir o desenho deste script:
- o portal de dados abertos do Ministério das Cidades
  (`dadosabertos.cidades.gov.br`) só aponta para o aplicativo web de
  consulta, sem recurso CSV/JSON direto;
- o aplicativo de Série Histórica (`app4.mdr.gov.br/serieHistorica`) e o
  novo Painel de Indicadores SINISA são só interface de formulário, sem
  endpoint JSON documentado (verificado inspecionando o bundle JS do
  painel em busca de chamadas a `/api/...`).

Passo manual (uma vez por atualização):
1. Acesse **https://app4.mdr.gov.br/serieHistorica/** (ou o painel mais
   novo, **https://indicadores-sinisa-2025.cidades.gov.br/**).
2. Filtre por **Estado = Pernambuco**, todos os municípios, e pelos anos
   configurados em `config.ANO_INICIO`..`config.ANO_FIM`.
3. Exporte a planilha (CSV ou XLSX) com os indicadores de:
   - Água: índice de atendimento (total ou urbano) com rede de água
   - Esgoto: índice de atendimento (total ou urbano) com rede de esgoto
   - Resíduos sólidos: taxa de cobertura do serviço de coleta domiciliar
4. Salve o arquivo, sem renomear, em `data/raw/sinisa/`.
5. Rode `python 04_sinisa_saneamento.py`.

O script reconhece automaticamente as colunas de código de município, ano
e cobertura (tanto pelos códigos clássicos do SNIS quanto por trechos do
nome do indicador — ver `CAMPOS_COBERTURA` no topo do script). Se a
planilha baixada usar cabeçalhos diferentes dos esperados, o script avisa
exatamente quais colunas não conseguiu casar (com a lista de colunas
disponíveis no arquivo) em vez de gerar um déficit errado ou fictício —
ajuste `CAMPOS_COBERTURA`/`CAMPOS_MUNICIPIO`/`CAMPOS_ANO` nesse caso.

Déficit é sempre `100 - cobertura(%)`.

### 05 — Junção final
Junta as quatro fontes por `(codigo_ibge, ano)`, calcula as taxas de saúde
por 100 mil habitantes e grava `data/processed/painel_pe.json`, que é o
único arquivo que o front-end (`js/data.js`) lê. Fontes ainda não
processadas (ex.: SINISA antes do passo manual) resultam em campos `null`
— o front-end mostra "sem dado" nesses casos, nunca um número inventado.

## Atualizações futuras

O pipeline foi desenhado para ser reexecutado periodicamente sem
retrabalho manual (exceto o passo 04):

- **IBGE**: a série de população e a lista de municípios podem ser
  buscadas de novo a qualquer momento (`01_ibge_municipios.py`).
- **SINAN/SIH-SUS**: o DATASUS costuma consolidar os dados "FINAIS" de um
  ano-calendário meses depois do seu fim; reexecutar `02`/`03` mais tarde
  captura essa consolidação, e o cache em `data/raw/` evita rebaixar o que
  já está completo.
- **SINISA**: o ciclo de coleta de cada ano-base costuma abrir entre
  abril e setembro do ano seguinte (ver `gov.br/cidades/.../sinisa`); repita
  o passo manual da seção 04 quando um novo ano-base for publicado.
- Depois de cada rodada, se um novo ano tiver ficado disponível, atualize
  `config.ANO_FIM` e rode `run_pipeline.py` de novo.
- Para automatizar por completo (exceto o passo 04), agende
  `run_pipeline.py` no Agendador de Tarefas do Windows ou em um cron —
  ele é idempotente e seguro para rodar repetidamente.

## Dependências e ambiente

- Python 3.11+, ver `requirements.txt`.
- Não é necessário `pysus` como pacote instalado para os scripts
  funcionarem (só `pyreaddbc`, uma de suas dependências, para
  descompactar `.dbc`) — ver nota na seção 02 acima sobre o bug de path
  no Windows nas versões atuais do `pysus`.
