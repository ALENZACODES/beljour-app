/** Local DOM-contract tests for BELJOUR identity-evidence reporting.
 * No browser deployment, external data, images, network or biometric vectors.
 * Author: John Khan.
 */
import { mountIdentityQualification } from './identity-qualification-view.js';
import { QualificationInputError } from './identity-qualification.js';
function ensure(condition, message) {
    if (!condition)
        throw new Error(`Identity panel contract: ${message}`);
}
class FakeNode {
    tag;
    ownerDocument;
    textContent = '';
    className = '';
    attributes = new Map();
    children = [];
    constructor(tag, ownerDocument) {
        this.tag = tag;
        this.ownerDocument = ownerDocument;
    }
    appendChild(node) {
        this.children.push(node);
        return node;
    }
    replaceChildren(...nodes) {
        this.children.length = 0;
        this.children.push(...nodes);
    }
    setAttribute(name, value) {
        this.attributes.set(name, value);
    }
}
class FakeDocument {
    createElement(tag) {
        return new FakeNode(tag, this);
    }
    createDocumentFragment() {
        return new FakeNode('#fragment', this);
    }
}
function collect(root) {
    const output = [root];
    for (const child of root.children)
        output.push(...collect(child));
    return output;
}
function metadata(status, reasons = []) {
    const dims = ['source', 'tone', 'gender', 'yaw', 'occlusion', 'image_size'];
    function interval(numerator, denominator) {
        return {
            numerator,
            denominator,
            measured: numerator / denominator,
            lower95: Math.max(0, numerator / denominator - 0.07),
            upper95: Math.min(1, numerator / denominator + 0.07),
        };
    }
    function metric(genuine, impostor) {
        return {
            genuine,
            impostor,
            true_accept: interval(genuine, genuine),
            false_accept: interval(0, impostor),
        };
    }
    return {
        version: 'beljour-identity-pair-qualification/1',
        status,
        reasons,
        policy_sha256: 'a'.repeat(64),
        all_pairs: metric(80, 80),
        slices: dims.flatMap((dimension) => ['A', 'B'].map((label) => ({
            dimension,
            label,
            metric: metric(40, 40),
            sufficiently_sampled: true,
        }))),
        worst_true_accept_gap: 0,
        measured_on_external_faces: true,
        independently_approved: false,
        release_qualified: false,
    };
}
function simulate(host, report) {
    mountIdentityQualification(host, report);
}
export function testIdentityQualificationViewR11H() {
    let checks = 0;
    const document = new FakeDocument();
    const host = document.createElement('main');
    simulate(host, metadata('ready_for_independent_review'));
    const tree = collect(host);
    const visible = tree.map((node) => node.textContent).join(' ');
    ensure(visible.includes('BELJOUR'), 'the approved public brand is used');
    ensure(!visible.includes('LOOK.' + 'GOOD'), 'retired public branding is absent');
    ensure(visible.includes('independent review'), 'readiness never becomes release approval');
    ensure(visible.includes('Not approved for release'), 'hard release warning is visible');
    ensure(visible.includes('80 genuine'), 'real denominators are displayed');
    ensure(visible.includes('80 impostor'), 'false-accept denominators are displayed');
    ensure(visible.includes('Identity-match scores'), 'diagnostics are not misrepresented as identity verification');
    checks += 7;
    const tables = tree.filter((node) => node.tag === 'table');
    ensure(tables.length === 1, 'one tabular group summary');
    ensure(tree.filter((node) => node.tag === 'tr').length === 13, 'twelve group rows and one header row');
    ensure(tree.filter((node) => node.tag === 'th').length === 7, 'all seven table headings present');
    ensure(tree.some((node) => node.tag === 'caption'), 'table has an accessible caption');
    ensure(tree.filter((node) => node.tag === 'th').every((node) => node.attributes.get('scope') === 'col'), 'header cells have column scope');
    ensure(tree.some((node) => node.attributes.get('role') === 'status' &&
        node.attributes.get('aria-live') === 'polite'), 'status is politely announced');
    checks += 6;
    ensure(tree.filter((node) => node.tag === 'img').length === 0, 'no photos are inserted into qualification panel');
    ensure(tree.filter((node) => node.tag === 'button').length === 0, 'no dead approval controls are rendered');
    ensure(tree.filter((node) => node.tag === 'script').length === 0, 'no script nodes are produced by metadata');
    ensure(tree.filter((node) => node.tag === 'a').length === 0, 'no remote evidence links are generated');
    ensure(tree.every((node) => [...node.attributes.keys()].every((key) => !key.startsWith('on'))), 'no inline event handlers are added');
    checks += 5;
    simulate(host, metadata('unproven', ['frozen_slice_underpowered']));
    const incomplete = collect(host);
    ensure(incomplete.some((node) => node.textContent.includes('Evidence incomplete')), 'incomplete results use distinct copy');
    ensure(incomplete.some((node) => node.textContent.includes('frozen slice underpowered')), 'technical findings are displayed as text only');
    ensure(incomplete.every((node) => node.attributes.get('data-release-status') !== 'passed'), 'incomplete report cannot masquerade as public release approval');
    checks += 3;
    simulate(host, metadata('blocked', ['identity_regression_detected']));
    const blocked = collect(host);
    ensure(blocked.some((node) => node.textContent.includes('Qualification blocked')), 'identity regressions are visibly blocked');
    ensure(blocked.some((node) => node.textContent.includes('identity regression detected')), 'a blocked reason is visible');
    ensure(blocked.every((node) => node.attributes.get('data-release-status') !== 'passed'), 'blocked report does not expose release controls');
    checks += 3;
    const original = host.children[0];
    const forged = metadata('ready_for_independent_review');
    forged.release_qualified = true;
    try {
        simulate(host, forged);
        throw new Error('Forged release status was rendered');
    }
    catch (error) {
        ensure(error instanceof QualificationInputError, 'untrusted approval produces a typed validation refusal');
    }
    ensure(host.children[0] === original, 'invalid replacement leaves existing local evidence visible');
    checks += 2;
    const unexpected = metadata('blocked', ['bad_input']);
    unexpected.photo = '<img src="https://unsafe.invalid/upload">';
    try {
        simulate(host, unexpected);
        throw new Error('Unexpected image metadata was accepted');
    }
    catch (error) {
        ensure(error instanceof QualificationInputError, 'unexpected photo-bearing payload is refused before DOM mutation');
    }
    ensure(host.children[0] === original, 'failed photo-bearing input cannot mutate the existing panel');
    checks += 2;
    for (let revision = 0; revision < 30; revision++) {
        const status = revision % 2 === 0 ? 'unproven' : 'blocked';
        simulate(host, metadata(status, ['independent_review_required']));
        ensure(host.children.length === 1, 'repeated updates replace instead of leaking nodes');
        ensure(collect(host).filter((node) => node.tag === 'table').length === 1, 'repeated renders keep a single table');
        checks += 2;
    }
    return checks;
}
//# sourceMappingURL=test-identity-qualification-view-r11h.js.map