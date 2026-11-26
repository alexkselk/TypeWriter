
import * as vscode from "vscode";

export class CursorSync {
    private expectedSelection: string | null = null;

    constructor(
        private readonly document: vscode.TextDocument,
        private readonly webview: vscode.Webview
    ) {}

    private vscodeOffsetToLf(offset: number): number {
        const text = this.document.getText();
        let result = 0;

        for (let i = 0; i < Math.min(offset, text.length); i++) {
            if (text[i] !== "\r") {
                result++;
            }
        }

        return result;
    }

    private lfOffsetToVscode(offset: number): number {
        const text = this.document.getText();
        let lfPosition = 0;

        for (let i = 0; i < text.length; i++) {
            if (lfPosition === offset) {
                return i;
            }

            if (text[i] !== "\r") {
                lfPosition++;
            }
        }

        return text.length;
    }

    private selectionKey(anchor: number, head: number): string {
        return `${anchor}:${head}`;
    }

    public handleSelectionChange(
        event: vscode.TextEditorSelectionChangeEvent
    ): void {
        const editor = event.textEditor;

        if (
            editor.document.uri.toString() !==
            this.document.uri.toString()
        ) {
            return;
        }

        if (vscode.window.activeTextEditor !== editor) {
            return;
        }

        const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
        const input = tab?.input as any;

        if (input?.viewType === "typewriter.editor") {
            return;
        }

        const selection = event.selections[0];

        if (!selection) {
            return;
        }

        const anchor = this.vscodeOffsetToLf(
            this.document.offsetAt(selection.anchor)
        );

        const head = this.vscodeOffsetToLf(
            this.document.offsetAt(selection.active)
        );

        const key = this.selectionKey(anchor, head);

        if (key === this.expectedSelection) {
            this.expectedSelection = null;
            return;
        }

        this.webview.postMessage({
            type: "selection",
            anchor,
            head
        });
    }

    public applyFromWebview(
        anchor: number,
        head: number
    ): void {
        const editor =
            vscode.window.visibleTextEditors.find(
                candidate =>
                    candidate.document.uri.toString() ===
                    this.document.uri.toString()
            );

        if (!editor) {
            return;
        }

        const anchorPosition = this.document.positionAt(
            this.lfOffsetToVscode(anchor)
        );

        const headPosition = this.document.positionAt(
            this.lfOffsetToVscode(head)
        );

        this.expectedSelection = this.selectionKey(anchor, head);

        editor.selections = [
            new vscode.Selection(anchorPosition, headPosition)
        ];
    }
}
