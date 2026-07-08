"""
Utilitários genéricos para baixar arquivos .dbc do FTP público do DATASUS e
convertê-los em DataFrames pandas.

Notas de implementação:
- As bibliotecas de alto nível do pacote `pysus` (>=2.x e também 1.0.1)
  apresentam um bug de path (mistura "/" e "\\") ao rodar em Windows, que
  quebra tanto o cliente novo (catálogo DuckLake) quanto o cliente antigo
  (varredura recursiva de diretórios do FTP) — por isso este módulo acessa
  o FTP diretamente via `ftplib` e usa apenas `pyreaddbc` (dependência do
  pysus) para descompactar o formato .dbc, que é estável em qualquer SO.
- Todo arquivo baixado é cacheado em disco (data/raw/...): reexecutar os
  scripts não baixa de novo o que já existe, o que é o que torna o pipeline
  seguro para "atualizações futuras" (só baixa o que for novo).
"""
from __future__ import annotations

import ftplib
import struct
from pathlib import Path

import pandas as pd
import pyreaddbc
from dbfread import DBF

from config import DATASUS_FTP_HOST


def ftp_connect() -> ftplib.FTP:
    """Abre uma conexão FTP reutilizável com o DATASUS.

    Reaproveitar uma única conexão para vários downloads (em vez de abrir
    uma por arquivo) importa aqui porque fontes como o SIH-SUS baixam
    dezenas/centenas de arquivos pequenos por rodada (um por UF/mês) — sem
    reaproveitar a conexão, o tempo de login/negociação por arquivo passa a
    dominar o tempo total, especialmente numa atualização futura que baixe
    vários meses de uma vez.
    """
    ftp = ftplib.FTP(DATASUS_FTP_HOST, timeout=60)
    ftp.login()
    ftp.sendcmd("TYPE I")
    return ftp


def ftp_download(remote_dir: str, filename: str, dest_path: Path, *, quiet: bool = False, ftp: ftplib.FTP | None = None) -> Path:
    """Baixa `filename` de `remote_dir` no FTP do DATASUS para `dest_path`.

    Pula o download se o arquivo já existir localmente (cache incremental).
    Se `ftp` for informado, reaproveita essa conexão em vez de abrir uma
    nova (ver `ftp_connect`).
    """
    dest_path = Path(dest_path)
    if dest_path.exists() and dest_path.stat().st_size > 0:
        if not quiet:
            print(f"  [cache] {dest_path.name} já existe, pulando download")
        return dest_path

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = dest_path.with_suffix(dest_path.suffix + ".part")

    conexao_propria = ftp is None
    if conexao_propria:
        ftp = ftp_connect()
    try:
        ftp.cwd(remote_dir)
        if not quiet:
            size = ftp.size(filename)
            print(f"  baixando {filename} ({size/1024/1024:.1f} MB) ...")
        with open(tmp_path, "wb") as fh:
            ftp.retrbinary(f"RETR {filename}", fh.write)
    finally:
        if conexao_propria:
            ftp.quit()

    tmp_path.rename(dest_path)
    return dest_path


def ftp_list(remote_dir: str) -> list[str]:
    """Lista os nomes de arquivo em `remote_dir` no FTP do DATASUS."""
    ftp = ftplib.FTP(DATASUS_FTP_HOST, timeout=60)
    try:
        ftp.login()
        ftp.cwd(remote_dir)
        return ftp.nlst()
    finally:
        ftp.quit()


def _dbf_field_layout(fh) -> tuple[int, int, list[tuple[str, int, str]]]:
    """Lê o cabeçalho de um .dbf e retorna (header_size, record_size, campos).

    `campos` é uma lista de (nome, tamanho, tipo) na ordem em que aparecem
    no registro. O primeiro byte de cada registro é a flag de exclusão
    (não faz parte de nenhum campo).
    """
    header = fh.read(32)
    header_size = struct.unpack("<H", header[8:10])[0]
    record_size = struct.unpack("<H", header[10:12])[0]
    campos = []
    while True:
        desc = fh.read(32)
        if not desc or desc[0:1] == b"\r":
            break
        nome = desc[0:11].split(b"\x00")[0].decode("ascii", errors="replace")
        tipo = chr(desc[11])
        tamanho = desc[16]
        campos.append((nome, tamanho, tipo))
    return header_size, record_size, campos


def dbf_read_columns(dbf_path: Path, columns: list[str]) -> pd.DataFrame:
    """Lê só as colunas pedidas de um .dbf via acesso binário direto (struct).

    Muito mais rápido que `dbfread` para arquivos grandes (centenas de MB,
    milhões de registros, como os .dbf nacionais do SINAN) porque decodifica
    apenas os bytes das colunas pedidas em vez de todos os ~100-130 campos
    de cada registro do formulário de notificação.
    """
    dbf_path = Path(dbf_path)
    wanted = set(columns)
    with open(dbf_path, "rb") as fh:
        header_size, record_size, campos = _dbf_field_layout(fh)

        offsets = []
        offset = 1  # byte 0 do registro = flag de exclusão
        for nome, tamanho, _tipo in campos:
            if nome in wanted:
                offsets.append((nome, offset, tamanho))
            offset += tamanho

        fh.seek(header_size)
        colunas: dict[str, list] = {nome: [] for nome, _, _ in offsets}
        while True:
            record = fh.read(record_size)
            if len(record) < record_size:
                break
            if record[0:1] == b"*":  # registro marcado como excluído
                continue
            for nome, off, tam in offsets:
                colunas[nome].append(record[off:off + tam].decode("latin1").strip())

    return pd.DataFrame(colunas)


def dbc_to_dataframe(dbc_path: Path, *, columns: list[str] | None = None, manter_dbf: bool = False) -> pd.DataFrame:
    """Converte um arquivo .dbc do DATASUS em DataFrame pandas.

    Internamente descompacta .dbc -> .dbf. Se `columns` for informado, usa
    o leitor rápido baseado em `struct` (ver `dbf_read_columns`); caso
    contrário lê todos os campos com `dbfread` (mais lento, usado só quando
    o registro inteiro é necessário).

    O .dbf descompactado é apagado depois de lido (`manter_dbf=False`, o
    padrão): para os arquivos nacionais do SINAN ele chega a ~7-8x o
    tamanho do .dbc (um único ano de dengue passa de 2GB descompactado) e
    reconstituí-lo a partir do .dbc cacheado leva só alguns segundos — não
    vale manter esses GBs em disco entre execuções. O .dbc original
    continua cacheado normalmente (é o "dado bruto" de fato).
    """
    dbc_path = Path(dbc_path)
    dbf_path = dbc_path.with_suffix(".dbf")
    dbf_ja_existia = dbf_path.exists()
    if not dbf_ja_existia:
        pyreaddbc.dbc2dbf(str(dbc_path), str(dbf_path))

    try:
        if columns:
            return dbf_read_columns(dbf_path, columns)
        table = DBF(str(dbf_path), load=False, encoding="latin1", ignore_missing_memofile=True)
        return pd.DataFrame(iter(table))
    finally:
        if not manter_dbf and not dbf_ja_existia:
            dbf_path.unlink(missing_ok=True)
