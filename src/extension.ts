
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { TypeWriterEditorProvider } from "./editor/TypeWriterProvider";

const PENDING_MEGA_ZEN_KEY = "typewriter.pendingMegaZen";
const MEGA_ZEN_MARKER = "mega-zen-target.json";

export async function activate(context: vscode.ExtensionContext) {
    console.log("TypeWriter extension is now active.");
    console.log("[MegaZen] Extension mode:", context.extensionMode);
    console.log("[MegaZen] Extension path:", context.extensionPath);

    // Register TypeWriter custom editor provider
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

    // Restore document in a newly opened isolated Mega Zen window
    const markerPath = path.join(
        context.globalStorageUri.fsPath,
        MEGA_ZEN_MARKER
    );

    if (fs.existsSync(markerPath)) {
        try {
            const marker = JSON.parse(
                fs.readFileSync(markerPath, "utf8")
            ) as { uri?: string };

            fs.unlinkSync(markerPath);

            if (marker.uri) {
                console.log("[MegaZen] Restoring document:", marker.uri);

                const uri = vscode.Uri.parse(marker.uri);

                await vscode.commands.executeCommand(
                    "vscode.openWith",
                    uri,
                    TypeWriterEditorProvider.viewType
                );

                // Allow the new window to finish opening the editor
                await new Promise(resolve => setTimeout(resolve, 700));

                await vscode.commands.executeCommand(
                    "workbench.action.toggleFullScreen"
                );

                console.log("[MegaZen] Document opened in Mega Zen.");
            }
        } catch (error) {
            console.error("[MegaZen] Failed to restore document:", error);

            vscode.window.showErrorMessage(
                "Mega Zen: failed to open the document."
            );
        }
    }

    // Production fallback: restore document from global state
    const pendingMegaZen = context.globalState.get<string>(
        PENDING_MEGA_ZEN_KEY
    );

    if (pendingMegaZen) {
        await context.globalState.update(
            PENDING_MEGA_ZEN_KEY,
            undefined
        );

        try {
            const uri = vscode.Uri.parse(pendingMegaZen);

            console.log("[MegaZen] Restoring production document:", pendingMegaZen);

            await vscode.commands.executeCommand(
                "vscode.openWith",
                uri,
                TypeWriterEditorProvider.viewType
            );

            await new Promise(resolve => setTimeout(resolve, 700));

            await vscode.commands.executeCommand(
                "workbench.action.toggleFullScreen"
            );
        } catch (error) {
            console.error("[MegaZen] Production restore failed:", error);

            vscode.window.showErrorMessage(
                "Mega Zen: failed to restore the document."
            );
        }
    }

    // TypeWriter: Type
    const typeCommand = vscode.commands.registerCommand(
        "typewriter.type",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const ext = path.extname(editor.document.fileName)
                .toLowerCase();

            if (![".txt", ".md"].includes(ext)) return;

            await vscode.commands.executeCommand(
                "vscode.openWith",
                editor.document.uri,
                TypeWriterEditorProvider.viewType
            );
        }
    );

    // TypeWriter: Open in Standard Editor
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

    // TypeWriter: Toggle
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

                const ext = path.extname(editor.document.fileName)
                    .toLowerCase();

                if ([".txt", ".md"].includes(ext)) {
                    await vscode.commands.executeCommand(
                        "vscode.openWith",
                        editor.document.uri,
                        TypeWriterEditorProvider.viewType
                    );
                }
            }
        }
    );

    // TypeWriter: Mega Zen
    const megaZenCommand = vscode.commands.registerCommand(
        "typewriter.megaZen",
        async () => {
            const tab = vscode.window.tabGroups.activeTabGroup.activeTab;

            const input = tab?.input as {
                viewType?: string;
                uri?: vscode.Uri;
            } | undefined;

            if (
                input?.viewType !== TypeWriterEditorProvider.viewType ||
                !input.uri
            ) {
                return;
            }

            const uri = input.uri;

            const workspaceFolder =
                vscode.workspace.getWorkspaceFolder(uri);

            let folder: vscode.Uri;

            if (workspaceFolder) {
                folder = workspaceFolder.uri;
            } else if (uri.scheme === "file") {
                folder = vscode.Uri.file(path.dirname(uri.fsPath));
            } else {
                vscode.window.showWarningMessage(
                    "Mega Zen: cannot determine the folder for this document."
                );
                return;
            }

            // Development mode: launch a separate VS Code instance
            // with its own user-data directory.
            if (
                context.extensionMode === vscode.ExtensionMode.Development
            ) {
                const userDataDir = path.join(
                    context.globalStorageUri.fsPath,
                    "mega-zen",
                    `${Date.now()}-${process.pid}`
                );

                const markerDir = path.join(
                    userDataDir,
                    "User",
                    "globalStorage",
                    context.extension.id
                );

                fs.mkdirSync(markerDir, { recursive: true });

                const markerPath = path.join(
                    markerDir,
                    MEGA_ZEN_MARKER
                );

                fs.writeFileSync(
                    markerPath,
                    JSON.stringify({
                        uri: uri.toString()
                    }),
                    "utf8"
                );

                const args = [
                    "--new-window",
                    `--user-data-dir=${userDataDir}`,
                    `--extensionDevelopmentPath=${context.extensionPath}`,
                    folder.fsPath
                ];

                console.log("[MegaZen] Launching isolated window.");
                console.log("[MegaZen] Executable:", process.execPath);
                console.log("[MegaZen] Arguments:", args);
                console.log("[MegaZen] Marker:", markerPath);
                console.log("[MegaZen] Document:", uri.fsPath);

                const codeCmd = path.join(
                    path.dirname(process.execPath),
                    "bin",
                    "code.cmd"
                );

                const quote = (value: string) =>
                    `"${value.replace(/"/g, '""')}"`;

                const commandLine = [
                    quote(codeCmd),
                    ...args.map(quote)
                ].join(" ");

                console.log("[MegaZen] Command line:", commandLine);

                const child = spawn(
                    process.env.ComSpec || "cmd.exe",
                    [
                        "/d",
                        "/s",
                        "/c",
                        `"${commandLine}"`
                    ],
                    {
                        detached: true,
                        stdio: ["ignore", "pipe", "pipe"],
                        windowsHide: true,
                        windowsVerbatimArguments: true
                    }
                );

                child.stdout?.on("data", data => {
                    console.log("[MegaZen] CLI stdout:", data.toString());
                });

                child.stderr?.on("data", data => {
                    console.error("[MegaZen] CLI stderr:", data.toString());
                });

                child.on("error", error => {
                    console.error("[MegaZen] Launch error:", error);
                    vscode.window.showErrorMessage(
                        `Mega Zen launch failed: ${error.message}`
                    );
                });

                child.on("close", (code, signal) => {
                    console.log("[MegaZen] CLI process closed:", { code, signal });
                });

                child.unref();
                return;
            }

            // Production mode: open a separate window
            await context.globalState.update(
                PENDING_MEGA_ZEN_KEY,
                uri.toString()
            );

            try {
                await vscode.commands.executeCommand(
                    "vscode.openFolder",
                    folder,
                    { forceNewWindow: true }
                );
            } catch (error) {
                await context.globalState.update(
                    PENDING_MEGA_ZEN_KEY,
                    undefined
                );

                console.error("[MegaZen] Failed to open new window:", error);

                vscode.window.showErrorMessage(
                    "Mega Zen: failed to open a new window."
                );
            }
        }
    );

    context.subscriptions.push(
        typeCommand,
        standardEditorCommand,
        toggleCommand,
        megaZenCommand
    );
}

export function deactivate() { }
