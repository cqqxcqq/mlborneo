export const vertex=`varying vec2 vUv; varying vec3 vNormal; void main(){vUv=uv;vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const fragment=`precision highp float;
 uniform sampler2D landMap;uniform sampler2D forestMap;uniform sampler2D studyMap;uniform sampler2D changeMap;uniform vec4 bounds;uniform vec4 studyBounds;uniform vec2 studySize;uniform float showForest;uniform float showPriority;uniform float showChange;
 varying vec2 vUv;varying vec3 vNormal;
 void main(){float land=texture2D(landMap,vUv).r;
 vec2 xy=mix(bounds.xy,bounds.zw,vUv);vec2 suv=(xy-studyBounds.xy)/(studyBounds.zw-studyBounds.xy);vec4 st=texture2D(studyMap,suv);
 bool within=all(greaterThanEqual(suv,vec2(0.)))&&all(lessThanEqual(suv,vec2(1.)));float status=within?floor(st.g*255.+.5):0.;bool inside=status>0.;if(land<.25&&!(inside&&(showPriority>.5||showChange>.5)))discard;

 vec3 base=inside?vec3(.718,.765,.710):vec3(.752,.791,.745);vec3 colour=base;
 if(showForest>.5){vec4 f=texture2D(forestMap,vUv);float cover=clamp(f.r+f.g+f.b,0.,1.);vec3 fc=inside?vec3(.184,.345,.243):vec3(.408,.516,.429);colour=mix(base,fc,cover);}
 if(showPriority>.5&&inside){vec3 pc=mix(vec3(.898,.831,.627),vec3(.620,.349,.106),st.r);
 if(status>1.5){pc=status>2.5?vec3(.438,.477,.465):vec3(.773,.792,.745);float hatch=step(.75,fract((xy.x+xy.y)/2200.));pc=mix(pc,pc*.80,hatch*.50);}
 colour=mix(colour,pc,status<1.5?.88:.78);
 if(st.b>.1){vec2 f=fract(suv*studySize);vec2 texel=1./studySize;
 float left=texture2D(studyMap,suv-vec2(texel.x,0.)).b;float right=texture2D(studyMap,suv+vec2(texel.x,0.)).b;float down=texture2D(studyMap,suv-vec2(0.,texel.y)).b;float up=texture2D(studyMap,suv+vec2(0.,texel.y)).b;
 vec2 ew=min(vec2(.48),max(vec2(.09),fwidth(suv*studySize)*.8));
 bool edge=(f.x<ew.x&&left<.1)||(f.x>1.-ew.x&&right<.1)||(f.y<ew.y&&down<.1)||(f.y>1.-ew.y&&up<.1);
 if(edge)colour=vec3(.365,.208,.070);
 if(st.b<.75&&step(.5,fract((xy.x-xy.y)/160.))>.5)colour=vec3(.29,.19,.10);
 }}
 if(showChange>.5&&inside){vec4 ch=texture2D(changeMap,suv);float bin=floor(ch.r*255.+.5);if(ch.g<.5){float hatch=step(.7,fract((xy.x+xy.y)/1800.));colour=mix(vec3(.52,.55,.53),vec3(.65,.67,.63),hatch);}else if(bin>.5){vec3 cc=bin<1.5?vec3(.855,.788,.667):bin<2.5?vec3(.812,.631,.424):bin<3.5?vec3(.725,.443,.247):vec3(.620,.278,.176);colour=mix(colour,cc,.95);}}
 float shade=.46+.62*max(0.,dot(normalize(vNormal),normalize(vec3(-.8,.85,-.55))));gl_FragColor=vec4(colour*shade,(inside&&(showPriority>.5||showChange>.5))?1.:smoothstep(.25,.7,land));
 }`;
