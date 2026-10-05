import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createStructure, connectedToCore } from '../../src/game/structure';

const source=JSON.parse(readFileSync(new URL('../../src/assets/templates.generated.json',import.meta.url),'utf8'));
const checks=[];
const catalog=JSON.parse(readFileSync(new URL('./catalog.json',import.meta.url),'utf8'));
for(const id of catalog.flatMap((entry:{id:string})=>[`${entry.id}-2`,`${entry.id}-3`])) {
  const {model,report,reserve}=JSON.parse(readFileSync(new URL(`./data/${id}.json`,import.meta.url),'utf8'));
  const original=source.find((t:any)=>t.id==='violet');
  assert.equal(report.headPieces,original.pieces.length);
  const references=new Set<string>();
  for(const part of [...model.pieces,...reserve]) {
    const original=source.find((t:any)=>t.id===part.donor.template)?.pieces.find((p:any)=>p.id===part.donor.pieceId);
    assert.ok(original,`${id}: source exists`);
    assert.deepEqual(part.size,original.size,`${id}: no scaled or cut parts`);
    assert.equal(part.color,original.color,`${id}: no recoloring`);
    assert.equal(part.shape,original.shape,`${id}: no fabricated specialty shapes`);
    const ref=`${part.donor.copy}:${part.donor.template}:${part.donor.pieceId}`;
    assert.ok(!references.has(ref),`${id}: no duplicate source part`);references.add(ref);
  }
  const donorTotal=report.donorHeads.reduce((n:number,id:string)=>n+source.find((t:any)=>t.id===id).pieces.length,0);
  assert.equal(model.pieces.length+reserve.length,original.pieces.length+donorTotal,`${id}: conservation with bank`);
  const prefixes=[];
  for(const fraction of [0,.25,.5,.75,1]) {
    const count=report.headPieces+Math.round(report.addedPieces*fraction);
    const structure=createStructure({...model,pieces:model.pieces.slice(0,count)});
    assert.equal(connectedToCore(structure).size,count,`${id}: all partial-assembly pieces connected at ${fraction}`);
    const bank=reserve.length+model.pieces.length-count;
    assert.equal(count+bank,original.pieces.length+donorTotal,`${id}: partial assembly preserves bank balance`);
    prefixes.push({fraction,installed:count,bank,connected:count});
  }
  assert.equal(report.collisions,0);
  checks.push({id,pieces:model.pieces.length,stock:reserve.length,prefixes,sourceDimensionsColorsAndShapesPreserved:true,bankBalanced:true});
}
writeFileSync(new URL('./data/audit.json',import.meta.url),JSON.stringify({checks},null,2));
console.log(JSON.stringify({models:checks.length,prefixChecks:checks.length*5,checks:'exact donor size/shape/color; unique pieces; original head; conservation including inventory; connected growth prefixes'}));
