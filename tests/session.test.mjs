import { test, expect, vi } from 'vitest';
import { SessionClient } from '../src/modules/identity/application.ts';
const reply=(value,status=200)=>({status,ok:status===200,headers:{get:()=> 'etag'},json:async()=>value});
const snapshot=()=>({user:{id:'gerencia',role:'manager',branch:null},branches:['Potosí'],today:'2026-10-08',serverTime:'2026-10-08T10:00',state:{products:[],shows:[],sales:[],reports:[],audits:[],closures:[],log:[],users:[],availability:{}}});

test('a response started before logout cannot restore private data or its ETag',async()=>{
  let release;const client=new SessionClient(path=>path==='/api/state'?new Promise(resolve=>{release=resolve;}):Promise.resolve(reply({ok:true})),vi.fn());
  const pending=client.request('state');await client.request('logout',{});release(reply(snapshot()));
  expect(await pending).toBeNull();expect(client.stateETag).toBe('');
});
test('an old unauthorized response cannot invalidate a newer login',async()=>{
  let release;const expired=vi.fn();const client=new SessionClient(path=>path==='/api/state'?new Promise(resolve=>{release=resolve;}):Promise.resolve(reply({ok:true})),expired);
  const pending=client.request('state');await client.request('login',{});release(reply({error:'Expired'},401));
  expect(await pending).toBeNull();expect(expired).not.toHaveBeenCalled();
});
test('out-of-order polling cannot overwrite newer state',async()=>{
  const releases=[];const client=new SessionClient(()=>new Promise(resolve=>releases.push(resolve)),vi.fn());
  const older=client.request('state'),newer=client.request('state');releases[1](reply(snapshot()));expect(await newer).toEqual(snapshot());releases[0](reply(snapshot()));expect(await older).toBeNull();
});
test('malformed state never becomes cached session data',async()=>{
  const client=new SessionClient(async()=>reply({user:{id:'x'}}),vi.fn());await expect(client.request('state')).rejects.toThrow('datos de sesión inválidos');expect(client.stateETag).toBe('');
});
test('current 401 clears ETag and expires the session',async()=>{
  const expired=vi.fn();let unauthorized=false;const client=new SessionClient(async()=>unauthorized?reply({error:'Expired'},401):reply(snapshot()),expired);
  await client.request('state');expect(client.stateETag).toBe('etag');unauthorized=true;await expect(client.request('state')).rejects.toThrow('Expired');expect(client.stateETag).toBe('');expect(expired).toHaveBeenCalledOnce();
});
