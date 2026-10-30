/** Tuesday worksheet must disclose incomplete evidence and device limitations.
 * Test vectors are numerical only. Author: John Khan.
 */
import { PRO_COMMAND_NAMES } from './lock-matrix.js';
import { buildTuesdayLockPacket, serializeTuesdayPacket } from './tuesday-lock.js';
import { renderTuesdayLockSheet } from './tuesday-sheet.js';
import { ProRenderError } from './runtime.js';
function ensure(condition, reason) {
    if (!condition)
        throw new Error(`Tuesday sheet: ${reason}`);
}
function fixture() {
    return PRO_COMMAND_NAMES.flatMap((command) => Array.from({ length: 41 }, (_, i) => ({
        command, levelTenths: i + 10,
        previewMs: 12.5 + i / 10, exportMs: 92 + i,
        identityApplied: true, alphaUnchanged: true,
        protectedUnchanged: true, neutralCorrect: true,
        skinLiftL: command === 'studioquality' ? 1.3 : null,
        poseMinimumJacobian: command === 'poseonly' ? 0.8 : null,
        poseRetention: command === 'poseonly' ? 0.9 : null,
        measuredDevice: false,
    })));
}
async function rejects(callback) {
    try {
        await callback();
    }
    catch (error) {
        ensure(error instanceof ProRenderError && error.code === 'invalid_lock_packet', 'only typed invalid packet errors permitted');
        return;
    }
    throw new Error('Invalid packet rendered as an approval sheet');
}
export async function testTuesdaySheetR10H() {
    let tests = 0;
    const full = await buildTuesdayLockPacket(fixture(), { runId: 'synthetic-205', rendererBuild: 'r10h' });
    const sample = await renderTuesdayLockSheet(serializeTuesdayPacket(full));
    ensure(sample.includes('Observed slots: 205/205'), 'all measured slots visible');
    ensure(sample.includes('TECHNICAL REVIEW REQUIRED'), 'no release promotion');
    ensure(sample.includes('Independent real-face gate: **NOT RUN**'), 'missing external gate visible');
    ensure(sample.includes('Release authorized: **NO**'), 'explicit refusal');
    ensure(sample.includes('0 |') && sample.includes('0 | 0 | 0'), 'device, missing and failures visible');
    tests += 5;
    for (const command of PRO_COMMAND_NAMES) {
        ensure(sample.includes(`| /${command} | 41 | 0 | 0 | 0 | 0 |`), `complete synthetic row for ${command}`);
        ensure(sample.includes(`- \`/${command}\`: missing none; safety failed none; timing failed none.`), `no hidden blockers for ${command}`);
        tests += 2;
    }
    const empty = await buildTuesdayLockPacket([], { runId: 'empty', rendererBuild: 'r10h' });
    const missing = await renderTuesdayLockSheet(serializeTuesdayPacket(empty));
    ensure(missing.includes('INCOMPLETE') && missing.includes('Observed slots: 0/205'), 'no synthetic metadata interpreted as success');
    ensure(missing.includes('missing 1.0–5.0') && missing.includes('not measured'), 'every missing decimal level represented');
    tests += 2;
    const altered = fixture();
    altered.splice(0, 1);
    altered[0] = { ...altered[0], identityApplied: false };
    altered[2] = { ...altered[2], previewMs: 200 };
    const blocked = await buildTuesdayLockPacket(altered, { runId: 'blocked', rendererBuild: 'r10h' });
    const blockedText = await renderTuesdayLockSheet(serializeTuesdayPacket(blocked));
    ensure(blockedText.includes('BLOCKED') && blockedText.includes('missing 1.0'), 'failed and missing measurements shown');
    ensure(blockedText.includes('safety failed 1.1') && blockedText.includes('timing failed 1.3'), 'individual failed decimal levels shown');
    tests += 2;
    await rejects(() => renderTuesdayLockSheet('{"fake":true}'));
    tests++;
    const damaged = serializeTuesdayPacket(full).replace('205', '204');
    await rejects(() => renderTuesdayLockSheet(damaged));
    tests++;
    ensure(!sample.includes('image_bytes') && !sample.includes('face_hash') &&
        !sample.includes('PRIVATE'), 'sheet omits unrelated biometric identifiers');
    tests++;
    return tests;
}
//# sourceMappingURL=test-tuesday-sheet-r10h.js.map