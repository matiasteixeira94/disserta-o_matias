/* =========================================================================
   MAPA GEOGRÁFICO — projeção e render dos polígonos municipais de PE, a
   partir de data/processed/malha_municipios_pe.geojson (gerado pelo passo
   06 do pipeline, ver data/scripts/README.md). Fernando de Noronha (a
   ~350 km da costa) é excluído do bbox principal e desenhado à parte, num
   quadro menor (inset) — do contrário o continente encolheria a um ponto.
   ========================================================================= */
const CODIGO_FERNANDO_DE_NORONHA = 2605459;

let MALHA = null;            // FeatureCollection bruta
let malhaPorCodigo = null;   // Map<codigo_ibge:number, feature>
let malhaErro = null;
/* o município selecionado no mapa é o mesmo de todo o painel (state.municipioIdx,
   controlado também pela busca no topo da página e pelo ranking do Dashboard) —
   não existe mais uma seleção separada só do mapa. */

async function carregarMalha(){
  const resp = await fetch('data/processed/malha_municipios_pe.geojson', { cache:'no-store' });
  if(!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar data/processed/malha_municipios_pe.geojson`);
  MALHA = await resp.json();
  malhaPorCodigo = new Map(MALHA.features.map(f => [Number(f.properties.codarea), f]));
}

/* ============ GEOMETRIA / PROJEÇÃO ============ */
function bboxDeFeatures(features){
  let minLon=Infinity, maxLon=-Infinity, minLat=Infinity, maxLat=-Infinity;
  function walk(coords, depth){
    if(depth===0){
      const [lon,lat] = coords;
      if(lon<minLon) minLon=lon; if(lon>maxLon) maxLon=lon;
      if(lat<minLat) minLat=lat; if(lat>maxLat) maxLat=lat;
      return;
    }
    coords.forEach(c => walk(c, depth-1));
  }
  features.forEach(f => {
    const g = f.geometry;
    const depth = g.type==='Polygon' ? 2 : g.type==='MultiPolygon' ? 3 : 1;
    walk(g.coordinates, depth);
  });
  return {minLon,maxLon,minLat,maxLat};
}

/* projeção equiretangular com correção de cosseno de latitude (adequada
   para a extensão pequena de um estado; PE cabe em ~2,5° de latitude) */
function criarProjecao(box, width, height, padding){
  const latMedia = (box.minLat+box.maxLat)/2;
  const cosLat = Math.cos(latMedia * Math.PI/180);
  const lonSpan = Math.max((box.maxLon-box.minLon) * cosLat, 1e-9);
  const latSpan = Math.max(box.maxLat-box.minLat, 1e-9);
  const plotW = width - padding*2, plotH = height - padding*2;
  const escala = Math.min(plotW/lonSpan, plotH/latSpan);
  const offX = padding + (plotW - lonSpan*escala)/2;
  const offY = padding + (plotH - latSpan*escala)/2;
  return ([lon,lat]) => [
    offX + (lon-box.minLon)*cosLat*escala,
    offY + (box.maxLat-lat)*escala, // y invertido: norte fica pra cima
  ];
}

function alturaParaLargura(box, width, padding){
  const latMedia = (box.minLat+box.maxLat)/2;
  const cosLat = Math.cos(latMedia * Math.PI/180);
  const lonSpan = Math.max((box.maxLon-box.minLon) * cosLat, 1e-9);
  const latSpan = Math.max(box.maxLat-box.minLat, 1e-9);
  const plotW = width - padding*2;
  return plotW * (latSpan/lonSpan) + padding*2;
}

function anelParaPath(anel, projetar){
  return anel.map((pt,i) => (i===0?'M':'L') + projetar(pt).map(v=>v.toFixed(2)).join(',')).join(' ') + 'Z';
}
function geometriaParaPath(geom, projetar){
  if(geom.type==='Polygon') return geom.coordinates.map(a=>anelParaPath(a,projetar)).join(' ');
  if(geom.type==='MultiPolygon') return geom.coordinates.map(poly=>poly.map(a=>anelParaPath(a,projetar)).join(' ')).join(' ');
  return '';
}

/* ============ ESCALA DE COR (reaproveita a paleta do painel) ============ */
function corCss(nomeVar){ return getComputedStyle(document.documentElement).getPropertyValue(nomeVar).trim(); }
function hexParaRgb(hex){
  hex = hex.replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const num = parseInt(hex,16);
  return [(num>>16)&255, (num>>8)&255, num&255];
}
function misturarCor(c1,c2,t){ return c1.map((v,i)=>Math.round(v+(c2[i]-v)*t)); }
function escalaCor(t){
  t = Math.max(0, Math.min(1, t));
  const verde = hexParaRgb(corCss('--verde')), ambar = hexParaRgb(corCss('--ambar')), terracota = hexParaRgb(corCss('--terracota'));
  const rgb = t<0.5 ? misturarCor(verde, ambar, t/0.5) : misturarCor(ambar, terracota, (t-0.5)/0.5);
  return `rgb(${rgb.join(',')})`;
}
function corSemDado(){ return corCss('--border'); }

/* ============ CAMADAS EXIBÍVEIS NO MAPA ============ */
const UNIDADE_CAMADA = { indice: '/ 100', deficitAgua: '%', deficitEsgoto: '%', deficitResiduos: '%', taxaDengue: '/100 mil hab.', taxaChikungunya: '/100 mil hab.', taxaDiarreia: '/100 mil hab.' };
function rotuloCamada(camada){ return camada === 'indice' ? 'Índice de priorização (composto)' : LABELS[camada]; }

/* retorna Map<codigo_ibge, valor|null> para a camada e ano selecionados */
function valoresPorCamada(dataAno, camada){
  const mapa = new Map();
  if(camada === 'indice'){
    const completos = comDadosCompletos(dataAno, INDICADORES_INDICE);
    if(completos.length){
      const idx = computeIndex(completos, state.peso || 'igual');
      completos.forEach((m,i) => mapa.set(m.codigo, idx[i]));
    }
  } else {
    dataAno.forEach(m => mapa.set(m.codigo, m[camada] ?? null));
  }
  return mapa;
}

/* ============ RENDER ============ */
function renderMapaGeo(){
  const svg = document.getElementById('mapaGeografico');
  const legendaHost = document.getElementById('mapaLegenda');
  const hintHost = document.getElementById('mapaCamadaHint');
  if(!svg) return;

  if(malhaErro){
    svg.parentElement.innerHTML = placeholderHTML('Não foi possível carregar a malha geográfica',
      `Falha ao buscar <code>data/processed/malha_municipios_pe.geojson</code> (${malhaErro.message}). ` +
      `Rode <code>python data/scripts/06_ibge_malha_municipios.py</code> (ver <code>data/scripts/README.md</code>).`);
    legendaHost.innerHTML = '';
    return;
  }

  const dataAno = getDataset(state.ano);
  const municipioSel = dataAno[state.municipioIdx] || null;
  const codigoSelecionado = municipioSel ? municipioSel.codigo : null;
  const camada = state.mapaCamada || 'indice';
  hintHost.textContent = `— ${rotuloCamada(camada)}, ${state.ano}`;

  const valores = valoresPorCamada(dataAno, camada);
  const valsValidos = [...valores.values()].filter(v => v !== null && v !== undefined);
  const min = valsValidos.length ? Math.min(...valsValidos) : 0;
  const max = valsValidos.length ? Math.max(...valsValidos) : 1;

  const featuresContinente = MALHA.features.filter(f => Number(f.properties.codarea) !== CODIGO_FERNANDO_DE_NORONHA);
  const boxContinente = bboxDeFeatures(featuresContinente);
  const largura = 640, padding = 10;
  const alturaContinente = alturaParaLargura(boxContinente, largura, padding);
  const alturaInset = 116;
  const alturaTotal = alturaContinente + alturaInset;

  svg.setAttribute('viewBox', `0 0 ${largura} ${alturaTotal}`);
  clear(svg);

  const projetar = criarProjecao(boxContinente, largura, alturaContinente, padding);

  function corDoMunicipio(codigo){
    const v = valores.get(codigo);
    if(v === null || v === undefined) return corSemDado();
    return escalaCor(max>min ? (v-min)/(max-min) : 0.5);
  }

  function desenharMunicipio(feature, projetarFn){
    const codigo = Number(feature.properties.codarea);
    const d = geometriaParaPath(feature.geometry, projetarFn);
    const path = el('path', {
      d, fill: corDoMunicipio(codigo), class: 'path-municipio',
      'data-codigo': codigo,
    });
    if(codigo === codigoSelecionado) path.classList.add('selecionado');
    svg.appendChild(path);
  }

  svg.appendChild(el('rect', {x:0, y:0, width:largura, height:alturaContinente, fill:'transparent', id:'mapaFundo'}));
  featuresContinente.forEach(f => desenharMunicipio(f, projetar));

  // inset de Fernando de Noronha
  const featureNoronha = malhaPorCodigo.get(CODIGO_FERNANDO_DE_NORONHA);
  if(featureNoronha){
    const insetW = 130, insetH = alturaInset-26, insetX = largura-insetW-10, insetY = alturaContinente+10;
    svg.appendChild(el('rect', {x:insetX, y:insetY, width:insetW, height:insetH, rx:8, fill:'var(--surface-alt)', stroke:'var(--border)', 'stroke-width':1}));
    const boxNoronha = bboxDeFeatures([featureNoronha]);
    const projetarNoronha = criarProjecao(boxNoronha, insetW, insetH, 14);
    const dNoronha = geometriaParaPath(featureNoronha.geometry, ([lon,lat]) => {
      const [x,y] = projetarNoronha([lon,lat]);
      return [insetX+x, insetY+y];
    });
    const pathNoronha = el('path', { d: dNoronha, fill: corDoMunicipio(CODIGO_FERNANDO_DE_NORONHA), class:'path-municipio', 'data-codigo': CODIGO_FERNANDO_DE_NORONHA });
    if(CODIGO_FERNANDO_DE_NORONHA === codigoSelecionado) pathNoronha.classList.add('selecionado');
    svg.appendChild(pathNoronha);
    const rotulo = el('text', {x:insetX+insetW/2, y:insetY+insetH+16, 'text-anchor':'middle', 'font-size':10, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)'});
    rotulo.textContent = 'Fernando de Noronha (fora de escala)';
    svg.appendChild(rotulo);
  }

  renderLegenda(legendaHost, camada, min, max, valsValidos.length>0);
}

function renderLegenda(host, camada, min, max, temDados){
  if(!temDados){
    host.innerHTML = `<span class="legenda-swatch" style="background:${corSemDado()}"></span> nenhum dado apurado para esta camada/ano ${camada!=='indice' && INDICADORES_DEFICIT.includes(camada) ? '(SINISA/SNIS ainda não importado — ver data/scripts/README.md)' : ''}`;
    return;
  }
  host.innerHTML = `
    <span class="legenda-rotulo">${fmt(min,1)}${UNIDADE_CAMADA[camada]}</span>
    <span class="legenda-barra"></span>
    <span class="legenda-rotulo">${fmt(max,1)}${UNIDADE_CAMADA[camada]}</span>
    <span class="legenda-item"><span class="legenda-swatch" style="background:${corSemDado()}"></span>sem dado apurado</span>`;
}

/* ============ INTERAÇÃO (delegada, ligada uma única vez) ============ */
(function ligarEventosMapa(){
  const svg = document.getElementById('mapaGeografico');
  const tooltip = document.getElementById('mapaTooltip');
  if(!svg || !tooltip) return;

  svg.addEventListener('mousemove', (e) => {
    const path = e.target.closest('path.path-municipio');
    if(!path){ tooltip.style.display = 'none'; return; }
    const codigo = Number(path.dataset.codigo);
    const dataAno = getDataset(state.ano);
    const m = dataAno.find(d => d.codigo === codigo);
    if(!m){ tooltip.style.display = 'none'; return; }
    const valores = valoresPorCamada(dataAno, state.mapaCamada || 'indice');
    const v = valores.get(codigo);
    const camada = state.mapaCamada || 'indice';
    tooltip.innerHTML = `<strong>${m.nome}-${m.uf}</strong><br>${rotuloCamada(camada)}: ${v===null||v===undefined?'sem dado':fmt(v,1)+' '+UNIDADE_CAMADA[camada]}`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX+14)+'px';
    tooltip.style.top = (e.clientY+14)+'px';
  });
  svg.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  svg.addEventListener('click', (e) => {
    const path = e.target.closest('path.path-municipio');
    if(!path) return;
    const codigo = Number(path.dataset.codigo);
    const dataAno = getDataset(state.ano);
    const idx = dataAno.findIndex(m => m.codigo === codigo);
    if(idx < 0) return;
    state.municipioIdx = idx;
    renderDashboard();
  });
})();
