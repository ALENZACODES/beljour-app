/** Compare technical lock results across builds without hiding lost evidence.
 * An external face set, model approval and human review remain separate.
 * Author: John Khan.
 */
import { ProRenderError } from './runtime.js';
import { verifyTuesdayLockJson } from './tuesday-lock.js';
const BAD = new Set(['missing', 'failed_safety', 'over_budget']);
function mark(list, row, issue) {
    if (!list.some((entry) => entry.command === row.command && entry.levelTenths === row.level_tenths)) {
        list.push({ command: row.command, levelTenths: row.level_tenths, issue });
    }
}
export async function compareTuesdayLockPackets(oldJson, newJson) {
    const oldPacket = await verifyTuesdayLockJson(oldJson);
    const newPacket = await verifyTuesdayLockJson(newJson);
    if (oldPacket.run_id !== newPacket.run_id) {
        throw new ProRenderError('incompatible_lock_run', 'Technical lock runs have different fixture identities.');
    }
    const regressions = [];
    let improvements = 0;
    for (let index = 0; index < 205; index++) {
        const before = oldPacket.rows[index];
        const after = newPacket.rows[index];
        if (!before || !after) {
            throw new ProRenderError('invalid_lock_packet', 'Every decimal command level must be compared.');
        }
        if (before.status === 'missing' &&
            (after.status === 'failed_safety' || after.status === 'over_budget')) {
            mark(regressions, after, `newly_observed_failure:${after.status}`);
        }
        else if (!BAD.has(before.status) && BAD.has(after.status)) {
            mark(regressions, after, `new_failure:${after.status}`);
        }
        else if (before.status === 'missing' && after.status === 'missing') {
            continue;
        }
        else if (BAD.has(before.status) && !BAD.has(after.status)) {
            improvements++;
        }
        else if (before.status === 'over_budget' && after.status === 'failed_safety') {
            mark(regressions, after, 'performance_to_safety_failure');
        }
        if (before.identity_applied === true && after.identity_applied === false) {
            mark(regressions, after, 'identity_guard_regressed');
        }
        if (before.alpha_unchanged === true && after.alpha_unchanged === false) {
            mark(regressions, after, 'alpha_regressed');
        }
        if (before.neutral_correct === true && after.neutral_correct === false) {
            mark(regressions, after, 'neutral_output_regressed');
        }
    }
    return Object.freeze({
        sourceRun: oldPacket.run_id, oldBuild: oldPacket.renderer_build,
        newBuild: newPacket.renderer_build, regressions: Object.freeze(regressions),
        improvements, checked: 205, status: regressions.length ? 'regressed' : 'no_new_regressions',
        independentRealfaceResult: 'NOT_RUN', releaseQualified: false,
    });
}
//# sourceMappingURL=tuesday-compare.js.map