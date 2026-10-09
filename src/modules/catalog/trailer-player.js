export function startTrailerPlayer(client) {
(()=>{
const screen=document.getElementById('trailer-screen'),branch=document.getElementById('public-branch');
let signature='',request=0,player=null;
function connectSound(){
 const frame=document.getElementById('youtube-trailer');if(!frame||player||!window.YT?.Player)return;
 const button=document.createElement('button');button.type='button';button.className='trailer-sound';button.textContent='Silenciar';button.setAttribute('aria-pressed','true');button.disabled=true;screen.append(button);
 player=new window.YT.Player(frame,{events:{onReady:()=>{button.disabled=false;player.unMute();player.setVolume(80);player.playVideo();},onAutoplayBlocked:()=>{button.disabled=false;button.textContent='Activar sonido';button.setAttribute('aria-pressed','false');},onStateChange:()=>{const audible=!player.isMuted();button.textContent=audible?'Silenciar':'Activar sonido';button.setAttribute('aria-pressed',String(audible));}}});
 button.addEventListener('click',()=>{if(player.isMuted()||player.getPlayerState()!==1){player.unMute();player.setVolume(80);player.playVideo();button.textContent='Silenciar';button.setAttribute('aria-pressed','true');}else{player.mute();button.textContent='Activar sonido';button.setAttribute('aria-pressed','false');}});
}
window.onYouTubeIframeAPIReady=connectSound;
if(document.getElementById('youtube-trailer')){if(window.YT?.Player)connectSound();else{const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';document.head.append(script);}}

if(screen.dataset.initialBranch)branch.value=screen.dataset.initialBranch;
function show(videos){
 const ids=videos.map(v=>v.videoId).join(',');
 if(screen.querySelector('iframe')&&screen.dataset.initialBranch===branch.value&&screen.dataset.initialVideos===ids)return;
 if(!videos.length){screen.replaceChildren();delete screen.dataset.initialVideos;const note=document.createElement('div');note.className='trailer-placeholder';note.textContent='Pronto, nuevas historias para descubrir.';screen.append(note);return;}
 // Load the embed in the original document, avoiding a blocked dynamic frame navigation.
 const url=new URL(location.href);url.searchParams.set('branch',branch.value);location.replace(url.href);
}
async function sync(){const version=++request;try{const data=await client.trailers(branch.value);if(version!==request)return;const next=JSON.stringify(data);if(signature===next)return;signature=next;show(data.trailers);}catch{if(!screen.querySelector('iframe')){screen.textContent='No pudimos cargar los tráileres. Reintentando…';}}}
branch.addEventListener('change',sync);window.addEventListener('storage',e=>{if(e.key==='cinema-content-updated')sync();});sync();setInterval(sync,30000);
})();

}
