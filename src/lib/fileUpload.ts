export interface ProcessedUpload {
  fileName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  fileSizeKb: number;
  dataUrl: string;
}

const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read file contents.'));
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

function compressImageDataUrl(
  rawDataUrl: string,
  targetMime: 'image/jpeg' | 'image/png',
  maxWidth = 1280,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      // Use JPEG compression if PNG exceeds safe size so mobile camera captures always fit
      let output = canvas.toDataURL(targetMime, quality);
      if (output.length > 380000) {
        output = canvas.toDataURL('image/jpeg', 0.68);
      }
      resolve(output);
    };
    img.onerror = () => reject(new Error('Invalid or corrupted image file.'));
    img.src = rawDataUrl;
  });
}

export async function processDocumentUpload(
  file: File,
  options: {
    allowPdf?: boolean;
    allowImages?: boolean;
    maxDataUrlLength?: number;
    maxImageWidth?: number;
  } = {}
): Promise<ProcessedUpload> {
  const {
    allowPdf = true,
    allowImages = true,
    maxDataUrlLength = 650000,
    maxImageWidth = 1280,
  } = options;

  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
  const isJpg = file.type === 'image/jpeg' || file.type === 'image/jpg' || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg');
  const isPng = file.type === 'image/png' || lowerName.endsWith('.png');

  if (isPdf && !allowPdf) {
    throw new Error(`PDF files are not allowed here. Please select a JPG or PNG image.`);
  }
  if ((isJpg || isPng) && !allowImages) {
    throw new Error(`Only PDF files are accepted for "${file.name}".`);
  }
  if (!isPdf && !isJpg && !isPng && !IMAGE_MIMES.has(file.type)) {
    throw new Error(`Unsupported file type for "${file.name}". Upload PDF, JPG, JPEG, or PNG.`);
  }

  if (isPdf) {
    if (file.size > 480 * 1024) {
      throw new Error(
        `"${file.name}" is ${Math.round(file.size / 1024)} KB. Please compress the PDF under 480 KB before uploading.`
      );
    }
    const dataUrl = await readFileAsDataUrl(file);
    if (dataUrl.length > maxDataUrlLength) {
      throw new Error(`Encoded PDF exceeds limit (${Math.round(dataUrl.length / 1024)} KB). Please compress the PDF.`);
    }
    return {
      fileName: file.name.slice(0, 180),
      mimeType: 'application/pdf',
      fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
      dataUrl,
    };
  }

  // Image file — compress automatically so Android camera photos fit cleanly
  if (file.size > 12 * 1024 * 1024) {
    throw new Error(`Image "${file.name}" is larger than 12 MB.`);
  }
  const raw = await readFileAsDataUrl(file);
  const preferredMime: 'image/jpeg' | 'image/png' = isPng ? 'image/png' : 'image/jpeg';
  const compressed = await compressImageDataUrl(raw, preferredMime, maxImageWidth, 0.78);
  const finalMime: 'image/jpeg' | 'image/png' = compressed.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
  if (compressed.length > maxDataUrlLength) {
    throw new Error(`Compressed image "${file.name}" still exceeds upload size limit. Choose a smaller image.`);
  }
  return {
    fileName: file.name.slice(0, 180),
    mimeType: finalMime,
    fileSizeKb: Math.max(1, Math.round((compressed.length * 0.75) / 1024)),
    dataUrl: compressed,
  };
}

export function dataUrlToBlobUrl(dataUrl: string): string {
  try {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+);base64/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    return dataUrl;
  }
}

export function triggerDataUrlDownload(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName || 'document';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
