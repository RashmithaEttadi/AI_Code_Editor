const API_KEY = ""; // Get yours at https://platform.sulu.sh/apis/judge0

const AUTH_HEADERS = API_KEY ? {
    "Authorization": `Bearer ${API_KEY}`
} : {};

const CE = "CE";
const EXTRA_CE = "EXTRA_CE";

const AUTHENTICATED_CE_BASE_URL = "https://judge0-ce.p.sulu.sh";
const AUTHENTICATED_EXTRA_CE_BASE_URL = "https://judge0-extra-ce.p.sulu.sh";

var AUTHENTICATED_BASE_URL = {};
AUTHENTICATED_BASE_URL[CE] = AUTHENTICATED_CE_BASE_URL;
AUTHENTICATED_BASE_URL[EXTRA_CE] = AUTHENTICATED_EXTRA_CE_BASE_URL;

const UNAUTHENTICATED_CE_BASE_URL = "https://ce.judge0.com";
const UNAUTHENTICATED_EXTRA_CE_BASE_URL = "https://extra-ce.judge0.com";

var UNAUTHENTICATED_BASE_URL = {};
UNAUTHENTICATED_BASE_URL[CE] = UNAUTHENTICATED_CE_BASE_URL;
UNAUTHENTICATED_BASE_URL[EXTRA_CE] = UNAUTHENTICATED_EXTRA_CE_BASE_URL;

const INITIAL_WAIT_TIME_MS = 0;
const WAIT_TIME_FUNCTION = i => 100;
const MAX_PROBE_REQUESTS = 50;

var fontSize = 13;

var layout;

var sourceEditor;
var stdinEditor;
var stdoutEditor;

var $selectLanguage;
var $compilerOptions;
var $commandLineArguments;
var $runBtn;
var $statusLine;

var timeStart;
var timeEnd;

var sqliteAdditionalFiles;
var languages = {};
let currentErrorDecorations = [];

var layoutConfig = {
    settings: {
        showPopoutIcon: false,
        reorderEnabled: true
    },
    content: [{
        type: "row",
        content: [{
            type: "component",
            width: 66,
            componentName: "source",
            id: "source",
            title: "Source Code",
            isClosable: false,
            componentState: {
                readOnly: false
            }
        }, {
            type: "column",
            content: [{
                type: "stack",
                height: 50,
                content: [{
                    type: "component",
                    componentName: "stdin",
                    id: "stdin",
                    title: "Input",
                    isClosable: false,
                    componentState: {
                        readOnly: false
                    }
                }, {
                    type: "component",
                    componentName: "stdout",
                    id: "stdout",
                    title: "Output",
                    isClosable: false,
                    componentState: {
                        readOnly: true
                    }
                }]
            }, {
                type: "component",
                height: 50,
                componentName: "chat",
                id: "chat",
                title: "AI Chat",
                isClosable: false
            }, {
                type: "component",
                height: 30,
                componentName: "bugFinder",
                id: "bugFinder",
                title: "Bug Finder",
                isClosable: false
            }]
        }]
    }]
};

const PUTER = puter.env === "app";
var gPuterFile;

function encode(str) {
    return btoa(unescape(encodeURIComponent(str || "")));
}

function decode(bytes) {
    var escaped = escape(atob(bytes || ""));
    try {
        return decodeURIComponent(escaped);
    } catch {
        return unescape(escaped);
    }
}

function showError(title, content) {
    $("#judge0-site-modal #title").html(title);
    $("#judge0-site-modal .content").html(content);

    let reportTitle = encodeURIComponent(`Error on ${window.location.href}`);
    let reportBody = encodeURIComponent(
        `**Error Title**: ${title}\n` +
        `**Error Timestamp**: \`${new Date()}\`\n` +
        `**Origin**: ${window.location.href}\n` +
        `**Description**:\n${content}`
    );

    $("#report-problem-btn").attr("href", `https://github.com/judge0/ide/issues/new?title=${reportTitle}&body=${reportBody}`);
    $("#judge0-site-modal").modal("show");
}

function showHttpError(jqXHR) {
    showError(`${jqXHR.statusText} (${jqXHR.status})`, `<pre>${JSON.stringify(jqXHR, null, 4)}</pre>`);
}

function handleRunError(jqXHR) {
    showHttpError(jqXHR);
    $runBtn.removeClass("disabled");

    window.top.postMessage(JSON.parse(JSON.stringify({
        event: "runError",
        data: jqXHR
    })), "*");
}

function handleResult(data) {
    const tat = Math.round(performance.now() - timeStart);
    console.log(`It took ${tat}ms to get submission result.`);

    const status = data.status;
    const stdout = decode(data.stdout);
    const compileOutput = decode(data.compile_output);
    const time = (data.time === null ? "-" : data.time + "s");
    const memory = (data.memory === null ? "-" : data.memory + "KB");

    $statusLine.html(`${status.description}, ${time}, ${memory} (TAT: ${tat}ms)`);

    const output = [compileOutput, stdout].join("\n").trim();

    stdoutEditor.setValue(output);

    $runBtn.removeClass("disabled");

    window.top.postMessage(JSON.parse(JSON.stringify({
        event: "postExecution",
        status: data.status,
        time: data.time,
        memory: data.memory,
        output: output
    })), "*");
}

async function getSelectedLanguage() {
    return getLanguage(getSelectedLanguageFlavor(), getSelectedLanguageId())
}

function getSelectedLanguageId() {
    return parseInt($selectLanguage.val());
}

function getSelectedLanguageFlavor() {
    return $selectLanguage.find(":selected").attr("flavor");
}

function run() {
    if (sourceEditor.getValue().trim() === "") {
        showError("Error", "Source code can't be empty!");
        return;
    } else {
        $runBtn.addClass("disabled");
    }

    stdoutEditor.setValue("");
    $statusLine.html("");

    let x = layout.root.getItemsById("stdout")[0];
    x.parent.header.parent.setActiveContentItem(x);

    let sourceValue = encode(sourceEditor.getValue());
    let stdinValue = encode(stdinEditor.getValue());
    let languageId = getSelectedLanguageId();
    let compilerOptions = $compilerOptions.val();
    let commandLineArguments = $commandLineArguments.val();

    let flavor = getSelectedLanguageFlavor();

    if (languageId === 44) {
        sourceValue = sourceEditor.getValue();
    }

    let data = {
        source_code: sourceValue,
        language_id: languageId,
        stdin: stdinValue,
        compiler_options: compilerOptions,
        command_line_arguments: commandLineArguments,
        redirect_stderr_to_stdout: true
    };

    let sendRequest = function (data) {
        window.top.postMessage(JSON.parse(JSON.stringify({
            event: "preExecution",
            source_code: sourceEditor.getValue(),
            language_id: languageId,
            flavor: flavor,
            stdin: stdinEditor.getValue(),
            compiler_options: compilerOptions,
            command_line_arguments: commandLineArguments
        })), "*");

        timeStart = performance.now();
        $.ajax({
            url: `${AUTHENTICATED_BASE_URL[flavor]}/submissions?base64_encoded=true&wait=false`,
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify(data),
            headers: AUTH_HEADERS,
            success: function (data, textStatus, request) {
                console.log(`Your submission token is: ${data.token}`);
                let region = request.getResponseHeader('X-Judge0-Region');
                setTimeout(fetchSubmission.bind(null, flavor, region, data.token, 1), INITIAL_WAIT_TIME_MS);
            },
            error: handleRunError
        });
    }

    if (languageId === 82) {
        if (!sqliteAdditionalFiles) {
            $.ajax({
                url: `./data/additional_files_zip_base64.txt`,
                contentType: "text/plain",
                success: function (responseData) {
                    sqliteAdditionalFiles = responseData;
                    data["additional_files"] = sqliteAdditionalFiles;
                    sendRequest(data);
                },
                error: handleRunError
            });
        }
        else {
            data["additional_files"] = sqliteAdditionalFiles;
            sendRequest(data);
        }
    } else {
        sendRequest(data);
    }
}

function fetchSubmission(flavor, region, submission_token, iteration) {
    if (iteration >= MAX_PROBE_REQUESTS) {
        handleRunError({
            statusText: "Maximum number of probe requests reached.",
            status: 504
        }, null, null);
        return;
    }

    $.ajax({
        url: `${UNAUTHENTICATED_BASE_URL[flavor]}/submissions/${submission_token}?base64_encoded=true`,
        headers: {
            "X-Judge0-Region": region
        },
        success: function (data) {
            if (data.status.id <= 2) { // In Queue or Processing
                $statusLine.html(data.status.description);
                setTimeout(fetchSubmission.bind(null, flavor, region, submission_token, iteration + 1), WAIT_TIME_FUNCTION(iteration));
            } else {
                handleResult(data);
            }
        },
        error: handleRunError
    });
}

function setSourceCodeName(name) {
    $(".lm_title")[0].innerText = name;
}

function getSourceCodeName() {
    return $(".lm_title")[0].innerText;
}

function openFile(content, filename) {
    clear();
    sourceEditor.setValue(content);
    selectLanguageForExtension(filename.split(".").pop());
    setSourceCodeName(filename);
}

function saveFile(content, filename) {
    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

async function openAction() {
    if (PUTER) {
        gPuterFile = await puter.ui.showOpenFilePicker();
        openFile(await (await gPuterFile.read()).text(), gPuterFile.name);
    } else {
        document.getElementById("open-file-input").click();
    }
}

async function saveAction() {
    if (PUTER) {
        if (gPuterFile) {
            gPuterFile.write(sourceEditor.getValue());
        } else {
            gPuterFile = await puter.ui.showSaveFilePicker(sourceEditor.getValue(), getSourceCodeName());
            setSourceCodeName(gPuterFile.name);
        }
    } else {
        saveFile(sourceEditor.getValue(), getSourceCodeName());
    }
}

function setFontSizeForAllEditors(fontSize) {
    sourceEditor.updateOptions({ fontSize: fontSize });
    stdinEditor.updateOptions({ fontSize: fontSize });
    stdoutEditor.updateOptions({ fontSize: fontSize });
}

function formatMarkdown(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>') // Only process inline code
        .replace(/- (.*)/g, '<li>$1</li>')
        .replace(/\n/g, '<br>');
}

async function loadLangauges() {
    return new Promise((resolve, reject) => {
        let options = [];

        $.ajax({
            url: UNAUTHENTICATED_CE_BASE_URL + "/languages",
            success: function (data) {
                for (let i = 0; i < data.length; i++) {
                    let language = data[i];
                    let option = new Option(language.name, language.id);
                    option.setAttribute("flavor", CE);
                    option.setAttribute("langauge_mode", getEditorLanguageMode(language.name));

                    if (language.id !== 89) {
                        options.push(option);
                    }

                    if (language.id === DEFAULT_LANGUAGE_ID) {
                        option.selected = true;
                    }
                }
            },
            error: reject
        }).always(function () {
            $.ajax({
                url: UNAUTHENTICATED_EXTRA_CE_BASE_URL + "/languages",
                success: function (data) {
                    for (let i = 0; i < data.length; i++) {
                        let language = data[i];
                        let option = new Option(language.name, language.id);
                        option.setAttribute("flavor", EXTRA_CE);
                        option.setAttribute("langauge_mode", getEditorLanguageMode(language.name));

                        if (options.findIndex((t) => (t.text === option.text)) === -1 && language.id !== 89) {
                            options.push(option);
                        }
                    }
                },
                error: reject
            }).always(function () {
                options.sort((a, b) => a.text.localeCompare(b.text));
                $selectLanguage.append(options);
                resolve();
            });
        });
    });
};

const suggestionsProvider = {
    provideCompletionItems: (model, position) => {
        const line = position.lineNumber;
        const currentLanguage = model.getLanguageId();
        
        // Only show suggestions if there's an error in this line
        if (!errorDecorations.some(d => d.range.startLineNumber === line)) return [];

        return {
            suggestions: [{
                label: '🛠 Fix this error',
                kind: monaco.languages.CompletionItemKind.QuickFix,
                insertText: '',
                command: {
                    id: 'showErrorFix',
                    title: `Show ${currentLanguage} Fix Suggestions`,
                    arguments: [line]
                }
            }]
        };
    }
};

async function loadSelectedLanguage(skipSetDefaultSourceCodeName = false) {
    monaco.editor.setModelLanguage(sourceEditor.getModel(), $selectLanguage.find(":selected").attr("langauge_mode"));

    if (!skipSetDefaultSourceCodeName) {
        setSourceCodeName((await getSelectedLanguage()).source_file);
    }

}

function selectLanguageByFlavorAndId(languageId, flavor) {
    let option = $selectLanguage.find(`[value=${languageId}][flavor=${flavor}]`);
    if (option.length) {
        option.prop("selected", true);
        $selectLanguage.trigger("change", { skipSetDefaultSourceCodeName: true });
    }
}

function selectLanguageForExtension(extension) {
    let language = getLanguageForExtension(extension);
    selectLanguageByFlavorAndId(language.language_id, language.flavor);
}

async function getLanguage(flavor, languageId) {
    return new Promise((resolve, reject) => {
        if (languages[flavor] && languages[flavor][languageId]) {
            resolve(languages[flavor][languageId]);
            return;
        }

        $.ajax({
            url: `${UNAUTHENTICATED_BASE_URL[flavor]}/languages/${languageId}`,
            success: function (data) {
                if (!languages[flavor]) {
                    languages[flavor] = {};
                }

                languages[flavor][languageId] = data;
                resolve(data);
            },
            error: reject
        });
    });
}

function setDefaults() {
    setFontSizeForAllEditors(fontSize);
    sourceEditor.setValue(DEFAULT_SOURCE);
    stdinEditor.setValue(DEFAULT_STDIN);
    $compilerOptions.val(DEFAULT_COMPILER_OPTIONS);
    $commandLineArguments.val(DEFAULT_CMD_ARGUMENTS);

    $statusLine.html("");

    loadSelectedLanguage();
}

function clear() {
    sourceEditor.setValue("");
    stdinEditor.setValue("");
    $compilerOptions.val("");
    $commandLineArguments.val("");

    $statusLine.html("");
}

function refreshSiteContentHeight() {
    const navigationHeight = $("#judge0-site-navigation").outerHeight();
    $("#judge0-site-content").height($(window).height() - navigationHeight);
    $("#judge0-site-content").css("padding-top", navigationHeight);
}

function refreshLayoutSize() {
    refreshSiteContentHeight();
    layout.updateSize();
}

$(window).resize(refreshLayoutSize);

$(document).ready(async function () {
    $("#select-language").dropdown();
    $("[data-content]").popup({
        lastResort: "left center"
    });

    refreshSiteContentHeight();

    console.log("Hey, Judge0 IDE is open-sourced: https://github.com/judge0/ide. Have fun!");

    $selectLanguage = $("#select-language");
    $selectLanguage.change(function (event, data) {
        let skipSetDefaultSourceCodeName = (data && data.skipSetDefaultSourceCodeName) || !!gPuterFile;
        loadSelectedLanguage(skipSetDefaultSourceCodeName);
    });

    await loadLangauges();

    $compilerOptions = $("#compiler-options");
    $commandLineArguments = $("#command-line-arguments");

    $runBtn = $("#run-btn");
    $runBtn.click(run);

    $("#open-file-input").change(function (e) {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            const reader = new FileReader();
            reader.onload = function (e) {
                openFile(e.target.result, selectedFile.name);
            };

            reader.onerror = function (e) {
                showError("Error", "Error reading file: " + e.target.error);
            };

            reader.readAsText(selectedFile);
        }
    });

    $statusLine = $("#judge0-status-line");

    require(["vs/editor/editor.main"], function (ignorable) {
        layout = new GoldenLayout(layoutConfig, $("#judge0-site-content"));

        layout.registerComponent("source", function (container, state) {
            sourceEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: true,
                readOnly: state.readOnly,
                language: "cpp",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: true
                }
            });

            sourceEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);

            // Add intelligent code completion
            sourceEditor.getModel().onDidChangeContent((event) => {
                // Trigger suggestions automatically as user types
                setTimeout(() => {
                    sourceEditor.trigger('keyboard', 'editor.action.triggerSuggest', {});
                }, 100);
            });

            // Register custom completion provider
            monaco.languages.registerCompletionItemProvider('cpp', {
                provideCompletionItems: function(model, position) {
                    const word = model.getWordUntilPosition(position);
                    const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: word.endColumn
                    };

                    // Custom suggestions based on context
                    const suggestions = [
                        {
                            label: 'cout',
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: 'std::cout << ${1:value} << std::endl;',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            documentation: 'Output to console',
                            range: range
                        },
                        {
                            label: 'for',
                            kind: monaco.languages.CompletionItemKind.Snippet,
                            insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:size}; ++${1:i}) {\n\t${3}\n}',
                            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                            documentation: 'For loop',
                            range: range
                        }
                        // Add more suggestions as needed
                    ];

                    return { suggestions: suggestions };
                }
            });

            // Add bug finder feature
            let currentDiagnostics = [];
            let errorDecorations = [];

            async function analyzeBugs() {
                const code = sourceEditor.getValue();
                const language = $selectLanguage.find(":selected").text();
                const apiKey = document.getElementById('api-key-input').value;
                
                if (!apiKey) return;

                try {
                    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: document.getElementById('llm-model-select').value,
                            messages: [{
                                role: "user",
                                content: `Analyze this ${language} code for potential bugs and issues. Return the results in this exact JSON format:
                                {
                                    "issues": [
                                        {
                                            "line": <line_number>,
                                            "severity": "error|warning|info",
                                            "message": "<description>",
                                            "suggestion": "<fix_suggestion>"
                                        }
                                    ]
                                }
                                
                                Code:
                                ${code}`
                            }]
                        })
                    });

                    const data = await response.json();
                    const analysis = JSON.parse(data.choices[0].message.content);
                    
                    // Clear previous decorations
                    errorDecorations = sourceEditor.deltaDecorations(errorDecorations, []);
                    
                    // Create new decorations for issues
                    const newDecorations = analysis.issues.map(issue => ({
                        range: new monaco.Range(
                            issue.line,
                            1,
                            issue.line,
                            1
                        ),
                        options: {
                            isWholeLine: true,
                            className: `inlineDecoration ${issue.severity}`,
                            glyphMarginClassName: `glyphMargin ${issue.severity}`,
                            hoverMessage: { value: `${issue.message}\n\nSuggestion: ${issue.suggestion}` },
                            glyphMarginHoverMessage: { value: `${issue.severity.toUpperCase()}: ${issue.message}` }
                        }
                    }));

                    errorDecorations = sourceEditor.deltaDecorations([], newDecorations);
                    
                    // Register quick fix provider for these issues
                    monaco.languages.registerCodeActionProvider(sourceEditor.getModel().getLanguageId(), {
                        provideCodeActions: function(model, range, context, token) {
                            const actions = [];
                            const issue = analysis.issues.find(i => i.line === range.startLineNumber);
                            
                            if (issue) {
                                actions.push({
                                    title: `Fix: ${issue.suggestion}`,
                                    kind: "quickfix",
                                    isPreferred: true,
                                    edit: {
                                        edits: [{
                                            resource: model.uri,
                                            edit: {
                                                range: new monaco.Range(issue.line, 1, issue.line, model.getLineMaxColumn(issue.line)),
                                                text: issue.suggestion
                                            }
                                        }]
                                    }
                                });
                            }
                            
                            return {
                                actions: actions,
                                dispose: () => {}
                            };
                        }
                    });
                } catch (error) {
                    console.error('Error analyzing code:', error);
                }
            }

            // Add CSS styles for error decorations
            const style = document.createElement('style');
            style.textContent = `
            .inlineDecoration.error {
                background: rgba(255, 0, 0, 0.1);
                border-left: 3px solid red;
            }
            .inlineDecoration.warning {
                background: rgba(255, 255, 0, 0.1);
                border-left: 3px solid yellow;
            }
            .inlineDecoration.info {
                background: rgba(0, 0, 255, 0.1);
                border-left: 3px solid blue;
            }
            .glyphMargin {
                width: 20px;
                height: 20px;
                margin-left: 5px;
            }
            .glyphMargin.error::before {
                content: "⛔";
            }
            .glyphMargin.warning::before {
                content: "⚠️";
            }
            .glyphMargin.info::before {
                content: "ℹ️";
            }
            `;
            document.head.appendChild(style);


            // Trigger analysis on save or after typing pause
            let analyzeTimeout;
            sourceEditor.onDidChangeModelContent(() => {
                clearTimeout(analyzeTimeout);
                analyzeTimeout = setTimeout(analyzeBugs, 1000); // Analyze after 1 second of no typing
            });
        });

        layout.registerComponent("stdin", function (container, state) {
            stdinEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: false
                }
            });
        });

        layout.registerComponent("stdout", function (container, state) {
            stdoutEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: false
                }
            });
        });

        layout.registerComponent("chat", function(container, state) {
            const chatHtml = `
                <div class="chat-container">
                    <div class="model-selector">
                        <select class="ui dropdown" id="llm-model-select">
                            <option value="google/gemini-2.0-flash-thinking-exp:free" selected>Gemini 2.0 Flash</option>
                            <option value="openai/o3-mini">OpenAI O3 Mini</option>
                            <option value="qwen/qwen-turbo">Qwen Turbo</option>
                            <option value="deepseek/deepseek-r1-distill-qwen-1.5b">DeepSeek R1 Distill</option>
                            <option value="mistralai/mistral-small-24b-instruct-2501">Mistral Small 24B</option>
                            <option value="meta-llama/llama-3-70b-instruct">Llama 3 70B Instruct</option>
                        </select>
                        <div class="ui input">
                            <input type="password" id="api-key-input" placeholder="Enter OpenRouter API Key">
                        </div>
                    </div>
                    <div class="chat-messages" id="chat-messages"></div>
                    <div class="chat-input">
                        <div class="ui fluid action input">
                            <input type="text" id="chat-input" placeholder="Ask about your code...">
                            <button class="ui primary button" id="chat-send">Send</button>
                        </div>
                    </div>
                </div>
            `;
            
            container.getElement().html(chatHtml);
            initializeChat(container);
        });

        layout.registerComponent("bugFinder", function(container) {
            const bugFinderHtml = `
                <div class="bug-finder-container">
                    <div class="bug-finder-header">
                        <h3>Bug Finder</h3>
                        <button class="ui primary button" id="scan-bugs-btn">
                            <i class="bug icon"></i> Scan for Bugs
                        </button>
                    </div>
                    <div class="bug-finder-results" id="bug-finder-results"></div>
                </div>
            `;
            
            container.getElement().html(bugFinderHtml);
            initBugFinder(container);
        });

        layout.on("initialised", function () {
            setDefaults();
            refreshLayoutSize();
            window.top.postMessage({ event: "initialised" }, "*");
        });

        layout.init();
    });

    sourceEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
        const selection = sourceEditor.getSelection();
        if (!selection.isEmpty()) {
            showInlineChat(selection);
        }
    });

    // Track selection changes
    let lastSelection = null;
    sourceEditor.onDidChangeCursorSelection((e) => {
        if (!e.selection.isEmpty()) {
            lastSelection = e.selection;
        }
    });
    
    function initializeChat(container) {
        const chatInput = container.getElement().find('#chat-input');
        const chatMessages = container.getElement().find('#chat-messages');
        const sendButton = container.getElement().find('#chat-send');
        const apiKeyInput = container.getElement().find('#api-key-input');

        function addMessage(content, isUser = false) {
            // First process all code blocks in the content
            let processedContent = content;
            if (!isUser) {
                // Add unique IDs to each code block for reference
                let codeBlockCount = 0;
                processedContent = content.replace(/```([\s\S]*?)```/g, (match, code) => {
                    const blockId = `code-block-${Date.now()}-${codeBlockCount++}`;
                    return `<div class="code-block-wrapper" id="${blockId}">
                                <div class="code-block-actions">
                                    <button class="ui tiny button copy-code-btn">
                                        <i class="copy icon"></i> Copy
                                    </button>
                                    <button class="ui tiny primary button apply-code-btn">
                                        <i class="code icon"></i> Apply Changes
                                    </button>
                                </div>
                                <pre><code>${code}</code></pre>
                            </div>`;
                });
            }

            const messageDiv = $('<div>')
                .addClass('chat-message')
                .addClass(isUser ? 'user-message' : 'ai-message');

            const textDiv = $('<div>')
                .addClass('message-content')
                .html(formatMarkdown(processedContent));

            messageDiv.append(textDiv);
            chatMessages.append(messageDiv);

            // Add event handlers for the code block buttons
            if (!isUser) {
                messageDiv.find('.code-block-wrapper').each(function() {
                    const wrapper = $(this);
                    const codeBlock = wrapper.find('code');
                    const codeContent = codeBlock.text();

                    // Copy button handler
                    wrapper.find('.copy-code-btn').click(function() {
                        navigator.clipboard.writeText(codeContent);
                        const $btn = $(this);
                        $btn.html('<i class="check icon"></i> Copied!');
                        setTimeout(() => $btn.html('<i class="copy icon"></i> Copy'), 2000);
                    });

                    // Apply changes button handler
                    wrapper.find('.apply-code-btn').click(function() {
                        // Look for line numbers in previous text
                        let searchText = '';
                        let element = wrapper[0];
                        
                        // Search backwards through DOM for line numbers
                        while (element && !searchText.match(/line[s]?\s*:?\s*(\d+)(?:\s*-\s*(\d+))?/i)) {
                            if (element.previousSibling) {
                                element = element.previousSibling;
                                if (element.textContent) {
                                    searchText = element.textContent + ' ' + searchText;
                                }
                            } else if (element.parentElement) {
                                element = element.parentElement.previousSibling;
                            } else {
                                break;
                            }
                        }

                        let lineMatch = searchText.match(/line[s]?\s*:?\s*(\d+)(?:\s*-\s*(\d+))?/i);
                        let startLine = lineMatch ? parseInt(lineMatch[1]) : null;
                        let endLine = lineMatch && lineMatch[2] ? parseInt(lineMatch[2]) : startLine;

                        showCodeDiffPreview(codeContent, startLine, endLine);
                    });

                });
            }

            chatMessages.scrollTop(chatMessages[0].scrollHeight);
        } 
        
        async function sendMessage() {
            const message = chatInput.val().trim();
            if (!message) return;
        
            const apiKey = apiKeyInput.val().trim();
            if (!apiKey) {
                alert('Please enter your OpenRouter API key');
                return;
            }
        
            addMessage(message, true);
            chatInput.val('');
            chatInput.prop('disabled', true);
            sendButton.addClass('loading disabled');
        
            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: document.getElementById('llm-model-select').value,
                        messages: [{
                            role: "user",
                            content: `Analyze this code and answer the following question: ${message}

                            Code:
                            \`\`\`${$selectLanguage.find(":selected").text()}
                            ${sourceEditor.getValue()}
                            \`\`\``
                        }]
                    })
                });

                const data = await response.json();
                if (data.choices && data.choices[0]) {
                    addMessage(data.choices[0].message.content);
                } else {
                    throw new Error('Invalid response from API');
                }
            } catch (error) {
                addMessage(`Error: ${error.message}`);
            } finally {
                chatInput.prop('disabled', false);
                sendButton.removeClass('loading disabled');
            }
        }
        
        sendButton.on('click', sendMessage);
        chatInput.on('keypress', (e) => {
            if (e.which === 13) sendMessage();
        });

        // Set default code in source editor
        if (sourceEditor.getValue().trim() === '') {
            sourceEditor.setValue(DEFAULT_SOURCE);
        }
    }

    let activeInlineChat = null;

    function showInlineChat(selection) {
        if (activeInlineChat) activeInlineChat.remove();

        // Get selected text
        const model = sourceEditor.getModel();
        const selectedText = model.getValueInRange(selection);
        
        // Get editor coordinates
        const startPos = selection.getStartPosition();
        const editorNode = sourceEditor.getDomNode();
        const { top, left } = sourceEditor.getScrolledVisiblePosition(startPos);
        const editorRect = editorNode.getBoundingClientRect();

        // Create chat container
        const chatContainer = document.createElement('div');
        chatContainer.className = 'inline-chat-wrapper';
        chatContainer.style.top = `${editorRect.top + top + 24}px`;
        chatContainer.style.left = `${editorRect.left + left}px`;
        
        // Build chat UI
        chatContainer.innerHTML = `
            <div class="inline-chat-header">
                <span>Ask about selected code</span>
                <button class="ui mini icon button close-btn">
                    <i class="close icon"></i>
                </button>
            </div>
            <div class="inline-chat-body" id="inline-chat-messages"></div>
            <div class="inline-chat-input">
                <input type="text" class="ui input" id="inline-chat-input" 
                       placeholder="Ask a question about this code...">
                <button class="ui primary button" id="inline-chat-send">
                    <i class="paper plane icon"></i>
                </button>
            </div>
        `;

        document.body.appendChild(chatContainer);
        activeInlineChat = chatContainer;

        // Event listeners
        const closeBtn = chatContainer.querySelector('.close-btn');
        const sendBtn = chatContainer.querySelector('#inline-chat-send');
        const inputField = chatContainer.querySelector('#inline-chat-input');

        closeBtn.addEventListener('click', () => chatContainer.remove());
        
        sendBtn.addEventListener('click', async () => {
            const question = inputField.value.trim();
            if (!question) return;

            // Disable input during processing
            inputField.disabled = true;
            sendBtn.classList.add('loading');

            try {
                const response = await processInlineQuery(selectedText, question);
                appendInlineResponse(response);
            } catch (error) {
                appendInlineResponse(`Error: ${error.message}`);
            } finally {
                inputField.disabled = false;
                sendBtn.classList.remove('loading');
                inputField.value = '';
            }
        });

        // Auto-focus input
        inputField.focus();
    }

    async function processInlineQuery(code, question) {
        const model = document.getElementById('llm-model-select').value;
        const apiKey = document.getElementById('api-key-input').value;
        
        if (!apiKey) throw new Error('API key required');
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [{
                    role: "user",
                    content: `Analyze this code and answer the question. Focus your answer specifically on the selected code snippet.\n\n` +
                             `Code snippet:\n\`\`\`\n${code}\n\`\`\`\n\nQuestion: ${question}`
                }]
            })
        });

        const data = await response.json();
        return data.choices[0].message.content;
    }

    function appendInlineResponse(text) {
        const messagesDiv = activeInlineChat.querySelector('#inline-chat-messages');
        if (!messagesDiv) {
            console.error("Messages div not found!");
            return;
        }

        const responseDiv = document.createElement('div');
        responseDiv.className = 'chat-message ai-message';
        responseDiv.innerHTML = formatMarkdown(text);

        messagesDiv.appendChild(responseDiv);
        
        // Scroll to bottom
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    let superKey = "⌘";
    if (!/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
        superKey = "Ctrl";
    }

    [$runBtn].forEach(btn => {
        btn.attr("data-content", `${superKey}${btn.attr("data-content")}`);
    });

    document.querySelectorAll(".description").forEach(e => {
        e.innerText = `${superKey}${e.innerText}`;
    });

    if (PUTER) {
        puter.ui.onLaunchedWithItems(async function (items) {
            gPuterFile = items[0];
            openFile(await (await gPuterFile.read()).text(), gPuterFile.name);
        });
        applyStyleMode("standalone");
    }

    window.onmessage = function (e) {
        if (!e.data) {
            return;
        }

        if (e.data.action === "get") {
            window.top.postMessage(JSON.parse(JSON.stringify({
                event: "getResponse",
                source_code: sourceEditor.getValue(),
                language_id: getSelectedLanguageId(),
                flavor: getSelectedLanguageFlavor(),
                stdin: stdinEditor.getValue(),
                stdout: stdoutEditor.getValue(),
                compiler_options: $compilerOptions.val(),
                command_line_arguments: $commandLineArguments.val()
            })), "*");
        } else if (e.data.action === "set") {
            if (e.data.source_code) {
                sourceEditor.setValue(e.data.source_code);
            }
            if (e.data.language_id && e.data.flavor) {
                selectLanguageByFlavorAndId(e.data.language_id, e.data.flavor);
            }
            if (e.data.stdin) {
                stdinEditor.setValue(e.data.stdin);
            }
            if (e.data.stdout) {
                stdoutEditor.setValue(e.data.stdout);
            }
            if (e.data.compiler_options) {
                $compilerOptions.val(e.data.compiler_options);
            }
            if (e.data.command_line_arguments) {
                $commandLineArguments.val(e.data.command_line_arguments);
            }
            if (e.data.api_key) {
                AUTH_HEADERS["Authorization"] = `Bearer ${e.data.api_key}`;
            }
        }
    };

    // Add the bug finder functionality
    function initBugFinder(container) {
        const resultsDiv = container.getElement().find('#bug-finder-results');
        const scanButton = container.getElement().find('#scan-bugs-btn');
        
        async function scanForBugs() {
            const code = sourceEditor.getValue();
            const language = $selectLanguage.find(":selected").text();
            const apiKey = document.getElementById('api-key-input').value;
            
            if (!apiKey) {
                alert('Please enter your OpenRouter API key');
                return;
            }
            
            scanButton.addClass('loading');
            resultsDiv.html('<div class="ui active loader"></div>');
            
            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: document.getElementById('llm-model-select').value,
                        messages: [{
                            role: "user",
                            content: `You are a code analyzer. Analyze this ${language} code for potential bugs, errors, and improvements. Format your response exactly like this example:

                            Issue 1:
                            Line: <line_number>
                            Type: <bug|error|improvement>
                            Description: <describe the issue>
                            Fix:
                            \`\`\`
                            <corrected code for this line>
                            \`\`\`

                            Issue 2:
                            ...

                            Code to analyze:
                            \`\`\`${language}
                            ${code}
                            \`\`\``
                        }]
                    })
                });

                const data = await response.json();
                if (!data.choices || !data.choices[0]) {
                    throw new Error('Invalid response from API');
                }
                
                const analysis = data.choices[0].message.content;
                displayBugResults(analysis, resultsDiv);
                
            } catch (error) {
                resultsDiv.html(`<div class="ui negative message">Error: ${error.message}</div>`);
            } finally {
                scanButton.removeClass('loading');
            }
        }
        
        function displayBugResults(analysis, resultsDiv) {
            const issues = analysis.split(/Issue \d+:/g).filter(Boolean);
            
            if (issues.length === 0) {
                resultsDiv.html('<div class="ui info message">No issues found in the code.</div>');
                return;
            }

            const resultsHtml = issues.map(issue => {
                const lineMatch = issue.match(/Line:\s*(\d+)/);
                const typeMatch = issue.match(/Type:\s*(\w+)/);
                const descMatch = issue.match(/Description:\s*([^\n]+)/);
                const codeMatch = issue.match(/```(?:\w+)?\n([\s\S]*?)```/);

                if (!lineMatch || !typeMatch || !descMatch) return '';

                const lineNum = lineMatch[1];
                const type = typeMatch[1];
                const description = descMatch[1];
                const fixCode = codeMatch ? codeMatch[1].trim() : '';

                return `
                    <div class="bug-item">
                        <div class="bug-header">
                            <span class="bug-line">Line ${lineNum}</span>
                            <span class="bug-type ${type.toLowerCase()}">${type}</span>
                        </div>
                        <div class="bug-description">${description}</div>
                        ${fixCode ? `
                            <div class="bug-fix">
                                <pre><code>${fixCode}</code></pre>
                                <button class="ui tiny primary button apply-fix-btn" 
                                        data-line="${lineNum}" 
                                        data-fix="${escapeHtml(fixCode)}">
                                    Apply Fix
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');

            resultsDiv.html(`
                <div class="bug-results">
                    ${resultsHtml}
                </div>
            `);

            // Add click handlers for apply buttons
            resultsDiv.find('.apply-fix-btn').on('click', function() {
                const fixCode = $(this).data('fix');
                const lineNumber = $(this).data('line');
                applyCodeFix(fixCode, lineNumber);
            });
        }
        
        function escapeHtml(str) {
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        function applyCodeFix(fixCode, lineNumber) {
            const model = sourceEditor.getModel();
            const lineContent = model.getLineContent(parseInt(lineNumber));
            
            // Show diff preview before applying
            showCodeDiffPreview(lineContent, fixCode, parseInt(lineNumber));
        }
        
        scanButton.on('click', scanForBugs);
    }

    // Add this after sourceEditor creation
    let suggestionWidget = null;
    let currentSuggestions = [];

    // Add AI-powered code completion
    sourceEditor.getModel().onDidChangeContent((event) => {
        if (event.changes[0].text.length === 1) {
            checkForCompletions();
        }
    });

    function parseSuggestions(content) {
        const suggestions = [];
        const matches = content.matchAll(/```(?:\w+)?\n([\s\S]*?)```\n*(.*?)(?=```|$)/gs);
        
        for (const match of matches) {
            suggestions.push({
                code: match[1].trim(),
                explanation: match[2].trim()
            });
        }
        
        return suggestions;
    }

    async function checkForCompletions() {
        const model = sourceEditor.getModel();
        const position = sourceEditor.getPosition();
        const currentLine = model.getLineContent(position.lineNumber);
        const apiKey = document.getElementById('api-key-input').value;
        
        if (!apiKey || !currentLine.trim()) return;
        
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: document.getElementById('llm-model-select').value,
                    messages: [{
                        role: "user",
                        content: `You are a code completion assistant. Based on this line of code, suggest 2-3 possible completions. Format each suggestion as a code block followed by a brief explanation.

                        Current line: ${currentLine}
                        Language: ${model.getLanguageId()}

                        Example format:
                        \`\`\`
                        suggested code
                        \`\`\`
                        Brief explanation of what this code does

                        \`\`\`
                        another suggestion
                        \`\`\`
                        Explanation for this suggestion`
                    }]
                })
            });

            const data = await response.json();
            if (!data.choices || !data.choices[0]) {
                throw new Error('Invalid response from API');
            }

            const suggestions = parseSuggestions(data.choices[0].message.content);
            if (suggestions.length > 0) {
                showSuggestions(suggestions, position);
            }
            
        } catch (error) {
            console.error('Completion error:', error);
        }
    }

    function showSuggestions(suggestions, position) {
        if (suggestionWidget) {
            suggestionWidget.dispose();
        }
        
        const widgetHtml = `
            <div class="ai-suggestions-widget">
                ${suggestions.map((suggestion, index) => `
                    <div class="suggestion-item">
                        <pre><code>${suggestion.code}</code></pre>
                        <p>${suggestion.explanation}</p>
                        <button class="ui tiny primary button apply-suggestion-btn" data-index="${index}">
                            Apply
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
        
        const domNode = document.createElement('div');
        domNode.innerHTML = widgetHtml;
        
        domNode.querySelectorAll('.apply-suggestion-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                applySuggestion(suggestions[index].code);
                suggestionWidget.dispose();
            });
        });
        
        suggestionWidget = sourceEditor.createContentWidget({
            getId: () => 'ai-suggestions-widget',
            getDomNode: () => domNode,
            getPosition: () => ({
                position: position,
                preference: [monaco.editor.ContentWidgetPositionPreference.BELOW]
            })
        });
    }

    function applySuggestion(newCode) {
        const position = sourceEditor.getPosition();
        const model = sourceEditor.getModel();
        const lineContent = model.getLineContent(position.lineNumber);
        
        // Get original and new code as arrays
        const originalLines = lineContent.split('\n');
        const newLines = newCode.trim().split('\n');
        
        // Compute diff using Monaco's diff algorithm
        const diffComputer = new monaco.services.DiffComputer(originalLines, newLines, {
            shouldComputeCharChanges: true,
            shouldPostProcessCharChanges: true,
            shouldIgnoreTrimWhitespace: false,
            maxComputationTime: 1000
        });
        
        const lineChanges = diffComputer.computeDiff().changes;
        
        // Create edit operations from the diff
        const edits = lineChanges.map(change => ({
            range: new monaco.Range(
                position.lineNumber + change.originalStart,
                1,
                position.lineNumber + change.originalStart + change.originalLength,
                model.getLineMaxColumn(position.lineNumber + change.originalStart + change.originalLength - 1)
            ),
            text: newLines.slice(change.modifiedStart, change.modifiedStart + change.modifiedLength).join('\n')
        }));
        
        // Apply the edits
        sourceEditor.executeEdits('suggestion', edits);
        
        // Show the changes in a diff view
        showCodeDiffPreview(lineContent, newCode.trim());
    }

    // Update the showCodeDiffPreview function to properly handle code blocks
    function showCodeDiffPreview(newCode, startLine, endLine) {
        const editor = sourceEditor;
        const model = editor.getModel();
        const originalCode = model.getValue();
        const lines = originalCode.split('\n');
        
        // Normalize line endings and preserve formatting
        newCode = newCode.trim()
            .replace(/\r\n/g, '\n')
            .replace(/\\n/g, '\n')  // Handle escaped newlines
            .replace(/\n\s*\n/g, '\n\n'); // Normalize multiple newlines
        
        // Try to detect if this is a full file replacement or a specific block
        const isFullFile = newCode.includes('class') || 
                          newCode.includes('function') || 
                          newCode.includes('#include') ||
                          newCode.split('\n').length > 20;

        // If no line numbers were found, try to detect the location based on code similarity
        if (!startLine && !isFullFile) {
            const newLines = newCode.split('\n');
            let bestMatch = {
                line: 0,
                score: 0
            };

            // Look for the most similar line in the file
            for (let i = 0; i < lines.length; i++) {
                const similarity = calculateSimilarity(lines[i], newLines[0]);
                if (similarity > bestMatch.score) {
                    bestMatch.line = i + 1;
                    bestMatch.score = similarity;
                }
            }

            if (bestMatch.score > 0.5) {
                startLine = bestMatch.line;
                endLine = startLine + newLines.length - 1;
            }
        }

        // Prepare the replacement code and range
        let replacementRange;
        let originalForDiff;
        let modifiedForDiff;

        if (startLine && !isFullFile) {
            // For specific line(s) replacement
            endLine = endLine || startLine;
            replacementRange = new monaco.Range(
                startLine,
                1,
                endLine,
                lines[endLine - 1].length + 1
            );

            // Get the original block of code
            originalForDiff = lines.slice(startLine - 1, endLine).join('\n');
            
            // Ensure proper line endings in the new code
            modifiedForDiff = newCode.split('\n')
                .map(line => line.trimRight())  // Remove trailing spaces
                .join('\n');
        } else {
            // For full file replacement
            replacementRange = model.getFullModelRange();
            originalForDiff = originalCode;
            modifiedForDiff = newCode.split('\n')
                .map(line => line.trimRight())
                .join('\n');
        }

        // Create diff editor container
        const diffContainer = document.createElement('div');
        diffContainer.className = 'diff-preview-container';
        diffContainer.style.height = '400px';
        
        // Create diff editor with proper formatting options
        const diffEditor = monaco.editor.createDiffEditor(diffContainer, {
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            fontSize: fontSize,
            theme: 'vs-dark',
            automaticLayout: true,
            renderWhitespace: 'all',
            scrollBeyondLastLine: false,
            formatOnPaste: true,
            formatOnType: true
        });
        
        // Create models for diff editor with proper language detection
        const language = model.getLanguageId();
        const originalModel = monaco.editor.createModel(originalForDiff, language);
        const modifiedModel = monaco.editor.createModel(modifiedForDiff, language);
        
        // Format the code in both models
        setTimeout(() => {
            monaco.editor.getModelMarkers({}).forEach(marker => {
                if (marker.severity === monaco.MarkerSeverity.Error) {
                    console.log('Format error:', marker);
                }
            });
        }, 100);

        diffEditor.setModel({
            original: originalModel,
            modified: modifiedModel
        });
        
        // Create modal for diff preview
        const modal = document.createElement('div');
        modal.className = 'ui modal diff-preview-modal';
        modal.innerHTML = `
            <div class="header">
                <i class="exchange icon"></i> Preview Changes
                ${startLine && !isFullFile ? 
                    `<span class="line-info">(Lines ${startLine}${endLine > startLine ? `-${endLine}` : ''})</span>` : 
                    '<span class="line-info">(Full File)</span>'}
            </div>
            <div class="content"></div>
            <div class="actions">
                <div class="ui cancel button">Cancel</div>
                <div class="ui approve primary button">
                    <i class="check icon"></i> Apply Changes
                </div>
            </div>
        `;
        
        modal.querySelector('.content').appendChild(diffContainer);
        document.body.appendChild(modal);
        
        // Show modal with diff
        $(modal).modal({
            onShow: function() {
                setTimeout(() => {
                    diffEditor.layout();
                    // Try to format the code after layout
                    try {
                        monaco.editor.getAction('editor.action.formatDocument').run();
                    } catch (e) {
                        console.log('Format error:', e);
                    }
                }, 100);
            },
            onApprove: function() {
                try {
                    // Apply the changes with proper formatting
                    editor.executeEdits('ai-changes', [{
                        range: replacementRange,
                        text: modifiedForDiff
                    }]);
                    
                    // Add temporary highlight
                    const decoration = [{
                        range: replacementRange,
                        options: {
                            className: 'line-modify',
                            isWholeLine: true
                        }
                    }];
                    
                    const decorationIds = editor.deltaDecorations([], decoration);
                    
                    // Remove highlight after animation
                    setTimeout(() => {
                        editor.deltaDecorations(decorationIds, []);
                    }, 3000);
                    
                    // Format the document
                    setTimeout(() => {
                        editor.getAction('editor.action.formatDocument').run();
                    }, 100);
                    
                } catch (error) {
                    console.error('Error applying changes:', error);
                    alert('Error applying changes. Please try again.');
                }
                
                originalModel.dispose();
                modifiedModel.dispose();
            },
            onHidden: function() {
                originalModel.dispose();
                modifiedModel.dispose();
                modal.remove();
            }
        }).modal('show');
    }

    // Helper function to calculate similarity between two strings
    function calculateSimilarity(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = Array(len1 + 1).fill().map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        return 1 - (matrix[len1][len2] / Math.max(len1, len2));
    }
});

const DEFAULT_SOURCE = "\
#include <algorithm>\n\
#include <cstdint>\n\
#include <iostream>\n\
#include <limits>\n\
#include <set>\n\
#include <utility>\n\
#include <vector>\n\
\n\
using Vertex    = std::uint16_t;\n\
using Cost      = std::uint16_t;\n\
using Edge      = std::pair< Vertex, Cost >;\n\
using Graph     = std::vector< std::vector< Edge > >;\n\
using CostTable = std::vector< std::uint64_t >;\n\
\n\
constexpr auto kInfiniteCost{ std::numeric_limits< CostTable::value_type >::max() };\n\
\n\
auto dijkstra( Vertex const start, Vertex const end, Graph const & graph, CostTable & costTable )\n\
{\n\
    std::fill( costTable.begin(), costTable.end(), kInfiniteCost );\n\
    costTable[ start ] = 0;\n\
\n\
    std::set< std::pair< CostTable::value_type, Vertex > > minHeap;\n\
    minHeap.emplace( 0, start );\n\
\n\
    while ( !minHeap.empty() )\n\
    {\n\
        auto const vertexCost{ minHeap.begin()->first  };\n\
        auto const vertex    { minHeap.begin()->second };\n\
\n\
        minHeap.erase( minHeap.begin() );\n\
\n\
        if ( vertex == end )\n\
        {\n\
            break;\n\
        }\n\
\n\
        for ( auto const & neighbourEdge : graph[ vertex ] )\n\
        {\n\
            auto const & neighbour{ neighbourEdge.first };\n\
            auto const & cost{ neighbourEdge.second };\n\
\n\
            if ( costTable[ neighbour ] > vertexCost + cost )\n\
            {\n\
                minHeap.erase( { costTable[ neighbour ], neighbour } );\n\
                costTable[ neighbour ] = vertexCost + cost;\n\
                minHeap.emplace( costTable[ neighbour ], neighbour );\n\
            }\n\
        }\n\
    }\n\
\n\
    return costTable[ end ];\n\
}\n\
\n\
int main()\n\
{\n\
    constexpr std::uint16_t maxVertices{ 10000 };\n\
\n\
    Graph     graph    ( maxVertices );\n\
    CostTable costTable( maxVertices );\n\
\n\
    std::uint16_t testCases;\n\
    std::cin >> testCases;\n\
\n\
    while ( testCases-- > 0 )\n\
    {\n\
        for ( auto i{ 0 }; i < maxVertices; ++i )\n\
        {\n\
            graph[ i ].clear();\n\
        }\n\
\n\
        std::uint16_t numberOfVertices;\n\
        std::uint16_t numberOfEdges;\n\
\n\
        std::cin >> numberOfVertices >> numberOfEdges;\n\
\n\
        for ( auto i{ 0 }; i < numberOfEdges; ++i )\n\
        {\n\
            Vertex from;\n\
            Vertex to;\n\
            Cost   cost;\n\
\n\
            std::cin >> from >> to >> cost;\n\
            graph[ from ].emplace_back( to, cost );\n\
        }\n\
\n\
        Vertex start;\n\
        Vertex end;\n\
\n\
        std::cin >> start >> end;\n\
\n\
        auto const result{ dijkstra( start, end, graph, costTable ) };\n\
\n\
        if ( result == kInfiniteCost )\n\
        {\n\
            std::cout << \"NO\\n\";\n\
        }\n\
        else\n\
        {\n\
            std::cout << result << '\\n';\n\
        }\n\
    }\n\
\n\
    return 0;\n\
}\n\
";

const DEFAULT_STDIN = "\
3\n\
3 2\n\
1 2 5\n\
2 3 7\n\
1 3\n\
3 3\n\
1 2 4\n\
1 3 7\n\
2 3 1\n\
1 3\n\
3 1\n\
1 2 4\n\
1 3\n\
";

const DEFAULT_COMPILER_OPTIONS = "";
const DEFAULT_CMD_ARGUMENTS = "";
const DEFAULT_LANGUAGE_ID = 105; // C++ (GCC 14.1.0) (https://ce.judge0.com/languages/105)

function getEditorLanguageMode(languageName) {
    const DEFAULT_EDITOR_LANGUAGE_MODE = "plaintext";
    const LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE = {
        "Bash": "shell",
        "C": "c",
        "C3": "c",
        "C#": "csharp",
        "C++": "cpp",
        "Clojure": "clojure",
        "F#": "fsharp",
        "Go": "go",
        "Java": "java",
        "JavaScript": "javascript",
        "Kotlin": "kotlin",
        "Objective-C": "objective-c",
        "Pascal": "pascal",
        "Perl": "perl",
        "PHP": "php",
        "Python": "python",
        "R": "r",
        "Ruby": "ruby",
        "SQL": "sql",
        "Swift": "swift",
        "TypeScript": "typescript",
        "Visual Basic": "vb"
    }

    for (let key in LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE) {
        if (languageName.toLowerCase().startsWith(key.toLowerCase())) {
            return LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE[key];
        }
    }
    return DEFAULT_EDITOR_LANGUAGE_MODE;
}

const EXTENSIONS_TABLE = {
    "asm": { "flavor": CE, "language_id": 45 }, // Assembly (NASM 2.14.02)
    "c": { "flavor": CE, "language_id": 103 }, // C (GCC 14.1.0)
    "cpp": { "flavor": CE, "language_id": 105 }, // C++ (GCC 14.1.0)
    "cs": { "flavor": EXTRA_CE, "language_id": 29 }, // C# (.NET Core SDK 7.0.400)
    "go": { "flavor": CE, "language_id": 95 }, // Go (1.18.5)
    "java": { "flavor": CE, "language_id": 91 }, // Java (JDK 17.0.6)
    "js": { "flavor": CE, "language_id": 102 }, // JavaScript (Node.js 22.08.0)
    "lua": { "flavor": CE, "language_id": 64 }, // Lua (5.3.5)
    "pas": { "flavor": CE, "language_id": 67 }, // Pascal (FPC 3.0.4)
    "php": { "flavor": CE, "language_id": 98 }, // PHP (8.3.11)
    "py": { "flavor": EXTRA_CE, "language_id": 25 }, // Python for ML (3.11.2)
    "r": { "flavor": CE, "language_id": 99 }, // R (4.4.1)
    "rb": { "flavor": CE, "language_id": 72 }, // Ruby (2.7.0)
    "rs": { "flavor": CE, "language_id": 73 }, // Rust (1.40.0)
    "scala": { "flavor": CE, "language_id": 81 }, // Scala (2.13.2)
    "sh": { "flavor": CE, "language_id": 46 }, // Bash (5.0.0)
    "swift": { "flavor": CE, "language_id": 83 }, // Swift (5.2.3)
    "ts": { "flavor": CE, "language_id": 101 }, // TypeScript (5.6.2)
    "txt": { "flavor": CE, "language_id": 43 }, // Plain Text
};

function getLanguageForExtension(extension) {
    return EXTENSIONS_TABLE[extension] || { "flavor": CE, "language_id": 43 }; // Plain Text (https://ce.judge0.com/languages/43)
}
