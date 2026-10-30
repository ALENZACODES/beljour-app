/** Identity-guarded browser receipts must be bound to one active photograph.
 * Author: John Khan.
 */
import { BrowserObservedLockLedger } from './observed-ledger.js';
import { parseProCommands } from './plan.js';
import { ProBrowserRuntime, ProRenderError } from './runtime.js';
function assert(ok, message) {
    if (!ok)
        throw new Error(`Browser lock ledger: ${message}`);
}
function photo(value) {
    const pixels = new Uint8Array(14 * 16 * 3);
    for (let i = 0; i < pixels.length; i++)
        pixels[i] = (i * 11 + value * 13) % 256;
    return { width: 14, height: 16, channels: 3, pixels };
}
function runner() {
    return new ProBrowserRuntime({ cleanup: async (frame) => ({ ...frame, pixels: new Uint8Array(frame.pixels) }) }, {
        modelEvidenceKey: 'synthetic-test',
        enforce: async (_original, candidate) => ({ frame: candidate,
            identityMatch: 100, status: 'kept', syntheticOnly: true }),
    });
}
async function capture(ledger, frame, level) {
    const plan = parseProCommands(`/cleanup ${level}`);
    const runtime = runner();
    const signal = new AbortController().signal;
    const preview = await runtime.run(plan, frame, 'preview', 'fixture', signal, () => true);
    const exported = await runtime.run(plan, frame, 'export', 'fixture', signal, () => true);
    await ledger.observe(ledger.ticket(), frame, plan, preview, exported, { checkedProtectedRegions: true });
}
async function rejects(action, expected) {
    try {
        await action();
    }
    catch (error) {
        assert(error instanceof ProRenderError && error.code === expected, `expected ${expected}`);
        return;
    }
    throw new Error(`Missing ${expected}`);
}
export async function testObservedLedgerR9H() {
    let checks = 0;
    const ledger = new BrowserObservedLockLedger();
    await rejects(async () => ledger.ticket(), 'photo_missing');
    checks++;
    const first = photo(1);
    const ticket = await ledger.openPhoto(first);
    assert(ticket.revision > 0 && ledger.state.open, 'open creates revision');
    checks++;
    await capture(ledger, first, '2.0');
    assert(ledger.state.observed === 1 && ledger.state.commandsObserved === 1, 'one observed command');
    assert(ledger.state.levelsMissing === 204 && ledger.report().status === 'incomplete', 'missing levels remain unproven');
    checks += 2;
    const previous = ledger.snapshot();
    await rejects(() => capture(ledger, first, '2.0'), 'duplicate_lock_evidence');
    assert(ledger.snapshot().length === previous.length, 'duplicate rejection atomic');
    checks += 2;
    await capture(ledger, first, '1.0');
    assert(ledger.snapshot()[0]?.levelTenths === 10 &&
        ledger.snapshot()[1]?.levelTenths === 20, 'stable sorted evidence');
    checks++;
    const different = photo(8);
    const older = ledger.ticket();
    await ledger.openPhoto(different);
    await rejects(() => ledger.observe(older, different, parseProCommands('/cleanup 2.0'), { image: different, steps: [], quality: 'preview', elapsedMs: 1, targetMs: 100,
        withinBudget: true, originalUnchanged: true }, { image: different, steps: [], quality: 'export', elapsedMs: 1, targetMs: 2000,
        withinBudget: true, originalUnchanged: true }), 'stale_preview');
    assert(ledger.state.observed === 0, 'new photo clears prior evidence');
    checks += 2;
    await rejects(() => capture(ledger, first, '3.0'), 'photo_mismatch');
    checks++;
    await capture(ledger, different, '3.0');
    assert(ledger.state.observed === 1, 'current photo receives new evidence');
    checks++;
    const exposed = JSON.stringify(ledger.state) + JSON.stringify(ledger.report());
    for (const forbidden of ['pixels', 'hash', 'modelEvidenceKey', 'personMask', 'landmarks']) {
        assert(!exposed.includes(forbidden), `public output contains ${forbidden}`);
        checks++;
    }
    ledger.closePhoto();
    assert(!ledger.state.open && ledger.state.observed === 0, 'close clears all evidence');
    checks++;
    await rejects(async () => ledger.snapshot(), 'photo_missing');
    checks++;
    assert(!ledger.state.releaseQualified, 'no local release approval');
    checks++;
    return checks;
}
//# sourceMappingURL=test-observed-ledger-r9h.js.map