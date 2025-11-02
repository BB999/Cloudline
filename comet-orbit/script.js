import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setClearColor(0x02040d, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x010308, 0.0022);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(120, 70, 160);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 40;
controls.maxDistance = 400;
controls.maxPolarAngle = Math.PI * 0.94;
controls.target.set(0, 0, 0);
controls.update();

const ambient = new THREE.AmbientLight(0x1b2440, 0.2);
scene.add(ambient);

const sun = createSun();
scene.add(sun.group);

const orbit = createOrbitPath();
scene.add(orbit);

const comet = createComet();
scene.add(comet.group);

const stars = createStarfield();
scene.add(stars);

const clock = new THREE.Clock();
let trueAnomaly = 0;

const cometState = {
  eccentricity: 0.7,
  semiMajorAxis: 90,
  baseAngularVelocity: 0.32,
  tilt: new THREE.Euler(THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(45), THREE.MathUtils.degToRad(-10)),
  focusDistance: 0,
  orbitMatrix: new THREE.Matrix4(),
};

const semiMinorAxis = () =>
  cometState.semiMajorAxis * Math.sqrt(1 - cometState.eccentricity ** 2);

cometState.focusDistance = Math.sqrt(
  Math.max(cometState.semiMajorAxis ** 2 - semiMinorAxis() ** 2, 0)
);
cometState.orbitMatrix.makeRotationFromEuler(cometState.tilt);

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const velocityFactor = 1 + cometState.eccentricity * Math.cos(trueAnomaly);
  trueAnomaly +=
    delta * cometState.baseAngularVelocity * Math.pow(Math.max(velocityFactor, 0.12), 1.2);
  if (trueAnomaly > Math.PI * 2) {
    trueAnomaly -= Math.PI * 2;
  }

  const position = getOrbitPosition(trueAnomaly);
  comet.body.position.copy(position);
  comet.coma.position.copy(position);
  updateTail(comet.tail, position);

  const distanceToSun = position.length();
  comet.material.emissiveIntensity = THREE.MathUtils.lerp(1.4, 3.8, 1 - distanceToSun / (cometState.semiMajorAxis * 1.8));
  comet.coma.material.opacity = THREE.MathUtils.lerp(0.15, 0.65, 1 - distanceToSun / (cometState.semiMajorAxis * 1.6));

  comet.tail.material.size = THREE.MathUtils.lerp(1.2, 2.4, 1 - distanceToSun / (cometState.semiMajorAxis * 1.6));

  sun.group.rotation.y += delta * 0.04;
  sun.coronaMaterial.uniforms.time.value += delta * 0.8;
  stars.rotation.y += delta * 0.01;
  stars.rotation.x += delta * 0.002;

  controls.update();
  renderer.render(scene, camera);
}

animate();

function getOrbitPosition(angle) {
  const a = cometState.semiMajorAxis;
  const b = semiMinorAxis();
  const focus = cometState.focusDistance;

  const local = new THREE.Vector3(
    a * Math.cos(angle) - focus,
    0,
    b * Math.sin(angle)
  );
  return local.applyMatrix4(cometState.orbitMatrix);
}

function createSun() {
  const group = new THREE.Group();

  const coreGeometry = new THREE.SphereGeometry(14, 64, 64);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffe572 });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);

  const glowGeometry = new THREE.SphereGeometry(24, 64, 64);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff4c8,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);

  const coronaGeometry = new THREE.SphereGeometry(40, 32, 32);
  const coronaMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(0xffaa33) },
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      uniform vec3 color;
      uniform float time;
      void main() {
        float fresnel = pow(max(0.0, 0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 1.8);
        float pulse = 0.7 + 0.3 * sin(time * 0.8 + dot(vNormal, vNormal) * 4.0);
        gl_FragColor = vec4(color, 1.0) * fresnel * pulse;
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const corona = new THREE.Mesh(coronaGeometry, coronaMaterial);

  const light = new THREE.PointLight(0xffe9b5, 2.4, 0, 2);
  group.add(light);

  group.add(core, glow, corona);
  return { group, coronaMaterial };
}

function createOrbitPath() {
  const points = [];
  const segments = 512;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(getOrbitPosition(angle));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color: 0x418bff,
    dashSize: 6,
    gapSize: 2,
    linewidth: 1,
    transparent: true,
    opacity: 0.6,
  });
  const line = new THREE.LineLoop(geometry, material);
  line.computeLineDistances();
  return line;
}

function createComet() {
  const group = new THREE.Group();

  const bodyGeometry = new THREE.SphereGeometry(2.6, 32, 32);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0f0ff,
    metalness: 0.1,
    roughness: 0.3,
    emissive: 0xbcdfff,
    emissiveIntensity: 2.2,
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);

  const comaTexture = createRadialGradientTexture('#ffffff', '#66bfff');
  const comaMaterial = new THREE.SpriteMaterial({
    map: comaTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coma = new THREE.Sprite(comaMaterial);
  coma.scale.set(20, 20, 20);

  const tail = createCometTail();

  group.add(body, coma, tail);

  return { group, body, coma, tail, material: bodyMaterial };
}

function createCometTail() {
  const tailSegments = 140;
  const positions = new Float32Array(tailSegments * 3);
  const colors = new Float32Array(tailSegments * 3);

  const headColor = new THREE.Color(0xfff6da);
  const tailColor = new THREE.Color(0x2f5bff);
  const dark = new THREE.Color(0x02030a);

  for (let i = 0; i < tailSegments; i++) {
    const t = i / (tailSegments - 1);
    const color = headColor.clone().lerp(tailColor, t).lerp(dark, t * 0.4);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.6,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    opacity: 0.95,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.userData.tailSegments = tailSegments;
  points.userData.positions = positions;

  return points;
}

function updateTail(tail, headPosition) {
  const { tailSegments, positions } = tail.userData;

  for (let i = tailSegments - 1; i > 0; i--) {
    positions[i * 3] = positions[(i - 1) * 3];
    positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
    positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
  }
  positions[0] = headPosition.x;
  positions[1] = headPosition.y;
  positions[2] = headPosition.z;

  tail.geometry.attributes.position.needsUpdate = true;
}

function createRadialGradientTexture(innerHex, outerHex) {
  const size = 256;
  const canvasTexture = document.createElement('canvas');
  canvasTexture.width = size;
  canvasTexture.height = size;
  const ctx = canvasTexture.getContext('2d');

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.05,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, innerHex);
  gradient.addColorStop(0.4, innerHex);
  gradient.addColorStop(1, outerHex);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createStarfield() {
  const starCount = 1800;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);

  const color = new THREE.Color();

  for (let i = 0; i < starCount; i++) {
    const r = 600;
    const theta = Math.acos(THREE.MathUtils.randFloatSpread(2));
    const phi = THREE.MathUtils.randFloatSpread(360) * (Math.PI / 180);
    const radius = r * Math.random() * 0.9 + r * 0.1;

    positions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
    positions[i * 3 + 1] = radius * Math.cos(theta);
    positions[i * 3 + 2] = radius * Math.sin(theta) * Math.sin(phi);

    const t = Math.random();
    color.setHSL(0.58 + t * 0.1, 0.6 - t * 0.5, 0.6 + t * 0.3);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.2,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  return new THREE.Points(geometry, material);
}

window.addEventListener('resize', onWindowResize);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
