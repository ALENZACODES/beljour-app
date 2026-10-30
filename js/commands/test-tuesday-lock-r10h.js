/** Tuesday's technical lock packet cannot turn incomplete engineering data
 * into an independent real-face result. Tests use no user images.
 * Author: John Khan.
 */
import { PRO_COMMAND_NAMES } from './lock-matrix.js';
import { buildTuesdayLockPacket, serializeTuesdayPacket, verifyTuesdayLockJson, } from './tuesday-lock.js';
import { ProRenderError } from './runtime.js';
function ensure(condition, reason) {
    if (!condition)
        throw new Error(`Tuesday packet: ${reason}`);
}
function sampleRows() {
    const rows = [];
    for (const command of PRO_COMMAND_NAMES) {
        for (let level = 10; level <= 50; level++) {
            rows.push({ command, levelTenths: level, previewMs: 18.5, exportMs: 110.5,
                identityApplied: true, alphaUnchanged: true,
                protectedUnchanged: true, neutralCorrect: true, measuredDevice: false,
                skinLiftL: command === 'studioquality' ? 1.1 : null,
                poseMinimumJacobian: command === 'poseonly' ? 0.81 : null,
                poseRetention: command === 'poseonly' ? 0.92 : null });
        }
    }
    return rows;
}
async function refuses(callback) {
    try {
        await callback();
    }
    catch (error) {
        ensure(error instanceof ProRenderError && error.code === 'invalid_lock_packet', 'typed refusal, never an unhandled error');
        return;
    }
    throw new Error('A damaged Tuesday packet was accepted');
}
async function resign(data) {
    const { sha256: _ignored, ...content } = data;
    const canonical = (value) => {
        if (value === null || typeof value !== 'object')
            return JSON.stringify(value);
        if (Array.isArray(value))
            return `[${value.map(canonical).join(',')}]`;
        const entries = value;
        return `{${Object.keys(entries).sort().map((key) => `${JSON.stringify(key)}:${canonical(entries[key])}`).join(',')}}`;
    };
    const bytes = new TextEncoder().encode(canonical(content));
    const hashed = await crypto.subtle.digest('SHA-256', bytes);
    const digest = [...new Uint8Array(hashed)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return canonical({ ...content, sha256: digest });
}
export async function testTuesdayLockR10H() {
    let checks = 0;
    const records = sampleRows();
    const packet = await buildTuesdayLockPacket(records, { runId: 'tuesday-synthetic', rendererBuild: 'r10h' });
    ensure(packet.rows.length === 205 && packet.total_slots === 205, 'all 205 slots named');
    ensure(packet.technical_status === 'technical_review_required', 'local checks need separate review');
    ensure(!packet.release_qualified && !packet.production_identity_qualified &&
        packet.independent_realface_result === 'NOT_RUN', 'real-face clearance never implied');
    checks += 3;
    const restored = await verifyTuesdayLockJson(serializeTuesdayPacket(packet));
    ensure(restored.sha256 === packet.sha256 && restored.rows.length === 205, 'deterministic strict round-trip');
    checks++;
    const reordered = await buildTuesdayLockPacket([...records].reverse(), { runId: 'tuesday-synthetic', rendererBuild: 'r10h' });
    ensure(reordered.sha256 === packet.sha256, 'independent of observation collection order');
    checks++;
    const empty = await buildTuesdayLockPacket([], { runId: 'empty', rendererBuild: 'r10h' });
    ensure(empty.technical_status === 'incomplete' && empty.rows.length === 205 &&
        empty.rows.every((row) => row.status === 'missing'), 'empty ledger cannot pass');
    checks++;
    await verifyTuesdayLockJson(serializeTuesdayPacket(empty));
    checks++;
    for (const bad of [
        { ...records[0], identityApplied: false },
        { ...records[0], alphaUnchanged: false },
        { ...records[0], neutralCorrect: false },
        { ...records[0], previewMs: 101 },
        { ...records[0], exportMs: 2001 },
    ]) {
        const changed = [bad, ...records.slice(1)];
        const locked = await buildTuesdayLockPacket(changed, { runId: 'fail', rendererBuild: 'r10h' });
        ensure(locked.technical_status === 'blocked', 'failed evidence not promoted');
        ensure(locked.rows[0]?.status === (bad.previewMs > 100 || bad.exportMs > 2000 ?
            'over_budget' : 'failed_safety'), 'typed blocker is visible');
        checks += 2;
    }
    await refuses(() => buildTuesdayLockPacket([records[0], records[0]], { runId: 'duplicate', rendererBuild: 'r10h' }));
    checks++;
    await refuses(() => buildTuesdayLockPacket([], {
        runId: 'private/file.jpg', rendererBuild: 'r10h',
    }));
    checks++;
    const damaged = serializeTuesdayPacket(packet).replace('18.5', '19.5');
    ensure(damaged !== serializeTuesdayPacket(packet), 'negative control actually changes data');
    await refuses(() => verifyTuesdayLockJson(damaged));
    checks += 2;
    for (const [name, value] of [
        ['release_qualified', true],
        ['production_identity_qualified', true],
        ['independent_realface_result', 'PASSED'],
        ['technical_status', 'approved'],
        ['total_slots', 999],
    ]) {
        const forged = { ...packet, [name]: value };
        await refuses(async () => verifyTuesdayLockJson(await resign(forged)));
        checks++;
    }
    const alteredRow = { ...packet, rows: [{ ...packet.rows[0], level_tenths: 50 },
            ...packet.rows.slice(1)] };
    await refuses(async () => verifyTuesdayLockJson(await resign(alteredRow)));
    checks++;
    const leaked = { ...packet, filename: '/private/portrait.jpg' };
    await refuses(async () => verifyTuesdayLockJson(await resign(leaked)));
    checks++;
    const alteredMatrix = { ...packet, matrix: { ...packet.matrix, status: 'device_measured' } };
    await refuses(async () => verifyTuesdayLockJson(await resign(alteredMatrix)));
    checks++;
    const injected = { ...packet, rows: [{ ...packet.rows[0], face_hash: 'f'.repeat(64) },
            ...packet.rows.slice(1)] };
    await refuses(async () => verifyTuesdayLockJson(await resign(injected)));
    checks++;
    const missingExtra = { ...empty, rows: [{ ...empty.rows[0], preview_ms: 0 },
            ...empty.rows.slice(1)] };
    await refuses(async () => verifyTuesdayLockJson(await resign(missingExtra)));
    checks++;
    return checks;
}
//# sourceMappingURL=test-tuesday-lock-r10h.js.map