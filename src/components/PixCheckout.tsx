import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  CreditCard,
  Sparkles,
  Smartphone,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  QrCode,
  FileSpreadsheet,
  Layers,
  Key,
} from 'lucide-react';
import {
  generateBlenderToken,
  generatePixCopiaECola,
  generatePixQRCodeImage,
} from '../lib/pixUtils';
import { appendCustomerRow } from '../lib/googleSheets';
import { getAccessToken } from '../lib/googleAuth';

interface PixCheckoutProps {
  onTokenGenerated?: (token: string) => void;
  connectedSpreadsheetId?: string | null;
  defaultPixKey?: string;
}

interface PlanOption {
  id: string;
  name: string;
  price: number;
  period: string;
  badge?: string;
  features: string[];
}

const PLANS: PlanOption[] = [
  {
    id: 'starter',
    name: 'Starter AR',
    price: 19.9,
    period: 'mês',
    features: ['Até 10 modelos simultâneos', 'Armazenamento permanente', 'QR Code AR Quick Look'],
  },
  {
    id: 'pro',
    name: 'Pro Studio',
    price: 49.9,
    period: 'ano',
    badge: 'Mais Popular',
    features: [
      'Modelos ilimitados',
      'QR Code AR Quick Look Instantâneo',
      'Métricas de Escaneamento',
      'Sem expiração de link',
      'Suporte prioritário',
    ],
  },
  {
    id: 'lifetime',
    name: 'Acesso Vitalício',
    price: 97.0,
    period: 'único',
    badge: 'Melhor Custo-Benefício',
    features: [
      'Acesso perpétuo para sempre',
      'Todas as atualizações do Add-on',
      'Modelos e Scans ilimitados',
      'Token Pro permanente no Blender',
    ],
  },
];

export const PixCheckout: React.FC<PixCheckoutProps> = ({
  onTokenGenerated,
  connectedSpreadsheetId,
  defaultPixKey = 'geangamercfal@gmail.com',
}) => {
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form');

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('pro');
  const [pixKey, setPixKey] = useState(defaultPixKey);

  // Pix Generated State
  const [pixCode, setPixCode] = useState('');
  const [pixQrDataUrl, setPixQrDataUrl] = useState('');
  const [txId, setTxId] = useState('');
  const [copiedPix, setCopiedPix] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Success State
  const [generatedToken, setGeneratedToken] = useState('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [savedToSheet, setSavedToSheet] = useState(false);

  const selectedPlan = PLANS.find((p) => p.id === selectedPlanId) || PLANS[1];

  // Generate Pix payment
  const handleGeneratePix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      alert('Por favor, preencha nome e e-mail.');
      return;
    }

    setIsProcessing(true);
    try {
      const generatedTxId = 'AR' + Math.random().toString(36).substring(2, 10).toUpperCase();
      setTxId(generatedTxId);

      const copiaECola = generatePixCopiaECola({
        pixKey: pixKey.trim(),
        merchantName: 'AR EXPORTER 3D',
        merchantCity: 'SAO PAULO',
        amount: selectedPlan.price,
        txId: generatedTxId,
        description: `Blender AR ${selectedPlan.name}`,
      });

      setPixCode(copiaECola);
      const qrDataUrl = await generatePixQRCodeImage(copiaECola);
      setPixQrDataUrl(qrDataUrl);

      setStep('payment');
    } catch (err: any) {
      console.error('Failed to generate pix:', err);
      alert('Erro ao gerar código Pix: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyPix = () => {
    if (!pixCode) return;
    navigator.clipboard.writeText(pixCode);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const handleCopyToken = () => {
    if (!generatedToken) return;
    navigator.clipboard.writeText(generatedToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  // Confirm Pix payment and issue token
  const handleConfirmPayment = async () => {
    setIsProcessing(true);
    try {
      const token = generateBlenderToken();
      setGeneratedToken(token);

      // 1. Register token in backend server
      await fetch('/api/tokens/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          label: `${name} (${selectedPlan.name} - ${email})`,
        }),
      });

      // 2. If Google Sheet is connected and token available, append to Sheet
      const googleToken = await getAccessToken();
      if (googleToken && connectedSpreadsheetId) {
        try {
          await appendCustomerRow(googleToken, connectedSpreadsheetId, {
            name,
            email,
            phone: phone || '-',
            plan: selectedPlan.name,
            amount: selectedPlan.price.toFixed(2).replace('.', ','),
            status: 'Confirmado',
            token,
            txId,
            pixKey,
          });
          setSavedToSheet(true);
        } catch (sheetErr) {
          console.warn('Could not save to Google Sheet automatically:', sheetErr);
        }
      }

      // 3. Notify parent/store
      if (onTokenGenerated) {
        onTokenGenerated(token);
      }

      setStep('success');
    } catch (err: any) {
      console.error('Error confirming payment:', err);
      alert('Erro ao confirmar pagamento: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-sky-950/30 p-6 sm:p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Checkout Pix Instantâneo</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Obter Token Pro para o Blender
            </h2>
            <p className="text-sm text-zinc-400 max-w-xl">
              Cadastre-se, realize o pagamento via Pix e receba instantaneamente seu código de API para ativar o AR Exporter no Blender 4.2+. Todos os dados são registrados automaticamente no Google Sheets.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold ring-2 ring-zinc-900">
                Pix
              </div>
              <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center text-xs font-bold ring-2 ring-zinc-900">
                3D
              </div>
              <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center text-xs font-bold ring-2 ring-zinc-900">
                AR
              </div>
            </div>
            <span className="text-xs text-zinc-400 font-medium">Liberação em 5 segundos</span>
          </div>
        </div>
      </div>

      {/* STEP 1: Registration Form */}
      {step === 'form' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Plan Selector */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              1. Escolha o Plano
            </h3>
            <div className="space-y-3">
              {PLANS.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/20 shadow-md shadow-emerald-500/10'
                        : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-zinc-100">{plan.name}</span>
                      {plan.badge && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {plan.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white">
                        R$ {plan.price.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-xs text-zinc-400">/{plan.period}</span>
                    </div>
                    <ul className="mt-3 space-y-1.5 text-xs text-zinc-400">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* User Details Form */}
          <div className="lg:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-base font-semibold text-white">2. Dados do Usuário</h3>
                <p className="text-xs text-zinc-400">
                  Preencha os dados que constarão no Google Sheets e no comprovante do seu Token.
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                Plano: {selectedPlan.name}
              </span>
            </div>

            <form onSubmit={handleGeneratePix} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Nome Completo *
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  required
                  placeholder="Ex: Carlos Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    E-mail (para onde enviaremos o Token) *
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    required
                    placeholder="carlos@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    WhatsApp / Telefone
                  </label>
                  <input
                    id="checkout-phone"
                    type="tel"
                    placeholder="(11) 98765-4321"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>

              {/* Chave Pix configuration toggle */}
              <div className="pt-2 border-t border-zinc-800/80">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-400">
                    Chave Pix de Recebimento (Administrador)
                  </label>
                  <span className="text-[11px] text-zinc-500 font-mono">Chave Pix padrão ativa</span>
                </div>
                <input
                  id="checkout-pix-key"
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs font-mono text-zinc-300 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Summary and submit */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-800">
                <div>
                  <span className="text-xs text-zinc-400">Total a pagar:</span>
                  <div className="text-2xl font-bold text-emerald-400">
                    R$ {selectedPlan.price.toFixed(2).replace('.', ',')}
                  </div>
                </div>

                <button
                  id="btn-generate-pix"
                  type="submit"
                  disabled={isProcessing}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{isProcessing ? 'Gerando Pix...' : 'Gerar QR Code Pix'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STEP 2: Pix Payment Screen */}
      {step === 'payment' && (
        <div className="max-w-2xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
              <QrCode className="w-3.5 h-3.5" />
              <span>Aguardando Pagamento Pix</span>
            </span>
            <h3 className="text-xl font-bold text-white">Escaneie o QR Code ou Copie o Código</h3>
            <p className="text-xs text-zinc-400">
              Abra seu aplicativo de banco (Nubank, Inter, Itaú, Bradesco, etc.) e escaneie o código abaixo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 p-6 rounded-xl bg-zinc-950 border border-zinc-800">
            {/* QR Code Canvas/Image */}
            <div className="p-3 bg-white rounded-xl shadow-lg flex items-center justify-center">
              {pixQrDataUrl ? (
                <img
                  src={pixQrDataUrl}
                  alt="Pix QR Code"
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-zinc-400">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                </div>
              )}
            </div>

            {/* Payment Details */}
            <div className="space-y-3 w-full sm:w-auto text-center sm:text-left">
              <div>
                <span className="text-[11px] text-zinc-400">Beneficiário</span>
                <p className="text-sm font-semibold text-zinc-100">AR EXPORTER 3D</p>
              </div>
              <div>
                <span className="text-[11px] text-zinc-400">Chave Pix</span>
                <p className="text-xs font-mono text-emerald-400">{pixKey}</p>
              </div>
              <div>
                <span className="text-[11px] text-zinc-400">Valor Total</span>
                <p className="text-2xl font-bold text-emerald-400">
                  R$ {selectedPlan.price.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-zinc-400">ID da Transação</span>
                <p className="text-xs font-mono text-zinc-400">{txId}</p>
              </div>
            </div>
          </div>

          {/* Pix Copia e Cola field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">Pix Copia e Cola:</label>
              {copiedPix && (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Código copiado com sucesso!
                </span>
              )}
            </div>
            <div className="relative">
              <textarea
                readOnly
                rows={2}
                value={pixCode}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 resize-none select-all focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                id="btn-copy-pix"
                onClick={handleCopyPix}
                className="absolute right-2.5 top-2.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
              >
                {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPix ? 'Copiado!' : 'Copiar Pix'}</span>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setStep('form')}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Voltar e alterar dados
            </button>

            <button
              id="btn-confirm-pix-payment"
              type="button"
              disabled={isProcessing}
              onClick={handleConfirmPayment}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isProcessing ? 'Confirmando...' : 'Confirmar Pagamento & Liberar Token'}</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Token Generated & Blender Instructions */}
      {step === 'success' && (
        <div className="max-w-2xl mx-auto rounded-2xl border border-emerald-500/30 bg-zinc-900/90 p-6 sm:p-8 space-y-6 shadow-2xl shadow-emerald-500/5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-bold text-white">Pagamento Confirmado com Sucesso!</h3>
            <p className="text-xs text-zinc-400">
              Seu Token Pro do Blender foi gerado e ativado no sistema.
              {savedToSheet && ' Registro sincronizado no Google Sheets com sucesso.'}
            </p>
          </div>

          {/* Token Card */}
          <div className="p-5 rounded-2xl bg-zinc-950 border border-emerald-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> Seu Código de API / Token Pro:
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Ativo & Validado
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
              <span className="font-mono text-base sm:text-lg font-bold text-white tracking-widest select-all">
                {generatedToken}
              </span>
              <button
                type="button"
                id="btn-copy-blender-token"
                onClick={handleCopyToken}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedToken ? 'Copiado!' : 'Copiar Token'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-zinc-400 pt-1">
              <div>
                <span className="text-zinc-500">Cliente:</span> {name}
              </div>
              <div>
                <span className="text-zinc-500">Plano:</span> {selectedPlan.name}
              </div>
              <div>
                <span className="text-zinc-500">TxID:</span> {txId}
              </div>
            </div>
          </div>

          {/* Visual Step-by-Step for Blender */}
          <div className="space-y-3 rounded-xl bg-zinc-950/60 border border-zinc-800 p-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Como Colocar Este Token Dentro do Blender:</span>
            </div>

            <ol className="space-y-2.5 text-xs text-zinc-300">
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-sky-400">
                  1
                </span>
                <span>
                  Abra o <strong>Blender 4.2+</strong> na sua cena 3D com o add-on <strong>AR USDZ Exporter</strong> instalado.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-sky-400">
                  2
                </span>
                <span>
                  Pressione a tecla <strong>N</strong> na 3D Viewport para abrir a barra lateral e clique na aba <strong>AR Exporter</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-sky-400">
                  3
                </span>
                <span>
                  No campo <strong>Token Pro</strong>, cole o código <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 font-mono">{generatedToken}</code>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-sky-400">
                  4
                </span>
                <span>
                  Clique em <strong>Validar Token</strong>. O status mudará imediatamente para <strong className="text-emerald-400">Pro Ativo</strong>! Seus modelos agora contam com links permanentes e análises de visualizações.
                </span>
              </li>
            </ol>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setStep('form');
                setName('');
                setEmail('');
                setPhone('');
              }}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Fazer novo cadastro / venda
            </button>

            <button
              type="button"
              onClick={handleCopyToken}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors"
            >
              {copiedToken ? 'Token Copiado!' : 'Copiar Token Novamente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
