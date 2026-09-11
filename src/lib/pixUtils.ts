import QRCode from 'qrcode';

export interface PixDetails {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  txId: string;
  description?: string;
}

/**
 * Generates a Blender Pro API Token
 * Format: BLENDER-AR-XXXX-XXXX
 */
export function generateBlenderToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `BLENDER-AR-${p1}-${p2}`;
}

/**
 * Formats an EMV tag for PIX BR Code payload
 */
function formatEMV(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * Calculates standard CRC16-CCITT checksum for Pix BR Code
 */
function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generates the official Pix Copia e Cola string (EMV QRCPS / BR Code)
 */
export function generatePixCopiaECola({
  pixKey,
  merchantName = 'AR EXPORTER',
  merchantCity = 'SAO PAULO',
  amount,
  txId = 'BLENDER01',
  description = 'Addon Blender AR Pro',
}: PixDetails): string {
  // Clean values
  const cleanKey = pixKey.trim();
  const cleanName = merchantName.substring(0, 25).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const cleanCity = merchantCity.substring(0, 15).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const cleanTxId = txId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || 'AR01';

  // Tag 26: Merchant Account Information
  const gui = formatEMV('00', 'br.gov.bcb.pix');
  const key = formatEMV('01', cleanKey);
  const desc = description ? formatEMV('02', description.substring(0, 40)) : '';
  const merchantAccountInfo = formatEMV('26', `${gui}${key}${desc}`);

  // Tag 52: Category Code (0000 = General)
  const categoryCode = formatEMV('52', '0000');

  // Tag 53: Currency Code (986 = BRL)
  const currencyCode = formatEMV('53', '986');

  // Tag 54: Amount
  const formattedAmount = amount > 0 ? formatEMV('54', amount.toFixed(2)) : '';

  // Tag 58: Country Code (BR)
  const countryCode = formatEMV('58', 'BR');

  // Tag 59: Merchant Name
  const nameField = formatEMV('59', cleanName || 'AR EXPORTER');

  // Tag 60: Merchant City
  const cityField = formatEMV('60', cleanCity || 'SAO PAULO');

  // Tag 62: Additional Data Field (TxID)
  const txField = formatEMV('05', cleanTxId);
  const additionalDataField = formatEMV('62', txField);

  // Tag 00: Payload Format Indicator ("01")
  const payloadFormat = formatEMV('00', '01');

  // Tag 01: Point of Initiation Method (12 = Dynamic, 11 = Static)
  const pointOfInitiation = formatEMV('01', '12');

  const rawPayload = `${payloadFormat}${pointOfInitiation}${merchantAccountInfo}${categoryCode}${currencyCode}${formattedAmount}${countryCode}${nameField}${cityField}${additionalDataField}6304`;

  const checksum = crc16(rawPayload);
  return `${rawPayload}${checksum}`;
}

/**
 * Generates Base64 Data URL for the Pix QR Code
 */
export async function generatePixQRCodeImage(copiaECola: string): Promise<string> {
  return QRCode.toDataURL(copiaECola, {
    width: 280,
    margin: 2,
    color: {
      dark: '#09090b',
      light: '#ffffff',
    },
  });
}
