/** 图片压缩：控制单图 base64 体积（接口单图上限 32 MiB，但手机流量/token 都不该浪费）。 */
export interface CompressResult {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

export async function compressImage(
  file: File,
  opts: { maxSize?: number; quality?: number } = {},
): Promise<CompressResult> {
  const maxSize = opts.maxSize ?? 1568;
  const quality = opts.quality ?? 0.86;

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 Canvas');
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  // PNG 截图保留透明/清晰度，照片用 JPEG 更小
  const isPng = file.type === 'image/png';
  const dataUrl = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality);
  const base64 = dataUrl.split(',')[1] ?? '';
  return { dataUrl, width, height, bytes: Math.round((base64.length * 3) / 4) };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari 旧版本对某些格式会失败，退回 <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('图片解码失败'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
