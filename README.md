# VSCode for ERCx

This extension provides a way to run the [ERCx](https://ercx.runtimeverification.com/) tests inside VSCode.
When you open a .sol file, click on the code lens above the contract name to generate
the tests, then click run on the testing view.

The Extension uses the [ERCx API](https://ercx.runtimeverification.com/open-api) and a full suite of tests. It usually takes around 2 minutes depending on server load.

The Extension only supports a single self-contained Solidity file as input.

![loop](https://github.com/runtimeverification/ercx-vscode/blob/6a68fac5650feae064db2a31d539152791de57d8/media/ercx-loop.gif)