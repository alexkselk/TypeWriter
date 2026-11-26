import { EditorView } from "@codemirror/view";

function easeInOutBack(t: number): number {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
}

let animating = false;

export function centerActiveLine(view: EditorView, pos?: number, scroller?: HTMLElement) {
    const targetPos = pos ?? view.state.selection.main.head;
    const coords = view.coordsAtPos(targetPos);

    if (!coords || !scroller) {
        view.dispatch({
            effects: EditorView.scrollIntoView(targetPos, { y: "center" })
        });
        return;
    }

    const rect = scroller.getBoundingClientRect();
    const lineCenter = (coords.top + coords.bottom) / 2;
    const desired = rect.top + rect.height / 2;
    const delta = lineCenter - desired;

    if (Math.abs(delta) < 2) return;

    const start = scroller.scrollTop;
    const target = Math.max(0, start + delta);
    const distance = target - start;
    const duration = 420;
    const startTime = performance.now();

    animating = true;

    function step(now: number) {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = easeInOutBack(t);
        scroller!.scrollTop = start + distance * eased;

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            animating = false;
        }
    }

    requestAnimationFrame(step);
}

let timer: number | null = null;

export function scheduleCenter(view: EditorView, pos?: number, scroller?: HTMLElement) {
    if (animating) return;
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(() => {
        centerActiveLine(view, pos, scroller);
        timer = null;
    }, 16);
}