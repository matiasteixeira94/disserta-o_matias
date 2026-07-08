"""
03 — Internações por diarreia aguda / doenças infecciosas intestinais (SIH-SUS)

Por que SIH e não SINAN para "diarreia aguda"?
  O SINAN só recebe notificação de SURTOS de doença diarreica aguda
  (Portaria GM/MS nº 204/2016), não de casos individuais de rotina — não
  existe uma série anual de "casos de diarreia" por município no SINAN
  comparável a dengue/chikungunya. A fonte oficial com cobertura nacional,
  anual e por município para esse desfecho é o SIH-SUS (Sistema de
  Informações Hospitalares do SUS): contamos as internações cujo
  diagnóstico principal (CID-10) está no capítulo "Doenças infecciosas
  intestinais" (A00-A09), como proxy da carga de diarreia aguda associada a
  saneamento — abordagem padrão na literatura de saúde ambiental.
  Ver config.CID_DIARREIA_AGUDA_PREFIXOS.

Fonte oficial (FTP público, sem autenticação), já recortada por UF:
  ftp://ftp.datasus.gov.br/dissemin/publicos/SIHSUS/200801_/Dados/
  Arquivos "RD<UF><AA><MM>.dbc" (AIH reduzida), um arquivo por UF/mês.

Gera:
  data/raw/sih/RD<UF><AA><MM>.dbc              (cache do download original)
  data/processed/saude_internacoes_dda_pe.csv  (codigo_ibge, ano, internacoes — só município/ano com >=1 internação)
  data/processed/saude_cobertura_pe.csv        (indicador="taxaDiarreia", ano — só anos com os 12 meses baixados)

Um ano só entra na cobertura se os 12 meses foram baixados com sucesso —
isso evita registrar "zero internações" para um ano na verdade incompleto
(ver nota equivalente em 02_sinan_saude.py sobre a diferença entre "zero"
e "sem dado").
"""
import pandas as pd

from config import (
    ANO_FIM,
    ANO_INICIO,
    CID_DIARREIA_AGUDA_PREFIXOS,
    PROCESSED_DIR,
    RAW_SIH_DIR,
    UF_SIGLA,
)
from lib.datasus import dbc_to_dataframe, ftp_connect, ftp_download

SIH_REMOTE_DIR = "/dissemin/publicos/SIHSUS/200801_/Dados"
COLUNAS_NECESSARIAS = ["MUNIC_RES", "DIAG_PRINC"]


def eh_diarreia_aguda(cid: str) -> bool:
    if not isinstance(cid, str):
        return False
    return cid.strip().upper().startswith(CID_DIARREIA_AGUDA_PREFIXOS)


def baixar_mes(ano: int, mes: int, conexao: dict) -> tuple[bool, pd.DataFrame]:
    """`conexao` é um dict mutável com a chave "ftp" — permite reconectar
    (uma conexão FTP ociosa por muito tempo pode cair no meio de uma rodada
    de ~120 arquivos) sem precisar reabrir uma conexão por arquivo."""
    aa = f"{ano % 100:02d}"
    mm = f"{mes:02d}"
    filename = f"RD{UF_SIGLA}{aa}{mm}.dbc"
    dest = RAW_SIH_DIR / filename
    try:
        ftp_download(SIH_REMOTE_DIR, filename, dest, quiet=True, ftp=conexao["ftp"])
    except Exception as exc:
        print(f"  aviso: falha em {filename} ({exc}); reconectando e tentando de novo")
        try:
            conexao["ftp"] = ftp_connect()
            ftp_download(SIH_REMOTE_DIR, filename, dest, quiet=True, ftp=conexao["ftp"])
        except Exception as exc2:
            print(f"  aviso: não foi possível baixar {filename} ({exc2}); pulando")
            return False, pd.DataFrame(columns=COLUNAS_NECESSARIAS)

    df = dbc_to_dataframe(dest, columns=COLUNAS_NECESSARIAS)
    return True, df


def main():
    registros = []
    cobertura = []
    conexao = {"ftp": ftp_connect()}
    for ano in range(ANO_INICIO, ANO_FIM + 1):
        total_ano = 0
        meses_ok = 0
        for mes in range(1, 13):
            sucesso, df = baixar_mes(ano, mes, conexao)
            meses_ok += int(sucesso)
            if df.empty:
                continue
            df = df[df["DIAG_PRINC"].apply(eh_diarreia_aguda)]
            total_ano += len(df)
            if not df.empty:
                contagem = df.groupby("MUNIC_RES").size().reset_index(name="internacoes")
                contagem["ano"] = ano
                registros.append(contagem)
        completo = meses_ok == 12
        if completo:
            cobertura.append({"indicador": "taxaDiarreia", "ano": ano})
        sufixo = '' if completo else ' — ANO INCOMPLETO, não entra na cobertura'
        print(f"[SIH] {ano}: {total_ano} internações por doença infecciosa intestinal (A00-A09) em {UF_SIGLA} ({meses_ok}/12 meses baixados{sufixo})")

    try:
        conexao["ftp"].quit()
    except Exception:
        pass

    pd.DataFrame(cobertura).to_csv(PROCESSED_DIR / "saude_cobertura_diarreia_pe.csv", index=False, encoding="utf-8")

    if not registros:
        print("Nenhum registro processado — verifique a conexão com o FTP do DATASUS.")
        return

    resultado = pd.concat(registros, ignore_index=True)
    resultado["MUNIC_RES"] = pd.to_numeric(resultado["MUNIC_RES"], errors="coerce")
    resultado = resultado.groupby(["MUNIC_RES", "ano"], as_index=False)["internacoes"].sum()
    resultado = resultado.rename(columns={"MUNIC_RES": "codigo_ibge_6"})
    resultado["codigo_ibge_6"] = resultado["codigo_ibge_6"].astype("Int64")

    municipios = pd.read_csv(PROCESSED_DIR / "municipios_pe.csv")[["codigo_ibge"]].drop_duplicates()
    municipios["codigo_ibge_6"] = (municipios["codigo_ibge"] // 10).astype(int)
    resultado = resultado.merge(municipios, on="codigo_ibge_6", how="left").drop(columns=["codigo_ibge_6"])

    out_path = PROCESSED_DIR / "saude_internacoes_dda_pe.csv"
    resultado.to_csv(out_path, index=False, encoding="utf-8")
    print(f"OK: {out_path} ({len(resultado)} linhas), cobertura em saude_cobertura_diarreia_pe.csv ({len(cobertura)} anos completos)")


if __name__ == "__main__":
    main()
