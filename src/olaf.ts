import * as THREE from 'three';

// --- Renderer / Scene / Camera ---
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x19232b);

const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 500);
camera.position.set(0, 1.6, 0); // Olaf eye height

// --- Lighting ---
const dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(3,6,2);
const amb = new THREE.AmbientLight(0xffffff, .35);
scene.add(dir, amb);

// --- Ground (y = 0) ---
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({color:0x2f4f39})
);
ground.rotation.x = -Math.PI/2;
ground.position.y = 0;
scene.add(ground);
const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0); // for precise intersection

// --- Aim plane & raycasting (mouse → aim point in depth) ---
const aimPlaneZ = -24;
const aimPlane = new THREE.Plane(new THREE.Vector3(0,0,1), aimPlaneZ);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const aimPoint = new THREE.Vector3(0,1.6,aimPlaneZ);

// Debug dot to visualize aim intersection
const aimDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.08),
    new THREE.MeshStandardMaterial({color:0xffffaa, emissive:0x222200})
);
scene.add(aimDot);

// --- Axe pool ---
const AXE_POOL = [];
const MAX_AXES = 16;

// Load texture
const texLoader = new THREE.TextureLoader();
const axeTex = texLoader.load("./assets/axe.png");

// Make material (transparent so only axe shape shows)
const axeMat = new THREE.MeshBasicMaterial({
    map: axeTex,
    transparent: true,
    side: THREE.DoubleSide // so we see it from both sides
});

// Geometry (plane, size depends on your image aspect ratio)
const axeGeo = new THREE.PlaneGeometry(0.639, 0.999); // width, height

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
    a.position.y -= 0.1;
    a.rotation.set(0,0,0);
    a.userData.vel = new THREE.Vector3();
    a.userData.prevPos = a.position.clone();
    a.userData.spin = new THREE.Vector3(THREE.MathUtils.randFloat(8,12), 0, 0);
    //a.userData.spin = new THREE.Vector3(0, 10, 0); // spin around Y for a throwing effect
    return a;
}

// --- Targets (simple boxes for now) ---
const TARGETS = [];
const targetGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
function makeTarget(){
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.5, 0.6) });
    const m = new THREE.Mesh(targetGeo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.alive = true;
    m.userData.t = Math.random()*Math.PI*2; // phase for wobble
    scene.add(m);
    TARGETS.push(m);
    randomizeTarget(m, true);
    return m;
}
function randomizeTarget(t, initial=false){
    // Spawn somewhere in front of the camera with slight randomness
    t.position.set(
        THREE.MathUtils.randFloatSpread(14),
        0.9 + Math.random()*1.2,
        -THREE.MathUtils.randFloat(12, 60)
    );
    t.scale.setScalar(1);
    t.userData.alive = true;
    t.visible = true;
    if (!initial){
        // give a small HSL nudge so respawns look varied
        t.material.color.offsetHSL((Math.random()*0.2-0.1), 0, 0);
    }
}
// Create a bunch of initial targets
const TARGET_COUNT = 12;
for (let i=0;i<TARGET_COUNT;i++) makeTarget();

// --- Simple ground-hit FX (expanding ring) ---
const FX_POOL = [];
function createGroundRing(){
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
    ring.rotation.x = -Math.PI/2;
    ring.visible = false;
    ring.userData.active = false;
    ring.userData.t = 0;
    scene.add(ring);
    FX_POOL.push(ring);
    return ring;
}
function spawnGroundHit(point){
    let fx = FX_POOL.find(r => !r.userData.active) || createGroundRing();
    fx.position.set(point.x, 0.01, point.z);
    fx.scale.set(1,1,1);
    fx.userData.t = 0;
    fx.userData.active = true;
    fx.visible = true;
}
function updateFX(dt){
    for (const fx of FX_POOL){
        if (!fx.userData.active) continue;
        fx.userData.t += dt;
        const life = 0.45;
        const p = fx.userData.t / life;
        fx.scale.setScalar(1 + p*5.0);
        fx.material.opacity = 0.9 * (1 - p);
        if (p >= 1){
            fx.userData.active = false;
            fx.visible = false;
        }
    }
}

// --- Simple target-hit FX (pop sphere) ---
const POP_POOL = [];
function createPop(){
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 12),
        new THREE.MeshBasicMaterial({
            color: 0xffe066,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })
    );
    mesh.visible = false;
    mesh.userData.active = false;
    mesh.userData.t = 0;
    scene.add(mesh);
    POP_POOL.push(mesh);
    return mesh;
}
function spawnPop(point){
    let fx = POP_POOL.find(p => !p.userData.active) || createPop();
    fx.position.copy(point);
    fx.scale.setScalar(1);
    fx.userData.t = 0;
    fx.userData.active = true;
    fx.visible = true;
}
function updatePops(dt){
    for (const fx of POP_POOL){
        if (!fx.userData.active) continue;
        fx.userData.t += dt;
        const life = 0.35;
        const p = fx.userData.t / life;
        fx.scale.setScalar(1 + p*2.2);
        fx.material.opacity = 1 - p;
        if (p >= 1){
            fx.userData.active = false;
            fx.visible = false;
        }
    }
}

// --- Throw charging parameters ---
const chargeBar = document.querySelector("#charge>i");
let charging = false, tDown = 0;

const CHARGE_MIN_MS = 60;
const CHARGE_MAX_MS = 900;
const V0_MIN = 12;
const V0_MAX = 40;
const UP_BIAS = 0.12;

function screenToAim(x, y){
    ndc.set((x/innerWidth)*2-1, -(y/innerHeight)*2+1);
    raycaster.setFromCamera(ndc, camera);
    const origin = raycaster.ray.origin;
    const dir = raycaster.ray.direction;
    const t = (aimPlane.constant - origin.z) / dir.z;
    aimPoint.copy(origin).addScaledVector(dir, t);
    aimDot.position.copy(aimPoint);
}

// --- Input: mouse/touch ---
addEventListener("mousemove", e => screenToAim(e.clientX, e.clientY), {passive:true});
addEventListener("pointerdown", e => {
    charging = true;
    tDown = performance.now();
    screenToAim(e.clientX, e.clientY);
});
addEventListener("pointerup", e => {
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

    // small spread so it doesn't feel like a laser
    const spread = 0.007;
    axe.userData.vel.x += (Math.random()*2-1)*v0*spread;
    axe.userData.vel.y += (Math.random()*2-1)*v0*spread;

    chargeBar.style.width = "0%";
});

// --- Score ---
const scoreEl = document.getElementById("score");
let score = 0;
function addScore(n){ score += n; scoreEl.textContent = String(score); }

// --- Collision helpers (AABB vs AABB) ---
const axeBox = new THREE.Box3();
const targetBox = new THREE.Box3();

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

    // Idle wobble for alive targets
    for (const t of TARGETS){
        if (!t.userData.alive) continue;
        t.userData.t += dt;
        t.position.x += Math.sin(t.userData.t*2.0) * 0.002; // tiny wiggle
        t.rotation.y += 0.01;
    }

    // Update axes
    for (const axe of AXE_POOL){
        if (!axe.userData.active) continue;

        // Save previous position (for ground-cross check)
        axe.userData.prevPos.copy(axe.position);

        // Basic ballistic motion
        axe.userData.vel.y += GRAVITY * dt * 0.65;
        axe.position.addScaledVector(axe.userData.vel, dt);
        axe.rotation.z -= 6 * dt;

        // --- Target collision (check before ground) ---
        axeBox.setFromObject(axe);
        for (const tgt of TARGETS){
            if (!tgt.userData.alive) continue;
            targetBox.setFromObject(tgt);
            if (axeBox.intersectsBox(targetBox)){
                // Hit! deactivate axe, "remove" target, play FX, add score, schedule respawn
                axe.userData.active = false;
                axe.visible = false;

                tgt.userData.alive = false;
                tgt.visible = false;

                spawnPop(tgt.position);
                addScore(100);

                // Respawn this target after a short delay
                setTimeout(()=> randomizeTarget(tgt), 700);

                // No need to check other targets for this axe
                break;
            }
        }

        // --- Ground hit detection (crossing y = 0) ---
        if (axe.userData.active && axe.userData.prevPos.y >= 0.0 && axe.position.y < 0.0){
            const segment = new THREE.Line3(axe.userData.prevPos, axe.position);
            if (groundPlane.intersectLine(segment, tmpHit)){
                spawnGroundHit(tmpHit);
            } else {
                spawnGroundHit(new THREE.Vector3(axe.position.x, 0, axe.position.z));
            }
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

    // Update effects
    updateFX(dt);
    updatePops(dt);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// --- Resize ---
addEventListener("resize", ()=>{
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
