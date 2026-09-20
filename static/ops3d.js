// نواة عرض ثلاثي الأبعاد لأبراج المدينة الذهبية — مستخرجة من Golden_City_AC_Viewer
// بدون مكتبات ولا شبكة خارجية. النماذج تُحمَّل من /models/tower-a.glb و /models/tower-c.glb
// عند فتح غرفة العمليات فقط، ولا تُرسم إلا عند تغيّر المشهد (state.dirty).
export function createTowerViewer(canvas, options = {}){
 const modelUrl = options.modelUrl || (key => '/models/tower-' + key.toLowerCase() + '.glb');
 const gl = canvas.getContext('webgl2', {alpha:false, antialias:true, preserveDrawingBuffer:true});
 const bytesCache = {};
 async function modelBytes(key){
  if(bytesCache[key]) return bytesCache[key];
  const r = await fetch(modelUrl(key), {credentials:'same-origin'});
  if(!r.ok) throw new Error('تعذّر تحميل مجسّم البرج ' + key);
  return (bytesCache[key] = new Uint8Array(await r.arrayBuffer()));
 }
 const state = {key:'A', model:null, models:{}, az:35*Math.PI/180, el:18*Math.PI/180,
  target:[0,45,0], distance:170, ortho:false, span:120, view:'iso', dirty:true,
  grid:options.grid !== false, token:0};
 function manualView(){ state.view = 'custom'; state.dirty = true; }
 function showError(error){ if(options.onError) options.onError(error); }

 // لوحة الليل: لكل مادة في النموذج دورها المعماري، فتأخذ لونها من دورها لا من رقمها.
 // الزجاج يعتم ويشعّ دفئاً، والإطار المعدني يحمل خط الإنارة الذهبي، والحجر والخرسانة
 // ينزلان إلى الجرافيت حتى يبقى الضوء هو البطل لا السطح.
 const NIGHT = [
  [/GLASS/i,   {base:[.030,.052,.095], emissive:[.245,.320,.450], metal:.45, rough:.07}],
  [/FRAME/i,   {base:[.020,.024,.034], emissive:[.205,.150,.060], metal:.65, rough:.26}],
  [/STONE/i,   {base:[.050,.056,.072], emissive:[.058,.046,.024], metal:.05, rough:.62}],
  [/CONCRETE/i,{base:[.044,.050,.066], emissive:[.016,.013,.008], metal:.04, rough:.76}],
  [/GARAGE/i,  {base:[.028,.032,.042], emissive:[.011,.012,.017], metal:.45, rough:.40}],
 ];
 function nightStyle(name, mat){
  if(options.night === false) return mat;
  const hit = NIGHT.find(([re]) => re.test(name));
  const s = hit ? hit[1] : {base:[.046,.053,.070], emissive:[.016,.014,.009], metal:.10, rough:.60};
  mat.base = [s.base[0], s.base[1], s.base[2], mat.base[3]];   // الشفافية الأصلية تبقى كما هي
  mat.emissive = s.emissive.slice();
  mat.metal = s.metal;
  mat.rough = s.rough;
  return mat;
 }
const DEG=Math.PI/180;
const V={add:(a,b)=>a.map((x,i)=>x+b[i]),sub:(a,b)=>a.map((x,i)=>x-b[i]),mul:(a,k)=>a.map(x=>x*k),dot:(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm:a=>{const n=Math.hypot(...a);return n>1e-12?a.map(x=>x/n):[0,1,0]}};
const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mm(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o}
function point(m,p){return[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]]}
function trs(n){if(n.matrix)return n.matrix;const[x,y,z,w]=n.rotation||[0,0,0,1],s=n.scale||[1,1,1],t=n.translation||[0,0,0];return[(1-2*y*y-2*z*z)*s[0],(2*x*y+2*z*w)*s[0],(2*x*z-2*y*w)*s[0],0,(2*x*y-2*z*w)*s[1],(1-2*x*x-2*z*z)*s[1],(2*y*z+2*x*w)*s[1],0,(2*x*z+2*y*w)*s[2],(2*y*z-2*x*w)*s[2],(1-2*x*x-2*y*y)*s[2],0,...t,1]}
function normalMatrix(m){const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10];const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);if(Math.abs(det)<1e-15)return[1,0,0,0,1,0,0,0,1];return[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det,(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det,(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det]}
function lookAt(eye,target,up){const z=V.norm(V.sub(eye,target)),x=V.norm(V.cross(up,z)),y=V.cross(z,x);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1]}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),r=1/(near-far);return[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*r,-1,0,0,2*far*near*r,0]}
function ortho(span,aspect,near,far){return[2/(span*aspect),0,0,0,0,2/span,0,0,0,0,-2/(far-near),0,0,0,-(far+near)/(far-near),1]}
const component={5120:{size:1,get:'getInt8',signed:true,max:127},5121:{size:1,get:'getUint8',max:255},5122:{size:2,get:'getInt16',signed:true,max:32767},5123:{size:2,get:'getUint16',max:65535},5125:{size:4,get:'getUint32',max:4294967295},5126:{size:4,get:'getFloat32',float:true}};
const typeSize={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
function accessor(g,buffers,idx,indices=false){const a=g.accessors[idx],n=typeSize[a.type],c=component[a.componentType];if(!n||!c)throw Error('Unsupported accessor');const out=indices?new Uint32Array(a.count*n):new Float32Array(a.count*n);function read(vw,offset,count,width,ct,dest,step){const info=component[ct],buf=buffers[vw.buffer||0],dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),start=(vw.byteOffset||0)+offset,stride=step||vw.byteStride||width*info.size;for(let j=0;j<count;j++)for(let k=0;k<width;k++){let v=dv[info.get](start+j*stride+k*info.size,true);if(a.normalized&&!indices&&!info.float)v=info.signed?Math.max(-1,v/info.max):v/info.max;dest[j*width+k]=v}}
if(a.bufferView!==undefined)read(g.bufferViews[a.bufferView],a.byteOffset||0,a.count,n,a.componentType,out);
if(a.sparse){const s=a.sparse,id=new Uint32Array(s.count),vals=new Float32Array(s.count*n);read(g.bufferViews[s.indices.bufferView],s.indices.byteOffset||0,s.count,1,s.indices.componentType,id,component[s.indices.componentType].size);read(g.bufferViews[s.values.bufferView],s.values.byteOffset||0,s.count,n,a.componentType,vals,n*c.size);for(let j=0;j<s.count;j++)out.set(vals.subarray(j*n,j*n+n),id[j]*n)}return out}
function makeNormals(pos,idx){const out=new Float32Array(pos.length);for(let i=0;i<idx.length;i+=3){const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3,n=V.cross([pos[b]-pos[a],pos[b+1]-pos[a+1],pos[b+2]-pos[a+2]],[pos[c]-pos[a],pos[c+1]-pos[a+1],pos[c+2]-pos[a+2]]);for(const j of[a,b,c])for(let k=0;k<3;k++)out[j+k]+=n[k]}for(let i=0;i<out.length;i+=3){const n=V.norm([out[i],out[i+1],out[i+2]]);out.set(n,i)}return out}
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
let program,locations,gridProgram,gridLoc,gridVAO,gridCount=0;
const VS=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in vec4 aColor;
layout(location=4) in mat4 iModel;
layout(location=8) in mat3 iNormal;
layout(location=11) in float iHandedness;
uniform mat4 uVP;
flat out float vHandedness;
out vec3 vNormal,vPosition;
out vec2 vUV;
out vec4 vColor;
void main(){vec4 p=iModel*vec4(aPosition,1.);vPosition=p.xyz;vNormal=iNormal*aNormal;vHandedness=iHandedness;vUV=aUV;vColor=aColor;gl_Position=uVP*p;}`;
const FS=`#version 300 es
precision highp float;
in vec3 vNormal,vPosition;
flat in float vHandedness;
in vec2 vUV;
in vec4 vColor;
uniform vec4 uBase;
uniform vec3 uEye,uEmissive;
uniform sampler2D uTexture;
uniform bool uHasTexture,uUnlit,uMask;
uniform float uCutoff,uMetallic,uRoughness;
out vec4 frag;
vec3 linearize(vec3 c){return pow(c,vec3(2.2));}
void main(){vec4 tex=uHasTexture?texture(uTexture,vUV):vec4(1.);vec4 base=vec4(uBase.rgb*linearize(tex.rgb)*vColor.rgb,uBase.a*tex.a*vColor.a);if(uMask&&base.a<uCutoff)discard;vec3 n=normalize(vNormal);if((gl_FrontFacing?1.:-1.)*vHandedness<0.)n=-n;vec3 l=normalize(vec3(-.58,.85,.65));vec3 e=normalize(uEye-vPosition);float diff=max(dot(n,l),0.);float sky=.55+.45*max(n.y,0.);float bounce=max(dot(n,normalize(vec3(.5,.4,-.7))),0.);vec3 illumination=vec3(.07,.10,.18)*sky+vec3(.15,.145,.135)*diff+vec3(.04,.06,.11)*bounce;vec3 h=normalize(l+e);float exponent=mix(90.,10.,uRoughness);float spec=pow(max(dot(n,h),0.),exponent)*mix(.14,.30,uMetallic);float rim=pow(1.-max(dot(n,e),0.),3.5);vec3 color=uUnlit?base.rgb:base.rgb*illumination+vec3(spec)*.85+uEmissive+vec3(.92,.74,.44)*rim*.16;color=pow(max(color,vec3(0.)),vec3(1./2.2));frag=vec4(color,base.a);}`;
function initGL(){program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,VS));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FS));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));locations={};for(const n of['VP','Eye','Base','Emissive','HasTexture','Texture','Unlit','Mask','Cutoff','Metallic','Roughness'])locations[n]=gl.getUniformLocation(program,'u'+n);
gridProgram=gl.createProgram();gl.attachShader(gridProgram,shader(gl.VERTEX_SHADER,`#version 300 es\nprecision highp float;layout(location=0) in vec3 aPosition;uniform mat4 uVP;out float vFade;void main(){gl_Position=uVP*vec4(aPosition,1.);vFade=1.;}`));gl.attachShader(gridProgram,shader(gl.FRAGMENT_SHADER,`#version 300 es\nprecision highp float;out vec4 frag;void main(){frag=vec4(.22,.85,.96,.16);}`));gl.linkProgram(gridProgram);gridLoc=gl.getUniformLocation(gridProgram,'uVP');gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(.047,.090,.188,1)}
function createAttribute(location,values,size,defaultValue){if(values){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0)}else{gl.disableVertexAttribArray(location);gl.vertexAttrib4f(location,...defaultValue)}}
function makePrimitive(pos,normals,uv,color,indices){const vao=gl.createVertexArray();gl.bindVertexArray(vao);createAttribute(0,pos,3,[0,0,0,1]);createAttribute(1,normals,3,[0,1,0,1]);createAttribute(2,uv,2,[0,0,0,1]);createAttribute(3,color,color&&color.length/3===pos.length/3?3:4,[1,1,1,1]);const ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);gl.bindVertexArray(null);return{vao,count:indices.length}}
async function textureFromImage(g,buffers,texture){if(texture.source===undefined)return null;const img=g.images[texture.source];let url,revoke=false;if(img.bufferView!==undefined){const b=g.bufferViews[img.bufferView],bytes=buffers[b.buffer||0].subarray(b.byteOffset||0,(b.byteOffset||0)+b.byteLength);url=URL.createObjectURL(new Blob([bytes],{type:img.mimeType||'image/png'}));revoke=true}else if(img.uri&&img.uri.startsWith('data:'))url=img.uri;else throw Error('External texture is not embedded');const im=new Image();try{await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(Error('Embedded texture could not be decoded'));im.src=url});const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);const sampler=(g.samplers||[])[texture.sampler]||{};gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,sampler.wrapS||gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,sampler.wrapT||gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);return t}finally{if(revoke)URL.revokeObjectURL(url)}}
function parseGLB(bytes){const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2)throw Error('The embedded model is not GLB 2.0');let g,bin;for(let p=12;p<bytes.length;){const len=dv.getUint32(p,true),type=dv.getUint32(p+4,true),chunk=bytes.subarray(p+8,p+8+len);if(type===0x4e4f534a)g=JSON.parse(new TextDecoder().decode(chunk));else if(type===0x004e4942)bin=chunk;p+=8+len}if(!g||!bin)throw Error('GLB data is incomplete');const buffers=(g.buffers||[]).map((b,i)=>!b.uri&&i===0?bin:b.uri&&b.uri.startsWith('data:')?base64Bytes(b.uri.split(',')[1]):(()=>{throw Error('External buffer is not embedded')})());return{g,buffers}}
function determinant(m){return m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2])}
function attachInstances(primitive,instances){gl.bindVertexArray(primitive.vao);const stride=26,packed=new Float32Array(instances.length*stride);let center=[0,0,0];for(let i=0;i<instances.length;i++){const d=instances[i];packed.set(d.world,i*stride);packed.set(d.normal,i*stride+16);packed[i*stride+25]=determinant(d.world)<0?-1:1;center=V.add(center,d.center)}center=V.mul(center,1/instances.length);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,packed,gl.STATIC_DRAW);for(let c=0;c<4;c++){const loc=4+c;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,4,gl.FLOAT,false,stride*4,c*16);gl.vertexAttribDivisor(loc,1)}for(let c=0;c<3;c++){const loc=8+c;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,stride*4,64+c*12);gl.vertexAttribDivisor(loc,1)}gl.enableVertexAttribArray(11);gl.vertexAttribPointer(11,1,gl.FLOAT,false,stride*4,100);gl.vertexAttribDivisor(11,1);gl.bindVertexArray(null);return{...primitive,instanceCount:instances.length,center}}
function buildGrid(model){if(gridVAO)gl.deleteVertexArray(gridVAO);const reach=Math.ceil(Math.max(model.size[0],model.size[2])*1.5/10)*10,step=5,positions=[];for(let v=-reach;v<=reach;v+=step)positions.push(v,-.02,-reach,v,-.02,reach,-reach,-.02,v,reach,-.02,v);gridVAO=gl.createVertexArray();gl.bindVertexArray(gridVAO);createAttribute(0,new Float32Array(positions),3,[0,0,0,1]);gridCount=positions.length/3;gl.bindVertexArray(null)}
function cameraEye(){return V.add(state.target,[Math.sin(state.az)*Math.cos(state.el)*state.distance,Math.sin(state.el)*state.distance,Math.cos(state.az)*Math.cos(state.el)*state.distance])}
function fit(){if(!state.model)return;const m=state.model,aspect=Math.max(.2,canvas.clientWidth/canvas.clientHeight),eye=cameraEye(),view=lookAt(eye,state.target,[0,1,0]);let xx=0,yy=0;for(const x of[m.min[0],m.max[0]])for(const y of[m.min[1],m.max[1]])for(const z of[m.min[2],m.max[2]]){const p=point(view,V.add(V.sub([x,y,z],m.center),state.target));xx=Math.max(xx,Math.abs(p[0]));yy=Math.max(yy,Math.abs(p[1]))}state.span=Math.max(yy*2,xx*2/aspect)*1.15;const halfFov=Math.atan(1/(2*35/24));state.distance=Math.max(m.radius*1.3,state.span/2/Math.tan(halfFov)+m.radius*.5);state.dirty=true}
function number(v){return Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:2}):'—'}
function draw(){if(!gl||!state.model)return;const dpr=Math.min(window.devicePixelRatio||1,2.5),w=Math.round(canvas.clientWidth*dpr),h=Math.round(canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;state.dirty=true}if(!state.dirty)return;state.dirty=false;state.frames=(state.frames||0)+1;gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const eye=cameraEye(),far=state.distance+state.model.radius*5+500,proj=state.ortho?ortho(state.span,w/h,.05,far):perspective(2*Math.atan(24/(2*35)),w/h,.05,far),vp=mm(proj,lookAt(eye,state.target,[0,1,0]));state.vp=vp;
if(state.grid&&gridVAO){gl.useProgram(gridProgram);gl.uniformMatrix4fv(gridLoc,false,vp);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.bindVertexArray(gridVAO);gl.drawArrays(gl.LINES,0,gridCount);gl.depthMask(true);gl.disable(gl.BLEND)}gl.useProgram(program);gl.uniformMatrix4fv(locations.VP,false,vp);gl.uniform3fv(locations.Eye,eye);gl.uniform1i(locations.Texture,0);const opaque=state.model.draws.filter(d=>d.material.alpha!=='BLEND'),transparent=state.model.draws.filter(d=>d.material.alpha==='BLEND').sort((a,b)=>V.dot(V.sub(b.center,eye),V.sub(b.center,eye))-V.dot(V.sub(a.center,eye),V.sub(a.center,eye)));for(const [list,alpha]of[[opaque,false],[transparent,true]]){if(alpha){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false)}for(const d of list){const m=d.material;gl.uniform4fv(locations.Base,m.alpha==='OPAQUE'?[...m.base.slice(0,3),1]:m.base);gl.uniform3fv(locations.Emissive,m.emissive);gl.uniform1i(locations.HasTexture,!!m.texture);gl.uniform1i(locations.Unlit,m.unlit);gl.uniform1i(locations.Mask,m.alpha==='MASK');gl.uniform1f(locations.Cutoff,m.cutoff);gl.uniform1f(locations.Metallic,m.metal);gl.uniform1f(locations.Roughness,m.rough);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,m.texture);gl.bindVertexArray(d.vao);gl.drawElementsInstanced(gl.TRIANGLES,d.count,gl.UNSIGNED_INT,0,d.instanceCount)}gl.depthMask(true);gl.disable(gl.BLEND)}gl.bindVertexArray(null)}
function renderLoop(){draw();requestAnimationFrame(renderLoop)}
const pointers=new Map();let gesture=null;
function pointerSnapshot(){const p=[...pointers.values()];return p.length>1?{cx:(p[0].x+p[1].x)/2,cy:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}:null}
function pan(dx,dy){const eye=cameraEye(),forward=V.norm(V.sub(state.target,eye)),right=V.norm(V.cross(forward,[0,1,0])),up=V.cross(right,forward),scale=(state.ortho?state.span:state.distance*.7)/canvas.clientHeight;state.target=V.add(state.target,V.add(V.mul(right,-dx*scale),V.mul(up,dy*scale)));manualView()}
function zoom(f){if(!state.model)return;if(state.ortho)state.span=Math.min(state.model.radius*30,Math.max(state.model.radius*.035,state.span*f));else state.distance=Math.min(state.model.radius*30,Math.max(state.model.radius*.08,state.distance*f));state.dirty=true}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture=pointerSnapshot()});
canvas.addEventListener('pointermove',e=>{const previous=pointers.get(e.pointerId);if(!previous)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>1){const next=pointerSnapshot();if(gesture&&next){zoom(gesture.d/Math.max(1,next.d));pan(next.cx-gesture.cx,next.cy-gesture.cy)}gesture=next;return}const dx=e.clientX-previous.x,dy=e.clientY-previous.y;if(e.shiftKey||e.buttons===2)pan(dx,dy);else{state.az-=dx*.007;state.el=Math.max(-89.8*DEG,Math.min(89.8*DEG,state.el+dy*.005));manualView()}});
for(const name of['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{pointers.delete(e.pointerId);gesture=pointerSnapshot()});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(Math.max(-.5,Math.min(.5,e.deltaY*.001))))},{passive:false});
canvas.addEventListener('keydown',e=>{let used=true;switch(e.key){case'ArrowLeft':state.az-=.07;manualView();break;case'ArrowRight':state.az+=.07;manualView();break;case'ArrowUp':state.el=Math.min(89.8*DEG,state.el+.05);manualView();break;case'ArrowDown':state.el=Math.max(-89.8*DEG,state.el-.05);manualView();break;case'+':case'=':zoom(.9);break;case'-':zoom(1.1);break;case'Home':preset('iso');break;default:used=false}if(used)e.preventDefault()});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showError(Error('Graphics context lost; reload this file.'))});
new ResizeObserver(()=>{state.dirty=true}).observe(canvas);
async function loadModel(key){if(state.models[key])return state.models[key];const {g,buffers}=parseGLB(await modelBytes(key));
const textures=await Promise.all((g.textures||[]).map(t=>textureFromImage(g,buffers,t)));const materials=(g.materials||[]).map(m=>{const p=m.pbrMetallicRoughness||{},bt=p.baseColorTexture;return nightStyle(m.name||'',{base:p.baseColorFactor||[1,1,1,1],texture:bt?textures[bt.index]:null,emissive:m.emissiveFactor||[0,0,0],alpha:m.alphaMode||'OPAQUE',cutoff:m.alphaCutoff===undefined?.5:m.alphaCutoff,metal:p.metallicFactor===undefined?1:p.metallicFactor,rough:p.roughnessFactor===undefined?1:p.roughnessFactor,unlit:!!(m.extensions&&m.extensions.KHR_materials_unlit)})});const def={base:[.8,.8,.8,1],texture:null,emissive:[0,0,0],alpha:'OPAQUE',cutoff:.5,metal:0,rough:1,unlit:false};const meshes=(g.meshes||[]).map(mesh=>mesh.primitives.map(p=>{if(p.mode!==undefined&&p.mode!==4)return null;if(p.extensions&&(p.extensions.KHR_draco_mesh_compression||p.extensions.EXT_meshopt_compression))throw Error('Compressed GLB requires a decoder');const pos=accessor(g,buffers,p.attributes.POSITION),indices=p.indices!==undefined?accessor(g,buffers,p.indices,true):Uint32Array.from({length:pos.length/3},(_,i)=>i);const normals=p.attributes.NORMAL!==undefined?accessor(g,buffers,p.attributes.NORMAL):makeNormals(pos,indices);const uv=p.attributes.TEXCOORD_0!==undefined?accessor(g,buffers,p.attributes.TEXCOORD_0):null,color=p.attributes.COLOR_0!==undefined?accessor(g,buffers,p.attributes.COLOR_0):null;let pmin=[Infinity,Infinity,Infinity],pmax=[-Infinity,-Infinity,-Infinity];for(let j=0;j<pos.length;j+=3)for(let k=0;k<3;k++){pmin[k]=Math.min(pmin[k],pos[j+k]);pmax[k]=Math.max(pmax[k],pos[j+k])}return{...makePrimitive(pos,normals,uv,color,indices),pmin,pmax,instances:[],material:materials[p.material]||def}}).filter(Boolean));
const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let triangles=0,instanceCount=0;function walk(id,parent){const n=g.nodes[id],world=mm(parent,trs(n));if(n.mesh!==undefined)for(const p of meshes[n.mesh]){for(const x of[p.pmin[0],p.pmax[0]])for(const y of[p.pmin[1],p.pmax[1]])for(const z of[p.pmin[2],p.pmax[2]]){const q=point(world,[x,y,z]);for(let k=0;k<3;k++){min[k]=Math.min(min[k],q[k]);max[k]=Math.max(max[k],q[k])}}const center=point(world,p.pmin.map((v,k)=>(v+p.pmax[k])/2));p.instances.push({world,normal:normalMatrix(world),center});triangles+=p.count/3;instanceCount++}for(const child of n.children||[])walk(child,world)}const scene=(g.scenes||[])[g.scene||0];if(scene)for(const node of scene.nodes||[])walk(node,I());else{const children=new Set((g.nodes||[]).flatMap(n=>n.children||[]));(g.nodes||[]).forEach((_,i)=>{if(!children.has(i))walk(i,I())})}const draws=meshes.flat().filter(p=>p.instances.length).map(p=>attachInstances(p,p.instances));if(!draws.length||!Number.isFinite(min[0]))throw Error('No triangle geometry found');const model={draws,min,max,center:min.map((x,i)=>(x+max[i])/2),size:min.map((x,i)=>max[i]-x),radius:Math.hypot(...min.map((x,i)=>(max[i]-x)/2)),triangles,instanceCount};state.models[key]=model;return model}
function preset(name){state.view=name;state.ortho=name!=='iso';const angles={front:[0,0],rear:[180,0],left:[-90,0],right:[90,0],top:[0,89.999],iso:[35,18]}[name];state.az=angles[0]*DEG;state.el=angles[1]*DEG;if(state.model)state.target=[...state.model.center];fit();state.dirty=true}
 let running = false, frame = 0, frameCb = null;
 function renderLoopLocal(){
  if(!running) return;
  const seen = state.frames || 0;
  draw();
  if((state.frames || 0) !== seen && frameCb) frameCb();
  frame = requestAnimationFrame(renderLoopLocal);
 }
 const observer = new ResizeObserver(() => {state.dirty = true;});

 return {
  supported: !!gl,
  async select(key){
   if(!gl) throw new Error('المتصفح لا يدعم WebGL 2.');
   const token = ++state.token;
   state.key = key;
   if(!running){ initGL(); observer.observe(canvas); running = true; renderLoopLocal(); }
   const model = await loadModel(key);
   if(token !== state.token) return null;
   state.model = model;
   buildGrid(model);
   preset('iso');
   state.dirty = true;
   return model;
  },
  view(name){ preset(name); },
  // إسقاط نقطة من فضاء النموذج إلى إحداثيات الشاشة بالبكسل (null إذا كانت خلف الكاميرا)
  project(pt){
   const v = state.vp;
   if(!v) return null;
   const x = v[0]*pt[0] + v[4]*pt[1] + v[8]*pt[2]  + v[12];
   const y = v[1]*pt[0] + v[5]*pt[1] + v[9]*pt[2]  + v[13];
   const w = v[3]*pt[0] + v[7]*pt[1] + v[11]*pt[2] + v[15];
   if(!(w > 1e-6)) return null;
   return {x:(x/w*.5 + .5)*canvas.clientWidth, y:(.5 - y/w*.5)*canvas.clientHeight};
  },
  bounds(){ return state.model ? {min:state.model.min, max:state.model.max, center:state.model.center} : null; },
  onFrame(cb){ frameCb = cb; },
  reset(){ preset('iso'); },
  get triangles(){ return state.model ? state.model.triangles : 0; },
  destroy(){
   running = false;
   cancelAnimationFrame(frame);
   observer.disconnect();
   state.token++;
   state.model = null;
  }
 };
}
