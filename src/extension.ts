// ercx -gen -gensource -tokpath ERC20Basic.sol -tokclass ERC20Basic -fd . -o test -finit -json -ot testPositiveTransferEventEmission -exec 20
// time ercx -gen -gensource -tokpath MyToken.sol -tokclass MyToken -fd fdDir -o test -finit -json -exec 20
// run on ERC20Basic.sol
// /home/radu/work/ercx/ercx/src/ercx/standards/ERC20.yaml
// make shell - to enter the ercx shell

import fetch from 'cross-fetch';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as solc from 'solc';
import * as vscode from 'vscode';
import { CodelensProvider } from './CodelensProvider';

const ercxRootSet = new Set<vscode.TestItem>();
const ercxTestsAPI = new Map<string, ERCxTestAPI>();
const ercxAPIUri: string =
  vscode.workspace.getConfiguration('ercx').get('ercxAPIUri') ??
  'https://ercx.runtimeverification.com/api/v1/';
const outputChannel = vscode.window.createOutputChannel('ERCx');
const ercxTestData = new WeakMap<vscode.TestItem, ERCxTestData>();

function log(msg?: any) {
  console.log(msg);
  outputChannel.appendLine(msg);
}

export async function activate(context: vscode.ExtensionContext) {
  const codelensProvider = new CodelensProvider();
  vscode.languages.registerCodeLensProvider('solidity', codelensProvider);

  const ctrl = vscode.tests.createTestController('ERCxtests', 'ERCx Tests');
  context.subscriptions.push(ctrl);

  vscode.commands.registerCommand(
    'ercx.codelensAction',
    (document: vscode.TextDocument, ctrctName: string, range: vscode.Range) => {
      //vscode.window.showInformationMessage(`CodeLens action clicked with args=${fileName} ${ctrctName} ${range}`);
      log(
        `CodeLens action clicked with args=${document.uri} ${ctrctName} ${range}`,
      );
      addERCxTestsAPI(ctrl, document, range, ctrctName);
    },
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ercx.generateTests20',
      (contractName: string) => {
        log('Command: ' + contractName);
        log(vscode.window.activeTextEditor?.document.uri);
        log(vscode.window.activeTextEditor?.selection.active);
        if (vscode.window.activeTextEditor) {
          const regexStr = /contract\s+(\S+)/g;
          const regex = new RegExp(regexStr);
          const document = vscode.window.activeTextEditor.document;
          const cursorOffset: number = document.offsetAt(
            vscode.window.activeTextEditor.selection.active,
          );
          const text: string = document.getText();
          let matches;
          let ctrctName = '';
          let range: vscode.Range = vscode.window.activeTextEditor.selection;
          // find the last contract before the cursor
          while (
            (matches = regex.exec(text)) !== null &&
            matches.index < cursorOffset
          ) {
            ctrctName = matches[1];
            const line = document?.lineAt(
              document.positionAt(matches.index).line,
            );
            const indexOf = line.text.indexOf(matches[1]);
            const position = new vscode.Position(line.lineNumber, indexOf);
            range =
              document.getWordRangeAtPosition(position, new RegExp(regex)) ??
              range;
          }
          addERCxTestsAPI(ctrl, document, range, ctrctName);
        }
      },
    ),
  );

  const runHandler = (
    request: vscode.TestRunRequest,
    cancellation: vscode.CancellationToken,
  ) => {
    const run = ctrl.createTestRun(request, `Running Tests`, false);
    const queue: vscode.TestItem[] = [];

    // Loop through all included tests, or all known tests, and add them to our queue
    if (request.include) {
      request.include.forEach((test) => {
        queue.push(test);
        markQueueing(run, test);
      });
    } else {
      ctrl.items.forEach((test) => {
        queue.push(test);
        markQueueing(run, test);
      });
    }

    const filePath: string = queue.at(0)?.uri?.fsPath.toString() + '';
    const fileContent: string = readFileSync(filePath, 'utf8');

    const apiRes = fetch(ercxAPIUri + 'reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        standard: 'ERC20',
        sourceCodeFile: {
          name: path.parse(filePath).base,
          content: fileContent,
          path: queue.at(0)?.uri?.fsPath.toString(),
        },
        tokenClass: ercxTestData.get(queue[0])?.contractName,
      }),
    })
      .then(
        (response) => {
          if (response.ok) {
            const x = response.json();
            x.then((body) => {
              if (body['status'] == 'DONE') {
                const report = JSON.parse(body['json']);
                testingDone(report, run, request, queue, cancellation);
                run.end();
              } else if (body['status'] == 'RUNNING') {
                log('running...');
                markStarted(run, queue);
                new Promise((resolve) => setTimeout(resolve, 1000)).then((rr) =>
                  testingRunning(
                    body['id'] as string,
                    run,
                    request,
                    queue,
                    cancellation,
                  ),
                );
              } else {
                log('Status: ' + body['status']);
              }
              // Make sure to end the run after all tests have been executed:
            });
          } else {
            log('response !OK');
            // Make sure to end the run after all tests have been executed:
            run.end();
          }
        },
        (err) => log('Report error: ' + err),
      )
      .catch((error) => log('API error: ' + error));
  };

  ctrl.createRunProfile(
    'Run Tests',
    vscode.TestRunProfileKind.Run,
    runHandler,
    true,
    undefined,
  );
}
function markQueueing(run: vscode.TestRun, test: vscode.TestItem) {
  run.enqueued(test);
  test.children.forEach((t) => markQueueing(run, t));
}
function markStarted(run: vscode.TestRun, test: vscode.TestItem[]) {
  test.forEach((t) => {
    run.started(t);
    t.children.forEach((t2) =>
      markStarted(run, new Array<vscode.TestItem>(t2)),
    );
  });
}

function testingRunning(
  id: string,
  run: vscode.TestRun,
  request: vscode.TestRunRequest,
  queue: vscode.TestItem[],
  cancellation: vscode.CancellationToken,
) {
  if (!cancellation.isCancellationRequested) {
    const apiRes = fetch(ercxAPIUri + 'reports/' + id + '?fields=text%2Cjson', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(
        (response) => {
          if (response.ok) {
            const x = response.json();
            x.then((body) => {
              if (body['status'] == 'DONE') {
                const report = JSON.parse(body['json']);
                testingDone(report, run, request, queue, cancellation);
                run.end();
              } else if (body['status'] == 'RUNNING') {
                log('running...');
                new Promise((resolve) => setTimeout(resolve, 1000)).then((rr) =>
                  testingRunning(
                    body['id'] as string,
                    run,
                    request,
                    queue,
                    cancellation,
                  ),
                );
              } else {
                log('Status: ' + body['status']);
              }
              // Make sure to end the run after all tests have been executed:
            });
          } else {
            log('response !OK');
            // Make sure to end the run after all tests have been executed:
            run.end();
          }
        },
        (err) => log('Report error: ' + err),
      )
      .catch((error) => log('API error: ' + error));
  } else {
    run.end();
    log('User requested to end.');
  }
}

function testingDone(
  res: any,
  run: vscode.TestRun,
  request: vscode.TestRunRequest,
  queue: vscode.TestItem[],
  cancellation: vscode.CancellationToken,
) {
  // For every test that was queued, try to run it. Call run.passed() or run.failed().
  while (queue.length > 0 && !cancellation.isCancellationRequested) {
    const test = queue.pop()!;

    // Skip tests the user asked to exclude
    if (request.exclude?.includes(test)) {
      continue;
    }
    //log("test:" + test.label);
    if (test.children.size != 0) {
      test.children.forEach((test) => queue.push(test));
    } else {
      for (const [k, v] of Object.entries(res)) {
        //log(k + " " + v);
        for (const [k1, v1] of Object.entries((v as any)['test_results'])) {
          const tresult = v1 as any;
          //log(k1 + " " + tresult);
          if (k1.startsWith(test.id + '(')) {
            run.appendOutput(test.id + ' ');
            if (tresult['status'] == 'Success') {
              run.passed(test, 1);
            } else {
              const feedback: string =
                ercxTestsAPI.get(test.id)?.feedback ?? 'error';
              const expected: string =
                ercxTestsAPI.get(test.id)?.property ?? 'error';
              run.failed(
                test,
                vscode.TestMessage.diff(
                  new vscode.MarkdownString(feedback),
                  expected,
                  feedback,
                ),
                1,
              );
              //run.failed(test, new vscode.TestMessage(new vscode.MarkdownString(feedback)), 1); // this can take Markdown as input
            }
          }
        }
      }
    }
  }
  log('Testing done');
}

function addERCxTestsAPI(
  controller: vscode.TestController,
  document: vscode.TextDocument,
  range: vscode.Range,
  ctrctName: string,
) {
  // automatically focus on the Testing view after tests are generated
  vscode.commands.executeCommand('workbench.view.testing.focus');

  const existing = controller.items.get('ERCx');
  if (existing) {
    return { file: existing };
  }

  // fetch list of tests from the API
  const apiRes = fetch(ercxAPIUri + 'property-tests?standard=ERC20', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(
      (response) => {
        log(response.body);
        if (response.ok) {
          const x = response.json();
          x.then((body) => {
            const apitsts = body as ERCxTestAPI[];
            for (const tst of apitsts) ercxTestsAPI.set(tst.name, tst);
            log(ercxTestsAPI);
            addERCxTestsAPI2(controller, document, range, ctrctName);
          });
        }
      },
      (err) => log('Property tests fetch error: ' + err),
    )
    .catch((error) => log('API error: ' + error));
}

// construct TestItems based on the test list from the API
function addERCxTestsAPI2(
  controller: vscode.TestController,
  document: vscode.TextDocument,
  range: vscode.Range,
  ctrctName: string,
) {
  const docTokens = getSolidityTokenLoc(document);
  log('ERCx add tests for: ' + ctrctName);

  const ercxRoot = controller.createTestItem(
    'ERCx',
    document.uri.path.split('/').pop()! + ' - ERC20 Tests',
    document.uri,
  );
  ercxRootSet.add(ercxRoot);
  ercxTestData.set(ercxRoot, new ERCxTestData(ercxRoot, ctrctName));
  const levels = new Map<string, vscode.TestItem>();

  for (const et of ercxTestsAPI.values()) {
    if (
      et.name == 'testAbiFoundInEtherscan' ||
      et.name == 'testAddressIsImplementationContract'
    )
      // these tests only make sense for deployed contracts not source code
      continue;
    const ti = controller.createTestItem(
      et.name,
      et.name.slice(4),
      document.uri,
    );
    ercxTestData.set(ti, new ERCxTestData(ti, ctrctName));

    // find a token that fits one of the categories
    ti.range = docTokens.get(et.concernedFunctions[0]) ?? range;

    if (!levels.has(et.level)) {
      // first time finding a level?
      const Level: string = et.level[0].toUpperCase() + et.level.slice(1); // capitalize first letter
      const lti = controller.createTestItem(et.level, Level, document.uri);
      ercxTestData.set(lti, new ERCxTestData(lti, ctrctName));
      lti.range = range;
      levels.set(et.level, lti);
      ercxRoot.children.add(lti);
    }
    const pti = levels.get(et.level);
    pti?.children.add(ti);
  }

  controller.items.add(ercxRoot);
  //ercxRoot.canResolveChildren = true;
}
class ERCxTestAPI {
  constructor(
    public readonly name: string,
    public readonly version: number,
    public readonly level: string,
    public readonly property: string,
    public readonly feedback: string,
    public readonly expected: string,
    public readonly concernedFunctions: string[],
    public readonly categories: string[],
  ) {}
}

class ERCxTestData {
  constructor(
    public readonly test: vscode.TestItem,
    public readonly contractName: string,
  ) {}
}

function getSolidityTokenLoc(
  document: vscode.TextDocument,
): Map<string, vscode.Range> {
  const fileContent: string = readFileSync(document.fileName, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'test.sol': {
        content: fileContent,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '': ['ast'],
        },
      },
    },
  };

  const fileAst = JSON.parse(solc.compile(JSON.stringify(input)));
  //const fileAst = JSON.parse(execSync(`solc --ast-compact-json ${document.uri.path}`).toString().split(new RegExp(`======= \\S+ =======`))[1]);
  log(fileAst);
  const tokenLoc = new Map<string, vscode.Range>();
  getSolidityTokenLoc2(document, fileAst, tokenLoc);
  return tokenLoc;
}

function getSolidityTokenLoc2(
  document: vscode.TextDocument,
  jsonObj: any,
  tokenLoc: Map<string, vscode.Range>,
) {
  if (
    (jsonObj['nodeType'] ?? '').endsWith('Definition') ||
    (jsonObj['nodeType'] ?? '').endsWith('Declaration')
  ) {
    const name = jsonObj['name'];
    const src = jsonObj['src'];
    const srcParts = src.split(':');
    const offset = parseInt(srcParts[0]);
    const len = parseInt(srcParts[1]);
    const range = new vscode.Range(
      document.positionAt(offset),
      document.positionAt(offset + len),
    );
    tokenLoc.set(name, range);
  }
  for (const [k, v] of Object.entries(jsonObj)) {
    //log(typeof v);
    if (Array.isArray(v)) {
      v.forEach((child: any) =>
        getSolidityTokenLoc2(document, child, tokenLoc),
      );
    } else if (typeof v === 'object') {
      getSolidityTokenLoc2(document, v, tokenLoc);
    }
  }
}
