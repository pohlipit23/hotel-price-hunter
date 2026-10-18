import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingView, comparisonLabels, replayResult, currentConfirmation } from '../app/public/booking-live-data.js';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
const bundle=()=>({schemaVersion:1,transactionMode:'selection-only',snapshotVersion:'a'.repeat(64),baseline:{sourceType:'quotation',quotationCode:'DEMO-1',hotel:{id:'h',name:'Hotel'},stay:{checkin:'2027-01-21',checkout:'2027-01-22'},occupancy:{adults:2,childAges:[],infantAges:[]},room:{name:'Original room',board:'Breakfast'},quotedRetail:{totalMinor:50000,currency:'AED'},fx:{from:'USD',to:'AED',rate:'3.67'}},options:[{optionId:'option-1',roomName:'Twin',board:'Breakfast',freeCancellation:true,estimate:{totalMinor:45000,currency:'AED',isEstimate:true},indicativeDifferenceMinor:5000},{optionId:'option-2',roomName:'Twin 2',board:'Breakfast',freeCancellation:false,estimate:{totalMinor:30000,currency:'AED',isEstimate:true},indicativeDifferenceMinor:20000}],privateReferences:{'option-1':{rateDetail:'SECRET'},'option-2':{rateDetail:'SECRET'}}});

function replay(ids = ['option-1']) {
 const data = bundle(); data.code = 'DEMO1';
 data.watch = { armedAt: '2026-10-18T12:00:00Z', minimumSavingMinor: 1000,
  firstCheck: { replayed: true, checkedAt: '2026-10-17T12:00:00Z', dropOptionIds: ids } };
 return data;
}
test('replay authority distinguishes legacy receipts, durable receipts, empty and unavailable', () => {
 const data = replay(); const result = replayResult(data);
 assert.equal(result.status, 'completed'); assert.deepEqual(result.options.map(x => x.optionId), ['option-1']);
 assert.deepEqual(result.capturedAt, ['2026-10-17T12:00:00Z']); assert.equal(result.replayedAt, data.watch.armedAt);
 assert.equal(replayResult(replay([])).status, 'empty');
 assert.equal(replayResult({ ...data, watch: null }).status, 'not-armed');
 for (const mutate of [x => { x.watch.firstCheck = null; }, x => { x.watch.firstCheck.dropOptionIds = ['missing']; },
  x => { x.watch.firstCheck.status = 'unavailable'; }, x => { x.watch.firstCheck.checkedAt = 'bad'; },
  x => { x.watch.firstCheck.dropOptionIds = ['option-1', 'option-1']; }, x => { x.watch.contentVersion = 'old'; },
  x => { x.watch.currency = 'USD'; }, x => { x.watch.firstCheck.thresholdMinor = 2000; }]) {
  const bad = replay(); mutate(bad); assert.equal(replayResult(bad).status, 'unavailable');
 }
 const durable = replay(); Object.assign(durable.watch, { revision: 2, contentVersion: durable.snapshotVersion, dropSetVersion: 'drops-v2', currency: 'AED' });
 Object.assign(durable.watch.firstCheck, { mode: 'captured-replay', status: 'completed', replayedAt: durable.watch.armedAt,
  capturedAt: ['2026-10-17T12:00:00Z'], thresholdMinor: 1000 });
 assert.equal(replayResult(durable).status, 'completed');
});
test('confirmation must still belong to the current receipt and qualifying set', () => {
 const data = replay(); data.confirmation = { optionId: 'option-1', snapshotVersion: data.snapshotVersion,
  reservationCreated: false, quoteModified: false, customerRefund: null };
 assert.equal(currentConfirmation(data), data.confirmation);
 data.watch.firstCheck.dropOptionIds = []; assert.equal(currentConfirmation(data), null);
 data.watch.firstCheck.dropOptionIds = ['option-1']; data.watch.revision = 3;
 data.confirmation.watchRevision = 2; assert.equal(currentConfirmation(data), null);
 data.confirmation.watchRevision = 3; assert.equal(currentConfirmation(data), data.confirmation);
 data.confirmation.reservationCreated = true; assert.equal(currentConfirmation(data), null);
});

test('comparison badges compare the displayed room, meals and cancellation flag against the starting option',()=>{
 const baseline={room:{name:'Superior Twin',board:'Breakfast'},freeCancellation:true};
 assert.deepEqual(comparisonLabels(baseline,{roomName:'Superior Twin Plus',board:'Breakfast',freeCancellation:false}),
  {room:'Different',meals:'Same',cancellation:'Different'});
 assert.deepEqual(comparisonLabels(baseline,{roomName:' superior twin ',board:' breakfast ',freeCancellation:true}),
  {room:'Same',meals:'Same',cancellation:'Same'});
 assert.deepEqual(comparisonLabels(baseline,{roomName:'Superior Twin',board:'Room only',freeCancellation:null}),
  {room:'Same',meals:'Different',cancellation:'Different'});
});
test('live data populates real drop cards without inventing verified refunds or room equivalence',()=>{
 const view=bookingView(bundle());assert.equal(view.booking.hotel.name,'Hotel');assert.equal(view.offers[0].displaySaving.minor,5000);assert.equal(view.offers[0].displaySaving.isEstimate,true);assert.equal(view.offers[0].equivalence,'unverified');assert.equal(view.offers[0].refundQuote,undefined);assert.equal(view.highlights[0].offer.offerId,'option-2');assert.equal(view.highlights[1].offer.offerId,'option-1');
 const unknown=bundle();unknown.options[0].estimate.currency='USD';assert.throws(()=>bookingView(unknown));
});
test('booking entry serves the existing interface and session-protected selection using booking routes',async t=>{
 const server=createBookingDemoServer({bundle:bundle()});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));const origin='http://127.0.0.1:'+server.address().port;
 const root=await(await fetch(origin)).text();assert.match(root,/data-live-booking="true"/);assert.match(root,/id="offers"/);assert.match(root,/id="comparison-saving-stamp"/);assert.doesNotMatch(root,/quotation|quote-|fonts.googleapis/i);
 const response=await fetch(origin+'/api/booking-demo');assert.equal(response.status,200);const data=await response.json();const cookie=response.headers.get('set-cookie').split(';')[0];assert.doesNotMatch(JSON.stringify(data),/SECRET/);
 const body=JSON.stringify({optionId:'option-2',snapshotVersion:data.snapshotVersion,acceptedDemoOnly:true,acceptReducedFlexibility:true});
 const headers={Origin:origin,Cookie:cookie,'X-CSRF-Token':data.csrfToken,'Content-Type':'application/json'};
 assert.equal((await fetch(origin+'/api/booking-demo/confirm',{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body})).status,403);
 const result=await(await fetch(origin+'/api/booking-demo/confirm',{method:'POST',headers,body})).json();assert.equal(result.confirmation.reservationCreated,false);assert.equal(result.confirmation.quoteModified,false);
 for(const path of ['/quotation.js','/api/quotation-demo','/api/book','/api/cancel'])assert.equal((await fetch(origin+path)).status,404);
});
