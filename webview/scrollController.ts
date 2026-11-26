
import { EditorView } from "@codemirror/view";

interface ScrollControllerOptions {
    anchor?: number;
    smoothingTimeMs?: number;
}

export class ScrollController {
    private readonly anchor: number;
    private readonly smoothingTimeMs: number;

    private view: EditorView | null = null;
    private position = 0;
    private frameId: number | null = null;
    private lastFrameTime = 0;

    constructor(options: ScrollControllerOptions = {}) {
        this.anchor = Math.max(
            0,
            Math.min(1, options.anchor ?? 0.5)
        );

        this.smoothingTimeMs = Math.max(
            20,
            options.smoothingTimeMs ?? 110
        );
    }

    public center(
        view: EditorView,
        position = view.state.selection.main.head
    ): void {
        this.view = view;

        this.position = Math.max(
            0,
            Math.min(
                view.state.doc.length,
                Math.trunc(position)
            )
        );

        if (this.frameId === null) {
            this.lastFrameTime = 0;
            this.frameId = requestAnimationFrame(this.tick);
        }
    }

    private tick = (timestamp: number): void => {
        this.frameId = null;

        const view = this.view;

        if (!view || !view.dom.isConnected) {
            this.lastFrameTime = 0;
            return;
        }

        const scroller = view.scrollDOM;
        const coords = view.coordsAtPos(this.position);

        if (!coords || scroller.clientHeight === 0) {
            this.lastFrameTime = 0;
            return;
        }

        const scrollerRect = scroller.getBoundingClientRect();

        const cursorCenter = (coords.top + coords.bottom) / 2;

        const targetScrollTop =
            scroller.scrollTop +
            cursorCenter -
            scrollerRect.top -
            scroller.clientHeight * this.anchor;

        const currentScrollTop = scroller.scrollTop;
        const difference = targetScrollTop - currentScrollTop;

        if (Math.abs(difference) < 0.5) {
            this.lastFrameTime = 0;
            return;
        }

        const elapsed = this.lastFrameTime === 0
            ? 16
            : Math.min(timestamp - this.lastFrameTime, 32);

        this.lastFrameTime = timestamp;

        const factor =
            1 - Math.exp(-elapsed / this.smoothingTimeMs);

        const nextScrollTop =
            currentScrollTop + difference * factor;

        scroller.scrollTop = nextScrollTop;

        const actualMovement =
            scroller.scrollTop - currentScrollTop;

        // Stop if the browser cannot scroll any further.
        if (Math.abs(actualMovement) < 0.01) {
            this.lastFrameTime = 0;
            return;
        }

        if (Math.abs(targetScrollTop - scroller.scrollTop) > 0.5) {
            this.frameId = requestAnimationFrame(this.tick);
        } else {
            scroller.scrollTop = targetScrollTop;
            this.lastFrameTime = 0;
        }
    };

    public destroy(): void {
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }

        this.view = null;
        this.lastFrameTime = 0;
    }
}
