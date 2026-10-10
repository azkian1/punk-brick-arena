// Disposable browser-response instrumentation. No QA mutations ship in the game.
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { createServer } from 'vite';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const output = process.env.PERF_BATTLE_OUTPUT || 'artifacts/performance-battle-audit';
const sourcePaths = (await readdir('src', { recursive: true }))
  .map(path => 'src/' + path.replaceAll('\\', '/'))
  .filter(path => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('/test-fixtures/'))
  .sort();
const hashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const report = { recordedAt: new Date().toISOString(), environment: { cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), node: process.version, headless: true, server: 'loopback Vite development; no prebundling', viewport: { width: 1872, height: 879 }, deviceScaleFactor: 1 }, sourceHashes: await hashes(), errors: [], scenarios: [], restarts: [] };
await mkdir(output, { recursive: true });
let server, browser;
const injected = `
window.__loadFrozen = true;
sound.muted = true;
let qaSeed = 927;
const reseed = () => { qaSeed=927; Math.random=()=>{qaSeed=(Math.imul(qaSeed,1664525)+1013904223)>>>0;return qaSeed/4294967296;}; };
let qaRecord = null, qaMass = 0;
for (const [name,get,set] of [
  ['tick',()=>tick,f=>tick=f], ['draw',()=>draw,f=>draw=f], ['bots',()=>bot,f=>bot=f],
  ['drops',()=>updateDrops,f=>updateDrops=f], ['aim',()=>pointerAim,f=>pointerAim=f]
]) {
  const original=get(); set(function(...args){const begin=performance.now();try{return original(...args);}finally{if(qaRecord)qaRecord[name].push(performance.now()-begin);}});
}
const qaCounts=()=>({phase,elapsed:stats.elapsed,round:round.number,mass:window.__arenaSnapshot.mass,
  drops:drops.length,airborne:drops.filter(d=>!d.settled).length,shots:shots.length,
  shotsFired:actors.map(a=>a.shotsFired),dashStarts:actors.map(a=>a.dashStarts),pieces:actors.map(a=>a.structure.pieces.size),
  reserve:actors.map(a=>a.structure.evolution?.reserve.length||0),capacity:droppedView.instanceMatrix.count,
  calls:renderer.renderer.info.render.calls,triangles:renderer.renderer.info.render.triangles,
  geometries:renderer.renderer.info.memory.geometries,textures:renderer.renderer.info.memory.textures,
  jsHeap:performance.memory?.usedJSHeapSize});
const qaEnter=number=>{window.__loadFrozen=true;reseed();startRound();while(round.number<number){for(const a of actors.slice(1))a.structure.pieces.delete(a.structure.coreId);beginRound(nextBattleRound(CHARACTER_TEMPLATES,round));}sound.muted=true;draw(0);updateUI();};
window.__loadQA={
  enter:qaEnter,counts:qaCounts,
  full:async()=>{
    const {evolutionPlan}=await import('/src/game/evolution.ts');
    for(const [index,actor] of actors.entries()){
      const plan=evolutionPlan(actor.template,'mosher',3);
      const pieces=plan.slots.map((part,i)=>({...part,id:'load/'+actor.id+'/'+i,position:{...part.position},size:{...part.size},color:actor.template.pieces[i%actor.template.pieces.length].color}));
      const core=pieces[actor.template.pieces.findIndex(part=>part.id===actor.template.coreId)].id;
      actor.structure=createStructure({...actor.template,pieces,coreId:core});
      actor.structure.evolution={id:'mosher',stage:3,template:actor.template,plan,occupied:pieces.map(p=>p.id),everBuilt:new Set(pieces.map((_,i)=>i)),reserve:[],reserveRevision:0};
      round.participants[index].structure=actor.structure;actor.boundsRevision=-1;updateBounds(actor);clampToArena(actor);
    }
    draw(0);updateUI();
  },
  debris:count=>{
    drops=[];
    // Physically separated settled cells, rather than 12,000 overlapping seed drops.
    const prototype={id:'load-drop',position:{x:0,y:0,z:0},size:{x:1,y:.4,z:1},shape:'plate',color:'#b9ac81'};
    const radius=debrisRadius(prototype),cover=buildings.map(b=>({b,
      minX:b.x+b.bounds.min.x*CONFIG.characterScale-radius,maxX:b.x+b.bounds.max.x*CONFIG.characterScale+radius,
      minZ:b.z+b.bounds.min.z*CONFIG.characterScale-radius,maxZ:b.z+b.bounds.max.z*CONFIG.characterScale+radius}));
    for(let cell=0;cell<22500&&drops.length<count;cell++){
      const x=-75+(cell%150),z=-75+Math.floor(cell/150);
      if(cover.some(o=>x>=o.minX&&x<=o.maxX&&z>=o.minZ&&z<=o.maxZ&&segmentBuildingHit(x,z,x,z,o.b,radius)!==null))continue;
      const piece={...prototype,id:'load-drop/'+drops.length};
      drops.push({piece,ownerId:null,x,z,y:debrisFloorY(piece),vx:0,vy:0,vz:0,age:6,settled:true,rotation:0});
    }
    if(drops.length!==count)throw new Error('not enough clear cells for physical debris fixture');
    draw(0);return qaCounts();
  },
  stock:count=>{
    // Explicit stress grant, retaining source geometry/colors and non-Core IDs.
    for(const actor of actors){
      const source=actor.template.pieces.filter(part=>part.id!==actor.template.coreId);
      actor.structure.evolution.reserve=Array.from({length:count},(_,i)=>{
        const part=source[i%source.length];return {...part,id:'load-stock/'+actor.id+'/'+i,position:{...part.position},size:{...part.size}};
      });
      actor.structure.evolution.reserveRevision++;
    }
    draw(0);return qaCounts();
  },
  demolish:()=>{
    const target=[...buildings].sort((a,b)=>b.structure.pieces.size-a.structure.pieces.size)[0];
    const before=target.structure.pieces.size,start=performance.now();let removed=0;
    for(let i=0;i<2;i++){
      const result=damageArenaBuilding(target,20,Math.random,{x:target.x,z:target.z});
      const parts=[...result.direct,...result.cascade];removed+=parts.length;drops.push(...createBuildingDebris(target,parts,buildings));
    }
    draw(0);return {forcedImpacts:2,power:20,before,removed,remaining:target.structure.pieces.size,setupMs:performance.now()-start};
  },
  measure:async(live,millis)=>{
    qaMass=window.__arenaSnapshot.mass;const before=qaCounts();qaRecord={tick:[],draw:[],bots:[],drops:[],aim:[]};
    window.__loadFrozen=!live;const intervals=[],steps=[],longTasks=[];
    const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(entry=>({start:entry.startTime,duration:entry.duration}))));
    observer.observe({type:'longtask',buffered:false});
    const begin=performance.now();let previous=begin,lastTicks=0;
    await new Promise(resolve=>{
      const next=now=>{intervals.push(now-previous);previous=now;steps.push(qaRecord.tick.length-lastTicks);lastTicks=qaRecord.tick.length;
        if(now-begin>=millis)resolve();else requestAnimationFrame(next);};requestAnimationFrame(next);
    });
    window.__loadFrozen=true;touchMovement={x:0,z:0};firing=false;
    const values=qaRecord;qaRecord=null;observer.disconnect();const after=qaCounts();
    if(after.mass!==qaMass)throw new Error('physical inventory changed during workload');
    return {mode:live?'actual live fixed-step battle and rendering':'rendering with frozen simulation',wallMs:performance.now()-begin,before,after,intervals,steps,longTasks,values};
  },
  profile:()=>{window.__loadFrozen=true;for(let i=0;i<120&&phase==='playing';i++)tick(1/60);},
  restart:()=>{qaEnter(1);return qaCounts();},
};
`;
const summary = values => {
  if (!values.length) return { samples: 0 };
  const sorted=[...values].sort((a,b)=>a-b),at=q=>sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))];
  return { samples:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),maxMs:at(1) };
};
try {
  server=await createServer({configFile:false,server:{host:'127.0.0.1',port:Number(process.env.PERF_BATTLE_PORT||5198),strictPort:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});await server.listen();
  const args=process.env.SOFTWARE_GPU?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[];
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args});
  report.environment.args=args;report.environment.browser=await browser.version();
  const context=await browser.newContext({viewport:report.environment.viewport,deviceScaleFactor:1,reducedMotion:'no-preference'});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await context.route('**/src/main.ts*',async route=>{
    const response=await route.fetch();let body=await response.text();assert(body.includes('tick(1 / 60);'));
    body=body.replace('tick(1 / 60);','if (!window.__loadFrozen) tick(1 / 60);')+injected;await route.fulfill({response,body});
  });
  const loadBegin=performance.now();await page.goto('http://127.0.0.1:'+server.config.server.port+'/',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__loadQA);
  report.navigationToReadyMs=performance.now()-loadBegin;
  report.environment.webgl=await page.evaluate(()=>{const gl=document.querySelector('#arena').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmaskedRenderer:ext&&gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)};});
  const browserSession=await browser.newBrowserCDPSession();report.environment.gpu=(await browserSession.send('SystemInfo.getInfo')).gpu;
  const session=await context.newCDPSession(page);
  const selected=process.env.PERF_BATTLE_SCENARIOS?.split(',');
  for(const scenario of [
    {name:'native-round-1',round:1,live:true,input:true},
    {name:'native-round-4',round:4,live:true,input:true},
    {name:'forced-building-demolition',round:4,live:true,demolish:true},
    {name:'settled-4000-live',round:4,live:true,debris:4000},
    {name:'settled-12000-render',round:4,live:false,debris:12000},
    {name:'settled-12000-live',round:4,live:true,debris:12000},
    {name:'large-reserve-live',round:4,live:true,input:true,stock:5000},
    {name:'four-full-forms-live',round:4,live:true,full:true},
  ].filter(scenario=>!selected||selected.includes(scenario.name))){
    const setupBegin=performance.now();await page.evaluate(number=>window.__loadQA.enter(number),scenario.round);
    let fixture;
    if(scenario.full)await page.evaluate(()=>window.__loadQA.full());
    if(scenario.debris)fixture=await page.evaluate(count=>window.__loadQA.debris(count),scenario.debris);
    if(scenario.stock)fixture=await page.evaluate(count=>window.__loadQA.stock(count),scenario.stock);
    if(scenario.demolish)fixture=await page.evaluate(()=>window.__loadQA.demolish());
    const setupMs=performance.now()-setupBegin;
    if(scenario.input){await page.keyboard.down('KeyW');await page.keyboard.down('KeyD');await page.keyboard.press('Space');await page.mouse.move(1000,420);await page.mouse.down();}
    const measurement=await page.evaluate(live=>window.__loadQA.measure(live,4000),scenario.live);
    if(scenario.input){await page.mouse.up();await page.keyboard.up('KeyW');await page.keyboard.up('KeyD');}
    const result={name:scenario.name,setupMs,fixture,...measurement,intervals:summary(measurement.intervals),framesOver50Ms:measurement.intervals.filter(ms=>ms>50).length,framesOver100Ms:measurement.intervals.filter(ms=>ms>100).length,steps:{samples:measurement.steps.length,mean:measurement.steps.reduce((a,b)=>a+b,0)/measurement.steps.length,max:Math.max(...measurement.steps)},cpu:Object.fromEntries(Object.entries(measurement.values).map(([key,values])=>[key,summary(values)]))};
    delete result.values;report.scenarios.push(result);console.log(JSON.stringify({name:result.name,frames:result.intervals,tick:result.cpu.tick,bots:result.cpu.bots,drops:result.cpu.drops,draw:result.cpu.draw,phase:result.after.phase,dropsAfter:result.after.drops,errors:report.errors.length}));
    await page.screenshot({path:output+'/'+scenario.name+'.png'});
  }
  // Attribute simulation cost in a separate profile, outside frame measurements.
  await page.evaluate(()=>window.__loadQA.enter(4));await page.evaluate(()=>window.__loadQA.debris(4000));
  await session.send('Profiler.enable');await session.send('Profiler.start');await page.evaluate(()=>window.__loadQA.profile());
  const {profile}=await session.send('Profiler.stop');await writeFile(output+'/simulation.cpuprofile',JSON.stringify(profile));
  const restartSnapshot=async restarts=>{
    // Let old frame scopes retire, then read actual V8 usage. performance.memory
    // is a cached browser estimate and can lag a forced GC by an entire sample.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await session.send('HeapProfiler.collectGarbage');
    const postGcHeap=await session.send('Runtime.getHeapUsage');
    report.restarts.push({restarts,postGcHeap,...await page.evaluate(()=>window.__loadQA.counts())});
  };
  await page.evaluate(()=>window.__loadQA.restart());await restartSnapshot(0);
  for(let count=1;count<=20;count++){await page.evaluate(()=>window.__loadQA.restart());if(count%5===0)await restartSnapshot(count);}
  report.sourceHashesAfter=await hashes();report.sourcesUnchangedDuringRun=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);
  assert(report.sourcesUnchangedDuringRun);assert.deepEqual(report.errors,[]);report.ok=true;
}catch(error){report.ok=false;report.failure={message:error.message,stack:error.stack};throw error;}
finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser?.close();await server?.close();}
console.log(JSON.stringify({ok:report.ok,output,errors:report.errors.length,restarts:report.restarts.map(r=>({n:r.restarts,heap:r.jsHeap,postGcHeap:r.postGcHeap,geometries:r.geometries,textures:r.textures,capacity:r.capacity}))}));
