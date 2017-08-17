/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// 'use strict';

import {create as createAngularLs} from './language-service';
// import '../lib/reflect-metadata';

// how the original language service bundle would be imported
//
// import ls from './language-service';

import ts = require('../lib/typescriptServices');
import { contents as libdts } from '../lib/lib-ts';
import { contents as libes6ts } from '../lib/lib-es6-ts';

import Promise = monaco.Promise;
import IWorkerContext = monaco.worker.IWorkerContext;

const DEFAULT_LIB = {
	NAME: 'file:///defaultLib:lib.d.ts',
	CONTENTS: libdts
};

const ES6_LIB = {
	NAME: 'file:///defaultLib:lib.es6.d.ts',
	CONTENTS: libes6ts
};

function fetchLocal(url) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest
    xhr.onload = function() {
      resolve(new Response(xhr.responseText, {status: xhr.status}))
    }
    xhr.onerror = function() {
      reject(new TypeError('Local request failed'))
    }
    xhr.open('GET', url)
    xhr.send(null)
  })
}

export class TypeScriptWorker implements ts.LanguageServiceHost {

	// --- model sync -----------------------

	private _ctx: IWorkerContext;
	// private _extraLibs: { [fileName: string]: string } = Object.create(null);
	private _extraLibs: { [fileName: string]: string } = {};

	// old creation function
	// private _languageService = ts.createLanguageService(this);
	private _languageService: ts.LanguageService;
	private _compilerOptions: ts.CompilerOptions;

	constructor(ctx: IWorkerContext, createData: ICreateData) {
		this._ctx = ctx;
		this._compilerOptions = createData.compilerOptions;
		console.log("Compiler options: ", this._compilerOptions);
		// this._extraLibs = createData.extraLibs;
		this._extraLibs = {};

		this._languageService = ts.createLanguageService(this);

		console.log(this._languageService);
		console.log(ts);

		// right now this is because we're running on a file URL
		// fetch("http://localhost:8081/compiler_bundle.json").then(r => {
		// 	r.json().then((data) => {
		// 		console.log(data);

		// 		let files = Object.keys(data.fileSystem);
		// 		var i;
		// 		var num_added = 0;
		// 		for (i = 0; i < files.length; i++) {

		// 			// if (num_added > 5) {
		// 			// 	break;
		// 			// }

		// 			console.log(`file ${i} of ${files.length}`);
		// 			var filename = files[i];
		// 			if (filename.indexOf("node_modules/") != 0 ||
		// 				filename.indexOf("/typescript/") != -1)
		// 			{
		// 					continue;
		// 			}

		// 			this._extraLibs[filename] = data.fileSystem[filename].text;

		// 			// monaco.languages.typescript.typescriptDefaults.addExtraLib(
		// 			// 	data.fileSystem[filename].text,
		// 			// 	filename
		// 			// );
		// 			num_added++;
		// 		}
		// 	});
		// });

		let xhr = new XMLHttpRequest();
		xhr.open("GET", "http://localhost:8081/compiler_bundle.json", false);
		xhr.send(null);

		let data = JSON.parse(xhr.responseText);
		let files = Object.keys(data.fileSystem);
		var i;
		for (i = 0; i < files.length; i++) {
			console.log(`file ${i} of ${files.length}`);
			var filename = files[i];
			if (filename.indexOf("node_modules/") != 0 ||
				filename.indexOf("/typescript/") != -1)
			{
					continue;
			}

			this._extraLibs[filename] = data.fileSystem[filename].text;
		}

		// console.log(this._extraLibs);

		// console.log(this._languageService);

		let params = {
			project: {
				projectService: {
					logger: {
						log: console.warn.bind(console),
						info: console.warn.bind(console),

					}
				}
			},
			languageService: this._languageService,
			languageServiceHost: this,
			serverHost: {},
			config: {}
		};

		// console.log(params);

		// how the original language service bundle would be used
		//
		// const l = ls({typescript: ts, path: {}, fs: {}});
		// const ngLanguageService = l.create(params);

		let ngLanguageService: ts.LanguageService = createAngularLs(params);
		// console.log(ngLanguageService);

		this._languageService = ngLanguageService;
	}

	// --- language service host ---------------

	getCompilationSettings(): ts.CompilerOptions {
		return this._compilerOptions;
	}

	getScriptFileNames(): string[] {
		// console.count(`getScriptFileNames() called!`);
		let models = this._ctx.getMirrorModels().map(model => model.uri.toString());
		let toReturn = models.concat(Object.keys(this._extraLibs));
		// console.log("returning: ", toReturn);
		return toReturn;
	}

	private _getModel(fileName: string): monaco.worker.IMirrorModel {
		let models = this._ctx.getMirrorModels();
		for (let i = 0; i < models.length; i++) {
			if (models[i].uri.toString() === fileName) {
				return models[i];
			}
		}
		return null;
	}

	getScriptVersion(fileName: string): string {
		let model = this._getModel(fileName);
		if (model) {
			return model.version.toString();
		} else if (this.isDefaultLibFileName(fileName) || fileName in this._extraLibs) {
			// extra lib and default lib are static
			return '1';
		}
	}

	getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
		let text: string;
		let model = this._getModel(fileName);
		if (model) {
			// a true editor model
			text = model.getValue();

		} else if (fileName in this._extraLibs) {
			// static extra lib
			text = this._extraLibs[fileName];

		} else if (fileName === DEFAULT_LIB.NAME) {
			text = DEFAULT_LIB.CONTENTS;
		} else if (fileName === ES6_LIB.NAME) {
			text = ES6_LIB.CONTENTS;
		} else {
			return;
		}

		return <ts.IScriptSnapshot>{
			getText: (start, end) => text.substring(start, end),
			getLength: () => text.length,
			getChangeRange: () => undefined
		};
	}

	getScriptKind?(fileName: string): ts.ScriptKind {
		const suffix = fileName.substr(fileName.lastIndexOf('.') + 1);
		switch (suffix) {
			case 'ts': return ts.ScriptKind.TS;
			case 'tsx': return ts.ScriptKind.TSX;
			case 'js': return ts.ScriptKind.JS;
			case 'jsx': return ts.ScriptKind.JSX;
			default: return this.getCompilationSettings().allowJs
				? ts.ScriptKind.JS
				: ts.ScriptKind.TS;
		}
	}

	getCurrentDirectory(): string {
		return '';
	}

	getDefaultLibFileName(options: ts.CompilerOptions): string {
		// TODO@joh support lib.es7.d.ts
		return options.target <= ts.ScriptTarget.ES5 ? DEFAULT_LIB.NAME : ES6_LIB.NAME;
	}

	isDefaultLibFileName(fileName: string): boolean {
		return fileName === this.getDefaultLibFileName(this._compilerOptions);
	}

	// --- language features

	getSyntacticDiagnostics(fileName: string): Promise<ts.Diagnostic[]> {
		const diagnostics = this._languageService.getSyntacticDiagnostics(fileName);
		diagnostics.forEach(diag => diag.file = undefined); // diag.file cannot be JSON'yfied
		return Promise.as(diagnostics);
	}

	getSemanticDiagnostics(fileName: string): Promise<ts.Diagnostic[]> {
		const diagnostics = this._languageService.getSemanticDiagnostics(fileName);
		diagnostics.forEach(diag => diag.file = undefined); // diag.file cannot be JSON'yfied
		return Promise.as(diagnostics);
	}

	getCompilerOptionsDiagnostics(fileName: string): Promise<ts.Diagnostic[]> {
		const diagnostics = this._languageService.getCompilerOptionsDiagnostics();
		diagnostics.forEach(diag => diag.file = undefined); // diag.file cannot be JSON'yfied
		return Promise.as(diagnostics);
	}

	getCompletionsAtPosition(fileName: string, position: number): Promise<ts.CompletionInfo> {
		return Promise.as(this._languageService.getCompletionsAtPosition(fileName, position));
	}

	getCompletionEntryDetails(fileName: string, position: number, entry: string): Promise<ts.CompletionEntryDetails> {
		return Promise.as(this._languageService.getCompletionEntryDetails(fileName, position, entry));
	}

	getSignatureHelpItems(fileName: string, position: number): Promise<ts.SignatureHelpItems> {
		return Promise.as(this._languageService.getSignatureHelpItems(fileName, position));
	}

	getQuickInfoAtPosition(fileName: string, position: number): Promise<ts.QuickInfo> {
		return Promise.as(this._languageService.getQuickInfoAtPosition(fileName, position));
	}

	getOccurrencesAtPosition(fileName: string, position: number): Promise<ts.ReferenceEntry[]> {
		return Promise.as(this._languageService.getOccurrencesAtPosition(fileName, position));
	}

	getDefinitionAtPosition(fileName: string, position: number): Promise<ts.DefinitionInfo[]> {
		return Promise.as(this._languageService.getDefinitionAtPosition(fileName, position));
	}

	getReferencesAtPosition(fileName: string, position: number): Promise<ts.ReferenceEntry[]> {
		return Promise.as(this._languageService.getReferencesAtPosition(fileName, position));
	}

	getNavigationBarItems(fileName: string): Promise<ts.NavigationBarItem[]> {
		return Promise.as(this._languageService.getNavigationBarItems(fileName));
	}

	getFormattingEditsForDocument(fileName: string, options: ts.FormatCodeOptions): Promise<ts.TextChange[]> {
		return Promise.as(this._languageService.getFormattingEditsForDocument(fileName, options));
	}

	getFormattingEditsForRange(fileName: string, start: number, end: number, options: ts.FormatCodeOptions): Promise<ts.TextChange[]> {
		return Promise.as(this._languageService.getFormattingEditsForRange(fileName, start, end, options));
	}

	getFormattingEditsAfterKeystroke(fileName: string, postion: number, ch: string, options: ts.FormatCodeOptions): Promise<ts.TextChange[]> {
		return Promise.as(this._languageService.getFormattingEditsAfterKeystroke(fileName, postion, ch, options));
	}

	getEmitOutput(fileName: string): Promise<ts.EmitOutput> {
		return Promise.as(this._languageService.getEmitOutput(fileName));
	}
}

export interface ICreateData {
	compilerOptions: ts.CompilerOptions;
	extraLibs: { [path: string]: string };
}

export function create(ctx: IWorkerContext, createData: ICreateData): TypeScriptWorker {
	return new TypeScriptWorker(ctx, createData);
}

