# Travis size report

Let Travis tell you what changed compared to the last successful build on a particular branch. This helps you catch unexpected file renames and size changes.

<img width="593" alt="Screenshot 2019-04-05 at 15 55 13" src="https://user-images.githubusercontent.com/93594/55636656-3ae38180-57bb-11e9-9fad-e8cf0a262957.png">

## Installation

```sh
npm install -D travis-size-report
```

Then, in `.travis.yml`:

```yml
after_success: sizereport --config
```

## Config

### Config file

This is typically `sizereport.config.js`.

```js
module.exports = {
  repo: 'GoogleChromeLabs/travis-size-report',
  path: 'dist/**/*',
  branch: 'master',
  findRenamed(path, newPaths) {
    // …
  },
};
```

- `repo` (required) - The username/repo-name.
- `path` (required) - The glob (or array of globs) of files to include in the report.
- `branch` (optional, default: 'master') - The branch to check against.
- `findRenamed(path, newPaths)` (optional) - See below

#### `findRenamed(path, newPaths)`

By default, a renamed file will look like one file deleted and another created. By writing a `findRenamed` callback, you can tell travis-size-report that a file was renamed from thing to another.

- `path` – A path that existed in the previous build, but doesn't exist in the new build.
- `newPaths` - Paths that appear in the new build, but didn't appear in the previous build.

Match up `path` to one of the `newPaths` by returning the matching `newPath`. Or return undefined if `path` was deleted rather than renamed.

For example, if my files looked like `name.hash.extension` I would consider `main.abcde.js` and `main.12345.js` to be the same file, renamed. I could match them up like this:

```js
const minimatch = require('minimatch');
const { parse } = require('path');

module.exports = {
  repo: 'GoogleChromeLabs/travis-size-report',
  path: 'dist/**/*',
  findRenamed(path, newPaths) {
    const parsedPath = parse(path);
    // Split the file into name, hash, and the rest
    const re = /^([^.]+)\.([^.]+)(\..+)$/.exec(parsedPath.base);
    if (!re) return;
    const [base, name, hash, extension] = re;
    const toMatch = `${parsedPath.dir}/${name}.*.${extension}`;
    return newPaths.find(path => minimatch(path, toMatch));
  },
};
```

### Command line

```sh
sizereport [flags] repo path
```

Flags:

- `--config` (or `-c`) – Path to the config file. If no path is provided, `./sizereport.config.js` is the default.
- `--branch` - Same as `branch` in the config file.

`repo` and `path` are the same as their equivalents in the config file.

It's recommended to use the config file rather than use args. If both are used, the command line args take priority over values in the config file.

## Results

Results appear at the end of your Travis log. They're folded away by default, so you'll need to click on the sizereport line to expand it.
