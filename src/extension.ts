// ercx -gen -gensource -tokpath ERC20Basic.sol -tokclass ERC20Basic -fd . -o test -finit -json -ot testPositiveTransferEventEmission -exec 20
// time ercx -gen -gensource -tokpath MyToken.sol -tokclass MyToken -fd fdDir -o test -finit -json -exec 20
// run on ERC20Basic.sol
// /home/radu/work/ercx/ercx/src/ercx/standards/ERC20.yaml
// make shell - to enter the ercx shell

import * as vscode from 'vscode';
import { TestCase, testData, TestFile } from './testTree';
import { exec, execSync } from "child_process";
import * as YAML from 'js-yaml';
import { existsSync, readFileSync } from 'fs';
import { CodelensProvider } from './CodelensProvider';
import * as path from "path";
import fetch from 'cross-fetch';

export const ercxRootSet = new Set<vscode.TestItem>();
export const ercxTests = new Map<string, ERCxTest>();

export async function activate(context: vscode.ExtensionContext) {
	const codelensProvider = new CodelensProvider();
	vscode.languages.registerCodeLensProvider("solidity", codelensProvider);

	const ctrl = vscode.tests.createTestController('ERCxtests', 'ERCx Tests');
	context.subscriptions.push(ctrl);

	vscode.commands.registerCommand("ercx.codelensAction", (document: vscode.TextDocument, ctrctName: string, range:vscode.Range) => {
		//vscode.window.showInformationMessage(`CodeLens action clicked with args=${fileName} ${ctrctName} ${range}`);
		console.log(`CodeLens action clicked with args=${document.uri} ${ctrctName} ${range}`);
		addERCxTests(ctrl, document, range);
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
		const filePath:string = queue.at(0)?.uri?.fsPath.toString() + "";
		const fileContent:string = readFileSync(filePath, "utf8");
		//TODO: const ercxRunRes:string = execERCxAndGetResult(queue.at(0)?.uri?.fsPath.toString() ?? "", "MyToken");
		let res = JSON.parse("{}"); //JSON.parse(readFileSync(resultFile, "utf8"));


		const apiRes = fetch("https://ercx.runtimeverification.com/api/v1/reports", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body:JSON.stringify({
				"sourceCodeFile": {
					"name": path.parse(filePath).base,
					"content": fileContent,
					"path": queue.at(0)?.uri?.fsPath.toString()
				},
				"tokenClass": "MyToken"
			})
		}).then(response => {
			console.log(response.body);
			if (response.ok) {
				const x = response.json();
				x.then(body => {
					if (body['status'] == "DONE") {
						const report = JSON.parse(body['json']);
						console.log("report: " + report);
						res = report;
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

					} else {
						console.log("Status: " + body['status']);
					}
					// Make sure to end the run after all tests have been executed:
					run.end();
				});
			} else
				console.log("response !OK");
		}).catch(error => console.log("API error: " + error));
		console.log("Interpreting result" + res);
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

function addERCxTests(controller: vscode.TestController, document: vscode.TextDocument, range:vscode.Range) {
	const existing = controller.items.get("ERCx");
	if (existing) {
		return { file: existing, data: testData.get(existing) as TestFile };
	}

	const ercxYamlPath = path.join(vscode.workspace.getConfiguration('ercx').get('ercxPath') ?? "work/ercx/ercx", "src/ercx/standards/ERC20.yaml");
	console.log("Exists " + ercxYamlPath + ": " + existsSync(ercxYamlPath));
	//console.log(execSync("pwd", {"cwd":ercxYamlPath}).toString());
	const ercxYaml = YAML.load(readFileSync(ercxYamlPath, "utf8")) as any;
	console.log(ercxYaml['levels']);

	const docTokens = getSolidityTokenLoc(document);
	console.log("docTokens:" + docTokens);

	const ercxRoot = controller.createTestItem("ERCx", document.uri.path.split('/').pop()! + " - ERC20 Tests", document.uri);
	ercxRootSet.add(ercxRoot);
	const levels = new Map<string, vscode.TestItem>;
	for (const level of ercxYaml.levels) {
		const Level:string = level[0].toUpperCase() + level.slice(1); // capitalize first letter
		const ti = controller.createTestItem(level, Level, document.uri);
		ti.range = range;
		levels.set(level, ti);
		ercxRoot.children.add(ti);
	}

	for (const [k, v] of Object.entries(ercxYaml.tests)) {
		if (k == "testAbiFoundInEtherscan" || k == "testAddressIsImplementationContract") // these tests only make sense for deployed contracts not source code
			continue;
		const et = new ERCxTest(k, (v as any)['level'], (v as any)['property'], (v as any)['feedback'], (v as any)['expected'], (v as any)['concerned_function'], (v as any)['categories']);
		ercxTests.set(k, et);
		const ti = controller.createTestItem(k, et.Name, document.uri);
		// find a token that fits one of the categories
		//ti.range = docTokens.get(et.categories.find(c => docTokens.has(c)) ?? "\n") ?? range;
		ti.range = docTokens.get(et.concerned_function) ?? range;
		const pti = levels.get(et.level);
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
			public readonly concerned_function: string,
			public readonly categories: string[]) {
				this.Name = name.slice(4);
	}
}

function getSolidityTokenLoc(document:vscode.TextDocument):Map<string, vscode.Range> {
    const fileAst = JSON.parse(execSync(`solc --ast-compact-json ${document.uri.path}`).toString().split(new RegExp(`======= \\S+ =======`))[1]);
	console.log(fileAst);
	const tokenLoc = new Map<string, vscode.Range>();
	getSolidityTokenLoc2(document, fileAst, tokenLoc);
	return tokenLoc;
}

function getSolidityTokenLoc2(document:vscode.TextDocument, jsonObj:any, tokenLoc:Map<string, vscode.Range>) {
	if ((jsonObj['nodeType'] ?? "").endsWith("Definition") || (jsonObj['nodeType'] ?? "").endsWith("Declaration")) {
		const name = jsonObj['name'];
		const src = jsonObj['src'];
		const srcParts = src.split(':');
		const offset = parseInt(srcParts[0]);
		const len = parseInt(srcParts[1]);
		const range = new vscode.Range(document.positionAt(offset), document.positionAt(offset + len));
		tokenLoc.set(name, range);
	}
	for (const [k, v] of Object.entries(jsonObj)) {
		//console.log(typeof v);
		if (Array.isArray(v)) {
			v.forEach((child:any) => getSolidityTokenLoc2(document, child, tokenLoc));
		} else if (typeof v === 'object') {
			getSolidityTokenLoc2(document, v, tokenLoc);
		}
	}
}

function execERCxAndGetResult(document:string, contractName:string):string {
	const ercxPath:string = path.join(vscode.workspace.getConfiguration('ercx').get('ercxPath') ?? "../../ercx/ercx");
	// ercx -gen -gensource -nologo -tokpath MyToken.sol -tokclass MyToken -fd fdDir -o test -finit -json -exec 20
	const cmd = `python -m src.ercx.ercx -gen -gensource -nologo -tokpath ${document} -tokclass ${contractName} -fd ${contractName}fdDir -o test -finit -json -exec 20`;
	//const cmd = `ls -al`;
	console.log(cmd);
	const res = execSync(cmd, {cwd: ercxPath}).toString();
	console.log(res);
	if (existsSync(`${ercxPath}/report-local.json`)) {
		return readFileSync(`${ercxPath}/report-local.json`).toString();
	}
	return "";
}
