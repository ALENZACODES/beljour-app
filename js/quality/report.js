/**
 * Quality report format `beljour-quality/1` (CONTRACTS.md §17), TypeScript side.
 * Builds, validates and summarises the same JSON shape as api/plumb_api/quality/report.py,
 * so a report from either language passes the other's validator.
 *
 * Author: John Khan.
 */
import { NAMES, maxAbsDifference } from "./metrics.js";
export const FORMAT = "beljour-quality/1";
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function summarise(photos) {
    const byCode = {};
    let total = 0, passed = 0;
    for (const photo of photos) {
        for (const c of photo.checks) {
            const slot = (byCode[c.code] ??= { passed: 0, failed: 0 });
            if (c.passed) {
                slot.passed++;
                passed++;
            }
            else
                slot.failed++;
            total++;
        }
    }
    const sorted = {};
    for (const k of Object.keys(byCode).sort())
        sorted[k] = byCode[k];
    return { checks: total, passed, failed: total - passed, passed_all: total > 0 && passed === total, by_code: sorted };
}
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function checkProblems(where, c) {
    if (!isObject(c))
        return [`${where}: a check must be an object`];
    const out = [];
    const code = c.code;
    if (!(typeof code === "string" && code in NAMES))
        out.push(`${where}: unknown check code ${String(c.code)}`);
    else if (c.name !== NAMES[code])
        out.push(`${where}: name must be ${NAMES[code]}`);
    if (typeof c.passed !== "boolean")
        out.push(`${where}: passed must be true or false`);
    if (!isObject(c.measured))
        out.push(`${where}: measured must be an object`);
    if (typeof c.rule !== "string" || !c.rule)
        out.push(`${where}: rule must be a non-empty string`);
    if (!isObject(c.thresholds) || !Object.values(c.thresholds).every((v) => typeof v === "number")) {
        out.push(`${where}: thresholds must map names to numbers`);
    }
    return out;
}
/** Problems with a report; empty when it follows §17. */
export function validateReport(report) {
    if (!isObject(report))
        return ["a report must be a JSON object"];
    const out = [];
    if (report.format !== FORMAT)
        out.push(`format must be ${FORMAT}`);
    if (typeof report.tool !== "string" || !NAME.test(report.tool))
        out.push("tool must be a lowercase identifier");
    if (typeof report.tool_version !== "string" || !VERSION.test(report.tool_version))
        out.push("tool_version must be major.minor.patch");
    if (report.language !== "python" && report.language !== "typescript")
        out.push("language must be python or typescript");
    if (typeof report.created !== "string" || !DATE.test(report.created))
        out.push("created must be a YYYY-MM-DD date");
    const photos = report.photos;
    if (!Array.isArray(photos) || !photos.length)
        return [...out, "photos must be a non-empty list"];
    photos.forEach((photo, i) => {
        const where = `photos[${i}]`;
        if (!isObject(photo)) {
            out.push(`${where}: must be an object`);
            return;
        }
        if (typeof photo.photo !== "string" || !photo.photo)
            out.push(`${where}: photo id required`);
        if (typeof photo.synthetic !== "boolean")
            out.push(`${where}: synthetic must be true or false`);
        if (photo.stop !== null && photo.stop !== undefined && typeof photo.stop !== "string")
            out.push(`${where}: stop must be a string or null`);
        if (!Array.isArray(photo.checks) || !photo.checks.length) {
            out.push(`${where}: checks must be a non-empty list`);
            return;
        }
        photo.checks.forEach((c, j) => out.push(...checkProblems(`${where}.checks[${j}]`, c)));
    });
    if (!out.length) {
        const entries = photos;
        if (maxAbsDifference(report.summary, summarise(entries)) !== 0)
            out.push("summary does not match the checks");
        if (report.synthetic !== entries.every((p) => p.synthetic))
            out.push("synthetic must be true exactly when every photo is synthetic");
    }
    return out;
}
export function buildReport(tool, toolVersion, photos, created) {
    const report = {
        format: FORMAT,
        tool,
        tool_version: toolVersion,
        language: "typescript",
        created: created ?? new Date().toISOString().slice(0, 10),
        synthetic: photos.every((p) => p.synthetic),
        photos,
        summary: summarise(photos),
    };
    const problems = validateReport(report);
    if (problems.length)
        throw new RangeError(problems.join("; "));
    return report;
}
/** A short Markdown table for notes and reviews. */
export function toMarkdown(report) {
    const s = report.summary;
    const lines = [`### ${report.tool} ${report.tool_version} (${report.language})`, "",
        `${s.passed} of ${s.checks} checks passed${report.synthetic ? " on synthetic photos only." : "."}`, "",
        "| Photo | Stop | Check | Result | Measured |", "|---|---|---|---|---|"];
    for (const photo of report.photos) {
        for (const c of photo.checks) {
            const measured = Object.entries(c.measured).filter(([, v]) => !Array.isArray(v)).map(([k, v]) => `${k}=${v}`).join(", ");
            lines.push(`| ${photo.photo} | ${photo.stop ?? ""} | ${c.code} ${c.name} | ${c.passed ? "pass" : "FAIL"} | ${measured} |`);
        }
    }
    return lines.join("\n") + "\n";
}
//# sourceMappingURL=report.js.map