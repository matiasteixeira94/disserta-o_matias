"""
Configuração central do pipeline de dados do SaneData — Painel de
Priorização em Saneamento & Saúde Pública (PPGECAM).

Alterar os valores abaixo é o único passo necessário para mudar o recorte
geográfico/temporal do painel em uma atualização futura — todos os scripts
numerados (01 a 05) leem deste módulo, nada é hardcoded neles.
"""
from pathlib import Path

# ---------------------------------------------------------------------------
# Recorte da pesquisa
# ---------------------------------------------------------------------------
UF_SIGLA = "PE"          # sigla de duas letras (IBGE)
UF_CODIGO_IBGE = 26      # código numérico da UF (IBGE)
ANO_INICIO = 2015
ANO_FIM = 2024           # inclusive

# Códigos de agravo no SINAN (ver https://portalsinan.saude.gov.br)
SINAN_AGRAVOS = {
    "taxaDengue": "DENG",
    "taxaChikungunya": "CHIK",
}

# Faixa de CID-10 usada como proxy de "diarreia aguda" nas internações do
# SIH-SUS (Cap. I — Algumas doenças infecciosas e parasitárias, A00-A09:
# "Doenças infecciosas intestinais"). O SINAN só notifica SURTOS de doença
# diarreica aguda (não casos individuais rotineiros), por isso não serve
# como indicador anual comparável entre municípios — ver data/scripts/README.md.
CID_DIARREIA_AGUDA_PREFIXOS = tuple(f"A0{d}" for d in range(0, 10))  # A00..A09

# Indicadores de déficit de saneamento (SINISA/SNIS), calculados como
# déficit = 100 - cobertura(%). Ver data/scripts/04_sinisa_saneamento.py.
INDICADORES_DEFICIT = ["deficitAgua", "deficitEsgoto", "deficitResiduos"]
INDICADORES_SAUDE = ["taxaDengue", "taxaChikungunya", "taxaDiarreia"]

# ---------------------------------------------------------------------------
# Caminhos
# ---------------------------------------------------------------------------
SCRIPTS_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPTS_DIR.parent
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"

RAW_IBGE_DIR = RAW_DIR / "ibge"
RAW_SINAN_DIR = RAW_DIR / "sinan"
RAW_SIH_DIR = RAW_DIR / "sih"
RAW_SINISA_DIR = RAW_DIR / "sinisa"

for d in (RAW_IBGE_DIR, RAW_SINAN_DIR, RAW_SIH_DIR, RAW_SINISA_DIR, PROCESSED_DIR):
    d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Rede
# ---------------------------------------------------------------------------
DATASUS_FTP_HOST = "ftp.datasus.gov.br"
IBGE_LOCALIDADES_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios"
IBGE_SIDRA_POPULACAO_URL = (
    "https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/{periodos}"
    "/variaveis/9324?localidades=N6[N3[{uf_codigo}]]"
)
# Malha territorial (polígonos dos municípios) — API de Malhas do IBGE.
# qualidade=intermediaria: bom compromisso entre nitidez visual e tamanho de
# arquivo (~220 KB para os 185 municípios de PE), suficiente para um mapa
# em tela (não para uso cartográfico de precisão).
IBGE_MALHA_URL = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/{uf_codigo}"
    "?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=intermediaria"
)
# Código IBGE do município de Fernando de Noronha (distrito estadual de PE,
# ~350 km da costa) — tratado à parte no mapa (ver js/geo.js), pois incluí-lo
# na projeção principal encolheria o continente para um ponto minúsculo.
CODIGO_IBGE_FERNANDO_DE_NORONHA = 2605459
