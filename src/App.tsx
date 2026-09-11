import React, { useState, useEffect } from 'react';
import {
  Box,
  QrCode,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Zap,
  Info,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  CreditCard,
} from 'lucide-react';
import { ModelFile, UploadResponse } from './types';
import { ModelViewer3D } from './components/ModelViewer3D';
import { UploadZone } from './components/UploadZone';
import { FilesList } from './components/FilesList';
import { ProTokenManager } from './components/ProTokenManager';
import { BlenderAddonGuide } from './components/BlenderAddonGuide';
import { QRCodeModal } from './components/QRCodeModal';
import { PixCheckout } from './components/PixCheckout';
import { GoogleSheetsManager } from './components/GoogleSheetsManager';

export default function App() {
  const [deviceId, setDeviceId] = useState<string>('');
  const [proToken, setProToken] = useState<string>('');
  const [isPro, setIsPro] = useState(false);
  const [files, setFiles] = useState<ModelFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ModelFile | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [qrModalFile, setQrModalFile] = useState<ModelFile | null>(null);
  const [activeTab, setActiveTab] = useState<'models' | 'checkout' | 'sheets' | 'guide' | 'license'>('models');
  const [connectedSpreadsheetId, setConnectedSpreadsheetId] = useState<string | null>(null);

  // Initialize or restore deviceId
  useEffect(() => {
    let storedDevice = localStorage.getItem('ar_exporter_device_id');
    if (!storedDevice) {
      storedDevice = 'device_' + Math.random().toString(36).substring(2, 12);
      localStorage.setItem('ar_exporter_device_id', storedDevice);
    }
    setDeviceId(storedDevice);

    const storedToken = localStorage.getItem('ar_exporter_pro_token');
    if (storedToken) {
      setProToken(storedToken);
      validateToken(storedToken);
    }

    const savedSheetId = localStorage.getItem('ar_exporter_active_sheet_id');
    if (savedSheetId) {
      setConnectedSpreadsheetId(savedSheetId);
    }
  }, []);

  // Fetch files with cache busting and automatic new model selection
  const fetchFiles = async (devId: string, showLoadingState: boolean = false) => {
    if (showLoadingState) {
      setLoadingFiles(true);
    }
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/files?device_id=${encodeURIComponent(devId || 'demo_device')}&_t=${Date.now()}`);
      if (res.ok) {
        const data: ModelFile[] = await res.json();
        setFiles((prev) => {
          // If a new model arrived from Blender or upload, select it automatically
          if (prev.length > 0) {
            const prevIds = new Set(prev.map((f) => f.id));
            const newlyAdded = data.find((f) => !prevIds.has(f.id));
            if (newlyAdded) {
              setSelectedFile(newlyAdded);
            }
          }
          return data;
        });

        // Select first model if none currently selected
        setSelectedFile((current) => {
          if (!current && data.length > 0) {
            return data[0];
          }
          if (current) {
            // Update reference if data refreshed
            const updated = data.find((f) => f.id === current.id);
            return updated || (data.length > 0 ? data[0] : null);
          }
          return null;
        });

        setLastSyncTime(new Date());
      }
    } catch (err) {
      console.warn('Failed to fetch files:', err);
    } finally {
      if (showLoadingState) {
        setLoadingFiles(false);
      }
      setIsSyncing(false);
    }
  };

  // Live polling every 3 seconds so uploads from Blender appear immediately
  useEffect(() => {
    if (!deviceId) return;

    fetchFiles(deviceId, true);

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchFiles(deviceId, false);
      }
    }, 3000);

    const handleVisibility = () => {
      if (!document.hidden && deviceId) {
        fetchFiles(deviceId, false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [deviceId]);

  // Validate Pro token
  const validateToken = async (token: string): Promise<boolean> => {
    try {
      const res = await fetch('/validate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.valid) {
        setIsPro(true);
        setProToken(token);
        localStorage.setItem('ar_exporter_pro_token', token);
        return true;
      } else {
        setIsPro(false);
        return false;
      }
    } catch {
      setIsPro(false);
      return false;
    }
  };

  const handleClearToken = () => {
    setIsPro(false);
    setProToken('');
    localStorage.removeItem('ar_exporter_pro_token');
  };

  // Upload callback
  const handleUploadSuccess = async (_uploaded: UploadResponse) => {
    await fetchFiles(deviceId);
  };

  // Sample select callback
  const handleSelectSample = (sampleFilename: string) => {
    // Find in files list
    const found = files.find((f) => f.filename === sampleFilename);
    if (found) {
      setSelectedFile(found);
    } else {
      // Create temporary fallback model
      const tempId = 'sample_' + sampleFilename.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const fallback: ModelFile = {
        id: tempId,
        device_id: 'demo_device',
        filename: sampleFilename,
        size: 1024 * 500,
        created_at: Math.floor(Date.now() / 1000),
        expires_at: null,
        is_pro: 1,
        scan_count: 0,
        is_expired: false,
      };
      setSelectedFile(fallback);
    }
  };

  // Delete file
  const handleDeleteFile = async (fileId: string) => {
    try {
      const res = await fetch(`/file/${fileId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, pro_token: proToken }),
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        if (selectedFile?.id === fileId) {
          const remaining = files.filter((f) => f.id !== fileId);
          setSelectedFile(remaining.length > 0 ? remaining[0] : null);
        }
      }
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  };

  const currentFileUrl = selectedFile ? `/file/${selectedFile.id}` : '';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-zinc-100 tracking-tight">AR USDZ Exporter</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-sky-500/15 border border-sky-500/30 text-sky-400">
                  Blender & Cloudflare
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Instant 3D Augmented Reality Quick Look & QR Sharing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Sync / Refresh button */}
            <button
              id="btn-sync-header"
              type="button"
              onClick={() => fetchFiles(deviceId, false)}
              title={`Sincronização em tempo real ativa. Clique para forçar atualização agora. Última verificação: ${lastSyncTime.toLocaleTimeString()}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-medium transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Ao Vivo</span>
              <span className="relative flex h-2 w-2 ml-0.5" title="Sincronização automática ativa">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </button>

            {/* License badge */}
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
              isPro
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400'
            }`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isPro ? 'Pro Unlimited' : 'Free Tier'}</span>
            </div>

            {/* Quick AR QR Button for selected model */}
            {selectedFile && (
              <button
                id="btn-header-open-qr"
                type="button"
                onClick={() => setQrModalFile(selectedFile)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition-all"
              >
                <QrCode className="w-4 h-4" />
                <span>AR QR Code</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('models')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'models'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Box className="w-3.5 h-3.5 text-sky-400" />
            <span>3D & AR Models</span>
          </button>

          <button
            type="button"
            id="tab-checkout-pix"
            onClick={() => setActiveTab('checkout')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'checkout'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/20 border border-emerald-500/30'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Comprar Token Pix</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-400/20 text-emerald-300">Novo</span>
          </button>

          <button
            type="button"
            id="tab-sheets-crm"
            onClick={() => setActiveTab('sheets')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'sheets'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Google Sheets CRM</span>
            {connectedSpreadsheetId && (
              <span className="w-2 h-2 rounded-full bg-emerald-400" title="Planilha Conectada" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'guide'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-orange-400" />
            <span>Blender Add-on Guide</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('license')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'license'
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tokens Ativos</span>
          </button>
        </div>

        {/* Tab 1: Models & 3D AR Viewer */}
        {activeTab === 'models' && (
          <div className="space-y-6">
            {/* Split layout: 3D Viewport on Top/Left, Upload & Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: 3D Interactive Viewport */}
              <div className="lg:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      3D Viewport Preview
                    </span>
                    {selectedFile && (
                      <span className="text-xs text-zinc-500 font-mono">
                        ({selectedFile.filename})
                      </span>
                    )}
                  </div>

                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => setQrModalFile(selectedFile)}
                      className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Scan on Phone</span>
                    </button>
                  )}
                </div>

                {selectedFile ? (
                  <ModelViewer3D
                    fileUrl={currentFileUrl}
                    filename={selectedFile.filename}
                    fileId={selectedFile.id}
                    onSnapshotUpdated={() => fetchFiles(deviceId)}
                  />
                ) : (
                  <div className="h-80 sm:h-96 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col items-center justify-center p-6 text-center text-zinc-500">
                    <Box className="w-12 h-12 mb-3 text-zinc-700" />
                    <p className="text-sm font-medium text-zinc-300">No 3D Model Selected</p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                      Select a model from the list below or drop a new .usdz file to view in 3D.
                    </p>
                  </div>
                )}

                {/* AR Quick Look Direct Link Bar */}
                {selectedFile && (
                  <div className="p-3 bg-zinc-900/60 rounded-xl border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-zinc-300">
                      <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>Instant iOS AR Quick Look & Android Scene Viewer link ready</span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setQrModalFile(selectedFile)}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Show QR Code</span>
                      </button>

                      <a
                        rel="ar"
                        href={currentFileUrl}
                        target="_blank"
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-medium transition-colors"
                      >
                        <span>Open AR File</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Upload Zone */}
              <div className="lg:col-span-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Export to AR
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {isPro ? 'Unlimited Exports' : `${files.length} / 3 Free Slots`}
                  </span>
                </div>

                <UploadZone
                  deviceId={deviceId}
                  proToken={proToken}
                  onUploadSuccess={handleUploadSuccess}
                  onSelectSample={handleSelectSample}
                />
              </div>
            </div>

            {/* Models Table / List */}
            <FilesList
              files={files}
              activeFileId={selectedFile?.id || null}
              onSelectFile={(f) => setSelectedFile(f)}
              onOpenQR={(f) => setQrModalFile(f)}
              onDeleteFile={handleDeleteFile}
              onRefresh={() => fetchFiles(deviceId, false)}
              isRefreshing={isSyncing}
            />
          </div>
        )}

        {/* Tab 2: Pix Checkout & Token Generator */}
        {activeTab === 'checkout' && (
          <div className="space-y-6">
            <PixCheckout
              connectedSpreadsheetId={connectedSpreadsheetId}
              onTokenGenerated={(newToken) => {
                validateToken(newToken);
              }}
            />
          </div>
        )}

        {/* Tab 3: Google Sheets CRM & Admin */}
        {activeTab === 'sheets' && (
          <div className="space-y-6">
            <GoogleSheetsManager
              onSpreadsheetConnected={(sheetId) => {
                setConnectedSpreadsheetId(sheetId);
              }}
              onTokensSynced={() => {
                if (proToken) validateToken(proToken);
              }}
            />
          </div>
        )}

        {/* Tab 4: Blender Add-on Guide */}
        {activeTab === 'guide' && (
          <div className="space-y-6">
            <BlenderAddonGuide
              deviceId={deviceId}
              proToken={proToken}
              isPro={isPro}
              onTokenUpdated={(newToken) => {
                setProToken(newToken);
                validateToken(newToken);
              }}
            />
          </div>
        )}

        {/* Tab 5: License & Tokens */}
        {activeTab === 'license' && (
          <div className="space-y-6">
            <ProTokenManager
              proToken={proToken}
              isPro={isPro}
              onActivateToken={validateToken}
              onClearToken={handleClearToken}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-500">
        <p>AR USDZ Exporter • Compatible with Blender 4.2+, Apple iOS AR Quick Look & Android Scene Viewer</p>
      </footer>

      {/* QR Code Modal */}
      {qrModalFile && (
        <QRCodeModal
          isOpen={!!qrModalFile}
          onClose={() => setQrModalFile(null)}
          fileUrl={`/file/${qrModalFile.id}`}
          filename={qrModalFile.filename}
          fileId={qrModalFile.id}
        />
      )}
    </div>
  );
}
