import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
test('real signup, isolation, admin workflow, persistence, and CSRF',async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'maillkub-test-'));
 let app=await createApp({dataDir,origin:'http://localhost'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 let base='http://127.0.0.1:'+app.server.address().port;
 const call=async(path,body,cookie='',origin='http://localhost')=>{const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const signup=await call('/signup',{username:'member_one',password:'long-password-2026',confirm:'long-password-2026'});assert.equal(signup.status,200);assert.match(signup.cookie,/maillkub_session=/);
  assert.equal((await call('/signup',{username:'other',password:'long-password-2026',confirm:'wrong'})).status,400);
  assert.equal((await call('/signup',{username:'MEMBER_ONE',password:'long-password-2026',confirm:'long-password-2026'})).status,409);
  const other=await call('/signup',{username:'member_two',password:'different-long-password',confirm:'different-long-password'});
  assert.equal((await call('/orders')).status,401);
  const body={emails:['my.own.mail@gmail.com'],age:'old',method:'promptpay',note:'',consent:true,payout:{recipient:'Recipient Name',account:'0812345678',bank:''}};
  const created=await call('/orders',body,signup.cookie);assert.equal(created.status,201);const id=created.data.order.id;
  assert.equal((await call('/orders',{...body,emails:['myownmail+test@gmail.com']},signup.cookie)).status,409);
  assert.equal((await call('/orders',body,signup.cookie,'https://evil.invalid')).status,403);
  assert.equal((await call('/orders',undefined,other.cookie)).data.orders.length,0);
  assert.equal((await call('/orders/'+id+'/action',{action:'offer',unitPrice:10},signup.cookie)).status,409);
  assert.equal((await call('/orders/'+id+'/action',{action:'cancel'},other.cookie)).status,404);
  await app.addUser('staff_admin','admin-long-password','admin');
  const admin=await call('/login',{username:'staff_admin',password:'admin-long-password'});assert.equal(admin.status,200);
  assert.equal((await call('/admin/orders',undefined,signup.cookie)).status,403);
  assert.equal((await call('/orders/'+id+'/action',{action:'offer',unitPrice:10},admin.cookie)).data.order.status,'offered');
  assert.equal((await call('/orders/'+id+'/action',{action:'accept'},signup.cookie)).data.order.status,'accepted');
  assert.equal((await call('/orders/'+id+'/action',{action:'record-payment',reference:'BANK-2026-123'},admin.cookie)).status,400);
  const paid=await call('/orders/'+id+'/action',{action:'record-payment',reference:'BANK-2026-123',confirmTransferred:true},admin.cookie);assert.equal(paid.data.order.status,'paid');assert.equal(paid.data.order.events.length,4);
  const raw=app.db.prepare('SELECT payload FROM orders WHERE id=?').get(id).payload;assert.ok(!raw.includes('0812345678'));
  await app.close();app=await createApp({dataDir,origin:'http://localhost'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;
  const saved=await call('/orders',undefined,signup.cookie);assert.equal(saved.data.orders[0].paymentRef,'BANK-2026-123');assert.equal(saved.data.orders[0].payout.account,'0812345678');
  assert.equal((await call('/login',{username:'member_one',password:'wrong-password'})).status,401);
  assert.equal((await call('/logout',{},signup.cookie)).status,200);assert.equal((await call('/orders',undefined,signup.cookie)).status,401);
 }finally{await app.close();rmSync(dataDir,{recursive:true,force:true});}
});
