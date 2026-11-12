import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
const vector = values => new THREE.Vector3(...values);
const color = value => Array.isArray(value) ? new THREE.Color(...value) : new THREE.Color(value);
const option = (select, label, value) => select.add(new Option(label, value));

async function start() {
  const started = performance.now();
  const configUrl = new URL('./model.json', location.href);
  const resolve = path => new URL(path, configUrl).href;
  const response = await fetch(configUrl);
  if (!response.ok) throw new Error('Configuration could not be loaded');
  const config = await response.json();
  document.title = ui.title.textContent = config.title ?? '3D Turntable';
  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  ui.viewport.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.background ?? '#191613');
  const {scene:model, cameras} = await new GLTFLoader().loadAsync(resolve(config.model));
  model.scale.setScalar(config.scale ?? 1);
  model.rotation.fromArray(config.rotation ?? [0,0,0]);
  scene.add(model);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) throw new Error('Model has no frameable geometry');
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius,.001);
  const cameraConfig = config.camera ?? {};
  const embedded = cameras.find(camera => camera.name === cameraConfig.embedded);
  const camera = new THREE.PerspectiveCamera(cameraConfig.fov ?? embedded?.fov ?? 45, 1, radius/1000, radius*100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = radius*.02;
  controls.maxDistance = radius*25;
  const fit = () => {
    const half = THREE.MathUtils.degToRad(camera.fov/2);
    return radius*1.08/Math.sin(Math.min(half,Math.atan(Math.tan(half)*camera.aspect)));
  };
  function pose(spec) {
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update(0);
    controls.target.copy(spec.target ? vector(spec.target) : sphere.center);
    camera.position.copy(spec.position ? vector(spec.position) :
      controls.target.clone().addScaledVector(vector(spec.direction ?? [1,.65,1]).normalize(), fit()));
    controls.update(0);
    controls.enableDamping = damping;
  }
  function resetCamera() {
    controls.autoRotate = false;
    ui.rotate.setAttribute('aria-pressed','false');
    ui.preset.value = '';
    pose(cameraConfig);
  }
  const presets = config.presets ?? [
    {label:'Overview',direction:[1,.65,1]}, {label:'Front',direction:[0,.25,1]},
    {label:'Side',direction:[1,.25,0]}, {label:'Top',direction:[0,1,.001]}
  ];
  presets.forEach(({label},index) => option(ui.preset,label,index));
  ui.preset.onchange = () => { if(ui.preset.value !== '') pose(presets[Number(ui.preset.value)]); };
  ui.resetCamera.onclick = resetCamera;
  ui.rotate.onclick = () => {
    controls.autoRotate = !controls.autoRotate;
    ui.rotate.setAttribute('aria-pressed', String(controls.autoRotate));
  };
  const plane = new THREE.Plane(new THREE.Vector3(0,-1,0),0);
  const materials = new Set();
  const meshes = [];
  model.traverse(object => {
    if (!object.isMesh) return;
    meshes.push(object);
    for (const material of [object.material].flat()) materials.add(material);
  });
  ui.cutControl.hidden = !config.cutaway?.enabled;
  ui.cut.checked = Boolean(config.cutaway?.enabled && config.cutaway.active);
  ui.height.value = config.cutaway?.height ?? .7;
  function cut() {
    plane.constant = THREE.MathUtils.lerp(bounds.min.y,bounds.max.y,ui.height.valueAsNumber);
    for (const material of materials) {
      const active = Boolean(material.clippingPlanes?.length);
      if(active !== ui.cut.checked) {
        material.clippingPlanes = ui.cut.checked ? [plane] : null;
        material.needsUpdate = true;
      }
    }
  }
  ui.cut.onchange = ui.height.oninput = cut;
  const rig = new THREE.Group();
  scene.add(rig);
  const modes = config.lighting ?? {
    day:{label:'Day',hemisphere:{sky:'#ffffff',ground:'#777777',intensity:2}},
    evening:{label:'Evening',hemisphere:{sky:'#ffe1bc',ground:'#66534a',intensity:1}}
  };
  const ev = {};
  for (const [key,mode] of Object.entries(modes)) {
    option(ui.mode,mode.label ?? key,key);
    ev[key] = mode.exposure ?? 0;
  }
  ui.mode.value = config.defaultMode ?? Object.keys(modes)[0];
  const maps = (config.lightmaps ?? []).map(entry => {
    const mesh = meshes.find(mesh => mesh.name === entry.mesh);
    const channel = entry.channel;
    const attribute = channel === 0 ? 'uv' : 'uv'+channel;
    if (!mesh?.geometry.getAttribute(attribute) || !mesh.material.isMeshStandardMaterial) {
      throw new Error('Invalid lightmap target or channel for '+entry.mesh);
    }
    const original = mesh.material;
    const baked = original.clone();
    baked.aoMap = null;
    baked.lightMapIntensity = entry.intensity ?? Math.PI;
    baked.onBeforeCompile = shader => {
      const chunk = '#include <lights_fragment_maps>';
      shader.fragmentShader = shader.fragmentShader.replace(chunk,'irradiance = vec3(0.0);\n'+chunk);
    };
    baked.customProgramCacheKey = () => 'turntable-replace-ambient-r165';
    materials.add(baked);
    return {entry,mesh,original,baked,textures:new Map()};
  });
  const rgbe = new RGBELoader();
  async function lightmap(target,key) {
    const file = target.entry.modes[key];
    if (!file) return null;
    if (!target.textures.has(file)) {
      target.textures.set(file, rgbe.loadAsync(resolve(file)).then(texture => {
        texture.colorSpace = THREE.LinearSRGBColorSpace;
        texture.channel = target.entry.channel;
        texture.flipY = false;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
      }).catch(error => {
        target.textures.delete(file);
        throw error;
      }));
    }
    return target.textures.get(file);
  }
  function exposure() {
    const value = ev[ui.mode.value];
    ui.exposure.value = value;
    ui.ev.value = value.toFixed(1);
    renderer.toneMappingExposure = (modes[ui.mode.value].baseExposure ?? 1)*2**value;
  }
  let revision = 0;
  async function lighting() {
    const current = ++revision;
    const key = ui.mode.value;
    const {hemisphere,lights=[]} = modes[key];
    const textures = await Promise.all(maps.map(target => lightmap(target,key)));
    if (revision !== current) return;
    rig.clear();
    if (hemisphere) rig.add(new THREE.HemisphereLight(color(hemisphere.sky),color(hemisphere.ground),hemisphere.intensity));
    for (const source of lights) {
      const tint = color(source.color);
      const light = source.type === 'directional' ? new THREE.DirectionalLight(tint,source.intensity) :
        source.type === 'spot' ? new THREE.SpotLight(tint,source.intensity,0,source.angle ?? 1.15,source.penumbra ?? .85) :
          new THREE.PointLight(tint,source.intensity);
      light.position.copy(vector(source.position));
      rig.add(light);
      if (light.target) {
        light.target.position.copy(light.position).add(vector(source.direction ?? [0,-1,0]));
        rig.add(light.target);
      }
    }
    maps.forEach(({mesh,baked,original},index) => {
      baked.lightMap = textures[index];
      baked.needsUpdate = true;
      mesh.material = textures[index] ? baked : original;
    });
    exposure();
    cut();
  }
  ui.mode.onchange = () => lighting().catch(error => { ui.status.textContent = error.message; });
  ui.exposure.oninput = () => { ev[ui.mode.value] = ui.exposure.valueAsNumber; exposure(); };
  ui.resetExposure.onclick = () => { ev[ui.mode.value] = modes[ui.mode.value].exposure ?? 0; exposure(); };
  ui.fullscreen.hidden = !document.fullscreenEnabled;
  ui.fullscreen.onclick = () => {
    const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    action.catch(error => { ui.status.textContent = error.message; });
  };
  function resize() {
    const width = ui.viewport.clientWidth, height = ui.viewport.clientHeight;
    if (!width || !height) return;
    camera.aspect = width/height;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
  }
  new ResizeObserver(resize).observe(ui.viewport);
  resize();
  resetCamera();
  await lighting();
  renderer.render(scene,camera);
  ui.status.textContent = 'Drag to orbit · Scroll or pinch to zoom · Right-drag or two fingers to pan';
  const firstFrameMs = performance.now()-started;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    controls.update(clock.getDelta());
    renderer.render(scene,camera);
  });
  if (new URLSearchParams(location.search).has('validate')) {
    window.turntable = {renderer,scene,camera,controls,plane,materials,ui,model,firstFrameMs};
  }
}
start().catch(error => { ui.status.textContent = error.message; console.error(error); });
