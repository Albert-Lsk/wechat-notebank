"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeJsonOutput = writeJsonOutput;
function writeJsonOutput(value) {
    process.stdout.write(`${JSON.stringify(value)}\n`);
}
