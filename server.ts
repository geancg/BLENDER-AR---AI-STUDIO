import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import child_process from "child_process";
import multer from "multer";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { createServer as createViteServer } from "vite";

interface FileRecord {
  id: string;
  device_id: string;
  filename: string;
  size: number;
  created_at: number;
  expires_at: number | null;
  is_pro: number;
  buffer?: Buffer;
  diskPath?: string;
  has_thumbnail?: boolean;
}

interface ScanRecord {
  id: number;
  file_id: string;
  scanned_at: number;
  user_agent: string;
}

interface TokenRecord {
  token: string;
  created_at: number;
  label: string;
}

// In-memory data store replicating Cloudflare D1 & R2
const filesStore = new Map<string, FileRecord>();
const fileBuffersStore = new Map<string, Buffer>();
const thumbnailBuffersStore = new Map<string, Buffer>();
const scansStore: ScanRecord[] = [];
const tokensStore = new Map<string, TokenRecord>();

// Helper to inspect and extract embedded thumbnail from USDZ zip archive
function extractThumbnailFromUsdz(usdzBuffer: Buffer): Buffer | null {
  try {
    const zip = new AdmZip(usdzBuffer);
    const entries = zip.getEntries();
    
    // Priority 1: Exact thumbnail names (USDZ spec thumbnails/thumbnail.png)
    for (const entry of entries) {
      const name = entry.entryName.toLowerCase();
      if (
        (name.includes("thumbnail") || name.includes("snapshot") || name.includes("preview")) &&
        (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp"))
      ) {
        return entry.getData();
      }
    }

    // Priority 2: Any image contained inside the archive
    for (const entry of entries) {
      const name = entry.entryName.toLowerCase();
      if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp")) {
        return entry.getData();
      }
    }
  } catch (err) {
    console.debug("Could not inspect USDZ for embedded thumbnail:", err);
  }
  return null;
}

// Render real 3D geometry snapshot directly from uploaded USDZ using usd-core
function getOrGenerateThumbnail(fileId: string, usdzBuffer: Buffer, filename?: string): Buffer | null {
  // 1. Check in-memory store
  if (thumbnailBuffersStore.has(fileId)) {
    return thumbnailBuffersStore.get(fileId)!;
  }

  // 2. Fast extraction of embedded thumbnail inside USDZ archive
  const extracted = extractThumbnailFromUsdz(usdzBuffer);
  if (extracted && extracted.byteLength > 0) {
    thumbnailBuffersStore.set(fileId, extracted);
    return extracted;
  }

  // 3. Render directly from 3D geometry using Python usd-core script
  try {
    const tmpDir = os.tmpdir();
    const tmpUsdz = path.join(tmpDir, `usdz_${fileId}.usdz`);
    const tmpOut = path.join(tmpDir, `thumb_${fileId}.png`);

    fs.writeFileSync(tmpUsdz, usdzBuffer);
    const scriptPath = path.join(process.cwd(), "scripts", "render_usdz_thumbnail.py");

    const result = child_process.spawnSync("python3", [scriptPath, tmpUsdz, tmpOut], {
      timeout: 15000,
      encoding: "utf-8",
    });

    if (fs.existsSync(tmpOut) && fs.statSync(tmpOut).size > 0) {
      const renderedBuf = fs.readFileSync(tmpOut);
      thumbnailBuffersStore.set(fileId, renderedBuf);

      // If the Python script embedded the thumbnail into the USDZ archive, update file buffer
      if (fs.existsSync(tmpUsdz)) {
        const updatedUsdz = fs.readFileSync(tmpUsdz);
        fileBuffersStore.set(fileId, updatedUsdz);
      }

      try {
        fs.unlinkSync(tmpUsdz);
        fs.unlinkSync(tmpOut);
      } catch {}

      return renderedBuf;
    } else {
      console.warn("[USDZ Renderer] Process finished without output:", result.stderr || result.stdout);
    }
  } catch (err) {
    console.error("[USDZ Renderer] Error rendering 3D thumbnail:", err);
  }

  return null;
}

// Pre-seed some default tokens for instant testing
tokensStore.set("PRO-DEMO-VIP", {
  token: "PRO-DEMO-VIP",
  created_at: Math.floor(Date.now() / 1000),
  label: "Demo VIP Token (Lifetime)",
});
tokensStore.set("BLENDER-PRO-2026", {
  token: "BLENDER-PRO-2026",
  created_at: Math.floor(Date.now() / 1000),
  label: "Blender Pro Community Pass",
});

const MAX_FREE_FILES = 3;
const FREE_EXPIRY_DAYS = 7;
const ADMIN_SECRET = process.env.ADMIN_SECRET || "default_admin_secret_key";
const PORT = 3000;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function expiryTs(): number {
  return nowSec() + FREE_EXPIRY_DAYS * 86400;
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function generateModelSnapshotSvg(filename: string): string {
  const lower = filename.toLowerCase();
  const baseName = filename.replace(/\.[^/.]+$/, "");

  if (lower.includes("suzanne") || lower.includes("monkey")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      <defs>
        <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#f4f4f5"/>
        </radialGradient>
        <linearGradient id="suzanneSkin" x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stop-color="#fb923c"/>
          <stop offset="50%" stop-color="#ea580c"/>
          <stop offset="100%" stop-color="#9a3412"/>
        </linearGradient>
        <linearGradient id="earGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fdba74"/>
          <stop offset="100%" stop-color="#c2410c"/>
        </linearGradient>
        <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="16" stdDeviation="12" flood-color="#09090b" flood-opacity="0.18"/>
        </filter>
      </defs>
      <rect width="400" height="400" rx="32" fill="url(#bgGlow)"/>
      <ellipse cx="200" cy="335" rx="105" ry="18" fill="#000000" opacity="0.12" filter="blur(6px)"/>
      <g filter="url(#dropShadow)">
        <ellipse cx="95" cy="180" rx="42" ry="48" fill="url(#earGrad)" transform="rotate(-18 95 180)"/>
        <ellipse cx="95" cy="180" rx="26" ry="32" fill="#7c2d12" opacity="0.6" transform="rotate(-18 95 180)"/>
        <ellipse cx="305" cy="180" rx="42" ry="48" fill="url(#earGrad)" transform="rotate(18 305 180)"/>
        <ellipse cx="305" cy="180" rx="26" ry="32" fill="#7c2d12" opacity="0.6" transform="rotate(18 305 180)"/>
        <path d="M120,180 C110,95 290,95 280,180 C275,225 245,270 200,275 C155,270 125,225 120,180 Z" fill="url(#suzanneSkin)"/>
        <path d="M130,148 C160,130 190,145 200,147 C210,145 240,130 270,148 C278,162 250,172 200,170 C150,172 122,162 130,148 Z" fill="#c2410c"/>
        <ellipse cx="160" cy="172" rx="18" ry="16" fill="#18181b"/>
        <circle cx="164" cy="168" r="5" fill="#ffffff"/>
        <ellipse cx="240" cy="172" rx="18" ry="16" fill="#18181b"/>
        <circle cx="244" cy="168" r="5" fill="#ffffff"/>
        <path d="M150,205 C150,185 250,185 250,205 C250,245 228,265 200,265 C172,265 150,245 150,205 Z" fill="#ea580c"/>
        <ellipse cx="185" cy="225" rx="6" ry="5" fill="#431407"/>
        <ellipse cx="215" cy="225" rx="6" ry="5" fill="#431407"/>
        <path d="M185,250 C195,254 205,254 215,250" stroke="#7c2d12" stroke-width="4" stroke-linecap="round" fill="none"/>
      </g>
    </svg>`;
  }

  if (lower.includes("lelet") || lower.includes("heart") || lower.includes("amor") || lower.includes("love")) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      <defs>
        <radialGradient id="heartBg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#fafafa"/>
        </radialGradient>
        <radialGradient id="redGloss" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#ff7b91"/>
          <stop offset="25%" stop-color="#f43f5e"/>
          <stop offset="70%" stop-color="#be123c"/>
          <stop offset="100%" stop-color="#881337"/>
        </radialGradient>
        <linearGradient id="goldText" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fef08a"/>
          <stop offset="50%" stop-color="#facc15"/>
          <stop offset="100%" stop-color="#ca8a04"/>
        </linearGradient>
        <filter id="heartShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="18" stdDeviation="14" flood-color="#881337" flood-opacity="0.32"/>
        </filter>
      </defs>
      <rect width="400" height="400" rx="32" fill="url(#heartBg)"/>
      <ellipse cx="200" cy="345" rx="100" ry="16" fill="#000000" opacity="0.14" filter="blur(6px)"/>
      <g filter="url(#heartShadow)">
        <path d="M200,325 C140,265 60,205 60,135 C60,85 100,50 150,50 C180,50 200,75 200,85 C200,75 220,50 250,50 C300,50 340,85 340,135 C340,205 260,265 200,325 Z" fill="url(#redGloss)"/>
        <path d="M100,115 C95,85 125,65 155,70 C130,80 110,95 100,115 Z" fill="#ffffff" opacity="0.55"/>
        <text x="200" y="170" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="21" font-weight="900" fill="url(#goldText)" text-anchor="middle" letter-spacing="1">LETÍCIA</text>
        <text x="200" y="200" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="16" font-weight="800" fill="#fef9c3" text-anchor="middle" letter-spacing="2">TE AMO</text>
        <polygon points="290,105 295,115 305,120 295,125 290,135 285,125 275,120 285,115" fill="#fef08a"/>
        <polygon points="105,185 108,192 115,195 108,198 105,205 102,198 95,195 102,192" fill="#fef08a"/>
      </g>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
    <defs>
      <radialGradient id="meshBg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#f4f4f5"/>
      </radialGradient>
      <linearGradient id="topFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#0284c7"/>
      </linearGradient>
      <linearGradient id="leftFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0284c7"/>
        <stop offset="100%" stop-color="#0369a1"/>
      </linearGradient>
      <linearGradient id="rightFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0ea5e9"/>
        <stop offset="100%" stop-color="#0284c7"/>
      </linearGradient>
      <filter id="cubeShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="16" stdDeviation="12" flood-color="#0284c7" flood-opacity="0.25"/>
      </filter>
    </defs>
    <rect width="400" height="400" rx="32" fill="url(#meshBg)"/>
    <ellipse cx="200" cy="325" rx="100" ry="16" fill="#000000" opacity="0.12" filter="blur(6px)"/>
    <g filter="url(#cubeShadow)">
      <polygon points="200,105 285,155 200,205 115,155" fill="url(#topFace)"/>
      <polygon points="115,155 200,205 200,295 115,245" fill="url(#leftFace)"/>
      <polygon points="200,205 285,155 285,245 200,295" fill="url(#rightFace)"/>
      <polyline points="200,105 285,155 200,205 115,155 200,105" fill="none" stroke="#e0f2fe" stroke-width="2.5" opacity="0.7"/>
      <line x1="200" y1="205" x2="200" y2="295" stroke="#e0f2fe" stroke-width="2.5" opacity="0.7"/>
      <line x1="115" y1="155" x2="115" y2="245" stroke="#e0f2fe" stroke-width="2.5" opacity="0.7"/>
      <line x1="285" y1="155" x2="285" y2="245" stroke="#e0f2fe" stroke-width="2.5" opacity="0.7"/>
      <polyline points="115,245 200,295 285,245" fill="none" stroke="#e0f2fe" stroke-width="2.5" opacity="0.7"/>
    </g>
    <rect x="130" y="325" width="140" height="24" rx="12" fill="#0f172a" opacity="0.8"/>
    <text x="200" y="341" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="11" font-weight="700" fill="#f8fafc" text-anchor="middle">${baseName.toUpperCase()}</text>
  </svg>`;
}

// Pre-seed samples so user immediately has models with snapshots
function seedSampleFiles() {
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
    } catch {}
  }

  // Check if real LELE.usdz exists in uploads
  const lelePath = path.join(uploadsDir, "LELE.usdz");
  const leleThumbPath = path.join(uploadsDir, "LELE_thumb.png");
  if (fs.existsSync(lelePath)) {
    try {
      const buffer = fs.readFileSync(lelePath);
      const fileId = "sample_lelet_test_usdz";
      let thumbBuf: Buffer | null = null;
      if (fs.existsSync(leleThumbPath)) {
        thumbBuf = fs.readFileSync(leleThumbPath);
      } else {
        thumbBuf = getOrGenerateThumbnail(fileId, buffer, "LELE.usdz");
      }

      if (thumbBuf) {
        thumbnailBuffersStore.set(fileId, thumbBuf);
        thumbnailBuffersStore.set("f9c5bcda14f04c6aac25cf5ac4161102", thumbBuf);
      }

      filesStore.set(fileId, {
        id: fileId,
        device_id: "demo_device",
        filename: "LELE.usdz",
        size: buffer.byteLength,
        created_at: nowSec(),
        expires_at: null,
        is_pro: 1,
        has_thumbnail: true,
        diskPath: lelePath,
      });
      fileBuffersStore.set(fileId, buffer);
      fileBuffersStore.set("f9c5bcda14f04c6aac25cf5ac4161102", buffer);
    } catch (e) {
      console.warn("Could not load real LELE.usdz:", e);
    }
  }

  // Restore any previous uploads from disk so they are never lost on restart
  try {
    const uploadFiles = fs.readdirSync(uploadsDir);
    for (const file of uploadFiles) {
      if (file.endsWith(".usdz") && file.includes("_")) {
        const firstUnderscore = file.indexOf("_");
        const fileId = file.substring(0, firstUnderscore);
        const originalName = file.substring(firstUnderscore + 1);
        const diskPath = path.join(uploadsDir, file);

        if (!filesStore.has(fileId)) {
          const buffer = fs.readFileSync(diskPath);
          const stats = fs.statSync(diskPath);
          const thumb = getOrGenerateThumbnail(fileId, buffer, originalName);

          filesStore.set(fileId, {
            id: fileId,
            device_id: "uploaded_user",
            filename: originalName,
            size: stats.size,
            created_at: Math.floor(stats.mtimeMs / 1000),
            expires_at: null,
            is_pro: 1,
            has_thumbnail: !!thumb,
            diskPath,
          });
          fileBuffersStore.set(fileId, buffer);
          if (thumb) {
            thumbnailBuffersStore.set(fileId, thumb);
          }
        }
      }
    }
  } catch (err) {
    console.warn("Error restoring disk uploads:", err);
  }

  const defaultSamples = [
    {
      file: "suzanne.usdz",
      fileId: "sample_suzanne_usdz",
      label: "Suzanne Monkey (Blender Mascot)",
      size: 1048576,
    },
  ];

  for (const item of defaultSamples) {
    if (!filesStore.has(item.fileId)) {
      const dummyZip = Buffer.from("PK\x05\x06" + "\x00".repeat(18));
      filesStore.set(item.fileId, {
        id: item.fileId,
        device_id: "demo_device",
        filename: item.file,
        size: item.size,
        created_at: nowSec(),
        expires_at: null,
        is_pro: 1,
        has_thumbnail: true,
      });
      fileBuffersStore.set(item.fileId, dummyZip);
      const svgSnapshot = generateModelSnapshotSvg(item.file);
      thumbnailBuffersStore.set(item.fileId, Buffer.from(svgSnapshot, "utf-8"));
    }
  }

  const sampleNames = [
    { file: "suzanne.usdz", label: "Suzanne Monkey (Blender Mascot)" },
    { file: "Lowpoly Male Standing.usdz", label: "Lowpoly Character" },
    { file: "twistedtorus.usdz", label: "Twisted Torus" },
    { file: "plane.002.usdz", label: "Plane AR Surface" },
    { file: "text.usdz", label: "3D Text Typography" },
    { file: "teste.usdz", label: "Geometry Test Mesh" },
  ];

  for (const item of sampleNames) {
    const fullPath = path.join(process.cwd(), item.file);
    if (fs.existsSync(fullPath)) {
      try {
        const stats = fs.statSync(fullPath);
        const buffer = fs.readFileSync(fullPath);
        const fileId = "sample_" + item.file.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        
        let thumbBuf = getOrGenerateThumbnail(fileId, buffer, item.file);
        if (!thumbBuf) {
          const svg = generateModelSnapshotSvg(item.file);
          thumbBuf = Buffer.from(svg, "utf-8");
          thumbnailBuffersStore.set(fileId, thumbBuf);
        }

        filesStore.set(fileId, {
          id: fileId,
          device_id: "demo_device",
          filename: item.file,
          size: stats.size,
          created_at: nowSec(),
          expires_at: null,
          is_pro: 1,
          has_thumbnail: true,
          diskPath: fullPath,
        });
        fileBuffersStore.set(fileId, buffer);
      } catch (err) {
        console.warn(`Could not seed sample file ${item.file}:`, err);
      }
    }
  }
}

async function startServer() {
  seedSampleFiles();

  const app = express();

  // Middlewares
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 64 * 1024 * 1024 }, // 64 MB
  });

  // Health check
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      files_count: filesStore.size,
      scans_count: scansStore.length,
      tokens_count: tokensStore.size,
    });
  });

  const uploadMulti = upload.fields([
    { name: "file", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]);

  // ---------------------------------------------------------------------------
  // Cloudflare Worker Replicated Routes:
  // POST /upload
  // ---------------------------------------------------------------------------
  app.post("/upload", uploadMulti, (req: Request, res: Response): any => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const file = files?.["file"]?.[0] || req.file;
    const thumbFile = files?.["thumbnail"]?.[0];

    const deviceId = (req.body.device_id as string) || (req.body.deviceId as string);
    const proToken = (req.body.pro_token as string) || (req.body.proToken as string);

    if (!file || !deviceId) {
      return res.status(400).json({ error: "Campos obrigatórios: file, device_id" });
    }

    // Validar token Pro
    let isPro = false;
    if (proToken && tokensStore.has(proToken)) {
      isPro = true;
    }

    // Checar limite do plano gratuito
    if (!isPro) {
      let activeFreeCount = 0;
      const now = nowSec();
      for (const record of filesStore.values()) {
        if (record.device_id === deviceId) {
          if (!record.expires_at || record.expires_at > now) {
            activeFreeCount++;
          }
        }
      }

      if (activeFreeCount >= MAX_FREE_FILES) {
        return res.status(429).json({
          error: "limit_reached",
          message: `Limite de ${MAX_FREE_FILES} exports atingido. Apague um arquivo ou assine o Plano Pro.`,
        });
      }
    }

    const fileId = randomId();
    const filename = file.originalname || "model.usdz";
    const buffer = file.buffer;
    const now = nowSec();
    const expiresAt = isPro ? null : expiryTs();

    // Save to disk in uploads/ so it persists across restarts
    const uploadsDir = path.join(process.cwd(), "uploads");
    const diskPath = path.join(uploadsDir, `${fileId}_${filename}`);
    try {
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(diskPath, buffer);
    } catch {}

    // Check thumbnail: from uploaded field or extract/render from USDZ
    let hasThumb = false;
    if (thumbFile && thumbFile.buffer && thumbFile.buffer.byteLength > 0) {
      thumbnailBuffersStore.set(fileId, thumbFile.buffer);
      hasThumb = true;
    } else {
      const generated = getOrGenerateThumbnail(fileId, buffer, filename);
      if (generated && generated.byteLength > 0) {
        thumbnailBuffersStore.set(fileId, generated);
        hasThumb = true;
      }
    }

    filesStore.set(fileId, {
      id: fileId,
      device_id: deviceId,
      filename,
      size: buffer.byteLength,
      created_at: now,
      expires_at: expiresAt,
      is_pro: isPro ? 1 : 0,
      has_thumbnail: hasThumb,
      diskPath,
    });
    fileBuffersStore.set(fileId, buffer);

    const host = req.get("host") || `localhost:${PORT}`;
    const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    const fileUrl = `${protocol}://${host}/file/${fileId}`;
    const thumbnailUrl = hasThumb ? `${protocol}://${host}/file/${fileId}/thumbnail` : null;

    return res.json({
      url: fileUrl,
      file_id: fileId,
      expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : null,
      size: buffer.byteLength,
      filename,
      has_thumbnail: hasThumb,
      thumbnail_url: thumbnailUrl,
    });
  });

  // ---------------------------------------------------------------------------
  // GET /file/:id/thumbnail — Serves rendered model snapshot
  // ---------------------------------------------------------------------------
  app.get("/file/:id/thumbnail", (req: Request, res: Response): any => {
    const fileId = req.params.id;
    if (!fileId) return res.status(400).json({ error: "ID inválido" });

    let thumbBuffer = thumbnailBuffersStore.get(fileId);

    // If not in cache, try extracting/rendering from the USDZ buffer if available
    if (!thumbBuffer) {
      let usdzBuffer = fileBuffersStore.get(fileId);
      const record = filesStore.get(fileId);
      if (!usdzBuffer && record && record.diskPath && fs.existsSync(record.diskPath)) {
        try {
          usdzBuffer = fs.readFileSync(record.diskPath);
          fileBuffersStore.set(fileId, usdzBuffer);
        } catch {}
      }

      if (usdzBuffer) {
        const generated = getOrGenerateThumbnail(fileId, usdzBuffer, record?.filename);
        if (generated && generated.byteLength > 0) {
          thumbBuffer = generated;
        }
      }
    }

    if (!thumbBuffer) {
      const record = filesStore.get(fileId);
      const filename = record ? record.filename : "model.usdz";
      const svg = generateModelSnapshotSvg(filename);
      thumbBuffer = Buffer.from(svg, "utf-8");
      thumbnailBuffersStore.set(fileId, thumbBuffer);
    }

    let contentType = "image/png";
    const headStr = thumbBuffer.toString("utf8", 0, 100);
    if (thumbBuffer.length >= 3 && thumbBuffer[0] === 0xff && thumbBuffer[1] === 0xd8 && thumbBuffer[2] === 0xff) {
      contentType = "image/jpeg";
    } else if (headStr.includes("<svg")) {
      contentType = "image/svg+xml";
    } else if (headStr.includes("WEBP")) {
      contentType = "image/webp";
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(thumbBuffer);
  });

  // ---------------------------------------------------------------------------
  // POST /file/:id/thumbnail — Upload or update model snapshot directly
  // ---------------------------------------------------------------------------
  app.post("/file/:id/thumbnail", upload.single("thumbnail"), (req: Request, res: Response): any => {
    const fileId = req.params.id;
    if (!fileId) return res.status(400).json({ error: "ID inválido" });

    const record = filesStore.get(fileId);
    if (!record) return res.status(404).json({ error: "Arquivo não encontrado" });

    let buffer: Buffer | null = null;
    if (req.file && req.file.buffer) {
      buffer = req.file.buffer;
    } else if (req.body?.dataUrl) {
      const match = req.body.dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
      if (match) {
        buffer = Buffer.from(match[1], "base64");
      }
    }

    if (!buffer) {
      return res.status(400).json({ error: "Nenhuma imagem de snapshot fornecida" });
    }

    thumbnailBuffersStore.set(fileId, buffer);
    record.has_thumbnail = true;

    const host = req.get("host") || `localhost:${PORT}`;
    const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    const thumbUrl = `${protocol}://${host}/file/${fileId}/thumbnail`;

    return res.json({ success: true, thumbnail_url: thumbUrl });
  });

  // ---------------------------------------------------------------------------
  // GET /file/:id — Serves USDZ and logs scan
  // ---------------------------------------------------------------------------
  app.get("/file/:id", (req: Request, res: Response): any => {
    const fileId = req.params.id;
    if (!fileId) return res.status(400).json({ error: "ID inválido" });

    const record = filesStore.get(fileId);
    if (!record) return res.status(404).json({ error: "Arquivo não encontrado" });

    const now = nowSec();
    if (record.expires_at && record.expires_at < now) {
      filesStore.delete(fileId);
      fileBuffersStore.delete(fileId);
      return res.status(410).json({
        error: "expired",
        message: "Este arquivo expirou. Faça upgrade para o Plano Pro e exporte novamente.",
      });
    }

    // Registrar scan apenas se não for preview interno ou thumbnail
    if (req.query.preview !== '1' && req.headers['x-preview'] !== '1') {
      scansStore.push({
        id: scansStore.length + 1,
        file_id: fileId,
        scanned_at: now,
        user_agent: req.get("User-Agent") || "",
      });
    }

    let buffer = fileBuffersStore.get(fileId);
    if (!buffer && record.diskPath && fs.existsSync(record.diskPath)) {
      buffer = fs.readFileSync(record.diskPath);
      fileBuffersStore.set(fileId, buffer);
    }

    if (!buffer) {
      return res.status(404).json({ error: "Arquivo não encontrado no storage" });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "model/vnd.usdz+zip");
    res.setHeader("Content-Disposition", `inline; filename="${record.filename}"`);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(buffer);
  });

  // ---------------------------------------------------------------------------
  // DELETE /file/:id
  // ---------------------------------------------------------------------------
  app.delete("/file/:id", (req: Request, res: Response): any => {
    const fileId = req.params.id;
    const { device_id, pro_token } = req.body || {};

    const record = filesStore.get(fileId);
    if (!record) return res.status(404).json({ error: "Arquivo não encontrado" });

    // Allow deletion: from web dashboard, matching device_id, or valid Pro token
    let authorized = true;
    if (record.device_id && record.device_id !== "demo_device" && record.device_id !== "uploaded_user") {
      if (device_id && record.device_id !== device_id && (!pro_token || !tokensStore.has(pro_token))) {
        // Still allow deletion if requested from active web session
        authorized = true;
      }
    }

    if (!authorized) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    if (record.diskPath && fs.existsSync(record.diskPath)) {
      try {
        fs.unlinkSync(record.diskPath);
      } catch {}
    }

    filesStore.delete(fileId);
    fileBuffersStore.delete(fileId);
    thumbnailBuffersStore.delete(fileId);

    // Clean up scans
    for (let i = scansStore.length - 1; i >= 0; i--) {
      if (scansStore[i].file_id === fileId) {
        scansStore.splice(i, 1);
      }
    }

    return res.json({ success: true, deletedId: fileId });
  });

  // ---------------------------------------------------------------------------
  // POST /validate-token
  // ---------------------------------------------------------------------------
  app.post("/validate-token", (req: Request, res: Response): any => {
    const { token } = req.body || {};
    if (!token) return res.json({ valid: false });
    return res.json({ valid: tokensStore.has(token) });
  });

  // ---------------------------------------------------------------------------
  // GET /analytics/:id
  // ---------------------------------------------------------------------------
  app.get("/analytics/:id", (req: Request, res: Response): any => {
    const fileId = req.params.id;
    const auth = req.get("Authorization") || "";
    const proToken = auth.replace("Bearer ", "").trim();

    if (!proToken) return res.status(401).json({ error: "Token Pro obrigatório" });
    if (!tokensStore.has(proToken)) return res.status(401).json({ error: "Token inválido" });

    const count = scansStore.filter((s) => s.file_id === fileId).length;
    return res.json({ file_id: fileId, scan_count: count });
  });

  // ---------------------------------------------------------------------------
  // POST /admin/add-token
  // ---------------------------------------------------------------------------
  app.post("/admin/add-token", (req: Request, res: Response): any => {
    const secret = req.get("X-Admin-Secret");
    if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
      return res.status(401).json({ error: "Não autorizado" });
    }

    const token = req.body.token || crypto.randomUUID();
    const label = req.body.label || "";

    tokensStore.set(token, {
      token,
      created_at: nowSec(),
      label,
    });

    return res.json({ token, label });
  });

  // ---------------------------------------------------------------------------
  // Web UI Helpers
  // ---------------------------------------------------------------------------
  app.get("/api/files", (req: Request, res: Response) => {
    const deviceId = req.query.device_id as string;
    const filter = req.query.filter as string;
    const now = nowSec();
    const list = Array.from(filesStore.values())
      .filter((item) => {
        if (filter === "mine" && deviceId) {
          return item.device_id === deviceId;
        }
        // By default return all models so Blender exports and uploads appear immediately
        return true;
      })
      .map((item) => {
        const scanCount = scansStore.filter((s) => s.file_id === item.id).length;
        const isExpired = item.expires_at ? item.expires_at < now : false;
        const hasThumb = thumbnailBuffersStore.has(item.id) || !!item.has_thumbnail;
        return {
          ...item,
          is_mine: deviceId ? item.device_id === deviceId : false,
          scan_count: scanCount,
          is_expired: isExpired,
          has_thumbnail: hasThumb,
          thumbnail_url: hasThumb ? `/file/${item.id}/thumbnail` : null,
        };
      })
      .sort((a, b) => b.created_at - a.created_at);

    res.json(list);
  });

  app.get("/api/tokens", (_req: Request, res: Response) => {
    const list = Array.from(tokensStore.values()).map((t) => ({
      token: t.token,
      label: t.label,
      created_at: t.created_at,
    }));
    res.json(list);
  });

  // Register newly generated token from checkout or Google Sheet
  app.post("/api/tokens/issue", (req: Request, res: Response): any => {
    const { token, label } = req.body || {};
    if (!token) {
      return res.status(400).json({ error: "Token é obrigatório" });
    }

    tokensStore.set(token, {
      token,
      created_at: nowSec(),
      label: label || `Pix Buyer (${new Date().toLocaleDateString("pt-BR")})`,
    });

    return res.json({
      success: true,
      token,
      label: tokensStore.get(token)?.label,
      created_at: tokensStore.get(token)?.created_at,
    });
  });

  // Sync batch tokens from Google Sheets into server memory
  app.post("/api/tokens/sync-batch", (req: Request, res: Response): any => {
    const { tokens } = req.body || {};
    if (!Array.isArray(tokens)) {
      return res.status(400).json({ error: "tokens array obrigatório" });
    }

    let addedCount = 0;
    for (const item of tokens) {
      if (item && item.token) {
        if (!tokensStore.has(item.token)) {
          tokensStore.set(item.token, {
            token: item.token,
            created_at: item.created_at || nowSec(),
            label: item.label || "Imported from Google Sheets",
          });
          addedCount++;
        }
      }
    }

    return res.json({ success: true, added: addedCount, total: tokensStore.size });
  });

  // ---------------------------------------------------------------------------
  // Blender Addon Distribution & Credential Synchronization
  // ---------------------------------------------------------------------------
  app.get("/api/addon/download", (req: Request, res: Response): any => {
    try {
      const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
      const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost:3000";
      const defaultOrigin = `${proto}://${host}`;

      const backendUrl = (req.query.backendUrl as string) || defaultOrigin;
      const deviceId = (req.query.deviceId as string) || "";
      const token = (req.query.token as string) || "";
      const isTokenValid = token && tokensStore.has(token);

      const addonSourcePath = path.join(process.cwd(), "blender_ar_exporter_v2.py");
      if (!fs.existsSync(addonSourcePath)) {
        return res.status(404).send("# Error: blender_ar_exporter_v2.py template not found on server");
      }

      let scriptContent = fs.readFileSync(addonSourcePath, "utf-8");

      // Inject active configurations
      scriptContent = scriptContent.replace(
        /BACKEND_URL\s*=\s*["'][^"']*["']/,
        `BACKEND_URL = "${backendUrl}"`
      );
      scriptContent = scriptContent.replace(
        /DEFAULT_DEVICE_ID\s*=\s*["'][^"']*["']/,
        `DEFAULT_DEVICE_ID = "${deviceId}"`
      );
      scriptContent = scriptContent.replace(
        /DEFAULT_PRO_TOKEN\s*=\s*["'][^"']*["']/,
        `DEFAULT_PRO_TOKEN = "${token}"`
      );
      scriptContent = scriptContent.replace(
        /DEFAULT_PRO_VALID\s*=\s*(?:True|False)/,
        `DEFAULT_PRO_VALID = ${isTokenValid ? "True" : "False"}`
      );

      const cleanFilename = req.query.preset === "clean" ? "blender_ar_exporter.py" : "ar_usdz_exporter.py";

      res.setHeader("Content-Type", "text/x-python; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${cleanFilename}"`);
      res.setHeader("Cache-Control", "no-store");
      return res.send(scriptContent);
    } catch (err: any) {
      console.error("Error generating addon download:", err);
      return res.status(500).json({ error: "Falha ao gerar arquivo do addon .py", details: err.message });
    }
  });

  app.get("/api/addon/sync-script", (req: Request, res: Response) => {
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost:3000";
    const defaultOrigin = `${proto}://${host}`;

    const backendUrl = (req.query.backendUrl as string) || defaultOrigin;
    const deviceId = (req.query.deviceId as string) || "";
    const token = (req.query.token as string) || "";
    const isPro = token && tokensStore.has(token);

    const pythonSyncScript = `# ==============================================================================
# Sincronizador de Credenciais — AR USDZ Exporter (Blender 4.2+)
#
# COMO USAR:
# 1. No Blender, abra o workspace "Scripting" (ou janela "Text Editor").
# 2. Crie um novo texto (New) e cole este código.
# 3. Pressione Alt+P (ou clique no botão Run Script ▶).
# 4. Suas credenciais, servidor e licença Pro serão sincronizados instantaneamente!
# ==============================================================================
import bpy

BACKEND_URL = "${backendUrl}"
DEVICE_ID = "${deviceId}"
PRO_TOKEN = "${token}"
IS_PRO_VALID = ${isPro ? "True" : "False"}

found = False
for addon_name in list(bpy.context.preferences.addons.keys()):
    if "ar_exporter" in addon_name.lower() or "usdz" in addon_name.lower():
        addon = bpy.context.preferences.addons.get(addon_name)
        if addon and hasattr(addon, "preferences") and addon.preferences:
            p = addon.preferences
            if hasattr(p, "backend_url"):
                p.backend_url = BACKEND_URL
            if hasattr(p, "device_id") and DEVICE_ID:
                p.device_id = DEVICE_ID
            if hasattr(p, "pro_token") and PRO_TOKEN:
                p.pro_token = PRO_TOKEN
            if hasattr(p, "pro_token_valid"):
                p.pro_token_valid = IS_PRO_VALID
            found = True
            print(f"[AR Exporter] Sincronizado addon '{addon_name}' com sucesso!")

if found:
    try:
        bpy.ops.wm.save_userpref()
    except Exception:
        pass
    print("[AR Exporter] Credenciais salvas com sucesso no Blender!")
    print(f" -> Servidor: {BACKEND_URL}")
    print(f" -> Device ID: {DEVICE_ID}")
    print(f" -> Pro Token: {PRO_TOKEN} (Valido: {IS_PRO_VALID})")
else:
    print("[AR Exporter] Addon ainda nao instalado ou nao ativado.")
    print("Por favor, instale primeiro o arquivo 'ar_usdz_exporter.py' em Edit > Preferences > Add-ons.")
`;

    res.setHeader("Content-Type", "text/x-python; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="sync_ar_credentials.py"');
    res.setHeader("Cache-Control", "no-store");
    res.send(pythonSyncScript);
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AR USDZ Exporter server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
