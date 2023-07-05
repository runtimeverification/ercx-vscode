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

export async function activate(context: vscode.ExtensionContext) {
	const codelensProvider = new CodelensProvider();
	vscode.languages.registerCodeLensProvider("solidity", codelensProvider);

	vscode.commands.registerCommand("ercx.codelensAction", (args: any, ctrctName: any) => {
		vscode.window.showInformationMessage(`CodeLens action clicked with args=${args} ${ctrctName}`);
	});

	const ctrl = vscode.tests.createTestController('ERCxtests', 'ERCx Tests');
	context.subscriptions.push(ctrl);

	const fileChangedEmitter = new vscode.EventEmitter<vscode.Uri>();
	const runHandler = (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken) => {
		const run = ctrl.createTestRun(request);
		const queue: vscode.TestItem[] = [];

		// Loop through all included tests, or all known tests, and add them to our queue
		if (request.include) {
            request.include.forEach(test => queue.push(test));
		} else {
			ctrl.items.forEach(test => queue.push(test));
		}

		const res = JSON.parse(readFileSync("/home/radu/work/ercx-vscode/results/result.json", "utf8"));
		console.log(res);

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
						if (k1.startsWith(test.label)) {
							if (tresult['success']) {
								run.passed(test, 1);
							} else {
								run.failed(test, new vscode.TestMessage("error"), 1);
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

	ctrl.resolveHandler = async item => {
		if (!item) {
			context.subscriptions.push(...startWatchingWorkspace(ctrl, fileChangedEmitter));
			return;
		}

		const data = testData.get(item);
		if (data instanceof TestFile) {
			await data.updateFromDisk(ctrl, item);
		}
	};
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
	addERCxTests(controller);
}

function startWatchingWorkspace(controller: vscode.TestController, fileChangedEmitter: vscode.EventEmitter<vscode.Uri> ) {
	return getWorkspaceTestPatterns().map(({ workspaceFolder, pattern }) => {
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		addERCxTests(controller);

		return watcher;
	});
}

function addERCxTests(controller: vscode.TestController) {
	const existing = controller.items.get("ERCx");
	if (existing) {
		return { file: existing, data: testData.get(existing) as TestFile };
	}

	const ercxYaml = YAML.load(readFileSync("/home/radu/work/ercx/ercx/src/ercx/standards/ERC20.yaml", "utf8")) as any;
	console.log(ercxYaml['levels']);

	const ercxRoot = controller.createTestItem("ERCx", "ERCx Conformance tests");
	ercxRootSet.add(ercxRoot);
	const levels = new Map<string, vscode.TestItem>;
	for (const level of ercxYaml.levels) {
		const ti = controller.createTestItem(level, level);
		levels.set(level, ti);
		ercxRoot.children.add(ti);
	}

	for (const [k, v] of Object.entries(ercxYaml.tests)) {
		const ti = controller.createTestItem(k, k);
		const lvl = (v as any)['level'];
		const pti = levels.get(lvl);
		pti?.children.add(ti);
	}

	controller.items.add(ercxRoot);

	const data = new TestFile();
	testData.set(ercxRoot, data);

	ercxRoot.canResolveChildren = true;

	return { ercxRoot, data };
}
