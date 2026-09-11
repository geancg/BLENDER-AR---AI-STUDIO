import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, QrCode, Smartphone, ExternalLink, Copy, Check } from 'lucide-react';
import { ModelThumbnail } from './ModelThumbnail';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  filename: string;
  fileId: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  filename,
  fileId,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Full URL for mobile AR Quick Look
  const fullUrl = fileUrl.startsWith('http') ? fileUrl : `${window.location.origin}${fileUrl}`;

  useEffect(() => {
    if (isOpen && fullUrl) {
      QRCode.toDataURL(fullUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#09090b',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Error generating QR code:', err));
    }
  }, [isOpen, fullUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="qr-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div id="qr-modal-content" className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
        <button
          id="btn-close-qr-modal"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <ModelThumbnail fileUrl={fileUrl} filename={filename} size="sm" />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-zinc-100 truncate">{filename}</h3>
            <p className="text-xs text-zinc-400">Scan to place 3D model in your physical room</p>
          </div>
        </div>

        {/* QR Code Canvas Frame */}
        <div className="flex flex-col items-center justify-center p-5 bg-white rounded-xl shadow-inner my-4">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for ${filename}`}
              className="w-56 h-56 object-contain"
            />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-zinc-400 text-sm">
              Generating QR code...
            </div>
          )}
          <span className="text-[11px] font-mono text-zinc-500 mt-2 truncate max-w-[260px]">
            {filename}
          </span>
        </div>

        {/* Instructions */}
        <div className="space-y-2 mb-5">
          <div className="flex items-start gap-2.5 text-xs text-zinc-300">
            <Smartphone className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <span>
              <strong>iOS (iPhone/iPad):</strong> Point Camera app at QR code. Tap prompt to launch AR Quick Look automatically.
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-zinc-300">
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Android:</strong> Open with Google Lens / Scene Viewer to place in AR.
            </span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
          <button
            id="btn-copy-ar-link"
            type="button"
            onClick={handleCopyLink}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Link Copied' : 'Copy Direct URL'}</span>
          </button>

          {/* iOS rel="ar" trigger button */}
          <a
            id="btn-direct-quicklook-ar"
            rel="ar"
            href={fullUrl}
            target="_blank"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-medium transition-colors shadow-sm"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open in AR</span>
          </a>
        </div>
      </div>
    </div>
  );
};
