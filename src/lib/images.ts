function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Súbor sa nepodarilo načítať ako obrázok. Skúste fotografiu vo formáte JPG alebo PNG.'));
    img.src = src;
  });
}

/** Zmenší fotografiu na max. rozmer a uloží ako JPEG. */
export async function compressImage(file: Blob, maxSize = 1600, quality = 0.76): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Prehliadač nevie spracovať fotografiu.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Fotografiu sa nepodarilo skomprimovať.'))), 'image/jpeg', quality),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressFiles(files: FileList | null, maxSize?: number): Promise<Blob[]> {
  if (!files) return [];
  return Promise.all([...files].map((f) => compressImage(f, maxSize)));
}

export async function compressToDataUrl(file: Blob, maxSize = 2000): Promise<string> {
  return readAsDataUrl(await compressImage(file, maxSize, 0.82));
}
