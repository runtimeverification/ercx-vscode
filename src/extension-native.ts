import * as solc from 'solc';
import * as vscode from 'vscode';
import { initExtensionCommon, setCompileSolidity } from './extension';

export async function activate(context: vscode.ExtensionContext) {
  const compileSolidity = async (input: string) => {
    return solc.compile(input);
  };
  setCompileSolidity(compileSolidity);
  return await initExtensionCommon(context);
}
