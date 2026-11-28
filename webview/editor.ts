
import { EditorState } from "@codemirror/state";
import {
    EditorView,
    lineNumbers,
    highlightActiveLineGutter
} from "@codemirror/view";
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

            EditorView.lineWrapping,

            lineNumbers({
                formatNumber: (lineNo, state) => {
                    const currentLine =
                        state.doc.lineAt(state.selection.main.head).number;

                    let r = "     ";

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


// --------------------------------------------------
// Responsive scaling
// --------------------------------------------------

const BASE_FONT_SIZE = 24;
const BASE_PADDING = 40;
const TARGET_CHARACTERS = 60;

let currentScale = 1;

const measureElement = document.createElement("span");

measureElement.textContent = "0000000000";

Object.assign(measureElement.style, {
    position: "absolute",
    visibility: "hidden",
    whiteSpace: "pre",
    fontFamily: getComputedStyle(view.dom).fontFamily,
    fontSize: `${BASE_FONT_SIZE}px`,
    fontWeight: "normal",
    letterSpacing: "normal"
});

document.body.appendChild(measureElement);

const baseCharWidth =
    measureElement.getBoundingClientRect().width / 10;

measureElement.remove();

function updateEditorScale(): void {
    const gutters = view.dom.querySelector(".cm-gutters");

    if (!gutters) {
        return;
    }

    const availableWidth = editorElement.clientWidth;

    if (availableWidth <= 0) {
        return;
    }

    // Gutter width at the current scale.
    const currentGutterWidth =
        gutters.getBoundingClientRect().width;

    // Convert gutter width back to its base size.
    const baseGutterWidth =
        currentGutterWidth / currentScale;

    // Total width required for 60 characters.
    const requiredWidth =
        TARGET_CHARACTERS * baseCharWidth +
        BASE_PADDING * 2 +
        baseGutterWidth;

    const newScale = Math.min(
        1,
        availableWidth / requiredWidth
    );

    if (Math.abs(newScale - currentScale) < 0.001) {
        return;
    }

    currentScale = newScale;

    document.documentElement.style.setProperty(
        "--tw-scale",
        String(newScale)
    );

    requestAnimationFrame(() => {
        scrollController.center(view);
    });
}

const resizeObserver = new ResizeObserver(() => {
    updateEditorScale();
});

resizeObserver.observe(editorElement);

// Initial measurement after CodeMirror has rendered.
requestAnimationFrame(() => {
    updateEditorScale();
});


// --------------------------------------------------
// Messages from extension
// --------------------------------------------------

window.addEventListener("message", event => {
    const message = event.data;

    if (message.type === "document") {
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


// --------------------------------------------------
// Cleanup
// --------------------------------------------------

window.addEventListener("beforeunload", () => {
    resizeObserver.disconnect();
    scrollController.destroy();
});

vscode.postMessage({ type: "ready" });
