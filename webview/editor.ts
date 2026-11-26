
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";

import { ScrollController } from "./scrollController";
import "./style.css";

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

let applyingExternalChange = false;

const editorElement = document.getElementById("editor");

if (!editorElement) {
    throw new Error("Editor element not found");
}

const scrollController = new ScrollController({
    anchor: 0.5,
    smoothingTimeMs: 110
});

const view = new EditorView({
    state: EditorState.create({
        doc: "",
        extensions: [
            basicSetup,

            EditorView.updateListener.of(update => {
                if (update.docChanged && !applyingExternalChange) {
                    const changes: {
                        from: number;
                        to: number;
                        insert: string;
                    }[] = [];

                    update.changes.iterChanges(
                        (fromA, toA, _fromB, _toB, inserted) => {
                            changes.push({
                                from: fromA,
                                to: toA,
                                insert: inserted.toString()
                            });
                        }
                    );

                    if (changes.length > 0) {
                        vscode.postMessage({
                            type: "edit",
                            changes
                        });
                    }
                }

                if (update.selectionSet || update.docChanged) {
                    scrollController.center(update.view);
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

        try {
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: message.text
                }
            });
        } finally {
            applyingExternalChange = false;
        }

        scrollController.center(view);
    }

    if (message.type === "externalChanges") {
        applyingExternalChange = true;

        try {
            view.dispatch({
                changes: message.changes
            });

            if (message.changes?.length > 0) {
                const last =
                    message.changes[message.changes.length - 1];

                const position =
                    last.from + (last.insert?.length ?? 0);

                view.dispatch({
                    selection: { anchor: position }
                });
            }
        } finally {
            applyingExternalChange = false;
        }

        scrollController.center(view);
    }

    if (message.type === "cursor") {
        const position = message.offset;

        if (
            typeof position === "number" &&
            position >= 0 &&
            position <= view.state.doc.length
        ) {
            view.dispatch({
                selection: { anchor: position }
            });

            scrollController.center(view, position);
        }
    }
});

window.addEventListener("resize", () => {
    scrollController.center(view);
});

window.addEventListener("beforeunload", () => {
    scrollController.destroy();
});

vscode.postMessage({ type: "ready" });
