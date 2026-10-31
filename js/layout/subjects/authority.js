/** Edit tickets bind a target to one photo revision and a checked face list. */
import { checkedSubjectBoxes } from "./contract.js";
/** No pixel-based guessing, even if a photo contains an apparent face. */
export function subjectEditDecision(snapshot) {
    if (snapshot.source === "none" || snapshot.source === "awaiting-detector") {
        return {
            allowed: false,
            ticket: null,
            refusal: "no-source",
            message: "Face selection is not available until a trusted detector supplies boxes.",
        };
    }
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision <= 0) {
        return {
            allowed: false,
            ticket: null,
            refusal: "stale-selection",
            message: "The image changed. Select a face again before editing.",
        };
    }
    let boxes;
    try {
        boxes = checkedSubjectBoxes(snapshot.boxes);
    }
    catch {
        return {
            allowed: false,
            ticket: null,
            refusal: "untrusted-bounds",
            message: "The supplied boxes are invalid. The image remains unchanged.",
        };
    }
    const selected = boxes.find((box) => box.id === snapshot.selectedId);
    if (!selected) {
        return {
            allowed: false,
            ticket: null,
            refusal: "no-target",
            message: "Select a specific subject before editing. Bystanders remain unchanged.",
        };
    }
    if (snapshot.source !== selected.origin) {
        return {
            allowed: false,
            ticket: null,
            refusal: "untrusted-bounds",
            message: "Face-box provenance is inconsistent. The photo remains unchanged.",
        };
    }
    return {
        allowed: true,
        ticket: Object.freeze({
            photoRevision: snapshot.revision,
            selectedId: selected.id,
            target: Object.freeze({ ...selected }),
            bystanderIds: Object.freeze(boxes.filter((box) => box.id !== selected.id).map((box) => box.id)),
            perSubjectOnly: true,
        }),
        refusal: null,
        message: "Only the selected face rectangle may receive illustrative changes.",
    };
}
/** Reject stale worker results even when the selected id happens to repeat. */
export function currentSubjectTicket(ticket, snapshot) {
    if (ticket.photoRevision !== snapshot.revision || ticket.selectedId !== snapshot.selectedId) {
        return false;
    }
    const updated = subjectEditDecision(snapshot);
    if (!updated.ticket)
        return false;
    const box = updated.ticket.target;
    return ticket.target.origin === box.origin
        && ticket.target.x === box.x
        && ticket.target.y === box.y
        && ticket.target.width === box.width
        && ticket.target.height === box.height
        && ticket.bystanderIds.length === updated.ticket.bystanderIds.length
        && ticket.bystanderIds.every((id, index) => id === updated.ticket?.bystanderIds[index]);
}
/** Describes only verified boxes; never generates a derived demographic category. */
export function subjectSelectionLabel(snapshot) {
    const total = snapshot.boxes.length;
    if (!total || !snapshot.selectedId)
        return "No verified subject selected";
    const index = snapshot.boxes.findIndex((box) => box.id === snapshot.selectedId);
    if (index < 0)
        return "No verified subject selected";
    const origin = snapshot.source === "drawn" ? "Drawn person" : "Detected face";
    return `${origin} ${index + 1} of ${total} selected; ${total - 1} unchanged bystanders`;
}
