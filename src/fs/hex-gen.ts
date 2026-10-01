import { BoardId } from "../device/board-id";
import { FlashDataSource, HexGenerationError } from "../device/device";

import { clang, Clang, waitForCompiler } from "../clang/clang";
import { FileSystem } from "./fs";

export interface HexGenerator extends FlashDataSource {
    toHexForSave(): Promise<string>
}

export class ClangHexGenerator implements HexGenerator {
    private clang : Clang;

    constructor(private fs : FileSystem) {
        this.clang = clang("en");
    }

    private async flashData(): Promise<Uint8Array> {
        try {
            await waitForCompiler();
            await this.clang.compiler.compile(await this.files());
            const hex = await this.clang.compiler.getHex();
            return hex;
        } catch (e: any) {
            throw new HexGenerationError(e.message);
        }
    } 

    async partialFlashData(boardId: BoardId): Promise<Uint8Array> {
        try {
            return await this.flashData();
        } catch (e: any) {
            throw new HexGenerationError(e.message);
        }
    }

    async fullFlashData(boardId: BoardId): Promise<Uint8Array> {
        try {
            return await this.flashData();
        } catch (e: any) {
            throw new HexGenerationError(e.message);
        }
    }

    async toHexForSave(): Promise<string> {
        try {
            // llvm-objcopy writes an ASCII Intel HEX file. Decode those bytes as
            // text directly instead of round-tripping them through hex strings.
            const ihex = new TextDecoder("ascii").decode(await this.flashData());
            if (!ihex.startsWith(":")) {
                throw new Error("The CODAL compiler output is not an Intel HEX file.");
            }
          return ihex;
        } catch (e: any) {
          throw new HexGenerationError(e.message);
        }
      }

        // Convert a byte array to hex
    async toHexString(byteArray: Uint8Array) : Promise<string> {
        return Array.prototype.map.call(byteArray, function(byte) {
            return ('0' + (byte & 0xFF).toString(16)).slice(-2);
        }).join('');
    }

    // Convert hex to ascii hex (ihex). Format read by the microbit.
    async hex2ascii(hexx : string) : Promise<string>{
        var hex = hexx.toString()
        var str = '';
        for (var i = 0; i < hex.length; i += 2)
            str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        return str;
    }

    async files(): Promise<Record<string, Uint8Array>> {
        return this.fs.files();
    }
}