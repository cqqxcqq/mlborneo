import {useEffect,useMemo,useRef,useState,lazy,Suspense,Component} from 'react';
import type {ReactNode} from 'react';
import {loadMapData,loadResearchData,selectAt} from './data';
import type {Cell,MapData,ResearchData,Selection} from './data';
import type {MapHandle} from './Map3D';
import type {MapViewState,ViewMode} from './view';
import {idleForestInput} from './view';
import {surpriseGroups,surpriseCell,comparisonCell} from './surprise';
import {forestDensity} from './forestDensity';
import FlatMap from './FlatMap';
import {FieldNotesLayer,FieldNotePanel} from './FieldNotes';
import type {FieldNote} from './FieldNotes';
import s from './App.module.css';
const Map3D=lazy(()=>import('./Map3D'));
class MapErrorBoundary extends Component<{children:ReactNode;onFailure:(s:string)=>void},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true};}componentDidCatch(e:Error){this.props.onFailure(`3D is unavailable: ${e.message}`);}render(){return this.state.failed?null:this.props.children;}}
function supportsWebGL(){try{const c=document.createElement('canvas'),gl=c.getContext('webgl2');if(!gl)return false;gl.getExtension('WEBGL_lose_context')?.loseContext();return true;}catch{return false;}}
const number=(n:number)=>n.toLocaleString('en-GB',{maximumFractionDigits:3});
function CellData({cell,value,compact=false}:{cell:Cell;value:number|undefined;compact?:boolean}){return <div className={s.localData}><strong>{cell.id}</strong>{!compact&&<><span>{cell.state} · Research year 2018</span><span>2018 forest area assessed: {Number.isFinite(cell.area)?`${number(cell.area)} ha`:'Unavailable'}</span></>}<span>Priority: {cell.status==='ELIGIBLE_PREDICTED'?`${number(cell.percentile)} percentile (relative rank)`:cell.status==='NO_2018_MODEL_ROW'?'No model result available':'Not eligible (below 5 ha)'}</span><span>Frozen allocation: {cell.status==='NO_2018_MODEL_ROW'?'No allocation record':cell.fraction===0?'Not selected':cell.fraction===1?'Selected':`Partial (${cell.fraction.toPrecision(6)})`}</span><span>Observed conversion: {value===undefined||!Number.isFinite(value)?'No outcome record':`${number(value)} ha · 2019–2020`}</span><small>{cell.status}</small></div>;}
function Arrow({rotation}:{rotation:number}){return <svg viewBox="0 0 24 24" aria-hidden="true" style={{transform:`rotate(${rotation}deg)`}}><path d="M12 20V4M5 11l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
export default function App(){
 const [data,setData]=useState<MapData|null>(null),[error,setError]=useState(''),[forest,setForest]=useState(true),[mode,setMode]=useState<'change'|'priority'|'forest'>('change'),[rotating,setRotating]=useState(true),[webgl,setWebgl]=useState(supportsWebGL),[flat,setFlat]=useState(()=>new URLSearchParams(location.search).has('flat')||!webgl),[low,setLow]=useState(()=>new URLSearchParams(location.search).has('low')||navigator.hardwareConcurrency<=4),[selection,setSelection]=useState<Selection>(null),[notice,setNotice]=useState(''),[ready,setReady]=useState(false),[viewMode,setViewMode]=useState<ViewMode>('overview'),[forestError,setForestError]=useState(''),[forestCommand,setForestCommand]=useState(0);
 const [research,setResearch]=useState<ResearchData|null>(null);
 const [lookupPending,setLookupPending]=useState(false);
 const [pendingPoint,setPendingPoint]=useState<[number,number]|null>(null);
 const researchRequest=useRef<Promise<ResearchData>|null>(null),selectionRequest=useRef(0);
 const [reducedMotion,setReducedMotion]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [station,setStation]=useState<'canopy'|'clearing'|null>(null),[canopyView,setCanopyView]=useState(false);
 const [comparisonOrigin,setComparisonOrigin]=useState<Cell|null>(null);
 const motion=!reducedMotion;
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReducedMotion(query.matches);query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 const [openedNotes,setOpenedNotes]=useState<Set<string>>(()=>new Set());
 const [notes,setNotes]=useState<FieldNote[]|null>(null),[noteError,setNoteError]=useState(''),[openNoteId,setOpenNoteId]=useState<string|null>(null);
 const noteButtons=useRef<(HTMLButtonElement|null)[]>([]),noteFocus=useRef<HTMLElement|null>(null),notesMenu=useRef<HTMLButtonElement|null>(null),noteFocusTimer=useRef<number|undefined>(undefined);
 useEffect(()=>()=>window.clearTimeout(noteFocusTimer.current),[]);
 const loadNotes=()=>{setNoteError('');fetch('./field-notes.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(v=>{if(v.version!==1||v.notes?.length!==3||v.notes.some((n:FieldNote)=>!n.title||!n.body))throw Error();setNotes(v.notes);setForestCommand(x=>x+1);}).catch(()=>setNoteError('Local field notes are unavailable.'));};
 useEffect(loadNotes,[]);
 const showNote=(id:string)=>{forestInput.current.action=undefined;if(notes?.some(n=>n.id===id))setOpenedNotes(v=>new Set(v).add(id));if(!openNoteId)noteFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;forestInput.current.forward=forestInput.current.side=0;setOpenNoteId(id);};
 const closeNote=()=>{window.clearTimeout(noteFocusTimer.current);notesMenu.current?.focus();setOpenNoteId(null);const returnView=viewMode;noteFocusTimer.current=window.setTimeout(()=>{if(main.current?.dataset.view!==returnView||main.current?.dataset.reading==='true')return;const target=noteFocus.current;if(target?.isConnected&&getComputedStyle(target).visibility!=='hidden')target.focus();else notesMenu.current?.focus();},70);};
 const map=useRef<MapHandle|null>(null),overviewView=useRef<MapViewState|undefined>(undefined),previousMap=useRef<{mode:typeof mode;forest:boolean;flat:boolean}>({mode:'change',forest:true,flat:false}),forestInput=useRef(idleForestInput()),enterButton=useRef<HTMLButtonElement|null>(null),surpriseButton=useRef<HTMLButtonElement|null>(null),enteredBySurprise=useRef(false),main=useRef<HTMLElement|null>(null),restoreFocus=useRef<'enter'|'surprise'|null>(null);
 const entering=useRef<number|null>(null),clearingButton=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>()=>{if(entering.current!==null)window.clearTimeout(entering.current);},[]);
 useEffect(()=>{let active=true;window.__MLBORNEO__={diagnostics:null,selection:null,ready:false};loadMapData().then(d=>{if(active){setData(d);if(!d.terrain){setFlat(true);setWebgl(false);setNotice('Elevation unavailable · flat map');}}}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[]);
 const getResearch=()=>{
  if(!data)return Promise.reject(Error('Map is loading.'));
  if(!researchRequest.current)researchRequest.current=loadResearchData(data).then(records=>{setResearch(records);return records;}).catch(err=>{researchRequest.current=null;throw err;});
  return researchRequest.current;
 };
 useEffect(()=>{if(data&&(ready||flat))void getResearch().catch(()=>{});},[data,ready,flat]);
 const flatData=useMemo(()=>data&&research?{...data,...research}:null,[data,research]);
 const observed=mode==='change'&&!!data?.activity,cell=selection?.kind==='cell'?selection.cell:null,value=cell?research?.conversion?.[cell.index]:undefined;
 const groups=useMemo(()=>research?surpriseGroups(research.study):[],[research]),hasForestArea=!!cell&&forestDensity(cell.area)!==null;
 useEffect(()=>{if(window.__MLBORNEO__){window.__MLBORNEO__.selection=cell?.id||selection?.kind||null;window.__MLBORNEO__.viewMode=viewMode;window.__MLBORNEO__.ready=!!data&&ready;window.__MLBORNEO__.layers={forest,priority:mode==='priority',change:observed,rotating:rotating&&!reducedMotion,flat,low};}},[selection,data,ready,forest,mode,observed,rotating,reducedMotion,flat,low,viewMode]);
 useEffect(()=>{if(ready&&restoreFocus.current){(restoreFocus.current==='surprise'?surpriseButton:enterButton).current?.focus();restoreFocus.current=null;}},[ready]);
 const visit=(next:Cell,bySurprise:boolean,focused=false)=>{setOpenNoteId(null);setComparisonOrigin(null);setStation(null);setCanopyView(false);if(viewMode==='overview'){enteredBySurprise.current=bySurprise;if(!focused)overviewView.current=map.current?.snapshot();previousMap.current={mode,forest,flat};}setSelection({kind:'cell',cell:next});setRotating(false);forestInput.current={...idleForestInput(),reset:forestInput.current.reset+1};setForestCommand(v=>v+1);setForestError('');setReady(viewMode==='forest');setViewMode('forest');};
 const enter=()=>{
  if(!cell||!ready||lookupPending||!webgl||!hasForestArea||entering.current!==null)return;
  if(flat||reducedMotion){visit(cell,false);return;}
  overviewView.current=map.current?.snapshot();
  setRotating(false);
  map.current?.focusCell?.(cell);
  entering.current=window.setTimeout(()=>{entering.current=null;visit(cell,false,true);},440);
 };
 const surprise=async()=>{
  if(!data||!ready||!webgl||entering.current!==null)return;
  const request=++selectionRequest.current;setLookupPending(true);
  try{const records=await getResearch();if(request===selectionRequest.current){const next=surpriseCell(records.study,research?groups:surpriseGroups(records.study),cell);if(next)visit(next,true);}}
  catch{if(request===selectionRequest.current)setNotice('Research records could not load. Try again.');}
  finally{if(request===selectionRequest.current)setLookupPending(false);}
 };
 const back=(forceFlat=false)=>{setOpenNoteId(null);if(comparisonOrigin)setSelection({kind:'cell',cell:comparisonOrigin});forestInput.current=idleForestInput();restoreFocus.current=enteredBySurprise.current?'surprise':'enter';setReady(false);setViewMode('overview');setMode(previousMap.current.mode);setForest(previousMap.current.forest);setFlat(forceFlat||previousMap.current.flat||!webgl);setRotating(true);};
 const fail=(message:string)=>{if(entering.current!==null){window.clearTimeout(entering.current);entering.current=null;}setOpenNoteId(null);setNotice(message);setWebgl(false);if(viewMode==='forest')back(true);else{setFlat(true);setReady(false);}};
 const forestFail=(message:string)=>{if(window.__MLBORNEO__)Object.assign(window.__MLBORNEO__,{forestFailure:message});setForestError('Forest illustration could not load. Please retry from the selected area.');back();};
 const pick=(value:Selection)=>{
  if(viewMode!=='overview'||entering.current!==null)return;
  selectionRequest.current++;setLookupPending(false);setPendingPoint(null);setSelection(value);
 };
 const pickPoint=async(x:number,y:number,land:boolean)=>{
  if(entering.current!==null)return;
  const request=++selectionRequest.current;setLookupPending(true);setPendingPoint([x,y]);
  try{const records=await getResearch();if(request===selectionRequest.current)setSelection(selectAt(records,x,y,land));}
  catch{if(request===selectionRequest.current)setNotice('Research records could not load. Try again.');}
  finally{if(request===selectionRequest.current){setLookupPending(false);setPendingPoint(null);}}
 };
 const toggleFlat=()=>{if(entering.current!==null)return;selectionRequest.current++;setLookupPending(false);setPendingPoint(null);if(flat){if(!data?.terrain){setNotice('Elevation unavailable · flat map');return;}if(!supportsWebGL()){setNotice('3D and the forest illustration need WebGL support.');return;}setWebgl(true);setNotice('');}setFlat(v=>!v);setReady(false);};
 const control=(forward:number,side:number)=>{if(openNoteId)return;if(forward||side)forestInput.current.action=undefined;forestInput.current.forward=forward;forestInput.current.side=side;setForestCommand(v=>v+1);};
 const approach=(id:string)=>{forestInput.current.action={kind:'approach',noteId:id};setForestCommand(v=>v+1);};
 const lookUp=()=>{forestInput.current.action={kind:'lookUp',noteId:'habitat'};setForestCommand(v=>v+1);};
 const alternate=useMemo(()=>research&&cell&&viewMode==='forest'?comparisonCell(research.study,groups,cell):null,[research,groups,cell,viewMode]);
 const compare=()=>{
  const next=comparisonOrigin??alternate;
  if(!cell||!next||station!=='clearing')return;
  forestInput.current.action=undefined;
  setComparisonOrigin(comparisonOrigin?null:cell);
  setSelection({kind:'cell',cell:next});
  setForestCommand(v=>v+1);
 };
 const mapProps=data?{data,forest,priority:mode==='priority',change:observed,rotating:rotating&&!reducedMotion&&viewMode==='overview'&&!openNoteId,selection,onSelect:pick,onReady:()=>setReady(true),viewMode,restoreView:overviewView.current}:null;
 return <main ref={main} data-view={viewMode} data-reading={!!openNoteId} className={`${s.mapOnly} ${s.localViewer} ${viewMode==='forest'?s.forestView:''} ${openNoteId?s.readingNote:''}`} tabIndex={0} aria-label="Forest research map. Select an area or choose Explore a forest to enter a forest illustration."
 onKeyDown={e=>{if(e.key==='Escape'){if(openNoteId){e.preventDefault();closeNote();return;}if(viewMode!=='overview'){e.preventDefault();back();}return;}if(openNoteId)return;if(e.altKey||e.ctrlKey||e.metaKey||e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select,button,summary')||e.target.isContentEditable))return;const k=e.key.toLowerCase();if(viewMode==='forest')return;if(['r','t','+','=','-','f','p','c','m','l'].includes(k))e.preventDefault();if(k==='r')map.current?.reset();if(k==='t')map.current?.top();if(k==='+'||k==='=')map.current?.zoom(1.2);if(k==='-')map.current?.zoom(1/1.2);if(k==='f')setForest(v=>!v);if(k==='p')setMode(v=>v==='priority'?'change':'priority');if(k==='c')setMode(v=>v==='change'?'forest':'change');if(k==='m')toggleFlat();if(k==='l')setLow(v=>!v);}}>
 {!data?<p className={s.mapLoading} role="status">{error?`Local map resources unavailable. ${error}`:'Loading the local map…'}</p>:flat&&viewMode!=='forest'?(flatData?<FlatMap key={viewMode} ref={map} {...mapProps!} data={flatData}/>:<p className={s.mapLoading} role="status">Loading the flat map…</p>):<MapErrorBoundary onFailure={fail}><Suspense fallback={<p className={s.mapLoading}>Loading the terrain…</p>}><Map3D ref={map} {...mapProps!} study={research?.study} pendingPoint={pendingPoint} onMapPoint={pickPoint} low={low} onFailure={fail} forestInput={forestInput} forestCommand={forestCommand} forestAreaHa={cell?.area??NaN} wind={motion} reducedMotion={reducedMotion} clearingButton={clearingButton} onStation={setStation} onCanopyView={setCanopyView} reading={!!openNoteId} noteButtons={noteButtons} onOpenNote={showNote} onForestFailure={forestFail}/></Suspense></MapErrorBoundary>}
 {viewMode==='forest'&&<button ref={notesMenu} className={s.notesMenu} onClick={()=>showNote('habitat')}>Field notes</button>}
 {viewMode==='forest'&&<FieldNotesLayer buttons={noteButtons} onOpen={showNote} onApproach={approach} opened={openedNotes}/>}
 {viewMode==='forest'&&openNoteId&&<FieldNotePanel id={openNoteId} notes={notes} error={noteError} onOpen={showNote} onClose={closeNote} onRetry={loadNotes}/>}
 {viewMode==='forest'&&!ready&&<p className={s.forestLoading} role="status">Loading the local forest illustration…</p>}
 {viewMode!=='forest'&&observed&&<section className={s.changeLegend} aria-label="Recorded forest conversion legend"><strong>Observed forest conversion · 2019–2020</strong><div>{data?.activity?.bins.map(bin=><span key={bin.label}><i style={{background:bin.colour}}/>{bin.label}</span>)}</div></section>}
 {viewMode!=='forest'&&mode==='priority'&&<p className={s.modeNote}>2018 monitoring priority · relative rank, not loss probability</p>}
 {viewMode==='overview'&&<>
  {lookupPending&&<p className={s.outsideNote} role="status">Loading research records…</p>}
  <nav className={s.mapUtilities} aria-label="Map controls"><button ref={surpriseButton} className={s.surpriseAction} disabled={!ready||lookupPending||!webgl} onClick={surprise}>Explore a forest</button><button aria-pressed={mode==='change'} onClick={()=>setMode('change')}>Observed change</button><button aria-pressed={mode==='priority'} onClick={()=>setMode('priority')}>Monitoring priority</button></nav>
  {cell?<aside className={s.cellDock} aria-label="Selected cell"><strong>{cell.state}</strong><span>Selected research area · 1 km²</span><button ref={enterButton} disabled={!ready||!webgl||!hasForestArea} onClick={enter}>{forestError?'Retry forest illustration':'Enter forest illustration'}</button>{!hasForestArea&&<small>Forest-area data unavailable for this grid.</small>}<details><summary>Cell data</summary><CellData cell={cell} value={value}/></details></aside>:selection?.kind==='outside'?<p className={s.outsideNote} role="status">Outside the study area</p>:null}
  {!webgl&&<p className={s.outsideNote} role="status">Forest view needs WebGL support. The flat map is available.</p>}
 </>}
 {viewMode==='forest'&&cell&&<>
  <nav className={s.localActions} aria-label="Forest view controls"><button onClick={()=>back()}>Back to map</button><button disabled={!ready} onClick={surprise}>Another area</button></nav>
  <button ref={clearingButton} className={s.clearingMarker} hidden onClick={()=>approach('clearing')}>Walk to the clearing</button>
  <div className={s.forestActions}>
   {(station==='canopy'||canopyView)&&<button onClick={lookUp}>{canopyView?'Look ahead':'Look up'}</button>}
   {station==='clearing'&&(alternate||comparisonOrigin)&&<div className={s.clearingCallout}><p key={comparisonOrigin?'second':'first'} role="status">{comparisonOrigin?(cell.area>comparisonOrigin.area?'More forest in the study area. More trees in this illustration.':'Less forest in the study area. Fewer trees in this illustration.'):'We draw more trees for areas with more forest.'}</p><button onClick={compare}>{comparisonOrigin?'Back to first forest':'Compare from here'}</button></div>}
  </div>
  <section className={s.forestInfo} aria-label="Forest information"><strong>{cell.state} · Forest illustration</strong><span>Forest assessed in 2018: {number(cell.area)} ha</span><details><summary>Research details</summary><CellData cell={cell} value={value} compact/></details></section>
  <div className={s.walkPad} role="group" aria-label="Walk controls">{[{name:'Move forward',f:1,side:0,rotation:0,place:'forward'},{name:'Move left',f:0,side:-1,rotation:-90,place:'left'},{name:'Move backward',f:-1,side:0,rotation:180,place:'back'},{name:'Move right',f:0,side:1,rotation:90,place:'right'}].map(a=><button key={a.name} aria-label={a.name} style={{gridArea:a.place}} disabled={!ready||!!openNoteId} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);control(a.f,a.side);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!e.repeat)control(a.f,a.side);}}} onKeyUp={e=>{if(e.key==='Enter'||e.key===' ')control(0,0);}} onBlur={()=>control(0,0)} onPointerUp={()=>control(0,0)} onPointerCancel={()=>control(0,0)} onLostPointerCapture={()=>control(0,0)}><Arrow rotation={a.rotation}/></button>)}</div>
  <span className={s.forestBoundary} data-walk-boundary hidden>Edge of the walking area</span>
 </>}
 {!!(notice||data?.issues.length||viewMode==='overview'&&forestError)&&<p className={s.localNotice} role="status">{[notice,...(data?.issues||[]),viewMode==='overview'?forestError:''].filter(Boolean).join(' ')}</p>}
 </main>;
}
