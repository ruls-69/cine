import { test, expect } from 'vitest';
import { restorePendingTicket } from '../src/modules/ticketing/application.ts';
import { restorePendingCandy } from '../src/modules/candy/application.ts';
test('persisted baskets reject corrupt JSON and invalid quantities',()=>{
  for(const parse of [restorePendingTicket,restorePendingCandy]){
    expect(parse('{broken')).toBeNull();
    expect(parse(JSON.stringify({requestId:'long-enough',lines:[{item:'a',quantity:-1,unitPrice:20,seatsPerTicket:1}]}))).toBeNull();
    expect(parse(JSON.stringify({lines:[]}))).toBeNull();
  }
});
test('retry restores request identity and quoted prices',()=>{
  const ticket={requestId:'existing-request',lines:[{item:'show',quantity:2,unitPrice:35,seatsPerTicket:2,title:'Película'}],received:70};
  expect(restorePendingTicket(JSON.stringify(ticket))).toEqual(ticket);
  const candy={requestId:'existing-candy',lines:[{item:'product',quantity:1,unitPrice:12,name:'Agua'}]};
  expect(restorePendingCandy(JSON.stringify(candy))).toEqual(candy);
});
