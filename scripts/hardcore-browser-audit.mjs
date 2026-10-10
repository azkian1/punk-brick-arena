// Response-only instrumentation: actual controls, ammunition, movement and damage.
// Scripted players establish behavior evidence, not human difficulty or GPU FPS.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const output = process.env.HARDCORE_AUDIT_OUTPUT || 'artifacts/hardcore-audit';
const baseline = process.env.HARDCORE_AUDIT_BASELINE;
const variants = process.env.HARDCORE_AUDIT_VARIANTS?.split(',') || (baseline ? ['baseline', 'current'] : ['current']);
const seeds = (process.env.HARDCORE_AUDIT_SEEDS || '927,48').split(',').map(Number);
const rounds = [1, 2, 3, 4, 6];
const report = { mode: 'actual ticks; granted isolated pressure fixture; native maps with scripted moving/firing/DASH player', seeds, variants: [], errors: [] };
await mkdir(output, { recursive: true });
let server, browser, page;
const instrumentation = `
window.__hardAim=null;window.__hardDamage=[];
const hardEnter=(number,salt)=>{
  let rng=(window.__hardSeed^Math.imul(number,2654435761)^salt)>>>0;
  Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  startRound();while(round.number<number){for(const a of actors.slice(1))a.structure.pieces.delete(a.structure.coreId);beginRound(nextBattleRound(CHARACTER_TEMPLATES,round));}
  window.__hardDamage=[];window.__hardAim=null;renderer.shake=0;draw(0);updateUI();
};
const hardState=()=>({...window.__arenaSnapshot,progress:actors.map(a=>({id:a.id,...evolutionProgress(a.structure)})),damage:[...window.__hardDamage]});
window.__hardQA={
  pressure:number=>{
    hardEnter(number,31);buildingViews.forEach(v=>v.dispose(renderer.scene));buildingViews=[];buildings=[];drops=[];
    const p=actors[0],a=actors[1];
    for(const [i,b] of actors.entries()){b.x=i===0?16:i===1?-24:-65;b.z=i<2?0:i===2?-65:65;b.vx=b.vz=0;if(i>1)b.bot=undefined;}
    const e=a.structure.evolution;e.reserve=Array.from({length:80},(_,i)=>({...a.template.pieces[0],id:'hard-stock/'+a.id+'/'+i,position:{x:0,y:0,z:0},size:{x:1,y:1.2,z:1}}));e.reserveRevision++;
    for(const b of actors)updateBounds(b);
    const mass=window.__arenaSnapshot.mass,before=p.structure.pieces.size,difficulty=a.bot.difficulty,samples=[];
    let side=1,previousShots=0;
    for(let frame=0;frame<900&&phase==='playing';frame++){
      if(p.z>26)side=-1;if(p.z<-26)side=1;
      touchMovement={x:0,z:side};firing=false;tick(1/60);
      assertHardMass(mass);
      if(a.shotsFired!==previousShots){samples.push({time:stats.elapsed,count:a.lastShotCount,shots:a.shotsFired,body:a.structure.pieces.size,stock:e.reserve.length});previousShots=a.shotsFired;}
    }
    touchMovement={x:0,z:0};renderer.shake=0;draw(0);updateUI();
    return {number,difficulty,before,after:p.structure.pieces.size,mass,afterMass:window.__arenaSnapshot.mass,elapsed:stats.elapsed,outcome:playerBattleOutcome(round),samples,damage:[...window.__hardDamage],coreAlive:alive(a)};
  },
  match:number=>{
    hardEnter(number,79);const initial=hardState(),mass=initial.mass,samples=[],map=buildings.map(b=>({id:b.id,x:b.x,z:b.z,parts:[...b.structure.pieces.values()].map(p=>[p.id,p.position,p.size,p.shape,p.color])}));
    for(let frame=0;frame<1800&&phase==='playing';frame++){
      const p=actors[0],enemies=actors.slice(1).filter(alive);if(!enemies.length)break;
      const closest=enemies.reduce((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)<Math.hypot(b.x-p.x,b.z-p.z)?a:b);
      const target=[...enemies].sort((a,b)=>(a.structure.coreExposed?-200:0)+a.structure.pieces.size+Math.hypot(a.x-p.x,a.z-p.z)*2-((b.structure.coreExposed?-200:0)+b.structure.pieces.size+Math.hypot(b.x-p.x,b.z-p.z)*2))[0];
      const dx=p.x-closest.x,dz=p.z-closest.z,d=Math.hypot(dx,dz)||1,far=Math.hypot(p.x,p.z)>47;
      let mx=far?-p.x*.06:dx/d*.75-dz/d*.65,mz=far?-p.z*.06:dz/d*.75+dx/d*.65;
      const edge=CONFIG.arenaWidth/2-p.radius-5;if(Math.abs(p.x)>edge)mx=-Math.sign(p.x);if(Math.abs(p.z)>edge)mz=-Math.sign(p.z);
      const norm=Math.hypot(mx,mz)||1;touchMovement={x:mx/norm,z:mz/norm};
      const travel=Math.hypot(target.x-p.x,target.z-p.z)/CONFIG.projectileSpeed;
      window.__hardAim={x:Math.max(-78,Math.min(78,target.x+target.vx*travel)),z:Math.max(-78,Math.min(78,target.z+target.vz*travel))};
      const stock=p.structure.evolution.reserve.length;shotCount=stock>=40?8:stock?3:1;firing=Math.hypot(target.x-p.x,target.z-p.z)<52;
      if(dash.cooldown<=0&&shots.some(s=>{
        if(s.ownerId==='player'||s.mode!=='shot')return false;const rx=s.x-p.x,rz=s.z-p.z,vx=s.vx-p.vx,vz=s.vz-p.vz,t=-(rx*vx+rz*vz)/Math.max(.001,vx*vx+vz*vz);
        return t>0&&t<.45&&Math.hypot(rx+vx*t,rz+vz*t)<p.radius+s.radius+1;
      }))dashRequested=true;
      tick(1/60);assertHardMass(mass);
      if(frame%60===0||phase!=='playing'){const s=hardState();samples.push({elapsed:s.elapsed,phase:s.phase,fighters:s.fighters,progress:s.progress});}
    }
    touchMovement={x:0,z:0};firing=false;window.__hardAim=null;renderer.shake=0;draw(0);updateUI();
    const s=hardState();return {round:number,map,mass,afterMass:s.mass,elapsed:s.elapsed,outcome:s.outcome,phase:s.phase,fighters:s.fighters,progress:s.progress,damage:s.damage,samples};
  },
};
function assertHardMass(expected){if(window.__arenaSnapshot.mass!==expected)throw new Error('hardcore probe lost real inventory');}
`;

try {
  server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: Number(process.env.HARDCORE_AUDIT_PORT || 5199), strictPort: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  await server.listen();
  const url = 'http://127.0.0.1:' + server.config.server.port + '/';
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const variant of variants) {
    assert(['baseline','current'].includes(variant));assert(variant!=='baseline'||baseline);
    const result = { variant, hashes: {}, pressure: [], matches: [] }; report.variants.push(result);
    for (const seed of seeds) {
      const context = await browser.newContext({ viewport: { width: 1872, height: 879 }, reducedMotion: 'reduce' });
      await context.addInitScript(seed => { let s = seed; window.__hardSeed=seed;window.__qaFrozen = true; Math.random = () => { s = (Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }, seed);
      await context.route('**/src/**/*.ts*', async route => {
        const response = await route.fetch(); let body = await response.text(); const name = new URL(route.request().url()).pathname;
        if (variant === 'baseline' && ['/src/game/bots.ts', '/src/game/bot-squad.ts'].includes(name)) {
          const source = await readFile(baseline + '/' + name.split('/').at(-1), 'utf8');
          body = (await transformWithEsbuild(source, name, { loader: 'ts', target: 'esnext' })).code;
          body = body.replace(/from\s+["'](\.[^"']+)["']/g, (_, relative) => 'from ' + JSON.stringify(new URL(relative + (relative.endsWith('.ts') ? '' : '.ts'), new URL(name, url)).pathname));
        }
        result.hashes[name] = createHash('sha256').update(body).digest('hex');
        if (name === '/src/main.ts') {
          assert(body.includes('tick(1 / 60);')); assert(body.includes('aim = pointerAim(pointerPosition.x, pointerPosition.y);'));
          body = body.replace('tick(1 / 60);', 'if (!window.__qaFrozen) tick(1 / 60);').replaceAll('requestAnimationFrame(frame);', 'if (!window.__qaFrozen) requestAnimationFrame(frame);');
          body = body.replace('aim = pointerAim(pointerPosition.x, pointerPosition.y);', 'aim = window.__hardAim || pointerAim(pointerPosition.x, pointerPosition.y);');
          body = body.replace('const result = damageStructure(target.structure, shot.damage);', 'const result = damageStructure(target.structure, shot.damage);window.__hardDamage.push({ownerId:shot.ownerId,targetId:target.id,time:simTime,spent:shot.pieces.length,direct:result.direct.length,cascade:result.cascade.length});');
          body += instrumentation;
        }
        await route.fulfill({ response, body });
      });
      page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if(m.type()==='error')report.errors.push(m.text()); });
      await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForFunction(() => !!window.__hardQA);
      await page.locator('[data-evolution="frontman"]').click();
      for (const round of rounds) {
        const pressure = await page.evaluate(number => window.__hardQA.pressure(number), round);
        result.pressure.push({ seed, ...pressure }); assert.equal(pressure.mass, pressure.afterMass);
        if (variant === 'current') {
          assert.equal(pressure.difficulty,'normal');assert(pressure.coreAlive);assert(pressure.samples.length>=4,'bot did not apply sustained pressure');
          for(let i=1;i<4;i++){const gap=pressure.samples[i].time-pressure.samples[i-1].time;assert(gap>=.23-1e-6&&gap<=.23+1/60+1e-6,'live early pressure lost cooldown cadence');}
          assert(pressure.damage.some(hit=>hit.ownerId==='bot-1'&&hit.targetId==='player'),'hardcore bot failed to hit moving player');
        }
        console.log(JSON.stringify({variant,seed,round,mode:'pressure',elapsed:pressure.elapsed,shots:pressure.samples.length,hits:pressure.damage.length,loss:pressure.before-pressure.after}));
        const match = await page.evaluate(number => window.__hardQA.match(number), round);
        const mapHash=createHash('sha256').update(JSON.stringify(match.map)).digest('hex');delete match.map;
        result.matches.push({seed,mapHash,...match});assert.equal(match.mass,match.afterMass);
        if(variant==='current')assert(match.fighters.slice(1).every(f=>f.difficulty==='normal'));
        console.log(JSON.stringify({variant,seed,round,mode:'moving player',elapsed:match.elapsed,outcome:match.outcome,botHits:match.damage.filter(h=>h.ownerId!=='player'&&h.targetId==='player').length,playerHits:match.damage.filter(h=>h.ownerId==='player').length}));
        if(variant==='current'&&seed===seeds[0]&&[1,4].includes(round))await page.screenshot({path:output+'/moving-round-'+round+'.png'});
      }
      await context.close();
    }
  }
  assert.deepEqual(report.errors,[]);report.ok=true;
} catch(error) { report.ok=false;report.failure={message:error.message,stack:error.stack};throw error; }
finally { await writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser?.close();await server?.close(); }
console.log(JSON.stringify({ok:report.ok,variants:report.variants.length,errors:report.errors.length}));
