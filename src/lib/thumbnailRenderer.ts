import * as THREE from 'three';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import * as fflate from 'three/examples/jsm/libs/fflate.module.js';

// Cache generated thumbnail data URLs by fileUrl/fileId
const thumbnailCache = new Map<string, string>();

interface QueueItem {
  fileUrl: string;
  filename: string;
  resolve: (dataUrl: string) => void;
}

const queue: QueueItem[] = [];
let isProcessingQueue = false;

// Shared singleton offscreen canvas & renderer to avoid WebGL context limits
let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;
let sharedLoader: USDZLoader | null = null;

function initSharedRenderer(): boolean {
  if (sharedRenderer) return true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;

    sharedRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    sharedRenderer.setSize(256, 256);
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    sharedRenderer.toneMappingExposure = 1.3;

    sharedScene = new THREE.Scene();
    sharedCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    sharedCamera.position.set(1.8, 1.3, 2.4);
    sharedCamera.lookAt(0, 0, 0);

    // Setup 3-point studio lighting
    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    sharedScene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(4, 6, 4);
    sharedScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    fillLight.position.set(-4, 2, -2);
    sharedScene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xa855f7, 0.8);
    rimLight.position.set(0, 5, -4);
    sharedScene.add(rimLight);

    sharedLoader = new USDZLoader();
    return true;
  } catch (e) {
    console.warn('WebGL not available for thumbnail rendering:', e);
    return false;
  }
}

async function renderModelToThumbnail(fileUrl: string, filename: string): Promise<string> {
  // 1. Check if server-side snapshot endpoint exists (e.g. /file/:id/thumbnail)
  if (fileUrl.includes('/file/')) {
    const thumbEndpoint = fileUrl.endsWith('/thumbnail') ? fileUrl : `${fileUrl}/thumbnail`;
    try {
      const resp = await fetch(thumbEndpoint);
      if (resp.ok && resp.headers.get('content-type')?.includes('image')) {
        const blob = await resp.blob();
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        if (dataUrl) return dataUrl;
      }
    } catch {
      // Continue to next extraction method
    }
  }

  // 2. Try extracting embedded thumbnail inside the USDZ archive (Apple USDZ spec thumbnails/thumbnail.png)
  try {
    const usdzResp = await fetch(fileUrl);
    if (usdzResp.ok) {
      const arrayBuffer = await usdzResp.arrayBuffer();
      const unzipped = fflate.unzipSync(new Uint8Array(arrayBuffer));

      // Check priority thumbnail paths
      for (const entryName in unzipped) {
        const lower = entryName.toLowerCase();
        if (
          (lower.includes('thumbnail') || lower.includes('snapshot') || lower.includes('preview')) &&
          (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp'))
        ) {
          const mime = lower.endsWith('.png') ? 'image/png' : 'image/jpeg';
          const blob = new Blob([unzipped[entryName]], { type: mime });
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          if (dataUrl) return dataUrl;
        }
      }

      // Check any image inside the USDZ
      for (const entryName in unzipped) {
        const lower = entryName.toLowerCase();
        if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
          const mime = lower.endsWith('.png') ? 'image/png' : 'image/jpeg';
          const blob = new Blob([unzipped[entryName]], { type: mime });
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          if (dataUrl) return dataUrl;
        }
      }
    }
  } catch (err) {
    console.debug('USDZ embedded thumbnail inspection:', err);
  }

  // 3. Try Three.js USDZLoader offscreen render
  if (initSharedRenderer() && sharedRenderer && sharedScene && sharedCamera && sharedLoader) {
    const modelHolder = new THREE.Group();
    sharedScene.add(modelHolder);

    try {
      const loadedGroup = await new Promise<THREE.Object3D>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timeout loading USDZ'));
        }, 5000);

        sharedLoader!.load(
          fileUrl,
          (group) => {
            clearTimeout(timeoutId);
            resolve(group);
          },
          undefined,
          (err) => {
            clearTimeout(timeoutId);
            reject(err);
          }
        );
      });

      modelHolder.add(loadedGroup);

      const box = new THREE.Box3().setFromObject(loadedGroup);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? 1.7 / maxDim : 1;
      loadedGroup.scale.setScalar(scale);

      box.setFromObject(loadedGroup);
      box.getCenter(center);
      loadedGroup.position.sub(center);

      sharedRenderer.render(sharedScene, sharedCamera);
      const dataUrl = sharedRenderer.domElement.toDataURL('image/png');

      modelHolder.clear();
      sharedScene.remove(modelHolder);
      return dataUrl;
    } catch {
      modelHolder.clear();
      sharedScene.remove(modelHolder);
    }
  }

  // 4. Clean elegant SVG fallback
  return generateFallbackSvgThumbnail(filename);
}

function createProceduralGeometry(filename: string): THREE.Group {
  const group = new THREE.Group();
  const lower = filename.toLowerCase();

  let geom: THREE.BufferGeometry;
  let color = 0x38bdf8; // Sky blue default

  if (lower.includes('suzanne') || lower.includes('monkey')) {
    geom = new THREE.IcosahedronGeometry(0.8, 1);
    color = 0xf59e0b; // Amber
  } else if (lower.includes('male') || lower.includes('person') || lower.includes('standing') || lower.includes('human')) {
    geom = new THREE.CylinderGeometry(0.3, 0.45, 1.4, 16);
    color = 0x10b981; // Emerald
  } else if (lower.includes('torus') || lower.includes('twisted')) {
    geom = new THREE.TorusGeometry(0.7, 0.25, 16, 50);
    color = 0x8b5cf6; // Purple
  } else if (lower.includes('plane') || lower.includes('card')) {
    geom = new THREE.BoxGeometry(1.2, 0.1, 1.2);
    color = 0x06b6d4; // Cyan
  } else if (lower.includes('text')) {
    geom = new THREE.BoxGeometry(1.3, 0.5, 0.3);
    color = 0xec4899; // Pink
  } else {
    geom = new THREE.TorusKnotGeometry(0.65, 0.22, 64, 16);
    color = 0x38bdf8;
  }

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.65,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = 0.3;
  mesh.rotation.y = 0.6;
  group.add(mesh);

  // Add subtle wireframe overlay for tech/3D aesthetic
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.25,
  });
  const wireMesh = new THREE.Mesh(geom, wireMat);
  wireMesh.rotation.copy(mesh.rotation);
  group.add(wireMesh);

  return group;
}

function generateFallbackSvgThumbnail(filename: string): string {
  const ext = filename.split('.').pop()?.toUpperCase() || '3D';
  const nameInitial = filename.charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0284c7" />
        <stop offset="100%" stop-color="#0369a1" />
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="24" fill="#09090b" />
    <rect x="20" y="20" width="120" height="120" rx="20" fill="url(#g)" fill-opacity="0.15" stroke="#0284c7" stroke-width="2" stroke-dasharray="4 4" />
    <text x="80" y="90" font-family="system-ui, sans-serif" font-size="36" font-weight="bold" fill="#38bdf8" text-anchor="middle">${nameInitial}</text>
    <rect x="50" y="112" width="60" height="20" rx="10" fill="#0284c7" fill-opacity="0.3" />
    <text x="80" y="126" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="#e0f2fe" text-anchor="middle">${ext}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;

    if (thumbnailCache.has(item.fileUrl)) {
      item.resolve(thumbnailCache.get(item.fileUrl)!);
      continue;
    }

    try {
      const dataUrl = await renderModelToThumbnail(item.fileUrl, item.filename);
      thumbnailCache.set(item.fileUrl, dataUrl);
      item.resolve(dataUrl);
    } catch {
      const fallback = generateFallbackSvgThumbnail(item.filename);
      thumbnailCache.set(item.fileUrl, fallback);
      item.resolve(fallback);
    }
  }

  isProcessingQueue = false;
}

/**
 * Returns a Promise that resolves with the data URL of the rendered 3D thumbnail.
 */
export function getModelThumbnail(fileUrl: string, filename: string): Promise<string> {
  if (thumbnailCache.has(fileUrl)) {
    return Promise.resolve(thumbnailCache.get(fileUrl)!);
  }

  return new Promise<string>((resolve) => {
    queue.push({ fileUrl, filename, resolve });
    processQueue();
  });
}
