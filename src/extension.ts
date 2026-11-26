import * as vscode from "vscode";
import { TypeWriterEditorProvider } from "./editor/TypeWriterProvider";

export function activate(context: vscode.ExtensionContext) {
    console.log("TypeWriter extension is now active.");

    const provider = new TypeWriterEditorProvider(context);

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            TypeWriterEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: true
            }
        )
    );

    const typeCommand = vscode.commands.registerCommand(
        "typewriter.type",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const ext = editor.document.fileName.split(".").pop()?.toLowerCase();
            if (!["txt", "md"].includes(ext ?? "")) return;

            await vscode.commands.executeCommand(
                "vscode.openWith",
                editor.document.uri,
                TypeWriterEditorProvider.viewType
            );
        }
    );

    const standardEditorCommand = vscode.commands.registerCommand(
        "typewriter.openStandardEditor",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await vscode.commands.executeCommand(
                    "vscode.openWith",
                    editor.document.uri,
                    "default"
                );
            }
        }
    );

    const toggleCommand = vscode.commands.registerCommand(
        "typewriter.toggle",
        async () => {
            const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
            const input = tab?.input as any;

            if (input?.viewType === TypeWriterEditorProvider.viewType) {
                await vscode.commands.executeCommand(
                    "vscode.openWith",
                    input.uri,
                    "default"
                );
            } else {
                const editor = vscode.window.activeTextEditor;
                if (!editor) return;
                const ext = editor.document.fileName.split(".").pop()?.toLowerCase();
                if (["txt", "md"].includes(ext ?? "")) {
                    await vscode.commands.executeCommand(
                        "vscode.openWith",
                        editor.document.uri,
                        TypeWriterEditorProvider.viewType
                    );
                }
            }
        }
    );

    context.subscriptions.push(typeCommand, standardEditorCommand, toggleCommand);
}

export function deactivate() {}