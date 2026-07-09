/* ============ NAVEGAÇÃO ============ */
let currentView = 'inicio';
function renderCurrentView(){
  if(currentView==='dashboard') renderDashboard();
  if(currentView==='mapa') renderMapaGeo();
  if(currentView==='relatorios') renderRelatorios();
  if(currentView==='comparacoes') renderComparacoes();
  // 'inicio' é só a tela de abertura (institucional + logo + navegação), sem conteúdo dinâmico
}
function setView(view){
  currentView = view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.querySelectorAll('.nav-item, .hero-nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  const titles = {inicio:'Tela Inicial', dashboard:'Dashboard', mapa:'Mapa', relatorios:'Relatórios', comparacoes:'Comparações'};
  document.getElementById('pageTitle').textContent = titles[view] || '';
  closeMobileMenu();
  renderCurrentView();
}

document.getElementById('nav').addEventListener('click', (e)=>{
  const btn = e.target.closest('.nav-item');
  if(!btn || btn.classList.contains('disabled')) return;
  setView(btn.dataset.view);
});

document.getElementById('heroNav').addEventListener('click', (e)=>{
  const btn = e.target.closest('.hero-nav-btn');
  if(!btn || btn.classList.contains('disabled')) return;
  setView(btn.dataset.view);
});

/* ============ MENU MOBILE ============ */
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const btnMenu = document.getElementById('btnMenu');
function openMobileMenu(){ sidebar.classList.add('open'); overlay.classList.add('show'); btnMenu.setAttribute('aria-expanded','true'); }
function closeMobileMenu(){ sidebar.classList.remove('open'); overlay.classList.remove('show'); btnMenu.setAttribute('aria-expanded','false'); }
btnMenu.addEventListener('click', ()=> sidebar.classList.contains('open') ? closeMobileMenu() : openMobileMenu());
overlay.addEventListener('click', closeMobileMenu);

/* ============ TEMA CLARO/ESCURO (estado em memória, sem localStorage) ============ */
const btnTheme = document.getElementById('btnTheme');
btnTheme.addEventListener('click', ()=>{
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('themeIcon').textContent = isDark ? '🌙' : '☀️';
  document.getElementById('themeLabel').textContent = isDark ? 'Tema escuro' : 'Tema claro';
  btnTheme.setAttribute('aria-pressed', String(!isDark));
});

/* ============ FILTROS — ANO (global) E INDICADOR/COMPONENTE (Dashboard) ============ */
['selAno','selIndicador','selComponente'].forEach(id=>{
  document.getElementById(id).addEventListener('change', (e)=>{
    if(id==='selAno'){
      state.ano = e.target.value;
      popularSelectMunicipios(getDataset(state.ano));
    }
    if(id==='selIndicador') state.indicador = e.target.value;
    if(id==='selComponente') state.componente = e.target.value;
    renderCurrentView();
  });
});

/* ============ BUSCA DE MUNICÍPIO (global, no topo da página) ============
   Campo de texto + datalist (em vez de <select>) para dar busca por nome entre
   os 185 municípios — digitar filtra as sugestões do navegador; só um rótulo
   que bate exatamente com um município (escolhido da lista ou digitado por
   completo) muda o estado, senão o campo volta pro último município válido. */
document.getElementById('selMunicipio').addEventListener('change', (e)=>{
  const data = getDataset(state.ano);
  const m = encontrarMunicipioPorRotulo(data, e.target.value);
  if(m){
    state.municipioIdx = data.indexOf(m);
    renderCurrentView();
  } else {
    e.target.value = data[state.municipioIdx] ? rotuloMunicipio(data[state.municipioIdx]) : '';
  }
});

/* ============ FILTROS — DASHBOARD ============ */
document.getElementById('pillsPeso').addEventListener('click', (e)=>{
  const btn = e.target.closest('.pill'); if(!btn) return;
  document.querySelectorAll('#pillsPeso .pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  state.peso = btn.dataset.peso;
  renderDashboard();
});

/* ============ FILTROS — MAPA ============ */
document.getElementById('selCamadaMapa').addEventListener('change', (e)=>{
  state.mapaCamada = e.target.value;
  renderMapaGeo();
});
document.getElementById('selMunicipioMapa').addEventListener('change', (e)=>{
  if(e.target.value === ''){ mapaSelecionado = null; renderMapaGeo(); return; }
  const m = encontrarMunicipioPorRotulo(getDataset(state.ano), e.target.value);
  if(m){ mapaSelecionado = m.codigo; renderMapaGeo(); }
  else e.target.value = '';
});

/* ============ FILTROS — COMPARAÇÕES ============ */
document.getElementById('selCompA').addEventListener('change', (e)=>{
  const data = getDataset(state.ano);
  const m = encontrarMunicipioPorRotulo(data, e.target.value);
  if(m){ state.compA = data.indexOf(m); renderComparacoes(); }
  else e.target.value = data[state.compA] ? rotuloMunicipio(data[state.compA]) : '';
});
document.getElementById('selCompB').addEventListener('change', (e)=>{
  const data = getDataset(state.ano);
  const m = encontrarMunicipioPorRotulo(data, e.target.value);
  if(m){ state.compB = data.indexOf(m); renderComparacoes(); }
  else e.target.value = data[state.compB] ? rotuloMunicipio(data[state.compB]) : '';
});

/* ============ EXPORTAÇÃO — RELATÓRIOS ============ */
document.getElementById('btnExportCSV').addEventListener('click', exportarCSV);
document.getElementById('btnExportExcel').addEventListener('click', exportarExcel);
document.getElementById('btnExportPNG').addEventListener('click', ()=>{
  exportarImagemSVG('chartRankingRelatorio', `sanedata_ranking_${state.ano}.png`);
});
document.getElementById('btnImprimir').addEventListener('click', ()=> window.print());

/* ============ INIT ============ */
function popularSelectAnos(){
  const sel = document.getElementById('selAno');
  clear(sel);
  anosDisponiveis().forEach(ano=>{
    const opt = document.createElement('option');
    opt.value = ano; opt.textContent = ano;
    sel.appendChild(opt);
  });
  sel.value = state.ano;
}

function mostrarErroCarregamento(erro){
  document.getElementById('heroErro').innerHTML =
    `<div class="placeholder-box"><h2>Não foi possível carregar os dados</h2>` +
    `<p>Falha ao buscar <code>data/processed/painel_pe.json</code> (${erro.message}). ` +
    `Rode o pipeline em <code>data/scripts/</code> (veja <code>data/scripts/README.md</code>) e sirva a pasta por HTTP ` +
    `(ex.: <code>python -m http.server</code>), já que navegadores bloqueiam <code>fetch</code> em arquivos abertos direto como <code>file://</code>.</p></div>`;
}

async function iniciar(){
  try{
    await carregarPainel();
  } catch(erro){
    mostrarErroCarregamento(erro);
    return;
  }
  try{
    await carregarMalha();
  } catch(erro){
    malhaErro = erro; // só afeta a view Mapa — Tela Inicial/Dashboard não dependem da malha
  }
  popularSelectAnos();
  popularSelectMunicipios(getDataset(state.ano));
}
iniciar();
