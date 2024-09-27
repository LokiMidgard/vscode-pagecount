import { window, workspace, commands, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, TextDocument, FileSystemWatcher, Uri } from 'vscode';
import vscode = require('vscode');
import { minimatch } from 'minimatch'

export function activate(ctx: ExtensionContext) {

    console.log('Congratulations, your extension "Wordcount" is now active!');

    let wordCounter = new WordCounter();
    let controller = new WordCounterController(wordCounter);

    // Add to a list of disposables which are disposed when this extension
    // is deactivated again.
    ctx.subscriptions.push(controller);
    ctx.subscriptions.push(wordCounter);
}

export class WordCounter {

    private _statusBarItem: StatusBarItem | undefined;
    private _workspaceWordCount: Record<string, { wordCount: number, lineCount: number } | undefined> = {}; // Gesamtzahl der Wörter im Workspace


    public calculatePages(container: { wordCount: number, lineCount: number } | undefined): number {
        if (container === undefined) {
            return 0;
        }
        const { wordCount, lineCount } = container;
        const pageCalculationType = vscode.workspace.getConfiguration('pagecount').get<'lines' | 'words'>('pagesizeCalculation') || 'lines';

        if (pageCalculationType == 'words') {
            const pageSize = vscode.workspace.getConfiguration('pagecount').get<number>('pagesizeInWords') || 250;
            const pageCount = Math.ceil(wordCount / pageSize);
            return pageCount;
        } else {
            const pageSize = vscode.workspace.getConfiguration('pagecount').get<number>('pagesizeInLines') || 25;
            const pageCount = Math.ceil(lineCount / pageSize);
            return pageCount;
        }


    }

    public updateWordCountInWorkspace(uri: Uri) {
        workspace.openTextDocument(uri).then(doc => {
            const wordCount = this._getWordCount(doc);
            uri.toString()
            this._workspaceWordCount[uri.toString()] = wordCount;
            this.updateStatusBar();
        });
    }

    public removeWordCountInWorkspace(uri: Uri) {
        // Wenn eine Datei gelöscht wird, sollten wir die Wortzahl dieser Datei entfernen.
        workspace.openTextDocument(uri).then(doc => {
            this._workspaceWordCount[uri.toString()] = undefined;
            this.updateStatusBar();
        });
    }

    public updateWordCountInAllFiles() {
        // Lädt alle Markdown-Dateien im Workspace und zählt ihre Wörter
        this._workspaceWordCount = {};
        workspace.findFiles(vscode.workspace.getConfiguration('pagecount').get<string>('include') || '**/*.md', vscode.workspace.getConfiguration('pagecount').get<string>('excludeFromTotal') || '').then(uris => {
            uris.forEach(uri => {
                this.updateWordCountInWorkspace(uri);
            });
        }).then(() => {
            this.updateStatusBar();
        });
    }

    public updateStatusBar() {
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
        }
        const currentUri =
            window.activeTextEditor && window.activeTextEditor.document && window.activeTextEditor.document.uri && window.activeTextEditor.document.uri.toString()
              //  && (vscode.workspace.getConfiguration('pagecount').get<string>('excludeFromTotal') == undefined || !minimatch(window.activeTextEditor.document.uri.toString(), vscode.workspace.getConfiguration('pagecount').get<string>('excludeFromTotal') ?? ''))
                && (vscode.workspace.getConfiguration('pagecount').get<string>('include') != undefined && minimatch(window.activeTextEditor.document.uri.toString(), vscode.workspace.getConfiguration('pagecount').get<string>('include') ?? ''))
                ? window.activeTextEditor.document.uri.toString()
                : "";

        const filterKeys = (key: string) => {
            if (this._workspaceWordCount[key] === undefined) {
                return false;
            }
            if (vscode.workspace.getConfiguration('pagecount').get<string>('excludeFromTotal') && minimatch(key, vscode.workspace.getConfiguration('pagecount').get<string>('excludeFromTotal') ?? '')) {
                return false;
            }
            return true;
        }

        const wordCountTotal = Object.keys(this._workspaceWordCount).filter(filterKeys).map(key => this._workspaceWordCount[key]!.wordCount).reduce((p, c) => p + c, 0);
        const wordCountCurrent = this._workspaceWordCount[currentUri] === undefined
            ? 0
            : (this._workspaceWordCount[currentUri]).wordCount;

        const lineCountTotal = Object.keys(this._workspaceWordCount).filter(filterKeys).map(key => this._workspaceWordCount[key]!.lineCount).reduce((p, c) => p + c, 0);
        const lineCountCurrent = (this._workspaceWordCount[currentUri]) === undefined
            ? 0
            : (this._workspaceWordCount[currentUri]).lineCount;

        const pageCountTotal = Object.keys(this._workspaceWordCount).filter(filterKeys).map(key => this._workspaceWordCount[key]).map(this.calculatePages).reduce((p, c) => p + c, 0);
        const pageCountCurrent = this.calculatePages(this._workspaceWordCount[currentUri]);

        const wordTextCurrent = wordCountCurrent !== 1 ? `${wordCountCurrent} Words` : '1 Word';
        const lineTextCurrent = lineCountCurrent !== 1 ? `in ${lineCountCurrent} Lines` : 'on 1 Line';
        const pageTextCurrent = pageCountCurrent !== 1 ? `on ${pageCountCurrent} Pages` : 'on 1 Page';
        const wordTextTotal = wordCountTotal !== 1 ? `${wordCountTotal} Words` : '1 Word';
        const lineTextTotal = lineCountTotal !== 1 ? `in ${lineCountTotal} Lines` : 'on 1 Line';
        const pageTextTotal = pageCountTotal !== 1 ? `on ${pageCountTotal} Pages` : 'on 1 Page';

        const currentText = `$(pencil) ${wordTextCurrent} ${lineTextCurrent} ${pageTextCurrent}`;
        const totalText = `$(book) ${wordTextTotal} ${lineTextTotal} ${pageTextTotal}`;


        this._statusBarItem.text = currentUri === ""
            ? totalText
            : `${currentText} ${totalText}`;
        this._statusBarItem.show();
    }

    public _getWordCount(doc: TextDocument): { wordCount: number, lineCount: number } {
        const docContent = doc.getText();
        const numberOfLines = docContent.split(/\r\n|\r|\n/).length;
        const normalizedSpaces = docContent.replace(/\s+/g, ' ').trim();
        const wordCount = normalizedSpaces !== "" ? normalizedSpaces.split(" ").length : 0;
        return { wordCount, lineCount: numberOfLines };
    }

    public dispose() {
        this._statusBarItem?.dispose();
    }
}

class WordCounterController {

    private _wordCounter: WordCounter;
    private _disposable: Disposable;

    constructor(wordCounter: WordCounter) {
        this._wordCounter = wordCounter;
        let subscriptions: Disposable[] = [];


        // Watch for changes in markdown files in the workspace
        let watcher = workspace.createFileSystemWatcher('**/*.md');

        watcher.onDidCreate(uri => wordCounter.updateWordCountInWorkspace(uri));
        watcher.onDidChange(uri => wordCounter.updateWordCountInWorkspace(uri));
        watcher.onDidDelete(uri => wordCounter.removeWordCountInWorkspace(uri));
        subscriptions.push(watcher);


        vscode.workspace.onDidChangeConfiguration(e => wordCounter.updateWordCountInAllFiles(), this, subscriptions);
        window.onDidChangeTextEditorSelection(this._onEvent, this, subscriptions);
        window.onDidChangeActiveTextEditor(this._onEvent, this, subscriptions);

        wordCounter.updateWordCountInAllFiles();

        this._disposable = Disposable.from(...subscriptions);
    }

    private _onEvent() {
        if (window.activeTextEditor && window.activeTextEditor.document && window.activeTextEditor.document.uri && window.activeTextEditor.document.uri) {
            this._wordCounter.updateWordCountInWorkspace(window.activeTextEditor.document.uri);
        }
    }

    public dispose() {
        this._disposable.dispose();
    }
}
