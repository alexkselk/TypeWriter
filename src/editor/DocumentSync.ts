import * as vscode from "vscode";

export class DocumentSync {
    private previousRawText: string;
    private suppressCursorSyncUntil = 0;
    private ourRecentChanges: Array<{
        from: number;
        to: number;
        insert: string;
        timestamp: number;
    }> = [];

    constructor(
        private readonly document: vscode.TextDocument,
        private readonly webview: vscode.Webview
    ) {
        this.previousRawText = document.getText();
    }

    public get suppressUntil() {
        return this.suppressCursorSyncUntil;
    }

    private normalizeToLf(text: string): string {
        return text.replace(/\r\n/g, "\n");
    }

    private expandToDocEol(text: string): string {
        if (this.document.eol === vscode.EndOfLine.CRLF) {
            return text.replace(/\n/g, "\r\n");
        }
        return text;
    }

    private vscodeOffsetToLf(vscodeOffset: number, fullText: string): number {
        let lfPos = 0;
        const limit = Math.min(vscodeOffset, fullText.length);
        for (let i = 0; i < limit; i++) {
            if (fullText[i] !== "\r") lfPos++;
        }
        return lfPos;
    }

    private lfOffsetToVscode(lfOffset: number, fullText: string): number {
        let lfPos = 0;
        for (let i = 0; i < fullText.length; i++) {
            if (lfPos === lfOffset) return i;
            if (fullText[i] !== "\r") lfPos++;
        }
        return fullText.length;
    }

    private isOurChange(from: number, to: number, insert: string): boolean {
        const now = Date.now();
        while (this.ourRecentChanges.length && now - this.ourRecentChanges[0].timestamp > 500) {
            this.ourRecentChanges.shift();
        }
        const idx = this.ourRecentChanges.findIndex(
            c => c.from === from && c.to === to && c.insert === insert
        );
        if (idx !== -1) {
            this.ourRecentChanges.splice(idx, 1);
            return true;
        }
        return false;
    }

    public async applyFromWebview(changes: { from: number; to: number; insert: string }[]) {
        if (changes.length === 0) return;

        const currentText = this.document.getText();
        const edit = new vscode.WorkspaceEdit();

        for (const change of changes) {
            const vscodeFrom = this.lfOffsetToVscode(change.from, currentText);
            const vscodeTo = this.lfOffsetToVscode(change.to, currentText);
            const insert = this.expandToDocEol(change.insert);

            edit.replace(
                this.document.uri,
                new vscode.Range(
                    this.document.positionAt(vscodeFrom),
                    this.document.positionAt(vscodeTo)
                ),
                insert
            );

            this.ourRecentChanges.push({
                from: vscodeFrom,
                to: vscodeTo,
                insert,
                timestamp: Date.now()
            });
        }

        this.suppressCursorSyncUntil = Date.now() + 200;
        await vscode.workspace.applyEdit(edit);
        this.previousRawText = this.document.getText();
    }

    public handleExternalChange(event: vscode.TextDocumentChangeEvent) {
        if (event.document.uri.toString() !== this.document.uri.toString()) return;

        const changesToSend: { from: number; to: number; insert: string }[] = [];

        for (const change of event.contentChanges) {
            const from = change.rangeOffset;
            const to = change.rangeOffset + change.rangeLength;
            const insert = change.text;

            if (this.isOurChange(from, to, insert)) continue;

            changesToSend.push({
                from: this.vscodeOffsetToLf(from, this.previousRawText),
                to: this.vscodeOffsetToLf(to, this.previousRawText),
                insert: this.normalizeToLf(insert)
            });
        }

        this.previousRawText = this.document.getText();

        if (changesToSend.length > 0) {
            this.webview.postMessage({
                type: "externalChanges",
                changes: changesToSend
            });
        }
    }

    public sendInitialDocument() {
        this.previousRawText = this.document.getText();
        this.webview.postMessage({
            type: "document",
            text: this.normalizeToLf(this.previousRawText)
        });
    }
}