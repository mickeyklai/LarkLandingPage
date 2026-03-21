/**
 * Six textured glass shards: assets/glasses/1.png … 6.png on planes + GSAP motion.
 */
(function () {
  'use strict';

  var root = document.getElementById('glass-shatter-root');
  if (!root) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.remove();
    return;
  }

  if (typeof THREE === 'undefined' || typeof gsap === 'undefined') {
    root.remove();
    return;
  }

  var SHARD_FILES = ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png'];

  function resolveTextureUrl(fileName) {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].getAttribute('src');
      if (src && src.indexOf('shatter-intro.js') !== -1) {
        try {
          var scriptAbs = new URL(src, window.location.href).href;
          var base = scriptAbs.replace(/[^/]+$/, '');
          return new URL('glasses/' + fileName, base).href;
        } catch (e) {
          break;
        }
      }
    }
    try {
      return new URL('assets/glasses/' + fileName, window.location.href).href;
    } catch (e2) {
      return 'assets/glasses/' + fileName;
    }
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var scene = new THREE.Scene();
  scene.background = null;

  var camera = new THREE.PerspectiveCamera(
    52,
    window.innerWidth / Math.max(window.innerHeight, 1),
    0.1,
    1000
  );
  var cameraZ = 12;
  camera.position.z = cameraZ;

  var renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* ACES + toneMapped meshes can crush/almost hide PNG sprites — keep overlay linear */
  renderer.toneMapping = THREE.NoToneMapping;

  root.appendChild(renderer.domElement);
  /* Hidden until we seek past the slow build / early flight — only last segment is shown */
  root.style.opacity = '0';

  var shards = [];
  var shardCount = 0;
  var rafId = 0;
  var texturesToDispose = [];

  function disposeShardGroup(group) {
    var mesh = group.userData.mesh;
    scene.remove(group);
    if (mesh) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      if (mesh.material.map) mesh.material.map.dispose();
    }
  }

  function createTexturedShardGroup(texture, index) {
    var img = texture.image;
    var aspect = img && img.width && img.height ? img.width / img.height : 1;
    var h = 1.85 + (index % 3) * 0.15;
    var w = h * aspect;
    var geo = new THREE.PlaneGeometry(w, h);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    var mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    var group = new THREE.Group();
    group.add(mesh);
    group.userData.mesh = mesh;
    group.userData.baseScale = 1.02 + (index % 4) * 0.06;
    group.rotation.set(
      (Math.random() - 0.5) * 0.45,
      (Math.random() - 0.5) * 0.45,
      Math.random() * Math.PI * 2
    );
    return group;
  }

  function loadTextures(callback) {
    var loader = new THREE.TextureLoader();
    var slot = new Array(SHARD_FILES.length);
    var left = SHARD_FILES.length;

    function finish() {
      left -= 1;
      if (left > 0) return;
      var list = [];
      for (var j = 0; j < slot.length; j++) {
        if (slot[j]) list.push(slot[j]);
      }
      if (list.length === 0) {
        console.warn('glass-shatter: no textures could be loaded (check paths / server)');
        root.remove();
        return;
      }
      callback(list);
    }

    SHARD_FILES.forEach(function (name, i) {
      var url = resolveTextureUrl(name);
      loader.load(
        url,
        function (tex) {
          slot[i] = tex;
          texturesToDispose.push(tex);
          finish();
        },
        undefined,
        function () {
          console.warn('glass-shatter: failed to load ' + url);
          slot[i] = null;
          finish();
        }
      );
    });
  }

  function createShatter(textures) {
    shardCount = textures.length;
    for (var i = 0; i < shardCount; i++) {
      var group = createTexturedShardGroup(textures[i], i);
      group.position.set(
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 0.85,
        -5.5 - Math.random() * 3.2
      );
      group.scale.set(0, 0, 0);
      scene.add(group);
      shards.push(group);
    }
  }

  function animate() {
    rafId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  /** Seconds of the full sequence the user actually sees (end is the rush toward the camera). */
  var VISIBLE_TAIL_SECONDS = 3;
  var EXPLODE_DELAY = 0.7;

  function buildShatterTimeline() {
    var flyDuration = 6.75;
    var fadeDelay = 4.35;
    var fadeDur = 2.65;
    var tl = gsap.timeline({
      paused: true,
      onComplete: teardown
    });

    shards.forEach(function (group, i) {
      var stagger = i * 0.14;
      var t0 = EXPLODE_DELAY + stagger;
      var peakOp = 0.88 + Math.random() * 0.1;
      var bs = group.userData.baseScale || 1;
      var mesh = group.userData.mesh;
      var sx = group.position.x;
      var sy = group.position.y;
      var targetZ = cameraZ - 0.35 - Math.random() * 0.85;
      var targetX = sx + (Math.random() - 0.5) * 3.2;
      var targetY = sy + (Math.random() - 0.5) * 2.6;
      var rx = group.rotation.x + (Math.random() - 0.5) * 6;
      var ry = group.rotation.y + (Math.random() - 0.5) * 6;
      var rz = group.rotation.z + (Math.random() - 0.5) * 6;

      tl.to(
        group.position,
        {
          x: targetX,
          y: targetY,
          z: targetZ,
          duration: flyDuration,
          ease: 'power2.in'
        },
        t0
      );

      tl.fromTo(
        group.scale,
        { x: 0, y: 0, z: 0 },
        { x: bs, y: bs, z: bs, duration: 0.58, ease: 'power2.out' },
        t0
      );

      tl.fromTo(
        mesh.material,
        { opacity: 0 },
        { opacity: peakOp, duration: 0.48, ease: 'power2.out' },
        t0
      );

      tl.to(
        group.rotation,
        {
          x: rx,
          y: ry,
          z: rz,
          duration: flyDuration + 0.5,
          ease: 'power1.inOut'
        },
        t0
      );

      tl.to(
        mesh.material,
        {
          opacity: 0,
          duration: fadeDur,
          ease: 'power2.in',
          onComplete: function () {
            disposeShardGroup(group);
          }
        },
        t0 + fadeDelay
      );
    });

    return tl;
  }

  function teardown() {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    texturesToDispose.forEach(function (t) {
      t.dispose();
    });
    texturesToDispose.length = 0;
    renderer.dispose();
    if (root.parentNode) root.remove();
  }

  function onResize() {
    var w = window.innerWidth;
    var h = Math.max(window.innerHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', onResize);

  loadTextures(function (textures) {
    createShatter(textures);
    animate();
    var tl = buildShatterTimeline();
    var skip = Math.max(0, tl.duration() - VISIBLE_TAIL_SECONDS);
    tl.seek(skip, true);
    root.style.opacity = '1';
    tl.play();
  });
})();
