/** Tiny DOM helper: h("button", { class: "x", onclick }, "Text"). */
export function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false)
            continue;
        if (key.startsWith("on") && typeof value === "function") {
            el.addEventListener(key.slice(2), value);
        }
        else if (key === "class") {
            el.className = String(value);
        }
        else if (key === "style" && typeof value === "object") {
            Object.assign(el.style, value);
        }
        else if (key in el && typeof value !== "string") {
            el[key] = value;
        }
        else {
            el.setAttribute(key, value === true ? "" : String(value));
        }
    }
    append(el, ...children);
    return el;
}
export function append(el, ...children) {
    for (const c of children) {
        if (c === null || c === undefined || c === false)
            continue;
        el.append(c instanceof Node ? c : String(c));
    }
}
export function clear(el) {
    while (el.firstChild)
        el.removeChild(el.firstChild);
}
/** Polite live region announcement for screen readers. */
export function announce(text) {
    const region = document.getElementById("announcer");
    if (region) {
        region.textContent = "";
        setTimeout(() => (region.textContent = text), 30);
    }
}
export function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("image failed to load"));
        img.src = src;
    });
}
