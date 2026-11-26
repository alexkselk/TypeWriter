import * as vscode from "vscode";

export class CursorSync {
    constructor(
        private readonly document: vscode.TextDocument,
        private readonly webview: vscode.Webview,
        private readonly getSuppressUntil: () => number
    ) {}

    public handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
        if (Date.now() < this.getSuppressUntil()) return;
        if (event.textEditor.document.uri.toString() !== this.document.uri.toString()) return;
        if (event.textEditor.viewColumn === undefined) return;

        const active = vscode.window.activeTextEditor;
        if (!active || active !== event.textEditor) return;

        const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const input = tab?.input as any;
        if (input?.viewType === "typewriter.editor") return;

        const selection = event.selections[0];
        if (!selection) return;

        const offset = this.document.offsetAt(selection.active);
        const text = this.document.getText();
        let lfOffset = 0;
        const limit = Math.min(offset, text.length);
        for (let i = 0; i < limit; i++) {
            if (text[i] !== "\r") lfOffset++;
        }

        this.webview.postMessage({
            type: "cursor",
            offset: lfOffset
        });
    }
}