import { api } from "@/lib/api";
import { effectiveItemLocation, formatLocation } from "@/lib/location";

type InventoryExportRow = {
    name: string;
    id: string;
    link: string;
    location?: string;
};

type ZipFile = {
    name: string;
    data: Uint8Array;
};

const textEncoder = new TextEncoder();

function sanitizeFilename(filename: string) {
    const safeFilename = filename.replace(/[\\/:*?"<>|]+/g, "-");
    return safeFilename.endsWith(".xlsx") ? safeFilename : `${safeFilename.replace(/\.[^.]+$/, "")}.xlsx`;
}

function escapeXml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function createCrc32Table() {
    const table = new Uint32Array(256);

    for (let i = 0; i < 256; i += 1) {
        let crc = i;
        for (let j = 0; j < 8; j += 1) {
            crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
        table[i] = crc >>> 0;
    }

    return table;
}

const crc32Table = createCrc32Table();

function crc32(data: Uint8Array) {
    let crc = 0xffffffff;

    for (const byte of data) {
        crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(buffer: Uint8Array, offset: number, value: number) {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(buffer: Uint8Array, offset: number, value: number) {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >>> 8) & 0xff;
    buffer[offset + 2] = (value >>> 16) & 0xff;
    buffer[offset + 3] = (value >>> 24) & 0xff;
}

function getDosDateTime() {
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    return { date, time };
}

function createZip(files: ZipFile[]) {
    const { date, time } = getDosDateTime();
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
        const name = textEncoder.encode(file.name);
        const checksum = crc32(file.data);
        const localHeader = new Uint8Array(30 + name.length);

        writeUint32(localHeader, 0, 0x04034b50);
        writeUint16(localHeader, 4, 20);
        writeUint16(localHeader, 6, 0);
        writeUint16(localHeader, 8, 0);
        writeUint16(localHeader, 10, time);
        writeUint16(localHeader, 12, date);
        writeUint32(localHeader, 14, checksum);
        writeUint32(localHeader, 18, file.data.length);
        writeUint32(localHeader, 22, file.data.length);
        writeUint16(localHeader, 26, name.length);
        writeUint16(localHeader, 28, 0);
        localHeader.set(name, 30);

        localParts.push(localHeader, file.data);

        const centralHeader = new Uint8Array(46 + name.length);
        writeUint32(centralHeader, 0, 0x02014b50);
        writeUint16(centralHeader, 4, 20);
        writeUint16(centralHeader, 6, 20);
        writeUint16(centralHeader, 8, 0);
        writeUint16(centralHeader, 10, 0);
        writeUint16(centralHeader, 12, time);
        writeUint16(centralHeader, 14, date);
        writeUint32(centralHeader, 16, checksum);
        writeUint32(centralHeader, 20, file.data.length);
        writeUint32(centralHeader, 24, file.data.length);
        writeUint16(centralHeader, 28, name.length);
        writeUint16(centralHeader, 30, 0);
        writeUint16(centralHeader, 32, 0);
        writeUint16(centralHeader, 34, 0);
        writeUint16(centralHeader, 36, 0);
        writeUint32(centralHeader, 38, 0);
        writeUint32(centralHeader, 42, offset);
        centralHeader.set(name, 46);

        centralParts.push(centralHeader);
        offset += localHeader.length + file.data.length;
    }

    const centralDirectoryOffset = offset;
    const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0);
    const endRecord = new Uint8Array(22);

    writeUint32(endRecord, 0, 0x06054b50);
    writeUint16(endRecord, 4, 0);
    writeUint16(endRecord, 6, 0);
    writeUint16(endRecord, 8, files.length);
    writeUint16(endRecord, 10, files.length);
    writeUint32(endRecord, 12, centralDirectorySize);
    writeUint32(endRecord, 16, centralDirectoryOffset);
    writeUint16(endRecord, 20, 0);

    const zipParts = [...localParts, ...centralParts, endRecord];
    const zipSize = zipParts.reduce((total, part) => total + part.length, 0);
    const zipBytes = new Uint8Array(zipSize);
    let zipOffset = 0;

    for (const part of zipParts) {
        zipBytes.set(part, zipOffset);
        zipOffset += part.length;
    }

    return new Blob([zipBytes.buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
}

function worksheetXml(rows: string[][]) {
    const sheetRows = rows
        .map((row, rowIndex) => {
            const rowNumber = rowIndex + 1;
            const cells = row
                .map((value, columnIndex) => {
                    const column = String.fromCharCode(65 + columnIndex);
                    return `<c r="${column}${rowNumber}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
                })
                .join("");

            return `<row r="${rowNumber}">${cells}</row>`;
        })
        .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <cols>
        <col min="1" max="1" width="32" customWidth="1"/>
        <col min="2" max="2" width="40" customWidth="1"/>
        <col min="3" max="3" width="64" customWidth="1"/>
    </cols>
    <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function workbookFiles(rows: string[][]): ZipFile[] {
    const files: Array<{ name: string; xml: string }> = [
        {
            name: "[Content_Types].xml",
            xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
    <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
        },
        {
            name: "_rels/.rels",
            xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
        },
        {
            name: "xl/workbook.xml",
            xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <sheets>
        <sheet name="Labels" sheetId="1" r:id="rId1"/>
    </sheets>
</workbook>`,
        },
        {
            name: "xl/_rels/workbook.xml.rels",
            xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
    <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
        },
        {
            name: "xl/styles.xml",
            xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
    <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
    <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`,
        },
        {
            name: "xl/worksheets/sheet1.xml",
            xml: worksheetXml(rows),
        },
    ];

    return files.map((file) => ({ name: file.name, data: textEncoder.encode(file.xml) }));
}

function downloadXlsx(filename: string, rows: string[][]) {
    const blob = createZip(workbookFiles(rows));
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = sanitizeFilename(filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}

export function downloadInventoryRowsXlsx(
    rows: InventoryExportRow[],
    filename = "inventory.xlsx",
) {
    if (rows.length === 0) {
        throw new Error("Choose at least one row to export.");
    }

    downloadXlsx(
        filename,
        [
            ["Name", "UUID", "Link", "Location"],
            ...rows.map((row) => [row.name, row.id, row.link, row.location ?? ""]),
        ],
    );
    return rows.length;
}

export async function downloadSelectedAssetsXlsx(itemIds: Iterable<string>, filename = "selected-items.xlsx") {
    const uniqueItemIds = Array.from(new Set(itemIds));
    if (uniqueItemIds.length === 0) {
        throw new Error("Choose at least one item to export.");
    }

    const results = await Promise.allSettled(uniqueItemIds.map((itemId) => api.getItem(itemId)));
    const items = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

    if (items.length === 0) {
        throw new Error("Selected items could not be loaded.");
    }

    return downloadInventoryRowsXlsx(
        items.map((item) => ({
            name: item.name,
            id: item.id,
            link: `${window.location.origin}/items/${item.id}`,
            location: formatLocation(effectiveItemLocation(item)),
        })),
        filename,
    );
}

export async function downloadSelectedKitsXlsx(containerIds: Iterable<string>, filename = "selected-containers.xlsx") {
    const uniqueContainerIds = Array.from(new Set(containerIds));
    if (uniqueContainerIds.length === 0) {
        throw new Error("Choose at least one container to export.");
    }

    const results = await Promise.allSettled(uniqueContainerIds.map((containerId) => api.getContainer(containerId)));
    const containers = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

    if (containers.length === 0) {
        throw new Error("Selected containers could not be loaded.");
    }

    return downloadInventoryRowsXlsx(
        containers.map((container) => ({
            name: container.name,
            id: container.id,
            link: `${window.location.origin}/containers/${container.id}`,
            location: formatLocation(container.location),
        })),
        filename,
    );
}
