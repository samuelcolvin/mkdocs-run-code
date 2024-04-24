"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCode = void 0;
const pyodide_1 = require("./pyodide");
const chunks = [];
let lastPost = 0;
let updateOut = null;
const decoder = new TextDecoder();
function print(tty) {
    if (tty.output && tty.output.length > 0) {
        const arr = new Uint8Array(tty.output);
        chunks.push(decoder.decode(arr));
        tty.output.length = 0;
        const now = performance.now();
        if (now - lastPost > 100) {
            update();
            lastPost = now;
        }
    }
}
function update() {
    if (updateOut) {
        updateOut(chunks);
    }
    chunks.length = 0;
}
function log(msg) {
    console.debug('log:', msg);
    if (updateOut) {
        updateOut([msg + '\n']);
    }
}
let _pyodideWrapper = null;
async function load(dependencies) {
    if (_pyodideWrapper === null) {
        console.debug('Downloading pyodide...');
        const pyodide = await (0, pyodide_1.downloadPyodide)();
        (0, pyodide_1.preparePyodide)(pyodide, print);
        console.debug('Loading micropip...');
        await pyodide.loadPackage(['micropip']);
        const micropip = pyodide.pyimport('micropip');
        // pydantic-core requires special handling as it's installed from the file on the github release
        const pydantic_core_dep = dependencies.find(d => d.startsWith('pydantic-core'));
        if (pydantic_core_dep) {
            const pyd_c = pydantic_core_dep.split('==')[1];
            const { platform } = pyodide._api.lockfile_info;
            console.debug('Installing pydantic-core...');
            const pydantic_core_wheel = `https://githubproxy.samuelcolvin.workers.dev/pydantic/pydantic-core/releases/download/v${pyd_c}/pydantic_core-${pyd_c}-cp311-cp311-${platform}.whl`;
            await micropip.install([pydantic_core_wheel]);
        }
        const other_deps = dependencies.filter(d => !d.startsWith('pydantic-core'));
        console.debug(`Installing ${other_deps}...`);
        await micropip.install(other_deps);
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
async function runCode(code, onMessage, dependencies) {
    updateOut = onMessage;
    let py;
    try {
        py = await load(dependencies);
    }
    catch (e) {
        update();
        log(`Error starting Python: ${e}`);
        updateOut = null;
        throw e;
    }
    await py.pyodide.runPythonAsync(`
import pydantic, pydantic_core
print(f'pydantic version: v{pydantic.__version__}, pydantic-core version: v{pydantic_core.__version__}')
`);
    try {
        await py.pyodide.runPythonAsync(code);
        update();
    }
    catch (e) {
        update();
        log(py.reformatException());
    }
    updateOut = null;
}
exports.runCode = runCode;
//# sourceMappingURL=run_python.js.map