import * as THREE from 'three';

// --- Renderer / Scene / Camera ---
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x19232b);

const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 500);
camera.position.set(0, 1.6, 0); // eye height of Olaf

// --- Lighting ---
const dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(3,6,2);
const amb = new THREE.AmbientLight(0xffffff, .35);
scene.add(dir, amb);

// --- Ground plane (y = 0) ---
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({color:0x2f4f39})
);
ground.rotation.x = -Math.PI/2;
ground.position.y = 0;
scene.add(ground);

// Plane object to compute intersection for ground hits
const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0); // y = 0

// --- Decorative dummy targets (boxes in depth) ---
const decoMat = new THREE.MeshStandardMaterial({color:0x8fb1d1, metalness:.1, roughness:.8});
for (let i=0;i<20;i++){
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.6,0.6), decoMat.clone());
    b.position.set(THREE.MathUtils.randFloatSpread(16), 0.9+Math.random()*1.2, -THREE.MathUtils.randFloat(12, 60));
    b.material.color.offsetHSL(Math.random()*0.2-0.1, 0, 0);
    scene.add(b);
}

// --- Aim plane & raycasting ---
const aimPlaneZ = -24; // distance where the ray hits
const aimPlane = new THREE.Plane(new THREE.Vector3(0,0,1), aimPlaneZ);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(0,0);
const aimPoint = new THREE.Vector3(0,1.6,aimPlaneZ);

// Debug dot for aim intersection
const aimDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.08),
    new THREE.MeshStandardMaterial({color:0xffffaa, emissive:0x222200})
);
scene.add(aimDot);

// --- Axe pool ---
const AXE_POOL = [];
const MAX_AXES = 16;
const axeGeo = new THREE.BoxGeometry(0.18,0.08,0.7);
const axeMat = new THREE.MeshStandardMaterial({color:0xbfc5c8, metalness:.7, roughness:.25});

function getAxe(){
    let a = AXE_POOL.find(x => !x.userData.active);
    if (!a && AXE_POOL.length < MAX_AXES){
        a = new THREE.Mesh(axeGeo, axeMat);
        a.castShadow = true;
        scene.add(a);
        AXE_POOL.push(a);
    }
    if (!a) return null;
    a.userData.active = true;
    a.visible = true;
    a.position.copy(camera.position);
    a.position.y -= 0.2;
    a.rotation.set(0,0,0);
    a.userData.vel = new THREE.Vector3();
    a.userData.prevPos = a.position.clone(); // remember previous position for ground-cross detection
    a.userData.spin = new THREE.Vector3(THREE.MathUtils.randFloat(8,12), 0, 0);
    return a;
}

// --- Throw charging parameters ---
const chargeBar = document.querySelector("#charge>i");
let charging = false, tDown = 0;

const CHARGE_MIN_MS = 60;       // min press time
const CHARGE_MAX_MS = 900;      // max charge time
const V0_MIN = 12;              // min throw speed
const V0_MAX = 40;              // max throw speed
const UP_BIAS = 0.12;           // adds upward force for arcade feel

function screenToAim(x, y){
    ndc.x =  (x / innerWidth) * 2 - 1;
    ndc.y = -(y / innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    const t = (aimPlane.constant - origin.z) / dir.z;
    aimPoint.copy(origin).addScaledVector(dir, t);
    aimDot.position.copy(aimPoint);
}

// --- Input: mouse ---
addEventListener("mousemove", (e)=>screenToAim(e.clientX, e.clientY), {passive:true});
addEventListener("pointerdown", (e)=>{
    charging = true;
    tDown = performance.now();
    screenToAim(e.clientX, e.clientY);
});
addEventListener("pointerup", (e)=>{
    if (!charging) return;
    charging = false;
    const held = Math.min(CHARGE_MAX_MS, Math.max(0, performance.now() - tDown));
    const tNorm = Math.min(1, (held - CHARGE_MIN_MS) / (CHARGE_MAX_MS - CHARGE_MIN_MS));
    const v0 = THREE.MathUtils.lerp(V0_MIN, V0_MAX, tNorm);

    screenToAim(e.clientX, e.clientY);
    const dir = new THREE.Vector3().subVectors(aimPoint, camera.position).normalize();
    dir.y += UP_BIAS; dir.normalize();

    const axe = getAxe(); if (!axe) return;
    axe.position.copy(camera.position).addScaledVector(dir, 0.25);
    axe.userData.prevPos.copy(axe.position);
    axe.userData.vel.copy(dir).multiplyScalar(v0);

    // small spread for non-perfect throws
    const spread = 0.007;
    axe.userData.vel.x += (Math.random()*2-1)*v0*spread;
    axe.userData.vel.y += (Math.random()*2-1)*v0*spread;

    chargeBar.style.width = "0%";
});

// --- Score display (placeholder) ---
const scoreEl = document.getElementById("score");
let score = 0;
function addScore(n){ score+=n; scoreEl.textContent = String(score); }

// --- Simple ground-hit FX pool (expanding ring) ---
const FX_POOL = [];
function createGroundRing(){
    // Ring that grows and fades; additive blending for a nice pop
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.32, 48),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })
    );
    ring.rotation.x = -Math.PI/2; // face upward
    ring.visible = false;
    ring.userData.active = false;
    ring.userData.t = 0;          // lifetime timer
    scene.add(ring);
    FX_POOL.push(ring);
    return ring;
}
function spawnGroundHit(point){
    // Reuse or create a ring
    let fx = FX_POOL.find(r => !r.userData.active) || createGroundRing();
    fx.position.set(point.x, 0.01, point.z); // slightly above ground to avoid z-fighting
    fx.scale.set(1,1,1);
    fx.userData.t = 0;
    fx.userData.active = true;
    fx.visible = true;
}
function updateFX(dt){
    // Animate active rings (grow + fade over ~0.45s)
    for (const fx of FX_POOL){
        if (!fx.userData.active) continue;
        fx.userData.t += dt;
        const life = 0.45;
        const p = fx.userData.t / life;
        fx.scale.setScalar(1 + p*5.0);             // grow
        fx.material.opacity = 0.9 * (1 - p);       // fade out
        if (p >= 1){
            fx.userData.active = false;
            fx.visible = false;
        }
    }
}

// --- Loop / physics ---
const GRAVITY = -9.81;
let last = performance.now();
const tmpHit = new THREE.Vector3();

function tick(now=performance.now()){
    const dt = Math.min(.033, (now-last)/1000); last = now;

    // Update charge bar
    if (charging){
        const p = Math.min(1, (now - tDown) / CHARGE_MAX_MS);
        chargeBar.style.width = (p*100).toFixed(1) + "%";
    }

    // Update axe flight
    for (const axe of AXE_POOL){
        if (!axe.userData.active) continue;

        // Remember previous position for ground-cross detection
        axe.userData.prevPos.copy(axe.position);

        // Gravity and motion
        axe.userData.vel.y += GRAVITY * dt * 0.65;
        axe.position.addScaledVector(axe.userData.vel, dt);
        axe.rotation.x += 10 * dt;

        // Detect crossing the ground plane (prev.y >= 0 and now < 0)
        if (axe.userData.prevPos.y >= 0.0 && axe.position.y < 0.0){
            // Intersect the motion segment with the ground plane for a precise hit point
            const segment = new THREE.Line3(axe.userData.prevPos, axe.position);
            if (groundPlane.intersectLine(segment, tmpHit)){
                spawnGroundHit(tmpHit);
            } else {
                // Fallback: use current XZ with y=0
                spawnGroundHit(new THREE.Vector3(axe.position.x, 0, axe.position.z));
            }

            // Deactivate the axe after it hits the ground
            axe.userData.active = false;
            axe.visible = false;
            continue;
        }

        // Despawn if too far
        if (axe.position.z < -180){
            axe.userData.active = false;
            axe.visible = false;
        }
    }

    // Update FX animations
    updateFX(dt);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// --- Handle resize ---
addEventListener("resize", ()=>{
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
