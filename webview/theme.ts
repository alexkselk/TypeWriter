import { EditorView } from "@codemirror/view";

export const typewriterTheme = EditorView.theme({
    ".cm-scroller": {
        paddingTop: "50vh",
        paddingBottom: "50vh",
        backgroundColor: "#ffffff"
    },
    ".cm-content": {
        backgroundColor: "#ffffff"
    },
    ".cm-gutters": {
        backgroundColor: "#ffffff",
        border: "none"
    },
    ".cm-lineNumbers .cm-gutterElement": {
        fontSize: "0.75em",
        color: "#999999",
        padding: "0 8px 0 4px",
        display: "flex",
        alignItems: "flex-end",
        lineHeight: "1"
    },
    ".cm-activeLine": {
        backgroundColor: "#ffffff !important",
        borderBottom: "1px solid #cccccc"
    },
    ".cm-activeLineGutter": {
        backgroundColor: "#ffffff !important"
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "#b3d4fc !important"
    }
});
