import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { RotateCw, Eye, Sparkles, AlertCircle, RefreshCw, Camera, Check } from 'lucide-react';

interface ModelViewer3DProps {
  fileUrl: string;
  filename: string;
  fileId?: string;
  onSnapshotUpdated?: () => void;
}

export const ModelViewer3D: React.FC<ModelViewer3DProps> = ({
  fileUrl,
  filename,
  fileId,
  onSnapshotUpdated,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const currentModelRef = useRef<THREE.Object3D | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121216);
    sceneRef.current = scene;

    // Grid and ground plane
    const grid = new THREE.GridHelper(10, 20, 0x3f3f46, 0x27272a);
    grid.position.y = -0.01;
    scene.add(grid);
    gridRef.current = grid;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 3.5);
    cameraRef.current = camera;

    // Renderer (preserveDrawingBuffer enables taking high-quality snapshots)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 2.0;
    controlsRef.current = controls;

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight1.position.set(5, 10, 7.5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x60a5fa, 0.8);
    dirLight2.position.set(-5, 5, -5);
    scene.add(dirLight2);

    let isCancelled = false;

    // Load USDZ model
    const loader = new USDZLoader();
    loader.load(
      fileUrl,
      (usdzGroup) => {
        if (isCancelled) return;
        currentModelRef.current = usdzGroup;

        // Auto-center and normalize model bounds
        const box = new THREE.Box3().setFromObject(usdzGroup);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 2 / maxDim : 1;
        usdzGroup.scale.setScalar(scale);

        // Re-center after scaling
        box.setFromObject(usdzGroup);
        box.getCenter(center);
        usdzGroup.position.sub(center);
        usdzGroup.position.y += (box.max.y - box.min.y) / 2;

        scene.add(usdzGroup);
        setLoading(false);
      },
      undefined,
      () => {
        if (isCancelled) return;
        // Fallback for models or demo models
        const fallbackGroup = new THREE.Group();
        const geom = new THREE.TorusKnotGeometry(0.8, 0.28, 100, 16);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.2,
          metalness: 0.8,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = 1.0;
        fallbackGroup.add(mesh);
        scene.add(fallbackGroup);
        currentModelRef.current = fallbackGroup;
        setLoading(false);
      }
    );

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Animation loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [fileUrl]);

  // Handle wireframe toggle
  useEffect(() => {
    if (!currentModelRef.current) return;
    currentModelRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => (m.wireframe = wireframe));
        } else if (child.material) {
          child.material.wireframe = wireframe;
        }
      }
    });
  }, [wireframe]);

  // Handle auto-rotate toggle
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Take snapshot from 3D viewport and update server thumbnail
  const handleCaptureSnapshot = async () => {
    if (!fileId || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    setCapturing(true);

    try {
      // Temporarily hide grid helper for a clean model snapshot
      if (gridRef.current) gridRef.current.visible = false;
      rendererRef.current.render(sceneRef.current, cameraRef.current);

      const dataUrl = rendererRef.current.domElement.toDataURL('image/png');

      // Restore grid
      if (gridRef.current) gridRef.current.visible = true;

      // Send to server
      const res = await fetch(`/file/${fileId}/thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });

      if (res.ok) {
        setSnapshotSaved(true);
        setTimeout(() => setSnapshotSaved(false), 2500);
        onSnapshotUpdated?.();
      }
    } catch (err) {
      console.error('Failed to capture snapshot:', err);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div id="model-3d-viewer-card" className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900/60 shadow-inner flex flex-col">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-20">
          <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
          <span className="text-xs font-medium text-zinc-300">Carregando viewport 3D...</span>
        </div>
      )}

      {/* Header Info */}
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-300 z-10">
        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
        <span className="font-medium truncate max-w-[200px]">{filename}</span>
      </div>

      {/* Control Bar */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md p-1.5 rounded-xl border border-zinc-800 z-10">
        {fileId && (
          <button
            id="btn-capture-snapshot"
            type="button"
            onClick={handleCaptureSnapshot}
            disabled={capturing || loading}
            title="Capturar ângulo atual como nova Thumbnail Snapshot"
            className={`p-2 rounded-lg transition-colors text-xs flex items-center gap-1.5 ${
              snapshotSaved
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {snapshotSaved ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 font-medium text-xs">Salvo!</span>
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Capturar Snapshot</span>
              </>
            )}
          </button>
        )}

        <button
          id="btn-toggle-autorotate"
          type="button"
          onClick={() => setAutoRotate(!autoRotate)}
          title="Alternar rotação automática"
          className={`p-2 rounded-lg transition-colors text-xs flex items-center gap-1 ${
            autoRotate ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Girar</span>
        </button>

        <button
          id="btn-toggle-wireframe"
          type="button"
          onClick={() => setWireframe(!wireframe)}
          title="Alternar modo Wireframe"
          className={`p-2 rounded-lg transition-colors text-xs flex items-center gap-1 ${
            wireframe ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Wireframe</span>
        </button>
      </div>

      {error && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-amber-950/80 border border-amber-800/60 text-amber-200 px-3 py-1.5 rounded-lg text-xs max-w-md z-10">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span className="truncate">{error}</span>
        </div>
      )}
    </div>
  );
};
