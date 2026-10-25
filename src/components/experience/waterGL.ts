import { ZOOM } from "./regattaPhysics";
import { CELL, CROSS, CROSS_ANGLE, CROSS_SHARE, RING_CRESTS, RING_HEIGHT, RING_LIFE, RING_SPEED, RING_WIDTH, Sea, SLOPE, STATE_RANGE, SWELL, TRAINS, Wake } from "./sea";

/**
 * Draws the sea (sea.ts) in a WebGL fragment shader, at full resolution: per pixel the same height
 * field the boats ride on, with its exact slope, lit by day by the sun high in the upper left, and by
 * night by a big city on the left, low and warm. Slopes facing the light are brighter, the backs of the
 * waves darker, and where a slope mirrors the light into the eye it glints;
 * in strong wind the tops of the highest crests break white. Every moving boat pushes up water at its
 * bow (white when it's fast), and its wake spreads from there as wave packets (sea.ts). The page shows through everywhere else,
 * and the water fades out towards the edges of the section, so it blends into the sections around it.
 * Without WebGL there's simply no water.
 */

const MAX_WAKES = 100;
const MAX_BOATS = 8;

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
    v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 v_uv;
uniform vec2 u_size;
uniform float u_top;
uniform float u_section;
uniform float u_time;
uniform vec2 u_swell;
uniform float u_swellHeight;
uniform sampler2D u_state;
uniform vec2 u_grid;
uniform vec4 u_trains[${TRAINS.length}];
uniform float u_phases[${TRAINS.length}];
uniform vec4 u_wakes[${MAX_WAKES}];
uniform int u_wakeCount;
uniform float u_dark;
uniform vec4 u_boats[${MAX_BOATS}];   // x, y, heading, speed (px/s)

// Bow waves of all boats at a point, and the white water at their bows.
float bowWaves(vec2 p, out float spray) {
    float h = 0.0;
    spray = 0.0;
    for (int i = 0; i < ${MAX_BOATS}; i++) {
        vec4 b = u_boats[i];
        if (b.w < 2.0) continue;
        vec2 d = p - b.xy;
        float c = cos(b.z), s = sin(b.z);
        float u = (d.x * c + d.y * s) / ${ZOOM.toFixed(2)}, v = (-d.x * s + d.y * c) / ${ZOOM.toFixed(2)};   // along and across the boat, in its own size
        if (u < -30.0 || u > 40.0 || abs(v) > 30.0) continue;
        float speed = clamp(b.w / 55.0, 0.0, 1.5);
        // Water piled up at the bow and pushed aside along the forward part of the hull.
        float cushion = exp(-((u - 16.0) * (u - 16.0)) / 40.0 - (v * v) / 55.0);
        float shoulders = exp(-((u - 6.0) * (u - 6.0)) / 60.0 - ((abs(v) - 9.0) * (abs(v) - 9.0)) / 12.0);
        h += speed * (1.4 * cushion + 0.8 * shoulders);
        spray += max(0.0, speed - 0.5) * (cushion + shoulders * 0.6) * 1.6;
    }
    return h;
}

// Paints rgb with opacity a over the premultiplied colour dst.
vec4 over(vec4 dst, vec3 rgb, float a) {
    return dst * (1.0 - a) + vec4(rgb * a, a);
}

void main() {
    vec2 p = vec2(v_uv.x * u_size.x, u_top + v_uv.y * u_size.y);

    float ks = ${((2 * Math.PI) / SWELL).toFixed(6)};
    float sp = ks * dot(p, u_swell) - 0.9 * u_time;
    float h = u_swellHeight * sin(sp);
    vec2 g = u_swellHeight * cos(sp) * ks * u_swell;
    vec2 cdir = vec2(u_swell.x * ${Math.cos(CROSS_ANGLE).toFixed(6)} - u_swell.y * ${Math.sin(CROSS_ANGLE).toFixed(6)},
                      u_swell.x * ${Math.sin(CROSS_ANGLE).toFixed(6)} + u_swell.y * ${Math.cos(CROSS_ANGLE).toFixed(6)});
    float kc = ${((2 * Math.PI) / CROSS).toFixed(6)};
    float cp = kc * dot(p, cdir) - 1.1 * u_time;
    h += u_swellHeight * ${CROSS_SHARE.toFixed(2)} * sin(cp);
    g += u_swellHeight * ${CROSS_SHARE.toFixed(2)} * cos(cp) * kc * cdir;

    vec2 state = (texture2D(u_state, (p / ${CELL.toFixed(1)} + 0.5) / u_grid).rg - 0.5) * ${(STATE_RANGE * 2).toFixed(1)};
    float knots = length(state);
    if (knots > 0.2) {
        vec2 dir = state / knots;
        float sea = min(1.1, knots / 11.0) * 0.75;
        for (int i = 0; i < ${TRAINS.length}; i++) {
            vec4 t = u_trains[i];
            float along = dot(t.xy, dir);
            if (along > 0.45) {
                float w = sea * along * along * along * along;
                float ph = t.z * dot(p, t.xy) - t.w * u_time + u_phases[i];
                h += w * sin(ph);
                g += w * cos(ph) * t.z * t.xy;
            }
        }
    }

    for (int i = 0; i < ${MAX_WAKES}; i++) {
        if (i >= u_wakeCount) break;
        vec4 w = u_wakes[i];
        vec2 d = p - w.xy;
        float r = length(d);
        float off = (r - (${RING_SPEED.toFixed(1)} * w.z + 3.0)) / ${RING_WIDTH.toFixed(2)};
        if (off > -3.0 && off < 3.0 && r > 0.0) {
            float a = (1.0 - w.z / ${RING_LIFE.toFixed(2)}) * w.w * ${RING_HEIGHT.toFixed(2)};
            float env = exp(-off * off);
            float crest = ${RING_CRESTS.toFixed(2)} * off;
            h += a * env * cos(crest);
            g += (a * env * (-2.0 * off * cos(crest) - ${RING_CRESTS.toFixed(2)} * sin(crest)) / ${RING_WIDTH.toFixed(2)} / r) * d;
        }
    }

    float spray, unused;
    h += bowWaves(p, spray);
    g.x += (bowWaves(p + vec2(0.75, 0.0), unused) - bowWaves(p - vec2(0.75, 0.0), unused)) / 1.5;
    g.y += (bowWaves(p + vec2(0.0, 0.75), unused) - bowWaves(p - vec2(0.0, 0.75), unused)) / 1.5;

    vec3 n = normalize(vec3(-g * ${SLOPE.toFixed(1)}, 1.0));   // surface normal; viewer straight above
    float foam = knots > 10.0 && h > 1.15 ? min(1.0, (h - 1.15) * 2.5) * min(1.0, (knots - 10.0) / 6.0) : 0.0;
    foam = max(foam, min(1.0, spray));
    float across = clamp(p.x / u_size.x, 0.0, 1.0);
    vec4 color = vec4(0.0);

    if (u_dark < 0.5) {
        // Daylight: the sun high in the upper left. A light sea-blue tint, faces towards the sun bright,
        // the backs of the waves deep blue, and sun glitter, strongest towards the sun.
        vec3 l = normalize(vec3(-0.45, -0.55, 0.7));
        float shade = dot(n, l) - l.z;
        float glint = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 120.0);
        float towardsSun = 1.0 - clamp(0.6 * across + 0.4 * v_uv.y, 0.0, 1.0);
        color = over(color, vec3(0.2, 0.5, 0.78), 0.22);
        color = shade > 0.0 ? over(color, vec3(0.88, 0.96, 1.0), clamp(shade * 2.4, 0.0, 1.0) * 0.6)
                            : over(color, vec3(0.03, 0.22, 0.48), clamp(-shade * 2.4, 0.0, 1.0) * 0.5);
        color = over(color, vec3(1.0, 0.98, 0.9), min(1.0, glint * (0.7 + 1.3 * towardsSun)));
        color = over(color, vec3(1.0), foam * 0.8);
    } else {
        // Night, a big city on the left: its warm light comes in low from the left and fades towards
        // the right. Faces turned to it glow amber, crests mirror it in golden streaks, the rest is dark.
        vec3 l = normalize(vec3(-0.92, -0.12, 0.38));
        float city = exp(-across / 0.55);
        float shade = dot(n, l) - l.z;
        float glint = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), 50.0);
        color = over(color, vec3(0.02, 0.05, 0.12), 0.12);
        color = over(color, vec3(0.95, 0.55, 0.22), 0.07 * city);
        color = shade > 0.0 ? over(color, vec3(1.0, 0.7, 0.38), clamp(shade * 2.5, 0.0, 1.0) * (0.12 + 0.4 * city))
                            : over(color, vec3(0.0), clamp(-shade * 2.5, 0.0, 1.0) * 0.4);
        color = over(color, vec3(1.0, 0.82, 0.52), min(1.0, glint * (0.15 + 1.4 * city)));
        color = over(color, mix(vec3(0.75, 0.8, 0.9), vec3(1.0, 0.85, 0.65), city), foam * 0.6);
    }

    // Fade out towards the section's edges, and calm down behind the timeline's text in the middle.
    float fade = smoothstep(0.0, 220.0, p.y) * smoothstep(0.0, 220.0, u_section - p.y)
        * smoothstep(0.0, 60.0, p.x) * smoothstep(0.0, 60.0, u_size.x - p.x);
    float text = (p.x - u_size.x * 0.5) / min(420.0, u_size.x * 0.45);
    fade *= 1.0 - 0.45 * exp(-text * text * 2.0);
    gl_FragColor = color * fade;
}`;

export class WaterGL {
    private gl: WebGLRenderingContext | null;
    private program: WebGLProgram | null = null;
    private texture: WebGLTexture | null = null;
    private uniforms: Record<string, WebGLUniformLocation | null> = {};
    private pixels = new Uint8Array(0);
    private wakeData = new Float32Array(MAX_WAKES * 4);
    private boatData = new Float32Array(MAX_BOATS * 4);

    constructor(private canvas: HTMLCanvasElement) {
        this.gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
        if (this.gl) this.setup(this.gl);
    }

    private setup(gl: WebGLRenderingContext) {
        const compile = (type: number, source: string) => {
            const shader = gl.createShader(type)!;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
            return shader;
        };
        try {
            const program = gl.createProgram()!;
            gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
            gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link");
            gl.useProgram(program);
            this.program = program;
        } catch (error) {
            console.warn("Water shader unavailable", error);
            this.gl = null;
            return;
        }
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(this.program, "a_pos");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

        for (const name of ["u_boats", "u_size", "u_top", "u_section", "u_time", "u_swell", "u_swellHeight", "u_state", "u_grid", "u_trains", "u_phases", "u_wakes", "u_wakeCount", "u_dark"]) {
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        }
        gl.uniform4fv(this.uniforms.u_trains, TRAINS.flatMap((t) => [t.cos, t.sin, t.k, t.omega]));
        gl.uniform1fv(this.uniforms.u_phases, TRAINS.map((t) => t.phase));

        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) {
            gl.texParameteri(gl.TEXTURE_2D, key, value);
        }
        gl.uniform1i(this.uniforms.u_state, 0);
        gl.clearColor(0, 0, 0, 0);
    }

    get available() { return !!this.gl; }

    /** Draws the rows `top`..`top + height` of the section (section coordinates). */
    render(sea: Sea, time: number, wakes: Wake[], boats: { x: number, y: number, heading: number, speed: number }[],
           top: number, width: number, height: number, section: number, dark: boolean) {
        const gl = this.gl;
        if (!gl) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr));
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
        }
        gl.viewport(0, 0, w, h);

        // Sea state as a texture: wind vector per cell, in knots, mapped to 0..255.
        const cells = sea.cols * sea.rows;
        if (this.pixels.length !== cells * 4) this.pixels = new Uint8Array(cells * 4);
        for (let c = 0; c < cells; c++) {
            const scale = 255 / (2 * STATE_RANGE);
            this.pixels[c * 4] = Math.max(0, Math.min(255, Math.round((sea.state[c * 2] + STATE_RANGE) * scale)));
            this.pixels[c * 4 + 1] = Math.max(0, Math.min(255, Math.round((sea.state[c * 2 + 1] + STATE_RANGE) * scale)));
        }
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sea.cols, sea.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);

        const count = Math.min(MAX_WAKES, wakes.length);
        for (let i = 0; i < count; i++) this.wakeData.set([wakes[i].x, wakes[i].y, wakes[i].age, wakes[i].strength], i * 4);

        const u = this.uniforms;
        gl.uniform2f(u.u_size, width, height);
        gl.uniform1f(u.u_top, top);
        gl.uniform1f(u.u_section, section);
        gl.uniform1f(u.u_time, time);
        gl.uniform2f(u.u_swell, sea.swell.x, sea.swell.y);
        gl.uniform1f(u.u_swellHeight, sea.swellHeight);
        gl.uniform2f(u.u_grid, sea.cols, sea.rows);
        gl.uniform4fv(u.u_wakes, this.wakeData);
        gl.uniform1i(u.u_wakeCount, count);
        this.boatData.fill(0);
        boats.slice(0, MAX_BOATS).forEach((b, i) => this.boatData.set([b.x, b.y, b.heading, b.speed], i * 4));
        gl.uniform4fv(u.u_boats, this.boatData);
        gl.uniform1f(u.u_dark, dark ? 1 : 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
}
