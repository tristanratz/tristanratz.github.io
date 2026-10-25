import { CSSProperties, ReactNode, useEffect, useRef } from "react";
import { IoClose } from "react-icons/io5";
import { useUi } from "../../i18n";
import { useIsomorphicLayoutEffect } from "../../env";
import "./style.scss";

interface Props {
    open: boolean;
    onClose: () => void;
    label: string;
    children: ReactNode;
    /** Name for a shared-element view transition; disables the default open animation. */
    transitionName?: string;
    /** Pulling past the top or the bottom of the content closes the dialog. */
    pullToClose?: boolean;
}

const MAX_PULL = 150;           // px the dialog can move at most (rubber band)
const CLOSE_AT = 150;           // raw pull distance at which it closes, right away
const GESTURE_GAP = 120;        // ms without wheel events that separate two gestures
const RELEASE_PAUSE = 100;      // ms without wheel events that count as letting go
const MOMENTUM_DECAYS = 3;      // shrinking wheel deltas in a row: the fingers left the trackpad
const FLING_TIME = 180;         // ms of touch velocity that count towards closing on release

type Edge = "top" | "bottom";

/** Rubber band: the further you pull, the stronger the resistance. */
const rubberBand = (raw: number) => MAX_PULL * (1 - Math.exp(-raw / 200));
const unRubberBand = (offset: number) => -200 * Math.log(1 - Math.min(offset, MAX_PULL - 0.01) / MAX_PULL);

/**
 * Pulling past the top or the bottom of the scrolled content drags the dialog along with growing
 * resistance. It closes as soon as the pull, or a fling's projected travel, passes a threshold;
 * otherwise it springs back when let go.
 */
function usePullToClose(ref: React.RefObject<HTMLDialogElement | null>, enabled: boolean, onClose: () => void) {
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        const dialog = ref.current;
        if (!enabled || !dialog) return;
        let raw = 0, offset = 0, edge: Edge = "top", pulling = false, closing = false, raf = 0, timer = 0;
        // Wheel gestures: a pull may only start while the content hasn't scrolled in the same gesture,
        // so the momentum of scrolling up to an edge never pulls.
        let lastWheel = 0, gestureScroll = 0, gestureMayPull = false, gestureDone = false;
        let lastMagnitude = 0, decays = 0, rises = 0, ratio = 0, inMomentum = false;
        let touch: { y: number, edges: Edge[], lastY: number, lastTime: number, velocity: number } | null = null;

        const atEdge = (e: Edge) => e === "top"
            ? dialog.scrollTop <= 0
            : dialog.scrollTop + dialog.clientHeight >= dialog.scrollHeight - 1;
        const direction = () => (edge === "top" ? 1 : -1);

        const show = (px: number) => {
            offset = px;
            dialog.style.translate = `0 ${px * direction()}px`;
            dialog.dataset.pull = edge;
            dialog.style.setProperty("--pull", String(Math.min(1, raw / CLOSE_AT)));
        };
        const reset = () => {
            offset = 0;
            dialog.style.translate = "";
            dialog.style.removeProperty("--pull");
            delete dialog.dataset.pull;
        };
        const close = () => {
            if (closing) return;
            closing = true;
            pulling = false;
            window.clearTimeout(timer);
            closeRef.current();
        };
        // Stiff, slightly underdamped spring back to rest: settles in about 0.3 s.
        const springBack = () => {
            let x = offset, v = 0, last = performance.now();
            raw = 0;
            cancelAnimationFrame(raf);
            const step = (now: number) => {
                const dt = Math.min(0.032, (now - last) / 1000);
                last = now;
                v += (-700 * x - 40 * v) * dt;
                x += v * dt;
                if (Math.abs(x) < 0.3 && Math.abs(v) < 4) return reset();
                show(x);
                raf = requestAnimationFrame(step);
            };
            raf = requestAnimationFrame(step);
        };
        const startPull = (towards: Edge) => {
            cancelAnimationFrame(raf);
            // Continue from wherever a spring-back left the dialog.
            raw = towards === edge && offset > 0 ? unRubberBand(offset) : 0;
            edge = towards;
            pulling = true;
        };
        const pull = (amount: number) => {
            raw = Math.max(0, amount);
            show(rubberBand(raw));
            if (raw >= CLOSE_AT) close();
        };
        const release = (projected = 0) => {
            window.clearTimeout(timer);
            if (!pulling || closing) return;
            pulling = false;
            if (raw + projected >= CLOSE_AT) close(); else springBack();
        };

        const towardsOf = (deltaY: number): Edge | null => (deltaY < 0 ? "top" : deltaY > 0 ? "bottom" : null);
        const onWheel = (e: WheelEvent) => {
            const now = performance.now();
            const magnitude = Math.abs(e.deltaY);
            const target = towardsOf(e.deltaY);
            ratio = lastMagnitude ? magnitude / lastMagnitude : 0;
            decays = magnitude < lastMagnitude ? decays + 1 : 0;
            rises = magnitude > lastMagnitude ? rises + 1 : 0;
            if (decays >= MOMENTUM_DECAYS) inMomentum = true;
            // A new gesture starts after a pause, or when the deltas grow again during momentum
            // (fingers back on the trackpad).
            const fingersBack = inMomentum && magnitude >= 3 && (rises >= 2 || ratio > 1.5);
            if (now - lastWheel > GESTURE_GAP || fingersBack) {
                gestureScroll = dialog.scrollTop;
                gestureMayPull = true;
                gestureDone = false;
                inMomentum = false;
                decays = 0;
                rises = 0;
            }
            lastWheel = now;
            lastMagnitude = magnitude;

            if (closing) return e.preventDefault();
            if (!pulling && Math.abs(dialog.scrollTop - gestureScroll) > 1) gestureMayPull = false;
            if (gestureDone) {
                if (target && atEdge(target)) e.preventDefault(); // swallow the rest of the momentum
                return;
            }
            if (!pulling) {
                if (!gestureMayPull || !target || !atEdge(target)) return;
                startPull(target);
            }
            e.preventDefault();

            const delta = -e.deltaY * direction(); // positive pulls further
            if (decays >= MOMENTUM_DECAYS && delta > 0) {
                // Fingers lifted: project how far the momentum would still carry (geometric decay).
                const r = Math.min(0.97, Math.max(0.8, ratio));
                gestureDone = true;
                return release(delta * r / (1 - r));
            }
            pull(raw + delta);
            window.clearTimeout(timer);
            timer = window.setTimeout(() => { gestureDone = true; release(); }, RELEASE_PAUSE);
        };

        const onTouchStart = (e: TouchEvent) => {
            const edges = (["top", "bottom"] as Edge[]).filter(atEdge);
            const y = e.touches[0].clientY;
            touch = edges.length ? { y, edges, lastY: y, lastTime: performance.now(), velocity: 0 } : null;
        };
        const onTouchMove = (e: TouchEvent) => {
            if (!touch || closing) return;
            const y = e.touches[0].clientY, now = performance.now();
            const dy = y - touch.y;
            if (!pulling) {
                const candidate: Edge = dy > 0 ? "top" : "bottom";
                if (dy === 0 || !touch.edges.includes(candidate)) return;
                startPull(candidate);
            }
            e.preventDefault();
            touch.velocity = ((y - touch.lastY) / Math.max(1, now - touch.lastTime)) * direction();
            touch.lastY = y;
            touch.lastTime = now;
            pull(dy * 1.4 * direction());
        };
        const onTouchEnd = () => {
            const fling = touch ? Math.max(0, touch.velocity) * FLING_TIME * 1.4 : 0;
            touch = null;
            release(fling);
        };

        dialog.addEventListener("wheel", onWheel, { passive: false });
        dialog.addEventListener("touchstart", onTouchStart, { passive: true });
        dialog.addEventListener("touchmove", onTouchMove, { passive: false });
        dialog.addEventListener("touchend", onTouchEnd);
        dialog.addEventListener("touchcancel", onTouchEnd);
        return () => {
            cancelAnimationFrame(raf);
            window.clearTimeout(timer);
            reset();
            dialog.removeEventListener("wheel", onWheel);
            dialog.removeEventListener("touchstart", onTouchStart);
            dialog.removeEventListener("touchmove", onTouchMove);
            dialog.removeEventListener("touchend", onTouchEnd);
            dialog.removeEventListener("touchcancel", onTouchEnd);
        };
    }, [ref, enabled]);
}

export function Modal({ open, onClose, label, children, transitionName, pullToClose }: Props) {
    const ui = useUi().modal;
    const ref = useRef<HTMLDialogElement>(null);

    // Layout effect so the dialog opens within the same commit (needed for view transitions).
    // Focus goes back where it came from on close, but without scrolling the page there.
    const returnFocus = useRef<HTMLElement | null>(null);
    useIsomorphicLayoutEffect(() => {
        const dialog = ref.current!;
        if (open && !dialog.open) {
            returnFocus.current = document.activeElement as HTMLElement | null;
            dialog.showModal();
            dialog.scrollTop = 0;
        }
        if (!open && dialog.open) {
            dialog.close();
            returnFocus.current?.focus({ preventScroll: true });
        }
    }, [open]);

    usePullToClose(ref, open && !!pullToClose, onClose);

    const style = transitionName && open ? { viewTransitionName: transitionName } as CSSProperties : undefined;

    return (
        <dialog ref={ref} className={"modal" + (transitionName ? " morph" : "") + (pullToClose ? " pullable" : "")}
                aria-label={label} style={style} data-pull-down={ui.pullDown} data-pull-up={ui.pullUp}
                onCancel={(e) => { e.preventDefault(); onClose(); }}
                onClick={(e) => { if (e.target === ref.current) onClose(); }}>
            <div className="modalInner">
                <button className="iconButton modalClose" onClick={onClose} aria-label={ui.close}><IoClose /></button>
                {open && children}
            </div>
        </dialog>
    );
}
