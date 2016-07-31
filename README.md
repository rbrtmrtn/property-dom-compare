property-dom-compare
--------------------

This is a Node app to find differences in the OPA- and AIS-backed versions of the Philadelphia Property Search app.

## Usage

1. `git clone` this repo.
2. Install dependencies with `npm install`
3. Diff all accounts and write out: `node index.js >! diffs.log`

## Options

- `--shuffle`: randomize accounts
- `--max [number]`: limit number of accounts to diff
- `--show`: show Electron while running
