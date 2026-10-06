import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { createServer } from 'vite';

// Supply an existing Playwright installation; this script does not install browsers.
const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(runtime);
const label = process.argv[2] || 'current';
const output = `artifacts/performance/${label}.json`;
await mkdir('artifacts/performance', { recursive: true });
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5198, strictPort: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
await server.listen();
const args = process.env.SOFTWARE_GPU ? ['--use-angle=swiftshader'] : [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args });
const report = { label, recordedAt: new Date().toISOString(), environment: { cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), platform: os.platform(), node: process.version, headless: true, args, viewport: { width: 1365, height: 900 }, deviceScaleFactor: 1, cpuThrottling: 1, networkThrottling: 'none' }, errors: [], scenarios: {} };
report.environment.sourceHashes = Object.fromEntries(await Promise.all(['src/main.ts', 'src/render.ts', 'src/game/structure.ts', 'src/game/evolution.ts', 'package-lock.json'].map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
report.environment.server = 'Vite development, no dependency prebundling';
report.environment.cache = 'Fresh browser context and browser HTTP cache; existing local disk files, no network throttle';
report.environment.motion = 'normal';
report.environment.coordinatedQuietWindow = process.argv.includes('--quiet-confirmed');
try {
  const page = await browser.newPage({ viewport: report.environment.viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    let body = await response.text();
    body = body.replace('tick(1 / 60);', 'if (!window.__perfFrozen) tick(1 / 60);');
    body += `\nwindow.__perfFrozen = true;
    let fixtureSeed=123456789;
    Math.random=()=>{fixtureSeed=(Math.imul(fixtureSeed,1664525)+1013904223)>>>0;return fixtureSeed/4294967296;};
    const originalRender=renderer.renderer.render.bind(renderer.renderer);
    window.__perfTotalCalls=0;
    renderer.renderer.render=(...args)=>{originalRender(...args);if(renderer.renderer.info.autoReset)window.__perfTotalCalls+=renderer.renderer.info.render.calls;};
    const originalDraw = draw;
    window.__perfDraws = [];
    draw = function(dt) { const t = performance.now(); window.__perfTotalCalls=0;originalDraw(dt); if (window.__perfRecording) window.__perfDraws.push(performance.now()-t); };
    window.__perf = {
      start: () => { fixtureSeed=123456789;startRound(); drops = []; sound.muted = true; },
      full: async () => {
        const { evolutionPlan } = await import('/src/game/evolution.ts');
        for (const actor of actors) {
          const plan = evolutionPlan(actor.template, 'mosher', 3);
          const pieces = plan.slots.map((p,i) => ({ ...p, id: 'fixture/'+actor.id+'/'+i, color: actor.template.pieces[i % actor.template.pieces.length].color }));
          actor.structure = createStructure({ ...actor.template, coreId: pieces[actor.template.pieces.findIndex(p=>p.id===actor.template.coreId)]?.id || pieces[0].id, pieces });
          actor.structure.evolution = { id:'mosher',stage:3,template:actor.template,plan,occupied:pieces.map(p=>p.id),everBuilt:new Set(pieces.map((_,i)=>i)),reserve:[],reserveRevision:0 };
          actor.boundsRevision = -1;
          updateBounds(actor); actor.view.sync(actor.structure);
        }
        draw(0); updateUI();
      },
      debris: n => { drops=[]; seedDrops(n,0); draw(0); },
      quantities: () => ({ pieces: actors.map(a=>a.structure.pieces.size), studs: actors.map(a=>a.view.studs.count), drops:drops.length, calls:renderer.renderer.info.autoReset?window.__perfTotalCalls:renderer.renderer.info.render.calls, geometries:renderer.renderer.info.memory.geometries, textures:renderer.renderer.info.memory.textures }),
      micro: (kind,n) => {
        const samples=[]; const actor=actors[1];
        const part=actor.structure.pieces.values().next().value;
        const point=new THREE.Vector3(part.position.x+part.size.x/2,part.position.y+part.size.y/2-actor.view.groundOffset,part.position.z+part.size.z/2).multiplyScalar(CONFIG.characterScale).applyMatrix4(actor.view.root.matrixWorld.clone().multiply(new THREE.Matrix4().makeScale(1/CONFIG.characterScale,1/CONFIG.characterScale,1/CONFIG.characterScale))).project(renderer.camera);
        const rect=canvas.getBoundingClientRect(), x=rect.left+(point.x+1)*rect.width/2,y=rect.top+(1-point.y)*rect.height/2;
        for(let i=0;i<n;i++) { const t=performance.now();
          if(kind==='pointer') renderer.pointer(x,y,{mesh:actor.view.body,x:actor.x,z:actor.z});
          else if(kind==='sync') { actor.structure.revision++; actor.view.sync(actor.structure); }
          else if(kind==='draw') draw(0);
          else tick(1/60);
          samples.push(performance.now()-t);
        } return samples;
      },
      destruction: (power,seed) => { let value=seed;const random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;}; const actor=actors[1],before=actor.structure.pieces.size,t=performance.now(),result=damageStructure(actor.structure,power,random),damageMs=performance.now()-t,t2=performance.now(); knockOff(actor,[...result.direct,...result.cascade]); const dropsMs=performance.now()-t2,t3=performance.now(); draw(0);return{before,after:actor.structure.pieces.size,direct:result.direct.length,cascade:result.cascade.length,damageMs,dropsMs,firstDrawMs:performance.now()-t3}; },
      bridgeDestruction: () => {
        const actor=actors[1],state=actor.structure.evolution;
        const bridges=new Set(state.plan.neighbors.slice(0,state.plan.headCount).flat().filter(i=>i>=state.plan.headCount));
        const available=[...actor.structure.pieces.values()].filter(p=>p.id!==actor.structure.coreId),values=[];
        let selected=0;
        for(const slot of bridges){const index=available.findIndex(p=>p.id===state.occupied[slot]);values.push((index-selected+.25)/(available.length-selected));[available[selected],available[index]]=[available[index],available[selected]];selected++;}
        if(selected>20) return {skipped:true,bridgeParts:selected,reason:'Requires more than live maximum power'};
        const before=actor.structure.pieces.size,t=performance.now(),result=damageStructure(actor.structure,selected,()=>values.shift()),damageMs=performance.now()-t,t2=performance.now();knockOff(actor,[...result.direct,...result.cascade]);const dropsMs=performance.now()-t2,t3=performance.now();draw(0);
        return {fixture:'Complete real evolution plan; deterministic selection of head/body connecting pieces',power:selected,before,after:actor.structure.pieces.size,direct:result.direct.length,cascade:result.cascade.length,damageMs,dropsMs,firstDrawMs:performance.now()-t3};
      },
      win: () => { const actor=actors[1];for(let i=0;i<2;i++){const result=damageStructure(actor.structure,actor.structure.pieces.size,()=>.5);knockOff(actor,[...result.direct,...result.cascade]);}finish(true);return drops.length; },
      collection: () => {const samples=[];let steps=0;const t=performance.now();while(phase==='collecting'&&steps<5000){const s=performance.now();tick(1/60);samples.push(performance.now()-s);steps++;}return{samples,steps,totalMs:performance.now()-t,phase,collected:victory?.collected,remaining:drops.length};},
      restart: () => { fixtureSeed=123456789;startRound();draw(0); },
      heap: () => ({js:performance.memory?.usedJSHeapSize, ...window.__perf.quantities()}),
      verifyCapacity: n => { drops=[];seedDrops(n,0); const before=drops.length;knockOff(actors[1],[actors[1].structure.pieces.values().next().value]);draw(0);return{before,after:drops.length,instances:droppedView.count,capacity:droppedView.instanceMatrix.count}; }
    };`;
    await route.fulfill({ response, body });
  });
  const t = performance.now();
  await page.goto('http://127.0.0.1:5198/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__perf);
  report.load = { navigationToReadyMs: performance.now() - t, ...await page.evaluate(() => ({ navigation: performance.getEntriesByType('navigation')[0].toJSON(), resourcesBytes: performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.transferSize,0), firstPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime })) };
  const session = await page.context().newCDPSession(page);
  report.environment.browser = await browser.version();
  report.environment.webgl = await page.evaluate(() => { const gl=document.querySelector('#arena').getContext('webgl2');const extension=gl.getExtension('WEBGL_debug_renderer_info');return{vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),unmaskedVendor:extension&&gl.getParameter(extension.UNMASKED_VENDOR_WEBGL),unmaskedRenderer:extension&&gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory}; });
  const browserSession = await browser.newBrowserCDPSession();
  report.environment.gpu = (await browserSession.send('SystemInfo.getInfo')).gpu;
  const summarize = values => { const sorted=[...values].sort((a,b)=>a-b);const at=q=>sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))];return{samples:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p50Ms:at(.5),p95Ms:at(.95),p99Ms:at(.99),maxMs:at(1)}; };
  async function sample(name, live = false) {
    await page.evaluate(live => { window.__perfFrozen=!live; }, live);
    await page.evaluate(() => { window.__perfDraws=[]; window.__perfRecording=false; });
    await page.waitForTimeout(300);
    const frames = await page.evaluate(count => new Promise(resolve => { const frames=[];let previous; window.__perfRecording=true; const next=now=>{if(previous!==undefined)frames.push(now-previous);previous=now;if(frames.length===count){window.__perfRecording=false;resolve(frames);}else requestAnimationFrame(next);};requestAnimationFrame(next); }), live ? 300 : 120);
    report.scenarios[name]={mode:live?'live tick + draw':'render only; simulation frozen',frames:summarize(frames),draw:summarize(await page.evaluate(()=>window.__perfDraws)),quantities:await page.evaluate(()=>window.__perf.quantities()),phase:await page.evaluate(()=>window.__arenaSnapshot.phase)};
    await page.evaluate(()=>window.__perfFrozen=true);
    console.log(name, JSON.stringify(report.scenarios[name]));
  }
  await page.evaluate(() => window.__perf.start());
  await sample('tiny');
  report.scenarios.tiny.pointer=summarize(await page.evaluate(()=>window.__perf.micro('pointer',100)));
  await page.evaluate(() => window.__perf.full());
  await sample('full');
  report.scenarios.full.pointer=summarize(await page.evaluate(()=>window.__perf.micro('pointer',100)));
  report.scenarios.full.sync=summarize(await page.evaluate(()=>window.__perf.micro('sync',15)));
  // Save a Chrome CPU profile for attribution, separately from headline timings.
  await session.send('Profiler.enable');await session.send('Profiler.start');
  await page.evaluate(()=>window.__perf.micro('pointer',100));
  const { profile }=await session.send('Profiler.stop');
  await writeFile(`artifacts/performance/${label}-pointer.cpuprofile`,JSON.stringify(profile));
  report.destruction=[];
  for(const power of [20,500,5000]) { await page.evaluate(()=>window.__perf.full());report.destruction.push(await page.evaluate(power=>window.__perf.destruction(power,12345),power)); }
  await page.evaluate(()=>window.__perf.full());report.bridgeDestruction=await page.evaluate(()=>window.__perf.bridgeDestruction());
  await page.evaluate(()=>window.__perf.start());
  await page.evaluate(()=>window.__perf.debris(12000));
  await sample('debris12000');
  for(const name of ['tinyLive','fullLive','debris12000Live']) {
    await page.evaluate(()=>window.__perf.start());
    if(name==='fullLive') await page.evaluate(()=>window.__perf.full());
    if(name==='debris12000Live') await page.evaluate(()=>window.__perf.debris(12000));
    await sample(name,true);
  }
  await page.evaluate(()=>window.__perf.start());
  const rewards=await page.evaluate(()=>window.__perf.win());
  const collection=await page.evaluate(()=>window.__perf.collection());
  report.victory={rewards,...collection,ticks:summarize(collection.samples)};delete report.victory.samples;
  await page.evaluate(()=>window.__perf.start());await page.evaluate(()=>window.__perf.debris(12000));
  const heavyRewards=await page.evaluate(()=>window.__perf.win()),heavyCollection=await page.evaluate(()=>window.__perf.collection());
  report.victory12000={rewards:heavyRewards,...heavyCollection,ticks:summarize(heavyCollection.samples)};delete report.victory12000.samples;
  await page.evaluate(()=>window.__perf.restart());await session.send('HeapProfiler.collectGarbage');
  report.restartMemory=[await page.evaluate(()=>window.__perf.heap())];
  for(let i=1;i<=30;i++) {await page.evaluate(()=>window.__perf.restart());if(i%10===0){await session.send('HeapProfiler.collectGarbage');report.restartMemory.push({restarts:i,...await page.evaluate(()=>window.__perf.heap())});}}
  report.capacity=await page.evaluate(()=>window.__perf.verifyCapacity(33000));
  report.capacity.allPiecesRetained=report.capacity.after===report.capacity.before+1;
  report.capacity.withinVisualCapacity=report.capacity.instances<=report.capacity.capacity;
  report.sourceHashesAfter = Object.fromEntries(await Promise.all(Object.keys(report.environment.sourceHashes).map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
  report.sourcesUnchangedDuringRun = JSON.stringify(report.sourceHashesAfter) === JSON.stringify(report.environment.sourceHashes);
  await writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,errors:report.errors,webgl:report.environment.webgl,destruction:report.destruction,victory:report.victory,restartMemory:report.restartMemory,capacity:report.capacity}));
} catch(error) { report.failure=error.stack; throw error; }
finally { await writeFile(output,JSON.stringify(report,null,2)); await browser.close(); await server.close(); }
