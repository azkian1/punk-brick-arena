// Production layout checks; granted stock and display counts are isolated fixtures.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const runtime = process.env.PLAYWRIGHT_MODULE || 'C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const output = process.env.HUD_AUDIT_OUTPUT || 'artifacts/hud-arena-audit';
await mkdir(output, { recursive: true });
let server, browser;
const report = { mode: 'production HUD with separate granted stock/display fixtures', views: [], errors: [] };
const instrumentation = `
window.__hudQA = {
  draw: () => { renderer.shake=0;draw(0);updateUI(); },
  stability: () => {
    const ui=document.querySelector('.game-ui'),sample=()=>[ui.style.getPropertyValue('--arena-hud-top'),ui.style.getPropertyValue('--arena-hud-height')];
    const before=sample(),render=renderer.renderer.render;
    // Keep camera/layout code active without queuing forty software GPU frames.
    renderer.renderer.render=()=>{};
    try {for(let i=0;i<40;i++){renderer.shake=0;draw(0);}}
    finally {renderer.renderer.render=render;}
    const after=sample();renderer.shake=8;draw(0);
    return {before,after,shake:sample(),gpuSuppressedDuringStabilityOnly:true};
  },
  stock: count => {
    const s=actors[0].structure.evolution;
    s.reserve=Array.from({length:count},(_,i)=>{
      const p=actors[0].template.pieces[i%actors[0].template.pieces.length];
      return {...p,id:'hud-granted-stock-'+i,position:{...p.position},size:{...p.size}};
    });
    s.reserveRevision++;renderer.shake=0;draw(0);updateUI();
  },
  quiet: () => { for(const a of actors)a.bot=undefined; },
  step: n => { for(let i=0;i<n;i++)tick(1/60);renderer.shake=0;draw(0);updateUI(); },
  shake: () => { renderer.shake=8;draw(0); },
  floor: () => {
    const b=canvas.getBoundingClientRect(),points=[];
    for(const x of [-1,1])for(const z of [-1,1])for(const y of [-1.5,-.1]){
      const p=new THREE.Vector3(x*(CONFIG.arenaWidth+3)/2,y,z*(CONFIG.arenaDepth+3)/2).project(renderer.camera);
      points.push({x:b.left+(p.x+1)*b.width/2,y:b.top+(1-p.y)*b.height/2});
    }
    return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
  },
  loss: () => {
    const p=actors[0];for(let i=0;i<2&&alive(p);i++){const r=damageStructure(p.structure,p.structure.pieces.size,()=>.5);knockOff(p,[...r.direct,...r.cascade]);}
    eliminate(p);tick(0);draw(0);updateUI();
  }
};
`;
try {
  let url=process.env.HUD_AUDIT_URL;
  if(!url){
    const port=Number(process.env.HUD_AUDIT_PORT||5195);
    server=await createServer({configFile:false,server:{host:'127.0.0.1',port,strictPort:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});
    await server.listen();url='http://127.0.0.1:'+port+'/';
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const views=[
    {name:'desktop-1971',width:1971,height:862,dpr:1},
    {name:'desktop-1872',width:1872,height:879,dpr:1},
    {name:'laptop-1366',width:1366,height:768,dpr:1},
    {name:'laptop-dpr2',width:1366,height:768,dpr:2},
    {name:'desktop-boundary-1281',width:1281,height:768,dpr:1},
    {name:'compact-1024',width:1024,height:768,dpr:1},
    {name:'zoom150-equivalent',width:1314,height:575,dpr:1.5},
    {name:'zoom200-equivalent',width:986,height:431,dpr:2},
    {name:'short-desktop',width:1366,height:480,dpr:1},
    {name:'portrait',width:390,height:844,dpr:2,touch:true},
    {name:'landscape',width:844,height:390,dpr:2,touch:true},
  ];
  for(const v of views){
    const context=await browser.newContext({viewport:{width:v.width,height:v.height},deviceScaleFactor:v.dpr,isMobile:!!v.touch,hasTouch:!!v.touch,reducedMotion:'reduce'});
    await context.addInitScript(()=>{window.__qaFrozen=true;});
    await context.route('**/src/main.ts*',async route=>{
      const response=await route.fetch();let body=await response.text();
      assert(body.includes('tick(1 / 60);'),'main fixed-step marker changed');
      body=body.replace('tick(1 / 60);','if (!window.__qaFrozen) tick(1 / 60);').replaceAll('requestAnimationFrame(frame);','if (!window.__qaFrozen) requestAnimationFrame(frame);');
      await route.fulfill({response,body:body+instrumentation});
    });
    const page=await context.newPage();
    page.on('pageerror',e=>report.errors.push(v.name+': '+e.message));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(v.name+': '+m.text());});
    await page.goto(url,{waitUntil:'networkidle'});
    await page.locator('[data-evolution="frontman"]').click();
    await page.locator('[data-action="start"]').click();
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.evaluate(()=>{window.__hudQA.quiet();window.__hudQA.stock(240);});
    const layout=await page.evaluate(()=>{
      const read=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom,font:c.fontFamily,size:parseFloat(c.fontSize)};};
      const overflow=['.match-hud','.collection-hud','.reserve-panel__header','.reserve-panel__footer','.dash-hud','.shot-control'].filter(s=>{
        const e=document.querySelector(s);return e.getClientRects().length&&e.clientHeight>0&&(e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1);
      });
      return {left:read('.player-sidebar'),right:read('.action-panel'),count:read('[data-player-pieces]'),title:read('.dash-hud strong'),caption:read('.shot-control p'),floor:window.__hudQA.floor(),overflow,overflowX:document.documentElement.scrollWidth-innerWidth};
    });
    assert(Math.abs(layout.left.y-layout.right.y)<1,v.name+': top mismatch');
    assert(Math.abs(layout.left.width-layout.right.width)<1,v.name+': width mismatch');
    assert.equal(layout.overflowX,0,v.name+': horizontal overflow');
    assert.deepEqual(layout.overflow,[],v.name+': clipped card content');
    for(const b of [layout.left,layout.right])assert(b.x>=0&&b.x+b.width<=v.width+1&&b.y>=0&&b.bottom<=v.height+1,v.name+': panel outside viewport');
    if(v.width>1280&&v.height>=600){
      assert(Math.abs(layout.left.height-layout.right.height)<1,v.name+': height mismatch');
      assert(Math.abs(layout.left.y-Math.max(88,layout.floor.top))<1,v.name+': floor top mismatch');
      assert(Math.abs(layout.left.bottom-Math.min(v.height-20,layout.floor.bottom))<1,v.name+': floor bottom mismatch');
      assert(layout.left.x+layout.left.width<layout.floor.left,v.name+': left panel overlaps arena');
      assert(layout.right.x>layout.floor.right,v.name+': right panel overlaps arena');
      assert(layout.count.size>=52&&layout.title.size>=24&&layout.caption.size>=16,v.name+': typography too small');
      const anchors=await page.evaluate(()=>window.__hudQA.stability());
      assert.deepEqual(anchors.before,anchors.after,v.name+': layout feedback');assert.deepEqual(anchors.after,anchors.shake,v.name+': HUD shakes');
      await page.evaluate(()=>window.__hudQA.draw());
    }
    await page.screenshot({path:output+'/'+v.name+'.png',timeout:60000,animations:'disabled'});
    await page.evaluate(()=>{document.querySelector('[data-player-pieces]').textContent='10141';document.querySelector('[data-repairs]').textContent='268';document.querySelector('[data-growth]').textContent='301';});
    const countOverflow=await page.evaluate(()=>['.match-hud','.collection-hud'].filter(s=>{const e=document.querySelector(s);return e.getClientRects().length&&e.clientHeight>0&&(e.scrollHeight>e.clientHeight+1||e.scrollWidth>e.clientWidth+1);}));
    assert.deepEqual(countOverflow,[],v.name+': large counts clipped');
    await page.screenshot({path:output+'/'+v.name+'-large-counts.png',timeout:60000,animations:'disabled'});
    await page.evaluate(()=>window.__hudQA.draw());
    const slider=page.locator('[data-shot-count]');await slider.fill('20');await slider.dispatchEvent('input');await slider.focus();await page.keyboard.press('ArrowLeft');
    assert.equal(await slider.inputValue(),'19');assert.equal((await page.evaluate(()=>window.__arenaSnapshot)).input.firing,false);
    await page.locator('[data-action="dash"]').click();await page.evaluate(()=>window.__hudQA.step(1));
    await page.locator('[data-action="pause"]').click();assert(await slider.isDisabled());
    await page.locator('[data-action="resume"]').click();assert(await slider.isEnabled());
    await page.evaluate(()=>window.__hudQA.loss());assert.equal(await page.locator('#result-title').innerText(),'You Lost');assert(await slider.isDisabled());
    report.views.push({view:v,layout,controls:'range, dash, pause, defeat passed'});
    console.log(JSON.stringify({view:v.name,width:layout.left.width,top:layout.left.y,height:layout.left.height,ok:true}));
    await context.close();
  }
  assert.deepEqual(report.errors,[]);report.ok=true;
}catch(e){report.ok=false;report.failure={message:e.message,stack:e.stack};throw e;}
finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser?.close();await server?.close();}
console.log(JSON.stringify({ok:report.ok,views:report.views.length,errors:report.errors.length}));
