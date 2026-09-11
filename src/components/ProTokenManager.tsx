import React, { useState } from 'react';
import { ShieldCheck, Key, Check, Sparkles, ExternalLink, AlertCircle } from 'lucide-react';

interface ProTokenManagerProps {
  proToken: string;
  isPro: boolean;
  onActivateToken: (token: string) => Promise<boolean>;
  onClearToken: () => void;
}

export const ProTokenManager: React.FC<ProTokenManagerProps> = ({
  proToken,
  isPro,
  onActivateToken,
  onClearToken,
}) => {
  const [inputToken, setInputToken] = useState(proToken || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const valid = await onActivateToken(inputToken.trim());
    setLoading(false);

    if (valid) {
      setSuccessMsg('Pro License activated! Unlimited exports & permanent storage unlocked.');
    } else {
      setErrorMsg('Invalid token. Try test tokens: PRO-DEMO-VIP or BLENDER-PRO-2026');
    }
  };

  return (
    <div id="pro-token-manager-card" className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl border ${
            isPro
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
          }`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-zinc-100">License Status</h4>
              {isPro ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                  Pro Active
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 uppercase tracking-wider">
                  Free Plan (3 exports / 7 days)
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {isPro
                ? 'Unlimited simultaneous exports, permanent storage, and scan analytics enabled.'
                : 'Free tier allows up to 3 simultaneous models with 7-day automatic cleanup.'}
            </p>
          </div>
        </div>

        <a
          href="https://gumroad.com/l/ar-exporter-pro"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
        >
          <span>Get License</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Activation form */}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Key className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="input-pro-token"
            type="text"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            placeholder="Enter Pro license key (e.g. PRO-DEMO-VIP)"
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-sky-500 font-mono"
          />
        </div>

        <div className="flex gap-2">
          <button
            id="btn-activate-token"
            type="submit"
            disabled={loading}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 text-white rounded-xl text-xs font-medium transition-colors shadow-sm"
          >
            {loading ? 'Verifying...' : isPro ? 'Update Key' : 'Activate Pro'}
          </button>

          {isPro && (
            <button
              id="btn-clear-token"
              type="button"
              onClick={onClearToken}
              className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </form>

      {/* Quick Test Demo Keys */}
      <div className="flex items-center gap-2 text-[11px] text-zinc-400 flex-wrap pt-1">
        <span className="text-zinc-500">Quick Test Keys:</span>
        <button
          type="button"
          onClick={() => {
            setInputToken('PRO-DEMO-VIP');
            onActivateToken('PRO-DEMO-VIP');
          }}
          className="px-2 py-0.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-sky-400 font-mono transition-colors"
        >
          PRO-DEMO-VIP
        </button>
        <button
          type="button"
          onClick={() => {
            setInputToken('BLENDER-PRO-2026');
            onActivateToken('BLENDER-PRO-2026');
          }}
          className="px-2 py-0.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-sky-400 font-mono transition-colors"
        >
          BLENDER-PRO-2026
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 text-xs text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
};
