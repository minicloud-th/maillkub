import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,scrypt,timingSafeEqual,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const derive=promisify(scrypt), digest=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const options={N:16384,r:8,p:5,maxmem:64*1024*1024};
export async function createApp(config={}){
 const directory=resolve(config.dataDir||process.env.DATA_DIR||'data');mkdirSync(directory,{recursive:true,mode:0o700});
 const keyFile=resolve(directory,'encryption.key');
 let key=config.key||process.env.DATA_ENCRYPTION_KEY;
 if(!key){if(!existsSync(keyFile))writeFileSync(keyFile,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});key=readFileSync(keyFile,'utf8').trim();}
 if(!/^[a-f0-9]{64}$/i.test(key))throw new Error('DATA_ENCRYPTION_KEY must contain 64 hex characters');
 const cryptKey=Buffer.from(key,'hex');
 const encrypt=s=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',cryptKey,iv);return Buffer.concat([iv,c.update(s,'utf8'),c.final(),c.getAuthTag()]).toString('base64');};
 const decrypt=s=>{const b=Buffer.from(s,'base64'),c=createDecipheriv('aes-256-gcm',cryptKey,b.subarray(0,12));c.setAuthTag(b.subarray(-16));return c.update(b.subarray(12,-16),undefined,'utf8')+c.final('utf8');};
 const db=new DatabaseSync(resolve(directory,'maillkub.sqlite'));db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL, canonical TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL,unit_price INTEGER,payload TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,payment_ref TEXT UNIQUE);
 CREATE TABLE IF NOT EXISTS order_emails(canonical TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id));
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),actor TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS limits(bucket TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 const run=(sql,...args)=>db.prepare(sql).run(...args),get=(sql,...args)=>db.prepare(sql).get(...args),all=(sql,...args)=>db.prepare(sql).all(...args);
 const username=s=>typeof s==='string'&&/^[\p{L}\p{M}\p{N}_-]{3,30}$/u.test(s.trim());
 async function addUser(name,password,role='user'){
  if(!username(name)||typeof password!=='string'||password.length<12||password.length>128)throw fail(400,'ชื่อผู้ใช้ 3–30 ตัวอักษร ไม่มีช่องว่าง และรหัสผ่านอย่างน้อย 12 ตัวอักษร');
  const salt=randomBytes(16).toString('hex'),hash=(await derive(password,salt,32,options)).toString('hex');
  const user={id:randomUUID(),username:name.trim(),role};
  try{run('INSERT INTO users VALUES(?,?,?,?,?,?,?)',user.id,user.username,user.username.normalize('NFKC').toLowerCase(),salt,hash,role,new Date().toISOString());}catch(e){if(String(e).includes('UNIQUE'))throw fail(409,'ชื่อผู้ใช้นี้ถูกใช้แล้ว');throw e;}return user;
 }
 if(process.env.ADMIN_USERNAME&&process.env.ADMIN_PASSWORD&&!get('SELECT id FROM users WHERE role=?','admin'))await addUser(process.env.ADMIN_USERNAME,process.env.ADMIN_PASSWORD,'admin');
 const dummySalt=randomBytes(16).toString('hex');
 function limit(bucket,max,period){const now=Date.now();run('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN expires<? THEN 1 ELSE hits+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END',bucket,now+period,now,now);if(get('SELECT hits FROM limits WHERE bucket=?',bucket).hits>max)throw fail(429,'ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองอีกครั้ง');}
 function session(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('maillkub_session='));if(!cookie)return null;return get('SELECT u.id,u.username,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',digest(cookie.slice('maillkub_session='.length)),Date.now())||null;}
 function serialize(row){const o=JSON.parse(row.payload);return {...o,id:row.id,status:row.status,unitPrice:row.unit_price===null?null:row.unit_price/100,created:row.created,updated:row.updated,payout:JSON.parse(decrypt(o.payout)),paymentRef:row.payment_ref,events:all('SELECT action,created FROM events WHERE order_id=? ORDER BY id',row.id)};}
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const dist=resolve(config.dist||'dist');
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  const origin=config.origin||process.env.APP_ORIGIN||`http://localhost:${server.address()?.port||3000}`;
  const secure=new URL(origin).protocol==='https:';
  try{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method))throw fail(405,'Method not allowed');
    let p=resolve(dist,'.'+decodeURIComponent(url.pathname));if(!p.startsWith(dist+sep)&&p!==dist)throw fail(404,'ไม่พบหน้า');
    if(!existsSync(p)||statSync(p).isDirectory()){if(extname(url.pathname))throw fail(404,'ไม่พบไฟล์');p=resolve(dist,'index.html');}
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.jpg':'image/jpeg','.png':'image/png','.json':'application/json'};
    res.setHeader('Content-Type',types[extname(p)]||'application/octet-stream');res.setHeader('Cache-Control',url.pathname.startsWith('/assets/index-')?'public,max-age=31536000,immutable':'no-cache');return res.end(req.method==='HEAD'?undefined:readFileSync(p));
   }
   if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true});
   const user=session(req);
   if(req.method==='GET'&&url.pathname==='/api/me')return send(res,200,{user});
   let body={};
   if(req.method!=='GET'){
    if(req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')throw fail(403,'แหล่งที่มาของคำขอไม่ถูกต้อง');
    if(!String(req.headers['content-type']).startsWith('application/json'))throw fail(415,'ต้องส่งข้อมูล JSON');
    let text='';for await(const part of req){text+=part;if(Buffer.byteLength(text)>10000)throw fail(413,'ข้อมูลมีขนาดใหญ่เกินไป');}try{body=JSON.parse(text||'{}');}catch{throw fail(400,'ข้อมูลไม่ถูกต้อง');}
   }
   const path=url.pathname;
   if(req.method==='POST'&&['/api/signup','/api/login'].includes(path)){
    // Socket IP is authoritative; do not trust forwarded headers from clients.
    limit('auth:'+digest(req.socket.remoteAddress||''),30,15*60000);
    const canonical=String(body.username||'').trim().normalize('NFKC').toLowerCase();limit('name:'+digest(canonical),10,15*60000);
    let account;
    if(path==='/api/signup'){if(body.password!==body.confirm)throw fail(400,'รหัสผ่านไม่ตรงกัน');account=await addUser(body.username,body.password);}
    else{
     const found=get('SELECT * FROM users WHERE canonical=?',canonical);
     const password=typeof body.password==='string'&&body.password.length<=128?body.password:'';
     const hash=await derive(password,found?.salt||dummySalt,32,options);
     if(!found||!timingSafeEqual(hash,Buffer.from(found.hash,'hex')))throw fail(401,'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');account={id:found.id,username:found.username,role:found.role};
    }
    const token=randomBytes(32).toString('hex');run('DELETE FROM sessions WHERE expires<?',Date.now());run('INSERT INTO sessions VALUES(?,?,?)',digest(token),account.id,Date.now()+7*86400000);
    res.setHeader('Set-Cookie',`maillkub_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure?'; Secure':''}`);return send(res,200,{user:account});
   }
   if(req.method==='POST'&&path==='/api/logout'){const token=(req.headers.cookie||'').match(/(?:^|;\s*)maillkub_session=([^;]+)/)?.[1];if(token)run('DELETE FROM sessions WHERE token=?',digest(token));res.setHeader('Set-Cookie',`maillkub_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`);return send(res,200,{ok:true});}
   if(!user)throw fail(401,'กรุณาเข้าสู่ระบบ');
   if(req.method==='GET'&&path==='/api/orders'){return send(res,200,{orders:all('SELECT * FROM orders WHERE user_id=? ORDER BY created DESC',user.id).map(serialize)});}
   if(req.method==='GET'&&path==='/api/admin/orders'){if(user.role!=='admin')throw fail(403,'ไม่มีสิทธิ์');return send(res,200,{orders:all('SELECT * FROM orders ORDER BY created DESC LIMIT 500').map(row=>({...serialize(row),username:get('SELECT username FROM users WHERE id=?',row.user_id).username}))});}
   if(req.method==='POST'&&path==='/api/orders'){
    limit('orders:'+user.id,20,3600000);
    const emails=Array.isArray(body.emails)?body.emails.map(e=>String(e).trim().toLowerCase()):[];
    if(!emails.length||emails.length>10||emails.some(e=>!/^\w[\w.+%-]{0,63}@gmail\.com$/.test(e)))throw fail(400,'กรอกอีเมล Gmail ที่ถูกต้อง 1–10 อีเมล');
    const canonical=emails.map(e=>e.split('@')[0].split('+')[0].replaceAll('.','')+'@gmail.com');
    if(new Set(canonical).size!==emails.length)throw fail(400,'มีอีเมลซ้ำ');
    const payout=body.payout;
    if(!body.consent||!['bank','promptpay'].includes(body.method)||!payout||typeof payout.recipient!=='string'||payout.recipient.trim().length<2||typeof payout.account!=='string'||!/^\d{10,15}$/.test(payout.account)||typeof payout.bank!=='string'||payout.bank.length>80)throw fail(400,'กรอกข้อมูลรับเงินและยืนยันความเป็นเจ้าของให้ครบ');
    if(!['unknown','new','medium','old'].includes(body.age)||typeof body.note!=='string'||body.note.length>180)throw fail(400,'ข้อมูลอายุอีเมลหรือหมายเหตุไม่ถูกต้อง');
    const now=new Date().toISOString(),id='MK-'+randomUUID().slice(0,12).toUpperCase();
    const payload={emails,age:body.age,method:body.method,note:body.note,payout:encrypt(JSON.stringify(payout))};
    db.exec('BEGIN IMMEDIATE');try{run('INSERT INTO orders VALUES(?,?,?,NULL,?,?,?,NULL)',id,user.id,'reviewing',JSON.stringify(payload),now,now);for(const email of canonical)run('INSERT INTO order_emails VALUES(?,?)',email,id);run('INSERT INTO events(order_id,actor,action,created) VALUES(?,?,?,?)',id,user.id,'reviewing',now);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');if(String(e).includes('UNIQUE'))throw fail(409,'มีอีเมลที่อยู่ในรายการแล้ว');throw e;}
    return send(res,201,{order:serialize(get('SELECT * FROM orders WHERE id=?',id))});
   }
   const match=path.match(/^\/api\/orders\/([^/]+)\/action$/);
   if(req.method==='POST'&&match){
    const row=get('SELECT * FROM orders WHERE id=?',match[1]);if(!row||(row.user_id!==user.id&&user.role!=='admin'))throw fail(404,'ไม่พบรายการ');
    let next,price=row.unit_price,ref=null;const admin=user.role==='admin',own=row.user_id===user.id;
    if(body.action==='offer'&&admin&&row.status==='reviewing'){price=Math.round(Number(body.unitPrice)*100);if(!Number.isSafeInteger(price)||price<1||price>10000000)throw fail(400,'ราคาไม่ถูกต้อง');next='offered';}
    if(body.action==='reject'&&admin&&row.status==='reviewing')next='rejected';
    if(body.action==='accept'&&own&&row.status==='offered')next='accepted';
    if(body.action==='cancel'&&own&&['reviewing','offered'].includes(row.status))next='cancelled';
    if(body.action==='record-payment'&&admin&&row.status==='accepted'){ref=String(body.reference||'').trim();if(ref.length<6||ref.length>120||body.confirmTransferred!==true)throw fail(400,'ต้องโอนเงินจริงก่อน และกรอกเลขอ้างอิงธนาคาร');next='paid';}
    if(!next)throw fail(409,'ไม่มีสิทธิ์ทำรายการนี้ หรือสถานะเปลี่ยนไปแล้ว');
    const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{
     const result=run('UPDATE orders SET status=?,unit_price=?,payment_ref=COALESCE(?,payment_ref),updated=? WHERE id=? AND status=?',next,price,ref,now,row.id,row.status);if(result.changes!==1)throw fail(409,'สถานะเปลี่ยนไปแล้ว');
     run('INSERT INTO events(order_id,actor,action,created) VALUES(?,?,?,?)',row.id,user.id,next,now);if(['cancelled','rejected'].includes(next))run('DELETE FROM order_emails WHERE order_id=?',row.id);db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');if(String(e).includes('UNIQUE'))throw fail(409,'เลขอ้างอิงธนาคารนี้ถูกใช้แล้ว');throw e;}
    return send(res,200,{order:serialize(get('SELECT * FROM orders WHERE id=?',row.id))});
   }
   throw fail(404,'ไม่พบ API');
  }catch(e){if(!e.status)console.error('Request failed:',e.code||e.name);send(res,e.status||500,{error:e.status?e.message:'ระบบขัดข้อง กรุณาลองใหม่'});}
 });
 return {server,db,addUser,close:()=>new Promise(r=>server.close(()=>{db.close();r();}))};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 if(process.env.NODE_ENV==='production'&&!/^https:\/\//.test(process.env.APP_ORIGIN||''))throw new Error('Set APP_ORIGIN to your HTTPS origin');
 const app=await createApp();const port=Number(process.env.PORT)||3000;app.server.listen(port,'0.0.0.0',()=>console.log(`Maillkub listening on port ${port}`));
 process.on('SIGTERM',()=>app.close().then(()=>process.exit(0)));
}
