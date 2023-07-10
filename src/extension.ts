// ercx -gen -gensource -tokpath ERC20Basic.sol -tokclass ERC20Basic -fd . -o test -finit -json -ot testPositiveTransferEventEmission -exec 20
// run on ERC20Basic.sol
// /home/radu/work/ercx/ercx/src/ercx/standards/ERC20.yaml
// make shell - to enter the ercx shell

import * as vscode from 'vscode';
import { TestCase, testData, TestFile } from './testTree';
import { readFile } from 'fs/promises';
import * as YAML from 'js-yaml';
import { readFileSync } from 'fs';
import { CodelensProvider } from './CodelensProvider';

export const ercxRootSet = new Set<vscode.TestItem>();
export const ercxTests = new Map<string, ERCxTest>();

export async function activate(context: vscode.ExtensionContext) {
	const codelensProvider = new CodelensProvider();
	vscode.languages.registerCodeLensProvider("solidity", codelensProvider);

	const ctrl = vscode.tests.createTestController('ERCxtests', 'ERCx Tests');
	context.subscriptions.push(ctrl);

	vscode.commands.registerCommand("ercx.codelensAction", (fileName: vscode.Uri, ctrctName: string, range:vscode.Range) => {
		//vscode.window.showInformationMessage(`CodeLens action clicked with args=${fileName} ${ctrctName} ${range}`);
		console.log(`CodeLens action clicked with args=${fileName} ${ctrctName} ${range}`);
		addERCxTests(ctrl, fileName, range);
	});


	const fileChangedEmitter = new vscode.EventEmitter<vscode.Uri>();
	const runHandler = (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken) => {
		const run = ctrl.createTestRun(request, `Running Tests`, false);
		const queue: vscode.TestItem[] = [];

		// Loop through all included tests, or all known tests, and add them to our queue
		if (request.include) {
            request.include.forEach(test => queue.push(test));
		} else {
			ctrl.items.forEach(test => queue.push(test));
		}

		// try to find the result file if not found then run ERCx
		const resultFile:string = queue.at(0)?.uri?.fsPath.toString().substring(0, queue.at(0)?.uri?.fsPath.toString().lastIndexOf(".")) + ".result.json";
		const res = JSON.parse(readFileSync(resultFile, "utf8"));

		// For every test that was queued, try to run it. Call run.passed() or run.failed().
		// The `TestMessage` can contain extra information, like a failing location or
		// a diff output. But here we'll just give it a textual message.
		while (queue.length > 0 && !cancellation.isCancellationRequested) {
			const test = queue.pop()!;

			// Skip tests the user asked to exclude
			if (request.exclude?.includes(test)) {
				continue;
			}
			console.log("test:" + test.label);
			if (test.children.size != 0) {
				test.children.forEach(test => queue.push(test));
			} else {
				for (const [k, v] of Object.entries(res)) {
					//console.log(k + " " + v);
					for (const [k1, v1] of Object.entries((v as any)['test_results'])) {
						const tresult = v1 as any;
						//console.log(k1 + " " + tresult);
						if (k1.startsWith(test.id + "(")) {
							if (tresult['status'] == "Success") {
								run.passed(test, 1);
							} else {
								const feedback:string = ercxTests.get(test.id)?.feedback ?? "error";
								const expected:string = ercxTests.get(test.id)?.property ?? "error";
								run.failed(test, vscode.TestMessage.diff(new vscode.MarkdownString(feedback), expected, feedback), 1);
								//run.failed(test, new vscode.TestMessage(new vscode.MarkdownString(feedback)), 1); // this can take Markdown as input
							}
						}
					}
				}
			}
		}

		// Make sure to end the run after all tests have been executed:
		run.end();
	};

	const startTestRun = (request: vscode.TestRunRequest) => {
		const queue: { test: vscode.TestItem; data: TestCase }[] = [];
		const run = ctrl.createTestRun(request);
		const res = JSON.parse(readFileSync("/home/radu/work/ercx-vscode/results/result.json", "utf8"));
		console.log("results:");
		console.log(res);



		run.end();
	};

	ctrl.refreshHandler = async () => {
		await Promise.all(getWorkspaceTestPatterns().map(({ pattern }) => findInitialFiles(ctrl, pattern)));
	};

	ctrl.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, runHandler, true, undefined, true);
}

function getWorkspaceTestPatterns() {
	if (!vscode.workspace.workspaceFolders) {
		return [];
	}

	return vscode.workspace.workspaceFolders.map(workspaceFolder => ({
		workspaceFolder,
		pattern: new vscode.RelativePattern(workspaceFolder, '**/*.sol'),
	}));
}

async function findInitialFiles(controller: vscode.TestController, pattern: vscode.GlobPattern) {
	//addERCxTests(controller);
}

function startWatchingWorkspace(controller: vscode.TestController, fileChangedEmitter: vscode.EventEmitter<vscode.Uri> ) {
	return getWorkspaceTestPatterns().map(({ workspaceFolder, pattern }) => {
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		//addERCxTests(controller);

		return watcher;
	});
}

function addERCxTests(controller: vscode.TestController, fileName:vscode.Uri, range:vscode.Range) {
	const existing = controller.items.get("ERCx");
	if (existing) {
		return { file: existing, data: testData.get(existing) as TestFile };
	}

	const ercxYaml = YAML.load(readFileSync("/home/radu/work/ercx/ercx/src/ercx/standards/ERC20.yaml", "utf8")) as any;
	console.log(ercxYaml['levels']);

	const ercxRoot = controller.createTestItem("ERCx", fileName.path.split('/').pop()! + " - ERC20 Tests", fileName);
	ercxRootSet.add(ercxRoot);
	const levels = new Map<string, vscode.TestItem>;
	for (const level of ercxYaml.levels) {
		const Level:string = level[0].toUpperCase() + level.slice(1); // capitalize first letter
		const ti = controller.createTestItem(level, Level, fileName);
		ti.range = range;
		levels.set(level, ti);
		ercxRoot.children.add(ti);
	}

	for (const [k, v] of Object.entries(ercxYaml.tests)) {
		if (k == "testAbiFoundInEtherscan" || k == "testAddressIsImplementationContract") // these tests only make sense for deployed contracts not source code
			continue;
		const et = new ERCxTest(k, (v as any)['level'], (v as any)['property'], (v as any)['feedback'], (v as any)['expected'], (v as any)['categories']);
		ercxTests.set(k, et);
		const ti = controller.createTestItem(k, et.Name, fileName);
		ti.range = range;
		const lvl = (v as any)['level'];
		const pti = levels.get(lvl);
		pti?.children.add(ti);
	}

	controller.items.add(ercxRoot);

	const data = new TestFile();
	testData.set(ercxRoot, data);

	//ercxRoot.canResolveChildren = true;

	return { ercxRoot, data };
}

class ERCxTest {
	public readonly Name: string;
	constructor(public readonly name: string,
			public readonly level:string,
			public readonly property: string,
			public readonly feedback: string,
			public readonly expected: string,
			public readonly categories: string[]) {
				this.Name = name.slice(4);
	}
}
