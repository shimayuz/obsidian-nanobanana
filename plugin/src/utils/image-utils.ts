import { TFile, Vault } from 'obsidian';
import { ImageInfo } from '../types';

const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const MIME_TYPES: Record<string, string> = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp'
};

export function isImageFile(file: TFile): boolean {
  return SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase());
}

export function getMimeType(extension: string): string {
  return MIME_TYPES[extension.toLowerCase()] || 'application/octet-stream';
}

export async function getImageAsBase64(vault: Vault, file: TFile): Promise<string> {
  const arrayBuffer = await vault.readBinary(file);
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function getImageInfo(vault: Vault, file: TFile): Promise<ImageInfo> {
  const base64 = await getImageAsBase64(vault, file);
  return {
    path: file.path,
    name: file.name,
    extension: file.extension,
    mimeType: getMimeType(file.extension),
    base64
  };
}

export function parseImageFromMarkdown(text: string): string[] {
  const imageRegex = /!\[\[([^\]]+\.(jpg|jpeg|png|gif|webp))\]\]|!\[([^\]]*)\]\(([^)]+\.(jpg|jpeg|png|gif|webp))\)/gi;
  const matches: string[] = [];
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    // Wikilink format: ![[image.png]]
    if (match[1]) {
      matches.push(match[1]);
    }
    // Standard markdown format: ![alt](path.png)
    if (match[4]) {
      matches.push(match[4]);
    }
  }

  return matches;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function validateImageSize(sizeInBytes: number, maxSizeMB: number): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return sizeInBytes <= maxSizeBytes;
}
