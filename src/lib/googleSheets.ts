export interface SheetRowRecord {
  rowIndex: number; // 2-indexed (1 is header)
  timestamp: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  amount: string;
  status: 'Confirmado' | 'Pendente' | 'Cancelado';
  token: string;
  activated: string;
  txId: string;
  pixKey?: string;
}

const DEFAULT_SHEET_TITLE = 'AR Exporter - Clientes & Tokens Pix';
const SHEET_TAB_NAME = 'Cadastros e Tokens';

export const SHEET_HEADERS = [
  'Data/Hora',
  'Nome',
  'E-mail',
  'WhatsApp / Telefone',
  'Plano',
  'Valor (R$)',
  'Status Pix',
  'Token Blender Pro',
  'Ativado no Blender',
  'ID Transação',
  'Chave Pix Destino',
];

/**
 * Searches Google Drive for spreadsheets
 */
export async function findSpreadsheets(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=20`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Error querying drive:', errorText);
    throw new Error('Falha ao listar planilhas do Google Drive.');
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Creates a brand new spreadsheet with pre-formatted columns
 */
export async function createNewSpreadsheet(accessToken: string, title = DEFAULT_SHEET_TITLE): Promise<{ id: string; url: string; title: string }> {
  const body = {
    properties: {
      title,
    },
    sheets: [
      {
        properties: {
          title: SHEET_TAB_NAME,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
      },
    ],
  };

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Falha ao criar planilha: ${err}`);
  }

  const data = await createRes.json();
  const spreadsheetId = data.spreadsheetId;

  // Insert headers
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${SHEET_TAB_NAME}'!A1:K1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [SHEET_HEADERS],
    }),
  });

  // Pre-seed some demo initial records if empty
  const sampleRow = [
    new Date().toLocaleString('pt-BR'),
    'Gean Designer 3D',
    'geangamercfal@gmail.com',
    '(11) 98765-4321',
    'Pro Studio (Anual)',
    '49,90',
    'Confirmado',
    'BLENDER-PRO-2026',
    'Sim',
    'TXID-DEMO-INITIAL-01',
    'geangamercfal@gmail.com',
  ];

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${SHEET_TAB_NAME}'!A2:K2?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [sampleRow],
    }),
  });

  return {
    id: spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    title,
  };
}

/**
 * Reads all customer and token rows from spreadsheet
 */
export async function readSpreadsheetRows(accessToken: string, spreadsheetId: string): Promise<SheetRowRecord[]> {
  const range = encodeURIComponent(`'${SHEET_TAB_NAME}'!A2:K500`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    // Check if maybe Sheet1 default name exists
    const fallbackRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A2:K500`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!fallbackRes.ok) {
      throw new Error('Não foi possível ler as linhas da planilha selecionada.');
    }
    const data = await fallbackRes.json();
    return parseRows(data.values || []);
  }

  const data = await res.json();
  return parseRows(data.values || []);
}

function parseRows(rawRows: any[][]): SheetRowRecord[] {
  return rawRows.map((row, idx) => ({
    rowIndex: idx + 2, // Excel/Sheets row number
    timestamp: row[0] || '',
    name: row[1] || '',
    email: row[2] || '',
    phone: row[3] || '',
    plan: row[4] || '',
    amount: row[5] || '',
    status: (row[6] === 'Confirmado' || row[6] === 'Pendente' || row[6] === 'Cancelado') ? row[6] : (row[6] ? 'Confirmado' : 'Pendente'),
    token: row[7] || '',
    activated: row[8] || 'Não',
    txId: row[9] || '',
    pixKey: row[10] || '',
  }));
}

/**
 * Appends a new customer registration and Pix transaction row to the sheet
 */
export async function appendCustomerRow(
  accessToken: string,
  spreadsheetId: string,
  data: {
    name: string;
    email: string;
    phone: string;
    plan: string;
    amount: string;
    status: 'Confirmado' | 'Pendente';
    token: string;
    txId: string;
    pixKey: string;
  }
): Promise<boolean> {
  const row = [
    new Date().toLocaleString('pt-BR'),
    data.name,
    data.email,
    data.phone,
    data.plan,
    data.amount,
    data.status,
    data.token,
    'Não',
    data.txId,
    data.pixKey,
  ];

  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${SHEET_TAB_NAME}'!A1:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [row],
    }),
  });

  return res.ok;
}

/**
 * Updates row status in Sheets (e.g. from Pendente to Confirmado and sets Token)
 */
export async function updateRowStatusInSheet(
  accessToken: string,
  spreadsheetId: string,
  rowIndex: number,
  status: string,
  token?: string
): Promise<boolean> {
  const updateStatusRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${SHEET_TAB_NAME}'!G${rowIndex}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[status]],
      }),
    }
  );

  if (token) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${SHEET_TAB_NAME}'!H${rowIndex}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [[token]],
        }),
      }
    );
  }

  return updateStatusRes.ok;
}
