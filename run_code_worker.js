"use strict";
(() => {
  // src/pyodide.ts
  async function downloadPyodide() {
    await importScripts(
      "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
    );
    return await loadPyodide();
  }
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
      }
    };
  }
  function setupStreams(FS, tty, onPrint) {
    const mytty = FS.makedev(FS.createDevice.major++, 0);
    const myttyerr = FS.makedev(FS.createDevice.major++, 0);
    tty.register(mytty, make_tty_ops(onPrint));
    tty.register(myttyerr, make_tty_ops(onPrint));
    FS.mkdev("/dev/mytty", mytty);
    FS.mkdev("/dev/myttyerr", myttyerr);
    FS.unlink("/dev/stdin");
    FS.unlink("/dev/stdout");
    FS.unlink("/dev/stderr");
    FS.symlink("/dev/mytty", "/dev/stdin");
    FS.symlink("/dev/mytty", "/dev/stdout");
    FS.symlink("/dev/myttyerr", "/dev/stderr");
    FS.closeStream(0);
    FS.closeStream(1);
    FS.closeStream(2);
    FS.open("/dev/stdin", 0);
    FS.open("/dev/stdout", 1);
    FS.open("/dev/stderr", 1);
  }
  function preparePyodide(pyodide, onPrint) {
    const { FS } = pyodide;
    setupStreams(FS, pyodide._module.TTY, onPrint);
  }

  // src/worker.ts
  var chunks = [];
  var lastPost = 0;
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
    console.debug("log:", msg);
    self.postMessage(msg + "\n");
  }
  var _pyodideWrapper = null;
  async function load() {
    if (_pyodideWrapper === null) {
      console.debug("Downloading pyodide...");
      const pyodide = await downloadPyodide();
      preparePyodide(pyodide, print);
      console.debug("Loading micropip...");
      await pyodide.loadPackage(["micropip"]);
      const micropip = pyodide.pyimport("micropip");
      const pydantic_core_version = "2.6.3";
      const pydantic_version = "2.3.0";
      console.debug("Installing pydantic-core...");
      const pydantic_core_wheel = `https://githubproxy.samuelcolvin.workers.dev/pydantic/pydantic-core/releases/download/v${pydantic_core_version}/pydantic_core-${pydantic_core_version}-cp311-cp311-emscripten_3_1_32_wasm32.whl`;
      await micropip.install([pydantic_core_wheel]);
      console.debug("Installing pydantic...");
      await micropip.install([`pydantic==${pydantic_version}`]);
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
`
      );
      _pyodideWrapper = {
        pyodide,
        reformatException: pyodide.globals.get("reformat_exception")
      };
    }
    return _pyodideWrapper;
  }
  self.onmessage = async (event) => {
    let py;
    try {
      py = await load();
    } catch (e) {
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
    } catch (e) {
      post();
      log(py.reformatException());
      return;
    }
    post();
  };
})();
