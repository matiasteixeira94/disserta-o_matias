"""
04 — Déficit de saneamento (SINISA / SNIS)

Diferente de IBGE e DATASUS, o SINISA (que sucedeu o SNIS em 2024) NÃO tem
uma API pública de download em massa: os dados são liberados por um
aplicativo web de consulta (Série Histórica do SNIS) e por um painel de
indicadores (SINISA), ambos sem endpoint JSON documentado para consulta
automatizada — só interface de formulário/exportação manual. Isso foi
verificado diretamente (varredura do bundle JS do painel, portal CKAN de
dados abertos do Ministério das Cidades) antes de decidir por este desenho.

Por isso este é o único elo do pipeline com um passo manual:

  1. Acesse a Série Histórica do SNIS/SINISA:
     https://app4.mdr.gov.br/serieHistorica/
     (ou o painel mais novo: https://indicadores-sinisa-2025.cidades.gov.br/)
  2. Filtre por Estado = Pernambuco (todos os municípios) e pelos anos de
     referência configurados em config.ANO_INICIO..ANO_FIM.
  3. Exporte/baixe a planilha (CSV ou XLSX) com os indicadores de:
       - Água: índice de atendimento (total ou urbano) com rede de água
       - Esgoto: índice de atendimento (total ou urbano) com rede de esgoto
       - Resíduos sólidos: taxa de cobertura do serviço de coleta domiciliar
  4. Salve o(s) arquivo(s) baixado(s) sem renomear em:
       data/raw/sinisa/
  5. Rode este script novamente.

O script tenta reconhecer automaticamente as colunas de código de
município, ano e cobertura (procurando tanto pelos códigos clássicos do
SNIS quanto por pedaços do nome do indicador — ver CAMPOS_COBERTURA
abaixo). Se a planilha baixada usar um nome de coluna diferente do
esperado, ajuste CAMPOS_COBERTURA — o script avisa exatamente quais
colunas não conseguiu casar, com a lista de colunas disponíveis no
arquivo, em vez de silenciosamente gerar déficit errado ou fictício.

Déficit é sempre calculado como: déficit(%) = 100 - cobertura(%).

Gera:
  data/processed/saneamento_pe.csv   (codigo_ibge, ano, deficitAgua, deficitEsgoto, deficitResiduos)
"""
import sys
import unicodedata

import pandas as pd

from config import ANO_FIM, ANO_INICIO, PROCESSED_DIR, RAW_SINISA_DIR

CAMPOS_COBERTURA = {
    "deficitAgua": {
        "codigos": ["AG026", "IN023", "IN055"],
        "trechos_nome": ["atendimento total de agua", "atendimento urbano de agua", "atendimento com rede de agua"],
    },
    "deficitEsgoto": {
        "codigos": ["ES026", "IN056", "IN024"],
        "trechos_nome": ["atendimento total de esgoto", "atendimento urbano de esgoto", "atendimento com rede de esgoto", "coletado"],
    },
    "deficitResiduos": {
        "codigos": ["CO019", "IN015"],
        "trechos_nome": ["cobertura do servico de coleta", "cobertura de coleta domiciliar", "cobertura da coleta"],
    },
}

CAMPOS_MUNICIPIO = ["codigo do municipio", "cod_municipio", "codmunicipio", "codigo_municipio", "codigo ibge", "ibge7", "cod_ibge"]
CAMPOS_ANO = ["ano de referencia", "ano_referencia", "ano"]


def normalizar(texto: str) -> str:
    texto = str(texto).strip().lower()
    texto = "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))
    return texto


def achar_coluna(colunas_normalizadas: dict, candidatos: list[str], por_trecho: bool = False) -> str | None:
    for cand in candidatos:
        cand_norm = normalizar(cand)
        for original, norm in colunas_normalizadas.items():
            if por_trecho:
                if cand_norm in norm:
                    return original
            elif norm == cand_norm:
                return original
    return None


def carregar_planilhas() -> pd.DataFrame:
    arquivos = sorted(list(RAW_SINISA_DIR.glob("*.csv")) + list(RAW_SINISA_DIR.glob("*.xlsx")))
    if not arquivos:
        print("Nenhum arquivo encontrado em data/raw/sinisa/.")
        print("Siga o passo manual descrito no topo deste script (docstring) e rode de novo.")
        sys.exit(0)

    partes = []
    for arq in arquivos:
        print(f"  lendo {arq.name}")
        if arq.suffix == ".csv":
            df = pd.read_csv(arq, sep=None, engine="python", encoding="latin1")
        else:
            df = pd.read_excel(arq)
        partes.append(df)
    return pd.concat(partes, ignore_index=True)


def processar(df: pd.DataFrame) -> pd.DataFrame:
    colunas_norm = {c: normalizar(c) for c in df.columns}

    col_municipio = achar_coluna(colunas_norm, CAMPOS_MUNICIPIO) or achar_coluna(colunas_norm, CAMPOS_MUNICIPIO, por_trecho=True)
    col_ano = achar_coluna(colunas_norm, CAMPOS_ANO) or achar_coluna(colunas_norm, CAMPOS_ANO, por_trecho=True)

    if not col_municipio or not col_ano:
        print("ERRO: não encontrei as colunas de município/ano na planilha.")
        print(f"Colunas disponíveis: {list(df.columns)}")
        print("Ajuste CAMPOS_MUNICIPIO/CAMPOS_ANO no topo do script para os nomes reais.")
        sys.exit(1)

    saida = pd.DataFrame({
        "codigo_ibge": pd.to_numeric(df[col_municipio], errors="coerce"),
        "ano": pd.to_numeric(df[col_ano], errors="coerce"),
    })

    for indicador, spec in CAMPOS_COBERTURA.items():
        col = achar_coluna(colunas_norm, spec["codigos"]) or achar_coluna(colunas_norm, spec["trechos_nome"], por_trecho=True)
        if not col:
            print(f"ERRO: não encontrei coluna de cobertura para '{indicador}'.")
            print(f"Colunas disponíveis: {list(df.columns)}")
            print(f"Ajuste CAMPOS_COBERTURA['{indicador}'] no topo do script.")
            sys.exit(1)
        cobertura = pd.to_numeric(df[col], errors="coerce")
        # normaliza fração (0-1) para percentual (0-100), se for o caso
        if cobertura.max(skipna=True) is not None and cobertura.max(skipna=True) <= 1.0:
            cobertura = cobertura * 100
        saida[indicador] = (100 - cobertura).clip(lower=0, upper=100)

    saida = saida.dropna(subset=["codigo_ibge", "ano"])
    saida["codigo_ibge"] = saida["codigo_ibge"].astype("Int64")
    saida["ano"] = saida["ano"].astype(int)
    saida = saida[(saida["ano"] >= ANO_INICIO) & (saida["ano"] <= ANO_FIM)]
    return saida.sort_values(["codigo_ibge", "ano"])


def main():
    df_bruto = carregar_planilhas()
    saida = processar(df_bruto)
    out_path = PROCESSED_DIR / "saneamento_pe.csv"
    saida.to_csv(out_path, index=False, encoding="utf-8")
    print(f"OK: {out_path} ({len(saida)} linhas)")


if __name__ == "__main__":
    main()
