/* ============ HELPERS DE RENDER ============ */
const svgNS = "http://www.w3.org/2000/svg";
function el(tag, attrs){ const e = document.createElementNS(svgNS, tag); for(const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function clear(node){ while(node.firstChild) node.removeChild(node.firstChild); }
function fmt(n, dec=0){ if(n===null || n===undefined || Number.isNaN(n)) return "—"; return n.toLocaleString('pt-BR', {minimumFractionDigits:dec, maximumFractionDigits:dec}); }

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
    const { completos, idx } = indiceCompletoCache(a, "igual");
    if(completos.length < 2){ pontosMunicipio.push(null); pontosMedia.push(null); return; }
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
    clear(svgComp); clear(document.getElementById('chartCorrelacaoDispersao')); clear(document.getElementById('chartIndiceTemporal'));
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

  const { completos: idxData, idx } = indiceCompletoCache(state.ano, 'igual');
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

/* explicação em linguagem simples de cada esquema de pesos — sem isso, "Entropia de
   Shannon"/"PCA" não dizem nada pra quem não é da área de estatística. */
const EXPLICACAO_PESO = {
  igual: '<strong>Peso igual (padrão):</strong> os 5 indicadores contam 20% cada. Nenhum é tratado como mais importante — a opção mais simples de explicar e defender.',
  entropia: '<strong>Peso pela variação dos dados:</strong> o indicador que mais varia de um município pra outro em PE recebe peso maior — calculado automaticamente pelos dados (método: entropia de Shannon), não escolhido à mão.',
  pca: '<strong>Peso pela análise estatística (PCA):</strong> os pesos vêm de uma técnica (Análise de Componentes Principais) que resume a variação conjunta dos 5 indicadores. Também automático, mas mais sensível quando os indicadores se correlacionam entre si.',
};

/* filtro do ranking, disparado clicando numa barra da distribuição (faixa de índice)
   ou da mesorregião — nenhum dos dois muda o índice em si, só destaca/filtra a lista
   abaixo pra facilitar entender a distribuição/o agrupamento clicado. */
let filtroRanking = null; // { tipo:'mesorregiao', valor, label } | { tipo:'faixa', min, max, label } | null
function municipioPassaFiltro(m, val){
  if(!filtroRanking) return true;
  if(filtroRanking.tipo === 'mesorregiao') return m.mesorregiao === filtroRanking.valor;
  if(filtroRanking.tipo === 'faixa') return val!==undefined && val!==null && val>=filtroRanking.min && val<filtroRanking.max;
  return true;
}

/* ============ RENDER: DASHBOARD ============ */
function renderDashboard(){
  renderInicio(); // seção "Município em foco" (déficit x saúde de um município + dispersão) — independente do índice composto abaixo
  renderMapaGeo(); // mapa geográfico de PE (substitui o antigo mapa de calor esquemático), na mesma tela

  const pesosExplicacao = document.getElementById('pesosExplicacao');
  if(pesosExplicacao) pesosExplicacao.innerHTML = EXPLICACAO_PESO[state.peso || 'igual'];

  const dataAno = getDataset(state.ano);
  const { completos: data, idx } = indiceCompletoCache(state.ano, state.peso || 'igual');
  const hint = document.getElementById('rankingHint');
  if(hint) hint.textContent = `— do que mais precisa de investimento para o que menos precisa · ${data.length} de ${dataAno.length} municípios de PE com os ${INDICADORES_INDICE.length} indicadores do índice completos`;

  /* independe do índice composto (usa só o par déficit×saúde de cada célula), por isso
     roda mesmo quando o índice de 5 indicadores ainda não fecha para este ano. */
  renderMatrizCorrelacao(document.getElementById('matrizCorrelacao'), dataAno);

  const cardsHost = document.getElementById('cardsDashboard');
  const rankHost = document.getElementById('rankingList');
  const svgDecomp = document.getElementById('chartDecomposicao');
  const svgHistograma = document.getElementById('chartHistograma');
  const svgMesorregiao = document.getElementById('chartMesorregiao');
  const statPonderadoHost = document.getElementById('statPonderado');

  const avisoForaIndice = document.getElementById('avisoMunicipioForaIndice');
  if(dataAno.length === 0){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Sem dados para este ano', 'Rode o pipeline em data/scripts/ (ver README) para gerar data/processed/painel_pe.json.');
    rankHost.innerHTML = ""; clear(svgDecomp); clear(svgHistograma); clear(svgMesorregiao);
    const filtroBarVazio = document.getElementById('filtroRankingBar'); if(filtroBarVazio) filtroBarVazio.innerHTML = '';
    if(statPonderadoHost) statPonderadoHost.innerHTML = '';
    document.getElementById('topMunicipioNome').textContent = '';
    if(avisoForaIndice) avisoForaIndice.textContent = '';
    return;
  }
  if(data.length < 2){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Índice ainda não calculável', `O índice composto precisa dos ${INDICADORES_INDICE.length} indicadores (água, esgoto, dengue, chikungunya, diarreia) em pelo menos 2 municípios para gerar um ranking, e nenhum município tem essa combinação neste ano. ` + avisoSaneamento('deficitEsgoto'));
    rankHost.innerHTML = ""; clear(svgDecomp); clear(svgHistograma); clear(svgMesorregiao);
    const filtroBarVazio = document.getElementById('filtroRankingBar'); if(filtroBarVazio) filtroBarVazio.innerHTML = '';
    if(statPonderadoHost) statPonderadoHost.innerHTML = '';
    document.getElementById('topMunicipioNome').textContent = '';
    if(avisoForaIndice) avisoForaIndice.textContent = '';
    return;
  }

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

  const filtroBar = document.getElementById('filtroRankingBar');
  if(filtroBar){
    if(filtroRanking){
      filtroBar.innerHTML = `<div class="filtro-ativo">Filtro: <strong>${filtroRanking.label}</strong> <button type="button" id="btnLimparFiltroRanking">✕ limpar</button></div>`;
      document.getElementById('btnLimparFiltroRanking').addEventListener('click', ()=>{ filtroRanking = null; renderDashboard(); });
    } else {
      filtroBar.innerHTML = '';
    }
  }

  rankHost.innerHTML = "";
  const maxVal = ordered[0].val || 1;
  let visiveis = 0;
  ordered.forEach((o,i)=>{
    if(!municipioPassaFiltro(o.m, o.val)) return;
    visiveis++;
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
  const semIndice = dataAno.filter(m => !data.includes(m) && municipioPassaFiltro(m)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
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
  if(filtroRanking && visiveis===0 && !semIndice.length){
    const vazio = document.createElement('div');
    vazio.className = 'hint';
    vazio.style.padding = '10px';
    vazio.textContent = 'Nenhum município corresponde a este filtro.';
    rankHost.appendChild(vazio);
  }

  /* decomposição do índice do município SELECIONADO no topo da página — antes ficava
     sempre no nº1 do ranking, então clicar em outro município no ranking/mapa não
     mudava nada aqui. */
  clear(svgDecomp);
  const nomeMunicipioNode = document.getElementById('topMunicipioNome');
  const W=480,H=200,padL=140,padR=50,padT=10;
  const posSelNaData = data.indexOf(municipioSel);
  if(posSelNaData < 0){
    nomeMunicipioNode.textContent = `${municipioSel.nome}-${municipioSel.uf}`;
    svgDecomp.appendChild(svgTexto(`${municipioSel.nome}-${municipioSel.uf} não tem os ${INDICADORES_INDICE.length} indicadores completos em ${state.ano}, então não dá pra decompor o índice dele (ver aviso acima).`, W, H));
  } else {
    nomeMunicipioNode.textContent = `${municipioSel.nome}-${municipioSel.uf}`;
    const matrix = buildMatrix(data, INDICADORES_INDICE);
    const weights = computeWeights(state.peso, matrix);
    const contribs = INDICADORES_INDICE.map((k,j)=> matrix[posSelNaData][j]*weights[j]*100);
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

  /* índice simples vs. ponderado por população — um município de 5 mil hab. com déficit
     alto pesa igual a um de 1,5 milhão no ranking; esta comparação mostra se isso muda
     o quadro geral do painel. */
  if(statPonderadoHost){
    const somaPop = data.reduce((a,m)=>a+(m.pop||0),0);
    const idxPonderado = somaPop ? data.reduce((a,m,i)=>a+idx[i]*(m.pop||0),0)/somaPop : null;
    statPonderadoHost.innerHTML = `
      <div class="stat-comp-item"><span class="stat-comp-label">Média simples</span><span class="stat-comp-value">${fmt(mediaIdx,1)}</span></div>
      <div class="stat-comp-item"><span class="stat-comp-label">Ponderada por população</span><span class="stat-comp-value">${idxPonderado===null?'—':fmt(idxPonderado,1)}</span></div>`;
  }

  desenharHistograma(svgHistograma, data, idx);
  desenharIndiceMesorregiao(svgMesorregiao, data, idx);
}

/* histograma: em quantas faixas de 10 pontos (0-10, 10-20, ...) os municípios com
   índice calculável se distribuem — a lista ordenada (ranking) já existe, isso mostra
   a forma da distribuição (concentrada, espalhada, bimodal) que o ranking não revela.
   Clicável: cada faixa filtra o ranking pra só os municípios daquele intervalo. */
function desenharHistograma(svg, data, idx){
  clear(svg);
  const W=420,H=200,padL=34,padR=12,padT=10,padB=28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if(!idx.length){
    svg.appendChild(svgTexto('Sem índice calculável neste ano.', W, H));
    return;
  }
  const nFaixas = 10;
  const contagem = new Array(nFaixas).fill(0);
  const municipiosPorFaixa = Array.from({length:nFaixas}, ()=>[]);
  idx.forEach((v,i)=>{
    const faixa = Math.min(Math.floor(v/10), nFaixas-1);
    contagem[faixa]++;
    municipiosPorFaixa[faixa].push(data[i]);
  });
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const maxC = Math.max(...contagem)*1.15 || 1;
  const barW = plotW/nFaixas;

  [0,0.5,1].forEach(f=>{
    const y = padT + plotH*(1-f);
    svg.appendChild(el('line',{x1:padL,y1:y,x2:W-padR,y2:y,stroke:'var(--border)','stroke-width':1}));
    const t = el('text',{x:padL-6,y:y+3,'text-anchor':'end','font-size':9.5,'font-family':'IBM Plex Mono',fill:'var(--text-muted)'});
    t.textContent = fmt(Math.round(maxC*f),0); svg.appendChild(t);
  });

  contagem.forEach((c,i)=>{
    const h = (c/maxC)*plotH;
    const x = padL + i*barW;
    const y = padT + plotH - h;
    const min = i*10, max = (i+1)*10;
    const ativo = filtroRanking && filtroRanking.tipo==='faixa' && filtroRanking.min===min;
    const grupo = el('g', {class:'barra-clicavel'});
    grupo.appendChild(el('rect',{x, y:padT, width:barW, height:plotH, fill:'transparent'})); // alvo de clique maior que a barra visível
    const barra = el('rect',{x:x+1.5, y, width:Math.max(barW-3,1), height:Math.max(h,c?2:0), rx:3, fill:'var(--bordo)', stroke: ativo?'var(--terracota)':'none', 'stroke-width': ativo?2:0});
    const nomes = municipiosPorFaixa[i].map(m=>m.nome);
    const title = document.createElementNS(svgNS,'title');
    title.textContent = c
      ? `${c} município(s) entre ${min} e ${max} pontos: ${nomes.slice(0,8).join(', ')}${nomes.length>8 ? ` e mais ${nomes.length-8}` : ''} — clique pra filtrar o ranking`
      : `Nenhum município entre ${min} e ${max} pontos`;
    barra.appendChild(title);
    grupo.appendChild(barra);
    if(c>0){
      grupo.addEventListener('click', ()=>{
        filtroRanking = (ativo) ? null : { tipo:'faixa', min, max, label:`índice entre ${min} e ${max}` };
        renderDashboard();
      });
    }
    svg.appendChild(grupo);
    if(c>0){
      const val = el('text',{x:x+barW/2, y:y-4, 'text-anchor':'middle', 'font-size':9.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
      val.textContent = c; svg.appendChild(val);
    }
    if(i%2===0){
      const lbl = el('text',{x:x+barW/2, y:H-10, 'text-anchor':'middle', 'font-size':8.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
      lbl.textContent = `${i*10}`; svg.appendChild(lbl);
    }
  });
}

/* índice médio por mesorregião — agrupamento oficial do IBGE (Sertão, São Francisco,
   Agreste, Mata, Metropolitana de Recife), só entre os municípios com índice calculável.
   Clicável: cada barra filtra o ranking pra só os municípios daquela mesorregião. */
function desenharIndiceMesorregiao(svg, data, idx){
  clear(svg);
  const W=420,H=200,padL=150,padR=50,padT=8,padB=8;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const porRegiao = new Map();
  data.forEach((m,i)=>{
    const r = m.mesorregiao || 'Sem mesorregião';
    if(!porRegiao.has(r)) porRegiao.set(r, []);
    porRegiao.get(r).push({m, val:idx[i]});
  });
  const linhas = [...porRegiao.entries()]
    .map(([nome,itens])=>({
      nome,
      media: itens.reduce((a,it)=>a+it.val,0)/itens.length,
      n: itens.length,
      top3: [...itens].sort((a,b)=>b.val-a.val).slice(0,3).map(it=>it.m.nome),
    }))
    .sort((a,b)=>b.media-a.media);
  if(!linhas.length){
    svg.appendChild(svgTexto('Sem índice calculável neste ano.', W, H));
    return;
  }
  const rowH = (H-padT-padB)/linhas.length;
  const maxVal = Math.max(...linhas.map(l=>l.media))*1.15 || 1;
  linhas.forEach((l,i)=>{
    const y = padT + i*rowH + rowH*0.2;
    const barH = rowH*0.6;
    const w = (l.media/maxVal)*(W-padL-padR);
    const ativo = filtroRanking && filtroRanking.tipo==='mesorregiao' && filtroRanking.valor===l.nome;
    const grupo = el('g', {class:'barra-clicavel'});
    grupo.appendChild(el('rect',{x:0, y:padT+i*rowH, width:W, height:rowH, fill:'transparent'})); // alvo de clique maior que a barra visível
    const barra = el('rect',{x:padL, y, width:Math.max(w,1), height:barH, rx:5, fill:'var(--bordo)', stroke: ativo?'var(--terracota)':'none', 'stroke-width': ativo?2:0});
    const title = document.createElementNS(svgNS,'title');
    title.textContent = `${l.nome}: índice médio ${fmt(l.media,1)} entre ${l.n} município(s) — maiores prioridades: ${l.top3.join(', ')} — clique pra filtrar o ranking`;
    barra.appendChild(title);
    grupo.appendChild(barra);
    grupo.addEventListener('click', ()=>{
      filtroRanking = (ativo) ? null : { tipo:'mesorregiao', valor:l.nome, label:l.nome };
      renderDashboard();
    });
    svg.appendChild(grupo);
    const lbl = el('text',{x:padL-8, y:y+barH/2+4, 'text-anchor':'end', 'font-size':10.5, 'font-family':'IBM Plex Sans', fill:'var(--text)'});
    lbl.textContent = l.nome.replace(' Pernambucano','').replace(' Pernambucana',''); svg.appendChild(lbl);
    const val = el('text',{x:padL+w+8, y:y+barH/2+4, 'font-size':10, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
    val.textContent = `${fmt(l.media,1)} (${l.n})`; svg.appendChild(val);
  });
}

/* matriz de correlação: Spearman ρ entre cada déficit de saneamento e cada indicador de
   saúde — a correlação em "Município em foco" só mostra um par por vez (o selecionado
   nos campos ali); esta matriz dá o quadro completo dos 9 pares de uma vez. Fundo
   divergente (terracota = correlação positiva/esperada pela literatura, verde =
   negativa/inesperada) mas o valor com sinal sempre aparece em texto — a cor nunca
   carrega sozinha o significado. */
function renderMatrizCorrelacao(host, dataAno){
  const corDeCorrelacao = (rho) => {
    const a = Math.min(Math.abs(rho), 0.7)/0.7;
    return rho >= 0
      ? `color-mix(in srgb, var(--terracota) ${Math.round(a*55)}%, var(--surface))`
      : `color-mix(in srgb, var(--verde) ${Math.round(a*55)}%, var(--surface))`;
  };
  let html = `<div class="table-scroll"><table class="tabela-relatorio matriz-correlacao"><thead><tr><th></th>`;
  INDICADORES_SAUDE.forEach(s => html += `<th>${LABELS[s]}</th>`);
  html += `</tr></thead><tbody>`;
  INDICADORES_DEFICIT.forEach(d=>{
    html += `<tr><th>${LABELS[d]}</th>`;
    INDICADORES_SAUDE.forEach(s=>{
      const completos = comDadosCompletos(dataAno, [d,s]);
      if(completos.length < 4){
        html += `<td class="celula-correlacao" style="background:var(--surface-alt)" title="Dados insuficientes (${completos.length} município(s), mínimo 4)">insuf.</td>`;
      } else {
        const rho = spearman(completos.map(m=>m[d]), completos.map(m=>m[s]));
        html += `<td class="celula-correlacao" style="background:${corDeCorrelacao(rho)}" title="${completos.length} municípios">${(rho>=0?'+':'')}${rho.toFixed(2)}</td>`;
      }
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  host.innerHTML = html;
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
  const { completos, idx } = indiceCompletoCache(state.ano, state.peso || "igual");
  let ordenados = [];
  if(completos.length){
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

/* ranking em barras: cor da barra segue a mesma escala verde→âmbar→terracota do mapa
   de calor (mesmo dado, mesmo significado — quanto mais terracota, mais prioridade),
   calculada sobre o intervalo de TODOS os municípios com índice no ano, não só do
   top 15 exibido, senão até o "menos urgente" do top 15 apareceria verde. */
function desenharRankingBarras(svg, itens, minGeral, maxGeral){
  clear(svg);
  const rowH=20, gapY=8, padL=172, padR=54, padT=6, W=480;
  const H = Math.max(padT + itens.length*(rowH+gapY) + 6, 60);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if(!itens.length){
    svg.appendChild(svgTexto(`Nenhum município com os ${INDICADORES_INDICE.length} indicadores do índice completos neste ano.`, W, H));
    return;
  }
  const plotR = W - padR;
  const maxEscala = Math.max(...itens.map(o=>o.indice)) * 1.12 || 1;
  const minCor = minGeral ?? Math.min(...itens.map(o=>o.indice));
  const maxCor = maxGeral ?? Math.max(...itens.map(o=>o.indice));

  itens.forEach((o,i)=>{
    if(i%2===1){
      const y = padT + i*(rowH+gapY) - gapY/2;
      svg.appendChild(el("rect",{x:0, y, width:W, height:rowH+gapY, fill:"var(--surface-alt)"}));
    }
  });
  [0,25,50,75,100].forEach(v=>{
    if(v > maxEscala) return;
    const x = padL + (v/maxEscala)*(plotR-padL);
    svg.appendChild(el("line",{x1:x, y1:1, x2:x, y2:H-1, stroke:"var(--border)", "stroke-width":1}));
  });

  itens.forEach((o,i)=>{
    const y = padT + i*(rowH+gapY);
    const w = Math.max((o.indice/maxEscala)*(plotR-padL), 2);
    const t = maxCor>minCor ? (o.indice-minCor)/(maxCor-minCor) : 0.5;
    const barra = el("rect",{x:padL, y, width:w, height:rowH, rx:5, fill:escalaCor(t)});
    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${o.pos}º — ${o.nome}: índice ${fmt(o.indice,1)} de 100`;
    barra.appendChild(title);
    svg.appendChild(barra);

    const lbl = el("text",{x:padL-8, y:y+rowH/2+4, "text-anchor":"end", "font-size":11, "font-family":"IBM Plex Sans", "font-weight": i<3?"600":"400", fill:"var(--text)"});
    lbl.textContent = `${o.pos}º ${o.nome}`; svg.appendChild(lbl);
    const val = el("text",{x:padL+w+8, y:y+rowH/2+4, "font-size":10.5, "font-family":"IBM Plex Mono", "font-weight":"600", fill:"var(--text)"});
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

  const valoresIndice = comIndice.map(l=>l.indice);
  desenharRankingBarras(chartHost, comIndice.slice(0,15), Math.min(...valoresIndice), Math.max(...valoresIndice));
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

  const { completos, idx: idxTodos } = indiceCompletoCache(state.ano, state.peso || "igual");
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
