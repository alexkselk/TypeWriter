
import { EditorState } from "@codemirror/state";
import {
    EditorView,
    lineNumbers,
    highlightActiveLineGutter
} from "@codemirror/view";
// import { basicSetup } from "codemirror";
import { minimalSetup } from "codemirror";

import { ScrollController } from "./scrollController";
import "./style.css";

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

const vscode = acquireVsCodeApi();

let applyingExternalChange = false;
let applyingExternalSelection = false;

let nextSequence = 1;
let inFlightSequence: number | null = null;

const pendingEdits: Array<{
    sequence: number;
    changes: {
        from: number;
        to: number;
        insert: string;
    }[];
}> = [];

let documentVersion = 0;

const editorElement = document.getElementById("editor");

if (!editorElement) {
    throw new Error("Editor element not found");
}

const scrollController = new ScrollController({
    anchor: 0.5,
    smoothingTimeMs: 110
});

let view: EditorView;

function sendNextEdit(): void {
    if (
        inFlightSequence !== null ||
        pendingEdits.length === 0
    ) {
        return;
    }

    const operation = pendingEdits.shift();

    if (!operation) {
        return;
    }

    inFlightSequence = operation.sequence;

    vscode.postMessage({
        type: "edit",
        sequence: operation.sequence,
        changes: operation.changes
    });
}

view = new EditorView({
    state: EditorState.create({
        doc: "",
        extensions: [
            minimalSetup,

            lineNumbers({
                formatNumber: (lineNo, state) => {
                    const currentLine =
                        state.doc.lineAt(state.selection.main.head).number;
                    var r = "     ";
                    
                    if (lineNo === 1 || lineNo === state.doc.lines) {
                        r = "-----";
                    }

                    if (lineNo % 10 === 0) {
                        r = String(lineNo).padEnd(5, "_");
                    }

                    if (lineNo === currentLine) {
                        r = r.slice(0, 4) + ">";
                    }

                    return r;
                }
            }),

            highlightActiveLineGutter(),

            EditorView.updateListener.of(update => {
                if (
                    update.docChanged &&
                    !applyingExternalChange
                ) {
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
                        pendingEdits.push({
                            sequence: nextSequence++,
                            changes
                        });

                        sendNextEdit();
                    }
                }

                if (
                    (update.selectionSet || update.docChanged) &&
                    !applyingExternalSelection &&
                    !applyingExternalChange
                ) {
                    const selection =
                        update.state.selection.main;

                    vscode.postMessage({
                        type: "selection",
                        anchor: selection.anchor,
                        head: selection.head
                    });
                }

                if (
                    update.selectionSet ||
                    update.docChanged
                ) {
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
        // A full document snapshot invalidates queued local edits.
        pendingEdits.length = 0;
        inFlightSequence = null;

        documentVersion = message.version ?? 0;

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
        return;
    }

    if (message.type === "documentAck") {
        if (message.sequence !== inFlightSequence) {
            return;
        }

        documentVersion = message.version ?? documentVersion;
        inFlightSequence = null;

        sendNextEdit();
        return;
    }

    if (message.type === "externalChanges") {
        // External offsets refer to the document state in VS Code.
        // If local edits are still pending, request a clean snapshot.
        if (
            inFlightSequence !== null ||
            pendingEdits.length > 0
        ) {
            vscode.postMessage({ type: "resync" });
            return;
        }

        const changes = [...message.changes].sort(
            (a, b) => a.from - b.from
        );

        applyingExternalChange = true;

        try {
            view.dispatch({ changes });
            documentVersion = message.version ?? documentVersion;
        } finally {
            applyingExternalChange = false;
        }

        scrollController.center(view);
        return;
    }

    if (message.type === "selection") {
        const { anchor, head } = message;

        if (
            typeof anchor !== "number" ||
            typeof head !== "number" ||
            anchor < 0 ||
            head < 0 ||
            anchor > view.state.doc.length ||
            head > view.state.doc.length
        ) {
            return;
        }

        applyingExternalSelection = true;

        try {
            view.dispatch({
                selection: { anchor, head }
            });
        } finally {
            applyingExternalSelection = false;
        }

        scrollController.center(view, head);
    }
});

window.addEventListener("resize", () => {
    scrollController.center(view);
});

window.addEventListener("beforeunload", () => {
    scrollController.destroy();
});

vscode.postMessage({ type: "ready" });
