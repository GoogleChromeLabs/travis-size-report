"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const fs_1 = require("fs");
const gzip_size_1 = __importDefault(require("gzip-size"));
const glob_1 = __importDefault(require("glob"));
const globP = util_1.promisify(glob_1.default);
const statP = util_1.promisify(fs_1.stat);
function escapeTilde(str) {
    return str.replace(/\~/g, '\\~');
}
/**
 * Recursively-read a directory and turn it into an array of FileDatas
 */
function pathsToInfoArray(paths) {
    return Promise.all(paths.map(async (path) => {
        const lastSlashIndex = path.lastIndexOf('/');
        const lastHiphenIndex = path.lastIndexOf('-');
        const name = escapeTilde(path.substring(lastSlashIndex + 1, lastHiphenIndex));
        const gzipSizePromise = gzip_size_1.default.file(path);
        const statSizePromise = statP(path).then(s => s.size);
        return {
            name,
            path,
            size: await statSizePromise,
            gzipSize: await gzipSizePromise,
        };
    }));
}
async function getBuildInfo(files) {
    // Get target files
    const filePaths = [];
    for (const glob of files) {
        const matches = await globP(glob, { nodir: true });
        filePaths.push(...matches);
    }
    const uniqueFilePaths = [...new Set(filePaths)];
    // Output the current build sizes for later retrieval.
    return pathsToInfoArray(uniqueFilePaths);
}
exports.getBuildInfo = getBuildInfo;
