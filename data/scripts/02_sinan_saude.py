"""
02 — Notificações de dengue e chikungunya (SINAN / DATASUS)

Fonte oficial (FTP público, sem autenticação):
  ftp://ftp.datasus.gov.br/dissemin/publicos/SINAN/DADOS/FINAIS/
  Arquivos "<AGRAVO>BR<AA>.dbc" (ex.: DENGBR24.dbc = dengue, Brasil, 2024),
  um arquivo nacional por agravo/ano — não há recorte por UF no FTP, então
  o filtro por município de residência (`ID_MN_RESI`) é feito localmente
  após o download.

Cada notificação é atribuída ao município de RESIDÊNCIA do paciente
(`ID_MN_RESI`, código IBGE de 6 dígitos — os 6 primeiros dígitos do código
de 7 dígitos usado no restante do pipeline), não ao município onde foi
notificada, para refletir a exposição da população residente.

Gera:
  data/raw/sinan/<AGRAVO>BR<AA>.dbc          (cache do download original)
  data/raw/sinan/<AGRAVO>BR<AA>.dbf          (cache da conversão)
  data/processed/saude_notificacoes_pe.csv   (codigo_ibge, ano, indicador, casos — só combinações com >=1 caso)
  data/processed/saude_cobertura_pe.csv      (indicador, ano — combinações efetivamente baixadas com sucesso)

A ausência de um município numa combinação (indicador, ano) do arquivo de
notificações pode significar "zero casos" (o SINAN é nacional e
obrigatório: se o ano foi baixado com sucesso, todo município sem
notificação teve zero casos) OU "esse ano/agravo não foi baixado ainda".
`saude_cobertura_pe.csv` existe para o script 05 distinguir os dois casos
e não confundir "sem dado" com "zero" (ou vice-versa).
"""
import pandas as pd

from config import (
    ANO_FIM,
    ANO_INICIO,
    PROCESSED_DIR,
    RAW_SINAN_DIR,
    SINAN_AGRAVOS,
)
from lib.datasus import dbc_to_dataframe, ftp_download

SINAN_REMOTE_DIR = "/dissemin/publicos/SINAN/DADOS/FINAIS"
COLUNAS_NECESSARIAS = ["ID_MN_RESI", "NU_ANO"]


def municipios_pe() -> set[int]:
    df = pd.read_csv(PROCESSED_DIR / "municipios_pe.csv")
    # ID_MN_RESI no SINAN usa 6 dígitos (sem o dígito verificador do código de 7 dígitos do IBGE)
    return set((df["codigo_ibge"] // 10).astype(int).unique())


def baixar_e_filtrar(agravo_codigo: str, ano: int, codigos_pe: set[int]) -> tuple[bool, pd.DataFrame]:
    aa = f"{ano % 100:02d}"
    filename = f"{agravo_codigo}BR{aa}.dbc"
    dest = RAW_SINAN_DIR / filename
    try:
        ftp_download(SINAN_REMOTE_DIR, filename, dest)
    except Exception as exc:  # arquivo do ano pode não existir ainda (ex.: ano corrente)
        print(f"  aviso: não foi possível baixar {filename} ({exc}); pulando")
        return False, pd.DataFrame(columns=COLUNAS_NECESSARIAS)

    df = dbc_to_dataframe(dest, columns=COLUNAS_NECESSARIAS)
    if df.empty:
        return True, df
    df["ID_MN_RESI"] = pd.to_numeric(df["ID_MN_RESI"], errors="coerce")
    df = df[df["ID_MN_RESI"].isin(codigos_pe)]
    return True, df


def main():
    codigos_pe = municipios_pe()
    print(f"{len(codigos_pe)} municípios de PE (códigos de 6 dígitos) para filtrar")

    registros = []
    cobertura = []
    for indicador, agravo_codigo in SINAN_AGRAVOS.items():
        for ano in range(ANO_INICIO, ANO_FIM + 1):
            print(f"[{indicador}] ano {ano}...")
            sucesso, df = baixar_e_filtrar(agravo_codigo, ano, codigos_pe)
            if sucesso:
                cobertura.append({"indicador": indicador, "ano": ano})
            if df.empty:
                continue
            contagem = df.groupby("ID_MN_RESI").size().reset_index(name="casos")
            contagem["codigo_ibge_6"] = contagem["ID_MN_RESI"].astype(int)
            contagem["ano"] = ano
            contagem["indicador"] = indicador
            registros.append(contagem[["codigo_ibge_6", "ano", "indicador", "casos"]])

    pd.DataFrame(cobertura).to_csv(PROCESSED_DIR / "saude_cobertura_pe.csv", index=False, encoding="utf-8")

    if not registros:
        print("Nenhum registro baixado — verifique a conexão com o FTP do DATASUS.")
        return

    resultado = pd.concat(registros, ignore_index=True)

    # recupera o código IBGE de 7 dígitos a partir do de 6 (join com municipios_pe.csv)
    municipios = pd.read_csv(PROCESSED_DIR / "municipios_pe.csv")[["codigo_ibge"]].drop_duplicates()
    municipios["codigo_ibge_6"] = (municipios["codigo_ibge"] // 10).astype(int)
    resultado = resultado.merge(municipios, on="codigo_ibge_6", how="left").drop(columns=["codigo_ibge_6"])

    out_path = PROCESSED_DIR / "saude_notificacoes_pe.csv"
    resultado.to_csv(out_path, index=False, encoding="utf-8")
    print(f"OK: {out_path} ({len(resultado)} linhas), cobertura em saude_cobertura_pe.csv ({len(cobertura)} combinações indicador/ano)")


if __name__ == "__main__":
    main()
