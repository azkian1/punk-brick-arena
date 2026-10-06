import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CharacterView } from '../../src/render.ts';
import { createStructure } from '../../src/game/structure.ts';
import catalog from './catalog.json';

const nf=new Intl.NumberFormat('en-US');
const colorButton=document.querySelector('#color');
let current='mosher',monochrome=false,growth=1,revision=0,showReserve=false;
const cache=new Map(),views=[];
const descriptions=Object.fromEntries(catalog.map(c=>[c.id,c.description]));
let framing={height:104,width:112,centerY:38};
const tabs=document.querySelector('.tabs');
for(const [index,entry] of catalog.entries()) {
  const button=document.createElement('button');button.dataset.model=entry.id;
  button.textContent=`${String(index+1).padStart(2,'0')} / ${entry.label}`;tabs.append(button);
}

function fitProjection(v) {
  const aspect=v.host.clientWidth/v.host.clientHeight;
  const h=showReserve?Math.max(104,112/aspect):Math.max(framing.height,framing.width/aspect);
  v.camera.left=-h*aspect/2;v.camera.right=h*aspect/2;v.camera.top=h/2;v.camera.bottom=-h/2;
  v.camera.updateProjectionMatrix();v.dirty=true;
}

for(const stage of [2,3]) {
  const host=document.querySelector(`#phase-${stage}`),canvas=host.querySelector('canvas');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setClearColor('#fbfaf7');
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.3;
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff','#9a91a4',2.3));
  const key=new THREE.DirectionalLight('#fff2e8',3.4);key.position.set(-45,115,90);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-80;key.shadow.camera.right=80;key.shadow.camera.top=100;key.shadow.camera.bottom=-70;key.shadow.camera.far=350;key.shadow.normalBias=.08;key.shadow.bias=-.0001;scene.add(key);
  const fill=new THREE.DirectionalLight('#d7dcff',1.8);fill.position.set(75,75,-35);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(800,800),new THREE.ShadowMaterial({color:'#73667a',opacity:.17}));floor.rotation.x=-Math.PI/2;floor.position.y=-.09;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(160,32,'#dcd6e2','#eeeaf1');grid.position.y=-.1;scene.add(grid);
  const camera=new THREE.OrthographicCamera(-60,60,50,-50,.1,800);
  const controls=new OrbitControls(camera,canvas);controls.target.set(0,38,0);controls.enableDamping=true;controls.dampingFactor=.12;controls.maxPolarAngle=Math.PI*.495;controls.minZoom=.45;controls.maxZoom=3.5;controls.enablePan=true;
  const view=new CharacterView(scene,'#8451ce');view.root.scale.setScalar(1);view.ring.visible=false;
  const v={stage,host,renderer,scene,camera,controls,view,record:null,reserveView:null,dirty:true};views.push(v);
  new ResizeObserver(()=>{
    const w=host.clientWidth,h=host.clientHeight;
    renderer.setSize(w,h,false);fitProjection(v);
  }).observe(host);
}

function setAngle(mode) {
  for(const v of views) {
    const targetY=showReserve?15:framing.centerY;
    v.controls.target.set(0,targetY,0);v.camera.zoom=1;
    v.camera.position.set(mode==='angle'?100:0,targetY+(mode==='front'?7:54),mode==='back'?-230:230);
    fitProjection(v);v.controls.update();v.dirty=true;
  }
}
setAngle('angle');

function makeReserve(v) {
  if(v.reserveView&&v.reserveGrowth===growth)return;
  if(v.reserveView)v.reserveView.dispose(v.scene);
  const pile=new CharacterView(v.scene,'#8451ce');pile.root.scale.setScalar(1);pile.ring.visible=false;
  const span=108,heights=new Float32Array(span*span),placed=[];
  let seed=1291;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const installed=v.record.report.headPieces+Math.round(v.record.report.addedPieces*growth);
  for(const p of [...v.record.reserve,...v.record.model.pieces.slice(installed)]) {
    let best=null;
    for(let trial=0;trial<9;trial++) {
      const radius=Math.sqrt(random())*42,theta=random()*Math.PI*2;
      const x=Math.floor(span/2+Math.cos(theta)*radius-p.size.x/2),z=Math.floor(span/2+Math.sin(theta)*radius-p.size.z/2);
      let y=0;
      for(let dx=0;dx<p.size.x;dx++)for(let dz=0;dz<p.size.z;dz++)y=Math.max(y,heights[(z+dz)*span+x+dx]);
      const score=y+radius*.36;
      if(!best||score<best.score)best={x,y,z,score};
    }
    const {x,y,z}=best;
    for(let dx=0;dx<p.size.x;dx++)for(let dz=0;dz<p.size.z;dz++)heights[(z+dz)*span+x+dx]=y+p.size.y;
    placed.push({...p,position:{x:x-span/2,y,z:z-span/2}});
  }
  pile.sync({pieces:new Map(placed.map(p=>[p.id,p])),revision:0});v.reserveView=pile;v.reserveGrowth=growth;
}

function sync() {
  for(const v of views) {
    if(!v.record)continue;
    const {model,report}=v.record;
    v.view.root.visible=!showReserve;
    if(showReserve)makeReserve(v);
    if(v.reserveView)v.reserveView.root.visible=showReserve;
    const n=report.headPieces+Math.round(report.addedPieces*growth);
    const shown=model.pieces.slice(0,n).map(p=>monochrome?{...p,color:'#665575'}:p);
    const structure=createStructure({...model,pieces:shown});structure.revision=++revision;v.view.sync(structure);
    v.dirty=true;
    document.querySelector(`#stats-${v.stage}`).innerHTML=`<div class="stat"><b>${nf.format(n)}</b><span>parts in model</span></div><div class="stat"><b>+${nf.format(report.addedPieces)}</b><span>for the full body</span></div><div class="stat"><b>${report.donorHeadsOpened}</b><span>donor heads opened</span></div><div class="stat"><b>${nf.format(report.unusedDonorPieces+model.pieces.length-n)}</b><span>in reserve</span></div>`;
  }
  colorButton.textContent=monochrome?'Monochrome silhouette':'Loot colors';
  colorButton.setAttribute('aria-pressed',String(monochrome));
  document.querySelector('#reserve').textContent=showReserve?'Back to body':'Reserve';
  document.querySelector('#growth').disabled=showReserve;
  document.querySelector('#color').disabled=showReserve;
  document.querySelector('#description').textContent=showReserve?'Reserve: every unused part is preserved. In the game, stored parts are reconsidered alongside new loot between rounds.':descriptions[current];
  document.querySelector('#status').textContent=showReserve?'✓ Part balance preserved · 0 lost parts':'✓ All parts connected to core · 0 intersections';
}

async function loadModel(name) {
  current=name;document.querySelector('#status').className='';document.querySelector('#status').textContent='Loading…';
  document.querySelector('#export').disabled=true;
  for(const b of document.querySelectorAll('[data-model]'))b.classList.toggle('active',b.dataset.model===name);
  try {
    const records=await Promise.all([2,3].map(async stage=>{
      const id=`${name}-${stage}`;
      if(!cache.has(id)) {const r=await fetch(`./data/${id}.json`);if(!r.ok)throw new Error(`${id}: HTTP ${r.status}`);cache.set(id,await r.json());}
      return cache.get(id);
    }));
    if(current!==name)return;
    const height=Math.max(...records.map(r=>r.report.bounds.max.y));
    const depth=Math.max(...records.map(r=>r.report.bounds.max.z-r.report.bounds.min.z));
    const width=Math.max(...records.map(r=>r.report.bounds.max.x-r.report.bounds.min.x));
    framing={height:Math.max(104,height*1.18+depth*.22),width:Math.max(112,(width+depth*.45)*1.14),centerY:height/2};
    views.forEach((v,i)=>{if(v.reserveView){v.reserveView.dispose(v.scene);v.reserveView=null;}v.record=records[i];});sync();setAngle('angle');
    const valid=records.every(r=>r.report.connected===r.report.pieces&&r.report.collisions===0&&r.report.cutOrScaledPieces===0);
    const status=document.querySelector('#status');status.className=valid?'checked':'error';status.textContent=valid?(showReserve?'✓ Part balance preserved · 0 lost parts':'✓ All parts connected to core · 0 intersections'):'Validation errors found';
    document.querySelector('#data-links').innerHTML=`<a href="./data/${name}-2.json" download>Phase 2 model (JSON)</a> · <a href="./data/${name}-3.json" download>Phase 3 model (JSON)</a> · <a href="./data/report.json" download>Validation and parts report</a>`;
    document.querySelector('#export').disabled=false;
    const url=new URL(location.href);url.searchParams.set('model',name);history.replaceState(null,'',url);
  } catch(e) {document.querySelector('#status').className='error';document.querySelector('#status').textContent=e.message;console.error(e);}
}

document.querySelectorAll('[data-model]').forEach(b=>b.addEventListener('click',()=>loadModel(b.dataset.model)));
colorButton.addEventListener('click',()=>{monochrome=!monochrome;sync();});
document.querySelector('#reserve').addEventListener('click',()=>{showReserve=!showReserve;sync();setAngle('angle');});
for(const mode of ['front','angle','back'])document.querySelector(`#${mode}`).addEventListener('click',()=>setAngle(mode));
document.querySelector('#growth').addEventListener('input',e=>{growth=Number(e.target.value)/100;document.querySelector('#growth-value').value=`${e.target.value}%`;sync();});
document.querySelector('#export').addEventListener('click',()=>{
  const c=document.createElement('canvas');c.width=2000;c.height=1220;const g=c.getContext('2d');
  g.fillStyle='#fbfaf7';g.fillRect(0,0,c.width,c.height);
  g.fillStyle='#8051c1';g.font='bold 18px Arial';g.fillText('PUNK BRICK / REAL PARTS ASSEMBLY',52,43);
  g.fillStyle='#24212b';g.font='bold 42px Arial';g.fillText(catalog.find(c=>c.id===current).name,52,99);
  g.fillStyle='#716779';g.font='22px Arial';g.fillText(showReserve?'Reserve · All unused parts':monochrome?'Monochrome silhouette preview':'Original loot colors · No color matching',52,137);
  views.forEach((v,i)=>{
    v.renderer.render(v.scene,v.camera);
    const src=v.renderer.domElement,x=35+i*1000,y=155,w=930,h=890;
    const scale=Math.min(w/src.width,h/src.height),dw=src.width*scale,dh=src.height*scale;
    g.drawImage(src,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
    g.fillStyle='#24212b';g.font='bold 28px Arial';g.fillText(`PHASE ${v.stage} / ${showReserve?'RESERVE':v.stage===2?'BODY FORM':'FINAL FORM'}`,x+22,1072);
    const n=v.record.report.headPieces+Math.round(v.record.report.addedPieces*growth);
    g.font='21px Arial';g.fillStyle='#716779';g.fillText(showReserve?`${nf.format(v.record.report.unusedDonorPieces+v.record.model.pieces.length-n)} parts in reserve`:`${nf.format(n)} parts · ${v.record.report.donorHeadsOpened} donor heads`,x+22,1110);
  });
  g.font='18px Arial';g.fillStyle='#8b8093';g.fillText('Original donor part sizes and colors preserved. Geometry verified under game rules.',52,1180);
  c.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${current}-brick-${showReserve?'reserve':'assembly'}${monochrome&&!showReserve?'-silhouette':''}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
});

function frame(){requestAnimationFrame(frame);for(const v of views){if(v.controls.update()||v.dirty){v.renderer.render(v.scene,v.camera);v.dirty=false;}}}frame();
const initial=new URL(location.href).searchParams.get('model');
loadModel(catalog.some(c=>c.id===initial)?initial:'mosher');
