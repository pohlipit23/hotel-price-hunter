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
test('contract v3 captureStatus distinguishes observed-empty from unavailable and preserves legacy receipts', () => {
 const data = replay(); data.dropSetVersion = 'drops-v3';
 Object.assign(data.watch, { revision: 3, code: data.code, contentVersion: data.snapshotVersion, dropSetVersion: data.dropSetVersion });
 data.capture = { status: 'observed', capturedAt: data.watch.firstCheck.checkedAt };
 data.watch.firstCheck.captureStatus = 'observed';
 assert.equal(replayResult(data).status, 'completed');
 for (const captureStatus of ['not-searched', 'failed', 'observed-empty']) {
  const bad = structuredClone(data); bad.watch.firstCheck.captureStatus = captureStatus;
  assert.equal(replayResult(bad).status, 'unavailable', captureStatus);
 }
 const empty = structuredClone(data); empty.options = []; empty.watch.firstCheck.dropOptionIds = [];
 empty.capture.status = 'observed-empty'; empty.watch.firstCheck.captureStatus = 'observed-empty';
 assert.equal(replayResult(empty).status, 'empty');
 const mismatch = structuredClone(empty); mismatch.capture.status = 'observed';
 assert.equal(replayResult(mismatch).status, 'unavailable');
});

test('comparison badges compare the displayed room type, meal plan and cancellation flag against the starting option',()=>{
 const baseline={room:{name:'Superior Twin',board:'Breakfast'},freeCancellation:true};
 assert.deepEqual(comparisonLabels(baseline,{roomName:'Deluxe Twin',board:'Breakfast',freeCancellation:false}),
  {room:'Different',meals:'Same',cancellation:'Different'});
 assert.deepEqual(comparisonLabels(baseline,{roomName:' superior twin ',board:' breakfast ',freeCancellation:true}),
  {room:'Same',meals:'Same',cancellation:'Same'});
 assert.deepEqual(comparisonLabels(baseline,{roomName:'Superior Twin',board:'Room only',freeCancellation:null}),
  {room:'Same',meals:'Different',cancellation:'Different'});
 // Supplier spellings of the same room type and meal plan read Same; another bed type does not.
 assert.deepEqual(comparisonLabels(baseline,{roomName:'Superior, Twin Beds, City View',board:'BREAKFAST.',freeCancellation:true}),
  {room:'Same',meals:'Same',cancellation:'Same'});
 assert.equal(comparisonLabels(baseline,{roomName:'Superior King',board:'Breakfast',freeCancellation:true}).room,'Different');
});
test('live data populates real drop cards without inventing verified refunds or room equivalence',()=>{
 const view=bookingView(bundle());assert.equal(view.booking.hotel.name,'Hotel');assert.equal(view.offers[0].displaySaving.minor,5000);assert.equal(view.offers[0].displaySaving.isEstimate,true);assert.equal(view.offers[0].equivalence,'unverified');assert.equal(view.offers[0].refundQuote,undefined);
 // Neither room matches and both keep breakfast, so the refundable Drop leads despite the smaller saving.
 assert.deepEqual(view.highlights.map(h=>[h.offer.offerId,h.label]),[['option-1','Best drop'],['option-2','Another drop']]);
 const unknown=bundle();unknown.options[0].estimate.currency='USD';assert.throws(()=>bookingView(unknown));
});
test('the Best drop is the best matched Drop: same room type, then meals, then refundable, then saving',()=>{
 const data=bundle();data.options.push({optionId:'option-3',roomName:'ORIGINAL ROOM (city view)',board:'Room only',freeCancellation:false,estimate:{totalMinor:49000,currency:'AED',isEstimate:true},indicativeDifferenceMinor:1000});
 assert.deepEqual(bookingView(data).highlights.map(h=>[h.offer.offerId,h.label]),[['option-3','Best drop'],['option-1','More flexibility'],['option-2','Another drop']]);
});
test('a contrast Drop that differs in one way stays third behind two perfect matches, even with the biggest saving',()=>{
 const data=bundle();data.baseline.freeCancellation=true;
 const option=(optionId,roomName,totalMinor,extra={})=>({optionId,roomName,board:'Breakfast',freeCancellation:true,estimate:{totalMinor,currency:'AED',isEstimate:true},indicativeDifferenceMinor:50000-totalMinor,...extra});
 for(const contrast of [option('option-c','Original room',40000,{freeCancellation:false}),option('option-c','Original room',40000,{board:'Room only'}),option('option-c','Twin',40000)]){
  data.options=[contrast,option('option-b','ORIGINAL ROOM',47000),option('option-a','Original room',45000)];
  assert.deepEqual(bookingView(data).highlights.map(h=>[h.offer.offerId,h.label]),[['option-a','Best drop'],['option-b','More flexibility'],['option-c','Another drop']]);
  assert.equal(Object.values(comparisonLabels(data.baseline,contrast)).filter(cue=>cue==='Different').length,1);
 }
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
