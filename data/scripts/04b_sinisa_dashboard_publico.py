"""
04b — Déficit de água via o Painel de Indicadores público do SINISA

Complemento automatizado ao passo manual 04_sinisa_saneamento.py e ao 04a
(Base dos Dados/BigQuery, que só cobre até 2022): o novo Painel de
Indicadores do SINISA (indicadores-sinisa-2025.cidades.gov.br, sucessor do
antigo app de Série Histórica) expõe, na própria rota pública
`/dashboard?modulo=agua` (sem login, sem token — confirmado com curl puro),
os indicadores já agregados por município embutidos no HTML da página
(payload Inertia.js no atributo `data-page`), incluindo `IAG0001`
("Atendimento da população total com rede de abastecimento de água") — o
mesmo conceito do indicador SNIS IN023 usado no 04a.

Verificado antes de escrever este script (não presumido):
  - Só o módulo água (`modulo=agua`) publica um indicador de atendimento
    referido à população TOTAL, comparável ao `indice_atendimento_total_agua`
    do 04a. O módulo esgoto (`modulo=esgoto`) só publica atendimento
    referido à população total também (`IES0001`), mas essa é uma base
    DIFERENTE da usada no 04a para esgoto (`indice_coleta_esgoto`, que é
    referido à população atendida com água) — misturar as duas na mesma
    coluna `deficitEsgoto` criaria uma quebra metodológica não documentada
    dentro de uma única série temporal. Por isso este script só importa
    água; esgoto por este canal fica para um trabalho futuro que assuma
    explicitamente essa mudança de definição (ou split em duas colunas).
  - O módulo resíduos sólidos (`modulo=residuos_solidos`) existe no código
    do front-end do painel (`Welcome-*.js`), mas está marcado como
    desabilitado ("Módulos disponíveis em breve") — não publica dado
    nenhum ainda, então continua exigindo o passo manual 04 quando/se for
    disponibilizado.
  - O JSON embutido não expõe o ano-base dos dados como campo numérico
    (o prop `anoReferencia` parece ser o ano do CICLO de coleta, não o
    ano-base dos dados). O ano-base real vem só do texto descritivo da
    página inicial ("dados do ano base <AAAA>") — este script extrai esse
    ano desse texto em vez de fixá-lo no código, para continuar correto
    quando o SINISA publicar um novo ciclo. Caso o texto mude de formato e
    o ano não seja encontrado, o script para com erro em vez de adivinhar.
  - Possível quebra de nível na transição 2022 (SNIS/Base dos Dados) →
    2023 (SINISA/painel público): comparado a um município de amostra, o
    valor de 2023 aqui é bem diferente do de 2022 já importado via 04a.
    Isso é consistente com a descontinuação do SNIS e sucessão pelo SINISA
    em 2024 (mudança institucional/metodológica documentada publicamente,
    não um erro deste script) — mas quem for interpretar a série completa
    2015-2024 deve tratar o salto 2022→2023 como um possível efeito de
    mudança de metodologia de coleta, não necessariamente uma melhora ou
    piora real da cobertura.

Junta (merge) com data/processed/saneamento_pe.csv, preenchendo só onde
ainda está nulo — nunca sobrescreve um valor já importado por outra fonte
(mesma regra do 04a).

Gera/atualiza:
  data/processed/saneamento_pe.csv   (codigo_ibge, ano, deficitAgua, deficitEsgoto, deficitResiduos)
"""
import re
import sys

import pandas as pd
import requests

from config import PROCESSED_DIR, UF_CODIGO_IBGE

BASE_URL = "https://indicadores-sinisa-2025.cidades.gov.br"
# o WAF na frente do portal retorna 500 para um User-Agent genérico/customizado
# sem os cabeçalhos de navegador que normalmente o acompanham — precisa parecer
# um navegador real para uma requisição de dado público simples não ser barrada.
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


def descobrir_ano_base() -> int:
    """O ano-base só aparece como texto na página inicial ("...dados do ano
    base <AAAA>"), embutido no bundle JS da Welcome page — não como campo
    estruturado. Extrai de lá em vez de fixar no código."""
    resp = requests.get(f"{BASE_URL}/build/assets/Welcome-DgZM6Owz.js", headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        # o hash do arquivo pode mudar num novo deploy do portal; tenta descobrir o nome atual
        home = requests.get(BASE_URL, headers=HEADERS, timeout=30).text
        m = re.search(r'assets/(Welcome-[\w]+\.js)', home)
        if not m:
            raise RuntimeError("Não encontrei o bundle da página inicial para extrair o ano-base.")
        resp = requests.get(f"{BASE_URL}/build/assets/{m.group(1)}", headers=HEADERS, timeout=30)
        resp.raise_for_status()
    m = re.search(r"ano\s+base\s+(\d{4})", resp.text)  # o site usa \xa0 (espaço não separável) entre as palavras
    if not m:
        raise RuntimeError(
            "Não consegui extrair o ano-base do texto da página inicial do SINISA "
            "(o texto pode ter mudado) — rode manualmente e ajuste a regex em descobrir_ano_base()."
        )
    return int(m.group(1))


def buscar_indicadores_agua() -> pd.DataFrame:
    # a rota /dashboard exige um cookie de sessão já iniciado (mesmo sem
    # login) — uma requisição direta sem visitar "/" antes retorna 500.
    sessao = requests.Session()
    sessao.headers.update(HEADERS)
    sessao.get(BASE_URL, timeout=30).raise_for_status()
    resp = sessao.get(f"{BASE_URL}/dashboard", params={"modulo": "agua"}, timeout=60)
    resp.raise_for_status()
    page = extrair_data_page(resp.text)
    indicadores = page["props"]["indicadores"]

    prefixo_uf = str(UF_CODIGO_IBGE)
    linhas = []
    for row in indicadores:
        cod = str(row.get("Cod_IBGE", ""))
        if len(cod) != 7 or not cod.startswith(prefixo_uf):
            continue  # BR, região e estado vêm agregados no mesmo array — só município de PE interessa
        valor_bruto = row.get("IAG0001")
        if not isinstance(valor_bruto, str) or "," not in valor_bruto and "." not in valor_bruto:
            continue  # "Não calculado (...)" — sem dado real, fica de fora (não confundir com 0)
        try:
            cobertura = float(valor_bruto.replace(".", "").replace(",", "."))
        except ValueError:
            continue
        linhas.append({"codigo_ibge": int(cod), "cobertura_agua": cobertura})

    return pd.DataFrame(linhas)


def main():
    ano = descobrir_ano_base()
    print(f"Ano-base identificado no portal SINISA: {ano}")

    novo = buscar_indicadores_agua()
    if novo.empty:
        print("Nenhum indicador de água retornado para PE — abortando sem alterar saneamento_pe.csv.", file=sys.stderr)
        sys.exit(1)

    novo["ano"] = ano
    novo["deficitAgua"] = (100 - novo["cobertura_agua"]).clip(lower=0, upper=100)
    novo = novo[["codigo_ibge", "ano", "deficitAgua"]]

    out_path = PROCESSED_DIR / "saneamento_pe.csv"
    if out_path.exists():
        existente = pd.read_csv(out_path)
        combinado = existente.merge(novo, on=["codigo_ibge", "ano"], how="outer", suffixes=("", "_novo"))
        if "deficitAgua_novo" in combinado.columns:
            combinado["deficitAgua"] = combinado["deficitAgua"].where(combinado["deficitAgua"].notna(), combinado["deficitAgua_novo"])
            combinado = combinado.drop(columns=["deficitAgua_novo"])
        for col in ("deficitEsgoto", "deficitResiduos"):
            if col not in combinado.columns:
                combinado[col] = pd.NA
        saida = combinado
    else:
        novo["deficitEsgoto"] = pd.NA
        novo["deficitResiduos"] = pd.NA
        saida = novo

    saida = saida[["codigo_ibge", "ano", "deficitAgua", "deficitEsgoto", "deficitResiduos"]]
    saida = saida.sort_values(["codigo_ibge", "ano"])
    saida.to_csv(out_path, index=False, encoding="utf-8")
    print(f"OK: {out_path} ({len(novo)} municípios de PE com deficitAgua {ano} vindos do painel público do SINISA)")


if __name__ == "__main__":
    main()
