// Local browser regression harness. QA controls are injected into a disposable response only.
// Autoplay uses assisted aim and fixed-step time; it is not human play or a balance estimate.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const port = Number(process.env.GAMEPLAY_AUDIT_PORT || 5191);
const matchCount = Number(process.env.GAMEPLAY_AUDIT_MATCHES || 20);
const seed = Number(process.env.GAMEPLAY_AUDIT_SEED || 412);
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['mosher', 'guitar', 'spider', 'bass', 'frontman'];
const output = process.env.GAMEPLAY_AUDIT_OUTPUT || 'artifacts/gameplay-audit';
const logicalState = ({ drawCalls, ...state }) => state;
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port, strictPort: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
await server.listen();
let browser;
const report = { mode: 'assisted-aim fixed-step browser matches; bots and projectiles active', seed, matchCount, runtimeHashes: {}, paths: [], fixtures: [], errors: [] };
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await page.addInitScript(initial => {
    let state = initial;
    window.__qaFrozen = true;
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }, seed);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.route('**/src/game/*.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    const name = new URL(route.request().url()).pathname.split('/').at(-1).replace('.ts', '');
    report.runtimeHashes[name] = createHash('sha256').update(body).digest('hex');
    await writeFile(`${output}/${name}-runtime.original.js`, body);
    await route.fulfill({ response, body });
  });
  await page.route('**/src/render.ts*', async route => {
    const response = await route.fetch(), body = await response.text();
    report.runtimeHashes.render = createHash('sha256').update(body).digest('hex');
    await writeFile(`${output}/render-runtime.original.js`, body);
    await route.fulfill({ response, body });
  });
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    let body = await response.text();
    report.runtimeHashes.main = createHash('sha256').update(body).digest('hex');
    await writeFile(`${output}/main-runtime.original.js`, body);
    assert(body.includes('tick(1 / 60);'), 'Main loop marker changed');
    body = body.replace('tick(1 / 60);', 'if (!window.__qaFrozen) tick(1 / 60);');
    body = body.replaceAll('requestAnimationFrame(frame);', 'if (!window.__qaFrozen) requestAnimationFrame(frame);');
    body += `
window.__qaFrozen = true;
window.__gameplayQA = {
  state: () => ({ ...window.__arenaSnapshot, dash: {...dash}, victory: victory && {elapsed:victory.elapsed,total:victory.total,collected:victory.collected,pending:victory.pending.size}, mass: actors.reduce((n,a)=>n+a.structure.pieces.size+(a.structure.evolution?.reserve.length||0),drops.length), inventory: actors[0] && [...actors[0].structure.pieces.values(),...(actors[0].structure.evolution?.reserve||[])].map(p=>[p.id,p.size,p.color,p.shape]), dropAges:drops.map(d=>d.age), cooldowns:actors.map(a=>a.cooldown) }),
  step: n => { for(let i=0;i<n;i++)tick(1/60); updateUI(); draw(0); },
  autoplay: n => {
    for(let i=0;i<n && (phase==='playing'||phase==='collecting');i++) {
      if(phase==='playing') {
        const p=actors[0],e=actors[1],dx=e.x-p.x,dz=e.z-p.z,d=Math.max(.001,Math.hypot(dx,dz)),nx=dx/d,nz=dz/d;
        const range=Math.max(30,(p.radius+e.radius)*.8+8),approach=d>range+3?1:d<range-3?-1:0;
        let mx=nx*approach-nz*.9,mz=nz*approach+nx*.9;
        for(const s of shots)if(s.owner!==p) {
          const rx=s.x-p.x,rz=s.z-p.z,vx=s.vx-p.vx,vz=s.vz-p.vz,t=-(rx*vx+rz*vz)/(vx*vx+vz*vz);
          if(t>0&&t<.45&&Math.hypot(rx+vx*t,rz+vz*t)<p.radius+1.5) {
            const length=Math.hypot(s.vx,s.vz),sx=-s.vz/length,sz=s.vx/length,side=(p.x-s.x)*sx+(p.z-s.z)*sz>=0?1:-1;
            mx=sx*side;mz=sz*side;if(dash.cooldown<=0)startDash(dash,mx,mz,dx,dz);break;
          }
        }
        if(Math.abs(p.x)>CONFIG.arenaWidth/2-p.radius-4)mx-=Math.sign(p.x)*2;
        if(Math.abs(p.z)>CONFIG.arenaDepth/2-p.radius-4)mz-=Math.sign(p.z)*2;
        keys.clear();if(mx>.3)keys.add('KeyD');if(mx<-.3)keys.add('KeyA');if(mz>.3)keys.add('KeyS');if(mz<-.3)keys.add('KeyW');
        const t=Math.max(0,(d-e.radius)/CONFIG.projectileSpeed);
        fire(p,e.x+e.vx*t,e.z+e.vz*t);
      }
      tick(1/60);
    }
    keys.clear();updateUI();draw(0);return window.__gameplayQA.state();
  },
  grantBody: async () => {
    const {collectPiece}=await import('/src/game/evolution.ts');
    const a=actors[0],s=a.structure.evolution;
    const missing=s.plan.slots.map((_,i)=>i).filter(i=>i>=s.plan.headCount&&(!s.occupied[i]||!a.structure.pieces.has(s.occupied[i])));
    for(const i of missing) {
      collectPiece(a.structure,{...s.plan.slots[i],id:'fixture/'+s.stage+'/'+i,color:i%2?'#00ddff':'#ff00ff'});
    }
    while(assembleReserve(a.structure,1000).length){}updateBounds(a);clampToArena(a);updateUI();draw(0);
  },
  clearShots:()=>{for(const s of shots)renderer.scene.remove(s.mesh);shots=[];},
  restart:()=>startRound(),
  debrisPile:()=>{
    const oldPhase=phase,source=actors[0].template.pieces.find(p=>p.size.x===2&&p.size.z===2)??actors[0].template.pieces[0];
    drops=[];
    for(let i=0;i<12;i++)drops.push({ownerId:'player',piece:{...source,id:'fixture/debris/'+i,position:{...source.position},size:{...source.size}},x:0,y:6+i*.18,z:0,vx:0,vy:-.5,vz:0,age:0,settled:false,rotation:(i%4)*.17});
    phase='result';for(let i=0;i<360;i++)tick(1/60);phase=oldPhase;draw(0);
    const size=debrisRenderSize(source),heights=drops.map(d=>d.y).sort((a,b)=>a-b),gaps=heights.slice(1).map((y,i)=>y-heights[i]);
    return {count:drops.length,settled:drops.every(d=>d.settled),height:size.y,minGap:Math.min(...gaps),bottom:heights[0],top:heights.at(-1)};
  },
  closeShot:()=>{
    const p=actors[0],e=actors[1];window.__gameplayQA.clearShots();
    p.x=0;p.z=0;e.x=p.radius*.6;e.z=0;p.cooldown=0;e.cooldown=100;
    const before=e.structure.pieces.size,hitsBefore=stats.hits;fire(p,e.x,e.z);const origin={x:shots[0].x,z:shots[0].z};
    for(let i=0;i<30&&stats.hits===hitsBefore;i++)tick(1/60);updateUI();draw(0);
    return {before,after:e.structure.pieces.size,origin,hits:stats.hits-hitsBefore,radius:p.radius,distance:Math.hypot(e.x-p.x,e.z-p.z)};
  },
  forcedOutcome: won=>{const a=actors[won?1:0];for(let i=0;i<2;i++){const hit=damageStructure(a.structure,a.structure.pieces.size,()=>.5);knockOff(a,[...hit.direct,...hit.cascade]);}finish(won);updateUI();draw(0);},
  projected:()=>actors.map(a=>{const b=a.bounds,pts=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])pts.push(a.view.body.localToWorld(new THREE.Vector3(x,y,z)).project(renderer.camera));return {minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),minY:Math.min(...pts.map(p=>p.y)),maxY:Math.max(...pts.map(p=>p.y))};}),
  framingCorners:()=>{
    const a=actors[0],old={x:a.x,z:a.z},result=[];
    for(const x of [-1,1])for(const z of [-1,1]){a.x=x*CONFIG.arenaWidth/2;a.z=z*CONFIG.arenaDepth/2;clampToArena(a);draw(0);result.push({x:a.x,z:a.z,projected:window.__gameplayQA.projected()});}
    a.x=old.x;a.z=old.z;draw(0);return result;
  }
};`;
    await route.fulfill({ response, body });
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__gameplayQA);
  for (const id of ids) {
    await page.locator(`[data-evolution="${id}"]`).click();
    await page.locator('[data-action="start"]').click();
    const matches = [];
    for (let match = 1; match <= matchCount; match++) {
      const initial = await page.evaluate(() => window.__gameplayQA.state());
      let current = initial;
      for (let batch = 0; batch < 40 && current.phase !== 'result'; batch++) {
        current = await page.evaluate(() => window.__gameplayQA.autoplay(600));
        assert.equal(current.mass, initial.mass, `${id}/${match}: lost or duplicated physical parts`);
      }
      assert.equal(current.phase, 'result', `${id}/${match}: result stalled after 400 simulated seconds`);
      const won = current.player.pieces > 0;
      matches.push({ match, round: current.round, won, elapsed: current.elapsed, shots: current.stats.shots, hits: current.stats.hits, evolution: current.player.evolution, reserve: current.player.evolution.reserve });
      if (match < matchCount) {
        await page.locator(`[data-action="${won ? 'next' : 'restart'}"]`).filter({ visible: true }).click();
        if (won) {
          const carried = await page.evaluate(() => window.__gameplayQA.state());
          assert.deepEqual(carried.inventory, current.inventory, `${id}/${match}: carryover changed inventory`);
        }
      }
    }
    report.paths.push({ id, matches });
    console.log(JSON.stringify({ id, matches: matches.length, victories: matches.filter(m => m.won).length, defeats: matches.filter(m => !m.won).length, last: matches.at(-1) }));
    // These separate forced fixtures establish extreme geometry and UI state coverage.
    if (matchCount > 0) await page.locator('[data-action="restart"]').filter({ visible: true }).click();
    if (id === 'mosher') {
      report.debrisPile = await page.evaluate(() => window.__gameplayQA.debrisPile());
      assert.equal(report.debrisPile.count, 12);
      assert.equal(report.debrisPile.settled, true);
      assert(report.debrisPile.minGap >= report.debrisPile.height + .011, 'Settled debris occupied overlapping vertical planes');
      await page.screenshot({ path: `${output}/debris-pile.png` });
      await page.evaluate(() => window.__gameplayQA.restart());
    }
    await page.evaluate(() => window.__gameplayQA.grantBody());
    const full2 = (await page.evaluate(() => window.__gameplayQA.state())).player.evolution;
    assert.equal(full2.built, full2.target, `${id}: phase-2 fixture was not complete`);
    assert.equal(full2.fraction, 1);
    const shot2 = await page.evaluate(() => window.__gameplayQA.closeShot());
    assert.equal(shot2.hits, 1, `${id}: phase-2 close-range projectile missed`);
    assert.deepEqual(shot2.origin, { x: 0, z: 0 });
    const active = await page.evaluate(() => window.__gameplayQA.state());
    await page.keyboard.press('KeyP');
    const paused = await page.evaluate(() => window.__gameplayQA.state());
    await page.evaluate(() => window.__gameplayQA.step(120));
    assert.deepEqual(logicalState(await page.evaluate(() => window.__gameplayQA.state())), logicalState(paused), `${id}: pause advanced combat state`);
    await page.locator('[data-action="resume"]').click();
    assert.equal((await page.evaluate(() => window.__gameplayQA.state())).phase, active.phase);
    await page.evaluate(() => window.__gameplayQA.forcedOutcome(true));
    await page.keyboard.press('Escape');
    const collectingPause = await page.evaluate(() => window.__gameplayQA.state());
    assert.equal(collectingPause.phase, 'paused');
    await page.evaluate(() => window.__gameplayQA.step(120));
    assert.deepEqual(logicalState(await page.evaluate(() => window.__gameplayQA.state())), logicalState(collectingPause), `${id}: pause advanced reward collection`);
    await page.locator('[data-action="resume"]').click();
    await page.evaluate(() => window.__gameplayQA.step(2000));
    const result = await page.evaluate(() => window.__gameplayQA.state());
    assert.equal(result.phase, 'result'); assert.equal(result.player.evolution.stage, 3);
    await page.keyboard.press('KeyP');
    assert.equal((await page.evaluate(() => window.__gameplayQA.state())).phase, 'result');
    await page.locator('[data-action="next"]').click();
    await page.evaluate(() => window.__gameplayQA.grantBody());
    const full3 = (await page.evaluate(() => window.__gameplayQA.state())).player.evolution;
    assert.equal(full3.built, full3.target, `${id}: phase-3 fixture was not complete`);
    assert.equal(full3.fraction, 1);
    const shot3 = await page.evaluate(() => window.__gameplayQA.closeShot());
    assert.equal(shot3.hits, 1, `${id}: phase-3 close-range projectile missed`);
    const projected = await page.evaluate(() => window.__gameplayQA.projected());
    assert(projected.every(b => b.minX >= -1.05 && b.maxX <= 1.05 && b.minY >= -1.05 && b.maxY <= 1.05), `${id}: clipped grown body`);
    const corners = await page.evaluate(() => window.__gameplayQA.framingCorners());
    assert(corners.every(c => c.projected.every(b => b.minX >= -1.05 && b.maxX <= 1.05 && b.minY >= -1.05 && b.maxY <= 1.05)), `${id}: clipped full body at arena corners`);
    await page.screenshot({ path: `${output}/${id}-phase3.png` });
    await page.evaluate(() => window.__gameplayQA.forcedOutcome(false));
    assert.equal(await page.locator('[data-action="next"]').isVisible(), false);
    await page.locator('[data-action="restart"]').filter({ visible: true }).click();
    const reset = await page.evaluate(() => window.__gameplayQA.state());
    assert.equal(reset.round, 1); assert.equal(reset.player.evolution.built, 0); assert.equal(reset.player.evolution.reserve, 0);
    report.fixtures.push({ id, full2, full3, shot2, shot3, projected, corners, checks: ['combat pause', 'reward pause', 'phase transition', 'result pause guard', 'defeat', 'restart', 'full-body close shots', 'full-body corner framing', ...(id === 'mosher' ? ['settled debris stacking'] : [])] });
    await page.keyboard.press('KeyP');
    await page.locator('[data-section="paused"] [data-action="lobby"]').click();
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await writeFile(`${output}/browser-report.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
