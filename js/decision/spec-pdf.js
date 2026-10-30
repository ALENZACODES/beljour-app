const utf8 = (text) => new TextEncoder().encode(text);
function join(parts) {
    const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}
// Built-in Helvetica with WinAnsi. Unsupported characters are transliterated in this printable
// copy; the UTF-8 text companion preserves the original wording.
function printable(value) {
    return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/Δ/g, "Delta ")
        .replace(/[→]/g, " -> ").replace(/[×]/g, "x").replace(/[·]/g, " - ").replace(/[–—]/g, "-")
        .replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");
}
function wrapText(text, width = 82) {
    const out = [];
    for (const paragraph of text.split("\n")) {
        let row = "";
        for (const word of paragraph.split(/\s+/)) {
            if (row && row.length + word.length + 1 > width) {
                out.push(row);
                row = "";
            }
            if (word.length > width) {
                if (row) {
                    out.push(row);
                    row = "";
                }
                for (let i = 0; i < word.length; i += width)
                    out.push(word.slice(i, i + width));
            }
            else
                row = row ? `${row} ${word}` : word;
        }
        if (row || !paragraph)
            out.push(row);
    }
    return out;
}
function line(text, x, y, size = 12) {
    return `BT /F1 ${size} Tf ${x} ${y} Td (${printable(text)}) Tj ET\n`;
}
function lines(rows, x, y, size = 12, gap = 16) {
    return { content: rows.map((text, i) => line(text, x, y - i * gap, size)).join(""), end: y - rows.length * gap };
}
function stream(bytes) {
    return join([utf8(`<< /Length ${bytes.length} >>\nstream\n`), bytes, utf8("\nendstream")]);
}
/** Numbered objects to a PDF 1.4 file with an exact byte cross-reference table. */
function writePdf(objects, catalog, info) {
    const body = [utf8("%PDF-1.4\n")];
    const offsets = [0];
    let offset = body[0].length;
    objects.forEach((object, index) => {
        offsets.push(offset);
        const chunk = join([utf8(`${index + 1} 0 obj\n`), object, utf8("\nendobj\n")]);
        body.push(chunk);
        offset += chunk.length;
    });
    body.push(utf8(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(value => `${String(value).padStart(10, "0")} 00000 n \n`).join("")
        + `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
    return join(body);
}
function section(title, rows, y, budget) {
    const wrapped = rows.flatMap((row) => wrapText(row, 88));
    const shown = wrapped.slice(0, budget);
    if (wrapped.length > budget)
        shown[shown.length - 1] = "More detail is in the text companion.";
    const body = lines(shown, 40, y - 18, 10, 13);
    return { content: line(title, 40, y, 13) + body.content, end: body.end - 8 };
}
export async function renderSheetPdf(sheet) {
    const objects = [];
    const add = (value) => { objects.push(typeof value === "string" ? utf8(value) : value); return objects.length; };
    // Fixed numbering: 1 catalog, 2 pages, 3 font, 4 page, 5 contents, 6 info.
    const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
    add("<< /Type /Pages /Count 1 /Kids [4 0 R] >>");
    const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents 5 0 R >>`);
    const footer = lines(wrapText(sheet.footer, 90), 40, 55, 10, 13).content;
    let page = line("Decision spec sheet", 40, 800, 22) + line(sheet.name, 40, 776, 14) + line(sheet.label, 40, 758, 9);
    let y = 730;
    for (const [title, rows, budget] of [["1. Shade", sheet.specLines, 9], ["2. Where it goes", sheet.placementLines, 4],
        ["3. Cost and how long it lasts", sheet.costLines, 8],
        ["Photos and limits", ["Photos: none. Settings only.", ...sheet.limitations], 6]]) {
        const part = section(title, rows, y, Math.max(1, Math.min(budget, Math.floor((y - 110) / 13))));
        page += part.content;
        y = part.end;
    }
    add(stream(utf8(page + footer)));
    const info = add(`<< /Title (${printable("Decision spec sheet - " + sheet.name)}) /Author (John Khan) /Creator (BELJOUR) >>`);
    return { pdf: writePdf(objects, catalog, info), pages: 1 };
}
//# sourceMappingURL=spec-pdf.js.map