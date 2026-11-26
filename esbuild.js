
const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const extensionOptions = {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    outfile: "dist/extension.js",
    external: ["vscode"],
    sourcemap: true
};

const webviewOptions = {
    entryPoints: ["webview/editor.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "es2022",
    outfile: "dist/webview/editor.js",
    sourcemap: true
};

async function build() {
    if (watch) {
        const extensionContext = await esbuild.context(extensionOptions);
        const webviewContext = await esbuild.context(webviewOptions);

        await extensionContext.watch();
        await webviewContext.watch();

        console.log("TypeWriter: watching for changes...");
    } else {
        await esbuild.build(extensionOptions);
        await esbuild.build(webviewOptions);

        console.log("TypeWriter: build completed.");
    }
}

build().catch(error => {
    console.error(error);
    process.exit(1);
});
