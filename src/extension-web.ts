import * as vscode from 'vscode';
import { initExtensionCommon, setCompileSolidity } from './extension';
import * as solc from './solc-browser/solc';

export async function activate(context: vscode.ExtensionContext) {
  const compileSolidity = async (input: string) => {
    const result = await solc.compile(input);
    return result;
  };
  setCompileSolidity(compileSolidity);
  return await initExtensionCommon(context);
}
