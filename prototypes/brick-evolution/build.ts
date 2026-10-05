import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Piece, CharacterTemplate } from '../../src/game/types';
import { createStructure, connectedToCore, getBounds } from '../../src/game/structure';

// This is an isolated assembly experiment, not a change to gameplay.
// Cells: one stud in X/Z, one plate (0.4 game units) in Y.
const templates: CharacterTemplate[] = JSON.parse(readFileSync(new URL('../../src/assets/templates.generated.json', import.meta.url), 'utf8'));
const head = templates.find(t => t.id === 'violet')!;
const donors = templates.filter(t => t.id !== head.id);
const out = new URL('./data/', import.meta.url);
mkdirSync(out, { recursive: true });
const axes = ['x', 'y', 'z'] as const;
const snap = (n: number) => Math.round(n * 1000) / 1000;
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const signature = (p: Piece) => `${p.shape}:${p.size.x}x${p.size.y}x${p.size.z}`;
type Cell = { x: number; y: number; z: number; zone: string };

class Blueprint {
  cells = new Map<string, Cell>();
  add(x: number, y: number, z: number, zone: string) {
    if (y >= 0) this.cells.set(key(x, y, z), { x, y, z, zone });
  }
  volume(bounds: number[], inside: (x: number, y: number, z: number) => boolean, zone: string) {
    const [x0, x1, y0, y1, z0, z1] = bounds;
    for (let y = Math.max(0, Math.floor(y0 / .4)); y < Math.ceil(y1 / .4); y++)
      for (let z = Math.floor(z0); z < Math.ceil(z1); z++)
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++)
          if (inside(x + .5, (y + .5) * .4, z + .5)) this.add(x, y, z, zone);
  }
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, zone: string) {
    this.volume([x0, x1, y0, y1, z0, z1], (x,y,z) => x >= x0 && x < x1 && y >= y0 && y < y1 && z >= z0 && z < z1, zone);
  }
  ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number, zone: string) {
    this.volume([x-rx,x+rx,y-ry,y+ry,z-rz,z+rz], (a,b,c) => ((a-x)/rx)**2+((b-y)/ry)**2+((c-z)/rz)**2 <= 1, zone);
  }
  limb(a: number[], b: number[], radius: number, depth: number, zone: string) {
    const dx = b[0]-a[0], dy=b[1]-a[1], length=dx*dx+dy*dy;
    this.volume([Math.min(a[0],b[0])-radius,Math.max(a[0],b[0])+radius,Math.min(a[1],b[1])-radius,Math.max(a[1],b[1])+radius,Math.min(a[2],b[2])-depth,Math.max(a[2],b[2])+depth], (x,y,z) => {
      const t = Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length));
      return ((x-a[0]-dx*t)/radius)**2+((y-a[1]-dy*t)/radius)**2+((z-a[2]-(b[2]-a[2])*t)/depth)**2 <= 1;
    }, zone);
  }
  polygon(points: number[][], z0: number, z1: number, zone: string) {
    this.volume([Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[1])),z0,z1], (x,y) => {
      let inside=false;
      for (let i=0,j=points.length-1;i<points.length;j=i++) {
        const [xi,yi]=points[i], [xj,yj]=points[j];
        if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
      }
      return inside;
    }, zone);
  }
  spike(x: number, y: number, z: number, height: number) {
    for(let i=0;i<height;i+=1.2) {
      const radius = Math.max(.6, 2.6*(1-i/height));
      this.box(x-radius,x+radius,y+i,y+i+1.2,z-radius,z+radius,'stud-spikes');
    }
  }
}

function mosher(stage: number) {
  const b=new Blueprint(), big=stage===3, neckY=big?60:40.8;
  for (const side of [-1,1]) {
    const foot=big?17:8;
    b.box(side*foot-(big?8:5),side*foot+(big?8:5),0,big?7.2:4.8,-5,big?13:10,'boots');
    b.limb([side*foot,5,1],[side*(big?13:7),big?19:14,0],big?5.7:3.3,big?6:4,'shins');
    b.limb([side*(big?13:7),big?18:13,0],[side*(big?9:5),big?31:23,0],big?6.7:4.1,big?6.5:4.3,'thighs');
    b.limb([side*(big?17:10),big?52:35,0],[side*(big?29:17),big?41:28,0],big?8:4.4,big?8:4.5,'upper-arms');
    b.limb([side*(big?29:17),big?41:28,0],[side*(big?36:20),big?20:18,2],big?8.2:4.3,big?8:4.5,'forearms');
    b.ellipsoid(side*(big?37:21),big?12:14,3,big?10:5.8,big?10:6,big?9:5.7,'fists');
    const baseX=side*(big?37:21);
    for (let finger=-1;finger<=1;finger++) {
      const x=baseX+finger*(big?5:3);
      b.box(x-(big?2:1),x+(big?2:1),big?3.6:10.8,big?16.8:18,big?8:6,big?14:9,'knuckles');
    }
    b.box(side*(big?34:20)-(big?8:5),side*(big?34:20)+(big?8:5),big?21.6:19.2,big?25.2:21.6,-6,big?10:7,'cuffs');
    for(let i=0;i<3;i++) b.spike(side*(big?14+i*5:11+i*4),big?57-i*2:38-i*2,0,big?6:3.6);
  }
  b.ellipsoid(0,big?30:23,0,big?13:9,big?7:5,big?7:5,'pelvis');
  b.ellipsoid(0,big?46:31,0,big?20:12,big?13:9,big?9:6,'torso');
  b.box(-5,5,neckY-4.8,neckY,-4,4,'neck');
  b.box(big?-12:-8,big?12:8,big?30:22.8,big?33.6:25.2,4,big?9:7,'belt');
  for(const s of [-1,1]) b.box(s*(big?7:5)-1,s*(big?7:5)+1,big?38.4:28.8,big?52.8:36,5,big?10:7,'jacket-lapels');
  return { blueprint:b, neckY };
}

function guitar(stage: number) {
  const b=new Blueprint(),big=stage===3,neckY=big?60:43.2;
  for(const side of [-1,1]) {
    const foot=big?14:8;
    b.box(side*foot-4,side*foot+4,0,4.8,-3,9,'boots');
    b.limb([side*foot,4.8,0],[side*(big?11:6),big?17:14,0],big?3.3:2.8,3.6,'shins');
    b.limb([side*(big?11:6),big?17:14,0],[side*(big?5:4),big?33:25,0],big?4.3:3.3,4,'thighs');
    for(let i=0;i<2;i++) b.spike(side*(big?12+i*4:9+i*3),big?54-i:37-i,0,big?7.2:3.6);
  }
  b.ellipsoid(0,big?32:25,0,big?8:7,big?5:4,4,'pelvis');
  b.ellipsoid(0,big?46:34,0,big?10:8.5,big?12:8.5,big?6:5,'torso');
  b.box(-4,4,neckY-4.8,neckY,-3,4,'neck');
  b.limb([big?9:8,big?53:37,0],[big?17:14,big?44:31,0],big?3.8:3.2,3.7,'guitar-arm');
  b.limb([big?17:14,big?44:31,0],[big?22:16,big?35:25,3],big?4:3.2,3.5,'guitar-arm');
  if(big) {
    b.limb([-9,53,0],[-20,44,0],3.6,3.5,'claw-arm');
    b.limb([-20,44,0],[-30,56,1],3.3,3,'claw-arm');
    b.ellipsoid(-31,59,1,4.2,5,3,'claw-palm');
    for(let i=0;i<3;i++) {
      const z=-3+i*3;
      b.limb([-32,59,z],[-39-i,66+i*2,z],1.5,1.3,'claw-fingers');
      b.limb([-39-i,66+i*2,z],[-45-i,64+i*2,z],1.5,1.3,'claw-fingers');
    }
    b.polygon([[14,37],[24,37],[44,10],[30,18],[24,7],[13,26]],2,7,'guitar-body');
    b.limb([22,34,4],[36,57,4],2.3,2.4,'guitar-neck');
    b.box(33,39,55.2,62.4,2,7,'guitar-headstock');
    b.polygon([[-9,35],[-4,31],[-12,10],[-15,16]],-7,-4,'coat-tails');
    b.polygon([[9,35],[4,31],[12,10],[15,16]],-7,-4,'coat-tails');
  } else {
    b.limb([-8,37,0],[-14,28,0],3,3,'left-arm');
    b.limb([-14,28,0],[-16,19,2],2.8,3,'left-arm');
    b.ellipsoid(-16,17,2,3.5,4,3.5,'left-fist');
    b.polygon([[11,26],[18,27],[30,10],[21,14],[17,8],[10,19]],2,6,'guitar-body');
    b.limb([16,25,3],[25,40,3],1.9,2,'guitar-neck');
    b.box(23,28,38.4,44.4,1,6,'guitar-headstock');
  }
  b.box(big?-7:-6,big?7:6,big?31.2:24,big?33.6:26.4,3,6,'belt');
  return { blueprint:b,neckY };
}

// The new silhouettes use only filled stud/plate cells. Curves, drum rims,
// speaker cones and wing membranes are packed with the same donor stock.
function drum(b: Blueprint, x: number, y: number, z: number, radius: number, height: number) {
  for(const [bottom,top,r,zone] of [[y,y+1.2,radius,'drum-rim'],[y+1.2,y+height-1.2,radius-1.2,'drum-shell'],[y+height-1.2,y+height,radius,'drum-rim']] as const)
    b.volume([x-r,x+r,bottom,top,z-r,z+r],(a,_,c)=>((a-x)/r)**2+((c-z)/r)**2<=1,zone);
  for(const side of [-1,1])b.box(x+side*(radius-1)-1,x+side*(radius-1)+1,y,y+height,z-1,z+1,'drum-lugs');
}

function spider(stage: number) {
  const b=new Blueprint(),big=stage===3,neckY=big?55.2:43.2;
  b.ellipsoid(0,big?33:25,0,big?10:7,big?7:4,big?7:5,'pelvis');
  b.ellipsoid(0,big?45:34,0,big?12:9,big?10:8.5,big?7:5.5,'torso');
  b.box(-4,4,neckY-4.8,neckY,-3,4,'neck');
  drum(b,0,big?29:22,big?9:6,big?11:8,big?10.8:7.2);
  for(const side of [-1,1]) {
    if(big) {
      for(const row of [-1,1]) {
        // A pair of front legs and a pair of rear legs, separated in depth.
        const toe=side*(row===1?34:29),z=row*18;
        b.limb([side*7,33,row*4],[side*22,26,row*13],3.8,4,'spider-upper-legs');
        b.limb([side*22,26,row*13],[toe,5,z],3.1,3.8,'spider-lower-legs');
        b.box(toe-5,toe+5,0,4.8,z-4,z+7,'boots');
        b.box(side*22-4,side*22+4,24,28.8,row*13-4,row*13+4,'kneepads');
      }
      b.limb([side*11,47,2],[side*22,42,5],3.4,3.5,'lower-upper-arms');
      b.limb([side*22,42,5],[side*30,50,8],3,3.2,'lower-forearms');
      b.ellipsoid(side*31,51,8,3.6,4,3.6,'lower-hands');
      b.limb([side*31,52,8],[side*39,65,8],1.3,1.4,'lower-drumsticks');
      b.box(side*39-3,side*39+3,63.6,68.4,5,11,'lower-mallet-heads');
      b.limb([side*8,50,-4],[side*18,63,-7],3.2,3.4,'upper-upper-arms');
      b.limb([side*18,63,-7],[side*27,72,-6],2.9,3,'upper-forearms');
      b.ellipsoid(side*27,73,-6,3.5,4,3,'upper-hands');
      b.limb([side*27,74,-6],[side*38,86,-6],1.3,1.4,'upper-drumsticks');
      b.box(side*38-3,side*38+3,84,90,-9,-3,'upper-mallet-heads');
      b.spike(side*11,49.2,2,4.8);
    } else {
      b.box(side*9-4,side*9+4,0,4.8,-4,8,'boots');
      b.limb([side*9,5,0],[side*8,15,0],2.9,3.5,'shins');
      b.limb([side*8,15,0],[side*4,26,0],3.3,4,'thighs');
      b.limb([side*8,37,0],[side*17,30,0],2.9,3,'upper-arms');
      b.limb([side*17,30,0],[side*24,40,2],2.8,3,'forearms');
      b.ellipsoid(side*24,41,2,3.2,3.8,3,'hands');
      b.limb([side*24,42,2],[side*29,54,2],1.2,1.3,'drumsticks');
      b.box(side*29-2,side*29+2,52.8,56.4,0,4,'mallet-heads');
      b.spike(side*11,38.4,0,3.6);
    }
  }
  return {blueprint:b,neckY};
}

function speaker(b: Blueprint, x: number, y: number, radius: number, back: number) {
  // Recess the front of the chest, then build a rim and an inward-sloping cone.
  // Relief remains readable when every brick has a different color.
  for(const [k,c] of b.cells)if((c.x+.5-x)**2+((c.y+.5)*.4-y)**2<radius*radius&&c.z>=back)b.cells.delete(k);
  b.volume([x-radius,x+radius,y-radius,y+radius,back,back+4],(a,c,z)=>{
    const r=Math.hypot(a-x,c-y);
    return r<=radius&&(r>=radius-1.3||z<back+.7+2.8*(1-r/(radius-1.3))**2);
  },'speaker-cone');
  b.ellipsoid(x,y,back+2.2,radius*.27,radius*.27,1.5,'speaker-dustcap');
}

function bass(stage: number) {
  const b=new Blueprint(),big=stage===3,neckY=big?64.8:45.6;
  for(const side of [-1,1]) {
    const foot=big?14:8;
    b.box(side*foot-(big?6:4.5),side*foot+(big?6:4.5),0,big?6:4.8,-4,big?12:9,'boots');
    b.limb([side*foot,5,0],[side*(big?12:7),big?18:14,0],big?4.8:3.5,big?5.5:4,'shins');
    b.limb([side*(big?12:7),big?18:14,0],[side*(big?8:5),big?31:25,0],big?5.8:4,big?6:4.5,'thighs');
    b.limb([side*(big?17:10),big?55:37,0],[side*(big?27:17),big?41:28,0],big?6.3:4,big?6:4,'upper-arms');
    b.limb([side*(big?27:17),big?41:28,0],[side*(big?29:18),big?27:19,2],big?5.1:3.8,big?5:4,'forearms');
    b.ellipsoid(side*(big?29:18),big?21:16,2,big?6.5:4.5,big?7.5:5,big?6:4.7,'fists');
    b.box(side*(big?29:18)-(big?6:4),side*(big?29:18)+(big?6:4),big?27.6:20.4,big?31.2:22.8,-4,big?8:6,'cuffs');
    b.spike(side*(big?18:12),big?58.8:40.8,1,big?4.8:3.6);
  }
  b.ellipsoid(0,big?31:25,0,big?11:8,big?6:5,big?7:5,'pelvis');
  b.ellipsoid(0,big?48:34,0,big?18:11.5,big?15:9,big?10:6.7,'torso');
  b.box(-5,5,neckY-4.8,neckY,-4,4,'neck');
  b.box(big?-10:-7,big?10:7,big?30:24,big?33.6:26.4,4,big?9:7,'belt');
  if(big) {
    for(const x of [-7,7])for(const y of [41,54])speaker(b,x,y,6,4);
    for(const side of [-1,1]) {
      b.limb([side*13,55,-5],[side*20,71,-6],2.8,3,'horn-stems');
      // Hollow, forward-facing stepped horn mouth: ordinary bricks, no speaker part.
      for(let z=-8;z<1;z++) {
        const r=3+(z+8)*.32;
        b.volume([side*20-r,side*20+r,72-r,72+r,z,z+1],(x,y)=>Math.max(Math.abs(x-side*20),Math.abs(y-72))<=r&&(Math.max(Math.abs(x-side*20),Math.abs(y-72))>=r-1.5||z<-6),'horn-mouths');
      }
    }
  } else speaker(b,0,34,6,3);
  return {blueprint:b,neckY};
}

function frontman(stage: number) {
  const b=new Blueprint(),big=stage===3,neckY=big?60:43.2;
  for(const side of [-1,1]) {
    const foot=big?12:7;
    b.box(side*foot-4,side*foot+4,0,4.8,-3,9,'boots');
    b.limb([side*foot,5,0],[side*(big?9:6),big?17:13,0],big?3.2:2.8,3.5,'shins');
    b.limb([side*(big?9:6),big?17:13,0],[side*4,big?31:24,0],big?3.7:3.1,3.6,'thighs');
  }
  b.ellipsoid(0,big?31:24,0,big?7:6.5,4.5,4,'pelvis');
  b.ellipsoid(0,big?46:33,0,big?9:8,big?12:9,big?5.5:5,'torso');
  b.box(-4,4,neckY-4.8,neckY,-3,4,'neck');
  b.box(-7,7,big?30:24,big?32.4:26.4,3,6,'belt');
  b.limb([big?8:7,big?52:36,0],[big?22:16,big?46:30,0],big?3.4:2.8,3,'microphone-upper-arm');
  b.limb([big?22:16,big?46:30,0],[big?16:14,big?65:47,3],big?3:2.5,3,'microphone-forearm');
  b.ellipsoid(big?16:14,big?65:47,3,3,3.6,3,'microphone-hand');
  b.limb([big?16:14,big?65:47,3],[11,big?71:53,6],1.2,1.3,'microphone-handle');
  b.box(9,13,big?70:51.6,big?73.2:55.2,4,8,'microphone-head');
  b.limb([big?-8:-7,big?52:36,0],[big?-20:-15,big?44:28,0],big?3:2.6,3,'left-upper-arm');
  b.limb([big?-20:-15,big?44:28,0],[big?-28:-19,big?32:20,3],big?2.8:2.6,3,'left-forearm');
  b.ellipsoid(big?-29:-19,big?30:18,3,3.8,4,3.4,'claw-palm');
  if(big)for(let i=0;i<3;i++) {
    b.limb([-28-i*2,30,1+i*3],[-33-i*3,23,1+i*3],1.3,1.3,'claw-fingers');
    b.limb([-33-i*3,23,1+i*3],[-31-i*3,19,1+i*3],1.3,1.3,'claw-tips');
  }
  for(const side of [-1,1]) {
    if(big) {
      const points=[[7,51],[18,65],[40,88],[55,38],[43,48],[35,31],[26,42],[19,28],[12,42]].map(([x,y])=>[x*side,y]);
      b.polygon(points,-8,-6,'wing-membranes');
      // Leading spars and branching fingers attach the membranes to the back.
      b.limb([side*6,51,-5],[side*18,65,-7],2.5,2.6,'wing-roots');
      b.limb([side*18,65,-7],[side*40,87,-7],2.1,2.3,'wing-leading-edges');
      b.limb([side*40,87,-7],[side*54,39,-7],1.5,1.7,'wing-fingers');
      b.limb([side*40,86,-7],[side*35,33,-7],1.4,1.6,'wing-fingers');
      b.limb([side*18,64,-7],[side*19,30,-7],1.4,1.6,'wing-fingers');
      b.spike(side*40,87.6,-7,3.6);
      b.polygon([[side*7,32],[side*3,30],[side*10,12],[side*14,17]],-6,-4,'coat-tails');
    } else {
      b.polygon([[side*5,38],[side*14,38],[side*19,21],[side*13,25],[side*11,18],[side*7,27]],-6,-4,'short-cape');
      b.limb([side*5,38,-3],[side*14,37,-5],1.8,2,'cape-roots');
      b.spike(side*9,37.2,0,3.6);
    }
  }
  return {blueprint:b,neckY};
}

// A finite stream of real donor heads. When a slot needs more of a size, bring
// in another complete donor head. No cutting, stretching, recoloring or rotations.
class Inventory {
  queues=new Map<string,{source:Piece;templateId:string;copy:number}[]>();
  admitted: string[]=[];
  used: Record<string,number>={};
  consumed=0;
  available(k: string) { return (this.queues.get(k)?.length??0)>0; }
  addHead() {
    const template=donors[this.admitted.length%donors.length],copy=this.admitted.length+1;
    this.admitted.push(template.id);
    for(const source of template.pieces) {
      const k=signature(source),q=this.queues.get(k)??[];
      q.push({source,templateId:template.id,copy}); this.queues.set(k,q);
    }
  }
  take(k: string) {
    while(!this.queues.get(k)?.length) this.addHead();
    const q=this.queues.get(k)!;
    // Interleave donor heads to make color independence visible, without color selection.
    const i=(this.consumed++*37)%q.length;
    const item=q.splice(i,1)[0];
    this.used[item.templateId]=(this.used[item.templateId]??0)+1;
    return item;
  }
}

const stockTypes = [...new Map(donors.flatMap(t=>t.pieces).map(p=>[signature(p),p])).values()];
const sizes=stockTypes.filter(p=>p.shape==='brick'||p.shape==='plate').map(p=>({
  signature:signature(p),w:p.size.x,h:Math.round(p.size.y/.4),d:p.size.z,shape:p.shape,
})).sort((a,b)=>b.w*b.h*b.d-a.w*a.h*a.d);

function assemble(id: string, label: string, stage: number, body: ReturnType<typeof mosher>) {
  const {blueprint,neckY}=body;
  // Hollow large shapes, as in a brick sculpture: retain a two-stud shell,
  // six-plate floor/ceiling skin and a solid central spine.
  const solidCells=blueprint.cells.size, hollow:string[]=[];
  for(const [k,c] of blueprint.cells) {
    if(Math.abs(c.x)<=2 && Math.abs(c.z)<=2) continue;
    if([[2,0,0],[-2,0,0],[0,6,0],[0,-6,0],[0,0,2],[0,0,-2]].every(([dx,dy,dz])=>blueprint.cells.has(key(c.x+dx,c.y+dy,c.z+dz)))) hollow.push(k);
  }
  for(const k of hollow) blueprint.cells.delete(k);
  // Remove accidental cell islands before packing, then fail if more than dust.
  const cells=blueprint.cells, queue:Cell[]=[];
  const neckLayer=Math.round(neckY/.4)-1;
  const root=cells.get(key(0,neckLayer,0));
  if(!root) throw new Error('No neck root');
  const reached=new Set<string>([key(root.x,root.y,root.z)]); queue.push(root);
  for(let i=0;i<queue.length;i++) for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
    const c=queue[i],k=key(c.x+dx,c.y+dy,c.z+dz);
    if(cells.has(k)&&!reached.has(k)){reached.add(k);queue.push(cells.get(k)!);}
  }
  const dust=cells.size-reached.size;
  if(dust>cells.size*.005) {
    const zones:Record<string,number>={};
    for(const [k,c] of cells)if(!reached.has(k))zones[c.zone]=(zones[c.zone]??0)+1;
    throw new Error(`${id}: disconnected blueprint ${dust} cells: ${JSON.stringify(zones)}`);
  }
  for(const k of cells.keys()) if(!reached.has(k)) cells.delete(k);
  const maskCells=cells.size, occupied=new Set<string>(),inventory=new Inventory();
  // Starting with several complete heads avoids choosing colors to fit a design.
  for(let i=0;i<4;i++) inventory.addHead();
  const pieces: any[]=head.pieces.map(p=>({...p,position:{...p.position,y:snap(p.position.y+neckY)},size:{...p.size},zone:'original-head',donor:{template:'violet',pieceId:p.id,copy:0}}));
  const ordered=[...cells.values()].sort((a,b)=>a.y-b.y || a.z-b.z || ((a.y%2)? b.x-a.x:a.x-b.x));
  for(const cell of ordered) {
    if(occupied.has(key(cell.x,cell.y,cell.z))) continue;
    let found:typeof sizes[number]|undefined,px=cell.x;
    while(!found) {
    for(const size of sizes) {
      if(!inventory.available(size.signature)) continue;
      const x0=cell.y%2?cell.x-size.w+1:cell.x;
      let fits=true;
      for(let y=0;y<size.h&&fits;y++) for(let z=0;z<size.d&&fits;z++) for(let x=0;x<size.w;x++) {
        const k=key(x0+x,cell.y+y,cell.z+z);
        if(!cells.has(k)||occupied.has(k)){fits=false;break;}
      }
      if(fits){found=size;px=x0;break;}
    }
    if(!found) inventory.addHead();
    }
    const item=inventory.take(found.signature),source=item.source;
    pieces.push({id:`${id}-${pieces.length}`,position:{x:px-.5,y:snap(cell.y*.4),z:cell.z-.5},size:{...source.size},color:source.color,shape:source.shape,zone:cell.zone,donor:{template:item.templateId,pieceId:source.id,copy:item.copy}});
    for(let y=0;y<found.h;y++)for(let z=0;z<found.d;z++)for(let x=0;x<found.w;x++) occupied.add(key(px+x,cell.y+y,cell.z+z));
  }
  const model={id,name:label,subtitle:`Фаза ${stage}`,accent:'#8556ff',coreId:head.coreId,pieces,source:'Prototype assembled from exact existing game pieces'};
  const structure=createStructure(model);
  const connected=connectedToCore(structure).size;
  if(connected!==pieces.length) throw new Error(`${id}: only ${connected}/${pieces.length} connected`);
  // Independent AABB check with a spatial index (also checks collisions with the head).
  const bins=new Map<string,Piece[]>(),collisions:string[][]=[];
  const adjacent=new Map<string,Set<string>>(pieces.map(p=>[p.id,new Set<string>()]));
  for(const p of pieces) {
    const neighbors=new Set<Piece>(),keys:string[]=[];
    for(let x=Math.floor(p.position.x/4);x<=Math.floor((p.position.x+p.size.x)/4);x++)
      for(let y=Math.floor(p.position.y/4);y<=Math.floor((p.position.y+p.size.y)/4);y++)
        for(let z=Math.floor(p.position.z/4);z<=Math.floor((p.position.z+p.size.z)/4);z++) {
          const k=key(x,y,z);keys.push(k);for(const q of bins.get(k)??[])neighbors.add(q);
        }
    for(const q of neighbors) {
      const overlap=(a:typeof axes[number])=>Math.min(p.position[a]+p.size[a],q.position[a]+q.size[a])-Math.max(p.position[a],q.position[a]);
      if(axes.every(a=>overlap(a)>1e-6)) collisions.push([p.id,q.id]);
      else if(axes.some(a=>Math.abs(overlap(a))<1e-6&&axes.every(b=>b===a||overlap(b)>1e-6))){adjacent.get(p.id)!.add(q.id);adjacent.get(q.id)!.add(p.id);}
    }
    for(const k of keys){const bin=bins.get(k)??[];bin.push(p);bins.set(k,bin);}
  }
  if(collisions.length) throw new Error(`${id}: collisions ${JSON.stringify(collisions.slice(0,3))}`);
  // Prefixes shown by the viewer are a legal face-connected growth order from
  // the unchanged head, even though packing itself was computed bottom-up.
  const growthOrder=head.pieces.map(p=>p.id),enqueued=new Set(growthOrder);
  for(let i=0;i<growthOrder.length;i++)for(const next of adjacent.get(growthOrder[i])!){
    if(!enqueued.has(next)){enqueued.add(next);growthOrder.push(next);}
  }
  if(growthOrder.length!==pieces.length)throw new Error(`${id}: incomplete assembly order`);
  const growthRank=new Map(growthOrder.map((id,i)=>[id,i]));
  pieces.sort((a,b)=>growthRank.get(a.id)!-growthRank.get(b.id)!);
  const donorRefs=new Set<string>();
  for(const p of pieces) {
    const t=templates.find(t=>t.id===p.donor.template)!,source=t.pieces.find(s=>s.id===p.donor.pieceId)!;
    if(!source || signature(source)!==signature(p) || source.color!==p.color || (p.donor.copy>0&&inventory.admitted[p.donor.copy-1]!==p.donor.template)) throw new Error(`${id}: fabricated part ${p.id}`);
    const ref=`${p.donor.copy}:${p.donor.template}:${p.donor.pieceId}`;
    if(donorRefs.has(ref)) throw new Error(`Reused donor part ${ref}`);
    donorRefs.add(ref);
  }
  const countBySize:Record<string,number>={},countByZone:Record<string,number>={};
  for(const p of pieces){countBySize[signature(p)]=(countBySize[signature(p)]??0)+1;countByZone[p.zone]=(countByZone[p.zone]??0)+1;}
  const reserve=[...inventory.queues.values()].flat().map(item=>({...item.source,id:`reserve-${item.copy}-${item.source.id}`,donor:{template:item.templateId,pieceId:item.source.id,copy:item.copy}}));
  const donorTotal=inventory.admitted.reduce((n,id)=>n+donors.find(t=>t.id===id)!.pieces.length,0);
  if(pieces.length-head.pieces.length+reserve.length!==donorTotal)throw new Error(`${id}: inventory mass mismatch`);
  for(const p of reserve){const ref=`${p.donor.copy}:${p.donor.template}:${p.donor.pieceId}`;if(donorRefs.has(ref))throw new Error(`${id}: reserve reused an installed part`);donorRefs.add(ref);}
  const report={id,label,stage,pieces:pieces.length,headPieces:head.pieces.length,addedPieces:pieces.length-head.pieces.length,connected,collisions:collisions.length,shapeColorAndSizePreserved:true,cutOrScaledPieces:0,donorHeadsOpened:inventory.admitted.length,donorHeads:inventory.admitted,donorsUsed:inventory.used,unusedDonorPieces:[...inventory.queues.values()].reduce((n,q)=>n+q.length,0),solidCells,hollowedCells:hollow.length,bodyCells:maskCells,filledCells:occupied.size,discardedBoundaryDust:dust,bounds:getBounds(structure),countBySize,countByZone,limitation:'Verified against the game face-contact graph, not a physical LEGO stud/clutch or load-bearing simulation. Static concept pose; no joints, animation or gameplay integration.'};
  writeFileSync(new URL(`${id}.json`,out),JSON.stringify({model,report,reserve}));
  console.log(JSON.stringify({id,pieces:report.pieces,added:report.addedPieces,donorHeads:report.donorHeadsOpened,connected,collisions:0,bounds:report.bounds}));
  return report;
}

const catalog:{id:string;name:string}[]=JSON.parse(readFileSync(new URL('./catalog.json',import.meta.url),'utf8'));
const builders:Record<string,typeof mosher>={mosher,guitar,spider,bass,frontman};
const requested=process.argv.slice(2);
for(const id of requested)if(!builders[id])throw new Error(`Unknown variation: ${id}`);
const reports=[];
for(const {id,name} of catalog)
  if(!requested.length||requested.includes(id))
  for(const stage of [2,3]) reports.push(assemble(`${id}-${stage}`,name,stage,builders[id](stage)));
if(!requested.length)writeFileSync(new URL('report.json',out),JSON.stringify({generatedBy:'prototypes/brick-evolution/build.ts',colorPolicy:'Keep each donor part original color. No matching by color. Original own head stays unchanged.',stockPolicy:'Complete donor heads admitted as needed; every used part retains exact shape, dimensions and color. Only translation; no part reuse within a model.',reports},null,2));
console.log(`Saved ${reports.length} buildable-in-game models to ${fileURLToPath(out)}`);
