import React, { useEffect, useState } from 'react';
import { Box, Loader2, Sparkles } from 'lucide-react';
import { getModelThumbnail } from '../lib/thumbnailRenderer';

interface ModelThumbnailProps {
  fileUrl: string;
  filename: string;
  thumbnailUrl?: string | null;
  isActive?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const ModelThumbnail: React.FC<ModelThumbnailProps> = ({
  fileUrl,
  filename,
  thumbnailUrl,
  isActive = false,
  className = '',
  size = 'md',
}) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(thumbnailUrl || null);
  const [loading, setLoading] = useState<boolean>(!thumbnailUrl);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    // If a direct thumbnail URL was supplied from backend API, try it first
    if (thumbnailUrl) {
      setThumbUrl(thumbnailUrl);
      setLoading(false);
      setHasError(false);
      return;
    }

    setLoading(true);
    setHasError(false);

    // Resolve thumbnail via server endpoint, embedded USDZ zip extraction, or offscreen render
    getModelThumbnail(fileUrl, filename)
      .then((url) => {
        if (!isCancelled) {
          setThumbUrl(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLoading(false);
          setHasError(true);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [fileUrl, filename, thumbnailUrl]);

  const sizeClasses = {
    sm: 'w-10 h-10 min-w-[40px] rounded-lg p-1',
    md: 'w-14 h-14 min-w-[56px] rounded-xl p-1.5',
    lg: 'w-24 h-24 min-w-[96px] rounded-2xl p-2',
    xl: 'w-36 h-36 min-w-[144px] rounded-2xl p-3',
  }[size];

  return (
    <div
      className={`relative overflow-hidden shrink-0 flex items-center justify-center transition-all select-none ${sizeClasses} ${
        isActive
          ? 'bg-white border-2 border-sky-500 shadow-md shadow-sky-500/20 ring-2 ring-sky-400/40'
          : 'bg-white hover:bg-zinc-50 border border-zinc-200/90 shadow-xs hover:border-zinc-300'
      } ${className}`}
      title={`Snapshot 3D de ${filename}`}
    >
      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-xs z-10">
          <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
        </div>
      )}

      {/* Snapshot Image */}
      {thumbUrl && !hasError ? (
        <img
          src={thumbUrl}
          alt={`Thumbnail snapshot de ${filename}`}
          onError={() => {
            // If direct URL fails, fallback to extractor
            if (thumbUrl === thumbnailUrl) {
              setLoading(true);
              getModelThumbnail(fileUrl, filename)
                .then((url) => {
                  setThumbUrl(url);
                  setLoading(false);
                })
                .catch(() => {
                  setHasError(true);
                  setLoading(false);
                });
            } else {
              setHasError(true);
            }
          }}
          className={`w-full h-full object-contain filter drop-shadow-xs transition-transform duration-200 hover:scale-105 ${
            loading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}
          loading="lazy"
        />
      ) : (
        !loading && (
          <div className="flex flex-col items-center justify-center text-zinc-400 w-full h-full">
            <Box className="w-6 h-6 text-zinc-400" />
            <span className="text-[9px] font-semibold text-zinc-500 uppercase mt-0.5 tracking-wider">USDZ</span>
          </div>
        )
      )}
    </div>
  );
};
