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

type ConuterData = { wordCount: number, lineCount: number, characters: number };

export class WordCounter {

    private _statusBarItem: [StatusBarItem, StatusBarItem] | undefined;
    private _workspaceWordCount: Record<string, ConuterData | undefined> = {}; // Gesamtzahl der Wörter im Workspace
    private currentSelection: ConuterData | undefined; // Gesamtzahl der Wörter im Workspace


    public calculatePages(container: ConuterData | undefined): number {
        if (container === undefined) {
            return 0;
        }
        const { wordCount, lineCount, characters } = container;
        const pageCalculationType = vscode.workspace.getConfiguration('pagecount').get<'lines' | 'words' | 'characters'>('pagesizeCalculation') || 'characters';

        if (pageCalculationType == 'words') {
            const pageSize = vscode.workspace.getConfiguration('pagecount').get<number>('pagesizeInWords') || 250;
            const pageCount = Math.ceil(wordCount / pageSize);
            return pageCount;
        } else if (pageCalculationType == 'lines') {
            const pageSize = vscode.workspace.getConfiguration('pagecount').get<number>('pagesizeInLines') || 25;
            const pageCount = Math.ceil(lineCount / pageSize);
            return pageCount;
        } else {
            const pageSize = vscode.workspace.getConfiguration('pagecount').get<number>('pagesizeInCharacters') || 1500;
            const pageCount = Math.ceil(characters / pageSize);
            return pageCount;
        }


    }

    public updateWordCountInWorkspace(uri: Uri) {
        workspace.openTextDocument(uri).then(doc => {
            const wordCount = this._getWordCount(doc);
            this.currentSelection = wordCount;
            if (uri.scheme === 'file') // ignore filese not on disk, like git filese from diff view
                this._workspaceWordCount[uri.toString()] = wordCount;
            this.updateStatusBar();
        });
    }

    public removeWordCountInWorkspace(uri: Uri) {
        // Wenn eine Datei gelöscht wird, sollten wir die Wortzahl dieser Datei entfernen.
        this._workspaceWordCount[uri.toString()] = undefined;
        this.updateStatusBar();
    }

    public updateWordCountInAllFiles() {
        // Lädt alle Markdown-Dateien im Workspace und zählt ihre Wörter
        this._workspaceWordCount = {};
        workspace.findFiles(vscode.workspace.getConfiguration('pagecount').get<string>('include') || '**/*.md', (vscode.workspace.getConfiguration('pagecount').get<string[]>('excludeFromTotal')?.[0] || '')).then(uris => {
            uris.forEach(uri => {
                this.updateWordCountInWorkspace(uri);
            });
        }).then(() => {
            this.updateStatusBar();
        });
    }

    public updateStatusBar() {
        if (!this._statusBarItem) {
            this._statusBarItem = [window.createStatusBarItem(StatusBarAlignment.Right), window.createStatusBarItem(StatusBarAlignment.Left)];
        }
        const currentUri =
            window.activeTextEditor && window.activeTextEditor.document && window.activeTextEditor.document.uri && window.activeTextEditor.document.uri.path
                //  && (vscode.workspace.getConfiguration('pagecount').get<string[]>('excludeFromTotal') == undefined || !minimatch(window.activeTextEditor.document.uri.toString(), vscode.workspace.getConfiguration('pagecount').get<string[]>('excludeFromTotal') ?? ''))
                && (vscode.workspace.getConfiguration('pagecount').get<string>('include') != undefined && minimatch(window.activeTextEditor.document.uri.path, vscode.workspace.getConfiguration('pagecount').get<string>('include') ?? ''))
                ? window.activeTextEditor.document.uri.toString()
                : "";



        const filterKeys = (key: string) => {
            if (this._workspaceWordCount[key] === undefined) {
                return false;
            }
            if ((vscode.workspace.getConfiguration('pagecount').get<string[]>('excludeFromTotal') ?? []).some(glob => minimatch(key, glob))) {
                return false;
            }
            return true;
        }

        const current = this.currentSelection ?? this._workspaceWordCount[currentUri];

        const wordCountTotal = Object.keys(this._workspaceWordCount).filter(filterKeys).map(key => this._workspaceWordCount[key]!.wordCount).reduce((p, c) => p + c, 0);
        const wordCountCurrent = current === undefined
            ? 0
            : (current).wordCount;

        const lineCountTotal = Object.keys(this._workspaceWordCount).filter(filterKeys).map(key => this._workspaceWordCount[key]!.lineCount).reduce((p, c) => p + c, 0);
        const lineCountCurrent = (current) === undefined
            ? 0
            : (current).lineCount;

        const charCountTotal = Object.keys(this._workspaceWordCount).filter(filterKeys).map(key => this._workspaceWordCount[key]!.characters).reduce((p, c) => p + c, 0);
        const charCountCurrent = (current) === undefined
            ? 0
            : (current).characters;

        const pageCountTotal = Object.keys(this._workspaceWordCount).filter(filterKeys).map(key => this._workspaceWordCount[key]).map(this.calculatePages).reduce((p, c) => p + c, 0);
        const pageCountCurrent = this.calculatePages(current);


        function avg(a: number, b: number) { const min = Math.min(a, b); const max = Math.max(a, b); const diff = max - min; return min + (diff / 2) }
        const speeds = {
            "6-7 years old": avg(53, 111),
            "7-8 years old": avg(89, 149),
            "8-9 years old": avg(107, 162),
            "9-10 years old": avg(123, 180),
            "10-11 years old": avg(139, 194),
            "11-14 years old": avg(150, 204),
            "Highschool": avg(200, 300),
            "College": avg(300, 350),
            "Adults": avg(220, 350)
            // based on Hasbrouck, J. & Tindal, G. (2017) – Brysbaert, M. (2019)
            // from https://scholarwithin.com/average-reading-speed#
        }
        const reader = vscode.workspace.getConfiguration('pagecount').get<"Custom WPM" | "6-7 years old" | "7-8 years old" | "8-9 years old" | "9-10 years old" | "10-11 years old" | "11-14 years old" | "Highschool" | "College" | "Adults">('readingTime.readingSpead') ?? "Adults";
        const readSpeed =
            reader == 'Custom WPM'
                ? (vscode.workspace.getConfiguration('pagecount').get<number>('readingTime.wordsPerMinute') ?? 1)
                : speeds[reader];
        const readTimeTotal = Object.keys(this._workspaceWordCount).filter(filterKeys).map(key => this._workspaceWordCount[key]!.wordCount).map(x => x / readSpeed).reduce((p, c) => p + c, 0);
        const readTimeCurrent = current === undefined
            ? 0
            : (current).wordCount / readSpeed;


        const documentCountTotal = Object.keys(this._workspaceWordCount).filter(filterKeys).length;

        const wordTextCurrent = wordCountCurrent !== 1 ? `${wordCountCurrent.toLocaleString()} Words` : '1 Word';
        const lineTextCurrent = lineCountCurrent !== 1 ? `${lineCountCurrent.toLocaleString()} Lines` : '1 Line';
        const pageTextCurrent = pageCountCurrent !== 1 ? `${pageCountCurrent.toLocaleString()} Pages` : '1 Page';
        const readTextCurrent = calculateTimeText(readTimeCurrent);

        const wordTextTotal = wordCountTotal !== 1 ? `${wordCountTotal.toLocaleString()} Words` : '1 Word';
        const lineTextTotal = lineCountTotal !== 1 ? `${lineCountTotal.toLocaleString()} Lines` : '1 Line';
        const pageTextTotal = pageCountTotal !== 1 ? `${pageCountTotal.toLocaleString()} Pages` : '1 Page';
        const readTextTotal = calculateTimeText(readTimeTotal)
            ;
        const documentTextTotal = documentCountTotal !== 1 ? `${documentCountTotal.toLocaleString()} Documents` : '1 Document';

        const currentText = `$(pencil) ${formatText(wordTextCurrent, lineTextCurrent, pageTextCurrent, readTextCurrent)}`;
        const totalText = `$(book) ${formatText(wordTextTotal, lineTextTotal, pageTextTotal, readTextTotal, documentTextTotal)}`;



        if (currentUri !== "" && (vscode.workspace.getConfiguration('pagecount').get<boolean>('showCurrentStatsInStatusbar') ?? true)) {
            this._statusBarItem[0].text = currentText;
            this._statusBarItem[0].show();
        } else {
            this._statusBarItem[0].hide();
        }
        if ((vscode.workspace.getConfiguration('pagecount').get<boolean>('showTotalStatsInStatusbar') ?? true)) {
            this._statusBarItem[1].text = totalText;
            this._statusBarItem[1].show();
        } else {
            this._statusBarItem[1].hide();
        }


        function formatText(wordText: string, lineText: string, pageText: string, timeText: string, documentText?: string): string {
            let result = "";
            if (vscode.workspace.getConfiguration('pagecount').get<boolean>('showWordCount') ?? true) {
                result += wordText;
            }
            if (vscode.workspace.getConfiguration('pagecount').get<boolean>('showLineCount') ?? true) {
                if (result.length > 0) {
                    result += " in "
                }
                result += lineText;
            }
            if (vscode.workspace.getConfiguration('pagecount').get<boolean>('showPageCount') ?? true) {
                if (result.length > 0) {
                    result += " on "
                }
                result += pageText;
            }
            if (documentText && (vscode.workspace.getConfiguration('pagecount').get<boolean>('showDocumentCount') ?? true)) {
                if (result.length > 0) {
                    result += " in "
                }
                result += documentText;
            }
            if (vscode.workspace.getConfiguration('pagecount').get<boolean>('showEstimatedReadingTime') ?? true) {
                if (result.length > 0) {
                    result += " takes "
                }
                result += timeText;
            }
            return result;

        }

        function calculateTimeText(readTimeTotal: number) {
            return readTimeTotal < 1
                ? `< 1 minute`
                : Math.ceil(readTimeTotal) === 1
                    ? '1 minute'
                    : readTimeTotal < 60
                        ? `${Math.ceil(readTimeTotal)} minutes`
                        : readTimeTotal == 60
                            ? `an hours`
                            : readTimeTotal % 60 <= 15
                                ? `${Math.floor(readTimeTotal / 60)} ¼ hours`
                                : readTimeTotal % 60 <= 30
                                    ? `${Math.floor(readTimeTotal / 60)} ½ hours`
                                    : readTimeTotal % 60 <= 45
                                        ? `${Math.floor(readTimeTotal / 60)} ¾ hours`
                                        : `${Math.ceil(readTimeTotal / 60)} hours`;
        }
    }

    public _getWordCount(doc: TextDocument): ConuterData {
        const docContent = doc.getText();
        const numberOfChars = docContent.replaceAll(/[\s\n\r]+/g, '').length;
        const numberOfLines = docContent.split(/\r\n|\r|\n/).length;
        const normalizedSpaces = docContent.replaceAll(/\s+/g, ' ').trim();
        const wordCount = normalizedSpaces !== "" ? normalizedSpaces.split(" ").length : 0;
        return { wordCount, lineCount: numberOfLines, characters: numberOfChars };
    }

    public dispose() {
        this._statusBarItem?.forEach(d => d.dispose());
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
