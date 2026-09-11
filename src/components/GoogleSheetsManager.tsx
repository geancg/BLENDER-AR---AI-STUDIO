import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  Plus,
  CheckCircle,
  Clock,
  Key,
  Copy,
  Check,
  Search,
  Users,
  DollarSign,
  ShieldCheck,
  AlertCircle,
  Database,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import {
  SheetRowRecord,
  findSpreadsheets,
  createNewSpreadsheet,
  readSpreadsheetRows,
  appendCustomerRow,
  updateRowStatusInSheet,
} from '../lib/googleSheets';
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  logoutGoogle,
  getCurrentUser,
} from '../lib/googleAuth';
import { GoogleSignInButton } from './GoogleSignInButton';
import { generateBlenderToken } from '../lib/pixUtils';

interface GoogleSheetsManagerProps {
  onSpreadsheetConnected?: (sheetId: string) => void;
  onTokensSynced?: () => void;
}

export const GoogleSheetsManager: React.FC<GoogleSheetsManagerProps> = ({
  onSpreadsheetConnected,
  onTokensSynced,
}) => {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Sheets state
  const [availableSheets, setAvailableSheets] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [rows, setRows] = useState<SheetRowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Confirmation modal state for Workspace mutating operations (Mandatory per Skill)
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Manual Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientPlan, setNewClientPlan] = useState('Pro Studio (Anual)');
  const [newClientAmount, setNewClientAmount] = useState('49,90');

  // Search & Copy
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Listen to auth
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setIsAuthenticated(true);
        setUserEmail(user.email);
        setUserName(user.displayName);
        loadUserSpreadsheets(token);
      },
      () => {
        setIsAuthenticated(false);
        setUserEmail(null);
        setUserName(null);
      }
    );

    // Check if there was a saved sheetId in localStorage
    const savedSheetId = localStorage.getItem('ar_exporter_active_sheet_id');
    const savedSheetName = localStorage.getItem('ar_exporter_active_sheet_name');
    if (savedSheetId) {
      setSelectedSheetId(savedSheetId);
      if (savedSheetName) setSelectedSheetName(savedSheetName);
    }

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsSigningIn(true);
    setStatusMessage(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setIsAuthenticated(true);
        setUserEmail(result.user.email);
        setUserName(result.user.displayName);
        await loadUserSpreadsheets(result.accessToken);
        setStatusMessage({ type: 'success', text: 'Conectado com o Google Workspace com sucesso!' });
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setStatusMessage({ type: 'error', text: 'Falha ao autenticar com o Google: ' + err.message });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutGoogle();
    setIsAuthenticated(false);
    setRows([]);
    setAvailableSheets([]);
    setStatusMessage({ type: 'info', text: 'Desconectado do Google Workspace.' });
  };

  // Load spreadsheets from user's Drive
  const loadUserSpreadsheets = async (token: string) => {
    setIsLoading(true);
    try {
      const files = await findSpreadsheets(token);
      setAvailableSheets(files);

      // If user had a saved spreadsheet and it exists, load its rows
      const savedSheetId = localStorage.getItem('ar_exporter_active_sheet_id');
      const targetSheet = files.find((f) => f.id === savedSheetId) || files.find((f) => f.name.includes('AR Exporter')) || files[0];

      if (targetSheet) {
        setSelectedSheetId(targetSheet.id);
        setSelectedSheetName(targetSheet.name);
        localStorage.setItem('ar_exporter_active_sheet_id', targetSheet.id);
        localStorage.setItem('ar_exporter_active_sheet_name', targetSheet.name);
        if (onSpreadsheetConnected) onSpreadsheetConnected(targetSheet.id);
        await loadRows(token, targetSheet.id);
      }
    } catch (err: any) {
      console.error('Failed to list spreadsheets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load rows from selected sheet
  const loadRows = async (token: string, sheetId: string) => {
    setIsLoading(true);
    try {
      const data = await readSpreadsheetRows(token, sheetId);
      setRows(data);

      // Auto-sync tokens found in sheet with server memory
      const tokensToSync = data
        .filter((r) => r.token && r.status === 'Confirmado')
        .map((r) => ({
          token: r.token,
          label: `${r.name} (${r.plan})`,
        }));

      if (tokensToSync.length > 0) {
        await fetch('/api/tokens/sync-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: tokensToSync }),
        });
        if (onTokensSynced) onTokensSynced();
      }
    } catch (err: any) {
      console.error('Error reading sheet rows:', err);
      setStatusMessage({ type: 'error', text: 'Não foi possível carregar as linhas da planilha.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Request Confirmation before creating new spreadsheet (Skill mandate)
  const promptCreateSpreadsheet = () => {
    setPendingAction({
      title: 'Criar Planilha no Google Drive',
      description: 'Uma nova planilha intitulada "AR Exporter - Clientes & Tokens Pix" com as colunas de controle será criada na sua conta Google Drive. Deseja continuar?',
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) return;
        setIsLoading(true);
        try {
          const newSheet = await createNewSpreadsheet(token);
          setSelectedSheetId(newSheet.id);
          setSelectedSheetName(newSheet.title);
          localStorage.setItem('ar_exporter_active_sheet_id', newSheet.id);
          localStorage.setItem('ar_exporter_active_sheet_name', newSheet.title);
          if (onSpreadsheetConnected) onSpreadsheetConnected(newSheet.id);
          await loadUserSpreadsheets(token);
          setStatusMessage({ type: 'success', text: `Planilha "${newSheet.title}" criada e formatada com sucesso!` });
        } catch (err: any) {
          setStatusMessage({ type: 'error', text: 'Erro ao criar planilha: ' + err.message });
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  // Switch spreadsheet
  const handleSelectSpreadsheet = async (sheetId: string) => {
    const found = availableSheets.find((s) => s.id === sheetId);
    setSelectedSheetId(sheetId);
    if (found) setSelectedSheetName(found.name);
    localStorage.setItem('ar_exporter_active_sheet_id', sheetId);
    if (found) localStorage.setItem('ar_exporter_active_sheet_name', found.name);
    if (onSpreadsheetConnected) onSpreadsheetConnected(sheetId);

    const token = await getAccessToken();
    if (token) {
      await loadRows(token, sheetId);
    }
  };

  // Refresh
  const handleRefresh = async () => {
    const token = await getAccessToken();
    if (token && selectedSheetId) {
      await loadRows(token, selectedSheetId);
      setStatusMessage({ type: 'success', text: 'Dados da planilha atualizados!' });
    }
  };

  // Request Confirmation before updating row (Skill mandate)
  const promptConfirmPixForRecord = (record: SheetRowRecord) => {
    setPendingAction({
      title: 'Confirmar Pagamento Pix & Gerar Token',
      description: `Deseja marcar o pagamento de ${record.name} como "Confirmado" e gerar o Token Pro do Blender na planilha e no sistema?`,
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token || !selectedSheetId) return;
        setIsLoading(true);
        try {
          const newToken = record.token || generateBlenderToken();

          // 1. Update Sheet
          await updateRowStatusInSheet(token, selectedSheetId, record.rowIndex, 'Confirmado', newToken);

          // 2. Register in server
          await fetch('/api/tokens/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: newToken,
              label: `${record.name} (${record.plan})`,
            }),
          });

          await loadRows(token, selectedSheetId);
          setStatusMessage({ type: 'success', text: `Pagamento aprovado e Token ${newToken} gerado!` });
        } catch (err: any) {
          setStatusMessage({ type: 'error', text: 'Erro ao atualizar pagamento: ' + err.message });
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  // Request Confirmation before adding manual record (Skill mandate)
  const promptAddManualClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim() || !newClientEmail.trim()) {
      alert('Preencha nome e e-mail');
      return;
    }

    setPendingAction({
      title: 'Adicionar Novo Cliente na Planilha',
      description: `Deseja inserir o registro de ${newClientName} (${newClientPlan}) na planilha "${selectedSheetName}" e emitir um novo Token Pro?`,
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token || !selectedSheetId) return;
        setIsLoading(true);
        try {
          const newToken = generateBlenderToken();
          const txId = 'MANUAL-' + Math.random().toString(36).substring(2, 8).toUpperCase();

          await appendCustomerRow(token, selectedSheetId, {
            name: newClientName,
            email: newClientEmail,
            phone: newClientPhone || '-',
            plan: newClientPlan,
            amount: newClientAmount,
            status: 'Confirmado',
            token: newToken,
            txId,
            pixKey: 'Manual Admin',
          });

          await fetch('/api/tokens/issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: newToken,
              label: `${newClientName} (${newClientPlan})`,
            }),
          });

          setShowAddModal(false);
          setNewClientName('');
          setNewClientEmail('');
          setNewClientPhone('');
          await loadRows(token, selectedSheetId);
          setStatusMessage({ type: 'success', text: `Cliente e Token ${newToken} adicionados à planilha!` });
        } catch (err: any) {
          setStatusMessage({ type: 'error', text: 'Erro ao adicionar cliente: ' + err.message });
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Computed metrics
  const totalClients = rows.length;
  const confirmedCount = rows.filter((r) => r.status === 'Confirmado').length;
  const pendingCount = rows.filter((r) => r.status === 'Pendente').length;
  const totalRevenue = rows
    .filter((r) => r.status === 'Confirmado')
    .reduce((acc, r) => {
      const num = parseFloat((r.amount || '0').replace(',', '.'));
      return acc + (isNaN(num) ? 0 : num);
    }, 0);

  const filteredRows = rows.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.token.toLowerCase().includes(q) ||
      r.txId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full space-y-6">
      {/* Top Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-r from-emerald-950/30 via-zinc-900 to-sky-950/20 p-6 sm:p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Google Sheets CRM & Tokens</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Gestão de Tokens & Cadastros Pix
            </h2>
            <p className="text-sm text-zinc-400 max-w-2xl">
              Integração direta com o <strong>Google Workspace (Google Sheets e Drive)</strong>. Cada cadastro realizado via Pix gera um registro em tempo real e emite um Token Pro para o usuário ativar no Blender.
            </p>
          </div>

          <div>
            {!isAuthenticated ? (
              <GoogleSignInButton
                onClick={handleLogin}
                loading={isSigningIn}
                text="Conectar Google Sheets"
              />
            ) : (
              <div className="flex items-center gap-3 bg-zinc-950/80 border border-zinc-800 p-2 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">
                  {userName ? userName.charAt(0).toUpperCase() : 'G'}
                </div>
                <div className="text-left pr-2">
                  <p className="text-xs font-semibold text-zinc-200">{userName || 'Usuário Google'}</p>
                  <p className="text-[11px] text-zinc-400 truncate max-w-[150px]">{userEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Desconectar"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status notification */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              : statusMessage.type === 'error'
              ? 'bg-rose-950/30 border-rose-500/30 text-rose-300'
              : 'bg-zinc-900 border-zinc-800 text-zinc-300'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-zinc-400 hover:text-zinc-200 ml-4 text-xs font-semibold"
          >
            Fechar
          </button>
        </div>
      )}

      {/* If Not Authenticated View */}
      {!isAuthenticated && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center space-y-4 max-w-2xl mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Conecte sua conta do Google</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Conecte seu Google Drive e Google Sheets com permissão para que o aplicativo possa ler e atualizar a planilha de clientes cadastrados, registrar novos pagamentos Pix e sincronizar os tokens da API do Blender.
          </p>
          <div className="pt-2">
            <GoogleSignInButton onClick={handleLogin} loading={isSigningIn} text="Entrar com o Google" />
          </div>
        </div>
      )}

      {/* Authenticated View: Spreadsheet selector and table */}
      {isAuthenticated && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/60">
            {/* Sheet Selector */}
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Planilha Ativa:
              </span>

              {availableSheets.length > 0 ? (
                <select
                  id="select-active-sheet"
                  value={selectedSheetId}
                  onChange={(e) => handleSelectSpreadsheet(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  {availableSheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-zinc-400">Nenhuma planilha encontrada</span>
              )}

              <button
                type="button"
                id="btn-create-sheet"
                onClick={promptCreateSpreadsheet}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Criar Nova Planilha</span>
              </button>

              {selectedSheetId && (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${selectedSheetId}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir no Google Sheets</span>
                </a>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
              <button
                type="button"
                id="btn-refresh-sheet"
                onClick={handleRefresh}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar</span>
              </button>

              <button
                type="button"
                id="btn-open-add-client-modal"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Cliente Manual</span>
              </button>
            </div>
          </div>

          {/* Metrics summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-1">
              <span className="text-[11px] text-zinc-400 font-medium">Total de Cadastros</span>
              <div className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <span>{totalClients}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-1">
              <span className="text-[11px] text-zinc-400 font-medium">Tokens Pro Emitidos</span>
              <div className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                <span>{confirmedCount}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-1">
              <span className="text-[11px] text-zinc-400 font-medium">Pix Pendentes</span>
              <div className="text-xl font-bold text-amber-400 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>{pendingCount}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-1">
              <span className="text-[11px] text-zinc-400 font-medium">Receita Pix (R$)</span>
              <div className="text-xl font-bold text-emerald-300 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-300" />
                <span>R$ {totalRevenue.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          </div>

          {/* Search and Table */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por cliente, e-mail ou token..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="text-xs text-zinc-400">
                Mostrando <strong>{filteredRows.length}</strong> de <strong>{rows.length}</strong> registros
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800 font-medium">
                  <tr>
                    <th className="py-3 px-4">Data/Hora</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Contato</th>
                    <th className="py-3 px-4">Plano</th>
                    <th className="py-3 px-4">Valor</th>
                    <th className="py-3 px-4">Status Pix</th>
                    <th className="py-3 px-4">Token Blender Pro</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-zinc-500">
                        {isLoading ? 'Carregando linhas do Google Sheets...' : 'Nenhum registro encontrado nesta planilha.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.rowIndex} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-zinc-400 whitespace-nowrap">
                          {row.timestamp || '-'}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-zinc-100">{row.name || 'Sem nome'}</p>
                          <p className="text-[11px] text-zinc-400">{row.email}</p>
                        </td>
                        <td className="py-3 px-4 text-zinc-300 whitespace-nowrap">
                          {row.phone || '-'}
                        </td>
                        <td className="py-3 px-4 text-zinc-200">
                          <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium text-[11px]">
                            {row.plan || 'Pro'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-emerald-400 whitespace-nowrap">
                          R$ {row.amount || '0,00'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              row.status === 'Confirmado'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {row.status === 'Confirmado' ? (
                              <CheckCircle className="w-3 h-3" />
                            ) : (
                              <Clock className="w-3 h-3" />
                            )}
                            <span>{row.status}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {row.token ? (
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-200">
                                {row.token}
                              </code>
                              <button
                                type="button"
                                title="Copiar Token"
                                onClick={() => handleCopy(row.token)}
                                className="p-1 rounded text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 transition-colors"
                              >
                                {copiedToken === row.token ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-500 italic">Pendente pagamento</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {row.status !== 'Confirmado' ? (
                            <button
                              type="button"
                              onClick={() => promptConfirmPixForRecord(row)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] transition-colors"
                            >
                              Aprovar Pix
                            </button>
                          ) : (
                            <span className="text-[11px] text-zinc-500">Ativo</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal (MANDATORY for Workspace updates per Skill) */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">{pendingAction.title}</h4>
                <p className="text-xs text-zinc-400">Confirmação de operação no Google Sheets</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              {pendingAction.description}
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirm-action"
                onClick={async () => {
                  const act = pendingAction;
                  setPendingAction(null);
                  await act.onConfirm();
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md transition-all"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h4 className="text-base font-bold text-white">Cadastrar Cliente Manual & Gerar Token</h4>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={promptAddManualClient} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Nome do cliente"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">E-mail *</label>
                  <input
                    type="email"
                    required
                    placeholder="email@cliente.com"
                    value={newClientEmail}
                    onChange={(e) => setNewClientEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">WhatsApp</label>
                  <input
                    type="text"
                    placeholder="(11) 98765-4321"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Plano</label>
                  <select
                    value={newClientPlan}
                    onChange={(e) => setNewClientPlan(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Starter AR (Mensal)">Starter AR (Mensal)</option>
                    <option value="Pro Studio (Anual)">Pro Studio (Anual)</option>
                    <option value="Vitalício (Perpétuo)">Vitalício (Perpétuo)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    value={newClientAmount}
                    onChange={(e) => setNewClientAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-all shadow-sm"
                >
                  Continuar & Salvar na Planilha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
