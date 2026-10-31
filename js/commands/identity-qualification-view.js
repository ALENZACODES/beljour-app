/** Accessible local-only presentation of externally measured identity metrics.
 *
 * No photo/biometric upload, HTML interpolation or secret-bearing controls.
 * All user-visible strings use the approved BELJOUR public name.
 * Author: John Khan.
 */
import { parseIdentityQualification, summarizeIdentityQualification, } from './identity-qualification.js';
function entry(document, kind, text, className) {
    const node = document.createElement(kind);
    node.textContent = text;
    if (className !== undefined)
        node.className = className;
    return node;
}
function rate(value) {
    return value === null ? 'Not measured' : `${(value * 100).toFixed(2)}%`;
}
function sliceRow(document, item) {
    const row = document.createElement('tr');
    row.appendChild(entry(document, 'td', item.dimension));
    row.appendChild(entry(document, 'td', item.label));
    row.appendChild(entry(document, 'td', String(item.metric.genuine)));
    row.appendChild(entry(document, 'td', String(item.metric.impostor)));
    row.appendChild(entry(document, 'td', rate(item.metric.true_accept.measured)));
    row.appendChild(entry(document, 'td', rate(item.metric.false_accept.measured)));
    row.appendChild(entry(document, 'td', item.sufficiently_sampled ? 'Coverage met' : 'Underpowered'));
    return row;
}
function metricTable(document, report) {
    const region = document.createElement('section');
    region.setAttribute('aria-label', 'Independent group measurements');
    const table = document.createElement('table');
    const caption = entry(document, 'caption', 'Externally labelled comparison groups; raw records remain local');
    table.appendChild(caption);
    const header = document.createElement('thead');
    const titles = ['Dimension', 'Group', 'Genuine', 'Impostor',
        'True accept', 'False accept', 'Evidence'];
    const headingRow = document.createElement('tr');
    for (const title of titles) {
        const cell = entry(document, 'th', title);
        cell.setAttribute('scope', 'col');
        headingRow.appendChild(cell);
    }
    header.appendChild(headingRow);
    table.appendChild(header);
    const body = document.createElement('tbody');
    for (const item of report.slices) {
        body.appendChild(sliceRow(document, item));
    }
    table.appendChild(body);
    region.appendChild(table);
    return region;
}
function reasonsSection(document, reasons) {
    const section = document.createElement('section');
    section.setAttribute('aria-label', 'Open qualification findings');
    section.appendChild(entry(document, 'h3', 'Open findings'));
    if (reasons.length === 0) {
        section.appendChild(entry(document, 'p', 'No reported technical findings. Independent release review remains required.'));
        return section;
    }
    const list = document.createElement('ul');
    for (const reason of reasons) {
        list.appendChild(entry(document, 'li', reason.replaceAll('_', ' ')));
    }
    section.appendChild(list);
    return section;
}
/** Atomically replace a local panel after a strict, privacy-safe input check. */
export function mountIdentityQualification(host, input) {
    const report = parseIdentityQualification(input);
    const summary = summarizeIdentityQualification(report);
    const document = host.ownerDocument;
    const content = document.createDocumentFragment();
    const article = document.createElement('article');
    article.setAttribute('aria-label', 'BELJOUR identity protection evidence');
    article.appendChild(entry(document, 'h2', `${summary.product} — ${summary.title}`));
    const status = entry(document, 'p', summary.outcome);
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    article.appendChild(status);
    article.appendChild(entry(document, 'p', summary.comparisons));
    article.appendChild(entry(document, 'p', summary.uncertainty));
    article.appendChild(entry(document, 'p', 'Identity-match scores are diagnostic measurements, not identity verification.'));
    article.appendChild(metricTable(document, report));
    article.appendChild(reasonsSection(document, report.reasons));
    const footer = entry(document, 'p', 'Not approved for release. Model, data rights and frozen real-face gates require independent review.');
    footer.setAttribute('data-release-status', 'unproven');
    article.appendChild(footer);
    content.appendChild(article);
    host.replaceChildren(content);
}
