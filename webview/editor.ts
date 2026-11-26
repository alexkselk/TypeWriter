import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { typewriterTheme } from "./theme";

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

let applyingExternalChange = false;

const editorElement = document.getElementById("editor");
if (!editorElement) throw new Error("Editor element not found");

function centerLine(view: EditorView, pos?: number) {
    const target = pos ?? view.state.selection.main.head;
    view.dispatch({
        effects: EditorView.scrollIntoView(target, {
            y: "center",
            yMargin: 0
        })
    });
}

let t: number | null = null;
function scheduleCenter(view: EditorView, pos?: number) {
    if (t !== null) clearTimeout(t);
    t = window.setTimeout(() => {
        centerLine(view, pos);
        t = null;
    }, 10);
}

const view = new EditorView({
    state: EditorState.create({
        doc: "",
        extensions: [
            basicSetup,
            history(),
            typewriterTheme,
            keymap.of([...defaultKeymap, ...historyKeymap]),
            EditorView.updateListener.of(update => {
                if (update.docChanged && !applyingExternalChange) {
                    const changes: { from: number; to: number; insert: string }[] = [];
                    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                        changes.push({ from: fromA, to: toA, insert: inserted.toString() });
                    });
                    if (changes.length > 0) {
                        vscode.postMessage({ type: "edit", changes });
                    }
                }

                if (update.selectionSet || update.docChanged) {
                    scheduleCenter(view);
                }
            })
        ]
    }),
    parent: editorElement
});

window.addEventListener("message", event => {
    const message = event.data;

    if (message.type === "document") {
        applyingExternalChange = true;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: message.text }
        });
        applyingExternalChange = false;
        scheduleCenter(view);
    }

    if (message.type === "externalChanges") {
        applyingExternalChange = true;
        view.dispatch({ changes: message.changes });
        applyingExternalChange = false;

        if (message.changes?.length > 0) {
            const last = message.changes[message.changes.length - 1];
            const pos = last.from + (last.insert?.length ?? 0);
            view.dispatch({ selection: { anchor: pos } });
            scheduleCenter(view, pos);
        }
    }

    if (message.type === "cursor") {
        const pos = message.offset;
        if (typeof pos === "number" && pos >= 0 && pos <= view.state.doc.length) {
            view.dispatch({ selection: { anchor: pos } });
            scheduleCenter(view, pos);
        }
    }
});

window.addEventListener("resize", () => scheduleCenter(view));

vscode.postMessage({ type: "ready" });
