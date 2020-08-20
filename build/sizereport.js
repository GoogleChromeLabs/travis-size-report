#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cli_1 = require("./cli");
const _1 = __importDefault(require("."));
const config = cli_1.getConfig();
const opts = {};
if (config.findRenamed)
    opts.findRenamed = config.findRenamed;
const [user, repoName] = config.repo.split('/');
_1.default(user, repoName, config.path, config.cdnUrl, opts);
