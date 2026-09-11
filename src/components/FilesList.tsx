import React, { useState } from 'react';
import {
  Box,
  QrCode,
  Eye,
  Trash2,
  Clock,
  CheckCircle,
  AlertTriangle,
  BarChart2,
  Copy,
  Check,
  LayoutGrid,
  List,
  RefreshCw,
} from 'lucide-react';
import { ModelFile } from '../types';
import { ModelThumbnail } from './ModelThumbnail';

interface FilesListProps {
  files: ModelFile[];
  activeFileId: string | null;
  onSelectFile: (file: ModelFile) => void;
  onOpenQR: (file: ModelFile) => void;
  onDeleteFile: (fileId: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const FilesList: React.FC<FilesListProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onOpenQR,
  onDeleteFile,
  onRefresh,
  isRefreshing,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDaysLeft = (expiresAt: number | null) => {
    if (!expiresAt) return 'Permanent (Pro)';
    const now = Math.floor(Date.now() / 1000);
    const diffSec = expiresAt - now;
    if (diffSec <= 0) return 'Expired';
    const days = Math.ceil(diffSec / 86400);
    return `${days} day${days > 1 ? 's' : ''} left`;
  };

  const handleCopy = (id: string, filename: string) => {
    const url = `${window.location.origin}/file/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (files.length === 0) {
    return (
      <div className="p-8 text-center bg-zinc-900/30 border border-zinc-800 rounded-2xl">
        <Box className="w-10 h-10 text-zinc-600 mx-auto mb-2.5" />
        <h4 className="text-sm font-medium text-zinc-300">Nenhum modelo AR exportado ainda</h4>
        <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
          Exporte um modelo .usdz diretamente do Blender usando o Addon ou selecione um dos modelos de exemplo.
        </p>
      </div>
    );
  }

  return (
    <div id="files-list-card" className="space-y-3.5">
      {/* Header and View Mode Switcher */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Modelos AR Disponíveis
          </span>
          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-[11px] text-zinc-300 font-mono font-medium">
            {files.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              id="btn-fileslist-refresh"
              type="button"
              onClick={onRefresh}
              title="Atualizar lista de modelos em tempo real"
              className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-medium flex items-center gap-1.5 text-zinc-300 hover:text-sky-400 hover:border-zinc-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : 'text-zinc-400'}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          )}

          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Visualização em Grade com Snapshots 3D"
              className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-zinc-800 text-sky-400 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards 3D</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="Visualização em Lista"
              className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-zinc-800 text-sky-400 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lista</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid View (Matching Image 2 Reference) */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {files.map((file) => {
            const isActive = file.id === activeFileId;
            const isPro = file.is_pro === 1 || !file.expires_at;

            return (
              <div
                key={file.id}
                id={`file-item-${file.id}`}
                className={`group flex flex-col p-3 rounded-2xl border transition-all ${
                  isActive
                    ? 'bg-sky-950/20 border-sky-500/50 shadow-md shadow-sky-500/10'
                    : 'bg-zinc-900/60 border-zinc-800/90 hover:border-zinc-700 hover:bg-zinc-900/90'
                }`}
              >
                {/* Visual Snapshot Card - High Contrast White Surface */}
                <button
                  type="button"
                  onClick={() => onSelectFile(file)}
                  className="w-full aspect-square bg-white rounded-xl flex items-center justify-center p-3 relative overflow-hidden transition-transform duration-200 group-hover:scale-[1.01] active:scale-[0.99] border border-zinc-200/60 shadow-xs cursor-pointer focus:outline-hidden"
                  title="Clique para visualizar em 3D"
                >
                  <ModelThumbnail
                    fileUrl={`/file/${file.id}`}
                    filename={file.filename}
                    thumbnailUrl={file.thumbnail_url}
                    isActive={isActive}
                    size="xl"
                    className="w-full h-full border-none shadow-none bg-transparent p-0"
                  />
                  {/* Floating Pro Badge */}
                  <div className="absolute top-2 right-2">
                    {isPro ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase bg-emerald-500/90 text-white shadow-xs">
                        PRO
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-zinc-800/80 text-zinc-300">
                        FREE
                      </span>
                    )}
                  </div>
                </button>

                {/* File Title and Info */}
                <div className="mt-3 px-1">
                  <h4
                    className="text-sm font-semibold text-zinc-100 truncate group-hover:text-sky-300 transition-colors cursor-pointer"
                    onClick={() => onSelectFile(file)}
                    title={file.filename}
                  >
                    {file.filename}
                  </h4>
                  <div className="flex items-center justify-between text-xs text-zinc-400 mt-1">
                    <span>{formatSize(file.size)}</span>
                    <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span>{getDaysLeft(file.expires_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => onSelectFile(file)}
                    title="Visualizar em 3D"
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                      isActive
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'bg-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>3D</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenQR(file)}
                    title="Gerar QR Code para Realidade Aumentada (AR)"
                    className="flex-1 py-1.5 px-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center justify-center gap-1 transition-colors shadow-xs"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>AR QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopy(file.id, file.filename)}
                    title="Copiar link direto"
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                  >
                    {copiedId === file.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteFile(file.id)}
                    title="Excluir modelo"
                    className="p-1.5 rounded-lg bg-zinc-800/60 hover:bg-rose-950/50 text-zinc-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="grid grid-cols-1 gap-2.5">
          {files.map((file) => {
            const isActive = file.id === activeFileId;
            const isPro = file.is_pro === 1 || !file.expires_at;

            return (
              <div
                key={file.id}
                id={`file-item-${file.id}`}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border transition-all gap-3 ${
                  isActive
                    ? 'bg-sky-950/20 border-sky-500/40 shadow-sm'
                    : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {/* File Info */}
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectFile(file)}
                    className="cursor-pointer transition-transform hover:scale-105 active:scale-95 focus:outline-hidden"
                    title="Clique para abrir no visualizador 3D"
                  >
                    <ModelThumbnail
                      fileUrl={`/file/${file.id}`}
                      filename={file.filename}
                      thumbnailUrl={file.thumbnail_url}
                      isActive={isActive}
                      size="md"
                    />
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4
                        onClick={() => onSelectFile(file)}
                        className="text-sm font-semibold text-zinc-100 truncate max-w-[200px] sm:max-w-xs cursor-pointer hover:text-sky-300 transition-colors"
                      >
                        {file.filename}
                      </h4>
                      {isPro ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          PRO Permanente
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-400">
                          Free Tier
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1 flex-wrap">
                      <span>{formatSize(file.size)}</span>
                      <span className="text-zinc-600">•</span>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{getDaysLeft(file.expires_at)}</span>
                      </div>
                      <span className="text-zinc-600">•</span>
                      <div className="flex items-center gap-1" title="AR Scan Count">
                        <BarChart2 className="w-3.5 h-3.5 text-sky-400" />
                        <span className="text-sky-300 font-mono">{file.scan_count || 0} scans</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => onSelectFile(file)}
                    title="Visualizar em 3D"
                    className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                      isActive
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'bg-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700'
                    }`}
                  >
                    <Eye className="w-4 h-4" />
                    <span className="hidden md:inline">3D View</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenQR(file)}
                    title="Gerar QR Code AR"
                    className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1 transition-colors shadow-sm"
                  >
                    <QrCode className="w-4 h-4" />
                    <span className="hidden md:inline">AR QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopy(file.id, file.filename)}
                    title="Copiar URL direta"
                    className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                  >
                    {copiedId === file.id ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteFile(file.id)}
                    title="Excluir arquivo"
                    className="p-2 rounded-lg bg-zinc-800/60 hover:bg-rose-950/50 text-zinc-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
