import type {Cell,StudyData} from './data';
import {forestDensity} from './forestDensity.ts';

export function surpriseGroups(study:StudyData){
 const groups:number[][]=[[],[],[],[]];
 for(let i=0;i<study.meta.count;i++){
  const cell=study.cell(i),density=forestDensity(cell.area);
  if(cell.status==='ELIGIBLE_PREDICTED'&&density!==null)groups[Math.min(3,Math.floor(density*4))].push(i);
 }
 return groups.filter(group=>group.length);
}
export function surpriseCell(study:StudyData,groups:number[][],previous:Cell|null,random= Math.random){
 // Sample area bands equally so successive visits can show different forest amounts.
 // This is an exploration aid, not a representative sample or a conservation ranking.
 const previousBand=previous?Math.min(3,Math.floor(previous.area/25)):-1;
 const alternatives=groups.filter(group=>Math.min(3,Math.floor(study.cell(group[0]).area/25))!==previousBand);
 const available=alternatives.length?alternatives:groups;if(!available.length)return null;
 const group=available[Math.floor(random()*available.length)];
 return study.cell(group[Math.floor(random()*group.length)]);
}

export function comparisonCell(study:StudyData,groups:number[][],current:Cell){
 const targetArea=current.area>=50?15:85;
 const candidates=targetArea<50?groups[0]:groups.at(-1);
 let choice:Cell|null=null;
 for(const index of candidates??[]){
  const cell=study.cell(index);
  if(cell.state!==current.state||Math.abs(cell.area-current.area)<30)continue;
  if(!choice||Math.abs(cell.area-targetArea)<Math.abs(choice.area-targetArea))choice=cell;
 }
 return choice;
}
