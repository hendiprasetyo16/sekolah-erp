// src/modules/attendance/utils/excelHolidayParser.ts

export interface ParsedHolidayRow {
  date: string; // YYYY-MM-DD
  name: string;
}

type ZipXmlEntries = Record<string, string>;

/**
 * Mengonversi serial number tanggal Excel (epoch 1899-12-30) ke YYYY-MM-DD
 */
function excelSerialToYMD(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 90000) return null;
  const utcMs = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Menormalisasi berbagai format penulisan tanggal menjadi YYYY-MM-DD
 * Mendukung: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, dan Serial Excel
 */
export function normalizeHolidayDate(raw: string): string | null {
  const cleaned = raw.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return null;

  // 1. Format YYYY-MM-DD atau YYYY/MM/DD
  const isoMatch = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 2. Format DD/MM/YYYY atau DD-MM-YYYY (umum di Excel Indonesia)
  const idMatch = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (idMatch) {
    const [, d, m, y] = idMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 3. Serial Number Tanggal Excel (misal: 46251)
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    return excelSerialToYMD(Number(cleaned));
  }

  return null;
}

/**
 * Mengonversi huruf kolom Excel (A, B, C, ..., AA) ke indeks 0-based
 */
function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/**
 * Mengekstrak entri XML dari arsip ZIP (.xlsx) menggunakan Central Directory
 */
async function extractZipEntries(buffer: ArrayBuffer): Promise<ZipXmlEntries> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');
  const files: ZipXmlEntries = {};

  // Cari End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Format file .xlsx tidak valid atau rusak.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);

  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;

    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const fileNameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);

    const fileName = decoder.decode(
      bytes.slice(cdOffset + 46, cdOffset + 46 + fileNameLen)
    );

    const lfNameLen = view.getUint16(localHeaderOffset + 26, true);
    const lfExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lfNameLen + lfExtraLen;
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

    if (
      fileName === 'xl/sharedStrings.xml' ||
      fileName === 'xl/worksheets/sheet1.xml'
    ) {
      if (compressionMethod === 0) {
        files[fileName] = decoder.decode(compressedData);
      } else if (compressionMethod === 8) {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(compressedData);
        writer.close();
        const decompressedBuf = await new Response(ds.readable).arrayBuffer();
        files[fileName] = decoder.decode(decompressedBuf);
      }
    }

    cdOffset += 46 + fileNameLen + extraLen + commentLen;
  }

  return files;
}

/**
 * Membaca file Excel (.xlsx) atau .csv menjadi daftar { date, name }
 */
export async function parseHolidaySpreadsheetFile(
  file: File
): Promise<ParsedHolidayRow[]> {
  const lowerName = file.name.toLowerCase();
  const rowsMatrix: string[][] = [];

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const separator = line.includes(';') ? ';' : ',';
      const cols = line
        .split(separator)
        .map((c) => c.trim().replace(/^["']|["']$/g, ''));
      rowsMatrix.push(cols);
    }
  } else if (lowerName.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer();
    const entries = await extractZipEntries(buffer);
    const sheetXml = entries['xl/worksheets/sheet1.xml'];
    if (!sheetXml) {
      throw new Error('Sheet pertama tidak ditemukan pada file Excel.');
    }

    const parser = new DOMParser();

    // 1. Parse Shared Strings (jika ada)
    const sharedStrings: string[] = [];
    const ssXml = entries['xl/sharedStrings.xml'];
    if (ssXml) {
      const ssDoc = parser.parseFromString(ssXml, 'application/xml');
      const siNodes = Array.from(ssDoc.getElementsByTagName('si'));
      for (const si of siNodes) {
        const tNodes = Array.from(si.getElementsByTagName('t'));
        sharedStrings.push(tNodes.map((t) => t.textContent ?? '').join(''));
      }
    }

    // 2. Parse Worksheet Rows
    const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
    const rowNodes = Array.from(sheetDoc.getElementsByTagName('row'));

    for (const rowNode of rowNodes) {
      const rowValues: string[] = [];
      const cellNodes = Array.from(rowNode.getElementsByTagName('c'));

      for (const cell of cellNodes) {
        const ref = cell.getAttribute('r') ?? '';
        const colMatch = ref.match(/^([A-Z]+)/);
        const colIdx = colMatch
          ? colLettersToIndex(colMatch[1])
          : rowValues.length;
        const type = cell.getAttribute('t');

        let val: string;
        if (type === 's') {
          const vNode = cell.getElementsByTagName('v')[0];
          const ssIdx = Number(vNode?.textContent ?? -1);
          val = sharedStrings[ssIdx] ?? '';
        } else if (type === 'inlineStr') {
          const tNodes = Array.from(cell.getElementsByTagName('t'));
          val = tNodes.map((t) => t.textContent ?? '').join('');
        } else {
          const vNode = cell.getElementsByTagName('v')[0];
          val = vNode?.textContent ?? '';
        }

        rowValues[colIdx] = val.trim();
      }

      if (rowValues.some((v) => Boolean(v))) {
        rowsMatrix.push(rowValues);
      }
    }
  } else {
    throw new Error(
      'Format file belum didukung. Gunakan file Excel (.xlsx) atau (.csv).'
    );
  }

  // Konversi baris menjadi objek tanggal & keterangan (otomatis melewati baris header)
  const parsed: ParsedHolidayRow[] = [];
  for (const cols of rowsMatrix) {
    const rawDate = cols[0] ?? '';
    const rawName = cols[1] ?? '';
    const normalizedDate = normalizeHolidayDate(rawDate);

    if (normalizedDate && rawName.trim().length > 0) {
      parsed.push({
        date: normalizedDate,
        name: rawName.trim(),
      });
    }
  }

  return parsed;
}

/**
 * Membuat & mengunduh file template Excel (.xlsx) valid tanpa library eksternal
 */
export function downloadHolidayExcelTemplate(year: number): void {
  const sampleRows: Array<[string, string]> = [
    ['tanggal', 'keterangan'],
    [`${year}-01-01`, 'Tahun Baru Masehi'],
    [`${year}-05-01`, 'Hari Buruh Internasional'],
    [`${year}-06-01`, 'Hari Lahir Pancasila'],
    [`${year}-08-17`, 'Hari Kemerdekaan Republik Indonesia'],
    [`${year}-12-25`, 'Hari Raya Natal'],
  ];

  const escapeXml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const sheetRowsXml = sampleRows
    .map(
      (r, idx) =>
        `<row r="${idx + 1}">` +
        `<c r="A${idx + 1}" t="inlineStr"><is><t>${escapeXml(r[0])}</t></is></c>` +
        `<c r="B${idx + 1}" t="inlineStr"><is><t>${escapeXml(r[1])}</t></is></c>` +
        `</row>`
    )
    .join('');

  const xmlFiles: Array<{ name: string; content: string }> = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="HariLibur" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRowsXml}</sheetData>
</worksheet>`,
    },
  ];

  // Rakitan arsip ZIP STORED (tanpa kompresi) standar OpenXML
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i] = c;
  }
  const crc32 = (data: Uint8Array) => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const chunks: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const f of xmlFiles) {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = encoder.encode(f.content);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(8, 0, true); // stored
    lhView.setUint32(14, crc, true);
    lhView.setUint32(18, dataBytes.length, true);
    lhView.setUint32(22, dataBytes.length, true);
    lhView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader, dataBytes);

    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const cdView = new DataView(cdHeader.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint32(16, crc, true);
    cdView.setUint32(20, dataBytes.length, true);
    cdView.setUint32(24, dataBytes.length, true);
    cdView.setUint16(28, nameBytes.length, true);
    cdView.setUint32(42, offset, true);
    cdHeader.set(nameBytes, 46);
    centralDir.push(cdHeader);

    offset += localHeader.length + dataBytes.length;
  }

  const cdSize = centralDir.reduce((sum, arr) => sum + arr.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, xmlFiles.length, true);
  eocdView.setUint16(10, xmlFiles.length, true);
  eocdView.setUint32(12, cdSize, true);
  eocdView.setUint32(16, offset, true);

  const blobParts: BlobPart[] = [
    ...chunks.map((c) => new Uint8Array(c)),
    ...centralDir.map((c) => new Uint8Array(c)),
    new Uint8Array(eocd),
  ];
  const blob = new Blob(blobParts, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Template_Hari_Libur_${year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}