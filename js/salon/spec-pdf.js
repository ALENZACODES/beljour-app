/** Printable decision spec sheet: page 1 holds the settings only (shade, placement, cost and
 * longevity, chosen settings, limits and the consent footer). A second page with photos
 * exists only when she included them, her unedited photo first. Same original PDF writer as
 * the salon pack; no fonts, packages, remote assets or tracking. Author: John Khan.
 */
import { canvasEncoder, stripJpegMetadata } from "../save/export.js";
import { fit, hatchMap, line, lines, printable, rgba, stream, utf8, wrapText, writePdf } from "./pdf.js";
function section(title, rows, y, budget) {
    const wrapped = rows.flatMap((row) => wrapText(row, 88));
    const shown = wrapped.slice(0, budget);
    if (wrapped.length > budget)
        shown[shown.length - 1] = "More detail is in the text companion.";
    const body = lines(shown, 40, y - 18, 10, 13);
    return { content: line(title, 40, y, 13) + body.content, end: body.end - 8 };
}
export async function renderSheetPdf(sheet, encoder = canvasEncoder()) {
    if (sheet.photos.length && sheet.photos[0].role !== "original")
        throw new RangeError("Her unedited photo must come first.");
    const pages = sheet.photos.length ? 2 : 1;
    const objects = [];
    const add = (value) => { objects.push(typeof value === "string" ? utf8(value) : value); return objects.length; };
    // Fixed numbering: 1 catalog, 2 pages, 3 font, 4..(3+pages) page objects, then contents, images and info.
    const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
    const kids = Array.from({ length: pages }, (_, i) => `${4 + i} 0 R`).join(" ");
    add(`<< /Type /Pages /Count ${pages} /Kids [${kids}] >>`);
    const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const firstContent = 4 + pages, images = sheet.photos.map((_, i) => firstContent + pages + i);
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${firstContent} 0 R >>`);
    if (pages === 2) {
        const xobjects = images.map((n, i) => `/P${i} ${n} 0 R`).join(" ");
        add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> /XObject << ${xobjects} >> >> /Contents ${firstContent + 1} 0 R >>`);
    }
    const footer = lines(wrapText(sheet.footer, 90), 40, 55, 10, 13).content;
    let first = line("Decision spec sheet", 40, 800, 22) + line(sheet.name, 40, 776, 14) + line(sheet.label, 40, 758, 9);
    let y = 730;
    for (const [title, rows, budget] of [["1. Shade", sheet.specLines, 9], ["2. Where it goes", sheet.placementLines, 4]]) {
        const part = section(title, rows, y, budget);
        first += part.content;
        y = part.end;
    }
    if (sheet.map) {
        first += hatchMap(sheet.map, 40, y - 66);
        y -= 80;
    }
    for (const [title, rows, budget] of [["3. Cost and how long it lasts", sheet.costLines, 8],
        ["4. Chosen settings", sheet.steps.map((s) => `${s.tool}: ${s.strength} of 100; ${s.settings}`), 4],
        ["Photos and limits", [sheet.photosIncluded ? "Photos: on page 2 by your choice, your unedited photo first." : "Photos: none. Settings only.",
                ...sheet.limitations], 6]]) {
        if (!rows.length)
            continue;
        const part = section(title, rows, y, Math.max(1, Math.min(budget, Math.floor((y - 110) / 13))));
        first += part.content;
        y = part.end;
    }
    add(stream("", utf8(first + footer)));
    if (pages === 2) {
        let second = line("Photos you chose to include", 40, 800, 18);
        sheet.photos.forEach((photo, i) => {
            const top = 770 - i * 340;
            second += `q ${fit(photo.image.width, photo.image.height, 40, top - 300, 515, 300)} cm /P${i} Do Q\n` + line(photo.caption, 40, top - 316, 11);
        });
        add(stream("", utf8(second + footer)));
    }
    for (const photo of sheet.photos) {
        const bytes = stripJpegMetadata(await encoder.encode(rgba(photo.image), { type: "image/jpeg", quality: .92, label: photo.role === "preview" ? "Simulation" : null }));
        add(stream(`/Type /XObject /Subtype /Image /Width ${photo.image.width} /Height ${photo.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, bytes));
    }
    const info = add(`<< /Title (${printable("Decision spec sheet - " + sheet.name)}) /Author (John Khan) /Creator (BELJOUR) >>`);
    return { pdf: writePdf(objects, catalog, info), pages };
}
//# sourceMappingURL=spec-pdf.js.map