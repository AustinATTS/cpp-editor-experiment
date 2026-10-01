
import { baseUrl } from "../base"
import { Clangd } from "./clangd";
import { CODALCompiler } from "./compile";

let clangObj : Clang;
let compilerReady = false;
let compilerLoadError = "";
let compilerReadyPromise: Promise<void> | undefined;
let resolveCompilerReady: (() => void) | undefined;

export interface Clang {
    worker : Worker,
    compiler: CODALCompiler,
    clangd: Clangd,
}

export const clang = (langauge : string) : Clang => {
    if (clangObj) return clangObj;

    compilerReady = false;
    compilerLoadError = "";
    compilerReadyPromise = new Promise<void>(resolve => { resolveCompilerReady = resolve; });

    const clangWorker = new Worker(new URL(`${baseUrl}codal-wasm/llvm-worker.js`, window.location.href), {type:"module"});

    const compiler = new CODALCompiler(clangWorker);
    const clangd = new Clangd(clangWorker, langauge);

    const originalOnMessage = clangWorker.onmessage;
    clangWorker.onmessage = (e => {
        const msg = e.data;
            switch (msg.target) {
                case "compile":     compiler.handleWorkerMessage(msg);  break;
                case "clangd":      originalOnMessage?.call(clangWorker, e); break; //this is the handler created by the vscode-jsonrpc connection
                case "worker":      if (msg.type === "error") {
                                        compiler.handleWorkerMessage(msg);
                                    }
                                    handleWorkerMessage(msg);
                                    break;
                default:            console.warn(`Unknown message target '${msg.target}' from worker.\nFull message:`); console.warn(msg);
            }
    });

    clangObj = {
        worker: clangWorker,
        compiler: compiler,
        clangd: clangd,
    }

    clangWorker.addEventListener("error", (event) => {
        const location = event.filename ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}` : "";
        const detail = [event.message, location, (event as ErrorEvent).error?.message, (event as ErrorEvent).error?.stack]
          .filter(Boolean)
          .join("\n");
        const message = detail || "CODAL compiler worker failed to start.";
        compilerLoadError = message;
        resolveCompilerReady?.();
        compiler.handleWorkerMessage({ type: "error", body: message });
        loadErrorCallback(message);
    });

    return clangObj;
}

export async function waitForCompiler(): Promise<void> {
    if (!clangObj) {
        clang("en");
    }
    const ready = compilerReadyPromise;
    if (!ready) {
        throw new Error("CODAL compiler initialization did not start.");
    }
    await ready;
    if (compilerLoadError) {
        throw new Error(compilerLoadError);
    }
    if (!compilerReady) {
        throw new Error("CODAL compiler initialization did not complete.");
    }
}

let progressCallback = (progress : number, msg : string) => {console.log(`[${(progress * 100).toFixed(0)}%] ${msg}`);}
export function onProgress(callback : (progress:number, msg:string)=>void) {
    progressCallback = callback;
}

let loadedCallback = () => {}
export function onLoaded(callback : ()=>void) {
    loadedCallback = callback;
}

let loadErrorCallback = (_message: string) => {}
export function onLoadError(callback: (message: string) => void) {
    loadErrorCallback = callback;
}

function handleWorkerMessage(msg : any) {
    switch (msg.type) {
        case "info":        console.log(`[Worker] ${msg.body}`); break;
        case "error":
            compilerLoadError = String(msg.body || "Compiler initialization failed.");
            resolveCompilerReady?.();
            console.error(`[Worker] Error: ${compilerLoadError}`);
            loadErrorCallback(compilerLoadError);
            break;
        case "progress":    progressCallback(msg.progress, msg.body); break;
        case "progress/done":
            compilerReady = true;
            resolveCompilerReady?.();
            loadedCallback();
            break;
        default:            console.warn(`Unhandled message '${msg.type}' from worker.\nFull message:\n${msg}`);
    }
}


