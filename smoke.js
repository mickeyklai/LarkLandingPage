/**
 * smoke.js — WebGL smoke overlay
 *
 * Exact port of https://codepen.io/teolitto/pen/KwOVvL by Teo Litto.
 * Technique: 150 rotating PlaneGeometry meshes sharing one smoke sprite
 * texture, rendered with Three.js into a transparent fixed canvas that
 * sits above the page. Color changed to #276793.
 *
 * Requires: three.js (loaded before this script in the HTML)
 */
(function () {
    'use strict';

    if (typeof THREE === 'undefined') {
        console.warn('smoke.js: THREE is not loaded.');
        return;
    }

    /* Respect reduced-motion preference */
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }

    /* ── Renderer ──────────────────────────────────────────────────────── */
    var renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); /* fully transparent background */

    var canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'z-index:0;pointer-events:none;';
    document.body.appendChild(canvas);

    /* ── Scene & camera ────────────────────────────────────────────────── */
    var scene  = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(
        75, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.z = 1000;
    scene.add(camera);

    /* ── Lighting (Lambert material requires a light source) ───────────── */
    var light = new THREE.DirectionalLight(0xffffff, 0.5);
    light.position.set(-1, 0, 1);
    scene.add(light);

    /* ── Smoke particles ───────────────────────────────────────────────── */
    var smokeParticles = [];

    var loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';

    loader.load(
        'https://s3-us-west-2.amazonaws.com/s.cdpn.io/95637/Smoke-Element.png',
        function (smokeTexture) {
            var smokeMaterial = new THREE.MeshLambertMaterial({
                color      : 0x276793,   /* ← brand colour */
                map        : smokeTexture,
                transparent: true
            });

            var smokeGeo = new THREE.PlaneGeometry(300, 300);

            for (var p = 0; p < 150; p++) {
                var particle = new THREE.Mesh(smokeGeo, smokeMaterial);
                particle.position.set(
                    Math.random() * 500 - 250,
                    Math.random() * 500 - 250,
                    Math.random() * 1000 - 100
                );
                particle.rotation.z = Math.random() * Math.PI * 2;
                scene.add(particle);
                smokeParticles.push(particle);
            }
        }
    );

    /* ── Clock & animation loop ────────────────────────────────────────── */
    var clock = new THREE.Clock();
    var rafId;

    function evolveSmoke(delta) {
        var sp = smokeParticles.length;
        while (sp--) {
            smokeParticles[sp].rotation.z += delta * 0.2;
        }
    }

    function animate() {
        rafId  = requestAnimationFrame(animate);
        var delta = clock.getDelta();
        evolveSmoke(delta);
        renderer.render(scene, camera);
    }

    animate();

    /* ── Resize ────────────────────────────────────────────────────────── */
    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    /* ── Pause when tab is hidden ──────────────────────────────────────── */
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            cancelAnimationFrame(rafId);
            rafId = null;
        } else if (!rafId) {
            rafId = requestAnimationFrame(animate);
        }
    });

}());
