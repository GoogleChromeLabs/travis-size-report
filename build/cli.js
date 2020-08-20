"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const minimist_1 = __importDefault(require("minimist"));
const argv = minimist_1.default(process.argv.slice(2), {
    alias: { c: 'config' },
});
// Read arguments from command line
const configFile = argv.config;
const repo = argv._[0];
const glob = argv._[1];
function getConfig() {
    let config = {};
    // Read arguments from config file
    if (configFile) {
        config = require(path_1.default.join(process.cwd(), configFile === true ? 'sizereport.config.js' : configFile));
    }
    // Override config file with command line arguments
    if (repo)
        config.repo = repo;
    if (glob)
        config.path = glob;
    if (!config.repo)
        throw TypeError('No repo given');
    if (!config.path)
        throw TypeError('No path given');
    if (!config.repo.includes('/'))
        throw TypeError("Repo doesn't look like repo value");
    config.buildSizePath = config.buildSizePath || 'public/assets';
    if (typeof config.path === 'string')
        config.path = [config.path];
    return config;
}
exports.getConfig = getConfig;
