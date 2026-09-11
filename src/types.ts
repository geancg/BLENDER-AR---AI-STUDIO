export interface ModelFile {
  id: string;
  device_id: string;
  filename: string;
  size: number;
  created_at: number;
  expires_at: number | null;
  is_pro: number;
  scan_count: number;
  is_expired: boolean;
  has_thumbnail?: boolean;
  thumbnail_url?: string | null;
}

export interface UploadResponse {
  url: string;
  file_id: string;
  expires_at: string | null;
  size: number;
  filename: string;
  error?: string;
  message?: string;
}

export interface TokenItem {
  token: string;
  label: string;
  created_at: number;
}
