import { test, expect } from 'vitest';
import { submitTicketSale } from '../src/modules/ticketing/application.ts';
import { submitCandySale } from '../src/modules/candy/application.ts';
import { PublicCatalogClient } from '../src/modules/catalog/application.ts';

for (const [name, submit] of [['ticket', submitTicketSale], ['candy', submitCandySale]]) {
  test(`${name} retry preserves identity and propagates failure status`, async () => {
    const calls=[];
    const command={action:`${name}_checkout`,branch:'Potosí',requestId:'same-request',lines:[{item:'one',quantity:2,unitPrice:35,seatsPerTicket:1}]};
    const transport=async (url,init)=>{calls.push([url,JSON.parse(init.body)]);return {ok:false,status:503,json:async()=>({error:'Reintenta'})};};
    for(let i=0;i<2;i++) expect(await submit(transport,command)).toEqual({ok:false,status:503,body:{error:'Reintenta'}});
    expect(calls[0]).toEqual(['/api/action',command]);
    expect(calls[1]).toEqual(calls[0]);
  });
  test(`${name} rejects malformed confirmation rather than treating it as completed`, async()=>{
    const command={requestId:'same-request',lines:[{item:'one',quantity:1,unitPrice:35,seatsPerTicket:1}]};
    await expect(submit(async()=>({ok:true,status:200,json:async()=>({order:{id:'one'}})}),command)).rejects.toThrow();
  });
}

test('public catalog encodes branch and validates remote responses',async()=>{
  const calls=[];
  const client=new PublicCatalogClient(async(url)=>{calls.push(url);return {ok:true,status:200,json:async()=>({branch:'Potosí',today:'2026-10-08',movies:[],shows:[]})};});
  expect((await client.catalog('Potosí')).movies).toEqual([]);
  expect(calls).toEqual(['/api/public/catalog?branch=Potos%C3%AD']);
  await expect(client.trailers('Potosí')).rejects.toThrow();
});

test('public catalog retains published combo and social link data',async()=>{
 const client=new PublicCatalogClient(async()=>({ok:true,status:200,json:async()=>({branch:'Potosí',today:'2026-10-24',movies:[],shows:[],combos:[{id:'c1',title:'Combo',description:'Pipocas',price:30,image:'',position:1}],socialLinks:[{platform:'facebook',url:'https://www.facebook.com/cine'}]})}));
 const catalog=await client.catalog('Potosí');
 expect(catalog.combos).toHaveLength(1);
 expect(catalog.combos[0].price).toBe(30);
 expect(catalog.socialLinks[0].platform).toBe('facebook');
});
