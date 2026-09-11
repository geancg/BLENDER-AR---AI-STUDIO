import React, { useState, useRef } from 'react';
import { Upload, FileUp, Sparkles, CheckCircle2, AlertCircle, Box, ArrowRight } from 'lucide-react';
import { UploadResponse } from '../types';
import { ModelThumbnail } from './ModelThumbnail';

interface UploadZoneProps {
  deviceId: string;
  proToken: string;
  onUploadSuccess: (res: UploadResponse) => void;
  onSelectSample: (sampleFilename: string) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  deviceId,
  proToken,
  onUploadSuccess,
  onSelectSample,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sampleModels = [
    { file: 'suzanne.usdz', name: 'Suzanne Monkey', desc: 'Blender mascot mesh' },
    { file: 'Lowpoly Male Standing.usdz', name: 'Lowpoly Character', desc: 'Standing anatomical model' },
    { file: 'twistedtorus.usdz', name: 'Twisted Torus', desc: 'Complex geometric knot' },
    { file: 'plane.002.usdz', name: 'Plane Surface', desc: 'AR floor detector plane' },
    { file: 'text.usdz', name: '3D Typography', desc: 'Extruded text mesh' },
  ];

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.usdz')) {
      setErrorMsg('Please select a valid .usdz 3D file for Apple AR Quick Look.');
      return;
    }

    setUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('device_id', deviceId);
      if (proToken) {
        formData.append('pro_token', proToken);
      }

      const res = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });

      const data: UploadResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Upload failed');
      }

      setSuccessMsg(`Successfully uploaded ${data.filename}! Ready for AR viewing.`);
      onUploadSuccess(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div id="upload-zone-container" className="space-y-4">
      {/* Drag and Drop Container */}
      <div
        id="dropzone-box"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-sky-500 bg-sky-500/10'
            : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 hover:bg-zinc-900/70'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".usdz"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-transform">
            {uploading ? (
              <FileUp className="w-7 h-7 animate-bounce" />
            ) : (
              <Upload className="w-7 h-7" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100">
              {uploading ? 'Processing & Exporting to AR...' : 'Drop your .USDZ model here or click to browse'}
            </h4>
            <p className="text-xs text-zinc-400 mt-1">
              Supports Apple USDZ archives with textures & PBR materials. Max 64MB.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-[11px] text-zinc-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Blender 4.2+ Compatible • Instant AR Quick Look</span>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {errorMsg && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-200 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-200 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Quick Test Sample Models from Repo */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Or test with repository 3D samples:
          </span>
          <span className="text-[11px] text-zinc-500">Ready in storage</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {sampleModels.map((sample) => (
            <button
              key={sample.file}
              type="button"
              onClick={() => onSelectSample(sample.file)}
              className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-sky-500/40 hover:bg-zinc-800/60 text-left transition-all group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <ModelThumbnail
                  fileUrl={`/file/${encodeURIComponent(sample.file)}`}
                  filename={sample.file}
                  size="sm"
                />
                <div className="truncate">
                  <div className="text-xs font-medium text-zinc-200 group-hover:text-white truncate">
                    {sample.name}
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">{sample.desc}</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all shrink-0 ml-1.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
