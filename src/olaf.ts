import * as THREE from 'three';

// --- Renderer/Scene/Camera ---
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x223344);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 500);
camera.position.set(0, 1.6, 0); // Olaf's eye height

// --- Light ---
const light = new THREE.DirectionalLight(0xffffff, 1.0);
light.position.set(3,5,2);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

// --- Ground ---
const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color:0x2b4b2b })
);
ground.rotation.x = -Math.PI/2;
ground.position.y = 0;
scene.add(ground);

// --- Dummy Target ---
const targetGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const targetMat = new THREE.MeshStandardMaterial({ color:0xff5555 });
const target = new THREE.Mesh(targetGeo, targetMat);
resetTarget();
scene.add(target);

function resetTarget() {
    // Spawn between Z= -10 und -25, X between -3 and 3, Y ~1
    target.position.set(THREE.MathUtils.randFloat(-3,3), 1 + Math.random()*0.5, -THREE.MathUtils.randFloat(10,25));
    target.userData.alive = true;
    target.visible = true;
}

// --- Axt-Pool ---
const AXE_POOL = [];
const MAX_AXES = 8;
const axeGeo = new THREE.BoxGeometry(0.2, 0.05, 0.6); // simple Box instead Modell
const axeMat = new THREE.MeshStandardMaterial({ color:0xcccccc, metalness:0.7, roughness:0.2 });

function getAxe() {
    const free = AXE_POOL.find(a => !a.userData.active);
    if (free) { activateAxe(free); return free; }
    if (AXE_POOL.length < MAX_AXES) {
        const axe = new THREE.Mesh(axeGeo, axeMat);
        axe.castShadow = true;
        scene.add(axe);
        AXE_POOL.push(axe);
        activateAxe(axe);
        return axe;
    }
    return null; // no axe available
}

function activateAxe(axe) {
    axe.userData.active = true;
    axe.visible = true;
    axe.position.copy(camera.position);
    axe.position.y -= 0.2; // from chest height
    axe.userData.vel = new THREE.Vector3(0, 0, -18); // to front (−Z)
    axe.userData.spin = new THREE.Vector3(Math.random()*6+6, 0, 0); // spin
}

// --- Input: Klick = Wurf ---
window.addEventListener("pointerdown", () => {
    const axe = getAxe();
    if (!axe) return;
    // Offsets based on mouse position for slight "aiming"
    // (simplified crosshair: center of the screen)
    const spread = 0.02;
    axe.userData.vel.x = (Math.random()*2-1)*spread*18;
    axe.userData.vel.y = (Math.random()*2-1)*spread*18 + 2; // slight arc upwards
});

// --- Score/Timer ---
let score = 0;
let timeLeft = 60;
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
setInterval(() => {
    timeLeft = Math.max(0, timeLeft-1);
    timeEl.textContent = timeLeft;
}, 1000);

// --- Collision (AABB) ---
const targetBox = new THREE.Box3();
const axeBox = new THREE.Box3();

// --- Loop ---
let last = performance.now();
function tick(now=performance.now()) {
    const dt = Math.min(0.033, (now-last)/1000); // cap dt
    last = now;

    // Target wiggles around comically
    if (target.userData.alive) {
        target.position.x += Math.sin(now*0.003)*0.002;
        target.rotation.y += 0.01;
    }

    // update axes
    for (const axe of AXE_POOL) {
        if (!axe.userData.active) continue;
        // simple gravitation
        axe.userData.vel.y += -9.81 * dt * 0.5;
        axe.position.addScaledVector(axe.userData.vel, dt);
        axe.rotation.x += axe.userData.spin.x * dt;

        // collision with target
        if (target.userData.alive) {
            targetBox.setFromObject(target);
            axeBox.setFromObject(axe);
            if (targetBox.intersectsBox(axeBox)) {
                // Hit!
                target.userData.alive = false;
                target.visible = false;
                score += 100;
                scoreEl.textContent = score.toString();
                // Respawn after short time
                setTimeout(resetTarget, 700);
            }
        }

        // Despawn: to width or at ground
        if (axe.position.y < 0 || axe.position.z < -80) {
            axe.userData.active = false;
            axe.visible = false;
        }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Resize
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
