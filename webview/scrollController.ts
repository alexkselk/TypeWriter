import { EditorView } from "@codemirror/view";

export function centerActiveLine(view: EditorView, pos?: number) {
    const target = pos ?? view.state.selection.main.head;

    view.dispatch({
        effects: EditorView.scrollIntoView(target, {
            y: "center",
            yMargin: 0
        })
    });
}

let timer: number | null = null;

export function scheduleCenter(view: EditorView, pos?: number) {
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(() => {
        centerActiveLine(view, pos);
        timer = null;
    }, 16);
}