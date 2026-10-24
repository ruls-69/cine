/** Public-only motion. No business data or operational state. */
export function startCinemaMotion() {
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const button=document.querySelector('.motion-toggle');
  let paused=preference.matches;
  const sync=()=>{
    document.body.classList.toggle('motion-paused',paused);
    button.textContent=paused?'Activar animación':'Pausar animación';
    if(preference.matches) button.textContent='Movimiento reducido';
    button.disabled=preference.matches;
    button.setAttribute('aria-pressed',String(!paused));
    document.dispatchEvent(new CustomEvent('cinema-motion-change',{detail:{paused}}));
  };
  button.addEventListener('click',()=>{paused=!paused;sync();});
  preference.addEventListener('change',()=>{paused=preference.matches;sync();});
  sync();
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries) if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}
  },{threshold:0.12});
  document.querySelectorAll('.section-intro,.experience-content,.candy-content,.cinema-content,.cinema-contact').forEach(node=>{
    node.classList.add('reveal');observer.observe(node);
  });
  let scheduled=false;
  const paint=()=>{
    const distance=document.documentElement.scrollHeight-window.innerHeight;
    document.querySelector('.reading-progress').style.transform=`scaleX(${distance>0?window.scrollY/distance:0})`;
    scheduled=false;
  };
  window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(paint);}},{passive:true});
  window.addEventListener('resize',paint);
  paint();
}
