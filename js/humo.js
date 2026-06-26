// Detección global de dispositivo táctil para optimizaciones de rendimiento
window.ES_MOVIL=window.matchMedia('(hover: none)').matches||('ontouchstart' in window)||innerWidth<760;
// TABLET = táctil con pantalla grande: misma GPU modesta que un móvil pero MUCHA más
// área que dibujar → se le aplican recortes extra (foto estática, humo liviano).
window.ES_TABLET=window.ES_MOVIL&&Math.min(window.innerWidth,window.innerHeight)>=600;
(function(){
const cv=document.getElementById('smoke');
const gl=cv.getContext('webgl');
if(!gl){cv.style.display='none';return;}
function comp(t,s){const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);return sh;}
const prog=gl.createProgram();
gl.attachShader(prog,comp(gl.VERTEX_SHADER,document.getElementById('vert').textContent));
// Solo el MÓVIL (pantalla pequeña) usa el shader barato. La TABLET vuelve al shader
// completo (2 domain-warps) para recuperar el detalle del humo; el coste extra se
// compensa limitando los FPS (ver draw()), no recortando octavas.
const fragLite=document.getElementById('frag-lite');
const useLite=window.ES_MOVIL&&!window.ES_TABLET&&fragLite;
const fragSrc=(useLite?fragLite:document.getElementById('frag')).textContent;
gl.attachShader(prog,comp(gl.FRAGMENT_SHADER,fragSrc));
gl.linkProgram(prog);gl.useProgram(prog);
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
const uRes=gl.getUniformLocation(prog,'u_res'),uTime=gl.getUniformLocation(prog,'u_time'),uMouse=gl.getUniformLocation(prog,'u_mouse'),uTint=gl.getUniformLocation(prog,'u_tint');
let mouse=[.5,.5],tmouse=[.5,.5];
let tint=[.79,.64,.15],ttint=[.79,.64,.15];
window.__setTint=function(c){ttint=c;};
function resize(){
  // fracción del tamaño CSS a la que se renderiza el humo. La nitidez la da sobre todo
  // ESTA fracción + el tope de abajo: con FPS limitados (draw) podemos subirla sin trabar.
  // móvil pequeño 0.7 · tablet 0.9 (casi nativo, adiós borroso) · desktop 0.85.
  const q=window.ES_TABLET?0.9:(window.ES_MOVIL?0.7:0.85);
  let w=innerWidth*q,h=innerHeight*q;
  // tope del lado largo. En móvil pequeño se acota fuerte; en tablet se sube mucho
  // (1600) para que NO se note el reescalado; desktop sin tope práctico.
  const cap=window.ES_TABLET?1600:(window.ES_MOVIL?1000:100000);
  const sc=Math.min(1,cap/Math.max(w,h));
  cv.width=Math.round(w*sc);cv.height=Math.round(h*sc);
  cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px';
  gl.viewport(0,0,cv.width,cv.height);
}
addEventListener('resize',resize);resize();
addEventListener('mousemove',e=>{tmouse=[e.clientX/innerWidth,1-e.clientY/innerHeight];});
const start=Date.now();
// En táctil (tablet/móvil) limitamos el humo a ~32 fps. El humo evoluciona a t*0.04
// (lentísimo) → 32 fps es indistinguible de 60, pero deja la mitad de los frames de GPU
// libres para que el SCROLL no se trabe. Este es el truco que permite, a la vez, subir
// resolución y usar el shader completo sin perder fluidez.
const MIN_DT=window.ES_MOVIL?1000/32:0;
let _last=0;
function draw(now){
  requestAnimationFrame(draw);
  // No renderizar el humo cuando la pestaña está oculta. El RAF se mantiene vivo
  // para reanudar al instante al volver.
  if(document.hidden)return;
  // Tope de FPS en táctil: si no ha pasado el intervalo mínimo, saltar este frame.
  if(MIN_DT&&now-_last<MIN_DT)return;
  _last=now;
  mouse[0]+=(tmouse[0]-mouse[0])*.05;mouse[1]+=(tmouse[1]-mouse[1])*.05;
  for(let i=0;i<3;i++)tint[i]+=(ttint[i]-tint[i])*.03;
  gl.uniform2f(uRes,cv.width,cv.height);
  gl.uniform1f(uTime,(Date.now()-start)/1000);
  gl.uniform2f(uMouse,mouse[0],mouse[1]);
  gl.uniform3f(uTint,tint[0],tint[1],tint[2]);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}
requestAnimationFrame(draw);
})();
