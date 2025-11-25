
import { LUTContainer } from "../types";

const parseCube = (text: string, name: string): LUTContainer => {
    const lines = text.split('\n');
    let size = 0;
    let min = [0, 0, 0];
    let max = [1, 1, 1];
    let dataIndex = 0;
    let data: Float32Array | null = null;
    
    // 1. Parse Header
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith('#') || line === '') continue;

        if (line.startsWith('LUT_3D_SIZE')) {
            const parts = line.split(/\s+/);
            size = parseInt(parts[1]);
            data = new Float32Array(size * size * size * 3);
            continue;
        }

        if (line.startsWith('DOMAIN_MIN')) {
            const parts = line.split(/\s+/);
            min = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
            continue;
        }

        if (line.startsWith('DOMAIN_MAX')) {
             const parts = line.split(/\s+/);
             max = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
             continue;
        }
        
        if (!/^[A-Z_]+/.test(line)) {
            if (!data) throw new Error("LUT_3D_SIZE not found before data");
            let currentLine = i;
            while (currentLine < lines.length && dataIndex < data.length) {
                line = lines[currentLine].trim();
                if (line === '' || line.startsWith('#')) {
                    currentLine++;
                    continue;
                }
                const parts = line.split(/\s+/);
                if (parts.length >= 3) {
                    data[dataIndex] = (parseFloat(parts[0]) - min[0]) / (max[0] - min[0]);
                    data[dataIndex + 1] = (parseFloat(parts[1]) - min[1]) / (max[1] - min[1]);
                    data[dataIndex + 2] = (parseFloat(parts[2]) - min[2]) / (max[2] - min[2]);
                    dataIndex += 3;
                }
                currentLine++;
            }
            break; 
        }
    }

    if (!data || size === 0) throw new Error("Invalid CUBE file");

    return {
        size,
        data,
        name
    };
};

export const loadCubeFile = async (url: string, customName?: string): Promise<LUTContainer> => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch LUT: ${response.statusText}`);
    }
    const text = await response.text();
    // Use custom name if provided (e.g. uploaded file), else fallback to URL or part of it
    const name = customName || url;
    return parseCube(text, name);
};
