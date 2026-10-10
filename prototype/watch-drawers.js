'use strict';
(()=>{
  let mounted=null;
  function mount(extras,onChange=()=>{}){
    const drawers=[...extras.querySelectorAll(':scope>details')],known=new Map(drawers.map(d=>[d,false]));
    const notify=d=>{if(known.get(d)===d.open)return;known.set(d,d.open);onChange(d,d.open);};
    const close=(d,restoreFocus=true)=>{d.open=false;notify(d);if(restoreFocus&&d.isConnected)d.querySelector('summary').focus({preventScroll:true});};
    const open=d=>{
      for(const other of drawers)if(other!==d&&other.open)close(other,false);
      d.open=true;notify(d);d.querySelector('.watch-drawer-close').focus({preventScroll:true});
    };
    for(const d of drawers){
      const summary=d.querySelector('summary'),label=summary.textContent,button=document.createElement('button'),body=document.createElement('div'),heading=document.createElement('div'),title=document.createElement('strong');
      summary.textContent=d.classList.contains('watch-cards')?'손패 보기':d.classList.contains('watch-tools')?'실험 도구':label;
      summary.setAttribute('aria-label',label);summary.title=label;
      body.className='watch-drawer-body';body.setAttribute('role','region');title.id='watch-drawer-title-'+drawers.indexOf(d);title.textContent=label;body.setAttribute('aria-labelledby',title.id);
      heading.className='watch-drawer-heading';button.type='button';button.className='watch-drawer-close';button.textContent='닫기 ✕';button.setAttribute('aria-label',label+' 닫기');heading.append(title,button);
      body.append(heading,...[...d.childNodes].filter(n=>n!==summary));d.append(body);
      summary.addEventListener('click',e=>{e.preventDefault();d.open?close(d):open(d);});
      button.addEventListener('click',()=>close(d));
      // Also reconcile programmatic/native toggles, including restored manual sessions.
      d.addEventListener('toggle',()=>{if(!d.isConnected)return;if(d.open){for(const other of drawers)if(other!==d&&other.open)close(other,false);}notify(d);});
    }
    mounted={extras,drawers,close,open};
    for(const d of drawers)if(d.open)open(d);
  }
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||!mounted?.extras.isConnected)return;
    const active=mounted.drawers.find(d=>d.open);if(!active)return;
    e.preventDefault();e.stopImmediatePropagation();mounted.close(active);
  },true);
  window.WatchDrawers={mount,scrollElement:d=>d.querySelector('.watch-drawer-body')||d,open:d=>{if(mounted?.drawers.includes(d))mounted.open(d);}};
})();
