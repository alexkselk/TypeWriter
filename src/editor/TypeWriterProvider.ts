
import * as vscode from "vscode";
import { DocumentSync } from "./DocumentSync";
import { CursorSync } from "./CursorSync";

export class TypeWriterEditorProvider
    implements vscode.CustomTextEditorProvider {

    public static readonly viewType = "typewriter.editor";

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const webview = webviewPanel.webview;

        webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(
                    this.context.extensionUri,
                    "dist"
                )
            ]
        };

        webview.html = this.getHtml(webview);

        const documentSync = new DocumentSync(
            document,
            webview
        );

        const cursorSync = new CursorSync(
            document,
            webview,
            () => documentSync.suppressUntil
        );

        const changeSub =
            vscode.workspace.onDidChangeTextDocument(event => {
                documentSync.handleExternalChange(event);
            });

        const selectionSub =
            vscode.window.onDidChangeTextEditorSelection(event => {
                cursorSync.handleSelectionChange(event);
            });

        const messageSub = webview.onDidReceiveMessage(
            async message => {
                if (message.type === "ready") {
                    documentSync.sendInitialDocument();
                }

                if (message.type === "edit") {
                    await documentSync.applyFromWebview(
                        message.changes
                    );
                }
            }
        );

        webviewPanel.onDidDispose(() => {
            changeSub.dispose();
            selectionSub.dispose();
            messageSub.dispose();
        });
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                "dist",
                "webview",
                "editor.js"
            )
        );

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                "dist",
                "webview",
                "editor.css"
            )
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <meta
        http-equiv="Content-Security-Policy"
        content="
            default-src 'none';
            script-src ${webview.cspSource};
            style-src ${webview.cspSource} 'unsafe-inline';
        "
    >

    <title>TypeWriter</title>

    <link
        rel="stylesheet"
        href="${styleUri}"
    >
</head>

<body>
    <div id="editor"></div>

    <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
