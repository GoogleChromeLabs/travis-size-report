#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cli_1 = require("./cli");
const utils_1 = require("./utils");
const config = cli_1.getConfig();
async function init() {
    const dir = process.cwd();
    const outputFilePath = path_1.default.join(dir, config.buildSizePath, 'buildsize.json');
    const buildInfo = await utils_1.getBuildInfo(config.path);
    fs_1.default.writeFileSync(outputFilePath, JSON.stringify(buildInfo));
}
init();
