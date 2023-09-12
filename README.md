# VSCode for ERCx

This extension provides a way to run the [ERCx](https://ercx.runtimeverification.com/) tests inside VSCode.
When you open a .sol file, click on the code lens above the contract name to generate
the tests, then click run on the testing view.

This accesses the ERCx API and a full suit of tests take around 2min depending on
server load.

At this time, we only accept single files.

## Running the Extension from source

### Preparation

- Please have [Node.js](https://nodejs.org/en) (>= 18) and [yarn](https://yarnpkg.com/getting-started/install) installed.
- Run `yarn install` in terminal to install dependencies

### Debug the extension locally

Open this project in VSCode:

- Run the `Run Extension` target in the Debug View (`F5`). This will:
  - Start a task `npm: watch` to compile the code
  - Run the extension in a new VS Code window
- Open a `*.sol` file containing the given content

### Debug the extension in browser

- Start the `watch` mode:
  - Run the `Run Extension` target in the Debug View (`F5`). This will:
    - Start a task `npm: watch` to compile the code
    - Run the extension in a new VS Code window. But you can ignore it.
  - <strong>OR:</strong>
  - Open a terminal tab, then run `yarn run watch`.
- Start the [vscode-test-web](https://github.com/microsoft/vscode-test-web) service:
  - Open a new terminal tab, then run `yarn run-in-browser`
  - Open http://localhost:3000 in browser:
    - You may find that your `*.sol` is not syntax highlighted and detected as solidity file.  
      In this case, install **one** of the following VSCode extensions:
      - [Solidity Language & Themes (only)](https://marketplace.visualstudio.com/items?itemName=tintinweb.vscode-solidity-language)
      - [Solidity+Yul Semantic Syntax](https://marketplace.visualstudio.com/items?itemName=contractshark.solidity-lang)

### Debug the extension in vscode.dev

Please follow the instructions [here](https://code.visualstudio.com/api/extension-guides/web-extensions#test-your-web-extension-in-vscode.dev).

## Package the extension:

```bash
$ vsce package
```
