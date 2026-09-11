import React, { useState } from 'react';
import {
  Download,
  Terminal,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Code2,
  ExternalLink,
  Laptop,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface BlenderAddonGuideProps {
  deviceId?: string;
  proToken?: string;
  isPro?: boolean;
  onTokenUpdated?: (token: string) => void;
}

export const BlenderAddonGuide: React.FC<BlenderAddonGuideProps> = ({
  deviceId = '',
  proToken = '',
  isPro = false,
  onTokenUpdated,
}) => {
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showScriptModal, setShowScriptModal] = useState(false);

  // Generate URLs for downloading
  const downloadConfiguredUrl = `/api/addon/download?backendUrl=${encodeURIComponent(
    currentOrigin
  )}&deviceId=${encodeURIComponent(deviceId)}&token=${encodeURIComponent(proToken)}`;

  const downloadCleanUrl = `/api/addon/download?preset=clean`;
  const downloadSyncScriptUrl = `/api/addon/sync-script?backendUrl=${encodeURIComponent(
    currentOrigin
  )}&deviceId=${encodeURIComponent(deviceId)}&token=${encodeURIComponent(proToken)}`;

  const syncPythonScript = `# ==============================================================================
# Sincronizador de Credenciais — AR USDZ Exporter (Blender 4.2+)
#
# COMO USAR:
# 1. No Blender, abra o workspace "Scripting" (ou crie uma aba "Text Editor").
# 2. Crie um novo texto (New) e cole este código.
# 3. Pressione Alt+P (ou clique no botão Run Script ▶).
# 4. Suas credenciais e status Pro serão sincronizados instantaneamente!
# ==============================================================================
import bpy

BACKEND_URL = "${currentOrigin}"
DEVICE_ID = "${deviceId}"
PRO_TOKEN = "${proToken}"
IS_PRO_VALID = ${isPro ? 'True' : 'False'}

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

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentOrigin);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyToken = () => {
    if (!proToken) return;
    navigator.clipboard.writeText(proToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleCopySyncScript = () => {
    navigator.clipboard.writeText(syncPythonScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleSyncCredentials = async () => {
    setSyncing(true);
    setSyncStatus('idle');

    try {
      // Validate backend status and active token
      const healthRes = await fetch('/api/health');
      if (!healthRes.ok) throw new Error('Servidor indisponível');

      if (proToken) {
        const tokenRes = await fetch('/validate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: proToken }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.valid && onTokenUpdated) {
          onTokenUpdated(proToken);
        }
      }

      setSyncStatus('success');
      setShowScriptModal(true);
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div id="blender-addon-guide-card" className="space-y-6">
      {/* Top Banner & Quick Download Card */}
      <div className="p-6 rounded-3xl bg-linear-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800 shadow-xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-400 shrink-0">
              <FileCode className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Plugin AR USDZ Exporter para Blender
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                  Blender 4.2+ Ready
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Formato .py
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl leading-relaxed">
                Exporte qualquer malha 3D selecionada na viewport do Blender com 1 clique diretamente para Realidade Aumentada (USDZ) com geração automática de QR Code no iPhone e Android.
              </p>
            </div>
          </div>

          {/* Direct Download Actions */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <a
              id="btn-download-addon-configured"
              href={downloadConfiguredUrl}
              download="ar_usdz_exporter.py"
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-orange-500/25 transition-all hover:scale-102 active:scale-98"
              title="Baixar plugin .py com servidor e credenciais sincronizadas"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Plugin (.py)</span>
            </a>

            <button
              type="button"
              id="btn-sync-credentials"
              onClick={handleSyncCredentials}
              disabled={syncing}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                syncStatus === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-zinc-800/80 hover:bg-zinc-700/80 border-zinc-700 text-zinc-200 hover:text-white'
              }`}
              title="Sincronizar credenciais ativas com o Blender"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-orange-400' : 'text-emerald-400'}`} />
              <span>{syncing ? 'Sincronizando...' : 'Sincronizar Credenciais'}</span>
            </button>
          </div>
        </div>

        {/* Credentials Status Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-800/80 text-xs">
          {/* Active Server Origin */}
          <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Servidor Backend Ativo
              </span>
              <span className="font-mono text-sky-400 truncate block text-[11px] mt-0.5" title={currentOrigin}>
                {currentOrigin}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0"
              title="Copiar URL do Servidor"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Device ID */}
          <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Seu Device ID
              </span>
              <span className="font-mono text-zinc-300 truncate block text-[11px] mt-0.5" title={deviceId}>
                {deviceId || 'Não inicializado'}
              </span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Identificador Ativo" />
          </div>

          {/* Pro Token Status */}
          <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block">
                Licença / Token Pro
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isPro ? (
                  <span className="font-mono text-emerald-400 text-[11px] truncate flex items-center gap-1 font-semibold">
                    <ShieldCheck className="w-3 h-3 shrink-0" />
                    {proToken}
                  </span>
                ) : (
                  <span className="text-zinc-500 text-[11px]">Plano Gratuito (3 exports)</span>
                )}
              </div>
            </div>
            {proToken ? (
              <button
                type="button"
                onClick={handleCopyToken}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0"
                title="Copiar Token Pro"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <a
                href="#tab-checkout-pix"
                className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-medium"
              >
                Obter Pix
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Sync Script Drawer / Modal */}
      {showScriptModal && (
        <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-100">
                  Credenciais Sincronizadas & Prontas para o Blender
                </h4>
                <p className="text-xs text-zinc-400">
                  O arquivo baixado já inclui seu servidor e token. Se você já tem o plugin instalado no Blender, execute o script abaixo no Blender Text Editor com <code className="text-emerald-300 font-mono font-bold">Alt+P</code>:
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={downloadSyncScriptUrl}
                download="sync_ar_credentials.py"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
                title="Baixar script python de sincronização"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Baixar sync.py</span>
              </a>

              <button
                type="button"
                onClick={handleCopySyncScript}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedScript ? 'Copiado!' : 'Copiar Script'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowScriptModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            </div>
          </div>

          <pre className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/90 text-zinc-300 font-mono text-[11px] overflow-x-auto max-h-48 scrollbar-thin">
            {syncPythonScript}
          </pre>
        </div>
      )}

      {/* Setup Guide Steps */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        {/* Step 1 */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2 relative group hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-xs border border-orange-500/30">
              1
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">ar_usdz_exporter.py</span>
          </div>
          <h5 className="font-semibold text-zinc-200 text-sm">Baixar o Plugin</h5>
          <p className="text-zinc-400 text-xs leading-relaxed">
            Clique no botão acima <strong>"Baixar Plugin (.py)"</strong>. Suas credenciais atuais, servidor e token Pro já são injetados automaticamente no arquivo.
          </p>
          <div className="pt-2">
            <a
              href={downloadConfiguredUrl}
              download="ar_usdz_exporter.py"
              className="text-orange-400 hover:text-orange-300 text-xs font-medium flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span>Download direto (.py)</span>
            </a>
          </div>
        </div>

        {/* Step 2 */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2 relative group hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs border border-sky-500/30">
              2
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Blender 4.2+</span>
          </div>
          <h5 className="font-semibold text-zinc-200 text-sm">Instalar no Blender</h5>
          <p className="text-zinc-400 text-xs leading-relaxed">
            No Blender, acesse: <br />
            <strong className="text-zinc-300">Edit → Preferences → Add-ons</strong>. Clique na seta no canto superior direito e selecione <strong className="text-zinc-300">Install from Disk...</strong>.
          </p>
          <p className="text-[11px] text-zinc-500">
            Selecione o arquivo <code className="text-zinc-400">ar_usdz_exporter.py</code> baixado e ative a caixa de seleção.
          </p>
        </div>

        {/* Step 3 */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2 relative group hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/30">
              3
            </span>
            <span className="text-[10px] text-emerald-400/80 font-mono">Status Pro</span>
          </div>
          <h5 className="font-semibold text-zinc-200 text-sm">Sincronizar Credenciais</h5>
          <p className="text-zinc-400 text-xs leading-relaxed">
            Pressione a tecla <strong className="text-zinc-200">N</strong> na Viewport 3D do Blender para abrir a barra lateral e selecione a aba <strong className="text-zinc-200">AR Exporter</strong>.
          </p>
          <p className="text-[11px] text-zinc-500">
            Seu token e URL já estarão pré-configurados! Caso deseje atualizar, clique no botão <strong>Sincronizar Credenciais</strong> a qualquer momento.
          </p>
        </div>

        {/* Step 4 */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2 relative group hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between">
            <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs border border-purple-500/30">
              4
            </span>
            <span className="text-[10px] text-purple-400/80 font-mono">1-Click AR</span>
          </div>
          <h5 className="font-semibold text-zinc-200 text-sm">Exportar para AR</h5>
          <p className="text-zinc-400 text-xs leading-relaxed">
            Selecione seu objeto 3D ou malha na cena e clique no botão verde <strong className="text-zinc-200">Exportar para AR</strong>.
          </p>
          <p className="text-[11px] text-zinc-500">
            O QR Code aparece na tela do Blender para você escanear com a câmera do celular (iOS / Android) e ver o objeto no mundo real!
          </p>
        </div>
      </div>

      {/* Alternative Download Options & Technical Notes */}
      <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          <Laptop className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>
            Compatível com Windows, macOS (Intel & Apple Silicon) e Linux rodando Blender 4.2 LTS ou superior.
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href={downloadCleanUrl}
            download="blender_ar_exporter.py"
            className="text-zinc-400 hover:text-zinc-200 underline text-xs"
            title="Baixar versão sem credenciais gravadas"
          >
            Baixar versão limpa (.py)
          </a>
        </div>
      </div>
    </div>
  );
};
