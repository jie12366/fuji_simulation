
declare const UTIF: any;

export const loadDNG = async (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const ifds = UTIF.decode(buffer);
        
        if (!ifds || ifds.length === 0) {
            reject(new Error("Could not decode DNG/TIFF"));
            return;
        }

        // Usually the first IFD is the main image or a preview
        // Some DNGs have multiple IFDs (thumbnail, preview, raw). 
        // UTIF usually handles the decoding of the raw data to RGBA.
        const page = ifds[0];
        UTIF.decodeImage(buffer, page);
        
        const rgba = UTIF.toRGBA8(page); // Uint8Array of RGBA
        const width = page.width;
        const height = page.height;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Canvas context error"));
            return;
        }

        const imageData = ctx.createImageData(width, height);
        imageData.data.set(rgba);
        ctx.putImageData(imageData, 0, 0);

        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(err);
        img.src = canvas.toDataURL('image/jpeg', 0.9); // Convert to standard format
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
