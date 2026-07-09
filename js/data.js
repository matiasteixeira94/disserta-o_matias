/* =========================================================================
   DADOS — carregados em tempo de execução a partir de data/processed/painel_pe.json,
   gerado pelo pipeline em data/scripts/ (fontes oficiais: IBGE, SINAN/SIH-SUS,
   SINISA/SNIS — ver data/scripts/README.md). Este arquivo não contém nenhum
   valor de indicador embutido: se o JSON não existir ou algum campo não
   tiver sido apurado ainda, o dado aparece como ausente na interface, nunca
   como um número inventado.
   ========================================================================= */
const INDICADORES_DEFICIT = ["deficitAgua","deficitEsgoto","deficitResiduos"];
const INDICADORES_SAUDE   = ["taxaDengue","taxaChikungunya","taxaDiarreia"];
const TODOS_INDICADORES   = [...INDICADORES_DEFICIT, ...INDICADORES_SAUDE]; // todos os indicadores rastreados (tabelas, exportação, mapa por camada)
/* indicadores usados no ÍNDICE COMPOSTO de priorização — deficitResiduos fica de fora
   enquanto não houver nenhuma fonte de dado disponível (nem manual nem automatizada;
   ver data/scripts/README.md, seção 04/04b): incluí-lo faria o índice nunca fechar
   em nenhum município/ano, já que hoje é sempre nulo. Assim que resíduos tiver dado
   real, basta devolvê-lo a esta lista. */
const INDICADORES_INDICE  = ["deficitAgua","deficitEsgoto", ...INDICADORES_SAUDE];

const LABELS = {
  deficitAgua:"Déficit de água", deficitEsgoto:"Déficit de esgoto", deficitResiduos:"Déficit de resíduos",
  taxaDengue:"Dengue", taxaChikungunya:"Chikungunya", taxaDiarreia:"Diarreia aguda"
};
const LABEL_PESO = { igual:"pesos iguais", entropia:"entropia de Shannon", pca:"PCA (1º componente)" };

let PAINEL = null; // payload bruto de data/processed/painel_pe.json
let state = { ano:null, indicador:"taxaDengue", componente:"deficitAgua", municipioIdx:0, peso:"igual", mapaCamada:"indice", compA:0, compB:1 };

/* ============ CARREGAMENTO DOS DADOS REAIS ============ */
async function carregarPainel(){
  const resp = await fetch('data/processed/painel_pe.json', { cache:'no-store' });
  if(!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar data/processed/painel_pe.json`);
  PAINEL = await resp.json();
  state.ano = anoPadrao();
}

/* ano inicial: o mais recente em que o índice composto já é calculável (pelo menos 2
   municípios com os indicadores de INDICADORES_INDICE completos) — sem isso, o ano mais
   recente (anoFim) apareceria "vazio" no Dashboard sempre que a fonte de dado mais nova
   ainda não tiver saneamento apurado (ex.: 2024 no momento em que este código foi escrito).
   Cai para anoFim se nenhum ano tiver dado suficiente ainda. */
function anoPadrao(){
  for(let a = PAINEL.anoFim; a >= PAINEL.anoInicio; a--){
    const completos = comDadosCompletos(getDataset(a), INDICADORES_INDICE);
    if(completos.length >= 2) return String(a);
  }
  return String(PAINEL.anoFim);
}

function anosDisponiveis(){
  if(!PAINEL) return [];
  const anos = [];
  for(let a = PAINEL.anoFim; a >= PAINEL.anoInicio; a--) anos.push(String(a));
  return anos;
}

/* município x ano -> objeto plano usado pelas telas (nomes de campo iguais aos do protótipo original) */
function getDataset(ano){
  if(!PAINEL) return [];
  return PAINEL.municipios
    .filter(m => String(m.ano) === String(ano))
    .map(m => ({
      codigo: m.codigo_ibge, nome: m.municipio, uf: m.uf, pop: m.populacao,
      deficitAgua: m.deficitAgua, deficitEsgoto: m.deficitEsgoto, deficitResiduos: m.deficitResiduos,
      taxaDengue: m.taxaDengue, taxaChikungunya: m.taxaChikungunya, taxaDiarreia: m.taxaDiarreia,
    }))
    .sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* mantém só os municípios com valor real (não nulo) nas chaves pedidas */
function comDadosCompletos(data, chaves){
  return data.filter(m => chaves.every(k => m[k] !== null && m[k] !== undefined && !Number.isNaN(m[k])));
}

function round1(n){ return Math.round(n*10)/10; }
