export type ViewMode='overview'|'forest';
export interface MapViewState{mode:'3d'|'flat';position?:number[];target?:number[];zoom:number;center?:[number,number];extent?:number;time?:number;referenceFit?:number;viewport?:[number,number];}
export interface ForestInput{forward:number;side:number;lookX:number;lookY:number;reset:number;action?:{kind:'approach'|'lookUp';noteId:string};}
export const idleForestInput=():ForestInput=>({forward:0,side:0,lookX:0,lookY:0,reset:0});
