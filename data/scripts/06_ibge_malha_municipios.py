"""
06 — Malha territorial dos municípios (IBGE)

Fonte oficial, sem chave de API necessária:
  * API de Malhas do IBGE — polígonos dos municípios de uma UF:
    https://servicodados.ibge.gov.br/api/docs/malhas

Gera:
  data/raw/ibge/malha_<uf>.geojson        (resposta crua da API de Malhas)
  data/processed/malha_municipios_pe.geojson (só codarea + geometria,
                                               coordenadas arredondadas)

Usado pelo mapa geográfico do painel (`js/geo.js`), que casa cada polígono
com um município do painel por `codarea` == `codigo_ibge` (ambos são o
código IBGE de 7 dígitos). Independente dos passos 01-05: pode rodar a
qualquer momento, a malha territorial não muda de um ano para o outro.
"""
import json

import requests

from config import IBGE_MALHA_URL, PROCESSED_DIR, RAW_IBGE_DIR, UF_CODIGO_IBGE, UF_SIGLA

HEADERS = {"User-Agent": "painel-priorizacao-ppgecam/1.0"}


def baixar_malha() -> dict:
    url = IBGE_MALHA_URL.format(uf_codigo=UF_CODIGO_IBGE)
    resp = requests.get(url, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    geojson = resp.json()
    (RAW_IBGE_DIR / f"malha_{UF_SIGLA.lower()}.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False), encoding="utf-8"
    )
    print(f"  {len(geojson['features'])} polígonos de município obtidos da API de Malhas")
    return geojson


def arredondar_coords(coords, casas=5):
    if isinstance(coords[0], (int, float)):
        return [round(c, casas) for c in coords]
    return [arredondar_coords(c, casas) for c in coords]


def simplificar(geojson: dict) -> dict:
    """Mantém só o campo usado pelo front-end (codarea) e arredonda as
    coordenadas para ~1 m de precisão — suficiente para um mapa em tela e
    reduz bastante o tamanho do arquivo final."""
    features = []
    for f in geojson["features"]:
        features.append({
            "type": "Feature",
            "properties": {"codarea": f["properties"]["codarea"]},
            "geometry": {
                "type": f["geometry"]["type"],
                "coordinates": arredondar_coords(f["geometry"]["coordinates"]),
            },
        })
    return {"type": "FeatureCollection", "features": features}


def main():
    print(f"Baixando malha municipal de {UF_SIGLA} (IBGE API de Malhas)...")
    geojson = baixar_malha()
    processado = simplificar(geojson)

    out_path = PROCESSED_DIR / "malha_municipios_pe.geojson"
    out_path.write_text(json.dumps(processado, ensure_ascii=False), encoding="utf-8")
    tamanho_kb = out_path.stat().st_size / 1024
    print(f"OK: {out_path} ({len(processado['features'])} municípios, {tamanho_kb:.0f} KB)")


if __name__ == "__main__":
    main()
