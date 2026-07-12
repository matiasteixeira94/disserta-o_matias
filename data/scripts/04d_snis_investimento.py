"""
04d — Investimento em saneamento (água/esgoto) via Base dos Dados (BigQuery)

Complemento automatizado ao pipeline de saneamento, na mesma linha do
04a_sinisa_basedosdados.py: a tabela
`basedosdados.br_mdr_snis.municipio_agua_esgoto` (a mesma usada em 04a para o
déficit) também traz os indicadores financeiros do SNIS por município,
desagregados por entidade executora:
  - FN033 `investimento_total_prestador` — investido pelo prestador de serviço
  - FN048 `investimento_total_municipio` — investido pelo município
  - FN058 `investimento_total_estado`    — investido pelo estado

Confirmado direto no schema.yml do repositório
github.com/basedosdados/queries-basedosdados antes de escrever este script
(não presumido).

Limitações (as mesmas do 04a, mesma tabela/fonte):
  - Só cobre água e esgoto — não há indicador financeiro de resíduos sólidos
    nesta tabela nem em nenhuma outra do dataset br_mdr_snis.
  - Só vai até 2022 (SNIS foi descontinuado e sucedido pelo SINISA em 2024) —
    não há passo manual equivalente ao 04_sinisa_saneamento.py para preencher
    2023-2024 de investimento, então esses anos ficam `null` no painel final.
  - Valores em R$ nominais, sem correção monetária (mesma unidade publicada
    pelo SNIS/Ministério das Cidades) — comparar valores de anos diferentes
    sem deflacionar é uma limitação metodológica a documentar na tese, não
    deste script corrigir.

Requer:
  - pacote `basedosdados` (`pip install basedosdados`)
  - um projeto Google Cloud com BigQuery habilitado (nível gratuito/sandbox é
    suficiente) — passe o project id via variável de ambiente
    BD_BILLING_PROJECT_ID ou argumento --billing-project.
  - login interativo na primeira execução (abre o navegador para autorizar).

Gera:
  data/processed/investimento_saneamento_pe.csv
  (codigo_ibge, ano, investimentoPrestador, investimentoMunicipio, investimentoEstado)
"""
import argparse
import os
import sys

import pandas as pd

from config import ANO_FIM, ANO_INICIO, PROCESSED_DIR

QUERY = """
SELECT
  id_municipio AS codigo_ibge,
  ano,
  investimento_total_prestador AS investimentoPrestador,
  investimento_total_municipio AS investimentoMunicipio,
  investimento_total_estado AS investimentoEstado
FROM `basedosdados.br_mdr_snis.municipio_agua_esgoto`
WHERE sigla_uf = 'PE'
  AND ano BETWEEN @ano_inicio AND @ano_fim
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--billing-project", default=os.environ.get("BD_BILLING_PROJECT_ID"))
    args = parser.parse_args()

    if not args.billing_project:
        print("Sem BD_BILLING_PROJECT_ID / --billing-project configurado — pulando 04d (passo opcional).")
        print("Ver docstring deste script para como configurar um projeto Google Cloud gratuito.")
        sys.exit(0)

    import basedosdados as bd

    bd.config.billing_project_id = args.billing_project

    # a API read_sql da basedosdados não aceita query parameters nomeados,
    # então interpolamos os anos (já validados como int por config.py, sem
    # risco de injeção).
    query = QUERY.replace("@ano_inicio", str(ANO_INICIO)).replace("@ano_fim", str(ANO_FIM))
    print("Consultando basedosdados.br_mdr_snis.municipio_agua_esgoto (BigQuery) — colunas de investimento...")
    novo = bd.read_sql(query, billing_project_id=args.billing_project)

    novo["codigo_ibge"] = pd.to_numeric(novo["codigo_ibge"], errors="coerce").astype("Int64")
    novo["ano"] = novo["ano"].astype(int)
    novo = novo[["codigo_ibge", "ano", "investimentoPrestador", "investimentoMunicipio", "investimentoEstado"]]
    novo = novo.sort_values(["codigo_ibge", "ano"])

    out_path = PROCESSED_DIR / "investimento_saneamento_pe.csv"
    novo.to_csv(out_path, index=False, encoding="utf-8")
    print(f"OK: {out_path} ({len(novo)} linhas, {novo['ano'].min()}-{novo['ano'].max()})")


if __name__ == "__main__":
    main()
