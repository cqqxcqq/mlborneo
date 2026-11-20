import {useEffect,useRef} from 'react';
import s from './App.module.css';
export interface FieldNote{id:string;title:string;sdg:string;target:string;body:string;takeaway:string;sourceTitle:string;sourceUrl:string;additionalSourceUrl?:string;}
export const noteTitles=[{id:'habitat',title:'Who lives here?'},{id:'carbon',title:'Where is the carbon?'},{id:'monitoring',title:'Why monitor a forest?'}];
export function FieldNotesLayer({buttons,onOpen,onApproach,opened}:{buttons:React.RefObject<(HTMLButtonElement|null)[]>;onOpen:(id:string)=>void;onApproach:(id:string)=>void;opened:Set<string>}){
 return <div className={s.noteMarkers} aria-label="Forest discovery notes">{noteTitles.map((note,i)=><button key={note.id} ref={el=>{buttons.current[i]=el;}} className={s.fieldMarker} aria-label={`Read note: ${note.title}`} onClick={e=>e.currentTarget.dataset.near==='true'?onOpen(note.id):onApproach(note.id)}><span>{note.title}</span><small className={s.noteFar}>Walk closer</small><small className={s.noteNear}>{opened.has(note.id)?'Read again · E':'Read note · E'}</small></button>)}</div>;
}
export function FieldNotePanel({id,notes,error,onClose,onOpen,onRetry}:{id:string;notes:FieldNote[]|null;error:string;onClose:()=>void;onOpen:(id:string)=>void;onRetry:()=>void}){
 const heading=useRef<HTMLHeadingElement>(null),note=notes?.find(n=>n.id===id);
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[id,!!note]);
 return <section className={s.notePanel} aria-label="Field note" data-note-panel>
  <header><h2 ref={heading} tabIndex={-1}>{note?.title||'Field notes'}</h2><button onClick={onClose} aria-label="Close field note">Close</button></header>
  <details><summary>All field notes</summary><nav aria-label="Field note topics">{noteTitles.map(n=><button key={n.id} aria-pressed={n.id===id} onClick={()=>onOpen(n.id)}>{n.title}</button>)}</nav></details>
  {note?<><p className={s.noteTakeaway}>{id==='habitat'?'Look at the bark, then up towards the canopy. Different surfaces create different habitats.':id==='carbon'?'Look down. Roots, soil and dead wood are part of a forest’s carbon store.':'Look across the trees. A view from the ground cannot tell us which research area needs attention first.'}</p><p className={s.noteBody}>{note.body}</p><p className={s.noteTakeaway}>{note.takeaway}</p><details><summary>Research context &amp; SDGs</summary><p>{note.sdg} · {note.target}</p><p>{note.sourceTitle}</p><a href={note.sourceUrl} target="_blank" rel="noreferrer">Official source ↗</a>{note.additionalSourceUrl&&<a href={note.additionalSourceUrl} target="_blank" rel="noreferrer">SDG target ↗</a>}<small>Reviewed 29 October 2026. General forest education; not a site survey or a measured SDG outcome.</small></details></>:<p role="status">{error||'Loading local field notes…'}{error&&<button onClick={onRetry}>Retry field notes</button>}</p>}
  <footer>Close or press Esc to continue exploring.</footer>
 </section>;
}
