import { DEMO_SCENES, scene as findScene } from "./scenes.js";
export function loadScene(editor, compare, item) {
    const first = item.layers[0].kind;
    editor.loadSample(item.sample, first);
    const ids = [];
    for (const layer of item.layers) {
        const added = editor.add(layer.kind, layer.params, layer.strength);
        if (layer.opacity !== 1)
            editor.update(added.id, { opacity: layer.opacity }, "Set opacity");
        ids.push(added.id);
    }
    const pick = ids[item.select ?? ids.length - 1];
    editor.choose(pick);
    editor.selectStudio(item.layers[item.select ?? ids.length - 1].kind);
    compare.setMode(item.compare.mode);
    compare.setPosition(item.compare.position);
    compare.setLoupe(item.compare.loupe.x, item.compare.loupe.y);
    compare.setLoupeZoom(item.compare.loupe.zoom);
    compare.setFlickerMs(item.compare.flickerMs);
    compare.setGain(item.compare.differenceGain);
    if (item.compare.mode === "flicker")
        compare.setPlaying(item.compare.playing);
    return { id: item.id, title: item.title, line: item.line, layers: ids.length, selected: editor.document.selected };
}
/** "#demo=beard-loupe" → "beard-loupe"; anything else → null. */
export function parseDemoHash(hash) {
    const match = /^#?(?:.*&)?demo=([a-z][a-z0-9-]{1,39})(?:&.*)?$/.exec(hash);
    if (!match)
        return null;
    return DEMO_SCENES.some((s) => s.id === match[1]) ? match[1] : null;
}
export function demoHash(id) {
    findScene(id);
    return `#demo=${id}`;
}
/** Step through the scenes in order; wraps at both ends. */
export class DemoTour {
    editor;
    compare;
    scenes;
    index = -1;
    constructor(editor, compare, scenes = DEMO_SCENES) {
        this.editor = editor;
        this.compare = compare;
        this.scenes = scenes;
        if (!scenes.length)
            throw new RangeError("A tour needs at least one scene");
    }
    get position() { return this.index; }
    get length() { return this.scenes.length; }
    get current() { return this.index < 0 ? null : this.scenes[this.index]; }
    /** "Scene 3 of 10: Spray, side by side". */
    label() {
        const item = this.current;
        return item ? `Scene ${this.index + 1} of ${this.scenes.length}: ${item.title}` : "Demo tour not started";
    }
    go(index) {
        if (!Number.isInteger(index))
            throw new RangeError("Scene number must be whole");
        this.index = ((index % this.scenes.length) + this.scenes.length) % this.scenes.length;
        return loadScene(this.editor, this.compare, this.scenes[this.index]);
    }
    open(id) {
        const at = this.scenes.findIndex((s) => s.id === id);
        if (at < 0)
            throw new RangeError(`There is no demo scene called ${id}`);
        return this.go(at);
    }
    next() { return this.go(this.index + 1); }
    previous() { return this.go(this.index < 0 ? this.scenes.length - 1 : this.index - 1); }
}
//# sourceMappingURL=loader.js.map