'use strict';
// Presentation coordinates are independent of front/rear combat rules.
(()=>{
  function layout(w,h,dock){const mobile=w<700;const bottom=h-dock-(mobile?100:40);return {w,h,mobile,bottom,horizon:Math.max(mobile?228:190,bottom*.42)};}
  function project(a,actors,w,h,dock){const l=layout(w,h,dock),group=actors.filter(x=>x.side===a.side),index=Math.max(0,group.findIndex(x=>x.id===a.id));let depth,x;
    if(a.side===0){depth=(a.lane==='rear'?.09:.37)+index*.065;x=(a.lane==='rear'?.20:.34)+index*.09;}
    else{depth=(a.lane==='front'?.47:.66)+index*.055;x=(a.lane==='front'?.66:.77)+index*.07;}
    const y=l.horizon+(l.bottom-l.horizon)*(1-depth),scale=(a.side===0?1.32:1.05)-depth*.75;
    return {x:w*x+(a.acting?(a.side===0?w*.13:-w*.10):0),y:y+(a.acting?(a.side===0?-12:12):0),scale:scale*(l.mobile?.69:1),depth};
  }
  function poly(ctx,points,fill,stroke){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  function line(ctx,x1,y1,x2,y2,color,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  function background(ctx,l){const {w,h,horizon:hy,bottom}=l;const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#152b42');bg.addColorStop(.54,'#182437');bg.addColorStop(1,'#402637');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    poly(ctx,[[0,0],[w*.37,0],[w*.54,hy],[0,bottom]],'#132237');poly(ctx,[[w*.74,0],[w,0],[w,bottom],[w*.58,hy]],'#2e2335');
    for(let i=0;i<6;i++){const x=w*(.03+i*.071);line(ctx,x,0,x+w*.08,hy+60,'#2b4258',8);line(ctx,x,65,x+w*.08,hy+60,'#47607855',2);}
    for(let i=0;i<5;i++){const x=w*(.70+i*.075);line(ctx,x,65,x-w*.025,hy+50,'#6a40564d',8);line(ctx,x-35,110,x+15,hy,'#6741524d',2);}
    line(ctx,0,48,w,90,'#07121e',12);line(ctx,w*.03,48,w*.43,79,'#536c85',2);
    for(let i=0;i<4;i++){const x=w*(.53+i*.065);ctx.fillStyle='#121c2b';ctx.fillRect(x,hy-100,22,110);ctx.fillStyle='#344054';ctx.fillRect(x,hy-100,2,110);}
    const floor=ctx.createLinearGradient(0,hy,0,h);floor.addColorStop(0,'#202e3e');floor.addColorStop(1,'#374357');poly(ctx,[[0,hy+100],[w*.46,hy],[w,hy+60],[w,h],[0,h]],floor);
    const van={x:w*.54,y:hy-5};for(let i=-3;i<=11;i++)line(ctx,van.x,van.y,w*i/8,h,'#7b8d9e24',1);
    for(const f of [.13,.27,.47,.73,1]){const y=hy+(h-hy)*f;line(ctx,0,y,w,y-35,'#8a9aa533',1);}
    for(let i=0;i<10;i++){const x=(.09+(i*.127)% .84)*w,y=hy+55+(i*29)%Math.max(80,bottom-hy-65);poly(ctx,[[x,y],[x+14,y-2],[x+22,y+2],[x+6,y+6]],'#65718338');}
    const haze=ctx.createRadialGradient(w*.50,hy,15,w*.50,hy,w*.5);haze.addColorStop(0,'#6a8ca222');haze.addColorStop(1,'#07111d00');ctx.fillStyle=haze;ctx.fillRect(0,0,w,h);
  }
  function figure(ctx,a,p,time){ctx.save();ctx.translate(p.x,p.y);ctx.scale(p.scale,p.scale);if(a.hp<=0)ctx.globalAlpha=.20;
    ctx.fillStyle='#0006';ctx.beginPath();ctx.ellipse(0,1,a.side===0?43:30,9,0,0,Math.PI*2);ctx.fill();const idle=Math.sin(time/750+(a.id==='doyun'?0:1))*(a.hp>0?1.5:0);ctx.translate(0,idle);
    if(a.shield){ctx.strokeStyle='#92e6d399';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(3,-104,47,112,-.13,0,Math.PI*2);ctx.stroke();}
    if(a.side===0){
      const coat=a.color,back=a.id==='doyun'?'#437e83':'#975b49';
      poly(ctx,[[-12,-94],[-1,-94],[-5,-44],[-18,-11],[-26,-8],[-16,-52]],'#c2b8b7');
      poly(ctx,[[6,-94],[19,-94],[25,-52],[39,-12],[29,-5],[12,-48]],'#d6ccca');
      poly(ctx,[[-27,-10],[-14,-11],[-10,-2],[-34,0]],'#243448');poly(ctx,[[29,-11],[39,-12],[48,-3],[27,0]],'#243448');
      poly(ctx,[[-25,-159],[0,-166],[24,-153],[20,-94],[-15,-88],[-34,-104]],back);
      poly(ctx,[[-25,-158],[-9,-164],[7,-139],[-3,-70],[-35,-81]],coat);poly(ctx,[[7,-155],[24,-151],[29,-112],[17,-91],[1,-96]],coat);
      line(ctx,-19,-148,-36,-112,coat,15);line(ctx,-36,-112,-23,-83,'#d4c5bf',10);
      line(ctx,19,-148,38,-128,coat,14);line(ctx,38,-128,37,-145,'#daccc4',9);
      poly(ctx,[[-6,-168],[7,-169],[10,-154],[-1,-150]],'#d1b8aa');
      ctx.fillStyle='#d7c5bc';ctx.beginPath();ctx.ellipse(1,-186,15,20,-.1,0,Math.PI*2);ctx.fill();
      const hair=a.id==='doyun'?'#273e55':'#5c3c42';poly(ctx,[[-17,-187],[-14,-205],[1,-210],[16,-201],[18,-185],[7,-184],[0,-194],[-6,-170],[-18,-160]],hair);poly(ctx,[[-17,-191],[-8,-174],[-11,-132],[-28,-141]],hair);
      line(ctx,13,-187,17,-185,'#302c37',2);line(ctx,-9,-157,13,-119,'#d8e4e84d',2);
      if(a.id==='harin'){line(ctx,37,-143,85,-205,'#dce8f1',4);line(ctx,27,-136,46,-150,'#d4aa70',4);}
      else{ctx.strokeStyle='#b0f4e3';ctx.lineWidth=2;ctx.beginPath();ctx.arc(39,-147,10,0,Math.PI*2);ctx.stroke();line(ctx,31,-139,53,-158,'#c5ffee',1);}
    }else{
      const body=a.type==='boss'?'#8f778f':'#a5947c';
      line(ctx,-10,-65,-13,-30,'#706a70',12);line(ctx,-13,-30,-25,-3,body,10);line(ctx,10,-65,19,-31,'#706a70',12);line(ctx,19,-31,28,-2,body,10);line(ctx,-25,-2,-35,0,'#524c56',8);line(ctx,27,-2,37,0,'#524c56',8);
      poly(ctx,[[-22,-128],[15,-129],[24,-100],[10,-68],[-12,-68],[-27,-105]],body);poly(ctx,[[-8,-119],[12,-115],[10,-80],[-8,-84]],'#544f5d');
      line(ctx,-20,-119,-38,-95,body,11);line(ctx,-38,-95,-46,-65,'#746d70',8);line(ctx,19,-121,38,-104,body,11);line(ctx,38,-104,52,-86,'#746d70',8);
      ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(-1,-148,14,19,.12,0,Math.PI*2);ctx.fill();poly(ctx,[[-13,-151],[8,-157],[12,-144],[-6,-138]],'#554d5e');line(ctx,-7,-148,4,-149,'#f3b1bf',3);
      poly(ctx,[[-5,-109],[4,-117],[12,-106],[3,-96]],'#ef879e');
      if(a.type==='boss'){ctx.strokeStyle='#bda5db';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-145,29,0,Math.PI*2);ctx.stroke();}
    }
    if(a.bound){ctx.strokeStyle='#8ce2d9';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(0,-110+i*16,a.side===0?36:31,10,-.25,0,Math.PI*2);ctx.stroke();}}
    ctx.restore();
    // Status remains readable instead of scaling with the distant model.
    ctx.save();if(a.hp<=0)ctx.globalAlpha=.35;const bar=wBar(p.scale);ctx.fillStyle='#08121cd9';ctx.fillRect(p.x-bar/2,p.y+9,bar,5);ctx.fillStyle=a.side===0?'#a1ddcc':'#ed9dab';ctx.fillRect(p.x-bar/2,p.y+9,bar*Math.max(0,a.hp)/a.max,5);ctx.textAlign='center';ctx.font='11px "Malgun Gothic",sans-serif';ctx.fillStyle='#e2ebf3';ctx.fillText(a.name,p.x,p.y+28);ctx.font='10px "Malgun Gothic",sans-serif';ctx.fillStyle='#aebfca';ctx.fillText(`${a.hp}/${a.max}${a.shield?' · 보호 '+a.shield:''}`,p.x,p.y+43);ctx.restore();
  }
  function wBar(scale){return Math.max(50,Math.min(92,scale*76));}
  function draw(ctx,{width:w,height:h,dock,actors,animation,particles,intents,time,cards}){const l=layout(w,h,dock);ctx.clearRect(0,0,w,h);background(ctx,l);
    for(const intent of intents){const units=actors.filter(a=>a.side===0&&a.hp>0&&a.lane===intent.lane);if(intent.kind!=='area')continue;for(const a of units){const p=project(a,actors,w,h,dock);ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#e5809930';ctx.strokeStyle='#e79caf77';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,70*p.scale,19*p.scale,-.1,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}}
    const posed=actors.map(a=>{let p=project(a,actors,w,h,dock);const anim=animation,progress=anim?Math.min(1,Math.max(0,(time-anim.start)/anim.duration)):0;
      if(anim?.e.from===a.id&&anim.to&&['cast','basic','enemy'].includes(anim.e.kind)){const d=Object.values(cards).find(c=>c.name===anim.e.name),attack=anim.e.kind!=='cast'||d?.kind==='attack';if(attack){const f=Math.sin(progress*Math.PI)*.87;p={...p,x:p.x+((anim.to.x+(a.side===0?-45:45))-p.x)*f,y:p.y+(anim.to.y-p.y)*f,scale:p.scale+((anim.to.scale||p.scale)-p.scale)*f};}}
      if(anim&&['advance','return'].includes(anim.e.kind)&&anim.e.from===a.id&&anim.moveFrom&&anim.moveTo){const f=progress*progress*(3-2*progress);p={...p,x:anim.moveFrom.x+(anim.moveTo.x-anim.moveFrom.x)*f,y:anim.moveFrom.y+(anim.moveTo.y-anim.moveFrom.y)*f};}
      if(anim?.e.kind==='move'&&anim.e.to===a.id&&anim.moveFrom&&anim.moveTo){const f=progress*progress*(3-2*progress);p={...p,x:anim.moveFrom.x+(anim.moveTo.x-anim.moveFrom.x)*f,y:anim.moveFrom.y+(anim.moveTo.y-anim.moveFrom.y)*f,scale:anim.moveFrom.scale+(anim.moveTo.scale-anim.moveFrom.scale)*f};}
      return {a,p};});
    posed.sort((x,y)=>x.p.y-y.p.y).forEach(({a,p})=>figure(ctx,a,p,time));
    if(animation?.from&&animation?.to){const {e,from,to}=animation,p=Math.min(1,(time-animation.start)/animation.duration);if(e.kind==='cast'&&!Object.values(cards).some(c=>c.name===e.name&&c.kind==='attack'))line(ctx,from.x+20*from.scale,from.y-145*from.scale,to.x,to.y-95*to.scale,'#a9efdd',2+Math.sin(p*Math.PI)*2);if(e.kind==='hit'){ctx.strokeStyle=e.source==='enemy'?'#fba5b5':'#fae1ab';ctx.lineWidth=3;ctx.beginPath();ctx.arc(to.x,to.y-95*to.scale,10+p*33,0,Math.PI*2);ctx.stroke();}}
    for(const p of particles){const t=(time-p.start)/950;ctx.globalAlpha=1-t;ctx.fillStyle=p.color;ctx.font='bold 19px "Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y-t*40);}ctx.globalAlpha=1;
  }
  window.TacticalStage={project,draw};
})();
