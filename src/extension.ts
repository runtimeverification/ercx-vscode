import fetch from 'cross-fetch';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodelensProvider } from './CodelensProvider';

const ercxRootSet = new Set<vscode.TestItem>();
const ercxTestsAPI = new Map<string, ERCxTestAPI>();
const outputChannel = vscode.window.createOutputChannel('ERCx');
const ercxTestData = new WeakMap<vscode.TestItem, ERCxTestData>();
const fetchTimeout = 5000;

function log(msg?: any) {
  console.log(msg);
  outputChannel.appendLine(msg);
}

function getERCxAPIUri(): string {
  return (
    vscode.workspace.getConfiguration('ercx').get('ercxAPIUri', 'https://ercx.runtimeverification.com/api/v1/')
  );
}

type ERCxAPIHeader = {
  'Content-Type': string,
  'User-Agent': string,
  // if this is assigned as undefined it will not be included in JSON.stringify
  'X-API-KEY'?: string
}

function getERCxAPIHeader():ERCxAPIHeader {
  let key:string = vscode.workspace.getConfiguration('ercx').get('ercxAPIKey', '');
  if (key == '')
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'VSCode',
    };
  else
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'VSCode',
      'X-API-KEY': key
    };
}

export type CompileSolidity = (input: string) => Promise<string>;
let compileSolidity: CompileSolidity | undefined;
export function setCompileSolidity(compileSolidity_: CompileSolidity) {
  compileSolidity = compileSolidity_;
}

export async function initExtensionCommon(context: vscode.ExtensionContext) {
  const codelensProvider = new CodelensProvider();
  vscode.languages.registerCodeLensProvider('solidity', codelensProvider);

  const ctrl = vscode.tests.createTestController('ERCxtests', 'ERCx Tests');
  context.subscriptions.push(ctrl);

  vscode.commands.registerCommand(
    'ercx.codelensAction',
    (document: vscode.TextDocument, ctrctName: string, range: vscode.Range) => {
      //vscode.window.showInformationMessage(`CodeLens action clicked with args=${fileName} ${ctrctName} ${range}`);
      log(`CodeLens action clicked with args=${document.uri} ${ctrctName} ${range}`);
      pickStandard(ctrl, document, range, ctrctName);
    },
  );

  function triggerCommand(standard:string) {
    log('triggerCommand: ' + standard);
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
      while ((matches = regex.exec(text)) !== null && matches.index < cursorOffset) {
        ctrctName = matches[1];
        const line = document?.lineAt(document.positionAt(matches.index).line);
        const indexOf = line.text.indexOf(matches[1]);
        const position = new vscode.Position(line.lineNumber, indexOf);
        range = document.getWordRangeAtPosition(position, new RegExp(regex)) ?? range;
      }
      addERCxTestsAPI(ctrl, document, range, ctrctName, standard)
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ercx.generateTests20',
      (contractName: string) => triggerCommand('ERC20'),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ercx.generateTests4626',
      (contractName: string) => triggerCommand('ERC4626'),
    ),
  );

  const runHandler = async (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken) => {
    const run = ctrl.createTestRun(request, `Running Tests`, false);
    const queue: vscode.TestItem[] = [];

    // Loop through all included tests, or all known tests, and add them to our queue
    if (request.include) {
      // add only the first test to the queue since the API
      // only supports one test at a time
      const test = request.include[0];
      queue.push(test);
      markQueueing(run, test);
    } else {
      ctrl.items.forEach((test) => {
        queue.push(test);
        markQueueing(run, test);
      });
    }

    const fileUri = queue.at(0)?.uri;
    if (!fileUri) {
      throw new Error(`queue.at(0)?.uri not found`);
    }
    const fileContent: string = new TextDecoder('utf-8').decode(
      await vscode.workspace.fs.readFile(fileUri),
    );

    let bodyStr:string = "";
    const standard: string = ercxTestData.get(queue[0])?.standard ?? "ERC20";
    switch (ercxTestData.get(queue[0])?.testLevel) {
      case TestLevel.Root:
        bodyStr = JSON.stringify({
          standard: standard,
          sourceCodeFile: {
            name: path.basename(fileUri.fsPath),
            content: fileContent,
            path: fileUri.fsPath.toString(),
          },
          tokenClass: ercxTestData.get(queue[0])?.contractName,
        }); break;
        case TestLevel.Level:
          bodyStr = JSON.stringify({
            standard: standard,
            sourceCodeFile: {
              name: path.basename(fileUri.fsPath),
              content: fileContent,
              path: fileUri.fsPath.toString(),
            },
            testedLevels: queue[0].label,
            tokenClass: ercxTestData.get(queue[0])?.contractName,
          }); break;
        case TestLevel.Individual:
          bodyStr = JSON.stringify({
            standard: standard,
            sourceCodeFile: {
              name: path.basename(fileUri.fsPath),
              content: fileContent,
              path: fileUri.fsPath.toString(),
            },
            onlyTest: queue[0].id,
            tokenClass: ercxTestData.get(queue[0])?.contractName,
          }); break;
        }

    
    fetch(getERCxAPIUri() + 'reports', {
      method: 'POST',
      headers: getERCxAPIHeader(),
      body: bodyStr,
    }).then(
        (response) => {
          if (response.ok) {
            const x = response.json();
            x.then((body) => {
              if (body['status'] == 'DONE'
               || body['status'] == 'EVALUATED_ONLY_TEST'
               || body['status'] == 'EVALUATED_TESTED_LEVELS') {
                const report = JSON.parse(body['json']);
                testingDone(report, run, request, queue, cancellation);
                run.end();
              } else if (body['status'] == 'RUNNING') {
                log('running...');
                markStarted(run, queue);
                new Promise((resolve) => setTimeout(resolve, fetchTimeout)).then((rr) =>
                    testingRunning(body['id'] as string, run, request, queue, cancellation));
              } else {
                log('Status: ' + body['status']);
                run.end();
                vscode.window.showErrorMessage("API call returned with status: " + body['status']
                  + ". The code needs to be self contained in a single file and have no errors.");
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
      ).catch((error) => log('API error: ' + error));
  };

  ctrl.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, runHandler, true, undefined);
}

function markQueueing(run: vscode.TestRun, test: vscode.TestItem) {
  run.enqueued(test);
  test.children.forEach((t) => markQueueing(run, t));
}

function markStarted(run: vscode.TestRun, test: vscode.TestItem[]) {
  test.forEach((t) => {
    run.started(t);
    t.children.forEach((t2) => markStarted(run, new Array<vscode.TestItem>(t2)));
  });
}

function testingRunning(id: string, run: vscode.TestRun, request: vscode.TestRunRequest, queue: vscode.TestItem[], cancellation: vscode.CancellationToken) {
  if (!cancellation.isCancellationRequested) {
    fetch(getERCxAPIUri() + 'reports/' + id + '?fields=text,json', {
      method: 'GET',
      headers: getERCxAPIHeader(),
    }).then(
        (response) => {
          if (response.ok) {
            const x = response.json();
            x.then((body) => {
              if (body['status'] == 'DONE'
               || body['status'] == 'EVALUATED_ONLY_TEST'
               || body['status'] == 'EVALUATED_TESTED_LEVELS') {
                const report = JSON.parse(body['json']);
                testingDone(report, run, request, queue, cancellation);
                run.end();
              } else if (body['status'] == 'RUNNING') {
                log('running...');
                new Promise((resolve) => setTimeout(resolve, fetchTimeout))
                  .then((rr) => testingRunning(body['id'] as string, run, request, queue, cancellation));
              } else {
                log('Status: ' + body['status']);
                run.end();
                vscode.window.showErrorMessage("API call returned with status: " + body['status']
                  + ". The code needs to be self contained in a single file and have no errors.");
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

function testingDone(res: any, run: vscode.TestRun, request: vscode.TestRunRequest, queue: vscode.TestItem[], cancellation: vscode.CancellationToken) {
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
      for (const [_k, v] of Object.entries(res)) {
        //log(k + " " + v);
        for (const [k1, v1] of Object.entries((v as any)['test_results'])) {
          const tresult = v1 as any;
          //log(k1 + " " + tresult);
          if (k1.startsWith(test.id + '(')) {
            run.appendOutput(test.id + ' ');
            if (tresult['status'] == 'Success') {
              run.passed(test, 1);
            } else {
              const feedback: string = ercxTestsAPI.get(test.id)?.feedback ?? 'error';
              const expected: string = ercxTestsAPI.get(test.id)?.property ?? 'error';
              run.failed( test, vscode.TestMessage.diff( new vscode.MarkdownString(feedback), expected, feedback, ), 1);
              //run.failed(test, new vscode.TestMessage(new vscode.MarkdownString(feedback)), 1); // this can take Markdown as input
            }
          }
        }
      }
    }
  }
  log('Testing done');
}
function pickStandard( controller: vscode.TestController, document: vscode.TextDocument, range: vscode.Range, ctrctName: string) {
  vscode.window.showQuickPick([
    { label: 'ERC20', description: 'ERC20 tests'},
    { label: 'ERC4626', description: 'ERC4626 tests'},
  ],
  { placeHolder: 'Select which standard to generate the tests for.' }
  ).then((stdResponse) => {
    if (stdResponse) {
      log("ChooseERC" + stdResponse.label);
      addERCxTestsAPI(controller, document, range, ctrctName, stdResponse.label)
    }
  });
}

function addERCxTestsAPI(
  controller: vscode.TestController,
  document: vscode.TextDocument,
  range: vscode.Range,
  ctrctName: string,
  standard: string) {
  // automatically focus on the Testing view after tests are generated
  vscode.commands.executeCommand('workbench.view.testing.focus');

  const existing = controller.items.get('ERCx');
  if (existing) {
    return { file: existing };
  }

  // fetch list of tests from the API
  fetch(getERCxAPIUri() + 'property-tests?standard=' + standard, {
    method: 'GET',
    headers: getERCxAPIHeader(),
  })
    .then(
      (response) => {
        log(response.body);
        if (response.ok) {
          const x = response.json();
          x.then(async (body) => {
            const apitsts = body as ERCxTestAPI[];
            for (const tst of apitsts) ercxTestsAPI.set(tst.name, tst);
            log(ercxTestsAPI);
            await addERCxTestsAPI2(controller, document, range, ctrctName, standard);
          });
        }
      },
      (err) => log('Property tests fetch error: ' + err),
    )
    .catch((error) => log('API error: ' + error));
}

// construct TestItems based on the test list from the API
async function addERCxTestsAPI2(
  controller: vscode.TestController,
  document: vscode.TextDocument,
  range: vscode.Range,
  ctrctName: string,
  standard: string) {
  const docTokens = await getSolidityTokenLoc(document);
  log('ERCx add ' + standard + ' tests for: ' + ctrctName);

  const ercxRoot = controller.createTestItem('ERCx', document.uri.path.split('/').pop()! + ' - ' + standard + ' Tests', document.uri);
  ercxRootSet.add(ercxRoot);
  ercxTestData.set(ercxRoot, new ERCxTestData(ercxRoot, ctrctName, TestLevel.Root, standard));
  const levels = new Map<string, vscode.TestItem>();

  for (const et of ercxTestsAPI.values()) {
    if (et.name == 'testAbiFoundInEtherscan' ||et.name == 'testAddressIsImplementationContract')
      // these tests only make sense for deployed contracts not source code
      continue;
    const ti = controller.createTestItem(et.name, et.name.slice(4), document.uri);
    ercxTestData.set(ti, new ERCxTestData(ti, ctrctName, TestLevel.Individual, standard));

    // find a token that fits one of the categories
    ti.range = docTokens.get(et.concernedFunctions[0]) ?? range;

    if (!levels.has(et.level)) {
      // first time finding a level?
      const Level: string = et.level[0].toUpperCase() + et.level.slice(1); // capitalize first letter
      const lti = controller.createTestItem(et.level, Level, document.uri);
      ercxTestData.set(lti, new ERCxTestData(lti, ctrctName, TestLevel.Level, standard));
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
    public readonly testLevel: TestLevel,
    public readonly standard: string
  ) {}
}
enum TestLevel {
  Individual, Level, Root
}

async function getSolidityTokenLoc(document: vscode.TextDocument): Promise<Map<string, vscode.Range>> {
  const fileContent: string = new TextDecoder('utf-8').decode(
    await vscode.workspace.fs.readFile(document.uri),
  );

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
  if (compileSolidity === undefined) {
    throw new Error('compileSolidity_ is undefined');
  }
  const fileAst = JSON.parse(await compileSolidity(JSON.stringify(input)));
  //const fileAst = JSON.parse(execSync(`solc --ast-compact-json ${document.uri.path}`).toString().split(new RegExp(`======= \\S+ =======`))[1]);
  log(fileAst);
  const tokenLoc = new Map<string, vscode.Range>();
  getSolidityTokenLoc2(document, fileAst, tokenLoc);
  return tokenLoc;
}

function getSolidityTokenLoc2(document: vscode.TextDocument, jsonObj: any, tokenLoc: Map<string, vscode.Range>) {
  if (jsonObj != null) {
      if (((jsonObj['nodeType'] ?? '').endsWith('Definition') || (jsonObj['nodeType'] ?? '').endsWith('Declaration'))) {
      const name = jsonObj['name'];
      const src = jsonObj['src'];
      const srcParts = src.split(':');
      const offset = parseInt(srcParts[0]);
      const len = parseInt(srcParts[1]);
      const range = new vscode.Range(document.positionAt(offset), document.positionAt(offset + len));
      tokenLoc.set(name, range);
    }
    for (const [_k, v] of Object.entries(jsonObj)) {
      //log(typeof v);
      if (Array.isArray(v)) {
        v.forEach((child: any) => getSolidityTokenLoc2(document, child, tokenLoc));
      } else if (typeof v === 'object') {
        getSolidityTokenLoc2(document, v, tokenLoc);
      }
    }
  }
}
