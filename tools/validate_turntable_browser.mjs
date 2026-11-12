import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));


const outputDir=join(root,'reports','turntable-v1');
await mkdir(outputDir,{recursive:true});
const profile = await mkdtemp(join(tmpdir(), 'dakwar-turntable-chrome-'));
const chrome = process.env.DAKWAR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const mime = { '.html':'text/html', '.glb':'model/gltf-binary', '.hdr':'application/octet-stream',
  '.css':'text/css','.js':'text/javascript', '.json':'application/json' };
const files = new Set(['index.html','viewer.js','viewer.css','model.json','dakwar-turntable-v1.0.glb']);
const vendor = process.env.DAKWAR_THREE_PACKAGE;
const modules = new Set([
  'build/three.module.js','examples/jsm/controls/OrbitControls.js',
  'examples/jsm/loaders/GLTFLoader.js','examples/jsm/loaders/RGBELoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js',
]);
const server = createServer(async (req,res)=>{
  const name = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if (vendor && name.startsWith('three/') && modules.has(name.slice(6))) {
    res.writeHead(200,{'Content-Type':'text/javascript'});
    createReadStream(join(vendor,name.slice(6))).pipe(res);
    return;
  }
  if (name==='favicon.ico') {res.writeHead(204).end();return;}
  if (!files.has(name)) { res.writeHead(404).end(); return; }
  res.writeHead(200,{'Content-Type':mime[extname(name)]});
  const path=join(root,'turntable',name);
  if (name==='index.html') {
    let html=await readFile(path,'utf8');
    if(vendor) html=html.replaceAll('https://cdn.jsdelivr.net/npm/three@0.165.0/','/three/');
    res.end(html);
  } else createReadStream(path).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const page = 'http://127.0.0.1:'+server.address().port+'/?validate';
const browser = spawn(chrome, [
  '--headless=new','--disable-extensions','--no-first-run','--no-default-browser-check','--enable-unsafe-swiftshader',
  '--use-angle=swiftshader','--disable-background-networking','--force-device-scale-factor=1',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
], {stdio:'ignore',windowsHide:true});
const errors=[];
let socket;
try {
  const portFile=join(profile,'DevToolsActivePort');
  for(let i=0;i<100&&!existsSync(portFile);i++) await delay(100);
  const [port]=(await readFile(portFile,'utf8')).split(/\r?\n/);
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const tab=tabs.find(t=>t.type==='page'&&t.url==='about:blank');
  assert(tab,'Chrome did not create a blank test tab');
  socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  let id=0;
  const pending=new Map();
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){
      const {resolve,reject}=pending.get(message.id);
      pending.delete(message.id);
      if(message.error)reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }else if(message.method==='Runtime.exceptionThrown'){
      errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    }else if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error'){
      errors.push(message.params.args.map(a=>a.description||a.value).join(' '));
    }else if(message.method==='Network.loadingFailed'&&!message.params.canceled){
      errors.push(message.params.errorText);
    }
  });
  function send(method,params={}){
    return new Promise((resolve,reject)=>{
      pending.set(++id,{resolve,reject});
      socket.send(JSON.stringify({id,method,params}));
    });
  }
  async function evaluate(expression){
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  }
  async function screenshot(name){
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const {data}=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
    await writeFile(join(outputDir,name),Buffer.from(data,'base64'));
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  const metrics = (width,height,mobile) => send('Emulation.setDeviceMetricsOverride',
    {width,height,deviceScaleFactor:1,mobile});
  await metrics(1200,790,false);
  await send('Page.navigate',{url:page});
  for(let i=0;i<150;i++){
    if(await evaluate('Boolean(window.turntable)')) break;
    if(errors.length) throw new Error(errors.join('\n'));
    await delay(200);
  }
  assert(await evaluate('Boolean(window.turntable)'), 'Viewer did not render');
  const stats = await evaluate(`(() => {
    const {renderer,firstFrameMs} = turntable;
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const resources = performance.getEntriesByType('resource');
    return {firstFrameMs,webgl:gl.getParameter(gl.VERSION),
      renderer:ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
      resources:resources.map(r=>({file:new URL(r.name).pathname,bytes:r.encodedBodySize,ms:r.duration})),
      drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  })()`);
  assert(stats.resources.some(r=>r.file.endsWith('dakwar-turntable-v1.0.glb') && r.bytes > 0));
  await screenshot('desktop-day.png');
  const position = () => evaluate('turntable.camera.position.toArray()');
  const initial = await position();
  const pointer = (type, x, y, button, buttons) => send('Input.dispatchMouseEvent',{type,x,y,button,buttons,clickCount:1});
  await pointer('mousePressed',560,390,'left',1);
  await pointer('mouseMoved',650,415,'none',1);
  await pointer('mouseReleased',650,415,'left',0);
  assert.notDeepEqual(await position(),initial,'Orbit did not change position');
  const oldTarget=await evaluate('turntable.controls.target.toArray()');
  await pointer('mousePressed',560,390,'right',2);
  await pointer('mouseMoved',620,410,'none',2);
  await pointer('mouseReleased',620,410,'right',0);
  assert.notDeepEqual(await evaluate('turntable.controls.target.toArray()'),oldTarget,'Pan did not change target');
  const distance=()=>evaluate('turntable.camera.position.distanceTo(turntable.controls.target)');
  const beforeZoom=await distance();
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:600,y:400,deltaX:0,deltaY:-350});
  await evaluate('new Promise(r=>requestAnimationFrame(r))');
  assert(await distance()<beforeZoom,'Zoom did not move camera closer');
  await evaluate("turntable.ui.preset.value='3';turntable.ui.preset.onchange()");
  assert(await evaluate('turntable.camera.position.y>turntable.controls.target.y'));
  const preset=await position();
  await evaluate('turntable.ui.rotate.click()');
  await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  assert.notDeepEqual(await position(),preset,'Auto rotate did not move camera');
  await evaluate('turntable.ui.resetCamera.click()');
  assert(await evaluate('!turntable.controls.autoRotate'));
  assert((await position()).every((v,i)=>Math.abs(v-initial[i])<1e-5));
  const setEv = value=>evaluate(`turntable.ui.exposure.value='${value}';turntable.ui.exposure.oninput()`);
  const mode = key=>evaluate(`turntable.ui.mode.value='${key}';turntable.ui.mode.onchange();new Promise(r=>requestAnimationFrame(r))`);
  const exposure=()=>evaluate('turntable.renderer.toneMappingExposure');
  await setEv(1);
  await mode('evening');
  assert.equal(await exposure(),1);
  await screenshot('desktop-evening.png');
  await setEv(-1);
  await mode('day');
  assert.equal(await exposure(),2);
  await evaluate('turntable.ui.resetExposure.click()');
  assert.equal(await exposure(),1);
  await mode('evening');
  assert.equal(await exposure(),.5);
  await evaluate('turntable.ui.resetExposure.click()');
  const oldPlane=await evaluate('turntable.plane.constant');
  await evaluate("turntable.ui.cut.click();turntable.ui.height.value='.45';turntable.ui.height.oninput()");
  assert.notEqual(await evaluate('turntable.plane.constant'),oldPlane);
  assert(await evaluate('[...turntable.materials].every(m=>m.clippingPlanes?.length===1)'));
  await evaluate("turntable.ui.preset.value='0';turntable.ui.preset.onchange()");
  await screenshot('desktop-cutaway.png');
  await evaluate('turntable.ui.cut.click();turntable.ui.resetCamera.click()');
  assert(await evaluate('[...turntable.materials].every(m=>!m.clippingPlanes)'));
  if(await evaluate('document.fullscreenEnabled')){
    const r = await send('Runtime.evaluate',{expression:'turntable.ui.fullscreen.click()',userGesture:true});
    assert(!r.exceptionDetails);
    await evaluate('new Promise(r=>requestAnimationFrame(r))');
    assert(await evaluate('Boolean(document.fullscreenElement)'));
    await evaluate('document.exitFullscreen()');
    stats.fullscreen=true;
  }
  await metrics(390,844,true);
  await send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await evaluate('new Promise(r=>requestAnimationFrame(r))');
  assert(await evaluate('document.documentElement.scrollWidth===innerWidth'));
  const beforeTouch=await position();
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:170,y:410}]});
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230,y:450}]});
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.notDeepEqual(await position(),beforeTouch,'Touch orbit did not move camera');
  await evaluate('turntable.ui.resetCamera.click()');
  await screenshot('mobile.png');
  assert.deepEqual(errors,[]);
  stats.controls='desktop orbit/pan/zoom, preset/reset, auto-rotation, mode/EV, cutaway, touch orbit';
  await writeFile(join(outputDir,'browser.json'),JSON.stringify(stats,null,2));
  console.log(stats);
} finally {
  socket?.close();
  browser.kill();
  server.close();
  await delay(500);
  if (dirname(resolve(profile)) === resolve(tmpdir()) && basename(profile).startsWith('dakwar-turntable-chrome-')) {
    await rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
  }
}
