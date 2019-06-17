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
  findRenamed: '[name]-[hash][extname]',
};
```

- `repo` (required) - The username/repo-name.
- `path` (required) - The glob (or array of globs) of files to include in the report.
- `branch` (optional, default: 'master') - The branch to check against.
- `findRenamed` (optional) - See below

#### `findRenamed`

By default, a renamed file will look like one file deleted and another created. However, you can help travis-size-report identify this as a renamed file.

`findRenamed` can be a string, or a callback. The string form can have the following placeholders:

- `[name]` - Any character (`.+` in Regex).
- `[hash]` - A typical version hash (`[a-f0-9]+` in Regex).
- `[extname]` - The extension of the file (`\.\w+` in Regex).

If you provide `'[name]-[hash][extname]'` as the value to `findRenamed`, it will consider `foo-a349fb.js` and `foo-cd6ef2.js` to be the same file, renamed.

The callback form is `(oldPath, newPaths) => matchingNewPath`.

- `oldPath` - A path that existed in the previous build, but doesn't exist in the new build.
- `newPaths` - Paths that appear in the new build, but didn't appear in the previous build.

Match up `oldPath` to one of the `newPaths` by returning the matching `newPath`. Or return undefined if `oldPath` was deleted rather than renamed.

### Command line

```sh
sizereport [flags] repo path
```

Flags:

- `--config` (or `-c`) - Path to the config file. If no path is provided, `./sizereport.config.js` is the default.
- `--branch` - Same as `branch` in the config file.

`repo` and `path` are the same as their equivalents in the config file.

It's recommended to use the config file rather than use args. If both are used, the command line args take priority over values in the config file.

## Results

Results appear at the end of your Travis log. They're folded away by default, so you'll need to click on the sizereport line to expand it.
