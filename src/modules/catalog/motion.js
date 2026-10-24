/** Public-only motion; never alters business state. */
export function startCinemaMotion(){
 const button=document.querySelector('.motion-toggle');
 const preference=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=preference.matches;
 const sync=()=>{
  document.body.classList.toggle('motion-paused',paused);
  if(button){button.disabled=preference.matches;button.textContent=preference.matches?'Movimiento reducido':paused?'Activar animación':'Pausar animación';button.setAttribute('aria-pressed',String(!paused));}
 };
 button?.addEventListener('click',()=>{paused=!paused;sync();});
 preference.addEventListener('change',()=>{paused=preference.matches;sync();});
 sync();
 const reveal=document.querySelectorAll('.section-intro,.experience-content,.candy-content,.cinema-content,.cinema-contact');
 if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}}, {threshold:.12});
  for(const item of reveal){item.classList.add('reveal');observer.observe(item);}
 }else for(const item of reveal)item.classList.add('is-revealed');
 let pending=false;
 const draw=()=>{const progress=document.querySelector('.reading-progress');const max=document.documentElement.scrollHeight-innerHeight;if(progress)progress.style.transform=`scaleX(${max>0?scrollY/max:0})`;pending=false;};
 window.addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(draw);}},{passive:true});
 window.addEventListener('resize',draw);
 draw();
}
