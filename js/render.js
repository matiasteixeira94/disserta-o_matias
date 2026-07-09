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
/* mensagem sobre lacuna de dado de saneamento, adaptada ao componente — a cobertura real
   difere muito entre os três (água tem série quase completa 2015-2023; esgoto é parcial
   mesmo nos anos cobertos; resíduos não tem nenhuma fonte automatizada ainda). */
function avisoSaneamento(compKey){
  if(compKey === "deficitResiduos"){
    return 'O déficit de resíduos sólidos ainda não tem fonte automatizada: nem a Base dos Dados (BigQuery) nem o novo Painel de Indicadores do SINISA publicam esse indicador — o módulo de resíduos do SINISA está marcado como "em breve" pelo próprio Ministério das Cidades. Só o passo manual (data/scripts/README.md, seção 04) pode preenchê-lo quando for disponibilizado.';
  }
  if(compKey === "deficitAgua" || compKey === "deficitEsgoto"){
    const nome = compKey === "deficitAgua" ? "água" : "esgoto";
    return `O déficit de ${nome} ainda não foi apurado para este ano/município. A série automatizada cobre 2015-2022 (Base dos Dados/SNIS, data/scripts/04a) e, só para água, também 2023 (Painel de Indicadores do SINISA, data/scripts/04b) — 2024 e o componente de esgoto após 2022 continuam exigindo o passo manual (data/scripts/README.md, seção 04).`;
  }
  return "O déficit de saneamento ainda não foi importado para este painel — ver data/scripts/README.md.";
}

/* ============ BUSCA DE MUNICÍPIO (input + datalist compartilhado por todos os
   seletores de município do painel — o roster de 185 é o mesmo em todos os anos,
   só o valor dos indicadores muda, então o datalist só precisa ser populado uma vez) ============ */
function rotuloMunicipio(m){ return `${m.nome} — ${m.uf}`; }
function popularDatalistMunicipios(data){
  const dl = document.getElementById('dlMunicipiosPE');
  if(!dl || dl.options.length) return;
  data.forEach(m=>{
    const opt = document.createElement('option');
    opt.value = rotuloMunicipio(m);
    dl.appendChild(opt);
  });
}
function encontrarMunicipioPorRotulo(data, rotulo){
  return data.find(m => rotuloMunicipio(m) === rotulo) || null;
}

/* ============ SELEÇÃO DE MUNICÍPIO NO TOPO DA PÁGINA (depende do ano, refeito a cada troca) ============ */
function popularSelectMunicipios(data){
  popularDatalistMunicipios(data);
  const input = document.getElementById('selMunicipio');
  const idx = Math.min(Math.max(state.municipioIdx || 0, 0), data.length-1);
  state.municipioIdx = idx;
  if(input && data[idx]) input.value = rotuloMunicipio(data[idx]);
}

/* linha do tempo do índice de priorização (pesos iguais) do município selecionado
   vs. a média do painel, ano a ano — anos em que o índice não é calculável (menos de
   2 municípios com os indicadores completos, ou o próprio município sem dado naquele
   ano) ficam como um vão na linha, nunca interpolados ou inventados. */
function desenharIndiceTemporal(svg, codigoMunicipio, nomeMunicipio){
  clear(svg);
  if(!PAINEL) return;
  const anos = [];
  for(let a = PAINEL.anoInicio; a <= PAINEL.anoFim; a++) anos.push(a);

  const pontosMunicipio = [], pontosMedia = [];
  anos.forEach(a=>{
    const completos = comDadosCompletos(getDataset(a), INDICADORES_INDICE);
    if(completos.length < 2){ pontosMunicipio.push(null); pontosMedia.push(null); return; }
    const idx = computeIndex(completos, "igual");
    pontosMedia.push(idx.reduce((s,v)=>s+v,0)/idx.length);
    const pos = completos.findIndex(m=>m.codigo===codigoMunicipio);
    pontosMunicipio.push(pos>=0 ? idx[pos] : null);
  });

  const W=900,H=220,padL=44,padR=120,padT=16,padB=32;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const valoresValidos = [...pontosMunicipio, ...pontosMedia].filter(v=>v!==null);
  if(!valoresValidos.length){
    svg.appendChild(svgTexto("Índice não calculável em nenhum ano para os filtros atuais.", W, H));
    return 0;
  }
  const maxV = Math.max(...valoresValidos)*1.15 || 1;
  const sx = i => padL + (anos.length>1 ? i/(anos.length-1)*plotW : plotW/2);
  const sy = v => padT + plotH - (v/maxV)*plotH;

  for(let i=0;i<=4;i++){
    const v = maxV*i/4;
    const y = sy(v);
    svg.appendChild(el("line",{x1:padL, y1:y, x2:W-padR, y2:y, stroke:"var(--border)", "stroke-width":1}));
    const t = el("text",{x:padL-8, y:y+3, "text-anchor":"end", "font-size":10, "font-family":"IBM Plex Mono", fill:"var(--text-muted)"});
    t.textContent = fmt(v,0); svg.appendChild(t);
  }
  anos.forEach((a,i)=>{
    const t = el("text",{x:sx(i), y:H-8, "text-anchor":"middle", "font-size":10, "font-family":"IBM Plex Mono", fill:"var(--text-muted)"});
    t.textContent = a; svg.appendChild(t);
  });

  function desenharLinha(pontos, cor, rotulo){
    let pathD = "", ultimo = null;
    pontos.forEach((v,i)=>{
      if(v===null) return;
      const x = sx(i), y = sy(v);
      pathD += (pathD ? " L" : "M") + x + " " + y;
      ultimo = {x,y,v};
    });
    if(pathD) svg.appendChild(el("path",{d:pathD, fill:"none", stroke:cor, "stroke-width":2, "stroke-linecap":"round", "stroke-linejoin":"round"}));
    pontos.forEach((v,i)=>{
      if(v===null) return;
      svg.appendChild(el("circle",{cx:sx(i), cy:sy(v), r:4, fill:cor, stroke:"var(--surface)", "stroke-width":1.5}));
    });
    if(ultimo){
      const lbl = el("text",{x:ultimo.x+8, y:ultimo.y+4, "font-size":11, "font-family":"IBM Plex Sans", "font-weight":600, fill:cor});
      lbl.textContent = rotulo; svg.appendChild(lbl);
      const val = el("text",{x:ultimo.x+8, y:ultimo.y+18, "font-size":10, "font-family":"IBM Plex Mono", fill:"var(--text-muted)"});
      val.textContent = fmt(ultimo.v,1); svg.appendChild(val);
    }
  }

  desenharLinha(pontosMedia, "var(--text-muted)", "Média do painel");
  desenharLinha(pontosMunicipio, "var(--bordo)", nomeMunicipio);
  return pontosMunicipio.filter(v=>v!==null).length;
}

/* ============ RENDER: MUNICÍPIO EM FOCO (seção do Dashboard) ============
   Mantém o nome renderInicio por ora — renderiza a seção "Município em foco"
   do Dashboard (cards, comparação com a média, mapa esquemático e a
   correlação/dispersão déficit×saúde), chamada a partir de renderDashboard(). */
function renderInicio(){
  const data = getDataset(state.ano);
  const cardsHost = document.getElementById('cardsInicio');
  const svgComp = document.getElementById('chartComparacao');

  if(data.length === 0){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Sem dados para este ano', 'Nenhum município com população apurada para o ano selecionado. Rode o pipeline em data/scripts/ (ver README) para gerar data/processed/painel_pe.json.');
    clear(svgComp); clear(document.getElementById('mapaInicio')); clear(document.getElementById('chartCorrelacaoDispersao')); clear(document.getElementById('chartIndiceTemporal'));
    document.getElementById('corrValue').textContent = '—';
    document.getElementById('interpretacaoTexto').textContent = '';
    document.getElementById('corrChartHint').textContent = '';
    document.getElementById('temporalHint').textContent = '';
    return;
  }

  const m = data[state.municipioIdx] || data[0];
  const inputMunicipio = document.getElementById('selMunicipio');
  if(inputMunicipio) inputMunicipio.value = rotuloMunicipio(m);
  const compKey = state.componente, saudeKey = state.indicador;

  const completosComp = comDadosCompletos(data, [compKey]);
  const completosSaude = comDadosCompletos(data, [saudeKey]);
  const completosAmbos = comDadosCompletos(data, [compKey, saudeKey]);

  const semComp = m[compKey] === null || m[compKey] === undefined;
  const semSaude = m[saudeKey] === null || m[saudeKey] === undefined;

  const idxData = comDadosCompletos(data, INDICADORES_INDICE);
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
      <span class="card-sub">${idxData.length ? `de 0 a 100 · pesos iguais · ${idxData.length} municípios com os ${INDICADORES_INDICE.length} indicadores do índice completos` : 'aguardando dados completos (ver aviso abaixo)'}</span>
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

  /* evolução do índice do município ao longo dos anos, vs. média do painel em cada ano */
  const svgTemporal = document.getElementById('chartIndiceTemporal');
  const temporalHint = document.getElementById('temporalHint');
  if(svgTemporal && temporalHint){
    const anosComPonto = desenharIndiceTemporal(svgTemporal, m.codigo, `${m.nome}-${m.uf}`);
    temporalHint.textContent = anosComPonto
      ? `— ${m.nome}-${m.uf} vs. média do painel, ${PAINEL.anoInicio}-${PAINEL.anoFim} (pesos iguais)`
      : `— ${m.nome}-${m.uf} não tem os ${INDICADORES_INDICE.length} indicadores do índice completos em nenhum ano; só a média do painel aparece no gráfico`;
  }

  /* gráfico de comparação (barras SVG) — só quando há os dois valores para o município */
  clear(svgComp);
  if(semComp || semSaude){
    const aviso = semComp ? avisoSaneamento(compKey) : `Sem notificações/internações apuradas para "${LABELS[saudeKey]}" em ${m.nome} neste ano.`;
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
  const chartCorr = document.getElementById('chartCorrelacaoDispersao');
  const chartCorrHint = document.getElementById('corrChartHint');
  if(completosAmbos.length < 4){
    const avisoFalta = semComp ? avisoSaneamento(compKey) : '';
    corrHost.textContent = '—';
    textoHost.textContent = `Dados insuficientes para calcular a correlação (${completosAmbos.length} município(s) com ambos os indicadores apurados; são necessários ao menos 4). ${avisoFalta}`;
    clear(chartCorr);
    chartCorr.appendChild(svgTexto(`Dados insuficientes para o gráfico de dispersão (mínimo de 4 municípios com os dois indicadores apurados). ${avisoFalta}`, 420, 230));
    chartCorrHint.textContent = '';
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
      ` Em <strong>${m.nome}-${m.uf}</strong>, o ${LABELS[compKey].toLowerCase()} está em <strong>${fmt(m[compKey],1)}%</strong> e a taxa de ${LABELS[saudeKey].toLowerCase()} é de <strong>${fmt(m[saudeKey])} casos/100 mil hab.</strong>`;
    textoHost.innerHTML = `Considerando os <strong>${completosAmbos.length} municípios</strong> de PE com ambos os indicadores apurados neste ano, a correlação de Spearman entre ${LABELS[compKey].toLowerCase()} e ${LABELS[saudeKey].toLowerCase()} é <strong>${forca}</strong> e <strong>${direcao}</strong> (ρ = ${rho.toFixed(2)}) — ${esperado}.${posicaoTxt} Texto gerado automaticamente a partir dos filtros selecionados.`;

    desenharDispersaoCorrelacao(chartCorr, completosAmbos, compKey, saudeKey, semComp||semSaude ? null : m);
    chartCorrHint.textContent = `— ${completosAmbos.length} municípios com os dois indicadores apurados em ${state.ano}, ρ = ${rho.toFixed(2)}`;
  }
}

/* dispersão déficit×saúde: um ponto por município, linha de tendência (OLS) e o município
   selecionado em destaque — a mesma leitura da correlação em Spearman acima, mas mostrando
   a posição (ranking) de cada município nos dois eixos ao mesmo tempo. */
function desenharDispersaoCorrelacao(svg, dados, compKey, saudeKey, municipioSel){
  clear(svg);
  const W=420, H=230, padL=46, padR=18, padT=16, padB=38;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const xs = dados.map(d=>d[compKey]), ys = dados.map(d=>d[saudeKey]);
  const [xMinD,xMaxD] = minMax(xs), [yMinD,yMaxD] = minMax(ys);
  const xPad = (xMaxD-xMinD)*0.08 || Math.max(xMaxD,1)*0.1;
  const yPad = (yMaxD-yMinD)*0.08 || Math.max(yMaxD,1)*0.1;
  const xMin = Math.max(0, xMinD-xPad), xMax = xMaxD+xPad;
  const yMin = Math.max(0, yMinD-yPad), yMax = yMaxD+yPad;
  const sx = v => padL + ((v-xMin)/((xMax-xMin)||1))*plotW;
  const sy = v => H-padB - ((v-yMin)/((yMax-yMin)||1))*plotH;

  for(let i=0;i<=4;i++){
    const v = yMin + (yMax-yMin)*i/4;
    const y = sy(v);
    svg.appendChild(el('line',{x1:padL, y1:y, x2:W-padR, y2:y, stroke:'var(--border)', 'stroke-width':1}));
    const t = el('text',{x:padL-6, y:y+3, 'text-anchor':'end', 'font-size':9.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
    t.textContent = fmt(v,0); svg.appendChild(t);
  }
  [xMin, (xMin+xMax)/2, xMax].forEach(v=>{
    const t = el('text',{x:sx(v), y:H-padB+16, 'text-anchor':'middle', 'font-size':9.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
    t.textContent = fmt(v,0)+'%'; svg.appendChild(t);
  });
  const xTitle = el('text',{x:padL+plotW/2, y:H-4, 'text-anchor':'middle', 'font-size':10, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)'});
  xTitle.textContent = `${LABELS[compKey]} (%)`; svg.appendChild(xTitle);
  const yTitle = el('text',{x:12, y:padT+plotH/2, 'text-anchor':'middle', 'font-size':10, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)', transform:`rotate(-90 12 ${padT+plotH/2})`});
  yTitle.textContent = `${LABELS[saudeKey]} (/100k)`; svg.appendChild(yTitle);

  const {a,b} = linreg(xs, ys);
  const y1 = Math.max(yMin, Math.min(yMax, a*xMin+b));
  const y2 = Math.max(yMin, Math.min(yMax, a*xMax+b));
  svg.appendChild(el('line',{x1:sx(xMin), y1:sy(y1), x2:sx(xMax), y2:sy(y2), stroke:'var(--text-muted)', 'stroke-width':2, 'stroke-linecap':'round', opacity:0.55}));

  dados.forEach(d=>{
    if(d === municipioSel) return;
    const cx = sx(d[compKey]), cy = sy(d[saudeKey]);
    const hit = el('circle',{cx, cy, r:12, fill:'transparent'});
    const hitTitle = document.createElementNS(svgNS,'title');
    hitTitle.textContent = `${d.nome}: ${LABELS[compKey]} ${fmt(d[compKey],1)}% · ${LABELS[saudeKey]} ${fmt(d[saudeKey])}/100k`;
    hit.appendChild(hitTitle);
    svg.appendChild(hit);
    svg.appendChild(el('circle',{cx, cy, r:5, fill:'var(--bordo)', 'fill-opacity':0.55, stroke:'var(--surface)', 'stroke-width':1.5}));
  });

  if(municipioSel){
    const cx = sx(municipioSel[compKey]), cy = sy(municipioSel[saudeKey]);
    svg.appendChild(el('circle',{cx, cy, r:9, fill:'none', stroke:'var(--terracota)', 'stroke-width':1.4}));
    const dot = el('circle',{cx, cy, r:6, fill:'var(--terracota)', stroke:'var(--surface)', 'stroke-width':1.5});
    const dotTitle = document.createElementNS(svgNS,'title');
    dotTitle.textContent = `${municipioSel.nome} (selecionado): ${LABELS[compKey]} ${fmt(municipioSel[compKey],1)}% · ${LABELS[saudeKey]} ${fmt(municipioSel[saudeKey])}/100k`;
    dot.appendChild(dotTitle);
    svg.appendChild(dot);
    const labelY = cy < padT+16 ? cy+18 : cy-12;
    const anchor = cx > W-padR-60 ? 'end' : (cx < padL+60 ? 'start' : 'middle');
    const lbl = el('text',{x:cx, y:labelY, 'text-anchor':anchor, 'font-size':10.5, 'font-family':'IBM Plex Sans', 'font-weight':600, fill:'var(--text)'});
    lbl.textContent = municipioSel.nome;
    svg.appendChild(lbl);
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
function renderMapa(svgId, todos, idxValues, highlightPos, idxData, selectedPos){
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
    const isSelected = selectedPos !== undefined && i === selectedPos;
    const c = el('circle',{cx:x, cy:y, r, fill:color, class:'map-dot', opacity: (isHighlight||isSelected)?1:0.8});
    if(isHighlight){
      svg.appendChild(el('circle',{cx:x, cy:y, r:r+2.2, fill:'none', stroke:color, 'stroke-width':0.7}));
    }
    if(isSelected){
      /* anel bordô: o município escolhido nos seletores do topo — distinto do anel de maior prioridade acima */
      svg.appendChild(el('circle',{cx:x, cy:y, r:r+(isHighlight?3.8:2.2), fill:'none', stroke:'var(--bordo)', 'stroke-width':0.9}));
    }
    svg.appendChild(c);
  });
}

/* ============ RENDER: DASHBOARD ============ */
function renderDashboard(){
  renderInicio(); // seção "Município em foco" (déficit x saúde de um município + dispersão) — independente do índice composto abaixo
  renderMapaGeo(); // mapa geográfico de PE (substitui o antigo mapa de calor esquemático), na mesma tela

  const dataAno = getDataset(state.ano);
  const data = comDadosCompletos(dataAno, INDICADORES_INDICE);
  const hint = document.getElementById('rankingHint');
  if(hint) hint.textContent = `— do que mais precisa de investimento para o que menos precisa · ${data.length} de ${dataAno.length} municípios de PE com os ${INDICADORES_INDICE.length} indicadores do índice completos`;

  const cardsHost = document.getElementById('cardsDashboard');
  const rankHost = document.getElementById('rankingList');
  const svgDecomp = document.getElementById('chartDecomposicao');

  const avisoForaIndice = document.getElementById('avisoMunicipioForaIndice');
  if(dataAno.length === 0){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Sem dados para este ano', 'Rode o pipeline em data/scripts/ (ver README) para gerar data/processed/painel_pe.json.');
    rankHost.innerHTML = ""; clear(svgDecomp);
    document.getElementById('topMunicipioNome').textContent = '';
    if(avisoForaIndice) avisoForaIndice.textContent = '';
    return;
  }
  if(data.length < 2){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Índice ainda não calculável', `O índice composto precisa dos ${INDICADORES_INDICE.length} indicadores (água, esgoto, dengue, chikungunya, diarreia) em pelo menos 2 municípios para gerar um ranking, e nenhum município tem essa combinação neste ano. ` + avisoSaneamento('deficitEsgoto'));
    rankHost.innerHTML = ""; clear(svgDecomp);
    document.getElementById('topMunicipioNome').textContent = '';
    if(avisoForaIndice) avisoForaIndice.textContent = '';
    return;
  }

  const idx = computeIndex(data, state.peso);
  const ordered = data.map((m,i)=>({m,val:idx[i]})).sort((a,b)=>b.val-a.val);
  const municipioSel = dataAno[state.municipioIdx] || dataAno[0];

  if(avisoForaIndice){
    if(data.includes(municipioSel)){
      avisoForaIndice.textContent = '';
    } else {
      const faltando = INDICADORES_INDICE.find(k => municipioSel[k]===null || municipioSel[k]===undefined);
      avisoForaIndice.textContent = `${municipioSel.nome}-${municipioSel.uf} (selecionado no topo da página) não aparece no ranking abaixo: falta o indicador "${LABELS[faltando]}" para esse município em ${state.ano}. Os cards de "Município em foco" mais abaixo continuam mostrando os indicadores que esse município tem.`;
    }
  }

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
    const isSel = o.m === municipioSel;
    const row = document.createElement('div'); row.className = 'rank-item' + (isSel ? ' rank-item-selecionado' : '');
    row.innerHTML = `
      <span class="rank-pos">${i+1}º</span>
      <span class="rank-name"><strong>${o.m.nome}</strong><span>${o.m.uf} · ${fmt(o.m.pop)} hab.${isSel ? ' · <strong>selecionado no topo da página</strong>' : ''}</span></span>
      <span class="rank-bar-wrap"><span class="rank-bar" style="width:${(o.val/maxVal*100).toFixed(0)}%"></span></span>
      <span class="rank-value">${fmt(o.val,1)}</span>`;
    row.style.cursor = 'pointer';
    row.addEventListener('click', ()=>{ state.municipioIdx = dataAno.indexOf(o.m); renderDashboard(); });
    rankHost.appendChild(row);
    if(isSel && row.scrollIntoView) row.scrollIntoView({block:'nearest'});
  });

  /* municípios sem os 5 indicadores completos: aparecem também na lista (todos os 185
     de PE, nunca só os que têm índice calculável), sem posição/barra — nunca inventamos
     um índice pra eles, só deixamos claro que faltam dados e qual indicador falta. */
  const semIndice = dataAno.filter(m => !data.includes(m)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  if(semIndice.length){
    const divisor = document.createElement('div');
    divisor.className = 'rank-item-divisor';
    divisor.textContent = `${semIndice.length} município(s) sem os ${INDICADORES_INDICE.length} indicadores completos em ${state.ano} — não entram no índice, mas continuam listados abaixo`;
    rankHost.appendChild(divisor);
  }
  semIndice.forEach(m=>{
    const isSel = m === municipioSel;
    const faltando = INDICADORES_INDICE.find(k => m[k]===null || m[k]===undefined);
    const row = document.createElement('div'); row.className = 'rank-item rank-item-sem-indice' + (isSel ? ' rank-item-selecionado' : '');
    row.innerHTML = `
      <span class="rank-pos">—</span>
      <span class="rank-name"><strong>${m.nome}</strong><span>${m.uf} · ${fmt(m.pop)} hab. · falta ${LABELS[faltando]}${isSel ? ' · <strong>selecionado no topo da página</strong>' : ''}</span></span>
      <span class="rank-bar-wrap"></span>
      <span class="rank-value">—</span>`;
    row.style.cursor = 'pointer';
    row.addEventListener('click', ()=>{ state.municipioIdx = dataAno.indexOf(m); renderDashboard(); });
    rankHost.appendChild(row);
    if(isSel && row.scrollIntoView) row.scrollIntoView({block:'nearest'});
  });

  /* decomposição do índice do município #1 */
  clear(svgDecomp);
  document.getElementById('topMunicipioNome').textContent = `${top.m.nome}-${top.m.uf}`;
  const matrix = buildMatrix(data, INDICADORES_INDICE);
  const weights = computeWeights(state.peso, matrix);
  const topIdxPos = data.indexOf(top.m);
  const contribs = INDICADORES_INDICE.map((k,j)=> matrix[topIdxPos][j]*weights[j]*100);
  const W=480,H=200,padL=140,padR=50,padT=10;
  const barH = 22, gapY = 10;
  const maxC = Math.max(...contribs)*1.15 || 1;
  INDICADORES_INDICE.forEach((k,i)=>{
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

/* ============ RENDER: RELATÓRIOS ============
   Uma única função monta as linhas (posição, indicadores, índice) usadas
   tanto pela tabela em tela quanto pelas exportações em js/export.js —
   assim o que é exportado é sempre exatamente o que está na tela. */
const COLUNAS_RELATORIO = [
  {chave:"pos", rotulo:"Posição"},
  {chave:"nome", rotulo:"Município"},
  {chave:"pop", rotulo:"População"},
  {chave:"indice", rotulo:"Índice de priorização"},
  {chave:"deficitAgua", rotulo:"Déficit água (%)"},
  {chave:"deficitEsgoto", rotulo:"Déficit esgoto (%)"},
  {chave:"deficitResiduos", rotulo:"Déficit resíduos (%)"},
  {chave:"taxaDengue", rotulo:"Dengue /100k"},
  {chave:"taxaChikungunya", rotulo:"Chikungunya /100k"},
  {chave:"taxaDiarreia", rotulo:"Diarreia aguda /100k"},
];

function calcularLinhasRelatorio(){
  const dataAno = getDataset(state.ano);
  const completos = comDadosCompletos(dataAno, INDICADORES_INDICE);
  let ordenados = [];
  if(completos.length){
    const idx = computeIndex(completos, state.peso || "igual");
    ordenados = completos.map((m,i)=>({m, val: idx[i]})).sort((a,b)=>b.val-a.val);
  }
  return [
    ...ordenados.map((o,i)=>({pos:i+1, ...o.m, indice:o.val})),
    ...dataAno.filter(m=>!completos.includes(m)).map(m=>({pos:null, ...m, indice:null})),
  ];
}

function construirTabelaHTML(linhas, colunas){
  const cols = colunas || COLUNAS_RELATORIO;
  const head = "<thead><tr>" + cols.map(c=>`<th>${c.rotulo}</th>`).join("") + "</tr></thead>";
  const body = "<tbody>" + linhas.map(l => "<tr>" + cols.map(c=>{
    const v = l[c.chave];
    if(v===null || v===undefined || Number.isNaN(v)) return "<td>—</td>";
    if(typeof v === "number") return `<td>${fmt(v, c.chave==="pop"||c.chave==="pos" ? 0 : 1)}</td>`;
    return `<td>${v}</td>`;
  }).join("") + "</tr>").join("") + "</tbody>";
  return head + body;
}

function desenharRankingBarras(svg, itens){
  clear(svg);
  const rowH=20, gapY=6, padL=170, padR=54, padT=8, W=480;
  const H = Math.max(padT + itens.length*(rowH+gapY), 60);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if(!itens.length){
    svg.appendChild(svgTexto(`Nenhum município com os ${INDICADORES_INDICE.length} indicadores do índice completos neste ano.`, W, H));
    return;
  }
  const maxVal = Math.max(...itens.map(o=>o.indice)) * 1.15 || 1;
  itens.forEach((o,i)=>{
    const y = padT + i*(rowH+gapY);
    const w = (o.indice/maxVal)*(W-padL-padR);
    svg.appendChild(el("rect",{x:padL, y, width:Math.max(w,1), height:rowH, rx:5, fill:"var(--bordo)"}));
    const lbl = el("text",{x:padL-8, y:y+rowH/2+4, "text-anchor":"end", "font-size":11, "font-family":"IBM Plex Sans", fill:"var(--text)"});
    lbl.textContent = `${o.pos}º ${o.nome}`; svg.appendChild(lbl);
    const val = el("text",{x:padL+w+8, y:y+rowH/2+4, "font-size":10.5, "font-family":"IBM Plex Mono", fill:"var(--text-muted)"});
    val.textContent = fmt(o.indice,1); svg.appendChild(val);
  });
}

function renderRelatorios(){
  const anoEl = document.getElementById("relAno"); if(anoEl) anoEl.textContent = state.ano;
  const badge = document.getElementById("relAnoBadge"); if(badge) badge.textContent = state.ano;

  const cardsHost = document.getElementById("cardsRelatorio");
  const chartHost = document.getElementById("chartRankingRelatorio");
  const hintHost = document.getElementById("relRankingHint");
  const tabelaHost = document.getElementById("tabelaRelatorio");

  const dataAno = getDataset(state.ano);
  if(dataAno.length === 0){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML("Sem dados para este ano", "Rode o pipeline em data/scripts/ (ver README) para gerar data/processed/painel_pe.json.");
    clear(chartHost); tabelaHost.innerHTML = ""; if(hintHost) hintHost.textContent = "";
    return;
  }

  const linhas = calcularLinhasRelatorio();
  const comIndice = linhas.filter(l=>l.pos!==null);
  const mediaIdx = comIndice.length ? comIndice.reduce((a,l)=>a+l.indice,0)/comIndice.length : null;

  clear2(cardsHost);
  cardsHost.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">Municípios no relatório</span>
      <span class="card-value">${dataAno.length}</span>
      <span class="card-sub">${comIndice.length} com os ${INDICADORES_INDICE.length} indicadores do índice completos · ${dataAno.length-comIndice.length} sem índice calculável</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">Ano de referência</span>
      <span class="card-value">${state.ano}</span>
      <span class="card-sub">pesos: ${LABEL_PESO[state.peso||"igual"]}</span>
    </div>
    <div class="card accent-verde">
      <span class="card-label">Índice médio do painel</span>
      <span class="card-value">${mediaIdx===null?"—":fmt(mediaIdx,1)}</span>
      <span class="card-sub">${comIndice.length ? `entre ${comIndice.length} municípios` : "aguardando dados completos"}</span>
    </div>`;

  desenharRankingBarras(chartHost, comIndice.slice(0,15));
  if(hintHost) hintHost.textContent = comIndice.length
    ? `— top ${Math.min(15,comIndice.length)} de ${comIndice.length} municípios com os ${INDICADORES_INDICE.length} indicadores do índice completos`
    : `— nenhum município com os ${INDICADORES_INDICE.length} indicadores do índice completos ainda`;

  tabelaHost.innerHTML = construirTabelaHTML(linhas);
}

/* ============ RENDER: COMPARAÇÕES ============ */
function popularSelectComparacao(data){
  popularDatalistMunicipios(data);
  const configs = [
    {id:"selCompA", key:"compA", fallback:0},
    {id:"selCompB", key:"compB", fallback: data.length>1 ? 1 : 0},
  ];
  configs.forEach(cfg=>{
    const input = document.getElementById(cfg.id);
    let idx = state[cfg.key];
    if(idx===undefined || idx===null) idx = cfg.fallback;
    idx = Math.max(0, Math.min(idx, data.length-1));
    state[cfg.key] = idx;
    if(input && data[idx]) input.value = rotuloMunicipio(data[idx]);
  });
}

/* barras agrupadas: uma "série" por município/média, um grupo de barras por indicador */
function desenharBarrasAgrupadas(svg, indicadores, series){
  clear(svg);
  const W=420, H=210, padL=54, padR=16, padT=14, padB=34;
  const barW=18, barGap=4, groupGap=22;
  const groupW = series.length*barW + (series.length-1)*barGap;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const totalGroups = indicadores.length*groupW;
  const gapEntreGrupos = indicadores.length>1 ? Math.max((plotW-totalGroups)/indicadores.length, 14) : 0;

  const valores = [];
  indicadores.forEach(k => series.forEach(s => { const v=s.get(k); if(v!==null && v!==undefined && !Number.isNaN(v)) valores.push(v); }));
  const maxVal = (valores.length ? Math.max(...valores) : 1) * 1.15 || 1;

  if(!valores.length){
    svg.appendChild(svgTexto("Sem dados apurados para estes indicadores no ano selecionado.", W, H));
    return;
  }

  svg.appendChild(el("line",{x1:padL, y1:H-padB, x2:W-padR, y2:H-padB, stroke:"var(--border)", "stroke-width":1}));

  let x = padL + gapEntreGrupos/2;
  indicadores.forEach(k=>{
    series.forEach((s,si)=>{
      const v = s.get(k);
      if(v===null || v===undefined || Number.isNaN(v)) return;
      const h = Math.max((v/maxVal)*plotH, 1);
      const bx = x + si*(barW+barGap), by = H-padB-h;
      svg.appendChild(el("rect",{x:bx, y:by, width:barW, height:h, rx:4, fill:s.cor}));
      const t = el("text",{x:bx+barW/2, y:by-4, "text-anchor":"middle", "font-size":9, "font-family":"IBM Plex Mono", fill:"var(--text)"});
      t.textContent = round1(v); svg.appendChild(t);
    });
    const lbl = el("text",{x:x+groupW/2, y:H-12, "text-anchor":"middle", "font-size":10.5, "font-family":"IBM Plex Sans", fill:"var(--text-muted)"});
    lbl.textContent = LABELS[k] || k; svg.appendChild(lbl);
    x += groupW + gapEntreGrupos;
  });

  series.forEach((s,i)=>{
    const ly = 8 + i*14;
    svg.appendChild(el("rect",{x:W-padR-100, y:ly, width:9, height:9, rx:2, fill:s.cor}));
    const t = el("text",{x:W-padR-87, y:ly+8, "font-size":9.5, "font-family":"IBM Plex Sans", fill:"var(--text-muted)"});
    t.textContent = s.label; svg.appendChild(t);
  });
}

function renderComparacoes(){
  const dataAno = getDataset(state.ano);
  const anoEl = document.getElementById("compAno"); if(anoEl) anoEl.textContent = state.ano;
  popularSelectComparacao(dataAno);

  const cardsHost = document.getElementById("cardsComparacao");
  const svgSan = document.getElementById("chartCompSaneamento");
  const svgSau = document.getElementById("chartCompSaude");
  const tabelaHost = document.getElementById("tabelaComparacao");

  if(dataAno.length < 2){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML("Municípios insuficientes para comparar", "São necessários ao menos 2 municípios com população apurada no ano selecionado.");
    clear(svgSan); clear(svgSau); tabelaHost.innerHTML = "";
    return;
  }

  const A = dataAno[state.compA] || dataAno[0];
  const B = dataAno[state.compB] || dataAno[Math.min(1, dataAno.length-1)];

  const mediaDe = (chave) => {
    const vals = comDadosCompletos(dataAno, [chave]).map(d=>d[chave]);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  };

  const completos = comDadosCompletos(dataAno, INDICADORES_INDICE);
  const idxTodos = completos.length ? computeIndex(completos, state.peso || "igual") : [];
  const idxDe = (m) => { const pos = completos.indexOf(m); return pos>=0 ? idxTodos[pos] : null; };
  const idxA = idxDe(A), idxB = idxDe(B);
  const posDe = (m) => { const pos = completos.indexOf(m); return pos>=0 ? rankDesc(idxTodos)[pos] : null; };

  clear2(cardsHost);
  cardsHost.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">${A.nome}-${A.uf}</span>
      <span class="card-value">${idxA===null?"—":fmt(idxA,1)}</span>
      <span class="card-sub">${idxA===null?"índice não calculável (dados incompletos)":`${posDe(A)}ª posição de ${completos.length}`}</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">${B.nome}-${B.uf}</span>
      <span class="card-value">${idxB===null?"—":fmt(idxB,1)}</span>
      <span class="card-sub">${idxB===null?"índice não calculável (dados incompletos)":`${posDe(B)}ª posição de ${completos.length}`}</span>
    </div>
    <div class="card accent-ambar">
      <span class="card-label">Diferença de índice</span>
      <span class="card-value">${(idxA===null||idxB===null) ? "—" : fmt(Math.abs(idxA-idxB),1)}</span>
      <span class="card-sub">${(idxA===null||idxB===null) ? `precisa dos ${INDICADORES_INDICE.length} indicadores do índice nos dois municípios` : (idxA>idxB ? `${A.nome} prioriza mais` : idxB>idxA ? `${B.nome} prioriza mais` : "empate")}</span>
    </div>`;

  desenharBarrasAgrupadas(svgSan, INDICADORES_DEFICIT, [
    {label:A.nome, cor:"var(--bordo)", get:(k)=>A[k]},
    {label:B.nome, cor:"var(--terracota)", get:(k)=>B[k]},
    {label:"Média do painel", cor:"var(--text-muted)", get:mediaDe},
  ]);
  desenharBarrasAgrupadas(svgSau, INDICADORES_SAUDE, [
    {label:A.nome, cor:"var(--bordo)", get:(k)=>A[k]},
    {label:B.nome, cor:"var(--terracota)", get:(k)=>B[k]},
    {label:"Média do painel", cor:"var(--text-muted)", get:mediaDe},
  ]);

  const mediaIndice = idxTodos.length ? idxTodos.reduce((a,v)=>a+v,0)/idxTodos.length : null;
  const linhasTabela = [
    {rotulo:"Índice de priorização", a:idxA, b:idxB, media:mediaIndice, un:""},
    ...TODOS_INDICADORES.map(k=>({rotulo:LABELS[k], a:A[k], b:B[k], media:mediaDe(k), un: INDICADORES_DEFICIT.includes(k)?"%":"/100k"})),
  ];
  tabelaHost.innerHTML =
    `<thead><tr><th>Indicador</th><th>${A.nome}</th><th>${B.nome}</th><th>Média do painel</th></tr></thead><tbody>` +
    linhasTabela.map(l => `<tr><td>${l.rotulo}</td><td>${l.a==null?"—":fmt(l.a,1)+l.un}</td><td>${l.b==null?"—":fmt(l.b,1)+l.un}</td><td>${l.media==null?"—":fmt(l.media,1)+l.un}</td></tr>`).join("") +
    "</tbody>";
}
