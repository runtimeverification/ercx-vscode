import * as vscode from 'vscode';

/**
 * CodelensProvider
 */
export class CodelensProvider implements vscode.CodeLensProvider {
    private codeLenses: vscode.CodeLens[] = [];
    private regex: RegExp;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
        new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> =
        this._onDidChangeCodeLenses.event;

    constructor() {
        this.regex = /contract\s+(\S+)/g;

        vscode.workspace.onDidChangeConfiguration((_) => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (
            vscode.workspace
                .getConfiguration('ercx')
                .get('enableCodeLens', true)
        ) {
            this.codeLenses = [];
            const regex = new RegExp(this.regex);
            const text = document.getText();
            let matches;
            while ((matches = regex.exec(text)) !== null) {
                const line = document.lineAt(
                    document.positionAt(matches.index).line,
                );
                const indexOf = line.text.indexOf(matches[1]);
                const position = new vscode.Position(line.lineNumber, indexOf);
                const range = document.getWordRangeAtPosition(
                    position,
                    new RegExp(this.regex),
                );
                if (range) {
                    this.codeLenses.push(
                        new vscode.CodeLens(range, {
                            title: 'ERCx generate tests',
                            tooltip: 'Generate and run tests for this contract',
                            command: 'ercx.codelensAction',
                            arguments: [document, matches[1], range],
                        }),
                    );
                }
            }
            return this.codeLenses;
        }
        return [];
    }
}
