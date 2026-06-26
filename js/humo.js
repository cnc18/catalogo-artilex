// Detección global de dispositivo táctil para optimizaciones de rendimiento
window.ES_MOVIL=window.matchMedia('(hover: none)').matches||('ontouchstart' in window)||innerWidth<760;
(function(){
const cv=document.getElementById('smoke');
const gl=cv.getContext('webgl');
if(!gl){cv.style.display='none';return;}
function comp(t,s){const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);return sh;}
const prog=gl.createProgram();
gl.attachShader(prog,comp(gl.VERTEX_SHADER,document.getElementById('vert').textContent));
gl.attachShader(prog,comp(gl.FRAGMENT_SHADER,document.getElementById('frag').textContent));
gl.linkProgram(prog);gl.useProgram(prog);
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
const loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
const uRes=gl.getUniformLocation(prog,'u_res'),uTime=gl.getUniformLocation(prog,'u_time'),uMouse=gl.getUniformLocation(prog,'u_mouse'),uTint=gl.getUniformLocation(prog,'u_tint');
let mouse=[.5,.5],tmouse=[.5,.5];
let tint=[.79,.64,.15],ttint=[.79,.64,.15];
window.__setTint=function(c){ttint=c;};
function resize(){
  // fracción del tamaño CSS a la que se renderiza el humo. Más alto = más nítido pero
  // más costoso. Táctil/tablet 0.55 (antes 0.4 → se veía borroso); escritorio 0.75.
  // El dithering del shader evita el banding aunque no sea resolución completa.
  const q=window.ES_MOVIL?0.55:0.75;
  cv.width=Math.round(innerWidth*q);cv.height=Math.round(innerHeight*q);
  cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px';
  gl.viewport(0,0,cv.width,cv.height);
}
addEventListener('resize',resize);resize();
addEventListener('mousemove',e=>{tmouse=[e.clientX/innerWidth,1-e.clientY/innerHeight];});
const start=Date.now();
function draw(){
  // No renderizar el humo cuando la pestaña está oculta. El RAF se mantiene vivo
  // para reanudar al instante al volver.
  if(document.hidden){requestAnimationFrame(draw);return;}
  mouse[0]+=(tmouse[0]-mouse[0])*.05;mouse[1]+=(tmouse[1]-mouse[1])*.05;
  for(let i=0;i<3;i++)tint[i]+=(ttint[i]-tint[i])*.03;
  gl.uniform2f(uRes,cv.width,cv.height);
  gl.uniform1f(uTime,(Date.now()-start)/1000);
  gl.uniform2f(uMouse,mouse[0],mouse[1]);
  gl.uniform3f(uTint,tint[0],tint[1],tint[2]);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  requestAnimationFrame(draw);
}
draw();
})();
