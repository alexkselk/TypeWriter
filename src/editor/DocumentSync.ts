
import * as vscode from "vscode";

type TextChange = {
    from: number;
    to: number;
    insert: string;
};

type PendingEdit = {
    changes: TextChange[];
};

export class DocumentSync {
    private previousRawText: string;

    private editQueue: Promise<void> = Promise.resolve();

    private applyingWebviewEdit = false;
    private expectedChanges: TextChange[] | null = null;

    constructor(
        private readonly document: vscode.TextDocument,
        private readonly webview: vscode.Webview
    ) {
        this.previousRawText = document.getText();
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

    private vscodeOffsetToLf(
        offset: number,
        text: string
    ): number {
        let result = 0;
        const limit = Math.min(offset, text.length);

        for (let i = 0; i < limit; i++) {
            if (text[i] !== "\r") {
                result++;
            }
        }

        return result;
    }

    private lfOffsetToVscode(
        offset: number,
        text: string
    ): number {
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

    private sameChanges(
        actual: readonly vscode.TextDocumentContentChangeEvent[],
        expected: readonly TextChange[]
    ): boolean {
        if (actual.length !== expected.length) {
            return false;
        }

        const actualSorted = [...actual].sort(
            (a, b) => a.rangeOffset - b.rangeOffset
        );

        const expectedSorted = [...expected].sort(
            (a, b) => a.from - b.from
        );

        return actualSorted.every((change, index) => {
            const expectedChange = expectedSorted[index];

            return (
                change.rangeOffset === expectedChange.from &&
                change.rangeLength ===
                expectedChange.to - expectedChange.from &&
                change.text === expectedChange.insert
            );
        });
    }

    private sendDocument(failedSequence?: number): void {
        const text = this.document.getText();

        this.previousRawText = text;

        this.webview.postMessage({
            type: "document",
            text: this.normalizeToLf(text),
            version: this.document.version,
            failedSequence
        });
    }

    public sendInitialDocument(): void {
        this.sendDocument();
    }

    public applyFromWebview(
        changes: TextChange[],
        sequence: number
    ): Promise<void> {
        const operation: PendingEdit = { changes };

        this.editQueue = this.editQueue
            .then(() => this.applyOperation(operation, sequence))
            .catch(() => {
                this.sendDocument(sequence);
            });

        return this.editQueue;
    }

    private async applyOperation(
        operation: PendingEdit,
        sequence: number
    ): Promise<void> {
        const changes = operation.changes;

        if (!Array.isArray(changes) || changes.length === 0) {
            return;
        }

        const currentText = this.document.getText();
        const normalizedLength =
            this.normalizeToLf(currentText).length;

        const sorted = [...changes].sort(
            (a, b) => a.from - b.from
        );

        let previousEnd = -1;

        for (const change of sorted) {
            if (
                !Number.isInteger(change.from) ||
                !Number.isInteger(change.to) ||
                change.from < 0 ||
                change.to < change.from ||
                change.to > normalizedLength ||
                typeof change.insert !== "string" ||
                change.from < previousEnd
            ) {
                this.sendDocument(sequence);
                return;
            }

            previousEnd = change.to;
        }

        const edit = new vscode.WorkspaceEdit();
        const expected: TextChange[] = [];

        for (const change of changes) {
            const from = this.lfOffsetToVscode(
                change.from,
                currentText
            );

            const to = this.lfOffsetToVscode(
                change.to,
                currentText
            );

            const insert = this.expandToDocEol(change.insert);

            edit.replace(
                this.document.uri,
                new vscode.Range(
                    this.document.positionAt(from),
                    this.document.positionAt(to)
                ),
                insert
            );

            expected.push({
                from,
                to,
                insert
            });
        }

        const versionBefore = this.document.version;

        this.expectedChanges = expected;
        this.applyingWebviewEdit = true;

        let applied = false;

        try {
            applied = await vscode.workspace.applyEdit(edit);
        } finally {
            this.applyingWebviewEdit = false;
            this.expectedChanges = null;
        }

        if (!applied) {
            this.sendDocument(sequence);
            return;
        }

        this.previousRawText = this.document.getText();

        this.webview.postMessage({
            type: "documentAck",
            sequence,
            version: this.document.version
        });
    }

    public handleExternalChange(
        event: vscode.TextDocumentChangeEvent
    ): void {
        if (
            event.document.uri.toString() !==
            this.document.uri.toString()
        ) {
            return;
        }

        const isOwnChange =
            this.applyingWebviewEdit &&
            this.expectedChanges !== null &&
            this.sameChanges(
                event.contentChanges,
                this.expectedChanges
            );

        const oldText = this.previousRawText;
        const newText = this.document.getText();

        this.previousRawText = newText;

        if (isOwnChange) {
            return;
        }

        const changes: TextChange[] =
            event.contentChanges.map(change => {
                const from = change.rangeOffset;
                const to = from + change.rangeLength;

                return {
                    from: this.vscodeOffsetToLf(from, oldText),
                    to: this.vscodeOffsetToLf(to, oldText),
                    insert: this.normalizeToLf(change.text)
                };
            });

        if (changes.length === 0) {
            return;
        }

        this.webview.postMessage({
            type: "externalChanges",
            changes,
            version: this.document.version
        });
    }
}
