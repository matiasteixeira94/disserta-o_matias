/* ============ HELPERS DE RENDER ============ */
const svgNS = "http://www.w3.org/2000/svg";
function el(tag, attrs){ const e = document.createElementNS(svgNS, tag); for(const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function clear(node){ while(node.firstChild) node.removeChild(node.firstChild); }
function fmt(n, dec=0){ if(n===null || n===undefined || Number.isNaN(n)) return "—"; return n.toLocaleString('pt-BR', {minimumFractionDigits:dec, maximumFractionDigits:dec}); }

/* posição esquemática (grade, não geográfica) do município i entre n no painel */
function layoutXY(i, n){
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n/cols);
  const col = i % cols, row = Math.floor(i/cols);
  const x = 10 + (cols>1 ? col/(cols-1) * 80 : 40);
  const y = 10 + (rows>1 ? row/(rows-1) * 80 : 40);
  return {x, y};
}

/* ============ PLACEHOLDER GENÉRICO (dado ainda não apurado) ============ */
function placeholderHTML(titulo, texto){
  return `<div class="placeholder-box"><h2>${titulo}</h2><p>${texto}</p></div>`;
}
const AVISO_SANEAMENTO = "O déficit de saneamento (SINISA/SNIS) ainda não foi importado para este painel — rode data/scripts/04_sinisa_saneamento.py após baixar a série histórica oficial (ver data/scripts/README.md). Os indicadores de saúde já refletem dados reais de SINAN/SIH-SUS.";

/* ============ POPULAR SELECT DE MUNICÍPIOS (depende do ano, refeito a cada troca) ============ */
function popularSelectMunicipios(data){
  const sel = document.getElementById('selMunicipio');
  const anterior = sel.value;
  clear(sel);
  data.forEach((m,i)=>{
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = `${m.nome} — ${m.uf}`;
    sel.appendChild(opt);
  });
  const idx = Math.min(Number(anterior)||0, data.length-1);
  sel.value = idx >= 0 ? idx : 0;
  state.municipioIdx = idx >= 0 ? idx : 0;
}

/* ============ RENDER: TELA INICIAL ============ */
function renderInicio(){
  const data = getDataset(state.ano);
  const cardsHost = document.getElementById('cardsInicio');
  const svgComp = document.getElementById('chartComparacao');

  if(data.length === 0){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Sem dados para este ano', 'Nenhum município com população apurada para o ano selecionado. Rode o pipeline em data/scripts/ (ver README) para gerar data/processed/painel_pe.json.');
    clear(svgComp); clear(document.getElementById('mapaInicio'));
    document.getElementById('corrValue').textContent = '—';
    document.getElementById('interpretacaoTexto').textContent = '';
    return;
  }

  const m = data[state.municipioIdx] || data[0];
  const compKey = state.componente, saudeKey = state.indicador;

  const completosComp = comDadosCompletos(data, [compKey]);
  const completosSaude = comDadosCompletos(data, [saudeKey]);
  const completosAmbos = comDadosCompletos(data, [compKey, saudeKey]);

  const semComp = m[compKey] === null || m[compKey] === undefined;
  const semSaude = m[saudeKey] === null || m[saudeKey] === undefined;

  const idxData = comDadosCompletos(data, TODOS_INDICADORES);
  const idx = idxData.length ? computeIndex(idxData, "igual") : [];
  const posNoIdx = idxData.indexOf(m);
  const idxRank = posNoIdx>=0 ? rankDesc(idx)[posNoIdx] : null;

  const compRank = !semComp ? rankDesc(completosComp.map(d=>d[compKey]))[completosComp.indexOf(m)] : null;
  const saudeRank = !semSaude ? rankDesc(completosSaude.map(d=>d[saudeKey]))[completosSaude.indexOf(m)] : null;

  /* cards */
  clear2(cardsHost);
  cardsHost.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">Índice de priorização</span>
      <span class="card-value">${idxRank ? fmt(idx[posNoIdx],1) : '—'}</span>
      <span class="card-sub">${idxData.length ? `de 0 a 100 · pesos iguais · ${idxData.length} municípios com os 6 indicadores completos` : 'aguardando dados completos (ver aviso abaixo)'}</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">Posição no painel (índice)</span>
      <span class="card-value">${idxRank ? idxRank+'ª' : '—'}</span>
      <span class="card-sub">${idxData.length ? `entre ${idxData.length} municípios com dados completos` : '—'}</span>
    </div>
    <div class="card accent-ambar">
      <span class="card-label">${LABELS[compKey]}</span>
      <span class="card-value">${semComp ? '—' : fmt(m[compKey],1)+'%'}</span>
      <span class="card-sub">${semComp ? 'dado de saneamento ainda não importado' : `${compRank}ª maior deficiência entre ${completosComp.length} municípios`}</span>
    </div>
    <div class="card accent-verde">
      <span class="card-label">${LABELS[saudeKey]}</span>
      <span class="card-value">${semSaude ? '—' : fmt(m[saudeKey])}</span>
      <span class="card-sub">${semSaude ? 'sem casos/notificações apuradas' : `casos / 100 mil hab. · ${saudeRank}ª posição de ${completosSaude.length}`}</span>
    </div>`;

  /* gráfico de comparação (barras SVG) — só quando há os dois valores para o município */
  clear(svgComp);
  if(semComp || semSaude){
    const aviso = semComp ? AVISO_SANEAMENTO : `Sem notificações/internações apuradas para "${LABELS[saudeKey]}" em ${m.nome} neste ano.`;
    svgComp.appendChild(svgTexto(aviso, 420, 230));
  } else {
    const mediaComp = completosAmbos.reduce((a,b)=>a+b[compKey],0)/completosAmbos.length;
    const mediaSaude = completosAmbos.reduce((a,b)=>a+b[saudeKey],0)/completosAmbos.length;
    desenharComparacao(svgComp, m, compKey, saudeKey, mediaComp, mediaSaude);
  }

  /* mapa esquemático */
  renderMapa('mapaInicio', data, idxData.length?idx:null, idxData.length?posNoIdx:-1, idxData);

  /* correlação + interpretação — só com os dois indicadores presentes em ao menos 4 municípios */
  const corrHost = document.getElementById('corrValue');
  const textoHost = document.getElementById('interpretacaoTexto');
  if(completosAmbos.length < 4){
    corrHost.textContent = '—';
    textoHost.textContent = `Dados insuficientes para calcular a correlação (${completosAmbos.length} município(s) com ambos os indicadores apurados; são necessários ao menos 4). ${semComp ? AVISO_SANEAMENTO : ''}`;
  } else {
    const compVals = completosAmbos.map(d=>d[compKey]);
    const saudeVals = completosAmbos.map(d=>d[saudeKey]);
    const rho = spearman(compVals, saudeVals);
    corrHost.textContent = (rho>=0?'+':'') + rho.toFixed(2);
    const forca = forcaCorrelacao(rho);
    const direcao = rho >= 0 ? "positiva" : "negativa";
    const esperado = rho >= 0
      ? "na direção esperada pela literatura (mais déficit associado a mais carga da doença)"
      : "na direção oposta à esperada pela literatura — vale investigar outros fatores antes de priorizar só por este par de variáveis";
    const posicaoTxt = (semComp || semSaude) ? '' :
      ` Em <strong>${m.nome}-${m.uf}</strong>, o déficit de ${LABELS[compKey].toLowerCase()} está em <strong>${fmt(m[compKey],1)}%</strong> e a taxa de ${LABELS[saudeKey].toLowerCase()} é de <strong>${fmt(m[saudeKey])} casos/100 mil hab.</strong>`;
    textoHost.innerHTML = `Considerando os <strong>${completosAmbos.length} municípios</strong> de PE com ambos os indicadores apurados neste ano, a correlação de Spearman entre déficit de ${LABELS[compKey].toLowerCase()} e ${LABELS[saudeKey].toLowerCase()} é <strong>${forca}</strong> e <strong>${direcao}</strong> (ρ = ${rho.toFixed(2)}) — ${esperado}.${posicaoTxt} Texto gerado automaticamente a partir dos filtros selecionados.`;
  }
}

function svgTexto(texto, W, H){
  const g = el('g',{});
  const linhas = quebrarTexto(texto, 56);
  linhas.forEach((linha,i)=>{
    const t = el('text',{x:W/2, y:H/2 - (linhas.length-1)*9 + i*18, 'text-anchor':'middle', 'font-size':13, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)'});
    t.textContent = linha;
    g.appendChild(t);
  });
  return g;
}
function quebrarTexto(texto, larguraMax){
  const palavras = texto.split(' ');
  const linhas = []; let atual = '';
  palavras.forEach(p=>{
    if((atual+' '+p).trim().length > larguraMax){ linhas.push(atual.trim()); atual = p; }
    else atual = (atual+' '+p).trim();
  });
  if(atual) linhas.push(atual);
  return linhas;
}

function desenharComparacao(svg, m, compKey, saudeKey, mediaComp, mediaSaude){
  const W=420,H=230, padL=44, padB=30, padT=14, gap=70;
  const groups = [
    {label: LABELS[compKey].replace('Déficit de ','Déficit\n'), muni:m[compKey], media:mediaComp, unit:'%'},
    {label: LABELS[saudeKey], muni:m[saudeKey], media:mediaSaude, unit:'/100k'}
  ];
  const maxVal = Math.max(...groups.map(g=>Math.max(g.muni,g.media))) * 1.25 || 1;
  const plotH = H-padT-padB;
  svg.appendChild(el('line',{x1:padL,y1:H-padB,x2:W-16,y2:H-padB,stroke:'var(--border)','stroke-width':1}));
  groups.forEach((g,gi)=>{
    const baseX = padL + gi*(gap+120) + 20;
    [ {v:g.muni, color:'var(--bordo)', dx:0, label:m.nome},
      {v:g.media, color:'var(--text-muted)', dx:44, label:'Média painel'} ].forEach(bar=>{
        const h = (bar.v/maxVal)*plotH;
        const x = baseX+bar.dx, y = H-padB-h;
        svg.appendChild(el('rect',{x, y, width:32, height:h, rx:5, fill:bar.color}));
        const t = el('text',{x:x+16, y:y-6, 'text-anchor':'middle', 'font-size':11, 'font-family':'IBM Plex Mono', fill:'var(--text)'});
        t.textContent = bar.v.toLocaleString('pt-BR',{maximumFractionDigits:1});
        svg.appendChild(t);
    });
    const gl = el('text',{x:baseX+38, y:H-10, 'text-anchor':'middle', 'font-size':11.5, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)'});
    gl.textContent = g.label + ' ('+g.unit+')';
    svg.appendChild(gl);
  });
  svg.appendChild(el('rect',{x:W-150,y:10,width:10,height:10,rx:2,fill:'var(--bordo)'}));
  const leg1 = el('text',{x:W-134,y:19,'font-size':10.5,'font-family':'IBM Plex Sans',fill:'var(--text-muted)'}); leg1.textContent = m.nome; svg.appendChild(leg1);
  svg.appendChild(el('rect',{x:W-150,y:26,width:10,height:10,rx:2,fill:'var(--text-muted)'}));
  const leg2 = el('text',{x:W-134,y:35,'font-size':10.5,'font-family':'IBM Plex Sans',fill:'var(--text-muted)'}); leg2.textContent = 'Média do painel'; svg.appendChild(leg2);
}

function clear2(node){ node.innerHTML=""; }

/* ============ MAPA ESQUEMÁTICO (reutilizado em duas telas) ============
   `todos` = lista completa de municípios do ano (define a grade de posições);
   `idxValues`/`idxData` = índice de priorização e a sublista para a qual ele
   foi calculado (pode ser um subconjunto de `todos`, se faltar algum dado). */
function renderMapa(svgId, todos, idxValues, highlightPos, idxData){
  const svg = document.getElementById(svgId);
  clear(svg);
  svg.appendChild(el('rect',{x:2,y:2,width:96,height:96,rx:4,fill:'var(--surface-alt)',stroke:'var(--border)','stroke-width':0.6}));

  const maxIdx = idxValues && idxValues.length ? Math.max(...idxValues) : 0;
  todos.forEach((m,i)=>{
    const {x,y} = layoutXY(i, todos.length);
    const posIdx = idxData ? idxData.indexOf(m) : -1;
    let color = 'var(--border)', r = 1.6;
    if(posIdx >= 0 && maxIdx>0){
      const t = idxValues[posIdx]/maxIdx;
      color = t > 0.66 ? 'var(--terracota)' : (t > 0.33 ? 'var(--ambar)' : 'var(--verde)');
      r = 1.6 + t*1.8;
    }
    const isHighlight = i === highlightPos;
    const c = el('circle',{cx:x, cy:y, r, fill:color, class:'map-dot', opacity: isHighlight?1:0.8});
    if(isHighlight){
      svg.appendChild(el('circle',{cx:x, cy:y, r:r+2.2, fill:'none', stroke:color, 'stroke-width':0.7}));
    }
    svg.appendChild(c);
  });
}

/* ============ RENDER: DASHBOARD ============ */
function renderDashboard(){
  const dataAno = getDataset(state.ano);
  const data = comDadosCompletos(dataAno, TODOS_INDICADORES);
  const hint = document.getElementById('rankingHint');
  if(hint) hint.textContent = `— ${data.length} de ${dataAno.length} municípios de PE com os 6 indicadores completos`;

  const cardsHost = document.getElementById('cardsDashboard');
  const rankHost = document.getElementById('rankingList');
  const svgDecomp = document.getElementById('chartDecomposicao');

  if(dataAno.length === 0){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Sem dados para este ano', 'Rode o pipeline em data/scripts/ (ver README) para gerar data/processed/painel_pe.json.');
    rankHost.innerHTML = ""; clear(svgDecomp); clear(document.getElementById('mapaDashboard'));
    document.getElementById('topMunicipioNome').textContent = '';
    return;
  }
  if(data.length < 2){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Índice ainda não calculável', AVISO_SANEAMENTO + ' O índice composto precisa dos 6 indicadores (3 de saneamento + 3 de saúde) em pelo menos 2 municípios para gerar um ranking.');
    rankHost.innerHTML = ""; clear(svgDecomp);
    renderMapa('mapaDashboard', dataAno, null, -1, null);
    document.getElementById('topMunicipioNome').textContent = '';
    return;
  }

  const idx = computeIndex(data, state.peso);
  const ordered = data.map((m,i)=>({m,val:idx[i]})).sort((a,b)=>b.val-a.val);

  const top = ordered[0];
  const mediaIdx = idx.reduce((a,b)=>a+b,0)/idx.length;
  const piorAgua = data.reduce((acc,m)=> m.deficitAgua>acc.deficitAgua?m:acc, data[0]);
  const piorSaude = data.reduce((acc,m)=> m.taxaDengue>acc.taxaDengue?m:acc, data[0]);

  cardsHost.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">Municípios com dados completos</span>
      <span class="card-value">${data.length}</span>
      <span class="card-sub">de ${dataAno.length} municípios de PE no ano selecionado</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">Maior prioridade</span>
      <span class="card-value" style="font-size:19px">${top.m.nome}-${top.m.uf}</span>
      <span class="card-sub">índice ${fmt(top.val,1)} / 100</span>
    </div>
    <div class="card accent-ambar">
      <span class="card-label">Maior déficit de água</span>
      <span class="card-value" style="font-size:19px">${piorAgua.nome}-${piorAgua.uf}</span>
      <span class="card-sub">${fmt(piorAgua.deficitAgua,1)}% de déficit</span>
    </div>
    <div class="card accent-verde">
      <span class="card-label">Índice médio do painel</span>
      <span class="card-value">${fmt(mediaIdx,1)}</span>
      <span class="card-sub">maior carga: ${piorSaude.nome} (${fmt(piorSaude.taxaDengue)} dengue/100k)</span>
    </div>`;

  rankHost.innerHTML = "";
  const maxVal = ordered[0].val || 1;
  ordered.forEach((o,i)=>{
    const row = document.createElement('div'); row.className='rank-item';
    row.innerHTML = `
      <span class="rank-pos">${i+1}º</span>
      <span class="rank-name"><strong>${o.m.nome}</strong><span>${o.m.uf} · ${fmt(o.m.pop)} hab.</span></span>
      <span class="rank-bar-wrap"><span class="rank-bar" style="width:${(o.val/maxVal*100).toFixed(0)}%"></span></span>
      <span class="rank-value">${fmt(o.val,1)}</span>`;
    rankHost.appendChild(row);
  });

  renderMapa('mapaDashboard', dataAno, idx, dataAno.indexOf(top.m), data);

  /* decomposição do índice do município #1 */
  clear(svgDecomp);
  document.getElementById('topMunicipioNome').textContent = `${top.m.nome}-${top.m.uf}`;
  const matrix = buildMatrix(data);
  const weights = computeWeights(state.peso, matrix);
  const topIdxPos = data.indexOf(top.m);
  const contribs = TODOS_INDICADORES.map((k,j)=> matrix[topIdxPos][j]*weights[j]*100);
  const W=480,H=200,padL=140,padR=50,padT=10;
  const barH = 22, gapY = 10;
  const maxC = Math.max(...contribs)*1.15 || 1;
  TODOS_INDICADORES.forEach((k,i)=>{
    const y = padT + i*(barH+gapY);
    const w = (contribs[i]/maxC) * (W-padL-padR);
    const isSaude = INDICADORES_SAUDE.includes(k);
    svgDecomp.appendChild(el('rect',{x:padL, y, width:Math.max(w,1), height:barH, rx:6, fill:isSaude?'var(--terracota)':'var(--bordo)'}));
    const lbl = el('text',{x:padL-10, y:y+barH/2+4, 'text-anchor':'end', 'font-size':12, 'font-family':'IBM Plex Sans', fill:'var(--text)'});
    lbl.textContent = LABELS[k]; svgDecomp.appendChild(lbl);
    const val = el('text',{x:padL+w+8, y:y+barH/2+4, 'font-size':11.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
    val.textContent = contribs[i].toFixed(1)+' pts'; svgDecomp.appendChild(val);
  });
}
