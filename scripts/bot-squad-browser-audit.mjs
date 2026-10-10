// Real production ticks; forced round entry and granted fixtures are separate
// from native-map smoke runs. No fixture is evidence of human difficulty.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const output = process.env.SQUAD_AUDIT_OUTPUT || 'artifacts/bot-squad-audit';
const seed = Number(process.env.SQUAD_AUDIT_SEED || 927);
const report = { seed, mode: 'forced round entry; isolated real-inventory fixtures; native map smoke with stationary player', hashes: {}, fixtures: [], smoke: [], errors: [] };
await mkdir(output, { recursive: true });
let server, browser, page;
const instrumentation = `
const qaStock = (a,count) => {
  const s=a.structure.evolution;
  s.reserve=Array.from({length:count},(_,i)=>({...a.template.pieces[0],id:'qa-stock/'+a.id+'/'+i,position:{x:0,y:0,z:0},size:{x:1,y:1.2,z:1}}));
  s.reserveRevision++;
};
const qaClearCover = () => {buildingViews.forEach(v=>v.dispose(renderer.scene));buildings=[];buildingViews=[];};
const qaEnter = number => {
  startRound();
  while(round.number<number){
    // A forced transition fixture; new rounds still use the actual carry API.
    for(const a of actors.slice(1))a.structure.pieces.delete(a.structure.coreId);
    beginRound(nextBattleRound(CHARACTER_TEMPLATES,round));
  }
  renderer.shake=0;draw(0);updateUI();
};
window.__squadQA={
  state:()=>({...window.__arenaSnapshot,progress:actors.map(a=>({id:a.id,...evolutionProgress(a.structure)})),inventory:actors[0]&&[...actors[0].structure.pieces.values(),...(actors[0].structure.evolution?.reserve||[])].map(p=>[p.id,p.position,p.size,p.color,p.shape])}),
  step:n=>{for(let i=0;i<n;i++)tick(1/60);renderer.shake=0;draw(0);updateUI();return window.__squadQA.state();},
  enter:qaEnter,
  teamFixture:number=>{
    qaEnter(number);qaClearCover();
    for(const a of actors){a.bot=undefined;a.vx=a.vz=0;}
    const p=actors[0],a=actors[1],ally=actors[2],third=actors[3];
    a.x=-20;a.z=0;ally.x=0;ally.z=0;p.x=20;p.z=0;third.x=50;third.z=50;
    qaStock(a,10);updateBounds(a);updateBounds(ally);updateBounds(p);
    const allyIds=[...ally.structure.pieces.keys()],playerBefore=p.structure.pieces.size,priorMass=window.__arenaSnapshot.mass;
    fire(a,p.x,p.z,CONFIG.shotInterval,3);
    window.__squadQA.step(70);
    return {number,priorMass,mass:window.__arenaSnapshot.mass,playerBefore,playerAfter:p.structure.pieces.size,allyPreserved:allyIds.every(id=>ally.structure.pieces.has(id)),events:[...combatEvents]};
  },
  roleFixture:()=>{
    qaEnter(4);qaClearCover();drops=[];
    for(const [i,a] of actors.entries()){
      a.x=i===0?50:i===3?50:-50;a.z=i===0?-50:i===2?-50:50;a.vx=a.vz=0;
    }
    tick(1/60);const before=window.__squadQA.state(),a=actors[1],initial=a.structure.pieces.size;
    const displaced=[];
    while(a.structure.pieces.size>initial*.43){
      const batch=takeAmmunitionBatch(a.structure,20);if(!batch.length)break;
      for(const ammo of batch)displaced.push(ammo.piece);
    }
    updateBounds(a);
    // The removed parts really become ground inventory, then normal pickup
    // repairs the bot. No healing, duplication, or direct role mutation.
    for(const piece of displaced)drops.push({piece,ownerId:null,x:a.x,y:.3,z:a.z,vx:0,vy:0,vz:0,age:6,settled:true,rotation:0});
    const priorMass=window.__arenaSnapshot.mass;
    const switched=window.__squadQA.step(1),progress=[];
    for(let i=0;i<120&&phase==='playing';i++){
      tick(1/60);
      if(i%15===0)progress.push({elapsed:stats.elapsed,fighters:window.__arenaSnapshot.fighters});
      const f=window.__arenaSnapshot.fighters.find(f=>f.id===a.id);
      if(f.role!=='recover'&&a.structure.pieces.size>=initial*.85)break;
    }
    renderer.shake=0;draw(0);updateUI();
    return {before,switched,after:window.__squadQA.state(),initial,removed:displaced.length,priorMass,mass:window.__arenaSnapshot.mass,progress};
  },
  rapidFixture:(stock=240)=>{
    qaEnter(3);qaClearCover();drops=[];
    const a=actors[1],p=actors[0];
    for(const b of actors.slice(2))b.bot=undefined;
    a.x=-25;a.z=0;p.x=25;p.z=0;actors[2].x=-60;actors[2].z=60;actors[3].x=60;actors[3].z=60;
    qaStock(a,stock);const priorMass=window.__arenaSnapshot.mass,bodyBefore=a.structure.pieces.size,samples=[];
    for(let i=0;i<60&&phase==='playing';i++){tick(1/60);const f=window.__arenaSnapshot.fighters.find(f=>f.id===a.id);if(i===0||f.shotsFired!==samples.at(-1)?.shotsFired)samples.push({time:stats.elapsed,shotsFired:f.shotsFired,lastShotCount:f.lastShotCount,cooldown:f.cooldown,pieces:f.pieces,reserve:f.reserve});}
    renderer.shake=0;draw(0);updateUI();return {stock,bodyBefore,coreRetained:a.structure.pieces.has(a.structure.coreId),priorMass,mass:window.__arenaSnapshot.mass,samples,state:window.__squadQA.state()};
  },
  dashFixture:()=>{
    qaEnter(3);qaClearCover();drops=[];
    const a=actors[1],p=actors[0];a.x=0;a.z=0;p.x=24;p.z=0;
    for(const [i,b]of actors.slice(2).entries()){b.bot=undefined;b.x=-60;b.z=i?60:-60;}
    a.cooldown=100;qaStock(p,20);
    const start={x:a.x,z:a.z},priorMass=window.__arenaSnapshot.mass;
    fire(p,a.x,a.z,CONFIG.shotInterval,20);
    // Place the real group on its existing flight segment for an imminent
    // threat fixture; its pieces/age/damage still use production rules.
    const s=shots.at(-1);s.x=14;s.z=0;
    const state=window.__squadQA.step(1);return {start,priorMass,mass:window.__arenaSnapshot.mass,state};
  },
  growthFixture:(role='attacker')=>{
    qaEnter(4);qaClearCover();drops=[];
    const a=actors[role==='collector'?3:1],p=actors[0];
    for(const b of actors){b.bot=undefined;b.vx=b.vz=0;b.x=-65;b.z=b.id==='bot-2'?-65:65;}
    a.bot=createBot('balanced',()=>.75,'normal');a.x=a.z=0;p.x=55;p.z=-10;
    // Equal real stock keeps the initial attack pair healthy and equally armed,
    // so this isolates growth without triggering the new strength-based swap.
    for(const b of actors.slice(1))qaStock(b,24);
    updateBounds(a);
    // A rushing attacker keeps its existing short optional-pickup policy.
    // Measure this placement from the actual current form, before growth.
    const pickupRadiusAtStart=a.pickupRadius,lootDistance=pickupRadiusAtStart+10;
    const e=a.structure.evolution,slot=e.plan.slots.find((slot,i)=>!e.occupied[i]&&!e.everBuilt.has(i)&&e.plan.neighbors[i].some(n=>e.occupied[n]));
    if(!slot)throw new Error('growth fixture needs a real connected unbuilt slot');
    const part={...slot,id:'qa-growth/'+role,position:{...slot.position},size:{...slot.size},color:'#00aa77'};
    drops.push({piece:part,ownerId:null,x:0,y:debrisFloorY(part),z:lootDistance,vx:0,vy:0,vz:0,age:6,settled:true,rotation:0});
    updateBounds(a);updateBounds(p);
    const mass=window.__arenaSnapshot.mass,start={x:a.x,z:a.z},before=evolutionProgress(a.structure).built,samples=[];
    let installed=false;
    for(let i=0;i<600&&phase==='playing'&&!installed;i++){
      tick(1/60);installed=a.structure.pieces.has(part.id);
      if(i%6===0||installed){const f=window.__arenaSnapshot.fighters.find(f=>f.id===a.id);samples.push({time:stats.elapsed,x:a.x,z:a.z,role:f.role,intent:f.intent,targetId:f.targetId,shots:f.shotsFired,built:evolutionProgress(a.structure).built});}
    }
    renderer.shake=0;draw(0);updateUI();
    return{role,mass,afterMass:window.__arenaSnapshot.mass,start,pickupRadiusAtStart,lootDistance,before,after:evolutionProgress(a.structure).built,installed,part:installed?{id:part.id,size:part.size,shape:part.shape,color:a.structure.pieces.get(part.id).color}:null,samples};
  },
  harvestFixture:()=>{
    qaEnter(1);qaClearCover();drops=[];
    const a=actors[1],p=actors[0];
    for(const b of actors){b.bot=undefined;b.vx=b.vz=0;b.x=-65;b.z=b.id==='bot-2'?-65:65;}
    a.bot=createBot('balanced',()=>.75,'normal');a.x=a.z=0;p.x=-55;p.z=-50;qaStock(a,240);
    const e=a.structure.evolution,slot=e.plan.slots.find((slot,i)=>!e.occupied[i]&&!e.everBuilt.has(i)&&e.plan.neighbors[i].some(n=>e.occupied[n]));
    if(!slot)throw new Error('harvest fixture needs a real growth part');
    const columns=Math.max(1,Math.min(16,Math.floor(56/(slot.size.x*CONFIG.characterScale)))),rows=Math.max(1,Math.min(16,Math.floor(24/(slot.size.z*CONFIG.characterScale))));
    const parts=[];
    for(let x=0;x<columns;x++)for(let z=0;z<rows;z++)parts.push({...slot,id:'qa-harvest/'+x+'/'+z,size:{...slot.size},position:{x:(x-columns/2)*slot.size.x,y:0,z:(z-rows/2)*slot.size.z},color:'#00aa77'});
    const structure={pieces:new Map(parts.map(part=>[part.id,part])),coreId:parts[0].id,vacancies:[],revision:0,roundStartPieces:parts.length,coreExposed:true};
    const b={id:'qa-harvest',template:'ruin',x:0,z:40,structure,bounds:getBounds(structure)};buildings=[b];
    const v=new CharacterView(renderer.scene,'#8c9b8d');v.root.position.set(b.x,0,b.z);v.sync(structure);v.ring.visible=v.core.visible=false;buildingViews=[v];
    updateBounds(a);updateBounds(p);
    const ids=new Set(parts.map(part=>part.id)),mass=window.__arenaSnapshot.mass,start={x:a.x,z:a.z},before=evolutionProgress(a.structure).built,samples=[];
    let previousShots=0,installed=0,maxReserve=0;
    for(let i=0;i<1500&&phase==='playing';i++){
      tick(1/60);installed=[...a.structure.pieces.keys()].filter(id=>ids.has(id)).length;maxReserve=Math.max(maxReserve,e.reserve.filter(part=>ids.has(part.id)).length);
      if(a.shotsFired!==previousShots){samples.push({time:stats.elapsed,shots:a.shotsFired,count:a.lastShotCount,cooldown:a.cooldown,x:a.x,z:a.z,remaining:b.structure.pieces.size,built:evolutionProgress(a.structure).built});previousShots=a.shotsFired;}
      if(installed>0&&samples.length>=5)break;
    }
    renderer.shake=0;draw(0);updateUI();
    return{mass,afterMass:window.__arenaSnapshot.mass,start,before,after:evolutionProgress(a.structure).built,initialParts:parts.length,remaining:b.structure.pieces.size,installed,maxReserve,samples,events:combatEvents.filter(event=>event.kind==='building'),coreAlive:alive(a)};
  },
  stopBots:()=>{for(const a of actors)a.bot=undefined;},
};
`;

function roleMap(state) { return Object.fromEntries(state.fighters.filter(f=>f.id!=='player').map(f=>[f.id,f.role])); }
try {
  let url=process.env.SQUAD_AUDIT_URL;
  if(!url){
    const port=Number(process.env.SQUAD_AUDIT_PORT||5196);
    server=await createServer({configFile:false,server:{host:'127.0.0.1',port,strictPort:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});
    await server.listen();url='http://127.0.0.1:'+port+'/';
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1872,height:879},reducedMotion:'reduce'});
  await context.addInitScript(initial=>{
    let s=initial;window.__qaFrozen=true;
    Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
  },seed);
  await context.route('**/src/**/*.ts*',async route=>{
    const response=await route.fetch();let body=await response.text();const name=new URL(route.request().url()).pathname;
    report.hashes[name]=createHash('sha256').update(body).digest('hex');
    if(name==='/src/main.ts'){
      assert(body.includes('tick(1 / 60);'),'main fixed-step marker changed');
      body=body.replace('tick(1 / 60);','if (!window.__qaFrozen) tick(1 / 60);').replaceAll('requestAnimationFrame(frame);','if (!window.__qaFrozen) requestAnimationFrame(frame);');
      body+=instrumentation;
    }
    await route.fulfill({response,body});
  });
  page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__squadQA);
  await page.locator('[data-evolution="frontman"]').click();
  for(const number of [1,2,3,4,6]){
    await page.evaluate(n=>window.__squadQA.enter(n),number);
    const state=await page.evaluate(()=>window.__squadQA.step(1)),bots=state.fighters.slice(1);
    assert.equal(state.round,number);assert.equal(state.aliveCount,4);
    if(number===1)assert.equal(new Set(state.fighters.map(f=>f.teamId)).size,4);
    if(number===2){assert.equal(bots[0].teamId,bots[1].teamId);assert.notEqual(bots[0].teamId,bots[2].teamId);assert.notEqual(bots[2].teamId,state.fighters[0].teamId);}
    if(number>=3){assert.equal(new Set(bots.map(f=>f.teamId)).size,1);assert.notEqual(bots[0].teamId,state.fighters[0].teamId);assert(bots.every(f=>f.targetId==='player'));}
    if(number>=4){assert.equal(bots.filter(f=>f.role==='collector').length,1);assert.equal(bots.filter(f=>f.role==='attacker').length,2);}
    report.fixtures.push({roundPolicy:number,fighters:state.fighters});
  }
  for(const number of [2,3]){
    const fixture=await page.evaluate(n=>window.__squadQA.teamFixture(n),number);
    assert(fixture.allyPreserved,'allied body damaged');assert(fixture.playerAfter<fixture.playerBefore,'hostile player was not hit');
    assert.equal(fixture.mass,fixture.priorMass);assert(fixture.events.every(e=>e.targetId!=='bot-2'));
    report.fixtures.push({friendlyFire:fixture});
  }
  const roles=await page.evaluate(()=>window.__squadQA.roleFixture());
  assert.equal(roleMap(roles.before)['bot-3'],'collector');assert.equal(roleMap(roles.switched)['bot-1'],'recover');
  assert.equal(roleMap(roles.switched)['bot-3'],'attacker');assert.equal(roles.switched.fighters[1].desiredShotCount,0);
  assert.notEqual(roleMap(roles.after)['bot-1'],'recover');assert.equal(roles.mass,roles.priorMass);
  assert(roles.after.fighters[1].pieces>=roles.initial*.85,'real pickup failed to restore wounded bot');
  report.fixtures.push({injurySwapAndRealRepair:roles});
  for(const stock of [240,0]){
    const rapid=await page.evaluate(stock=>window.__squadQA.rapidFixture(stock),stock);
    assert.equal(rapid.mass,rapid.priorMass);assert(rapid.state.fighters[1].shotsFired>=3,'healthy later bot did not fire near cooldown');assert(rapid.coreRetained);
    const fired=rapid.samples.filter(s=>s.shotsFired>0);for(let i=1;i<fired.length;i++){assert(fired[i].time-fired[i-1].time>=.23-1e-6,'bot bypassed shot cooldown');assert(fired[i].time-fired[i-1].time<=.23+1/60+1e-6,'healthy bot cadence slower than allowed cooldown');}
    assert(fired.every(s=>s.lastShotCount>=1&&s.lastShotCount<=20));
    if(stock===0){assert(fired.every(s=>s.lastShotCount<=Math.max(1,Math.ceil(rapid.bodyBefore*.01))),'body volleys lost the survival budget');assert(rapid.state.fighters[1].pieces<rapid.bodyBefore,'body fire was free');}
    else assert.equal(rapid.state.fighters[1].pieces,rapid.bodyBefore,'stocked volley spent body parts');
    report.fixtures.push({realRapidFire:rapid});
  }
  const dash=await page.evaluate(()=>window.__squadQA.dashFixture());const bot=dash.state.fighters[1];
  assert.equal(dash.mass,dash.priorMass);assert.equal(bot.dashStarts,1,'imminent shot did not trigger real dash');
  assert(bot.dash.remaining>0&&bot.dash.remaining<=.18);assert(bot.dash.cooldown>2.3&&bot.dash.cooldown<=2.4);
  assert(Math.hypot(bot.x-dash.start.x,bot.z-dash.start.z)>.3);
  await page.keyboard.press('p');const paused=await page.evaluate(()=>window.__squadQA.state());const later=await page.evaluate(()=>window.__squadQA.step(120));
  assert.equal(later.elapsed,paused.elapsed);assert.deepEqual(later.fighters.map(f=>f.dash),paused.fighters.map(f=>f.dash));
  await page.keyboard.press('p');await page.evaluate(()=>window.__squadQA.enter(1));
  const reset=await page.evaluate(()=>window.__squadQA.state());assert(reset.fighters.every(f=>f.dashStarts===0&&f.dash.remaining===0&&f.dash.cooldown===0));
  report.fixtures.push({realDashPauseRestart:dash});
  for(const role of ['attacker','collector']){
    const growth=await page.evaluate(role=>window.__squadQA.growthFixture(role),role);
    report.fixtures.push({growthWhileFighting:growth});
    assert.equal(growth.mass,growth.afterMass);assert(growth.installed&&growth.after>growth.before,'bot failed to install real growth loot');
    assert(growth.samples.some(sample=>sample.z>growth.start.z+1&&sample.shots>0&&sample.intent==='collect'&&sample.targetId==='player'),'bot did not collect and fire while moving');
    assert(growth.samples.every(sample=>sample.role===role),'growth fixture changed its assigned squad role');
    await page.screenshot({path:output+'/growth-'+role+'.png'});
  }
  const harvest=await page.evaluate(()=>window.__squadQA.harvestFixture());
  report.fixtures.push({earlyRoundRapidHarvestAndRealGrowth:harvest});
  assert.equal(harvest.mass,harvest.afterMass);assert(harvest.coreAlive&&harvest.installed>0&&harvest.after>harvest.before,'harvesting failed to produce actual growth');
  assert(harvest.samples.length>=5&&harvest.events.length>0,'harvest failed to shoot real cover repeatedly');
  assert(harvest.samples.every(sample=>sample.count>=1&&sample.count<=4),'harvesting spent an excessive volley');
  for(let i=1;i<5;i++){const spacing=harvest.samples[i].time-harvest.samples[i-1].time;assert(spacing>=.23-1e-6&&spacing<=.23+1/60+1e-6,'early harvesting has an extra delay or bypasses cooldown');}
  assert(harvest.samples.some(sample=>sample.z>harvest.start.z+2),'harvesting bot did not approach its resources');
  await page.screenshot({path:output+'/rapid-harvest-growth.png'});
  for(const number of [1,2,3,4,6]){
    await page.evaluate(n=>window.__squadQA.enter(n),number);let state=await page.evaluate(()=>window.__squadQA.state());const mass=state.mass,samples=[];
    for(let seconds=0;seconds<30&&state.phase==='playing';seconds+=2){
      state=await page.evaluate(()=>window.__squadQA.step(120));assert.equal(state.mass,mass,'native smoke lost physical inventory');
      samples.push({elapsed:state.elapsed,phase:state.phase,fighters:state.fighters,progress:state.progress,events:state.events.slice(-8)});
      for(const event of state.events.filter(e=>e.kind==='actor')){
        if(number===2)assert(!(['bot-1','bot-2'].includes(event.ownerId)&&['bot-1','bot-2'].includes(event.targetId)),'round2 allies hit each other');
        if(number>=3)assert(!(event.ownerId.startsWith('bot-')&&event.targetId.startsWith('bot-')),'coalition bots hit each other');
      }
    }
    assert(state.fighters.slice(1).some(f=>f.shotsFired>0),'native bots failed to attack or harvest');
    const smoke={round:number,elapsed:state.elapsed,phase:state.phase,outcome:state.outcome,mass,progress:state.progress,samples};report.smoke.push(smoke);
    console.log(JSON.stringify({round:number,elapsed:state.elapsed,outcome:state.outcome,shots:state.fighters.slice(1).map(f=>f.shotsFired),dashes:state.fighters.slice(1).map(f=>f.dashStarts),built:state.progress.slice(1).map(f=>f.built),ok:true}));
  }
  assert(report.smoke.some(run=>run.samples.some(sample=>sample.progress.some(f=>f.id!=='player'&&f.built>0))),'native bots never grew their real authored bodies');
  assert.deepEqual(report.errors,[]);report.ok=true;
}catch(e){report.ok=false;report.failure={message:e.message,stack:e.stack};try{report.failure.snapshot=await page?.evaluate(()=>window.__squadQA?.state());}catch{}throw e;}
finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser?.close();await server?.close();}
console.log(JSON.stringify({ok:true,fixtures:report.fixtures.length,smoke:report.smoke.length,errors:report.errors.length}));
