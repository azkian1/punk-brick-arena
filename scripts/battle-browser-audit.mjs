// Disposable response instrumentation; production modules and rules stay active.
// Assisted matches and granted fixtures are reported separately, not as balance evidence.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const output = process.env.BATTLE_AUDIT_OUTPUT || 'artifacts/battle-audit';
const port = Number(process.env.BATTLE_AUDIT_PORT || 5194);
const seed = Number(process.env.BATTLE_AUDIT_SEED || 413);
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['mosher', 'guitar', 'spider', 'bass', 'frontman'];
const matches = Number(process.env.BATTLE_AUDIT_MATCHES || 1);
await mkdir(output, { recursive: true });
const report = { seed, mode: 'production four-actor fixed-step assisted matches and separate granted fixtures', hashes: {}, matches: [], fixtures: [], errors: [] };
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
await server.listen();
let browser;
let page;
const instrumentation = `
window.__battleQA = {
  state: () => ({...window.__arenaSnapshot, dropAges:drops.map(d=>d.age),
    botGoals:actors.map(a=>{const bot=a.id==='player'?window.__controller:a.bot;const b=bot?.battle;return {id:a.id,goal:b?.goal,route:b?.route,routeFailed:b?.routeFailed,targetId:b?.targetId,lootId:b?.lootId,moveX:bot?.moveX,moveZ:bot?.moveZ};}),
    stock:actors.map(a=>(a.structure.evolution?.reserve||[]).map(p=>p.id)),
    inventory:actors[0]&&[...actors[0].structure.pieces.values(),...(actors[0].structure.evolution?.reserve||[])].map(p=>[p.id,p.position,p.size,p.color,p.shape]),
    dash:{...dash}, cooldowns:actors.map(a=>a.cooldown), shotAges:shots.map(s=>s.age),
    victory:victory&&{elapsed:victory.elapsed,collected:victory.collected,pending:victory.pending.size}}),
  step:n=>{for(let i=0;i<n;i++)tick(1/60);updateUI();draw(0);return window.__battleQA.state()},
  autoplay:n=>{
    window.__controller??=createBot('aggressor',Math.random,'normal');
    for(let i=0;i<n&&(phase==='playing'||phase==='collecting');i++){
      const p=actors[0];
      if(phase==='playing'&&alive(p)){
        const action=thinkBattleBot(window.__controller,p,actors.filter(a=>a!==p&&alive(a)),drops,shots.filter(s=>s.mode==='shot'),buildings,1/60,simTime);
        touchMovement={x:action.x,z:action.z};
        if(action.fire)fire(p,action.aimX,action.aimZ,action.shotInterval,action.shotCount);
      }
      tick(1/60);
    }
    touchMovement={x:0,z:0};updateUI();draw(0);return window.__battleQA.state();
  },
  restart:()=>{window.__controller=null;startRound();updateUI();draw(0)},
  volleyFixture:count=>{
    window.__battleQA.restart();
    for(const view of buildingViews)view.dispose(renderer.scene);
    buildings=[];buildingViews=[];for(const a of actors)a.bot=undefined;
    const p=actors[0],e=actors[1];p.x=0;p.z=0;e.x=18;e.z=0;
    actors[2].x=-45;actors[2].z=-45;actors[3].x=45;actors[3].z=45;
    const before=p.structure.pieces.size+(p.structure.evolution?.reserve.length||0),priorMass=window.__arenaSnapshot.mass;
    p.cooldown=0;fire(p,e.x,e.z,CONFIG.shotInterval,count);
    const s=shots.at(-1),ids=s.pieces.map(p=>p.id),damage=s.damage,groups=shots.length,meshParts=s.mesh.getObjectByName('projectile-body').count,meshBatches=s.mesh.children.length;
    const renderTime=simTime;simTime=1;draw(0);simTime=renderTime;const groupYaw=s.mesh.rotation.y;
    const spent=before-p.structure.pieces.size-(p.structure.evolution?.reserve.length||0);
    for(let i=0;i<90&&!combatEvents.length;i++)tick(1/60);
    return {count,damage,direct:stats.direct,groups,meshParts,meshBatches,groupYaw,spent,ids,dropCount:drops.filter(d=>ids.includes(d.piece.id)).length,
      locks:drops.filter(d=>ids.includes(d.piece.id)).map(d=>d.lockedUntilAge),priorMass,mass:window.__arenaSnapshot.mass};
  },
  runeFixture:()=>{
    window.__battleQA.restart();for(const a of actors)a.bot=undefined;
    const p=actors[0];p.x=0;p.z=0;for(const piece of p.structure.pieces.values())piece.color='#ff00ff';p.structure.revision++;
    const priorMass=window.__arenaSnapshot.mass;
    tick(29);const early={...rune};tick(1);const collected={...rune};
    const headColors=p.structure.evolution.occupied.slice(0,p.structure.evolution.plan.headCount).map(id=>p.structure.pieces.get(id)?.color),expected=p.structure.evolution.plan.slots.slice(0,p.structure.evolution.plan.headCount).map(p=>p.color);
    p.x=-57;p.z=57;tick(29);const waiting={...rune};tick(1);draw(0);updateUI();
    return {early,collected,waiting,respawn:{...rune},headColors,expected,visible:runeView.visible,priorMass,mass:window.__arenaSnapshot.mass};
  },
  fullBodyRune:()=>{
    for(const a of actors)a.bot=undefined;
    const p=actors[0],priorMass=window.__arenaSnapshot.mass,stock=JSON.stringify(p.structure.evolution.reserve);
    const installed=[...p.structure.pieces.values()].map(p=>[p.id,p.position,p.size,p.shape]);
    p.x=0;p.z=0;rune=createRune();tick(30);draw(0);updateUI();
    const state=p.structure.evolution,bodyColors=state.occupied.slice(state.plan.headCount).filter(Boolean).map(id=>p.structure.pieces.get(id)?.color);
    return {collected:rune.collected,priorMass,mass:window.__arenaSnapshot.mass,installedPreserved:JSON.stringify(installed)===JSON.stringify([...p.structure.pieces.values()].map(p=>[p.id,p.position,p.size,p.shape])),stockPreserved:stock===JSON.stringify(state.reserve),bodyColors:[...new Set(bodyColors)]};
  },
  quiet:()=>{for(const a of actors)if(a.bot)a.cooldown=100000;},
  defeat:id=>{
    const a=actors.find(a=>a.id===id);
    for(let i=0;i<2&&alive(a);i++){const result=damageStructure(a.structure,a.structure.pieces.size,()=>.5);knockOff(a,[...result.direct,...result.cascade]);}
    eliminate(a);tick(0);updateUI();draw(0);return window.__battleQA.state();
  },
  stockFixture:id=>{
    const a=actors.find(a=>a.id===id),ammo=takeAmmunitionBatch(a.structure,1)[0];
    if(ammo){a.structure.evolution.reserve.push(ammo.piece);a.structure.evolution.reserveRevision++;}
    updateBounds(a);return ammo&&ammo.piece.id;
  },
  firingFixture:()=>{
    const p=actors[0];p.x=0;p.z=0;p.cooldown=0;window.__battleQA.quiet();
    const sx=CONFIG.arenaWidth*.36,sz=CONFIG.arenaDepth*.36;
    for(const [i,[x,z]] of [[-sx,sz],[-sx,-sz],[sx,-sz]].entries()){actors[i+1].x=x;actors[i+1].z=z;}
    const part=window.__battleQA.stockFixture('player');const before=p.structure.pieces.size;
    fire(p,1000,1000);const s=shots.at(-1);window.__firedFixtureId=s.piece.id;
    return {part,id:s.piece.id,before,after:p.structure.pieces.size,reserve:p.structure.evolution.reserve.length,color:s.piece.color,size:s.piece.size};
  },
  lockedDrop:async()=>{
    const {canCollectDrop}=await import('/src/game/pickup.ts');
    const d=drops.find(d=>d.piece.id===window.__firedFixtureId);
    return d&&{id:d.piece.id,age:d.age,settled:d.settled,eligible:actors.map(a=>canCollectDrop(d,a.id)),locked:d.lockedUntilAge};
  },
  closeShot:(isolated=false)=>{
    if(isolated){
      for(const view of buildingViews)view.dispose(renderer.scene);
      buildings=[];buildingViews=[];
      for(const a of actors)if(a.bot)a.bot=undefined;
    }
    const p=actors[0],e=actors[1];window.__battleQA.quiet();combatEvents.length=0;p.x=0;p.z=0;e.x=Math.max(13,p.radius+e.radius+8);e.z=0;
    actors[2].x=-42;actors[2].z=-42;actors[3].x=42;actors[3].z=42;
    p.cooldown=0;const before=e.structure.pieces.size,priorMass=window.__arenaSnapshot.mass;
    fire(p,e.x,e.z);const id=shots.at(-1).piece.id;
    for(let i=0;i<90&&!combatEvents.some(e=>e.kind==='actor');i++)tick(1/60);
    updateUI();draw(0);return {before,after:e.structure.pieces.size,id,partPresent:drops.some(d=>d.piece.id===id),mass:window.__arenaSnapshot.mass,priorMass};
  },
  coverShot:()=>{
    window.__battleQA.quiet();combatEvents.length=0;const p=actors[0],e=actors[1];
    window.__battleQA.stockFixture('player');const piece=p.structure.evolution.reserve[0];
    let b,placement;
    const free=(point,radius)=>Math.abs(point.x)+radius<CONFIG.arenaWidth/2&&Math.abs(point.z)+radius<CONFIG.arenaDepth/2&&buildings.every(other=>segmentBuildingHit(point.x,point.z,point.x,point.z,other,radius+.05)===null);
    for(const candidate of buildings.filter(b=>b.template==='wall')){
      const minX=candidate.x+candidate.bounds.min.x*CONFIG.characterScale,maxX=candidate.x+candidate.bounds.max.x*CONFIG.characterScale;
      const minZ=candidate.z+candidate.bounds.min.z*CONFIG.characterScale,maxZ=candidate.z+candidate.bounds.max.z*CONFIG.characterScale;
      const midX=(minX+maxX)/2,midZ=(minZ+maxZ)/2;
      const options=[
        [{x:minX-p.radius-2,z:midZ},{x:maxX+e.radius+2,z:midZ}],
        [{x:maxX+p.radius+2,z:midZ},{x:minX-e.radius-2,z:midZ}],
        [{x:midX,z:minZ-p.radius-2},{x:midX,z:maxZ+e.radius+2}],
        [{x:midX,z:maxZ+p.radius+2},{x:midX,z:minZ-e.radius-2}],
      ];
      placement=options.find(([start,end])=>free(start,p.radius)&&free(end,e.radius)&&firstBattleImpact({piece,ownerId:p.id,mode:'shot',settled:false,...start},end.x,end.z,[],buildings)?.target===candidate);
      if(placement){b=candidate;break;}
    }
    if(!b)throw new Error('No valid cover fixture placement');
    Object.assign(p,placement[0]);Object.assign(e,placement[1]);
    p.cooldown=0;const before=b.structure.pieces.size,enemyBefore=e.structure.pieces.size,priorMass=window.__arenaSnapshot.mass;
    fire(p,e.x,e.z);
    for(let i=0;i<90&&!combatEvents.some(e=>e.kind==='building'&&e.targetId===b.id);i++)tick(1/60);
    updateUI();draw(0);return {before,after:b.structure.pieces.size,enemyBefore,enemyAfter:e.structure.pieces.size,priorMass,mass:window.__arenaSnapshot.mass};
  },
  finalHit:()=>{
    window.__battleQA.quiet();
    for(const id of ['bot-2','bot-3'])window.__battleQA.defeat(id);
    const p=actors[0],e=actors[1];
    const bank=e.structure.evolution.reserve;e.structure.evolution.reserve=[];e.structure.evolution.reserveRevision++;
    for(let ammo;(ammo=takeAmmunitionBatch(e.structure,1)[0]);)bank.push(ammo.piece);
    for(const piece of bank)drops.push({piece,ownerId:e.id,x:-CONFIG.arenaWidth*.36,z:CONFIG.arenaDepth*.36,y:1.5,vx:0,vy:0,vz:0,age:0,settled:false,rotation:0});
    e.bot=undefined;updateBounds(e);p.x=0;p.z=0;e.x=13;e.z=0;
    const priorMass=window.__arenaSnapshot.mass;
    p.cooldown=0;fire(p,-1000,-1000);p.cooldown=0;fire(p,e.x,e.z);
    const ids=shots.slice(-2).map(s=>s.piece.id);
    for(let i=0;i<90&&phase==='playing';i++)tick(1/60);
    return {phase,elapsed:stats.elapsed,priorMass,mass:window.__arenaSnapshot.mass,parts:ids.map(id=>{const d=drops.find(d=>d.piece.id===id);return d&&{id,age:d.age,lock:d.lockedUntilAge};})};
  },
  finalDefeat:()=>{
    window.__battleQA.restart();
    for(const view of buildingViews)view.dispose(renderer.scene);
    buildings=[];buildingViews=[];for(const a of actors)a.bot=undefined;
    const p=actors[0],e=actors[1],pendingTarget=actors[2];p.x=0;p.z=0;e.x=13;e.z=0;
    pendingTarget.x=-13;pendingTarget.z=0;actors[3].x=45;actors[3].z=45;
    p.cooldown=0;fire(p,pendingTarget.x,pendingTarget.z);
    for(const a of [p,pendingTarget]){
      const bank=a.structure.evolution.reserve;a.structure.evolution.reserve=[];a.structure.evolution.reserveRevision++;
      for(let ammo;(ammo=takeAmmunitionBatch(a.structure,1)[0]);)bank.push(ammo.piece);
      for(const piece of bank)drops.push({piece,ownerId:a.id,x:-57,z:57,y:1.5,vx:0,vy:0,vz:0,age:0,settled:false,rotation:0});
      updateBounds(a);
    }
    const priorMass=window.__arenaSnapshot.mass;
    e.cooldown=0;fire(e,1000,-1000);e.cooldown=0;fire(e,p.x,p.z);
    // Forced contacts: both real shots would destroy a bare Core this frame.
    // The later enemy shot is processed first; no further attack may follow it.
    for(const [s,target] of [[shots[0],pendingTarget],[shots.at(-1),p]]){
      const core=target.structure.pieces.get(target.structure.coreId);
      s.x=target.x+(core.position.x+core.size.x)*CONFIG.characterScale+s.radius+.2;
      s.z=target.z+(core.position.z+core.size.z/2)*CONFIG.characterScale;s.vx=-CONFIG.projectileSpeed;s.vz=0;
    }
    const ids=shots.map(s=>s.piece.id);
    firing=true;keys.add('KeyQ');
    for(let i=0;i<90&&phase==='playing';i++)tick(1/60);
    return {phase,outcome:window.__arenaSnapshot.outcome,alive:actors.filter(alive).length,elapsed:stats.elapsed,
      priorMass,mass:window.__arenaSnapshot.mass,projectiles:shots.length,pendingTargetAlive:alive(pendingTarget),events:[...combatEvents],
      parts:ids.map(id=>{const d=drops.find(d=>d.piece.id===id);return d&&{id,age:d.age,lock:d.lockedUntilAge};})};
  },
  grantBody:async stage=>{
    const {collectPiece,advanceEvolution}=await import('/src/game/evolution.ts');
    const a=actors[0];
    const fill=()=>{
      const s=a.structure.evolution,missing=s.plan.slots.map((_,i)=>i).filter(i=>i>=s.plan.headCount&&(!s.occupied[i]||!a.structure.pieces.has(s.occupied[i])));
      for(const i of missing)collectPiece(a.structure,{...s.plan.slots[i],id:'granted/'+s.stage+'/'+i,color:i%2?'#bb77dd':'#44aabb'});
      while(assembleReserve(a.structure,1000).length){}
    };
    fill();if(stage===3){advanceEvolution(a.structure);fill();}
    updateBounds(a);clampToArena(a);updateUI();draw(0);
    return evolutionProgress(a.structure);
  },
  frameCorners:()=>{
    const a=actors[0],old={x:a.x,z:a.z},result=[];
    for(const x of [-1,1])for(const z of [-1,1]){
      a.x=x*CONFIG.arenaWidth/2;a.z=z*CONFIG.arenaDepth/2;clampToArena(a);draw(0);
      const b=a.bounds,points=[];
      for(const px of [b.min.x,b.max.x])for(const py of [b.min.y,b.max.y])for(const pz of [b.min.z,b.max.z])points.push(a.view.body.localToWorld(new THREE.Vector3(px,py,pz)).project(renderer.camera));
      result.push({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))});
    }
    a.x=old.x;a.z=old.z;draw(0);return result;
  },
};
`;

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1872, height: 879 }, reducedMotion: 'reduce' });
  await context.addInitScript(initial => {
    let state = initial;
    window.__qaFrozen = true;
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }, seed);
  await context.route('**/src/**/*.ts*', async route => {
    const response = await route.fetch(); let body = await response.text();
    const name = new URL(route.request().url()).pathname;
    report.hashes[name] = createHash('sha256').update(body).digest('hex');
    if (name === '/src/main.ts') {
      assert(body.includes('tick(1 / 60);'), 'Main loop marker changed');
      body = body.replace('tick(1 / 60);', 'if (!window.__qaFrozen) tick(1 / 60);');
      body = body.replaceAll('requestAnimationFrame(frame);', 'if (!window.__qaFrozen) requestAnimationFrame(frame);');
      body += instrumentation;
    }
    await route.fulfill({ response, body });
  });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__battleQA);
  for (const path of paths) {
    await page.locator(`[data-evolution="${path}"]`).click();
    await page.locator('[data-action="start"]').click();
    let initial = await page.evaluate(() => window.__battleQA.step(0));
    assert.equal(initial.fighters.length, 4); assert.equal(initial.aliveCount, 4);
    assert(initial.buildings.length >= 15); assert.equal(new Set(initial.buildings.map(b => b.template)).size, 5);
    if (path === paths[0]) await page.screenshot({ path: `${output}/arena-desktop.png` });
    for (let match = 0; match < matches; match++) {
      let current = initial;
      for (let batch = 0; batch < 120 && current.phase !== 'result'; batch++) {
        current = await page.evaluate(() => window.__battleQA.autoplay(600));
        assert.equal(current.mass, initial.mass, `${path}: physical part lost or duplicated`);
        if (batch % 12 === 0) console.log(JSON.stringify({ path, batch, elapsed: current.elapsed, alive: current.aliveCount, drops: current.drops, fighters: current.fighters, events: current.events.slice(-3) }));
      }
      assert.equal(current.phase, 'result', `${path}: round failed to conclude in 1200 simulated seconds`);
      assert(['victory','defeat'].includes(current.outcome));
      if(current.outcome==='victory'){assert.equal(current.aliveCount,1);assert.equal(current.winner,'player');}
      else assert.equal(current.player.alive,false);
      report.matches.push({ path, round: current.round, elapsed: current.elapsed, outcome:current.outcome, aliveAtEnd:current.aliveCount, winner: current.winner, placement: current.placement, mass: current.mass, shots: current.stats.shots, hits: current.stats.hits, buildingsLeft: current.buildings.filter(b => b.pieces).length });
      console.log(JSON.stringify(report.matches.at(-1)));
      if (match + 1 < matches) {
        const action = current.winner === 'player' ? 'next' : 'restart';
        await page.locator(`[data-action="${action}"]`).filter({ visible: true }).click();
        initial = await page.evaluate(() => window.__battleQA.state());
        if (action === 'next') assert.deepEqual(initial.inventory, current.inventory);
      }
    }
    await page.evaluate(() => window.__battleQA.restart());
    await page.evaluate(() => window.__battleQA.quiet());
    const bodyForms = [];
    for (const stage of [2, 3]) {
      await page.evaluate(() => window.__battleQA.restart());
      await page.evaluate(() => window.__battleQA.quiet());
      const progress = await page.evaluate(stage => window.__battleQA.grantBody(stage), stage);
      assert.equal(progress.built, progress.target); assert.equal(progress.stage, stage);
      const corners = await page.evaluate(() => window.__battleQA.frameCorners());
      assert(corners.every(b => b.minX >= -1 && b.maxX <= 1 && b.minY >= -1 && b.maxY <= 1), `${path}: full body clipped at arena corner`);
      const close = await page.evaluate(() => window.__battleQA.closeShot(true));
      assert(close.after < close.before && close.partPresent, `${path} stage ${stage}: isolated full-form shot failed: ${JSON.stringify(close)}`); assert.equal(close.mass, close.priorMass);
      bodyForms.push({ stage, built: progress.built, target: progress.target, corners });
    }
    report.fixtures.push({ path, grantedCompleteBodyForms: bodyForms, combatFixture: 'isolated stationary rival, no cover, non-overlapping full body' });
    const paint=await page.evaluate(()=>window.__battleQA.fullBodyRune());
    assert.equal(paint.collected,1);assert.equal(paint.mass,paint.priorMass);assert(paint.installedPreserved&&paint.stockPreserved);
    assert(paint.bodyColors.every(color=>['#252936','#454c60','#8b5cf6','#c2ccd8','#674b36','#de684b','#36a995','#ca9b45','#a855b2'].includes(color)));
    report.fixtures.at(-1).oneTimeGrantedFullBodyRepaint=paint;
    if (path === paths[0]) await page.screenshot({ path: `${output}/final-form-desktop.png` });
    if ((await page.evaluate(() => window.__battleQA.state())).phase === 'playing') await page.keyboard.press('p');
    await page.locator('[data-action="lobby"]').filter({ visible: true }).click();
  }
  await page.locator('[data-action="start"]').click();
  assert.equal(await page.locator('.rival-card,.rival-roster,.match-clock,.reserve-panel--enemy').count(),0);
  assert.equal(await page.locator('.player-sidebar .match-hud:visible').count(),1);
  const slider=page.locator('[data-shot-count]');
  await slider.fill('20');await slider.dispatchEvent('input');
  assert.equal((await page.evaluate(()=>window.__arenaSnapshot)).shotCount,20);
  await slider.focus();await page.keyboard.press('ArrowLeft');
  assert.equal((await page.evaluate(()=>window.__arenaSnapshot)).shotCount,19);
  assert.equal((await page.evaluate(()=>window.__arenaSnapshot)).input.firing,false);
  await slider.fill('1');await slider.dispatchEvent('input');await page.locator('#arena').focus();
  report.fixtures.push('hidden rivals/counters, unified player summary and keyboard volley slider');
  for(const count of [1,3,20]){
    const volley=await page.evaluate(count=>window.__battleQA.volleyFixture(count),count);
    assert.equal(volley.damage,count);assert.equal(volley.direct,count);assert.equal(volley.spent,count);assert.equal(volley.groups,1);assert.equal(volley.meshParts,count);assert(volley.meshBatches<=2);
    if(count>1)assert.equal(volley.groupYaw,0,'packed shot and loot offsets must keep the same orientation');
    assert.equal(volley.dropCount,count);assert(volley.locks.every(lock=>lock===5));assert.equal(volley.mass,volley.priorMass);
    report.fixtures.push({realPartVolley:volley});
  }
  const rune=await page.evaluate(()=>window.__battleQA.runeFixture());
  assert.equal(rune.early.available,false);assert.equal(rune.collected.collected,1);assert.equal(rune.collected.available,false);
  assert.deepEqual(rune.headColors,rune.expected);assert.equal(rune.waiting.available,false);assert.equal(rune.respawn.available,true);
  assert.equal(rune.respawn.spawned,2);assert(rune.visible);assert.equal(rune.mass,rune.priorMass);
  report.fixtures.push({centerRune:rune});
  await page.screenshot({path:output+'/center-rune.png'});
  await page.evaluate(()=>window.__battleQA.restart());
  await page.evaluate(() => window.__battleQA.quiet());
  let initial = await page.evaluate(() => window.__battleQA.state());
  await page.keyboard.press('p');
  const paused = await page.evaluate(() => window.__battleQA.state());
  const still = await page.evaluate(() => window.__battleQA.step(120));
  assert.deepEqual({ ...still, drawCalls: 0 }, { ...paused, drawCalls: 0 });
  await page.keyboard.press('p'); report.fixtures.push('combat pause freezes logical state');
  const ammo = await page.evaluate(() => window.__battleQA.firingFixture());
  assert.equal(ammo.part, ammo.id); assert.equal(ammo.before, ammo.after); assert.equal(ammo.reserve, 0);
  let state = await page.evaluate(() => window.__battleQA.step(270));
  assert.equal(state.mass, initial.mass);
  const locked = await page.evaluate(() => window.__battleQA.lockedDrop());
  assert(locked && locked.settled && locked.age < 5); assert(locked.eligible.every(value => !value));
  await page.evaluate(() => window.__battleQA.step(80));
  const unlocked = await page.evaluate(() => window.__battleQA.lockedDrop());
  if (unlocked) assert(unlocked.age >= 5 && unlocked.eligible.every(Boolean));
  report.fixtures.push({ reserveFirst: ammo, reboundLockedDrop: locked, unlocked });
  await page.evaluate(() => window.__battleQA.restart());
  const close = await page.evaluate(() => window.__battleQA.closeShot());
  assert(close.after < close.before && close.partPresent); assert.equal(close.mass, close.priorMass);
  report.fixtures.push({ close });
  await page.evaluate(() => window.__battleQA.restart());
  const cover = await page.evaluate(() => window.__battleQA.coverShot());
  assert(cover.after < cover.before); assert.equal(cover.enemyAfter, cover.enemyBefore); assert.equal(cover.mass, cover.priorMass);
  report.fixtures.push({ cover });
  await page.evaluate(() => window.__battleQA.restart());
  const finalHit = await page.evaluate(() => window.__battleQA.finalHit());
  assert.equal(finalHit.phase, 'collecting'); assert.equal(finalHit.mass, finalHit.priorMass);
  assert(finalHit.parts.every(part => part && Math.abs(part.age - finalHit.elapsed) < 1e-9 && part.lock === 5));
  report.fixtures.push({ lastImpactAgesAllFiredParts: finalHit });
  const defeatHit=await page.evaluate(()=>window.__battleQA.finalDefeat());
  assert.equal(defeatHit.phase,'result');assert.equal(defeatHit.outcome,'defeat');assert.equal(defeatHit.alive,3);
  assert.equal(defeatHit.mass,defeatHit.priorMass);assert.equal(defeatHit.projectiles,0);
  assert.equal(defeatHit.pendingTargetAlive,true);assert.equal(defeatHit.events.length,1);assert.equal(defeatHit.events[0].targetId,'player');
  assert(defeatHit.parts.every(part=>part&&Math.abs(part.age-defeatHit.elapsed)<1e-9&&part.lock===5));
  assert.equal(await page.locator('#result-title').innerText(),'You Lost');
  assert((await page.locator('[data-result-badge]').innerText()).includes('DEFEAT'));
  assert(await page.locator('[data-action="next"]').isHidden());
  const stopped=await page.evaluate(()=>window.__battleQA.state());
  const stoppedLater=await page.evaluate(()=>window.__battleQA.step(120));
  assert.deepEqual({...stoppedLater,drawCalls:0},{...stopped,drawCalls:0});
  assert.equal(stopped.input.firing,false);assert.deepEqual(stopped.input.touchMovement,{x:0,z:0});
  report.fixtures.push({immediateLethalDefeat:defeatHit,combatFrozen:true});
  await page.evaluate(() => window.__battleQA.restart());
  await page.evaluate(() => window.__battleQA.quiet());
  initial = await page.evaluate(() => window.__battleQA.state());
  const stock = await page.evaluate(() => window.__battleQA.stockFixture('bot-1'));
  state = await page.evaluate(() => window.__battleQA.defeat('bot-1'));
  assert.equal(state.phase, 'playing'); assert.equal(state.aliveCount, 3); assert.equal(state.stock[1].length, 0);
  assert.equal(state.mass, initial.mass); report.fixtures.push({ eliminatedBank: stock });
  state = await page.evaluate(() => window.__battleQA.defeat('player'));
  assert.equal(state.phase, 'result'); assert.equal(state.outcome,'defeat'); assert.equal(state.aliveCount, 2); assert.equal(state.placement, 3);
  const deadPosition = state.player;
  await page.keyboard.down('d'); state = await page.evaluate(() => window.__battleQA.step(30)); await page.keyboard.up('d');
  assert.equal(state.player.x, deadPosition.x); assert.equal(state.player.z, deadPosition.z);
  assert.equal(state.phase, 'result'); assert.equal(state.winner,undefined); assert.equal(state.mass, initial.mass);
  assert(await page.locator('[data-action="next"]').isHidden()); report.fixtures.push('player defeat ends immediately with two rivals alive; no spectator or continuation');
  await page.locator('[data-action="restart"]').filter({visible:true}).click();
  state=await page.evaluate(()=>window.__battleQA.state());assert.equal(state.phase,'playing');assert.equal(state.round,1);assert.equal(state.aliveCount,4);
  await page.evaluate(() => window.__battleQA.quiet());
  initial = await page.evaluate(() => window.__battleQA.state());
  await page.evaluate(() => window.__battleQA.firingFixture());
  for (const id of ['bot-1', 'bot-2', 'bot-3']) await page.evaluate(id => window.__battleQA.defeat(id), id);
  state = await page.evaluate(() => window.__battleQA.step(1));
  assert.equal(state.phase, 'collecting'); assert.equal(state.mass, initial.mass);
  await page.keyboard.press('p');
  const collectingPause = await page.evaluate(() => window.__battleQA.state());
  const collectingStill = await page.evaluate(() => window.__battleQA.step(120));
  assert.deepEqual({ ...collectingStill, drawCalls: 0 }, { ...collectingPause, drawCalls: 0 });
  await page.keyboard.press('p');
  state = await page.evaluate(() => window.__battleQA.step(600));
  assert.equal(state.phase, 'result'); assert.equal(state.winner, 'player'); assert.equal(state.mass, initial.mass);
  await page.locator('[data-action="next"]').click();
  const carried = await page.evaluate(() => window.__battleQA.state());
  assert.equal(carried.round, 2); assert.deepEqual(carried.inventory, state.inventory);
  assert.equal(carried.aliveCount, 4); assert(carried.buildings.every(b => b.id.includes('arena-round-2/')));
  report.fixtures.push('victory lock, collection pause, exact player carryover and regenerated arena');
  const hudLayouts=[];
  for(const viewport of [{width:1872,height:879},{width:1366,height:768}]){
    await page.setViewportSize(viewport);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.evaluate(()=>window.__battleQA.step(0));
    const layout=await page.evaluate(()=>{
      const read=selector=>{const e=document.querySelector(selector),b=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:b.x,y:b.y,width:b.width,height:b.height,font:s.fontFamily,size:parseFloat(s.fontSize)};};
      return {left:read('.player-sidebar'),right:read('.action-panel'),count:read('[data-player-pieces]'),dash:read('.dash-hud strong'),
        overflow:document.documentElement.scrollWidth-innerWidth,pickupToasts:[...document.querySelectorAll('.toast')].some(e=>/sent to reserve/.test(e.textContent))};
    });
    assert(Math.abs(layout.left.y-layout.right.y)<1);assert(Math.abs(layout.left.width-layout.right.width)<1);
    assert(Math.abs(layout.left.height-layout.right.height)<1);
    assert(layout.left.width>=220);assert(layout.right.x>=layout.left.x+layout.left.width+20);assert(layout.overflow<=0);assert.equal(layout.pickupToasts,false);
    assert.equal(layout.count.font,layout.dash.font);assert(layout.count.size>=32);assert(layout.dash.size>=18);
    hudLayouts.push({viewport,...layout});await page.screenshot({path:output+'/hud-'+viewport.width+'.png'});
  }
  report.fixtures.push({alignedReadableDesktopPanels:hudLayouts});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(() => window.__battleQA.step(1));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.locator('.rival-card,.reserve-panel--enemy,.match-clock').count(), 0);
  assert(await page.locator('[data-shot-count]').isVisible());
  await page.screenshot({ path: `${output}/arena-mobile.png` });
  report.fixtures.push('390px volley control is visible; rivals hidden; no horizontal overflow');
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.ok = true;
} catch (error) {
  report.ok = false; report.failure = { message: error.message, stack: error.stack };
  try { report.failure.snapshot = await page?.evaluate(() => window.__battleQA?.state()); } catch {}
  throw error;
} finally {
  await writeFile(`${output}/browser-report.json`, JSON.stringify(report, null, 2));
  await browser?.close(); await server.close();
}
console.log(JSON.stringify({ ok: true, matches: report.matches.length, fixtures: report.fixtures.length, errors: report.errors.length }));
