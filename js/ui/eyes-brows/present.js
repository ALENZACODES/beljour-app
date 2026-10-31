/** Human-readable measured maps and hypothetical tables. Author: John Khan. */
import { h } from "../../dom.js";
import { lashMapCsv, lashMapSvg } from "../../engines/eyes/index.js";
import { download } from "./files.js";
function scalar(value) {
    if (typeof value === "boolean")
        return value ? "yes" : "no";
    if (typeof value === "string")
        return value.length <= 250 ? value : null;
    if (typeof value === "number" && Number.isFinite(value))
        return Number.isInteger(value) ? String(value) : value.toFixed(3);
    return null;
}
export function tableData(value, limit = 40) {
    if (!Array.isArray(value) || !value.length || value.length > limit)
        return null;
    const objects = value.filter(item => item && typeof item === "object" && !Array.isArray(item));
    if (objects.length !== value.length)
        return null;
    const columns = [...new Set(objects.flatMap(item => Object.keys(item).filter(key => scalar(item[key]) !== null)))].slice(0, 8);
    if (!columns.length)
        return null;
    return { columns, rows: objects.map(item => columns.map(key => scalar(item[key]) ?? "—")) };
}
function table(title, value) {
    const data = tableData(value);
    if (!data)
        return null;
    return h("div", { class: "eb-table" }, h("table", {}, h("caption", {}, title), h("thead", {}, h("tr", {}, ...data.columns.map(column => h("th", { scope: "col" }, column.replaceAll("_", " "))))), h("tbody", {}, ...data.rows.map(row => h("tr", {}, ...row.map(cell => h("td", {}, cell)))))));
}
export function detailView(metrics) {
    const content = h("section", { class: "eb-readings", "aria-label": "Local preview measurements" }, h("h3", {}, "Your preview details"));
    const readings = h("dl", { class: "eb-measures" });
    const omitted = new Set(["label", "feature", "version", "warnings", "provider", "reason"]);
    for (const [key, value] of Object.entries(metrics)) {
        if (omitted.has(key))
            continue;
        const text = scalar(value);
        if (text !== null)
            readings.append(h("dt", {}, key.replaceAll("_", " ")), h("dd", {}, text));
    }
    if (Array.isArray(metrics.maps) && metrics.maps.length > 0) {
        try {
            const svg = lashMapSvg(metrics.maps);
            const csv = lashMapCsv(metrics.maps);
            content.append(h("figure", { class: "eb-lash-map" }, h("img", {
                src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
                alt: "Technician map showing seven lash sectors per eye; lengths are relative to eye width, not millimetres.",
            }), h("figcaption", {}, "Original lash map. Confirm practical length, weight and suitability with a qualified technician.")), h("div", { class: "eb-actions" }, h("button", { type: "button", class: "eb-button", onclick: () => download(new Blob([svg], { type: "image/svg+xml" }), "beljour-lash-map.svg") }, "Download lash diagram"), h("button", { type: "button", class: "eb-button", onclick: () => download(new Blob([csv], { type: "text/csv" }), "beljour-lash-map.csv") }, "Download map measurements")));
        }
        catch {
            content.append(h("p", {}, "A complete checked lash map is not available for this rendering."));
        }
    }
    const details = metrics.details;
    if (details && typeof details === "object" && !Array.isArray(details)) {
        const item = details;
        const rows = table("Hypothetical progression — your assumptions", item.rows);
        if (rows)
            content.append(rows);
        for (const key of ["note", "safety_note", "warning"])
            if (typeof item[key] === "string")
                content.append(h("p", {}, item[key]));
    }
    if (Array.isArray(metrics.sides)) {
        for (const side of metrics.sides) {
            if (!side || typeof side !== "object")
                continue;
            const data = side;
            for (const key of ["map", "zones", "segments", "lash_map"]) {
                const drawing = table(`${String(data.side ?? "Eye")} technician map — relative units`, data[key]);
                if (drawing)
                    content.append(drawing);
            }
        }
    }
    content.append(h("details", { class: "eb-measurements" }, h("summary", {}, "Preview measurements"), readings, h("p", { class: "eb-note" }, "Numerical checks describe this rendering. Appearance, realism and real-face acceptance need separate review.")));
    return content;
}
