import { statusCopy } from "../../layout/continuous/cassette-contract.js";
import { judgeNode, judgeParagraph } from "./judge-elements.js";
function button(doc, title, key, callback) {
    const node = judgeNode(doc, "button", "lg-cassette-button", title);
    node.type = "button";
    node.dataset.cassetteAction = key;
    node.addEventListener("click", callback);
    return node;
}
function cachedItem(doc, state, cassette, id, drawn, actions) {
    const item = judgeNode(doc, "li", "lg-cassette-card");
    const card = cassette.cards.find((record) => record.id === id);
    if (!card)
        throw new Error("Unregistered cassette item");
    item.dataset.cassetteFamily = card.family;
    const heading = judgeNode(doc, "h4", "lg-cassette-card-heading", card.title);
    const provenance = judgeParagraph(doc, card.label, "lg-cassette-provenance");
    const explanation = judgeParagraph(doc, card.explanation);
    const product = judgeParagraph(doc, `Example category: ${card.productType}. No product has been tested.`);
    const status = cassette.status(id, state, drawn);
    const detail = judgeParagraph(doc, statusCopy(status), "lg-cassette-detail");
    const action = button(doc, "Review cached illustration", `review-${id}`, () => actions.choose(id));
    action.disabled = !cassette.canRead(id, state, drawn);
    action.setAttribute("aria-pressed", String(cassette.snapshot.selectedId === id));
    item.append(heading, provenance, explanation, product, detail, action);
    return item;
}
/** The gallery has no network API, form submission, or automatic navigation. */
export function renderCassettePanel(doc, state, drawn, cassette, actions) {
    const section = judgeNode(doc, "section", "lg-cassette-panel");
    section.setAttribute("aria-label", "Offline cached result examples");
    const mark = judgeNode(doc, "span", "lg-cassette-monogram");
    mark.setAttribute("aria-label", "BELJOUR — FULL BEAUTY STUDIO. Your best day. Still you.");
    mark.append(judgeNode(doc, "span", "lg-demo-wordmark", "BELJOUR"), judgeNode(doc, "span", "lg-demo-brand-description", "FULL BEAUTY STUDIO"), judgeNode(doc, "span", "lg-demo-brand-tagline", "Your best day. Still you."));
    const title = judgeNode(doc, "h3", "lg-cassette-heading", "Offline styling examples");
    const lead = judgeParagraph(doc, "Three authored, locally cached illustrations. These are not YouCam outputs or real skin readings.");
    section.append(mark, title, lead);
    const cards = judgeNode(doc, "ul", "lg-cassette-grid");
    for (const card of cassette.cards) {
        cards.append(cachedItem(doc, state, cassette, card.id, drawn, actions));
    }
    section.append(cards);
    const status = judgeParagraph(doc, cassette.explanation(state, drawn), "lg-cassette-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    section.append(status);
    const observation = cassette.snapshot;
    section.append(judgeParagraph(doc, `${observation.observed.length} of 3 local examples viewed; zero uploads, zero units.`, "lg-cassette-caption"));
    if (observation.lastResult?.status === "ready") {
        section.append(button(doc, "Add example to demo bag", "bag-add", actions.addToBag));
        const chosen = observation.lastResult.card;
        section.append(judgeParagraph(doc, `Viewed: ${chosen.title}. ${chosen.label}. This is drawn-source evidence only.`, "lg-cassette-caption"));
    }
    const bag = judgeNode(doc, "section", "lg-cassette-bag");
    bag.setAttribute("aria-label", "Demo bag without checkout");
    bag.append(judgeNode(doc, "h4", "", "Sample bag"));
    bag.append(judgeParagraph(doc, "Illustrative categories only. No price, order or billing."));
    const bagList = judgeNode(doc, "ul", "lg-cassette-bag-list");
    for (const item of observation.bag.items) {
        const entry = judgeNode(doc, "li", "lg-cassette-bag-item");
        entry.append(judgeParagraph(doc, `${item.category} · ${item.title}`));
        entry.append(button(doc, "Remove", `bag-remove-${item.id}`, () => actions.removeFromBag(item.id)));
        bagList.append(entry);
    }
    if (!observation.bag.items.length) {
        bagList.append(judgeNode(doc, "li", "", "No examples in bag."));
    }
    bag.append(bagList);
    section.append(bag);
    const separate = judgeNode(doc, "div", "lg-cassette-separate");
    separate.append(judgeNode(doc, "h4", "", "Separate production screen"));
    const flag = observation.providerScreensEnabled;
    separate.append(judgeParagraph(doc, flag
        ? "The public feature flag permits opening a separate app page. This walkthrough sends nothing."
        : "Production provider-aware screens are hidden by the feature flag."));
    if (flag && observation.lastResult?.status === "ready") {
        const label = judgeNode(doc, "label", "lg-cassette-acknowledge");
        const input = judgeNode(doc, "input", "");
        input.type = "checkbox";
        input.dataset.cassetteAction = "separate-consent";
        input.checked = observation.acknowledged;
        input.addEventListener("change", () => actions.acknowledge(input.checked));
        label.append(input, judgeNode(doc, "span", "", "I understand the next page requires its own consent and unit approval."));
        separate.append(label);
        const route = cassette.route(state, drawn);
        if (route?.available && route.href) {
            const link = judgeNode(doc, "a", "lg-cassette-link", route.label);
            link.setAttribute("href", route.href);
            link.setAttribute("rel", "noopener noreferrer");
            link.setAttribute("target", "_blank");
            link.dataset.cassetteAction = "separate-route";
            separate.append(link);
        }
        else if (route) {
            separate.append(judgeParagraph(doc, route.explanation, "lg-cassette-caption"));
        }
    }
    section.append(separate);
    return section;
}
//# sourceMappingURL=continuous-cassette-panel.js.map