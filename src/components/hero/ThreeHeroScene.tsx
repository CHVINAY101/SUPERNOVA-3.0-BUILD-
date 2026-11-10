import { useEffect, useRef, useState } from "react";

export const ThreeHeroScene: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    // Check constraints: prefers-reduced-motion or mobile touch devices < 768px
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth < 768;

    if (prefersReducedMotion || isMobile || !window.THREE) {
      setUseFallback(true);
      return;
    }

    const THREE = window.THREE;
    let renderer: any;
    let scene: any;
    let camera: any;
    let animId: number;
    let isVisible = true;

    // Mouse coordinates (normalized -1 to 1)
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // Handle visibility (pause when tab hidden or off-screen)
    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting && !document.hidden;
    });

    if (mountRef.current) {
      observer.observe(mountRef.current);
    }

    try {
      const container = mountRef.current;
      if (!container) return;

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      // 1. Scene & Camera
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 0, 16);

      // 2. Renderer with transparent background and max devicePixelRatio = 2
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      container.appendChild(renderer.domElement);

      // 3. Studio Lighting (No harsh glow/bloom, clean soft studio key & rim lights)
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
      keyLight.position.set(12, 16, 14);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xebe6ff, 0.5);
      fillLight.position.set(-14, -8, 10);
      scene.add(fillLight);

      const rimLight = new THREE.PointLight(0xc8f500, 1.2, 30);
      rimLight.position.set(0, 12, -4);
      scene.add(rimLight);

      // 4. Glossy Objects in Left and Right Thirds only (center column remains totally clear)
      // Left Third Objects:
      // A: Glossy Electric-Blue Sphere
      const sphereGeo1 = new THREE.SphereGeometry(1.6, 64, 64);
      const sphereMat1 = new THREE.MeshStandardMaterial({
        color: 0x1719c9,
        roughness: 0.12,
        metalness: 0.15,
      });
      const blueSphere = new THREE.Mesh(sphereGeo1, sphereMat1);
      blueSphere.position.set(-6.2, 2.2, -1);
      scene.add(blueSphere);

      // B: Orange Torus
      const torusGeo = new THREE.TorusGeometry(1.4, 0.45, 32, 64);
      const torusMat = new THREE.MeshStandardMaterial({
        color: 0xff6b00,
        roughness: 0.18,
        metalness: 0.1,
      });
      const orangeTorus = new THREE.Mesh(torusGeo, torusMat);
      orangeTorus.position.set(-5.6, -2.4, 1.2);
      orangeTorus.rotation.set(0.6, 0.4, 0);
      scene.add(orangeTorus);

      // Right Third Objects:
      // C: Lime Rounded Cube
      const cubeGeo = new THREE.BoxGeometry(2.1, 2.1, 2.1);
      const cubeMat = new THREE.MeshStandardMaterial({
        color: 0xc8f500,
        roughness: 0.2,
        metalness: 0.08,
      });
      const limeCube = new THREE.Mesh(cubeGeo, cubeMat);
      limeCube.position.set(6.2, 1.8, -0.5);
      limeCube.rotation.set(0.4, 0.8, 0.2);
      scene.add(limeCube);

      // D: Small Magenta Sphere
      const sphereGeo2 = new THREE.SphereGeometry(1.0, 48, 48);
      const sphereMat2 = new THREE.MeshStandardMaterial({
        color: 0xe6007a,
        roughness: 0.14,
        metalness: 0.12,
      });
      const magentaSphere = new THREE.Mesh(sphereGeo2, sphereMat2);
      magentaSphere.position.set(5.5, -2.2, 2);
      scene.add(magentaSphere);

      // 5. Four Flowing Ribbons (TubeGeometry along animated Catmull-Rom curves in lower third)
      const ribbonColors = [0xe6007a, 0xff6b00, 0xc8f500, 0x8438ff];
      const ribbons: { mesh: any; points: any[]; curve: any }[] = [];

      ribbonColors.forEach((color, idx) => {
        const yOffset = -3.8 - idx * 0.45;
        const zOffset = -2 - idx * 0.8;
        const points = [
          new THREE.Vector3(-14, yOffset - 0.8, zOffset),
          new THREE.Vector3(-7, yOffset + 0.6, zOffset + 0.5),
          new THREE.Vector3(0, yOffset - 0.4, zOffset),
          new THREE.Vector3(7, yOffset + 0.8, zOffset - 0.5),
          new THREE.Vector3(14, yOffset - 0.5, zOffset),
        ];

        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.24, 12, false);
        const tubeMat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.22,
          metalness: 0.25,
        });

        const ribbonMesh = new THREE.Mesh(tubeGeo, tubeMat);
        scene.add(ribbonMesh);
        ribbons.push({ mesh: ribbonMesh, points, curve });
      });

      // 6. Animation Loop
      let clock = new THREE.Clock();

      const animate = () => {
        animId = requestAnimationFrame(animate);

        if (!isVisible) return;

        const time = clock.getElapsedTime();

        // Smooth cursor lerp
        mouse.x += (mouse.targetX - mouse.x) * 0.05;
        mouse.y += (mouse.targetY - mouse.y) * 0.05;

        // Rotate & gently float 3D objects
        blueSphere.rotation.y = time * 0.25;
        blueSphere.rotation.x = time * 0.15;
        blueSphere.position.y = 2.2 + Math.sin(time * 0.8) * 0.25 + mouse.y * 0.4;
        blueSphere.position.x = -6.2 + Math.cos(time * 0.6) * 0.2 - mouse.x * 0.5;

        orangeTorus.rotation.x = time * 0.4;
        orangeTorus.rotation.y = time * 0.3;
        orangeTorus.position.y = -2.4 + Math.cos(time * 0.9) * 0.3 + mouse.y * 0.5;
        orangeTorus.position.x = -5.6 + Math.sin(time * 0.7) * 0.25 - mouse.x * 0.6;

        limeCube.rotation.x = time * 0.35;
        limeCube.rotation.y = time * 0.45;
        limeCube.position.y = 1.8 + Math.sin(time * 0.7 + 1) * 0.3 + mouse.y * 0.45;
        limeCube.position.x = 6.2 + Math.cos(time * 0.5 + 1) * 0.2 - mouse.x * 0.5;

        magentaSphere.position.y = -2.2 + Math.cos(time * 1.1) * 0.2 + mouse.y * 0.6;
        magentaSphere.position.x = 5.5 + Math.sin(time * 0.9) * 0.2 - mouse.x * 0.6;

        // Wave motion on ribbons
        ribbons.forEach((rib, rIdx) => {
          rib.mesh.rotation.z = Math.sin(time * 0.5 + rIdx) * 0.04;
          rib.mesh.position.y = Math.sin(time * 0.6 + rIdx) * 0.15 + mouse.y * 0.2;
          rib.mesh.position.x = mouse.x * 0.3;
        });

        renderer.render(scene, camera);
      };

      animate();

      const handleResize = () => {
        if (!container || !renderer || !camera) return;
        const newW = container.clientWidth;
        const newH = container.clientHeight;
        camera.aspect = newW / newH;
        camera.updateProjectionMatrix();
        renderer.setSize(newW, newH);
      };

      window.addEventListener("resize", handleResize);

      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("resize", handleResize);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        observer.disconnect();

        if (renderer && renderer.domElement && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
          renderer.dispose();
        }
      };
    } catch {
      setUseFallback(true);
    }
  }, []);

  if (useFallback) {
    return (
      <div className="three-canvas-container pointer-events-none select-none opacity-85">
        <svg viewBox="0 0 1440 900" className="w-full h-full" fill="none">
          {/* Left Decorative 3D Spheres & Shapes */}
          <circle cx="220" cy="280" r="85" fill="#1719C9" opacity="0.9" />
          <circle cx="180" cy="560" r="60" fill="#FF6B00" opacity="0.9" />
          {/* Right Decorative 3D Shapes */}
          <rect x="1220" y="240" width="130" height="130" rx="28" fill="#C8F500" stroke="#151535" strokeWidth="3" />
          <circle cx="1280" cy="620" r="70" fill="#E6007A" opacity="0.9" />
        </svg>
      </div>
    );
  }

  return <div ref={mountRef} className="three-canvas-container" aria-hidden="true" />;
};
