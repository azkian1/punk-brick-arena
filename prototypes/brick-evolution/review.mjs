import { chromium } from 'file:///C:/Users/az/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// A disposable, headless test browser; never attaches to a user's browser/profile.
const output=new URL('./previews/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader']});
const errors=[],checks=[];
try {
  const context=await browser.newContext({viewport:{width:1920,height:1200},deviceScaleFactor:1,acceptDownloads:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const response=await page.goto('http://127.0.0.1:5173/prototypes/brick-evolution/',{waitUntil:'networkidle'});
  if(response.status()!==200)throw new Error(`HTTP ${response.status()}`);
  for(const character of ['mosher','guitar']) {
    await page.locator(`[data-model="${character}"]`).click();
    await page.locator('#status.checked').waitFor({timeout:30000});
    await page.screenshot({path:fileURLToPath(new URL(`${character}-viewer.png`,output)),fullPage:true});
    for(const monochrome of [false,true]) {
      if(monochrome)await page.locator('#color').click();
      const downloadPromise=page.waitForEvent('download');
      await page.locator('#export').click();
      const download=await downloadPromise;
      await download.saveAs(fileURLToPath(new URL(download.suggestedFilename(),output)));
      console.log(`Saved ${download.suggestedFilename()}`);
      checks.push({character,monochrome,file:download.suggestedFilename(),status:await page.locator('#status').innerText()});
    }
    await page.locator('#color').click();
    await page.locator('#growth').fill('35');
    if(await page.locator('#growth-value').innerText()!=='35%')throw new Error('Growth input failed');
    await page.screenshot({path:fileURLToPath(new URL(`${character}-growth-35.png`,output)),fullPage:true});
    await page.locator('#growth').fill('100');
    await page.locator('#back').click();
    await page.screenshot({path:fileURLToPath(new URL(`${character}-back.png`,output)),fullPage:true});
    await page.locator('#angle').click();
    if(character==='guitar') {
      await page.locator('#reserve').click();
      if(!(await page.locator('#status').innerText()).includes('0 потерянных'))throw new Error('Reserve balance missing');
      const reserveDownload=page.waitForEvent('download');await page.locator('#export').click();
      const downloaded=await reserveDownload;await downloaded.saveAs(fileURLToPath(new URL(downloaded.suggestedFilename(),output)));
      console.log(`Saved ${downloaded.suggestedFilename()}`);
      await page.locator('#reserve').click();
    }
  }
  await writeFile(new URL('browser-check.json',output),JSON.stringify({checks,errors},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({pngs:checks.map(c=>c.file),browserErrors:errors.length,checked:'both characters; both phases; mixed colors; monochrome; connected growth; back view'}));
} finally { await browser.close(); }
