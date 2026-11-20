// An artistic density scale, never a measured tree count or protected-area estimate.
export function forestDensity(areaHa:number):number|null {
 if(!Number.isFinite(areaHa)||areaHa<0||areaHa>100.000001)return null;
 return Math.min(1,areaHa/100);
}
export function illustrativeCount(capacity:number,density:number){return Math.round(capacity*density);}
