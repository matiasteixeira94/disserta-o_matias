"""
04a — Déficit de água e esgoto via Base dos Dados (BigQuery)

Complemento automatizado ao passo manual 04_sinisa_saneamento.py: a Base
dos Dados (basedosdados.org) mantém uma cópia tratada da série histórica
do SNIS em BigQuery, tabela `basedosdados.br_mdr_snis.municipio_agua_esgoto`,
cobrindo 1995-2022 — sem precisar do formulário manual do portal do
Ministério das Cidades.

Limitações verificadas antes de escrever este script (não presumidas):
  - A tabela só existe para água/esgoto. Não há tabela de resíduos sólidos
    na Base dos Dados (confirmado consultando o dataset br_mdr_snis inteiro
    e o repositório de modelos github.com/basedosdados/queries-basedosdados)
    — deficitResiduos continua exigindo o passo manual do 04_sinisa_saneamento.py.
  - A série da Base dos Dados vai só até 2022 (o SNIS foi descontinuado e
    sucedido pelo SINISA em 2024) — os anos 2023-2024 de água/esgoto também
    continuam exigindo o passo manual.
  - Não existe uma coluna "índice de atendimento total de esgoto" pronta
    (só existe para água: `indice_atendimento_total_agua`, IN023). Para
    esgoto usamos `indice_coleta_esgoto`, que é o indicador oficial do SNIS
    para esse componente (IN024-like) — metodologicamente não é idêntico ao
    de água (é referido à população atendida com água, não à população
    total), mas é o mesmo indicador que o Ministério das Cidades publica
    para esgoto. Ver coluna `indicadorEsgotoFonte` seria redundante aqui:
    documentado nesta docstring e em data/processed/README.md.

Requer:
  - pacote `basedosdados` (`pip install basedosdados`)
  - um projeto Google Cloud com BigQuery habilitado (nível gratuito/sandbox
    é suficiente, não precisa cartão de cobrança) — passe o project id via
    variável de ambiente BD_BILLING_PROJECT_ID ou argumento --billing-project.
  - login interativo na primeira execução (abre o navegador para autorizar).

Junta (merge) com data/processed/saneamento_pe.csv se o arquivo já existir
(preserva deficitResiduos e quaisquer anos já importados manualmente via
04_sinisa_saneamento.py, em vez de sobrescrever) — nunca apaga dado já
coletado por outra fonte.

Gera/atualiza:
  data/processed/saneamento_pe.csv   (codigo_ibge, ano, deficitAgua, deficitEsgoto, deficitResiduos)
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
  indice_atendimento_total_agua AS cobertura_agua,
  indice_coleta_esgoto AS cobertura_esgoto
FROM `basedosdados.br_mdr_snis.municipio_agua_esgoto`
WHERE sigla_uf = 'PE'
  AND ano BETWEEN @ano_inicio AND @ano_fim
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--billing-project", default=os.environ.get("BD_BILLING_PROJECT_ID"))
    args = parser.parse_args()

    if not args.billing_project:
        print("Sem BD_BILLING_PROJECT_ID / --billing-project configurado — pulando 04a (passo opcional).")
        print("Ver docstring deste script para como configurar um projeto Google Cloud gratuito.")
        sys.exit(0)

    import basedosdados as bd

    bd.config.billing_project_id = args.billing_project

    # a API read_sql da basedosdados não aceita query parameters nomeados,
    # então interpolamos os anos (já validados como int por config.py, sem
    # risco de injeção).
    query = QUERY.replace("@ano_inicio", str(ANO_INICIO)).replace("@ano_fim", str(ANO_FIM))
    print("Consultando basedosdados.br_mdr_snis.municipio_agua_esgoto (BigQuery)...")
    novo = bd.read_sql(query, billing_project_id=args.billing_project)

    novo["codigo_ibge"] = pd.to_numeric(novo["codigo_ibge"], errors="coerce").astype("Int64")
    novo["ano"] = novo["ano"].astype(int)
    novo["deficitAgua"] = (100 - novo["cobertura_agua"]).clip(lower=0, upper=100)
    novo["deficitEsgoto"] = (100 - novo["cobertura_esgoto"]).clip(lower=0, upper=100)
    novo = novo[["codigo_ibge", "ano", "deficitAgua", "deficitEsgoto"]]

    out_path = PROCESSED_DIR / "saneamento_pe.csv"
    if out_path.exists():
        existente = pd.read_csv(out_path)
        # linhas fora do alcance desta consulta (outros anos, ou
        # deficitResiduos já importado manualmente) são preservadas; para
        # (codigo_ibge, ano) em comum, os valores novos de água/esgoto
        # vindos da Base dos Dados só preenchem o que ainda está nulo —
        # não sobrescrevem um valor manual já importado.
        combinado = existente.merge(novo, on=["codigo_ibge", "ano"], how="outer", suffixes=("", "_bd"))
        for col in ("deficitAgua", "deficitEsgoto"):
            col_bd = f"{col}_bd"
            if col_bd in combinado.columns:
                combinado[col] = combinado[col].where(combinado[col].notna(), combinado[col_bd])
                combinado = combinado.drop(columns=[col_bd])
        if "deficitResiduos" not in combinado.columns:
            combinado["deficitResiduos"] = pd.NA
        saida = combinado
    else:
        novo["deficitResiduos"] = pd.NA
        saida = novo

    saida = saida[["codigo_ibge", "ano", "deficitAgua", "deficitEsgoto", "deficitResiduos"]]
    saida = saida.sort_values(["codigo_ibge", "ano"])
    saida.to_csv(out_path, index=False, encoding="utf-8")
    print(f"OK: {out_path} ({len(saida)} linhas, {novo['ano'].min()}-{novo['ano'].max()} de água/esgoto vindos da Base dos Dados)")


if __name__ == "__main__":
    main()
