"""
04c — Déficit de esgoto e resíduos sólidos via o Painel de Indicadores público do SINISA

Quando o 04b foi escrito (2026-07-08), os módulos `esgoto` e `residuos_solidos`
do painel (indicadores-sinisa-2025.cidades.gov.br) foram verificados e:
  - `esgoto` só publicava um indicador (IES0001) que o 04b decidiu NÃO importar,
    por parecer referido a uma base populacional diferente da usada no 04a.
  - `residuos_solidos` estava desabilitado ("Módulos disponíveis em breve" no
    bundle JS da página inicial) — não publicava dado nenhum.

Reverificado em 2026-07-11 (não presumido): os dois módulos agora publicam
dado real para PE:
  - `IES0001` ("Atendimento da população total com rede coletora de esgoto")
    é, na verdade, referido à população TOTAL — a MESMA base do `IAG0001`
    (água) já importado pelo 04b. A ressalva original do 04b era sobre uma
    diferença de base entre IES0001 e o indicador de esgoto do 04a
    (`indice_coleta_esgoto`, referido à população atendida com água) — ou
    seja, o salto de metodologia é entre a fonte antiga (SNIS/04a, até 2022)
    e a nova (SINISA/04c, 2023 em diante), não um problema do IES0001 em si.
  - `IRS0001` ("Cobertura da população total com coleta de resíduos sólidos
    domiciliares") agora existe e é exatamente o indicador que
    `04_sinisa_saneamento.py` (passo manual) já esperava para `deficitResiduos`
    ("taxa de cobertura do serviço de coleta domiciliar"). Antes deste
    script, `deficitResiduos` não tinha NENHUMA fonte automatizada ou manual
    preenchida — era sempre `null`.

Ambos os módulos, como o `agua` do 04b, servem um único snapshot fixo (o
parâmetro `?ano=` não muda o retorno — testado com 2023 e 2024, resultado
idêntico) — o ano-base é o mesmo texto ("dados do ano base 2023") da página
inicial usado pelo 04b. Não há como obter 2024 ou 2025 por aqui: o próximo
ciclo do SINISA ainda não foi publicado neste portal (verificado nesta data;
repita esta checagem futuramente).

Faz merge com data/processed/saneamento_pe.csv preenchendo só onde ainda
está nulo (mesma regra do 04a/04b) — nunca sobrescreve um valor já
importado por outra fonte.

Gera/atualiza:
  data/processed/saneamento_pe.csv   (codigo_ibge, ano, deficitAgua, deficitEsgoto, deficitResiduos)
"""
import re
import sys

import pandas as pd
import requests

from config import PROCESSED_DIR, UF_CODIGO_IBGE

BASE_URL = "https://indicadores-sinisa-2025.cidades.gov.br"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
}


def extrair_data_page(html: str) -> dict:
    m = re.search(r'data-page="([^"]*)"', html)
    if not m:
        raise RuntimeError("Não encontrei o atributo data-page (Inertia.js) na resposta — o portal pode ter mudado de estrutura.")
    import html as html_mod
    import json
    return json.loads(html_mod.unescape(m.group(1)))


def descobrir_ano_base(sessao: requests.Session) -> int:
    resp = sessao.get(f"{BASE_URL}/build/assets/Welcome-DgZM6Owz.js", timeout=30)
    if resp.status_code != 200:
        home = sessao.get(BASE_URL, timeout=30).text
        m = re.search(r'assets/(Welcome-[\w]+\.js)', home)
        if not m:
            raise RuntimeError("Não encontrei o bundle da página inicial para extrair o ano-base.")
        resp = sessao.get(f"{BASE_URL}/build/assets/{m.group(1)}", timeout=30)
        resp.raise_for_status()
    m = re.search(r"ano\s+base\s+(\d{4})", resp.text)
    if not m:
        raise RuntimeError(
            "Não consegui extrair o ano-base do texto da página inicial do SINISA "
            "(o texto pode ter mudado) — rode manualmente e ajuste a regex em descobrir_ano_base()."
        )
    return int(m.group(1))


def buscar_indicador(sessao: requests.Session, modulo: str, campo: str, coluna_saida: str) -> pd.DataFrame:
    resp = sessao.get(f"{BASE_URL}/dashboard", params={"modulo": modulo}, timeout=60)
    resp.raise_for_status()
    page = extrair_data_page(resp.text)
    indicadores = page["props"]["indicadores"]

    prefixo_uf = str(UF_CODIGO_IBGE)
    linhas = []
    for row in indicadores:
        cod = str(row.get("Cod_IBGE", ""))
        if len(cod) != 7 or not cod.startswith(prefixo_uf):
            continue
        valor_bruto = row.get(campo)
        if not isinstance(valor_bruto, str) or ("," not in valor_bruto and "." not in valor_bruto):
            continue  # "Não calculado (...)" — sem dado real
        try:
            cobertura = float(valor_bruto.replace(".", "").replace(",", "."))
        except ValueError:
            continue
        linhas.append({"codigo_ibge": int(cod), coluna_saida: cobertura})

    return pd.DataFrame(linhas)


def main():
    sessao = requests.Session()
    sessao.headers.update(HEADERS)
    sessao.get(BASE_URL, timeout=30).raise_for_status()

    ano = descobrir_ano_base(sessao)
    print(f"Ano-base identificado no portal SINISA: {ano}")

    cobertura_esgoto = buscar_indicador(sessao, "esgoto", "IES0001", "cobertura_esgoto")
    cobertura_residuos = buscar_indicador(sessao, "residuos_solidos", "IRS0001", "cobertura_residuos")

    if cobertura_esgoto.empty and cobertura_residuos.empty:
        print("Nenhum indicador de esgoto ou resíduos retornado para PE — abortando sem alterar saneamento_pe.csv.", file=sys.stderr)
        sys.exit(1)

    novo = cobertura_esgoto.merge(cobertura_residuos, on="codigo_ibge", how="outer")
    novo["ano"] = ano
    if "cobertura_esgoto" in novo.columns:
        novo["deficitEsgoto"] = (100 - novo["cobertura_esgoto"]).clip(lower=0, upper=100)
    if "cobertura_residuos" in novo.columns:
        novo["deficitResiduos"] = (100 - novo["cobertura_residuos"]).clip(lower=0, upper=100)
    novo = novo[["codigo_ibge", "ano"] + [c for c in ("deficitEsgoto", "deficitResiduos") if c in novo.columns]]

    out_path = PROCESSED_DIR / "saneamento_pe.csv"
    existente = pd.read_csv(out_path)
    combinado = existente.merge(novo, on=["codigo_ibge", "ano"], how="outer", suffixes=("", "_novo"))
    for col in ("deficitEsgoto", "deficitResiduos"):
        col_novo = f"{col}_novo"
        if col_novo in combinado.columns:
            if col not in combinado.columns:
                combinado[col] = pd.NA
            combinado[col] = combinado[col].where(combinado[col].notna(), combinado[col_novo])
            combinado = combinado.drop(columns=[col_novo])
    if "deficitAgua" not in combinado.columns:
        combinado["deficitAgua"] = pd.NA

    saida = combinado[["codigo_ibge", "ano", "deficitAgua", "deficitEsgoto", "deficitResiduos"]]
    saida = saida.sort_values(["codigo_ibge", "ano"])
    saida.to_csv(out_path, index=False, encoding="utf-8")
    print(
        f"OK: {out_path} ({len(cobertura_esgoto)} municípios de PE com deficitEsgoto {ano} e "
        f"{len(cobertura_residuos)} com deficitResiduos {ano} vindos do painel público do SINISA)"
    )


if __name__ == "__main__":
    main()
