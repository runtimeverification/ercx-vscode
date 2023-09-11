# VSCode for ERCx

This extension provides a way to run the [ERCx](https://ercx.runtimeverification.com/) tests inside VSCode.
When you open a .sol file, click on the code lens above the contract name to generate
the tests, then click run on the testing view.

This accesses the ERCx API and a full suit of tests take around 2min depending on
server load.

At this time, we only accept single files.

## Running the Extension from source

- Run `npm install` in terminal to install dependencies
- Run the `Run Extension` target in the Debug View (`F5`). This will:
	- Start a task `npm: watch` to compile the code
	- Run the extension in a new VS Code window
- Open a `*.sol` file containing the given content
