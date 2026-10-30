/** Original French ink-and-wash house illustrations. Author: John Khan. */
import { PALETTE } from "../../ui/palette.js";
// Names kept from the blue, white and red house style; the values are the plum palette since
// 2026-10-29 (ui/palette.ts), fixed so the generated drawings never depend on the page theme.
export const HOUSE_BLUE = PALETTE.plum;
export const HOUSE_RED = PALETTE.wine;
export const HOUSE_WHITE = PALETTE.cream;
export const HOUSE_VIEWBOX = "0 0 240 320";
const NS = "http://www.w3.org/2000/svg";
export const HOUSE_ART_KINDS = ["portrait", "figure", "trust"];
const PORTRAIT = {
    kind: "portrait",
    label: "Ink portrait with upswept hair and an elongated neckline",
    caption: "A few strokes, a measured blue wash and one red accent.",
    strokes: [
        {
            d: "M64 283 C74 259 90 252 100 250 L112 239 L139 245 C158 255 172 " +
                "262 184 289",
            stroke: "blue", fill: "none", weight: 1.7,
        },
        { d: "M77 273 Q84 295 103 311 L157 311 Q171 298 177 277", stroke: "blue", fill: "wash", weight: 1.1 },
        { d: "M100 250 Q116 244 120 226 M139 245 Q127 232 132 220", stroke: "blue", fill: "none", weight: 1.1 },
        {
            d: "M105 92 C79 102 70 131 76 167 Q77 192 95 210 Q117 234 139 218 " +
                "Q157 200 158 175",
            stroke: "blue", fill: "white", weight: 1.6,
        },
        { d: "M83 142 Q75 169 81 185 M151 147 Q159 173 152 189", stroke: "blue", fill: "none", weight: 0.8 },
        { d: "M87 104 Q100 79 127 89 Q150 93 161 114 L154 147", stroke: "blue", fill: "wash", weight: 1.9 },
        { d: "M76 151 Q58 135 70 110 Q73 91 89 82", stroke: "blue", fill: "none", weight: 1.3 },
        { d: "M91 90 Q86 61 110 52 Q138 42 162 69 Q173 85 166 102", stroke: "blue", fill: "none", weight: 1.7 },
        { d: "M83 108 Q100 116 132 101 Q146 96 158 106", stroke: "blue", fill: "none", weight: 1.2 },
        { d: "M78 130 Q94 108 103 107 M80 114 Q60 110 67 95", stroke: "blue", fill: "none", weight: 0.8 },
        { d: "M96 156 Q105 151 115 157 M127 156 Q135 151 145 154", stroke: "blue", fill: "none", weight: 1.5 },
        { d: "M109 159 L111 160 M136 157 L138 157", stroke: "blue", fill: "none", weight: 2.1 },
        { d: "M124 166 Q122 180 117 186 L124 190", stroke: "blue", fill: "none", weight: 1.1 },
        { d: "M110 199 Q125 194 140 199 Q126 205 113 201", stroke: "red", fill: "none", weight: 1.5 },
        { d: "M87 95 Q57 124 65 175 Q69 189 81 197", stroke: "blue", fill: "none", weight: 0.7 },
        { d: "M162 111 Q172 143 165 171 M91 89 Q107 48 146 63", stroke: "blue", fill: "none", weight: 0.8 },
        { d: "M103 244 Q105 258 109 268 M137 240 Q142 264 150 271", stroke: "blue", fill: "none", weight: 0.9 },
        { d: "M88 272 Q120 288 154 270", stroke: "blue", fill: "none", weight: 0.6 },
    ],
};
const FIGURE = {
    kind: "figure",
    label: "Elongated standing fashion figure in a tailored blue wash",
    caption: "An upright fashion study using the same line and colour grammar.",
    strokes: [
        {
            d: "M103 47 Q121 34 138 46 Q147 61 137 77 L131 87 Q120 96 110 84 " +
                "L103 67 Z",
            stroke: "blue", fill: "white", weight: 1.4,
        },
        { d: "M102 58 Q92 43 105 32 Q119 20 138 35 Q151 46 142 61", stroke: "blue", fill: "wash", weight: 1.7 },
        { d: "M108 62 Q116 58 121 63 M126 62 L133 60 M120 75 Q125 78 131 74", stroke: "blue", fill: "none", weight: 0.9 },
        { d: "M110 90 Q115 108 104 115 L126 127 L141 112 Q131 107 130 91", stroke: "blue", fill: "none", weight: 1 },
        {
            d: "M105 114 Q90 118 84 137 L75 197 Q75 205 83 206 Q89 200 89 193 " +
                "L101 151",
            stroke: "blue", fill: "none", weight: 1.4,
        },
        {
            d: "M142 113 Q160 122 165 142 L171 196 Q171 207 164 209 Q157 202 " +
                "159 194 L149 156",
            stroke: "blue", fill: "none", weight: 1.3,
        },
        {
            d: "M103 112 L121 138 L142 112 L152 169 Q146 183 137 184 L101 183 " +
                "Q92 166 103 112",
            stroke: "blue", fill: "wash", weight: 1.6,
        },
        {
            d: "M120 137 L124 178 M104 135 Q119 157 141 138 M101 180 Q121 190 " +
                "141 181",
            stroke: "blue", fill: "none", weight: 0.8,
        },
        {
            d: "M101 183 L97 214 Q103 234 110 247 L100 302 L111 305 L126 247 " +
                "L136 304 L147 304 L140 243 Q144 211 138 184",
            stroke: "blue", fill: "none", weight: 1.5,
        },
        {
            d: "M124 191 L124 240 M109 245 Q120 251 129 244 M100 299 L89 305 " +
                "Q91 310 113 308 M136 302 L152 307 Q151 311 130 309",
            stroke: "blue", fill: "none", weight: 0.8,
        },
        { d: "M103 139 Q118 145 136 131", stroke: "red", fill: "none", weight: 1.5 },
        { d: "M99 220 Q103 232 111 243 M139 210 Q136 232 136 244", stroke: "blue", fill: "none", weight: 0.7 },
    ],
};
const TRUST = {
    kind: "trust",
    label: "Two open hands supporting a protected portrait frame",
    caption: "An open-hand trust motif, not a shield or biometric certification.",
    strokes: [
        { d: "M69 62 L171 62 L171 178 L69 178 Z", stroke: "blue", fill: "white", weight: 1.3 },
        { d: "M75 68 L165 68 L165 172 L75 172 Z", stroke: "blue", fill: "wash", weight: 0.7 },
        {
            d: "M101 114 Q101 94 119 87 Q142 90 141 116 Q139 141 120 150 Q102 " +
                "139 101 114",
            stroke: "blue", fill: "white", weight: 1.1,
        },
        { d: "M101 111 Q108 86 126 89 Q143 92 143 111", stroke: "blue", fill: "none", weight: 1.3 },
        {
            d: "M109 118 Q114 115 119 118 M126 118 Q131 115 136 118 M119 135 " +
                "Q127 140 132 134",
            stroke: "blue", fill: "none", weight: 0.8,
        },
        { d: "M91 164 Q111 149 124 151 Q145 152 151 164", stroke: "blue", fill: "none", weight: 1.2 },
        {
            d: "M35 224 Q51 216 68 222 L94 230 Q111 233 119 245 Q127 255 113 " +
                "260 Q99 260 85 255",
            stroke: "blue", fill: "none", weight: 1.6,
        },
        { d: "M35 225 Q46 251 70 267 Q97 283 112 286 L123 303", stroke: "blue", fill: "wash", weight: 1.4 },
        {
            d: "M203 224 Q185 215 174 222 L147 230 Q131 233 120 245 Q115 253 " +
                "129 261 Q145 261 155 255",
            stroke: "blue", fill: "none", weight: 1.6,
        },
        { d: "M202 225 Q191 255 167 269 Q142 283 128 286 L116 303", stroke: "blue", fill: "wash", weight: 1.4 },
        {
            d: "M56 232 L74 240 M182 232 L163 240 M82 268 L104 278 M157 267 " +
                "L137 279",
            stroke: "blue", fill: "none", weight: 0.8,
        },
        { d: "M104 203 Q117 192 131 203", stroke: "red", fill: "none", weight: 1.2 },
    ],
};
const ART = {
    portrait: PORTRAIT,
    figure: FIGURE,
    trust: TRUST,
};
export function houseArt(kind) {
    if (!HOUSE_ART_KINDS.includes(kind))
        throw new RangeError("Unknown house illustration");
    return ART[kind];
}
function strokeColour(name) {
    return name === "blue" ? HOUSE_BLUE : name === "red" ? HOUSE_RED : "none";
}
function fillColour(name) {
    if (name === "white")
        return HOUSE_WHITE;
    if (name === "blue")
        return HOUSE_BLUE;
    if (name === "red")
        return HOUSE_RED;
    if (name === "wash")
        return HOUSE_BLUE;
    return "none";
}
/** Static, authored paths only: no user-provided SVG strings or remote assets. */
export function houseArtMarkup(kind) {
    const art = houseArt(kind);
    const strokes = art.strokes.map((stroke) => {
        const weight = stroke.weight ?? 1;
        const wash = stroke.fill === "wash" ? ' fill-opacity="0.07"' : "";
        return `<path d="${stroke.d}" fill="${fillColour(stroke.fill)}"${wash} `
            + `stroke="${strokeColour(stroke.stroke)}" stroke-width="${weight}" `
            + 'stroke-linecap="round" stroke-linejoin="round"/>';
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" '
        + 'role="img" aria-label="' + art.label + '">' + '\n'
        + '<rect width="240" height="320" fill="' + HOUSE_WHITE + '"/>\n'
        + strokes.join("\n") + '\n</svg>\n';
}
/** CSP-safe DOM creation; no innerHTML or embedded data URL. */
export function createHouseArt(doc, kind) {
    const art = houseArt(kind);
    const svg = doc.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", HOUSE_VIEWBOX);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", art.label);
    svg.setAttribute("class", "lg-editorial-house-art");
    const ground = doc.createElementNS(NS, "rect");
    ground.setAttribute("width", "240");
    ground.setAttribute("height", "320");
    ground.setAttribute("fill", HOUSE_WHITE);
    svg.append(ground);
    for (const stroke of art.strokes) {
        const path = doc.createElementNS(NS, "path");
        path.setAttribute("d", stroke.d);
        path.setAttribute("fill", fillColour(stroke.fill));
        if (stroke.fill === "wash")
            path.setAttribute("fill-opacity", "0.07");
        path.setAttribute("stroke", strokeColour(stroke.stroke));
        path.setAttribute("stroke-width", String(stroke.weight ?? 1));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.append(path);
    }
    return svg;
}
//# sourceMappingURL=house-art.js.map