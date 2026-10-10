// Response-only fixtures exercise production functions; grants/forced contacts
// are correctness checks, not naturally earned progression or FPS evidence.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const output = process.env.PATCH_AUDIT_OUTPUT || 'artifacts/patch-audit';
const port = Number(process.env.PATCH_AUDIT_PORT || 5197);
const report = { mode: 'production-loop regressions; isolated grants and forced impacts; draw calls, not FPS', hashes: {}, fixtures: [], errors: [] };
await mkdir(output, { recursive: true });
const instrumentation = `
const {legacyEdgeBuildings}=await import('/src/game/test-fixtures/legacy-arena.ts');
const {ARENA_PART_TYPES,MAX_ARENA_BUILDING_PIECES}=await import('/src/game/arena.ts');
const patchStock=(actor,count)=>{const e=actor.structure.evolution;e.reserve=Array.from({length:count},(_,i)=>({id:'patch-stock/'+actor.id+'/'+i,position:{x:0,y:0,z:0},size:{x:1,y:.4,z:1},color:'#8877aa',shape:'brick'}));e.reserveRevision++;};
const patchClearCover=()=>{buildingViews.forEach(v=>v.dispose(renderer.scene));buildings=[];buildingViews=[];};
const patchSeed=initial=>{let seed=initial;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
window.__patchQA={
 state:()=>({...window.__arenaSnapshot,dashRequested}),
 reset:()=>{startRound();actors.forEach(a=>a.bot=undefined);sound.muted=true;firing=false;renderer.shake=0;draw(0);updateUI();},
 mixedArena:seed=>{
  window.__patchQA.reset();patchClearCover();buildings=generateArenaBuildings(patchSeed(seed),1);
  buildingViews=buildings.map(b=>{const v=new CharacterView(renderer.scene,'#8c9b8d');v.root.position.set(b.x,0,b.z);v.sync(b.structure);v.ring.visible=v.core.visible=false;return v;});
  const key=p=>[p.size.x,p.size.y,p.size.z,p.shape].join(':'),types=new Set(buildings.flatMap(b=>[...b.structure.pieces.values()].map(key)));
  const counts=buildings.map(b=>b.structure.pieces.size);renderer.shake=0;draw(0);updateUI();
  return{seed,buildings:buildings.length,templates:[...new Set(buildings.map(b=>b.template))],minPieces:Math.min(...counts),maxPieces:Math.max(...counts),totalPieces:counts.reduce((a,b)=>a+b,0),distinctCounts:new Set(counts).size,catalog:ARENA_PART_TYPES.length,cap:MAX_ARENA_BUILDING_PIECES,missing:ARENA_PART_TYPES.filter(p=>!types.has(key(p))).map(key),unknown:[...types].filter(type=>!ARENA_PART_TYPES.some(p=>key(p)===type)),shapes:[...new Set(buildings.flatMap(b=>[...b.structure.pieces.values()].map(p=>p.shape)))]};
 },
 step:n=>{for(let i=0;i<n;i++)tick(1/60);renderer.shake=0;draw(0);updateUI();return window.__patchQA.state();},
 staleHit:()=>{
  window.__patchQA.reset();patchClearCover();drops=[];
  const p=actors[0],victim=actors[1],other=actors[2],sample=p.template.pieces[0];
  const brick={...sample,size:{x:1,y:1.2,z:1},shape:'brick'};
  victim.structure=createStructure({...victim.template,coreId:'patch-core',pieces:[
   {...brick,id:'patch-core',position:{x:0,y:0,z:0}},
   {...brick,id:'patch-bridge',position:{x:1,y:0,z:0}},
   {...brick,id:'patch-body',position:{x:2,y:0,z:0},size:{x:40,y:1.2,z:30}}
  ]});round.participants[1].structure=victim.structure;victim.boundsRevision=-1;updateBounds(victim);
  p.x=-45;p.z=0;victim.x=victim.z=0;other.x=-45;other.z=-45;actors[3].x=45;actors[3].z=45;
  patchStock(p,2);patchStock(other,1);
  fire(other,20,6,CONFIG.shotInterval,1);const second=shots.at(-1);second.x=-8;second.z=6;second.vx=CONFIG.projectileSpeed;second.vz=0;
  fire(p,20,0,CONFIG.shotInterval,2);const first=shots.at(-1);first.x=-10;first.z=0;first.vx=CONFIG.projectileSpeed;first.vz=0;
  const before=window.__arenaSnapshot.mass,oldRadius=victim.radius;tick(1/60);
  return{before,after:window.__arenaSnapshot.mass,oldRadius,newRadius:victim.radius,coreAlive:alive(victim),pieces:victim.structure.pieces.size,secondStillFlying:shots.includes(second),events:[...combatEvents]};
 },
 edgeLanding:()=>{
  window.__patchQA.reset();patchClearCover();drops=[];
  buildings=legacyEdgeBuildings();buildingViews=buildings.map(b=>{const v=new CharacterView(renderer.scene,'#8c9b8d');v.root.position.set(b.x,0,b.z);v.sync(b.structure);v.ring.visible=v.core.visible=false;return v;});
  const p=actors[0];patchStock(p,1);fire(p,100,-16.06,CONFIG.shotInterval,1);const shot=shots.at(-1);
  Object.assign(shot,createPartProjectile(shot.pieces,p.id,75,6,100,-16.06));const id=shot.piece.id,mass=window.__arenaSnapshot.mass;
  const savedRandom=Math.random;let r=0;Math.random=()=>r++%2?1:0;
  try{for(let i=0;i<420&&!drops.some(d=>d.piece.id===id&&d.settled);i++)tick(1/60);}finally{Math.random=savedRandom;}
  const drop=drops.find(d=>d.piece.id===id);return{mass,after:window.__arenaSnapshot.mass,drop:drop&&{x:drop.x,z:drop.z,settled:drop.settled,age:drop.age},clear:!!drop&&buildings.every(b=>segmentBuildingHit(drop.x,drop.z,drop.x,drop.z,b,shot.radius)===null),events:[...combatEvents]};
 },
 starvation:(bareCore=false)=>{
  window.__patchQA.reset();patchClearCover();drops=[];round.number=4;
  const p=actors[0];p.x=p.z=0;
  for(const [i,a]of actors.slice(1).entries()){a.bot=createBot('balanced',()=>.75,'normal');a.x=i===0?30:i===1?-30:0;a.z=i===2?30:0;a.vx=a.vz=0;}
  coordinateBotSquad(squad,4,actors,simTime);
  for(const a of actors.slice(1)){
   const initial=a.structure.pieces.size;
   while(a.structure.pieces.size>(bareCore?1:initial*.6)){const batch=takeAmmunitionBatch(a.structure,1);if(!batch.length)break;p.structure.evolution.reserve.push(batch[0].piece);}
   if(bareCore){a.structure.evolution.reserve.push(p.structure.evolution.reserve.pop());a.structure.evolution.reserveRevision++;}
   updateBounds(a);
  }
  p.structure.evolution.reserveRevision++;
  const mass=window.__arenaSnapshot.mass;tick(1/60);const recovering=window.__patchQA.state().fighters.slice(1).map(a=>a.role);
  let firstAttack=null;
  for(let i=0;i<1800&&phase==='playing';i++){tick(1/60);if(actors.slice(1).some(a=>a.shotsFired)){firstAttack=stats.elapsed;break;}}
  draw(0);updateUI();return{bareCore,mass,after:window.__arenaSnapshot.mass,recovering,firstAttack,fighters:window.__patchQA.state().fighters.slice(1).map(a=>({id:a.id,role:a.role,shots:a.shotsFired,reserve:a.reserve,pieces:a.pieces}))};
 },
 scatter:()=>{
  window.__patchQA.reset();patchClearCover();drops=[];
  const tower=generateArenaBuildings(patchSeed(29),1).find(b=>b.template==='tower');tower.x=tower.z=0;buildings=[tower];
  const view=new CharacterView(renderer.scene,'#8c9b8d');view.sync(tower.structure);view.ring.visible=view.core.visible=false;buildingViews=[view];
  const ids=new Set(tower.structure.pieces.keys()),p=actors[0];patchStock(p,ids.size*2);const mass=window.__arenaSnapshot.mass;
  draw(0);window.__patchTower={tower,ids,mass};return{pieces:ids.size,mass};
 },
 collapse:()=>{
  const{tower,ids,mass}=window.__patchTower,p=actors[0];let impacts=0;
  while(tower.structure.pieces.size&&impacts<ids.size){
   p.cooldown=0;fire(p,0,0,CONFIG.shotInterval,20);const shot=shots.pop();shot.x=-2;shot.z=0;hitBuilding(shot,tower);drops.push(...projectileDrops(shot));disposePieceProjectile(renderer.scene,shot.mesh);impacts++;
  }
  const emitted=drops.filter(d=>ids.has(d.piece.id));const moving=emitted.filter(d=>Math.hypot(d.vx,d.vz)>.01).length;
  for(let i=0;i<300;i++){updateDrops(1/60,false);simTime+=1/60;}renderer.shake=0;draw(0);updateUI();
  const mx=emitted.reduce((s,d)=>s+d.x,0)/emitted.length,mz=emitted.reduce((s,d)=>s+d.z,0)/emitted.length;
  const xx=emitted.reduce((s,d)=>s+(d.x-mx)**2,0)/emitted.length,zz=emitted.reduce((s,d)=>s+(d.z-mz)**2,0)/emitted.length,xz=emitted.reduce((s,d)=>s+(d.x-mx)*(d.z-mz),0)/emitted.length;
  const discriminant=Math.sqrt((xx-zz)**2+4*xz*xz);
  return{mass,after:window.__arenaSnapshot.mass,impacts,remaining:tower.structure.pieces.size,emitted:emitted.length,unique:new Set(emitted.map(d=>d.piece.id)).size,moving,settled:emitted.filter(d=>d.settled).length,varianceX:xx,varianceZ:zz,minVariance:(xx+zz-discriminant)/2,maxDistance:Math.max(...emitted.map(d=>Math.hypot(d.x,d.z))),maxHeight:Math.max(...emitted.map(d=>d.y)),sourceHeight:Math.max(...emitted.map(d=>d.spawnOrigin.y)),finite:emitted.every(d=>[d.x,d.y,d.z,d.vx,d.vy,d.vz].every(Number.isFinite))};
 },
 volleyCalls:count=>{
  window.__patchQA.reset();patchClearCover();drops=[];actors.forEach(a=>patchStock(a,2000));
  for(let frame=0;frame<73;frame++){for(const a of actors)fire(a,a.x*10,a.z*10,CONFIG.shotInterval,count);tick(1/60);}draw(0);
  return{groups:shots.length,pieces:shots.reduce((n,s)=>n+s.pieces.length,0),meshes:shots.reduce((n,s)=>{s.mesh.traverse(o=>{if(o instanceof THREE.Mesh)n++;});return n;},0),calls:renderer.renderer.info.render.calls};
 }
};
`;
let server, browser, page;
function record(name, result) { report.fixtures.push({ name, result }); }
try {
  server = await createServer({ configFile: false, server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1872, height: 879 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => { window.__patchFrozen = true; });
  await context.route('**/src/**/*.ts*', async route => {
    const response = await route.fetch(); let body = await response.text(); const name = new URL(route.request().url()).pathname;
    report.hashes[name] = createHash('sha256').update(body).digest('hex');
    if (name === '/src/main.ts') {
      assert(body.includes('tick(1 / 60);'), 'fixed-step marker changed');
      body = body.replace('tick(1 / 60);', 'if (!window.__patchFrozen) tick(1 / 60);').replaceAll('requestAnimationFrame(frame);', 'if (!window.__patchFrozen) requestAnimationFrame(frame);') + instrumentation;
    }
    await route.fulfill({ response, body });
  });
  const open = async options => {
    const current = await context.newPage(options);
    current.on('pageerror', e => report.errors.push(e.message));
    current.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    await current.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });
    await current.waitForFunction(() => !!window.__patchQA);
    return current;
  };
  page = await open();
  for(const seed of [1,48,927]){
    const mixed=await page.evaluate(seed=>window.__patchQA.mixedArena(seed),seed);
    record('mixed real-part arena '+seed,mixed);
    assert.equal(mixed.buildings,20);assert.equal(mixed.templates.length,5);assert.equal(mixed.missing.length,0);assert.equal(mixed.unknown.length,0);
    assert(mixed.minPieces>0&&mixed.maxPieces<=mixed.cap&&mixed.distinctCounts>5);assert(mixed.shapes.includes('tile')&&mixed.shapes.includes('plate')&&mixed.shapes.includes('brick'));
    await page.screenshot({path:output+'/mixed-map-'+seed+'.png'});
  }
  const stale = await page.evaluate(() => window.__patchQA.staleHit());
  assert.equal(stale.before, stale.after); assert(stale.coreAlive && stale.pieces === 1); assert(stale.secondStillFlying); assert(stale.newRadius < stale.oldRadius);
  record('same-tick collapse refreshes hit radius', stale);
  const edge = await page.evaluate(() => window.__patchQA.edgeLanding());
  assert.equal(edge.mass, edge.after); assert(edge.drop?.settled && edge.clear); assert.equal(edge.events.length, 0);
  record('native seed16 rebound remains clear after landing', edge);
  for (const bareCore of [false, true]) {
    const starvation = await page.evaluate(bareCore => window.__patchQA.starvation(bareCore), bareCore);
    assert.equal(starvation.mass, starvation.after); assert(starvation.recovering.every(role => role === 'recover'));
    assert(starvation.firstAttack >= 8 && starvation.firstAttack < 20, 'wounded squad remains in resource starvation');
    record(bareCore ? 'bare Core squad fires existing stock after recovery stalls' : 'wounded squad resumes real combat without healing or new resources', starvation);
  }
  const tower = await page.evaluate(() => window.__patchQA.scatter());
  await page.screenshot({ path: output + '/tower-before.png' });
  const scatter = await page.evaluate(() => window.__patchQA.collapse());
  record('real twenty-part impacts scatter a complete tower in two dimensions', scatter);
  assert.equal(scatter.mass, scatter.after); assert.equal(scatter.remaining, 0); assert.equal(scatter.emitted, tower.pieces); assert.equal(scatter.emitted, scatter.unique);
  assert(scatter.moving >= scatter.emitted * .9, 'building debris lacks horizontal impulses');
  assert(scatter.minVariance > .35 && scatter.varianceX > .5 && scatter.varianceZ > .5, 'tower debris collapses into a line');
  assert(scatter.finite && scatter.maxDistance < 30); assert(scatter.settled > scatter.emitted * .85, 'tower debris failed to settle');
  assert(scatter.maxHeight <= scatter.sourceHeight + 2, 'debris stacking teleports a tower into a tall column');
  await page.screenshot({ path: output + '/tower-after.png' });
  const twenty = await page.evaluate(() => window.__patchQA.volleyCalls(20));
  const single = await page.evaluate(() => window.__patchQA.volleyCalls(1));
  assert.equal(twenty.groups, single.groups); assert.equal(twenty.pieces, twenty.groups * 20);
  assert(twenty.meshes <= twenty.groups * 2); assert(twenty.calls <= single.calls + 10, 'volley draw calls scale with part count');
  record('one and twenty part volleys share a bounded draw-call budget', { twenty, single });
  await page.close();
  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await touchContext.addInitScript(() => { window.__patchFrozen = true; });
  await touchContext.route('**/src/main.ts*', async route => {
    const response = await route.fetch(); let body = await response.text();
    body = body.replace('tick(1 / 60);', 'if (!window.__patchFrozen) tick(1 / 60);').replaceAll('requestAnimationFrame(frame);', 'if (!window.__patchFrozen) requestAnimationFrame(frame);') + instrumentation;
    await route.fulfill({ response, body });
  });
  page = await touchContext.newPage(); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.__patchQA);
  await page.evaluate(() => window.__patchQA.reset());
  const cdp = await touchContext.newCDPSession(page);
  const button = await page.locator('[data-action="dash"]').boundingBox(); const first = { id: 1, x: 210, y: 590 }, second = { id: 2, x: button.x + button.width / 2, y: button.y + button.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  assert((await page.evaluate(() => window.__patchQA.state())).input.firing);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
  const afterSecond = await page.evaluate(() => window.__patchQA.state()); assert(afterSecond.input.firing && afterSecond.dashRequested);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: 220 }] });
  const activeDash = await page.evaluate(() => window.__patchQA.step(1)); assert(activeDash.input.firing && activeDash.fighters[0].dashStarts === 1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const released = await page.evaluate(() => window.__patchQA.state()); assert.equal(released.input.firing, false);
  await page.evaluate(() => window.__patchQA.step(160));
  await page.locator('[data-action="dash"]').focus(); await page.keyboard.press('Enter');
  const keyboardDash = await page.evaluate(() => window.__patchQA.step(1)); assert.equal(keyboardDash.fighters[0].dashStarts, 2);
  record('secondary touch DASH preserves held fire, triggers once and retains keyboard activation', { afterSecond: afterSecond.input, dash: activeDash.fighters[0].dash, released: released.input, keyboardDashStarts: keyboardDash.fighters[0].dashStarts });
  assert.deepEqual(report.errors, []); report.ok = true;
} catch (e) {
  report.ok = false; report.failure = { message: e.message, stack: e.stack }; throw e;
} finally {
  await writeFile(output + '/report.json', JSON.stringify(report, null, 2)); await browser?.close(); await server?.close();
}
console.log(JSON.stringify({ ok: report.ok, fixtures: report.fixtures.length, errors: report.errors.length, output }));
