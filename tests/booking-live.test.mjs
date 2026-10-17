import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingView } from '../app/public/booking-live-data.js';
import { createBookingDemoServer } from '../app/booking-demo-server.mjs';
const bundle=()=>({schemaVersion:1,transactionMode:'selection-only',snapshotVersion:'a'.repeat(64),baseline:{sourceType:'quotation',quotationCode:'DEMO-1',hotel:{id:'h',name:'Hotel'},stay:{checkin:'2027-01-21',checkout:'2027-01-22'},occupancy:{adults:2,childAges:[],infantAges:[]},room:{name:'Original room',board:'Breakfast'},quotedRetail:{totalMinor:50000,currency:'AED'},fx:{from:'USD',to:'AED',rate:'3.67'}},options:[{optionId:'option-1',roomName:'Twin',board:'Breakfast',freeCancellation:true,estimate:{totalMinor:45000,currency:'AED',isEstimate:true},indicativeDifferenceMinor:5000},{optionId:'option-2',roomName:'Twin 2',board:'Breakfast',freeCancellation:false,estimate:{totalMinor:30000,currency:'AED',isEstimate:true},indicativeDifferenceMinor:20000}],privateReferences:{'option-1':{rateDetail:'SECRET'},'option-2':{rateDetail:'SECRET'}}});
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
