/** A reviewer-facing technical lock worksheet, never an approval certificate.
 * Converts strictly validated, photo-free rows into a deterministic summary.
 * Author: John Khan.
 */
import { PRO_COMMAND_NAMES } from './lock-matrix.js';
import { verifyTuesdayLockJson } from './tuesday-lock.js';
function summarizeRanges(levels) {
    if (levels.length === 0)
        return 'none';
    const sorted = [...new Set(levels)].sort((a, b) => a - b);
    const parts = [];
    let start = sorted[0] ?? 0;
    let end = start;
    for (const level of sorted.slice(1)) {
        if (level === end + 1) {
            end = level;
            continue;
        }
        parts.push(start === end ? (start / 10).toFixed(1) :
            `${(start / 10).toFixed(1)}–${(end / 10).toFixed(1)}`);
        start = level;
        end = level;
    }
    parts.push(start === end ? (start / 10).toFixed(1) :
        `${(start / 10).toFixed(1)}–${(end / 10).toFixed(1)}`);
    return parts.join(', ');
}
function percentile(rows, key, fraction) {
    const measured = rows.map((row) => row[key]).filter((value) => value !== null);
    if (measured.length === 0)
        return null;
    measured.sort((a, b) => a - b);
    const rank = (measured.length - 1) * fraction;
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    return (measured[lower] ?? 0) + ((measured[upper] ?? 0) - (measured[lower] ?? 0)) *
        (rank - lower);
}
function timing(value) {
    return value === null ? 'not measured' : value.toFixed(2);
}
function count(rows, status) {
    return rows.filter((row) => row.status === status).length;
}
function commandRows(packet, command) {
    return packet.rows.filter((row) => row.command === command);
}
export async function renderTuesdayLockSheet(json) {
    const packet = await verifyTuesdayLockJson(json);
    const missing = packet.rows.filter((row) => row.status === 'missing').length;
    const lines = [
        '# BELJOUR | Five Pro Commands: Tuesday technical lock',
        '',
        `Run: \`${packet.run_id}\` | Renderer: \`${packet.renderer_build}\``,
        `Technical verdict: **${packet.technical_status.toUpperCase().replace(/_/g, ' ')}**`,
        'Independent real-face gate: **NOT RUN**. Production identity qualification: **NOT VERIFIED**.',
        'Release authorized: **NO**. This sheet is not an external evaluation.',
        '',
        `Observed slots: ${205 - missing}/205 (5 commands × 41 decimal levels from 1.0–5.0).`,
        `Budget requirements: preview ≤ ${packet.matrix.preview_budget_ms} ms; ` +
            `full render ≤ ${packet.matrix.export_budget_ms} ms. Device timings require a physical device.`,
        '',
        '| Command | Captured/41 | Missing | Safety failures | Over budget | Device evidence | ' +
            'Preview median / P95 ms | Export median / P95 ms |',
        '|---|---:|---:|---:|---:|---:|---|---|',
    ];
    for (const command of PRO_COMMAND_NAMES) {
        const rows = commandRows(packet, command);
        const checked = rows.filter((row) => row.status !== 'missing').length;
        const device = rows.filter((row) => row.measured_device === true).length;
        lines.push(`| /${command} | ${checked} | ${count(rows, 'missing')} | ` +
            `${count(rows, 'failed_safety')} | ${count(rows, 'over_budget')} | ${device} | ` +
            `${timing(percentile(rows, 'preview_ms', 0.5))} / ` +
            `${timing(percentile(rows, 'preview_ms', 0.95))} | ` +
            `${timing(percentile(rows, 'export_ms', 0.5))} / ` +
            `${timing(percentile(rows, 'export_ms', 0.95))} |`);
    }
    lines.push('', '## Per-command action list', '', 'Every missing or failing decimal level requires a fresh measured result.');
    for (const command of PRO_COMMAND_NAMES) {
        const rows = commandRows(packet, command);
        const values = (status) => rows.filter((row) => row.status === status).map((row) => row.level_tenths);
        lines.push(`- \`/${command}\`: missing ${summarizeRanges(values('missing'))}; ` +
            `safety failed ${summarizeRanges(values('failed_safety'))}; ` +
            `timing failed ${summarizeRanges(values('over_budget'))}.`);
    }
    lines.push('', '## External release prerequisites', '', '- Commercial identity model with verified training rights and real-person validation.', '- Preregistered real-face definitions, identical build and external frozen input hashes.', '- Independent 100,000-face evaluation including demographic slices and no-regression checks.', '- Physical-device preview/export budgets and separate human quality reviews.', '- Judge-ready application and end-to-end demonstration.', '', 'The full JSON packet contains all 205 rows and an integrity checksum.', 'The checksum does not attest authenticity, consent, training rights or release readiness.');
    return lines.join('\n') + '\n';
}
//# sourceMappingURL=tuesday-sheet.js.map