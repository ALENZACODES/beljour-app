/** Measure guarded preview/export outcomes for five decimal Pro Commands.
 * Synthetic results cannot certify production identity or face quality.
 * Author: John Khan.
 */
import { levelFromTenths } from './levels.js';
import { referenceNeutralResize } from './neutral-reference.js';
import { PRO_COMMAND_NAMES } from './lock-matrix.js';
import { BrowserObservedLockLedger } from './observed-ledger.js';
import { createProPlan } from './plan.js';
import { ProRenderError, checkedFrame } from './runtime.js';
function checkOptions(options) {
    const commands = options.commands ?? PRO_COMMAND_NAMES;
    const levels = options.levels ?? Array.from({ length: 41 }, (_, i) => i + 10);
    if (!Array.isArray(commands) || commands.length === 0 || commands.length > 5 ||
        new Set(commands).size !== commands.length ||
        commands.some((command) => !PRO_COMMAND_NAMES.includes(command)) ||
        !Array.isArray(levels) || levels.length === 0 || levels.length > 41 ||
        new Set(levels).size !== levels.length ||
        levels.some((level) => !Number.isInteger(level) || level < 10 || level > 50) ||
        (options.checkedProtectedRegions !== undefined &&
            typeof options.checkedProtectedRegions !== 'boolean')) {
        throw new ProRenderError('invalid_sweep', 'Sweep commands or levels are invalid.');
    }
    return { commands, levels };
}
export async function runObservedBrowserSweep(session, source, options = {}) {
    checkedFrame(source);
    const settings = checkOptions(options);
    const ledger = new BrowserObservedLockLedger();
    await ledger.openPhoto(source);
    let attempted = 0;
    let cancelled = false;
    const problems = [];
    const signal = options.signal ?? new AbortController().signal;
    const isCurrent = options.current ?? (() => true);
    for (const command of settings.commands) {
        if (cancelled)
            break;
        for (const level of settings.levels) {
            if (signal.aborted || !isCurrent()) {
                cancelled = true;
                break;
            }
            attempted++;
            const plan = createProPlan([{ name: command, index: 0,
                    level: levelFromTenths(level), scale: 2 }]);
            try {
                const preview = await session.run(plan, 'preview', signal, isCurrent);
                const exported = await session.run(plan, 'export', signal, isCurrent);
                await ledger.observe(ledger.ticket(), source, plan, preview, exported, {
                    checkedProtectedRegions: options.checkedProtectedRegions === true,
                    studio: command === 'studioquality' ? session.studioMetrics : null,
                    pose: command === 'poseonly' ? session.poseMetrics : null,
                    upscaleReference: command === 'upscale' ? referenceNeutralResize(source, 2) : null,
                });
            }
            catch (error) {
                const code = error instanceof ProRenderError ? error.code : 'unexpected_failure';
                problems.push({ command, levelTenths: level, code });
                if (code === 'stale_preview' || code === 'unexpected_failure') {
                    cancelled = true;
                    break;
                }
            }
        }
    }
    const report = ledger.report();
    return Object.freeze({ attempted, captured: ledger.state.observed, cancelled,
        problems: Object.freeze(problems), report,
        source: 'actual_guarded_synthetic_or_local', releaseQualified: false,
        observations: ledger.snapshot() });
}
