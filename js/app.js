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

/* ============ FILTROS — MUNICÍPIO/ANO (globais, no topo da página) E INDICADOR/COMPONENTE (Dashboard) ============ */
['selMunicipio','selAno','selIndicador','selComponente'].forEach(id=>{
  document.getElementById(id).addEventListener('change', (e)=>{
    if(id==='selMunicipio') state.municipioIdx = Number(e.target.value);
    if(id==='selAno'){
      state.ano = e.target.value;
      popularSelectMunicipios(getDataset(state.ano));
    }
    if(id==='selIndicador') state.indicador = e.target.value;
    if(id==='selComponente') state.componente = e.target.value;
    renderCurrentView();
  });
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

/* ============ FILTROS — COMPARAÇÕES ============ */
document.getElementById('selCompA').addEventListener('change', (e)=>{
  state.compA = Number(e.target.value);
  renderComparacoes();
});
document.getElementById('selCompB').addEventListener('change', (e)=>{
  state.compB = Number(e.target.value);
  renderComparacoes();
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
