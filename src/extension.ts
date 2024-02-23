import fetch from 'cross-fetch';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodelensProvider } from './CodelensProvider';
import {
  ERCxTestData,
  Evaluation,
  PropertyTest,
  Report,
  TaskStatus,
  TestLevel,
  TestResult,
  TestSuiteStandard,
} from './types';

const ercxPropertyTests = new Map<string, PropertyTest>();
const outputChannel = vscode.window.createOutputChannel('ERCx');
const ercxTestData = new WeakMap<vscode.TestItem, ERCxTestData>();
const fetchTimeout = 5000;
const testSuiteStandards = [
  TestSuiteStandard.ERC20,
  TestSuiteStandard.ERC721,
  TestSuiteStandard.ERC1155,
  TestSuiteStandard.ERC4626,
];

function log(msg?: string) {
  console.log(msg);
  outputChannel.appendLine(msg ?? '');
}

function waitForTimeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getERCxAPIUri(): string {
  return vscode.workspace
    .getConfiguration('ercx')
    .get('ercxAPIUri', 'https://ercx.runtimeverification.com/api/v1/');
}

type ERCxAPIHeader = {
  'Content-Type': string;
  'User-Agent': string;
  // if this is assigned as undefined it will not be included in JSON.stringify
  'X-API-KEY'?: string;
};

function getERCxAPIHeader(): ERCxAPIHeader {
  let key: string = vscode.workspace.getConfiguration('ercx').get('apiKey', '');

  if (!(key ?? '').trim()) {
    vscode.window.showErrorMessage(
      '"ercx.apiKey" is not set. Please retrieve your API key from https://ercx.runtimeverification.com/open-api and set it in the VS Code settings "ercx.apiKey".',
    );
    throw new Error('ERCx API Key is not set');
  }

  return {
    'Content-Type': 'application/json',
    'User-Agent': 'VSCode',
    'X-API-KEY': key,
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

  const controller = vscode.tests.createTestController(
    'ercx-tests',
    'ERCx Tests',
  );
  context.subscriptions.push(controller);

  vscode.commands.registerCommand(
    'ercx.codelensAction',
    (
      document: vscode.TextDocument,
      contractName: string,
      range: vscode.Range,
    ) => {
      //vscode.window.showInformationMessage(`CodeLens action clicked with args=${fileName} ${contractName} ${range}`);
      log(
        `CodeLens action clicked with args=${document.uri} ${contractName} ${range}`,
      );
      pickStandard(controller, document, range, contractName);
    },
  );

  function triggerCommand(standard: string) {
    log('triggerCommand: ' + standard);
    if (vscode.window.activeTextEditor) {
      const regexStr = /contract\s+(\S+)/g;
      const regex = new RegExp(regexStr);
      const document = vscode.window.activeTextEditor.document;
      const cursorOffset: number = document.offsetAt(
        vscode.window.activeTextEditor.selection.active,
      );
      const text: string = document.getText();
      let matches;
      let contractName = '';
      let range: vscode.Range = vscode.window.activeTextEditor.selection;
      // find the last contract before the cursor
      while (
        (matches = regex.exec(text)) !== null &&
        matches.index < cursorOffset
      ) {
        contractName = matches[1];
        const line = document?.lineAt(document.positionAt(matches.index).line);
        const indexOf = line.text.indexOf(matches[1]);
        const position = new vscode.Position(line.lineNumber, indexOf);
        range =
          document.getWordRangeAtPosition(position, new RegExp(regex)) ?? range;
      }
      addERCxPropertyTests(controller, document, range, contractName, standard);
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
      'ercx.generateTests721',
      (contractName: string) => triggerCommand('ERC721'),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ercx.generateTests1155',
      (contractName: string) => triggerCommand('ERC1155'),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ercx.generateTests4626',
      (contractName: string) => triggerCommand('ERC4626'),
    ),
  );

  const runHandler = async (
    request: vscode.TestRunRequest,
    cancellation: vscode.CancellationToken,
  ) => {
    const run = controller.createTestRun(request, `Running Tests`, false);
    const queue: vscode.TestItem[] = [];

    // Loop through all included tests, or all known tests, and add them to our queue
    if (request.include) {
      // add only the first test to the queue since the API
      // only supports one test at a time
      const test = request.include[0];
      queue.push(test);
      markQueueing(run, test);
    } else {
      controller.items.forEach((test) => {
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

    let bodyStr: string = '';
    const standard: string = ercxTestData.get(queue[0])?.standard ?? 'ERC20';
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
        });

        break;
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
        });
        break;
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
        });
        break;
    }

    try {
      const response = await fetch(getERCxAPIUri() + 'reports', {
        method: 'POST',
        headers: getERCxAPIHeader(),
        body: bodyStr,
      });
      await processResponse(response, run, request, queue, cancellation);
    } catch (error) {
      log('API error: ' + error);
    }
  };

  controller.createRunProfile(
    'Run Tests',
    vscode.TestRunProfileKind.Run,
    runHandler,
    true,
    undefined,
  );
}

async function processResponse(
  response: Response,
  run: vscode.TestRun,
  request: vscode.TestRunRequest,
  queue: vscode.TestItem[],
  cancellation: vscode.CancellationToken,
): Promise<void> {
  if (response.ok) {
    try {
      const body = (await response.json()) as Report;
      switch (body.status) {
        case TaskStatus.DONE:
        case TaskStatus.EVALUATED_ONLY_TEST:
        case TaskStatus.EVALUATED_TESTED_LEVELS: {
          const evaluations = body.evaluations;
          if (!evaluations) {
            await testingRunning(body.id, run, request, queue, cancellation);
          } else {
            run.appendOutput('API returned with status: ' + body.status);
            testingDone(evaluations, run, request, queue, cancellation);
            run.end();
          }

          break;
        }
        case TaskStatus.RUNNING: {
          log('running...');
          markStarted(run, queue);

          await waitForTimeout(fetchTimeout); // Fetch report update every 5 seconds
          await testingRunning(body.id, run, request, queue, cancellation);

          break;
        }
        case TaskStatus.PENDING: {
          log('pending...');

          await waitForTimeout(fetchTimeout); // Fetch report update every 5 seconds
          await testingRunning(body.id, run, request, queue, cancellation);

          break;
        }
        case TaskStatus.ERROR: {
          log('Status: ' + body.status);
          const msg: string =
            'API call returned with status: ' + body.status + '.';
          run.appendOutput(msg + '\n\n');
          run.appendOutput('Server message: ' + body.error + '\n\n');
          run.appendOutput(
            'The code needs to be self contained in a single file and have no errors.',
          );
          run.end();
          vscode.window.showErrorMessage(
            msg + ' See TEST RESULTS for details.',
          );

          break;
        }
      }
      // Make sure to end the run after all tests have been executed:
    } catch (error) {
      log('Error: ' + error);
      run.appendOutput('Error: ' + error);
      run.end();
    }
  } else {
    log('response !OK');
    run.appendOutput(
      'Server returned status !OK: ' +
        response.status +
        ' ' +
        response.statusText,
    );
    // Make sure to end the run after all tests have been executed:
    run.end();
  }
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

async function testingRunning(
  id: string,
  run: vscode.TestRun,
  request: vscode.TestRunRequest,
  queue: vscode.TestItem[],
  cancellation: vscode.CancellationToken,
) {
  if (!cancellation.isCancellationRequested) {
    try {
      const response = await fetch(
        getERCxAPIUri() + 'reports/' + id + '?fields=evaluations',
        {
          method: 'GET',
          headers: getERCxAPIHeader(),
        },
      );
      await processResponse(response, run, request, queue, cancellation);
    } catch (error) {
      run.end();
      log('Failed to fetch report: ' + error);
    }
  } else {
    run.end();
    log('User requested to end.');
  }
}

function testingDone(
  evaluations: Evaluation[],
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
    if (
      test.children.size != 0
      // It's Root or Level
    ) {
      test.children.forEach((test) => queue.push(test));
    } else {
      const evaluation = evaluations.find(
        (evaluation) => evaluation.test.name === test.id,
      );
      if (evaluation) {
        if (evaluation.result === TestResult.Passed) {
          run.passed(test, 1);
        } else if (evaluation.result === TestResult.NotTested) {
          run.skipped(test);
        } else {
          const feedback = evaluation.test.feedback;
          const expected = evaluation.test.expected;
          if (test.parent?.id === 'features') {
            // mark as errored only the Fingerprint tests
            const msg: string =
              'Features tests are optional and may not apply on all cases.\n\n' +
              feedback;
            run.errored(
              test,
              new vscode.TestMessage(new vscode.MarkdownString(msg)),
              1,
            );
          } else {
            run.failed(
              test,
              vscode.TestMessage.diff(
                new vscode.MarkdownString(feedback),
                expected,
                feedback,
              ),
              1,
            );
          }
        }
      } else {
        run.skipped(test);
      }
    }
  }
  log('Testing done');
}
async function pickStandard(
  controller: vscode.TestController,
  document: vscode.TextDocument,
  range: vscode.Range,
  contractName: string,
) {
  const stdResponse = await vscode.window.showQuickPick(
    testSuiteStandards.map((standard) => {
      return {
        label: standard,
        description: `${standard} tests`,
      };
    }),
    { placeHolder: 'Select which standard to generate the tests for.' },
  );
  if (stdResponse) {
    log('Chose ' + stdResponse.label);
    addERCxPropertyTests(
      controller,
      document,
      range,
      contractName,
      stdResponse.label,
    );
  }
}

function getDocumentTestItemId(document: vscode.TextDocument) {
  return `ERCx-${document.uri.fsPath}`;
}

async function addERCxPropertyTests(
  controller: vscode.TestController,
  document: vscode.TextDocument,
  range: vscode.Range,
  contractName: string,
  standard: string,
) {
  // automatically focus on the Testing view after tests are generated
  vscode.commands.executeCommand('workbench.view.testing.focus');

  const existing = controller.items.get(getDocumentTestItemId(document));
  if (existing) {
    return { file: existing };
  }
  try {
    // fetch list of tests from the API
    const response = await fetch(
      getERCxAPIUri() + 'property-tests?standard=' + standard,
      {
        method: 'GET',
        headers: getERCxAPIHeader(),
      },
    );
    log('Retrieve Property Tests: ' + response.status);
    if (response.ok) {
      const body = await response.json();
      const propertyTests = body as PropertyTest[];
      for (const test of propertyTests) {
        ercxPropertyTests.set(test.name, test);
      }
      await addERCxPropertyTests2(
        controller,
        document,
        range,
        contractName,
        standard,
      );
    }
  } catch (error) {
    log('API error: ' + error);
  }
}

// construct TestItems based on the test list from the API
async function addERCxPropertyTests2(
  controller: vscode.TestController,
  document: vscode.TextDocument,
  range: vscode.Range,
  contractName: string,
  standard: string,
) {
  const docTokens = await getSolidityTokenLoc(document);
  log('ERCx add ' + standard + ' tests for: ' + contractName);

  const ercxRoot = controller.createTestItem(
    getDocumentTestItemId(document),
    document.uri.path.split('/').pop()! + ' - ' + standard + ' Tests',
    document.uri,
  );
  ercxTestData.set(ercxRoot, {
    testItem: ercxRoot,
    contractName: contractName,
    testLevel: TestLevel.Root,
    standard,
  });
  const levels = new Map<string, vscode.TestItem>();

  for (const test of ercxPropertyTests.values()) {
    if (
      test.name == 'testAbiFoundInEtherscan' ||
      test.name == 'testAddressIsImplementationContract'
    )
      // these tests only make sense for deployed contracts not source code
      continue;
    const testItem = controller.createTestItem(
      test.name,
      test.name,
      document.uri,
    );
    ercxTestData.set(testItem, {
      testItem: testItem,
      contractName: contractName,
      testLevel: TestLevel.Individual,
      standard,
    });

    // find a token that fits one of the categories
    testItem.range = docTokens.get(test.concernedFunctions[0]) ?? range;

    if (!levels.has(test.level)) {
      // first time finding a level?
      const level: string = test.level[0].toUpperCase() + test.level.slice(1); // capitalize first letter
      const levelTestItem = controller.createTestItem(
        test.level,
        level,
        document.uri,
      );
      ercxTestData.set(levelTestItem, {
        testItem: levelTestItem,
        contractName: contractName,
        testLevel: TestLevel.Level,
        standard,
      });
      levelTestItem.range = range;
      levels.set(test.level, levelTestItem);
      ercxRoot.children.add(levelTestItem);
    }
    const levelTestItem = levels.get(test.level);
    levelTestItem?.children.add(testItem);
  }

  controller.items.add(ercxRoot);
  //ercxRoot.canResolveChildren = true;
}

async function getSolidityTokenLoc(
  document: vscode.TextDocument,
): Promise<Map<string, vscode.Range>> {
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
  const tokenLoc = new Map<string, vscode.Range>();
  getSolidityTokenLoc2(document, fileAst, tokenLoc);
  return tokenLoc;
}

function getSolidityTokenLoc2(
  document: vscode.TextDocument,
  jsonObj: any,
  tokenLoc: Map<string, vscode.Range>,
) {
  if (jsonObj != null) {
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
    for (const [_k, v] of Object.entries(jsonObj)) {
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
}
