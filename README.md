# VSCode for ERCx

This extension provides a way to run the [ERCx](https://ercx.runtimeverification.com/) tests inside VSCode.
When you open a .sol file, click on the code lens above the contract name to generate
the tests, then click run on the testing view.

The Extension uses the [ERCx API](https://ercx.runtimeverification.com/open-api) and a full suite of tests.
It usually takes around 2 minutes depending on server load.

The Extension only supports a single self-contained Solidity file as input for now.

You need to install an extension for Solidity syntax highlighting for this extension to work
as it activates `onLanguage:solidity`.

![loop](https://raw.githubusercontent.com/runtimeverification/ercx-vscode/5ea45164451df9d0cb4505f7d9bc0540724a6572/media/ercx-loop.gif)
