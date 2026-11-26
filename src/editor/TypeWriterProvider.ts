import * as vscode from "vscode";
import { DocumentSync } from "./DocumentSync";
import { CursorSync } from "./CursorSync";

export class TypeWriterEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = "typewriter.editor";

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const webview = webviewPanel.webview;

        webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, "dist")
            ]
        };

        webview.html = this.getHtml(webview);

        const documentSync = new DocumentSync(document, webview);
        const cursorSync = new CursorSync(
            document,
            webview,
            () => documentSync.suppressUntil
        );

        const changeSub = vscode.workspace.onDidChangeTextDocument(e => {
            documentSync.handleExternalChange(e);
        });

        const selectionSub = vscode.window.onDidChangeTextEditorSelection(e => {
            cursorSync.handleSelectionChange(e);
        });

        webview.onDidReceiveMessage(async message => {
            if (message.type === "ready") {
                documentSync.sendInitialDocument();
            }
            if (message.type === "edit") {
                await documentSync.applyFromWebview(message.changes);
            }
        });

        webviewPanel.onDidDispose(() => {
            changeSub.dispose();
            selectionSub.dispose();
        });
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "editor.js")
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; script-src ${webview.cspSource}; style-src 'unsafe-inline';">
    <title>TypeWriter</title>
    <style>
        body { margin: 0; background: #ffffff; color: #222222; }
        #editor { min-height: 100vh; }
        .cm-editor { min-height: 100vh; font-size: 24px; }
        .cm-scroller { font-family: Consolas, monospace; overflow: auto; }
        .cm-content { padding: 40px; }
        .cm-focused { outline: none; }
    </style>
</head>
<body>
    <div id="editor"></div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}