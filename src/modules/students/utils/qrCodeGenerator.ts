// src/modules/students/utils/qrCodeGenerator.ts
// ============================================================================
// GENERATOR QR CODE SVG MURNI (ZERO-DEPENDENCY, ISO/IEC 18004 LEVEL M)
// ============================================================================

export interface QrCodeSvgResult {
    size: number;
    value: string;
    pathD: string;
}

interface QrVersionSpec {
    version: number;
    size: number;
    dataCodewords: number;
    ecCodewords: number;
    alignmentCenters: readonly number[];
}

const QR_VERSION_SPECS: readonly QrVersionSpec[] = [
    { version: 1, size: 21, dataCodewords: 16, ecCodewords: 10, alignmentCenters: [] },
    { version: 2, size: 25, dataCodewords: 28, ecCodewords: 16, alignmentCenters: [6, 18] },
    { version: 3, size: 29, dataCodewords: 44, ecCodewords: 26, alignmentCenters: [6, 22] },
];

// Format info 15-bit untuk Error Correction Level M (00) + Mask 0..7
const FORMAT_INFO_LEVEL_M: readonly number[] = [
    0x5412,
    0x5125,
    0x5e7c,
    0x5b4b,
    0x45f9,
    0x40ce,
    0x4f97,
    0x4aa0,
];

// Tabel logaritma & eksponensial Galois Field GF(2^8) (polinomial primitif 0x11D)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) {
            x ^= 0x11d;
        }
    }
    for (let i = 255; i < 512; i++) {
        GF_EXP[i] = GF_EXP[i - 255];
    }
})();

function gfMultiply(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function computeReedSolomonEc(data: number[], ecLength: number): number[] {
    let generator: number[] = [1];
    for (let i = 0; i < ecLength; i++) {
        const nextPoly = new Array<number>(generator.length + 1).fill(0);
        const factor = GF_EXP[i];
        for (let j = 0; j < generator.length; j++) {
            nextPoly[j] ^= generator[j];
            nextPoly[j + 1] ^= gfMultiply(generator[j], factor);
        }
        generator = nextPoly;
    }

    const remainder = [...data, ...new Array<number>(ecLength).fill(0)];
    for (let i = 0; i < data.length; i++) {
        const coef = remainder[i];
        if (coef !== 0) {
            for (let j = 1; j < generator.length; j++) {
                remainder[i + j] ^= gfMultiply(generator[j], coef);
            }
        }
    }

    return remainder.slice(data.length);
}

function shouldInvertMask(maskId: number, row: number, col: number): boolean {
    switch (maskId) {
        case 0:
            return (row + col) % 2 === 0;
        case 1:
            return row % 2 === 0;
        case 2:
            return col % 3 === 0;
        case 3:
            return (row + col) % 3 === 0;
        case 4:
            return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
        case 5:
            return ((row * col) % 2) + ((row * col) % 3) === 0;
        case 6:
            return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
        default:
            return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    }
}

/**
 * Menghasilkan path SVG tunggal untuk QR Code dari teks NISN/NIS siswa.
 */
export function encodeQrCodeSvg(rawValue: string): QrCodeSvgResult | null {
    const cleanValue = rawValue.trim();
    if (!cleanValue) return null;

    const encoder = new TextEncoder();
    let payloadBytes = encoder.encode(cleanValue);

    let chosenSpec = QR_VERSION_SPECS.find(
        (spec) => payloadBytes.length <= spec.dataCodewords - 2
    );

    if (!chosenSpec) {
        chosenSpec = QR_VERSION_SPECS[QR_VERSION_SPECS.length - 1];
        payloadBytes = payloadBytes.slice(0, chosenSpec.dataCodewords - 2);
    }

    const { size, dataCodewords, ecCodewords, alignmentCenters } = chosenSpec;

    // 1. Susun bitstream mode Byte (0100) + panjang + payload + terminator
    const bits: number[] = [0, 1, 0, 0];
    for (let i = 7; i >= 0; i--) {
        bits.push((payloadBytes.length >> i) & 1);
    }
    for (const byteVal of payloadBytes) {
        for (let i = 7; i >= 0; i--) {
            bits.push((byteVal >> i) & 1);
        }
    }

    const terminatorLen = Math.min(4, dataCodewords * 8 - bits.length);
    for (let i = 0; i < terminatorLen; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const codewords: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        let byteVal = 0;
        for (let b = 0; b < 8; b++) {
            byteVal = (byteVal << 1) | bits[i + b];
        }
        codewords.push(byteVal);
    }

    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (codewords.length < dataCodewords) {
        codewords.push(padBytes[padIdx % 2]);
        padIdx++;
    }

    const ecBytes = computeReedSolomonEc(codewords, ecCodewords);
    const fullCodewords = [...codewords, ...ecBytes];
    const allBits: number[] = [];
    for (const cw of fullCodewords) {
        for (let i = 7; i >= 0; i--) {
            allBits.push((cw >> i) & 1);
        }
    }

    // 2. Siapkan matriks modul & pola fungsi (Finder, Timing, Alignment, Format)
    const matrix: number[][] = Array.from({ length: size }, () =>
        new Array<number>(size).fill(0)
    );
    const isFunction: boolean[][] = Array.from({ length: size }, () =>
        new Array<boolean>(size).fill(false)
    );

    const setFunctionModule = (r: number, c: number, dark: boolean) => {
        matrix[r][c] = dark ? 1 : 0;
        isFunction[r][c] = true;
    };

    // Tiga Finder Pattern + Separator putih
    const finderOrigins: Array<[number, number]> = [
        [0, 0],
        [0, size - 7],
        [size - 7, 0],
    ];
    for (const [fy, fx] of finderOrigins) {
        for (let dy = -1; dy <= 7; dy++) {
            for (let dx = -1; dx <= 7; dx++) {
                const r = fy + dy;
                const c = fx + dx;
                if (r < 0 || r >= size || c < 0 || c >= size) continue;
                const inOuter = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
                const onBorder = dy === 0 || dy === 6 || dx === 0 || dx === 6;
                const inInner = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
                setFunctionModule(r, c, inOuter && (onBorder || inInner));
            }
        }
    }

    // Timing Pattern horizontal & vertikal
    for (let i = 8; i < size - 8; i++) {
        setFunctionModule(6, i, i % 2 === 0);
        setFunctionModule(i, 6, i % 2 === 0);
    }

    // Alignment Pattern (untuk Version 2 & 3)
    for (const ay of alignmentCenters) {
        for (const ax of alignmentCenters) {
            if (isFunction[ay][ax]) continue;
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const isDark =
                        Math.abs(dy) === 2 ||
                        Math.abs(dx) === 2 ||
                        (dy === 0 && dx === 0);
                    setFunctionModule(ay + dy, ax + dx, isDark);
                }
            }
        }
    }

    // Dark Module wajib
    setFunctionModule(size - 8, 8, true);

    // Reservasi area Format Info
    for (let i = 0; i < 9; i++) {
        isFunction[8][i] = true;
        isFunction[i][8] = true;
    }
    for (let i = 0; i < 8; i++) {
        isFunction[8][size - 1 - i] = true;
    }
    for (let i = 0; i < 7; i++) {
        isFunction[size - 1 - i][8] = true;
    }

    // 3. Isi data bit secara zigzag dengan Mask 0
    const maskId = 0;
    let bitIdx = 0;
    let col = size - 1;
    let upward = true;

    while (col > 0) {
        if (col === 6) col--;
        for (let step = 0; step < size; step++) {
            const r = upward ? size - 1 - step : step;
            for (let dx = 0; dx < 2; dx++) {
                const c = col - dx;
                if (!isFunction[r][c]) {
                    let bit = bitIdx < allBits.length ? allBits[bitIdx] : 0;
                    bitIdx++;
                    if (shouldInvertMask(maskId, r, c)) {
                        bit ^= 1;
                    }
                    matrix[r][c] = bit;
                }
            }
        }
        col -= 2;
        upward = !upward;
    }

    // 4. Tulis bit Format Info ke dua lokasi cadangan
    const formatBits = FORMAT_INFO_LEVEL_M[maskId];
    for (let i = 0; i < 15; i++) {
        const bit = (formatBits >> (14 - i)) & 1;

        if (i <= 5) matrix[8][i] = bit;
        else if (i === 6) matrix[8][7] = bit;
        else if (i === 7) matrix[8][8] = bit;
        else if (i === 8) matrix[7][8] = bit;
        else matrix[14 - i][8] = bit;

        if (i <= 6) matrix[size - 1 - i][8] = bit;
        else matrix[8][size - 15 + i] = bit;
    }

    // 5. Gabungkan seluruh kotak hitam menjadi 1 string SVG <path>
    const segments: string[] = [];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (matrix[r][c] === 1) {
                segments.push(`M${c} ${r}h1v1h-1Z`);
            }
        }
    }

    return {
        size,
        value: cleanValue,
        pathD: segments.join(''),
    };
}