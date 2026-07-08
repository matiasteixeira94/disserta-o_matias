/* ============ ESTATÍSTICA ============ */
function minMax(arr){ return [Math.min(...arr), Math.max(...arr)]; }
function normalizeCol(data, key){
  const vals = data.map(d=>d[key]);
  const [mn,mx] = minMax(vals);
  return vals.map(v => (mx-mn) ? (v-mn)/(mx-mn) : 0);
}
function buildMatrix(data){
  const cols = TODOS_INDICADORES.map(k => normalizeCol(data,k));
  return data.map((_,i) => TODOS_INDICADORES.map((_,j)=>cols[j][i]));
}
function equalWeights(m){ return new Array(m).fill(1/m); }
function entropyWeights(matrix){
  const n = matrix.length, m = matrix[0].length, w=[];
  for(let j=0;j<m;j++){
    let col = matrix.map(r=>r[j]); let sum = col.reduce((a,b)=>a+b,0) || 1e-9;
    let e=0;
    col.forEach(v=>{ const p=v/sum; if(p>0) e += p*Math.log(p); });
    e = -e/Math.log(n);
    w.push(1-e);
  }
  const sw = w.reduce((a,b)=>a+b,0) || 1e-9;
  return w.map(x=>x/sw);
}
function pcaWeights(matrix){
  const n=matrix.length, m=matrix[0].length;
  const means = new Array(m).fill(0);
  matrix.forEach(row=>row.forEach((v,j)=>means[j]+=v/n));
  const cov = Array.from({length:m},()=>new Array(m).fill(0));
  for(let j=0;j<m;j++) for(let k=0;k<m;k++){
    let s=0; matrix.forEach(row=>s+=(row[j]-means[j])*(row[k]-means[k]));
    cov[j][k]=s/(n-1);
  }
  let v = new Array(m).fill(1/Math.sqrt(m));
  for(let it=0; it<200; it++){
    const nv = new Array(m).fill(0);
    for(let j=0;j<m;j++) for(let k=0;k<m;k++) nv[j]+=cov[j][k]*v[k];
    const norm = Math.sqrt(nv.reduce((a,b)=>a+b*b,0)) || 1e-9;
    v = nv.map(x=>x/norm);
  }
  const abs = v.map(Math.abs);
  const s = abs.reduce((a,b)=>a+b,0) || 1e-9;
  return abs.map(x=>x/s);
}
function computeWeights(scheme, matrix){
  if(scheme==="entropia") return entropyWeights(matrix);
  if(scheme==="pca") return pcaWeights(matrix);
  return equalWeights(matrix[0].length);
}
function computeIndex(data, scheme){
  const matrix = buildMatrix(data);
  const w = computeWeights(scheme, matrix);
  return matrix.map(row => row.reduce((acc,val,idx)=>acc+val*w[idx],0)*100);
}
function rank(arr){
  const idx = arr.map((v,i)=>i).sort((a,b)=>arr[a]-arr[b]);
  const r = new Array(arr.length);
  idx.forEach((originalIdx,pos)=>{ r[originalIdx]=pos+1; });
  return r;
}
/* rank em ordem decrescente (1 = maior valor) — usado nos rótulos "Nª maior..." da interface */
function rankDesc(arr){
  const n = arr.length;
  return rank(arr).map(r => n+1-r);
}
function spearman(a,b){
  const ra = rank(a), rb = rank(b), n=a.length;
  let d2 = 0;
  for(let i=0;i<n;i++){ const d = ra[i]-rb[i]; d2 += d*d; }
  return 1 - (6*d2)/(n*(n*n-1));
}
function forcaCorrelacao(rho){
  const a = Math.abs(rho);
  if(a < 0.3) return "fraca";
  if(a < 0.6) return "moderada";
  return "forte";
}
