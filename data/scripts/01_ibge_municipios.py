"""
01 — Municípios e população (IBGE)

Fontes oficiais, sem chave de API necessária:
  * API de Localidades do IBGE — lista de municípios da UF, com código IBGE
    de 7 dígitos: https://servicodados.ibge.gov.br/api/docs/localidades
  * API SIDRA (agregado 6579 — "População residente estimada", variável
    9324) — série anual de população por município:
    https://sidra.ibge.gov.br/tabela/6579

A própria API de Localidades já retorna a mesorregião oficial do IBGE de
cada município (`microrregiao.mesorregiao`) — não é uma chamada extra, só
não estava sendo extraída da resposta que o pipeline já baixa. Usada pelo
front-end para agrupar/comparar municípios por região (Agreste, Sertão,
Mata, São Francisco, Metropolitana de Recife).

Gera:
  data/raw/ibge/municipios_<uf>.json        (resposta crua da API de localidades)
  data/raw/ibge/populacao_<uf>.json         (resposta crua da API SIDRA)
  data/processed/municipios_pe.csv          (código IBGE, nome, mesorregião, população por ano)

A série do SIDRA tem lacunas nos anos de Censo (ex.: 2022) — nesses anos o
IBGE não publica estimativa nesta tabela. As lacunas dentro do intervalo
configurado são preenchidas por interpolação linear entre os anos com dado
oficial (e por preenchimento para frente/trás nas pontas da série), o que é
prática demográfica padrão — não é um valor inventado, é uma estimativa
derivada de pontos reais adjacentes. Isso fica registrado na coluna
`pop_interpolada`.
"""
import json

import pandas as pd
import requests

from config import (
    ANO_FIM,
    ANO_INICIO,
    IBGE_LOCALIDADES_URL,
    IBGE_SIDRA_POPULACAO_URL,
    PROCESSED_DIR,
    RAW_IBGE_DIR,
    UF_CODIGO_IBGE,
    UF_SIGLA,
)

HEADERS = {"User-Agent": "painel-priorizacao-ppgecam/1.0"}


def baixar_municipios() -> list[dict]:
    url = IBGE_LOCALIDADES_URL.format(uf=UF_SIGLA)
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    municipios = resp.json()
    (RAW_IBGE_DIR / f"municipios_{UF_SIGLA.lower()}.json").write_text(
        json.dumps(municipios, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  {len(municipios)} municípios de {UF_SIGLA} obtidos da API de Localidades")
    return municipios


def baixar_populacao() -> dict:
    anos = "|".join(str(a) for a in range(ANO_INICIO, ANO_FIM + 1))
    url = IBGE_SIDRA_POPULACAO_URL.format(periodos=anos, uf_codigo=UF_CODIGO_IBGE)
    resp = requests.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    payload = resp.json()
    (RAW_IBGE_DIR / f"populacao_{UF_SIGLA.lower()}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return payload


def montar_tabela(municipios: list[dict], populacao_payload: dict) -> pd.DataFrame:
    nomes = {m["id"]: m["nome"] for m in municipios}
    mesorregioes = {
        m["id"]: (m["microrregiao"]["mesorregiao"]["id"], m["microrregiao"]["mesorregiao"]["nome"])
        for m in municipios
    }

    series_por_municipio = {}
    for resultado in populacao_payload[0]["resultados"][0]["series"]:
        cod = int(resultado["localidade"]["id"])
        series_por_municipio[cod] = {int(ano): valor for ano, valor in resultado["serie"].items()}

    linhas = []
    for cod, nome in nomes.items():
        serie = series_por_municipio.get(cod, {})
        mesorregiao_id, mesorregiao_nome = mesorregioes[cod]
        for ano in range(ANO_INICIO, ANO_FIM + 1):
            valor = serie.get(ano)
            populacao = None
            if valor not in (None, "-", "..", "...", "X"):
                try:
                    populacao = int(valor)
                except (TypeError, ValueError):
                    populacao = None
            linhas.append({
                "codigo_ibge": cod, "municipio": nome, "ano": ano, "populacao": populacao,
                "mesorregiao_id": mesorregiao_id, "mesorregiao": mesorregiao_nome,
            })

    df = pd.DataFrame(linhas).sort_values(["codigo_ibge", "ano"])

    # Interpola lacunas (ex.: anos de Censo) por município, usando só os
    # pontos reais disponíveis da própria série; marca o que foi interpolado.
    df["pop_interpolada"] = False
    partes = []
    for cod, grupo in df.groupby("codigo_ibge", sort=False):
        grupo = grupo.set_index("ano")
        faltando_antes = grupo["populacao"].isna()
        grupo["populacao"] = grupo["populacao"].interpolate(method="linear", limit_direction="both")
        grupo["populacao"] = grupo["populacao"].round().astype("Int64")
        grupo.loc[faltando_antes, "pop_interpolada"] = True
        partes.append(grupo.reset_index())
    return pd.concat(partes, ignore_index=True).sort_values(["municipio", "ano"])


def main():
    print(f"Baixando municípios de {UF_SIGLA} (IBGE Localidades)...")
    municipios = baixar_municipios()
    print("Baixando série de população estimada (IBGE SIDRA, agregado 6579)...")
    populacao_payload = baixar_populacao()
    df = montar_tabela(municipios, populacao_payload)

    out_path = PROCESSED_DIR / f"municipios_{UF_SIGLA.lower()}.csv"
    df.to_csv(out_path, index=False, encoding="utf-8")
    print(f"OK: {out_path} ({len(df)} linhas, {df['codigo_ibge'].nunique()} municípios)")


if __name__ == "__main__":
    main()
