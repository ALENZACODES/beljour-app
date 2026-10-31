/** Single mutable Hair Studio draft, shared by layout v1 and the classic photo flow.
 * Stores references (metadata and temporary blob URL) but never persists photo bytes,
 * API keys, task tickets or face landmarks. Styling previews never become local
 * shell effect layers: the shell owns navigation/history, and provider results
 * retain their distinct YouCam provenance in the same inspector.
 * Author: John Khan.
 */
import { DEFAULT_QUERY, clampStrength, defaultSelection, filteredStyles, recommendedStyles, styleById } from "./model.js";
import { variants } from "./variants.js";
import { noReplay, replaySample } from "./replay.js";
/** Women-first defaults are gentle for all of these; none changes face or skin colour. */
export const ONE_TAP_HAIR = [
    { id: "daily-bob", title: "Easy bob", description: "A simple chin-length starting point.",
        style: "tpl-bob", strength: 25, adjuncts: {}, intent: "everyday" },
    { id: "soft-layers", title: "Soft layers", description: "Keep the length with relaxed movement.",
        style: "tpl-long-layers", strength: 30, adjuncts: {}, intent: "everyday" },
    { id: "curtain-look", title: "Curtain fringe", description: "Face-framing bangs, with her skin and colour unchanged.",
        style: "tpl-curtain", strength: 25, adjuncts: { bangs: 25 }, intent: "everyday" },
    { id: "loose-waves", title: "Loose waves", description: "Soft wave definition and unchanged facial features.",
        style: "tpl-waves", strength: 30, adjuncts: { curl: 25 }, intent: "everyday" },
    { id: "close-pixie", title: "Close pixie", description: "An airy short-cut reference.",
        style: "tpl-pixie", strength: 25, adjuncts: {}, intent: "short" },
    { id: "low-fade", title: "Low fade", description: "Short sides with a clean, calm silhouette.",
        style: "tpl-low-fade", strength: 30, adjuncts: {}, intent: "short" },
    { id: "taper-quick", title: "Short sides", description: "Mid fade crop reference with an easy top.",
        style: "tpl-mid-fade-crop", strength: 30, adjuncts: {}, intent: "short" },
    { id: "textured-crop", title: "Textured crop", description: "Extra shape without a dramatic change.",
        style: "tpl-textured-crop", strength: 30, adjuncts: {}, intent: "short" },
    { id: "event-flow", title: "Event layers", description: "A calm reference for an event or wedding trial.",
        style: "tpl-long-layers", strength: 30, adjuncts: { volume: 25 }, intent: "event" },
    { id: "event-fringe", title: "Event fringe", description: "A soft fringe reference to discuss with a stylist.",
        style: "tpl-curtain", strength: 25, adjuncts: { bangs: 30 }, intent: "event" },
];
function asSelection(selection) {
    return { ...selection, adjuncts: { ...selection.adjuncts },
        reference: selection.reference ? { ...selection.reference } : null };
}
function asQuery(query) { return { ...query }; }
export class HairSession {
    query = asQuery(DEFAULT_QUERY);
    selection = defaultSelection();
    favourites = new Set();
    boardIds = ["tpl-bob", "tpl-pixie", "tpl-curtain", "tpl-waves"];
    preview = replaySample();
    note = "Styling sample is synthetic. Choose a cut to plan the look; no provider call is made.";
    subscribers = new Set();
    busy = false;
    version = 0;
    get state() {
        const ids = this.boardIds.slice(0, this.selection.variantCount);
        const board = variants({ gridSize: this.selection.variantCount, selected: ids,
            strength: this.selection.strength, modifiers: this.selection.adjuncts });
        return { query: asQuery(this.query), selection: asSelection(this.selection),
            favourites: [...this.favourites].sort(), boardIds: ids, board, preview: { ...this.preview },
            note: this.note, busy: this.busy, version: this.version };
    }
    subscribe(listener) {
        this.subscribers.add(listener);
        listener(this.state);
        return () => { this.subscribers.delete(listener); };
    }
    emit() { this.version++; for (const fn of this.subscribers)
        fn(this.state); }
    updateQuery(change) {
        const value = { ...this.query, ...change };
        if (value.term.length > 80)
            value.term = value.term.slice(0, 80);
        filteredStyles(value); // validate before saving
        this.query = value;
        this.emit();
    }
    choose(styleId) {
        const item = styleById(styleId);
        if (!item)
            throw new RangeError("Unknown haircut");
        this.selection = { ...this.selection, styleId, reference: null, referenceRights: false };
        this.preview = item.source === "synthetic-s1" ? replaySample() : noReplay("Inspiration only. No generated photo exists for this cut.");
        this.note = `${item.name}: ${item.description} ${item.source === "inspiration" ? "Reference concept only." : "Synthetic S1 catalogue, unverified live."}`;
        this.emit();
    }
    setStrength(value) {
        this.selection = { ...this.selection, strength: clampStrength(value) };
        this.emit();
    }
    setAdjunct(key, value) {
        if (!(key in this.selection.adjuncts))
            throw new RangeError("Unknown hair adjunct");
        this.selection = { ...this.selection, adjuncts: { ...this.selection.adjuncts,
                [key]: clampStrength(value) } };
        this.note = `Only preview planning has changed. ${key} is a separate YouCam styling action, not a local effect.`;
        this.emit();
    }
    setKeepColour(value) {
        this.selection = { ...this.selection, keepColour: !!value };
        this.note = "Hair colour is not changed by Hair Studio. The Colour Studio arrives in R11.";
        this.emit();
    }
    setGridSize(size) {
        if (size !== 4 && size !== 9)
            throw new RangeError("Choose 2x2 or 3x3");
        this.selection = { ...this.selection, variantCount: size };
        this.emit();
    }
    addToBoard(styleId) {
        if (!styleById(styleId))
            throw new RangeError("Unknown haircut");
        this.boardIds = [...this.boardIds.filter((id) => id !== styleId), styleId].slice(-9);
        this.note = "Added a cut idea to the comparison board. It has not been rendered.";
        this.emit();
    }
    removeFromBoard(styleId) {
        this.boardIds = this.boardIds.filter((id) => id !== styleId);
        this.emit();
    }
    clearBoard() {
        this.boardIds = [];
        this.emit();
    }
    moveOnBoard(styleId, direction) {
        const index = this.boardIds.indexOf(styleId);
        if (index < 0)
            return;
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.boardIds.length)
            return;
        const next = [...this.boardIds];
        [next[index], next[newIndex]] = [next[newIndex], next[index]];
        this.boardIds = next;
        this.emit();
    }
    toggleFavourite(styleId) {
        if (!styleById(styleId))
            throw new RangeError("Unknown haircut");
        if (this.favourites.has(styleId))
            this.favourites.delete(styleId);
        else
            this.favourites.add(styleId);
        this.emit();
    }
    oneTap(id) {
        const look = ONE_TAP_HAIR.find((item) => item.id === id);
        if (!look)
            throw new RangeError("Unknown quick look");
        const base = defaultSelection(look.style);
        this.selection = { ...base, strength: clampStrength(look.strength),
            adjuncts: { ...base.adjuncts, ...look.adjuncts }, variantCount: this.selection.variantCount };
        this.preview = replaySample();
        this.note = `${look.title}: quick styling plan selected. Gentle strength ${look.strength}/100. The result shown is the same one synthetic sample, not this cut on your photo.`;
        this.emit();
    }
    setReference(reference) {
        this.selection = { ...this.selection, reference, referenceRights: false };
        this.note = reference ? "Reference loaded only into this browser. Tick the rights box before a provider request."
            : "Reference removed. No image was transmitted.";
        this.emit();
    }
    setReferenceRights(allowed) {
        this.selection = { ...this.selection, referenceRights: !!allowed && !!this.selection.reference };
        this.emit();
    }
    markBusy(isBusy) { this.busy = !!isBusy; this.emit(); }
    showResult(result) {
        this.preview = { ...result };
        this.note = result.note;
        this.emit();
    }
    setMessage(message) {
        this.note = message.slice(0, 400);
        this.emit();
    }
    reset() {
        this.selection = defaultSelection();
        this.query = asQuery(DEFAULT_QUERY);
        this.preview = replaySample();
        this.boardIds = ["tpl-bob", "tpl-pixie", "tpl-curtain", "tpl-waves"];
        this.busy = false;
        this.note = "Reset to a gentle hairstyle idea. No face or skin changes.";
        this.emit();
    }
    recommended(options) {
        return recommendedStyles(options).map((s) => s.id);
    }
}
