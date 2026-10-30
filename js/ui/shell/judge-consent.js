import { judgeHeading, judgeNode, judgeNotice, judgeParagraph, judgeTick } from "./judge-elements.js";
export const JUDGE_CONSENT_FACTS = [
    "This walkthrough never uploads a photo or calls YouCam. A selected file stays in browser memory until you exit.",
    "The hair, face and mock try-on actions are decorative demonstrations, not measured provider results.",
    "In the live styling flow, YouCam may receive a prepared photo only after you approve that exact action.",
    "The live flow requests separate consent. These boxes do not grant consent to that flow.",
    "You can skip, withdraw any consent here, or exit. This demonstration keeps no history or payment information.",
];
export function renderJudgeConsent(doc, host, state, onConsent) {
    const container = judgeNode(doc, "section", "lg-judge-consent");
    container.append(judgeHeading(doc, "Your choices for this walkthrough"));
    const facts = judgeNode(doc, "ul", "lg-judge-facts");
    for (const fact of JUDGE_CONSENT_FACTS)
        facts.append(judgeNode(doc, "li", "", fact));
    container.append(facts);
    container.append(judgeNotice(doc, "Provider notice", "Live makeup, hair styling and Skin AI product matching are separate features. "
        + "This walkthrough is a mock and does not use provider units."));
    // No per-action ticks (owner's order, Oct 29): everything is on under the single device consent.
    void onConsent;
    container.append(judgeParagraph(doc, "Everything in this walkthrough runs in this browser. Nothing is sent.", "lg-judge-small"));
    host.replaceChildren(container);
    if (state.permissions.local)
        return;
    const checks = judgeNode(doc, "fieldset", "lg-judge-checks");
    const legend = judgeNode(doc, "legend", "", "Action-specific choices");
    checks.append(legend);
    checks.append(judgeTick(doc, "consent-local", "Allow local illustration", "Required to perform illustrative edits. No cloud transfer.", state.permissions.local, (enabled) => onConsent("local", enabled)));
    checks.append(judgeTick(doc, "consent-hair", "Allow local hair overlay", "Only the decorative hair-colour step.", state.permissions.hair, (enabled) => onConsent("hair", enabled), state.permissions.local));
    checks.append(judgeTick(doc, "consent-face", "Allow local face overlay", "Only the decorative face-colour step.", state.permissions.face, (enabled) => onConsent("face", enabled), state.permissions.local));
    checks.append(judgeTick(doc, "consent-mock", "Allow mock try-on", "This simulates a YouCam-style preview without calling any provider.", state.permissions.mock, (enabled) => onConsent("mock", enabled), state.permissions.local));
    container.append(checks);
    container.append(judgeParagraph(doc, "All four choices start unchecked. Turning off local illustration also withdraws the other three permissions.", "lg-judge-small"));
    host.replaceChildren(container);
}
//# sourceMappingURL=judge-consent.js.map