
declare const UTIF: any;

const TAG_SUBIFDS = 330;
const TAG_IMAGEWIDTH = 256;
const TAG_IMAGELENGTH = 257;
const TAG_COMPRESSION = 259;
const TAG_PHOTOMETRIC = 262;

// TIFF Data Types and their byte lengths
const getTypeSize = (type: number): number => {
  switch (type) {
    case 1: return 1; // BYTE
    case 2: return 1; // ASCII
    case 3: return 2; // SHORT
    case 4: return 4; // LONG
    case 5: return 8; // RATIONAL
    case 6: return 1; // SBYTE
    case 7: return 1; // UNDEFINED
    case 8: return 2; // SSHORT
    case 9: return 4; // SLONG
    case 10: return 8; // SRATIONAL
    case 11: return 4; // FLOAT
    case 12: return 8; // DOUBLE
    default: return 0;
  }
};

// Parse a single tag value based on type and count
const parseValue = (
  data: DataView,
  offset: number,
  type: number,
  count: number,
  littleEndian: boolean
): any => {
  const size = getTypeSize(type);
  const totalSize = size * count;
  
  let valOffset = offset;
  if (totalSize > 4) {
    // Value is stored elsewhere, offset points to it
    valOffset = data.getUint32(offset, littleEndian);
  }

  // UTIF expects all numeric tags to be Arrays, even if count is 1.
  const readArr = (fn: (o: number, l: boolean) => number) => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push(fn(valOffset + i * size, littleEndian));
    }
    return arr;
  };

  switch (type) {
    case 1: // BYTE
    case 6: // SBYTE
    case 7: // UNDEFINED
      return readArr((o) => data.getUint8(o)); 
    case 2: // ASCII
      // ASCII strings are the exception, UTIF handles them as primitive strings
      let str = "";
      for (let i = 0; i < count - 1; i++) { // usually null terminated
        str += String.fromCharCode(data.getUint8(valOffset + i));
      }
      return str;
    case 3: // SHORT
      return readArr((o, l) => data.getUint16(o, l));
    case 8: // SSHORT
      return readArr((o, l) => data.getInt16(o, l));
    case 4: // LONG
      return readArr((o, l) => data.getUint32(o, l));
    case 9: // SLONG
      return readArr((o, l) => data.getInt32(o, l));
    case 5: // RATIONAL
      {
        const arr = [];
        for (let i = 0; i < count; i++) {
          arr.push(data.getUint32(valOffset + i * 8, littleEndian)); // Numerator
          arr.push(data.getUint32(valOffset + i * 8 + 4, littleEndian)); // Denominator
        }
        return arr; // UTIF expects flat array [num, den, num, den...]
      }
    case 10: // SRATIONAL
      {
        const arr = [];
        for (let i = 0; i < count; i++) {
          arr.push(data.getInt32(valOffset + i * 8, littleEndian));
          arr.push(data.getInt32(valOffset + i * 8 + 4, littleEndian));
        }
        return arr;
      }
    case 11: // FLOAT
      return readArr((o, l) => data.getFloat32(o, l));
    case 12: // DOUBLE
      return readArr((o, l) => data.getFloat64(o, l));
    default:
      return [];
  }
};

// Scan the binary buffer recursively to find all IFDs (including SubIFDs)
// Generalized for any TIFF-based structure (DNG, NEF, CR2, ARW, ORF, RW2)
const scanTIFFStructure = (buffer: ArrayBuffer): any[] => {
  const data = new DataView(buffer);
  const byteLength = buffer.byteLength;
  
  if (byteLength < 8) throw new Error("File too short");

  // 1. Validate Header
  const byteOrder = data.getUint16(0);
  let littleEndian = false;
  if (byteOrder === 0x4949) littleEndian = true;
  else if (byteOrder === 0x4D4D) littleEndian = false;
  else {
      console.warn("Unknown byte order, assuming Little Endian (Intell format)");
      littleEndian = true; 
  }

  const magic = data.getUint16(2, littleEndian);
  // Standard TIFF/DNG/NEF/CR2/ARW is 42. Panasonic RW2 is 85.
  if (magic !== 42 && magic !== 85) {
      console.warn(`Non-standard TIFF magic number: ${magic}. Attempting to parse anyway...`);
  }

  const firstIFDOffset = data.getUint32(4, littleEndian);

  // 2. Traversal
  const ifds: any[] = [];
  const visited = new Set<number>();
  const queue = [firstIFDOffset];

  while (queue.length > 0) {
    const offset = queue.shift()!;
    // Alignment check (must be even) and boundary check
    if (offset === 0 || offset >= byteLength - 2 || offset % 2 !== 0 || visited.has(offset)) continue;
    visited.add(offset);

    // Read Entry Count
    const numEntries = data.getUint16(offset, littleEndian);
    const ifd: any = {};
    const nextOffsetLoc = offset + 2 + numEntries * 12;

    if (nextOffsetLoc > byteLength) continue;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = offset + 2 + i * 12;
      const tag = data.getUint16(entryOffset, littleEndian);
      const type = data.getUint16(entryOffset + 2, littleEndian);
      const count = data.getUint32(entryOffset + 4, littleEndian);

      // Parse and store tag
      ifd["t" + tag] = parseValue(data, entryOffset + 8, type, count, littleEndian);
    }
    
    // UTIF requires 'data' property to point to the raw buffer for decoding
    ifd.data = new Uint8Array(buffer);

    ifds.push(ifd);

    // Follow Next IFD
    // Safety check for nextOffsetLoc
    if (nextOffsetLoc + 4 <= byteLength) {
        const nextIFD = data.getUint32(nextOffsetLoc, littleEndian);
        if (nextIFD !== 0) queue.push(nextIFD);
    }

    // Follow SubIFDs (Tag 330)
    const subIfds = ifd["t" + TAG_SUBIFDS];
    if (subIfds && Array.isArray(subIfds)) {
      subIfds.forEach((subOffset: number) => {
        queue.push(subOffset);
      });
    }
    
    // Some formats (like Olympus) use EXIF offset for pointers too, but usually SubIFD is enough for image data.
  }

  return ifds;
};

// Check if image data is not completely transparent/black
const isImageValid = (rgba: Uint8Array, width: number, height: number): boolean => {
    if (!rgba || rgba.length === 0) return false;
    
    // Check center pixel
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const centerIdx = (cy * width + cx) * 4;
    
    if (centerIdx + 3 < rgba.length) {
        // If alpha is 0, it's likely invalid (failed decode)
        if (rgba[centerIdx + 3] === 0) return false;
    }

    // Check a few random pixels for non-zero content to be sure
    // UTIF sometimes returns all 0s for compressed DNGs it can't handle
    let nonZeroCount = 0;
    const step = Math.floor(rgba.length / 50); // check 50 points
    for (let i = 0; i < rgba.length; i += step) {
        if (rgba[i] > 0) nonZeroCount++;
    }

    return nonZeroCount > 0;
}

// Helper to render RGBA to Canvas/Image
const renderToImage = (rgba: Uint8Array, width: number, height: number): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    try {
      // Ensure dimensions are valid integers and Finite
      const w = Math.floor(width);
      const h = Math.floor(height);

      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        throw new Error(`Invalid image dimensions: ${width}x${height}`);
      }

      if (!isImageValid(rgba, w, h)) {
          throw new Error("Decoded image is empty or black (invalid RAW data)");
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context failed");
      
      const imgData = ctx.createImageData(w, h);
      // Copy data safely
      const len = Math.min(rgba.length, w * h * 4);
      imgData.data.set(rgba.subarray(0, len));
      
      ctx.putImageData(imgData, 0, 0);
      
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      // High quality export
      img.src = canvas.toDataURL('image/jpeg', 0.95);
    } catch (e) {
      reject(e);
    }
  });
};

export const loadDNG = async (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) throw new Error("Empty buffer");

        // 1. Deep Scan for ALL IFDs (Generic TIFF Scan)
        console.log("RAW: Starting Deep TIFF Scan...");
        const ifds = scanTIFFStructure(buffer);
        
        if (ifds.length === 0) throw new Error("No image data found in RAW file");

        // 2. Identify Candidates (must have dims)
        const candidates = ifds.filter(ifd => 
          ifd["t" + TAG_IMAGEWIDTH] && 
          ifd["t" + TAG_IMAGELENGTH]
        );

        if (candidates.length === 0) throw new Error("No valid image frames found in RAW");

        // 3. Sort Strategy: Prioritize RGB Previews over Raw CFA data
        const getVal = (v: any) => Array.isArray(v) ? v[0] : v;
        const getArea = (ifd: any) => {
             const w = getVal(ifd["t" + TAG_IMAGEWIDTH]);
             const h = getVal(ifd["t" + TAG_IMAGELENGTH]);
             if (typeof w !== 'number' || typeof h !== 'number') return 0;
             return w * h;
        };

        candidates.sort((a, b) => {
             const areaA = getArea(a);
             const areaB = getArea(b);
             
             // Photometric: 2 = RGB, 6 = YCbCr, 32803 = CFA (Raw)
             const photoA = getVal(a["t" + TAG_PHOTOMETRIC]);
             const photoB = getVal(b["t" + TAG_PHOTOMETRIC]);
             
             const isPreviewA = (photoA === 2 || photoA === 6);
             const isPreviewB = (photoB === 2 || photoB === 6);
             
             // If both are large enough (> 0.5 MP), prefer Preview over Raw
             // This avoids decoding raw bayer data which often fails in JS (black screen)
             const threshold = 500000; 
             if (areaA > threshold && areaB > threshold) {
                 if (isPreviewA && !isPreviewB) return -1;
                 if (!isPreviewA && isPreviewB) return 1;
             }

             // Otherwise sort by size
             return areaB - areaA;
        });

        console.log(`RAW: Found ${candidates.length} frames. Processing candidates...`);

        // 4. Try Decoding with Fallback
        
        let finalImage: HTMLImageElement | null = null;
        let lastError = null;

        for (const ifd of candidates) {
          try {
            const w = getVal(ifd["t" + TAG_IMAGEWIDTH]);
            const h = getVal(ifd["t" + TAG_IMAGELENGTH]);
            const comp = getVal(ifd["t" + TAG_COMPRESSION]);
            const photo = getVal(ifd["t" + TAG_PHOTOMETRIC]);
            
            console.log(`RAW: Attempting decode ${w}x${h} (Type:${photo}, Comp:${comp})...`);
            
            // UTIF.decodeImage parses data offsets. 
            UTIF.decodeImage(buffer, ifd); 
            
            const rgba = UTIF.toRGBA8(ifd);
            
            if (rgba) {
               // Validate width/height exists on IFD now
               if (!ifd.width || !ifd.height) {
                   ifd.width = w;
                   ifd.height = h;
               }
               
               // This call will throw if image is black/invalid
               finalImage = await renderToImage(rgba, ifd.width, ifd.height);
               console.log("RAW: Decode success!");
               break; 
            } else {
                throw new Error("Decoding returned empty data");
            }
          } catch (err) {
            console.warn(`RAW: Failed to decode frame.`, err);
            lastError = err;
            // Continue to next candidate
          }
        }

        if (finalImage) {
          resolve(finalImage);
        } else {
          reject(lastError || new Error("Could not decode any valid frames (all candidates failed or were black)."));
        }

      } catch (err) {
        console.error("RAW Load Error:", err);
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};
