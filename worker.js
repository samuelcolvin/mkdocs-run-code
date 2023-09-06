"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pyodide_1 = require("./pyodide");
const chunks = [];
let lastPost = 0;
function print(tty) {
    if (tty.output && tty.output.length > 0) {
        chunks.push(tty.output);
        tty.output = [];
        const now = performance.now();
        if (now - lastPost > 100) {
            post();
            lastPost = now;
        }
    }
}
function post() {
    self.postMessage(chunks);
    chunks.length = 0;
}
function log(msg) {
    console.debug('log:', msg);
    self.postMessage(msg + '\n');
}
let _pyodideWrapper = null;
async function load() {
    if (_pyodideWrapper === null) {
        console.debug('Downloading pyodide...');
        const pyodide = await (0, pyodide_1.downloadPyodide)();
        (0, pyodide_1.preparePyodide)(pyodide, print);
        console.debug('Loading micropip...');
        await pyodide.loadPackage(['micropip']);
        const micropip = pyodide.pyimport('micropip');
        const pydantic_core_version = '2.6.3';
        const pydantic_version = '2.3.0';
        console.debug('Installing pydantic-core...');
        const pydantic_core_wheel = `https://githubproxy.samuelcolvin.workers.dev/pydantic/pydantic-core/releases/download/v${pydantic_core_version}/pydantic_core-${pydantic_core_version}-cp311-cp311-emscripten_3_1_32_wasm32.whl`;
        await micropip.install([pydantic_core_wheel]);
        console.debug('Installing pydantic...');
        // const query_args = new URLSearchParams(location.search);
        // console.log('query args:', query_args);
        await micropip.install([`pydantic==${pydantic_version}`]); // TODO use query_args`
        await pyodide.runPythonAsync(
        // language=python
        `
def reformat_exception():
    import sys
    from traceback import format_exception
    # Format a modified exception here
    # this just prints it normally but you could for instance filter some frames
    lines = format_exception(sys.last_type, sys.last_value, sys.last_traceback)
    # remove the traceback line about running pyodide
    lines.pop(1)
    lines.pop(1)
    return ''.join(lines)
`);
        _pyodideWrapper = {
            pyodide,
            reformatException: pyodide.globals.get('reformat_exception'),
        };
    }
    return _pyodideWrapper;
}
self.onmessage = async (event) => {
    let py;
    try {
        py = await load();
    }
    catch (e) {
        post();
        log(`Error starting Python: ${e}`);
        throw e;
    }
    await py.pyodide.runPythonAsync(`
import pydantic, pydantic_core
print(f'pydantic version: v{pydantic.__version__}, pydantic-core version: v{pydantic_core.__version__}')
`);
    try {
        await py.pyodide.runPythonAsync(event.data);
    }
    catch (e) {
        post();
        log(py.reformatException());
        return;
    }
    post();
};
//# sourceMappingURL=worker.js.map