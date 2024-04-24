"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preparePyodide = exports.downloadPyodide = void 0;
function importScripts(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => reject();
        document.head.appendChild(script);
    });
}
async function downloadPyodide() {
    await importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js');
    return await loadPyodide();
}
exports.downloadPyodide = downloadPyodide;
function make_tty_ops(onPrint) {
    return {
        put_char(tty, val) {
            if (val !== null) {
                tty.output.push(val);
            }
            if (val === null || val === 10) {
                onPrint(tty);
            }
        },
        fsync(tty) {
            onPrint(tty);
        },
    };
}
function setupStreams(FS, tty, onPrint) {
    const mytty = FS.makedev(FS.createDevice.major++, 0);
    const myttyerr = FS.makedev(FS.createDevice.major++, 0);
    tty.register(mytty, make_tty_ops(onPrint));
    tty.register(myttyerr, make_tty_ops(onPrint));
    FS.mkdev('/dev/mytty', mytty);
    FS.mkdev('/dev/myttyerr', myttyerr);
    FS.unlink('/dev/stdin');
    FS.unlink('/dev/stdout');
    FS.unlink('/dev/stderr');
    FS.symlink('/dev/mytty', '/dev/stdin');
    FS.symlink('/dev/mytty', '/dev/stdout');
    FS.symlink('/dev/myttyerr', '/dev/stderr');
    FS.closeStream(0);
    FS.closeStream(1);
    FS.closeStream(2);
    FS.open('/dev/stdin', 0);
    FS.open('/dev/stdout', 1);
    FS.open('/dev/stderr', 1);
}
function preparePyodide(pyodide, onPrint) {
    const { FS } = pyodide;
    setupStreams(FS, pyodide._module.TTY, onPrint);
}
exports.preparePyodide = preparePyodide;
//# sourceMappingURL=pyodide.js.map