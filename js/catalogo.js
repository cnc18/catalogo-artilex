const PERFUMES=window.PERFUMES;
// PERFUMES viene de datos/perfumes.js


// Cada aura es un canvas 2D con partículas que forman la silueta del frasco
function aura(p,size=300){
  return `<canvas class="aura-canvas" width="${size}" height="${Math.round(size*1.15)}" data-glow="${p.glow}" data-flow="${p.flow||1}" data-dens="${p.dens||0.8}" data-silueta="${p.silueta||''}"></canvas>`;
}

// Sprite de partícula pre-renderizado por color (evita crear gradientes por frame)
const SpriteCache={};
function getSprite(col){
  // redondear a escalones de 24 para limitar la cantidad de sprites
  const r=Math.round(col[0]/24)*24,g=Math.round(col[1]/24)*24,b=Math.round(col[2]/24)*24;
  const key=r+','+g+','+b;
  if(SpriteCache[key])return SpriteCache[key];
  const s=24,c=document.createElement('canvas');c.width=s;c.height=s;
  const x=c.getContext('2d');
  const grd=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  grd.addColorStop(0,`rgba(${r},${g},${b},1)`);
  grd.addColorStop(0.4,`rgba(${r},${g},${b},0.4)`);
  grd.addColorStop(1,`rgba(${r},${g},${b},0)`);
  x.fillStyle=grd;x.fillRect(0,0,s,s);
  SpriteCache[key]=c;return c;
}

// Muestrea los puntos de una silueta a partir de una IMAGEN del frasco.
// Si el perfume tiene 'silueta' (ruta a imagen), la usa; si no, dibuja la genérica.
const ShapeCache={};
function pointsFromImageData(imgData,W,H){
  const pts=[];const step=Math.max(4,Math.round(W/70));
  for(let y=0;y<H;y+=step)for(let x=0;x<W;x+=step){
    if(imgData[(y*W+x)*4+3]>120)pts.push([x,y]);
  }
  return pts;
}
function drawGenericBottle(o,W,H){
  const cx=W/2,cy=H/2,s=W/300*0.62;
  // dibujar centrado verticalmente, ocupando ~62% para dejar margen de dispersión
  const top=cy-H*0.31, bh=H*0.62; // altura del frasco reducida
  function ry(f){return top+bh*f;} // y relativa dentro del frasco
  o.fillStyle='#fff';
  o.beginPath();
  o.moveTo(cx-58*s,ry(0.42));
  o.bezierCurveTo(cx-75*s,ry(0.5),cx-72*s,ry(0.78),cx-40*s,ry(0.86));
  o.quadraticCurveTo(cx,ry(0.92),cx+40*s,ry(0.86));
  o.bezierCurveTo(cx+72*s,ry(0.78),cx+75*s,ry(0.5),cx+58*s,ry(0.42));
  o.closePath();o.fill();
  o.beginPath();
  o.moveTo(cx-58*s,ry(0.42));
  o.quadraticCurveTo(cx-50*s,ry(0.32),cx-22*s,ry(0.28));
  o.lineTo(cx+22*s,ry(0.28));
  o.quadraticCurveTo(cx+50*s,ry(0.32),cx+58*s,ry(0.42));
  o.closePath();o.fill();
  o.fillRect(cx-20*s,ry(0.2),40*s,bh*0.1);
  o.beginPath();
  o.moveTo(cx-26*s,ry(0.2));o.lineTo(cx-24*s,ry(0.08));
  o.quadraticCurveTo(cx-24*s,ry(0.05),cx-20*s,ry(0.05));
  o.lineTo(cx+20*s,ry(0.05));
  o.quadraticCurveTo(cx+24*s,ry(0.05),cx+24*s,ry(0.08));
  o.lineTo(cx+26*s,ry(0.2));o.closePath();o.fill();
}
// versión síncrona: forma genérica inmediata
function getBottlePoints(W,H){
  const key=W+'x'+H;
  if(ShapeCache[key])return ShapeCache[key];
  const off=document.createElement('canvas');off.width=W;off.height=H;
  const o=off.getContext('2d');
  drawGenericBottle(o,W,H);
  const pts=pointsFromImageData(o.getImageData(0,0,W,H).data,W,H);
  ShapeCache[key]=pts;return pts;
}
// Carga la foto del frasco y extrae puntos CON su color real (rgba por pixel)
function getColoredPointsFromImage(src,W,H,cb){
  const img=new Image();
  img.crossOrigin='anonymous';
  img.onload=()=>{
    const off=document.createElement('canvas');off.width=W;off.height=H;
    const o=off.getContext('2d');
    const scale=Math.min(W/img.width,H/img.height)*0.7;
    const dw=img.width*scale,dh=img.height*scale;
    const ox=(W-dw)/2,oy=(H-dh)/2;
    o.drawImage(img,ox,oy,dw,dh);
    const data=o.getImageData(0,0,W,H).data;
    // en móvil aumentamos el step → menos partículas → más rendimiento (forma se mantiene)
    const step=window.ES_MOVIL?Math.max(4,Math.round(W/64)):Math.max(3,Math.round(W/90));
    const pts=[];
    for(let y=0;y<H;y+=step)for(let x=0;x<W;x+=step){
      const i=(y*W+x)*4;
      if(data[i+3]>110){
        pts.push({x,y,col:[data[i],data[i+1],data[i+2]]});
      }
    }
    cb(pts,{img,ox,oy,dw,dh});
  };
  img.onerror=()=>cb(null,null);
  img.src=src;
}

const AuraManager=(function(){
  const auras=[];
  // FIX 1: posiciones cacheadas; se recalculan SOLO al hacer scroll/resize, nunca por frame.
  let _rectsDirty=true,_vh=window.innerHeight;
  function _markDirty(){_rectsDirty=true;}
  addEventListener('scroll',_markDirty,{passive:true});
  addEventListener('touchmove',_markDirty,{passive:true});
  addEventListener('resize',()=>{_vh=window.innerHeight;_rectsDirty=true;},{passive:true});
  function hexToRgb(h){const n=parseInt(h.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255];}
  function register(canvas){
    const glow=canvas.dataset.glow;
    const flow=parseFloat(canvas.dataset.flow);
    const silueta=canvas.dataset.silueta||'';
    const ctx=canvas.getContext('2d');
    // Densidad de píxeles real: subir el backing store a tamaño-en-pantalla × dpr
    // para que la foto del frasco se vea nítida en móviles HiDPI (antes el backing
    // era fijo y el navegador lo reescalaba hacia arriba → borroso).
    const dpr=Math.min(window.devicePixelRatio||1,2.5);
    canvas.width=Math.round(canvas.width*dpr);
    canvas.height=Math.round(canvas.height*dpr);
    const W=canvas.width,H=canvas.height,S=dpr;
    const fallbackCol=hexToRgb(glow);
    const cx=W/2,cy=H/2;

    function buildParts(home){
      return home.map(h=>{
        const a=Math.random()*Math.PI*2,dist=W*0.16+Math.random()*W*0.2;
        return {
          hx:h.x+(Math.random()-.5)*3*S, hy:h.y+(Math.random()-.5)*3*S,
          x:h.x, y:h.y,
          dx:cx+Math.cos(a)*dist, dy:cy+Math.sin(a)*dist,
          col:h.col||fallbackCol,
          sz:Math.random()*1.2+0.7, seed:Math.random(), sp:Math.random()*0.5+0.5
        };
      });
    }

    // _needsDraw: marca que hay contenido nuevo que pintar al menos una vez (FIX 2).
    // _center: centro vertical cacheado del canvas en pantalla (FIX 1).
    const obj={canvas,ctx,W,H,S,cx,cy,flow,parts:[],img:null,mouse:{x:-999,y:-999},visible:true,disperse:0,tgtDisperse:0,hasImg:false,_needsDraw:true,_center:null};

    if(silueta){
      getColoredPointsFromImage(silueta,W,H,(pts,meta)=>{
        if(pts&&pts.length){
          obj.parts=buildParts(pts);
          obj.img=meta; // {img,ox,oy,dw,dh} para dibujar la foto nítida en reposo
          obj.hasImg=true;
        }else{
          // fallback: forma genérica de partículas
          obj.parts=buildParts(genericPoints(W,H,fallbackCol));
        }
        obj.imgTint=dominantColor(obj.parts,fallbackCol);  // color dominante real del frasco
        applyAuraColor(canvas,obj.imgTint);                // halo/atmósfera de la tarjeta = color real
        obj._needsDraw=true; // la imagen/puntos ya llegaron: forzar un pintado
        window.__syncTint&&window.__syncTint();     // reevaluar por si este frasco ya está centrado
      });
    }else{
      obj.parts=buildParts(genericPoints(W,H,fallbackCol));
      obj.imgTint=dominantColor(obj.parts,fallbackCol);
      applyAuraColor(canvas,obj.imgTint);
      obj._needsDraw=true;
      window.__syncTint&&window.__syncTint();
    }

    const isTouch=window.matchMedia('(hover: none)').matches||('ontouchstart' in window);
    obj.isTouch=isTouch;

    if(!isTouch){
      // ESCRITORIO: hover con mouse moleculiza
      canvas.addEventListener('mousemove',e=>{const r=canvas.getBoundingClientRect();obj.mouse.x=(e.clientX-r.left)/r.width*W;obj.mouse.y=(e.clientY-r.top)/r.height*H;});
      canvas.addEventListener('mouseenter',()=>{obj.tgtDisperse=0.7;});
      canvas.addEventListener('mouseleave',()=>{obj.mouse.x=-999;obj.mouse.y=-999;obj.tgtDisperse=0;});
      const io=new IntersectionObserver(es=>{es.forEach(en=>{obj.visible=en.isIntersecting;if(en.isIntersecting)obj._needsDraw=true;});},{threshold:0.01});
      obj._io=io;io.observe(canvas);
    }else{
      // MÓVIL: la animación se controla por la posición del frasco en pantalla (scroll).
      obj.visible=true;obj.onScreen=true;
      const io=new IntersectionObserver(es=>{es.forEach(en=>{obj.onScreen=en.isIntersecting;if(en.isIntersecting){const r=en.boundingClientRect;obj._center=r.top+r.height/2;}obj._needsDraw=true;_rectsDirty=true;});},{threshold:0.01});
      obj._io=io;io.observe(canvas);
    }
    auras.push(obj);
    return obj;
  }

  // forma genérica como respaldo (sin foto): puntos con color del perfume
  function genericPoints(W,H,col){
    const off=document.createElement('canvas');off.width=W;off.height=H;
    const o=off.getContext('2d');
    drawGenericBottle(o,W,H);
    const data=o.getImageData(0,0,W,H).data;
    const pts=[];const step=Math.max(4,Math.round(W/70));
    for(let y=0;y<H;y+=step)for(let x=0;x<W;x+=step){
      if(data[(y*W+x)*4+3]>120)pts.push({x,y,col});
    }
    return pts;
  }

  function clear(){auras.forEach(a=>{if(a._io)a._io.disconnect();});auras.length=0;}
  // FIX 3: quitar del registro (y soltar su IntersectionObserver) las auras cuyo canvas
  // ya no está en el DOM. Se llama explícitamente al filtrar/buscar/paginar.
  function prune(){
    for(let i=auras.length-1;i>=0;i--){
      if(!document.body.contains(auras[i].canvas)){
        if(auras[i]._io)auras[i]._io.disconnect();
        auras.splice(i,1);
      }
    }
  }
  let t=0;
  function frame(){
    t+=0.016;
    // FIX 1: refrescar posiciones cacheadas SOLO si hubo scroll/resize (una pasada de lecturas
    // al inicio del frame, en vez de un getBoundingClientRect por aura y por frame).
    if(_rectsDirty){
      _rectsDirty=false;
      for(let i=0;i<auras.length;i++){const o=auras[i];if(o.isTouch&&o.onScreen){const r=o.canvas.getBoundingClientRect();o._center=r.top+r.height/2;}}
    }
    for(const o of auras){
      if(!o.visible)continue;
      // optimización: si está fuera de pantalla, no animar (salvo durante la navegación)
      if(o.isTouch&&!o._navigating&&!o.onScreen)continue;
      if(o._hide){o.ctx.clearRect(0,0,o.W,o.H);continue;}
      if(o._fading){o._fadeV=(o._fadeV??1)-0.06;if(o._fadeV<=0){o.ctx.clearRect(0,0,o.W,o.H);continue;}}
      else{o._fadeV=1;}
      const {ctx,W,H,S,flow,parts,mouse,img}=o;
      // MÓVIL: dispersión según posición del frasco en la pantalla (controlada por scroll).
      // Durante la navegación (_navigating) se ignora el scroll y manda tgtDisperse=1.
      if(o.isTouch&&!o._navigating){
        if(o.onScreen){
          const center=o._center??(o.canvas.getBoundingClientRect().top+o.H/2);
          const vh=_vh||window.innerHeight;
          // distancia normalizada del centro del frasco al centro de pantalla (0=centrado,1=borde)
          const d=Math.min(1,Math.abs(center-vh/2)/(vh/2));
          // ZONA NÍTIDA AMPLIA: si está dentro del 55% central, foto 100% nítida.
          // Solo se moleculiza en el último tramo hacia los bordes (45%→borde).
          let disp;
          if(d<0.55){disp=0;}                       // centro amplio: foto nítida, quieta
          else{disp=Math.min(0.8,(d-0.55)/0.45*0.8);} // hacia el borde: se desintegra suave
          o.tgtDisperse=disp;
        }else{
          o.tgtDisperse=0.8;
        }
      }
      o.disperse+=(o.tgtDisperse-o.disperse)*(o.isTouch?0.12:0.09);
      const disp=o.disperse;
      // FIX 2: si está nítido y quieto (disperse≈0, sin transición ni partículas vibrando),
      // no repintar este frame. El último frame dibujado ya es la foto nítida → se conserva.
      const moving=Math.abs(o.tgtDisperse-o.disperse)>0.0015;
      if(!moving&&disp<=0.04&&!o._fading&&!o._needsDraw)continue;
      ctx.clearRect(0,0,W,H);

      const fade=o._fadeV??1;
      // 1) Foto nítida del frasco: se desvanece RÁPIDO al iniciar el gesto
      if(img&&disp<0.3){
        ctx.globalAlpha=Math.max(0,1-disp/0.28)*fade;
        ctx.drawImage(img.img,img.ox,img.oy,img.dw,img.dh);
        ctx.globalAlpha=1;
      }

      // 2) Partículas: aparecen rápido justo cuando la foto ya casi no está
      if(disp>0.04){
        ctx.globalCompositeOperation='lighter';
        const pAlpha=Math.min(1,(disp-0.04)/0.2);
        for(const p of parts){
          const vibX=Math.sin(t*2.0*flow*p.sp+p.seed*6.28)*2.0*S;
          const vibY=Math.cos(t*1.7*flow*p.sp+p.seed*6.28)*2.0*S;
          let bx=p.hx+(p.dx-p.hx)*disp+vibX;
          let by=p.hy+(p.dy-p.hy)*disp+vibY;
          const mdx=bx-mouse.x,mdy=by-mouse.y,md=Math.sqrt(mdx*mdx+mdy*mdy);
          if(md<70*S&&md>0.1){const f=(1-md/(70*S))*50*S;bx+=mdx/md*f;by+=mdy/md*f;}
          p.x+=(bx-p.x)*.16;p.y+=(by-p.y)*.16;
          const sz=p.sz*2.4*S*(1+Math.sin(t*2.5+p.seed*6.28)*0.15);
          ctx.globalAlpha=pAlpha*(0.5+p.seed*0.45)*fade;
          ctx.drawImage(getSprite(p.col),p.x-sz,p.y-sz,sz*2,sz*2);
        }
        ctx.globalAlpha=1;
        ctx.globalCompositeOperation='source-over';
      }
      o._needsDraw=false; // ya se pintó este estado; si nada cambia, el próximo frame se salta (FIX 2)
    }
    requestAnimationFrame(frame);
  }
  frame();
  return {register,clear,prune,auras};
})();

function initAuras(scope,stagger){
  const list=Array.prototype.slice.call((scope||document).querySelectorAll('.aura-canvas:not([data-init])'));
  if(!stagger){
    // registro síncrono (fallback si se necesita el aura disponible de inmediato)
    list.forEach(c=>{c.setAttribute('data-init','1');AuraManager.register(c);});
    return;
  }
  // FIX 7: galería: registrar de a pocos por frame para no encadenar los getImageData
  // de toda una tanda en el mismo frame (evita la microcongelación al cargar/paginar).
  let i=0;
  (function chunk(){
    const end=Math.min(i+3,list.length);
    for(;i<end;i++){const c=list[i];if(!document.body.contains(c))continue;c.setAttribute('data-init','1');AuraManager.register(c);}
    if(i<list.length)requestAnimationFrame(chunk);
  })();
}

let aF="todos",sQ="",gF="todos",cF="todos";
const gallery=document.getElementById('gallery');

const POR_TANDA=12;        // cuántas fragancias se renderizan por tanda
let _filtradas=[];          // resultado del filtro actual
let _mostradas=0;           // cuántas se han renderizado ya

function aplicarFiltros(){
  _filtradas=PERFUMES.filter(p=>{
    const mf=aF==="todos"||p.familia===aF;
    const mg=gF==="todos"||p.genero===gF;
    const mc=cF==="todos"||p.casa===cF;
    const ms=!sQ||p.nombre.toLowerCase().includes(sQ)||p.preview.join(' ').toLowerCase().includes(sQ)||p.desc.toLowerCase().includes(sQ)||(p.casa&&p.casa.toLowerCase().includes(sQ));
    return mf&&mg&&mc&&ms;
  });
  _filtradas.sort((a,b)=>a.nombre.localeCompare(b.nombre));
}

function render(){
  aplicarFiltros();
  // FIX 4: matar los ScrollTriggers de las filas que se van a destruir (mientras siguen en el DOM),
  // sin tocar los globales (hero/intro/quote/cat-head), cuyo trigger no está dentro de la galería.
  if(window.ScrollTrigger){ScrollTrigger.getAll().forEach(st=>{if(st.trigger&&gallery.contains(st.trigger))st.kill();});}
  gallery.innerHTML="";
  // FIX 3: soltar del registro las auras de esas filas ya eliminadas del DOM.
  AuraManager.prune();
  _mostradas=0;
  // quitar botón "ver más" anterior si existe
  const vm=document.getElementById('verMas');if(vm)vm.remove();
  if(!_filtradas.length){
    gallery.innerHTML='<div class="empty"><p>No encontramos esa fragancia… todavía.</p></div>';
    return;
  }
  renderTanda();
}

function renderTanda(){
  const inicio=_mostradas;
  const fin=Math.min(_mostradas+POR_TANDA,_filtradas.length);
  const frag=document.createDocumentFragment();
  for(let idx=inicio;idx<fin;idx++){
    const p=_filtradas[idx];
    const row=document.createElement('div');row.className="row";
    row.innerHTML=`
      <div class="row-vis" data-cursor data-id="${p.id}">
        <div class="row-atm" style="--atm:${p.atm}"></div>
        <div class="row-holo"></div>
        <div class="row-glow" style="background:${p.glow}"></div>
        <div class="row-bottle">${aura(p,360)}</div>
        <div class="row-num">${String(idx+1).padStart(2,'0')} / ${String(_filtradas.length).padStart(2,'0')}</div>
        ${p.nuevo?'<div class="row-new">Nuevo</div>':''}
      </div>
      <div class="row-info">
        <p class="ri-fam">${p.fl}</p>
        <h3 class="ri-name">${p.nombre}</h3>
        <p class="ri-casa">Inspirado en ${p.casa}</p>
        <p class="ri-desc">${p.desc}</p>
        <div class="ri-notes">${p.preview.map(n=>`<span class="ri-note">${n}</span>`).join('')}</div>
        <div class="ri-foot">
          <div class="ri-price">$${p.precio.toLocaleString('es-CO')}<s>COP · 100ml</s></div>
          <button class="ri-btn" data-cursor data-id="${p.id}">Descubrir <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
        </div>
      </div>`;
    const visEl=row.querySelector('.row-vis');
    visEl.addEventListener('click',()=>dispersarYNavegar(p,visEl));
    row.querySelector('.ri-btn').addEventListener('click',()=>dispersarYNavegar(p,visEl));
    frag.appendChild(row);
  }
  gallery.appendChild(frag);
  _mostradas=fin;

  // botón "ver más" si quedan fragancias
  let vm=document.getElementById('verMas');
  if(_mostradas<_filtradas.length){
    if(!vm){
      vm=document.createElement('button');
      vm.id='verMas';vm.className='ver-mas';vm.setAttribute('data-cursor','');
      vm.addEventListener('click',()=>{renderTanda();});
      gallery.after(vm);
    }
    vm.textContent=`Ver más fragancias (${_filtradas.length-_mostradas} restantes)`;
  }else if(vm){vm.remove();}

  bindCursor();
  initAuras(gallery,true);
  if(window.gsap&&window.ScrollTrigger)setupRowAnims();
}

// Color dominante de un frasco a partir de los píxeles realmente dibujados (foto real
// o, si no hay imagen, la silueta genérica con el color del perfume). Pondera por
// saturación para que mande el color VIVO predominante y no se lave a gris, y normaliza
// el brillo para que el humo sea visible conservando el matiz.
// Realza la saturación de un color [r,g,b] (0..255) conservando su matiz y brillo.
function _satBoost(c,s){
  const lum=0.3*c[0]+0.59*c[1]+0.11*c[2];
  return [Math.max(0,Math.min(255,lum+(c[0]-lum)*s)),
          Math.max(0,Math.min(255,lum+(c[1]-lum)*s)),
          Math.max(0,Math.min(255,lum+(c[2]-lum)*s))];
}
function _chroma(c){return (Math.max(c[0],c[1],c[2])-Math.min(c[0],c[1],c[2]))/255;}

// Los rojos/rosados/magentas se ven demasiado intensos como aura. Este amortiguador
// baja saturación y brillo SOLO en esa banda de matiz (≈295°–28°), dejando intactos
// azules, teal, dorados, verdes, etc. Trabaja en rgb normalizado (0..1).
function _dampenWarm(c){
  const r=c[0],g=c[1],b=c[2];
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  if(d<0.03)return c;                       // gris: nada que hacer
  let h; if(mx===r)h=((g-b)/d)%6; else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4;
  h*=60; if(h<0)h+=360;
  // intensidad de la banda rojo/rosa/magenta con caídas suaves en los bordes
  let band;
  if(h>=310||h<=12)band=1;                  // núcleo: rojo, rosa, fucsia
  else if(h>295)band=(h-295)/15;            // borde morado→magenta
  else if(h<28)band=(28-h)/16;              // borde rojo→naranja
  else band=0;
  if(band<=0)return c;
  const lum=0.3*r+0.59*g+0.11*b;
  const s=1-0.28*band, v=1-0.14*band;       // -28% saturación, -14% brillo (máx)
  return [Math.max(0,Math.min(1,(lum+(r-lum)*s)*v)),
          Math.max(0,Math.min(1,(lum+(g-lum)*s)*v)),
          Math.max(0,Math.min(1,(lum+(b-lum)*s)*v))];
}

// Color PREDOMINANTE del frasco. Un promedio simple mezcla tonos y se va a gris, así
// que se hace por CLUSTERING: se agrupan los píxeles en cubos de color (8×8×8) ponderando
// por saturación y se elige el cubo más dominante. Si el frasco tiene un matiz tenue
// (vidrio azul oscuro, etc.) se realza; si es realmente neutro (vidrio transparente,
// negro), se usa el color de marca (glow) para que el humo refleje algo, no gris muerto.
function dominantColor(parts,glow){
  const bk={};
  for(let i=0;i<parts.length;i++){
    const c=parts[i].col,r=c[0],g=c[1],b=c[2];
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    if(mx>240||mx<18)continue;                 // descarta reflejos casi-blancos y sombras casi-negras
    const ch=mx-mn,w=ch*ch+1;                  // la saturación manda
    const key=((r>>5)<<6)|((g>>5)<<3)|(b>>5);
    const t=bk[key];
    if(t){t[0]+=r*w;t[1]+=g*w;t[2]+=b*w;t[3]+=w;}
    else bk[key]=[r*w,g*w,b*w,w];
  }
  let best=null;
  for(const k in bk){if(!best||bk[k][3]>best[3])best=bk[k];}
  let col;
  if(!best){
    col=glow?_satBoost(glow,1.25):null;
  }else{
    const c=[best[0]/best[3],best[1]/best[3],best[2]/best[3]];
    if(_chroma(c)>=0.08){col=_satBoost(c,1.25);}     // ya colorido (realce suave)
    else{
      const c2=_satBoost(c,2.6);                      // realza un matiz tenue
      if(_chroma(c2)>=0.06)col=c2;                    // sí tenía matiz (p.ej. azul apagado)
      else col=glow?_satBoost(glow,1.25):c2;          // gris real → acento de marca
    }
  }
  if(!col)return null;
  // normaliza el brillo para que el color sea visible sin pasarse de intenso
  const m=Math.max(col[0],col[1],col[2],1)/255,gain=Math.max(0.7,Math.min(1.8,0.74/m));
  return _dampenWarm([Math.min(1,col[0]/255*gain),Math.min(1,col[1]/255*gain),Math.min(1,col[2]/255*gain)]);
}

// Tiñe el halo (.row-glow) y la atmósfera (.row-atm) de la tarjeta con el color
// dominante REAL del frasco, en vez del p.glow fijo (paleta reciclada que se veía
// amarilla y no coincidía). Así el aura coincide siempre con el frasco.
function applyAuraColor(canvas,tint){
  if(!tint||!canvas.closest)return;
  const vis=canvas.closest('.row-vis'); if(!vis)return;
  const r=Math.round(tint[0]*255),g=Math.round(tint[1]*255),b=Math.round(tint[2]*255);
  const hex='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  const glow=vis.querySelector('.row-glow'); if(glow)glow.style.background=`rgb(${r},${g},${b})`;
  const atm=vis.querySelector('.row-atm'); if(atm)atm.style.setProperty('--atm',`radial-gradient(ellipse at 50% 50%,${hex}22,#0a1422 55%,#070C16)`);
}

// El color del humo de fondo lo "posee" el perfume cuyo frasco está más cerca del
// centro de la pantalla, y debe COINCIDIR con el color predominante de su imagen.
// Antes el tinte era un valor fijo puesto a mano (p.tint) y se disparaba con un
// ScrollTrigger en "top 60%" (frasco aún sin centrar). Ahora: se elige por cercanía
// al centro (simétrico al subir/bajar) y el color sale de la imagen real del frasco.
let _tintLast=null,_tintTick=false;
function tintForRow(row){
  const cv=row.querySelector('.aura-canvas');
  const a=cv&&AuraManager.auras.find(x=>x.canvas===cv);
  if(a&&a.imgTint)return a.imgTint;               // color dominante de la imagen ya calculado
  const v=row.querySelector('.row-vis');const id=v&&+v.dataset.id; // aún sin cargar: respaldo
  const p=PERFUMES.find(x=>x.id===id);
  return p?p.tint:null;
}
function syncTint(){
  _tintTick=false;
  const rows=document.querySelectorAll('.row');
  const mid=innerHeight/2;
  let best=null,bestD=Infinity;
  for(let i=0;i<rows.length;i++){
    const r=rows[i].getBoundingClientRect();
    if(r.bottom<0||r.top>innerHeight)continue;     // fila fuera de pantalla
    const d=Math.abs(r.top+r.height/2-mid);        // distancia del centro de la fila al centro de pantalla
    if(d<bestD){bestD=d;best=rows[i];}
  }
  if(!best)return;
  const c=tintForRow(best);
  if(!c)return;
  if(_tintLast&&_tintLast[0]===c[0]&&_tintLast[1]===c[1]&&_tintLast[2]===c[2])return; // sin cambio real
  _tintLast=c;window.__setTint&&window.__setTint(c);
}
function _tintOnScroll(){if(!_tintTick){_tintTick=true;requestAnimationFrame(syncTint);}}
window.__syncTint=_tintOnScroll;                  // para reevaluar cuando una imagen termina de cargar
addEventListener('scroll',_tintOnScroll,{passive:true});
addEventListener('resize',_tintOnScroll,{passive:true});

function setupRowAnims(){
  gsap.utils.toArray('.row:not([data-anim])').forEach(row=>{
    row.setAttribute('data-anim','1');
    const vis=row.querySelector('.row-vis'),info=row.querySelector('.row-info'),bottleEl=row.querySelector('.row-bottle'),glow=row.querySelector('.row-glow');
    gsap.fromTo(vis,{opacity:0,scale:.92},{opacity:1,scale:1,duration:1.1,ease:"power3.out",scrollTrigger:{trigger:row,start:"top 85%",toggleActions:"play none none none"}});
    gsap.fromTo(info.children,{y:40,opacity:0},{y:0,opacity:1,duration:.9,stagger:.1,ease:"power3.out",scrollTrigger:{trigger:row,start:"top 80%",toggleActions:"play none none none"}});
    // FIX 8: promover a capa (will-change) SOLO mientras la fila está en su rango de parallax;
    // al salir se quita, evitando mantener decenas de capas/blur compuestas permanentemente.
    gsap.to(bottleEl,{yPercent:-14,ease:"none",scrollTrigger:{trigger:row,start:"top bottom",end:"bottom top",scrub:1,onToggle:self=>{const v=self.isActive?'transform':'auto';bottleEl.style.willChange=v;glow.style.willChange=v;}}});
    gsap.to(glow,{yPercent:14,ease:"none",scrollTrigger:{trigger:row,start:"top bottom",end:"bottom top",scrub:1.5}});
  });
  ScrollTrigger.refresh();
  syncTint(); // recalcular qué perfume está centrado tras (re)construir las filas
  setTimeout(()=>{document.querySelectorAll('.row-vis').forEach(v=>{if(getComputedStyle(v).opacity==='0')gsap.set(v,{opacity:1,scale:1});});},1500);
}

// Al hacer clic en un perfume: desintegrar su frasco con el motor de partículas existente
// (el mismo del hover, llevando disperse→1) y, cuando la dispersión está avanzada, navegar
// a su página individual. La página destino (frasco.js) arranca disperso y se reagrupa,
// de modo que la transición se siente continua entre las dos páginas.
let _navegando=false;
function dispersarYNavegar(p,sourceEl){
  const url=`perfume.html?p=${p.slug}`;
  if(_navegando)return;            // evita doble manejo (no navegar dos veces por clics repetidos)
  _navegando=true;
  const canvas=sourceEl&&sourceEl.querySelector('.aura-canvas');
  const aura=canvas&&AuraManager.auras.find(a=>a.canvas===canvas);
  // sin aura lista (la imagen aún no cargó, etc.): navegar directo
  if(!aura||!aura.parts.length){location.href=url;return;}
  window.__setTint&&window.__setTint(aura.imgTint||p.tint);
  // disparar la desintegración con el MISMO motor de partículas (disperse→1)
  aura._navigating=true;           // bypass de la dispersión por scroll en móvil
  aura.tgtDisperse=1;
  aura._needsDraw=true;
  // navegar cuando la dispersión está avanzada; en móvil un poco más corta.
  // Este setTimeout es además la red de seguridad: pase lo que pase con la animación,
  // siempre dispara la navegación (la página nunca se queda atascada).
  const dur=window.ES_MOVIL?500:700;
  setTimeout(()=>{location.href=url;},dur);
}

// Al regresar al catálogo —incluida la RESTAURACIÓN desde bfcache (botón atrás / volver)—
// el navegador puede revivir la página congelada con _navegando=true y un frasco disperso.
// En ese estado el guard de dispersarYNavegar bloquea todos los clics ("no abren los perfumes").
// pageshow se dispara también en restauraciones bfcache → reseteamos el estado aquí.
window.addEventListener('pageshow',()=>{
  _navegando=false;
  AuraManager.auras.forEach(a=>{a._navigating=false;a.tgtDisperse=0;a._needsDraw=true;});
});

document.getElementById('pills').addEventListener('click',e=>{
  if(!e.target.classList.contains('pill'))return;
  document.querySelectorAll('.pill').forEach(p=>p.classList.remove('on'));
  e.target.classList.add('on');aF=e.target.dataset.f;render();
});
document.getElementById('q').addEventListener('input',e=>{sQ=e.target.value.toLowerCase().trim();render()});
// Dropdowns personalizados
function setupDropdown(id,onSelect){
  const dd=document.getElementById(id);
  const trigger=dd.querySelector('.dd-trigger');
  const label=dd.querySelector('.dd-label');
  const defLabel=label.textContent;
  const searchInput=dd.querySelector('.dd-search-input');
  trigger.addEventListener('click',e=>{
    e.stopPropagation();
    document.querySelectorAll('.dropdown.open').forEach(o=>{if(o!==dd)o.classList.remove('open')});
    dd.classList.toggle('open');
    if(dd.classList.contains('open')&&searchInput){
      setTimeout(()=>searchInput.focus(),100);
    }
  });
  dd.querySelectorAll('.dd-opt').forEach(opt=>{
    opt.addEventListener('click',e=>{
      e.stopPropagation();
      dd.querySelectorAll('.dd-opt').forEach(o=>o.classList.remove('on'));
      opt.classList.add('on');
      const v=opt.dataset.v;
      label.textContent=(v==='todos')?defLabel:opt.textContent;
      dd.classList.remove('open');
      if(searchInput){searchInput.value='';filtrarOpciones(dd,'');}
      onSelect(v);
    });
  });
  // buscador interno del dropdown
  if(searchInput){
    searchInput.addEventListener('click',e=>e.stopPropagation());
    searchInput.addEventListener('input',e=>filtrarOpciones(dd,e.target.value));
  }
}
function filtrarOpciones(dd,q){
  q=q.toLowerCase().trim();
  const opts=dd.querySelectorAll('.dd-opt');
  let visibles=0;
  opts.forEach(o=>{
    // "Todas las casas" siempre visible; el resto filtra por texto
    const txt=o.textContent.toLowerCase();
    const match=o.dataset.v==='todos'||txt.includes(q);
    o.classList.toggle('hidden',!match);
    if(match&&o.dataset.v!=='todos')visibles++;
  });
  // mensaje "sin resultados"
  let nr=dd.querySelector('.dd-noresult');
  if(visibles===0&&q){
    if(!nr){nr=document.createElement('div');nr.className='dd-noresult';nr.textContent='Sin resultados';dd.querySelector('.dd-options').appendChild(nr);}
  }else if(nr){nr.remove();}
}
document.addEventListener('click',()=>document.querySelectorAll('.dropdown.open').forEach(o=>o.classList.remove('open')));
setupDropdown('ddGenero',v=>{gF=v;render()});
setupDropdown('ddCasa',v=>{cF=v;render()});

const cur=document.getElementById('cur'),curR=document.getElementById('curR');
let mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
// FIX 6: en móvil .cur/.curR están display:none → no arrancar su RAF ni el listener de mousemove
// (escribir estilos cada frame a elementos invisibles era trabajo 100% desperdiciado).
if(!window.ES_MOVIL){
  addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;cur.style.left=mx+'px';cur.style.top=my+'px'});
  (function loop(){rx+=(mx-rx)*.16;ry+=(my-ry)*.16;curR.style.left=rx+'px';curR.style.top=ry+'px';requestAnimationFrame(loop)})();
}
function bindCursor(){
  document.querySelectorAll('[data-cursor]').forEach(el=>{
    if(el._cb)return;el._cb=1;
    el.addEventListener('mouseenter',()=>{cur.style.width='3px';cur.style.height='3px';curR.style.width='66px';curR.style.height='66px'});
    el.addEventListener('mouseleave',()=>{cur.style.width='7px';cur.style.height='7px';curR.style.width='38px';curR.style.height='38px'});
  });
}

render();

window.addEventListener('load',()=>{
  if(!window.gsap)return;
  gsap.registerPlugin(ScrollTrigger);
  if(window.Lenis){
    const lenis=new Lenis({duration:1.25,easing:t=>Math.min(1,1.001-Math.pow(2,-10*t))});
    function raf(t){lenis.raf(t);ScrollTrigger.update();requestAnimationFrame(raf)}
    requestAnimationFrame(raf);
  }
  const tl=gsap.timeline({defaults:{ease:"power4.out"}});
  tl.from('.h-eye>span',{y:30,opacity:0,duration:.9})
    .from('.h1 .ln>span',{yPercent:120,duration:1.2,stagger:.13},'-=.5')
    .from('.h-sub',{y:24,opacity:0,duration:.9},'-=.7')
    .from('.h-cta .btn',{y:24,opacity:0,duration:.8,stagger:.12},'-=.6')
    .from('.scroll-ind',{opacity:0,duration:1},'-=.3');
  gsap.fromTo('.scroll-ind .l',{scaleY:0,transformOrigin:'top'},{scaleY:1,duration:1.4,repeat:-1,yoyo:true,ease:"power1.inOut"});

  const it=document.getElementById('introTxt');
  const words=it.innerHTML.split(' ');
  it.innerHTML=words.map(w=>w.includes('<')?w:`<span class="w">${w}</span>`).join(' ');
  it.querySelector('em')&&it.querySelector('em').classList.add('w');
  gsap.from('#introTxt .w',{y:28,opacity:0,duration:.7,stagger:.05,ease:"power3.out",scrollTrigger:{trigger:'.intro',start:"top 70%"}});

  gsap.utils.toArray('.cat-head, .filters').forEach(el=>gsap.from(el,{y:40,opacity:0,duration:1,scrollTrigger:{trigger:el,start:"top 85%"}}));

  const q=document.getElementById('quote');
  const qw=q.innerHTML.split(' ');
  q.innerHTML=qw.map(w=>w.includes('<')?w:`<span class="qw">${w}</span>`).join(' ');
  q.querySelector('em')&&q.querySelector('em').classList.add('qw');
  gsap.from('#quote .qw',{y:30,opacity:0,duration:.7,stagger:.04,ease:"power3.out",scrollTrigger:{trigger:'#quote',start:"top 75%"}});
});
