let chunks = []
let last_post = 0

function print(tty) {
  if (tty.output && tty.output.length > 0) {
    chunks.push(tty.output)
    tty.output = []
    const now = performance.now()
    if (now - last_post > 100) {
      post()
      last_post = now
    }
  }
}

function post() {
  self.postMessage(chunks)
  chunks = []
}

function make_tty_ops() {
  return {
    put_char(tty, val) {
      if (val !== null) {
        tty.output.push(val)
      }
      if (val === null || val === 10) {
        print(tty)
      }
    },
    fsync(tty) {
      print(tty)
    },
  }
}

function setupStreams(FS, TTY) {
  let mytty = FS.makedev(FS.createDevice.major++, 0)
  let myttyerr = FS.makedev(FS.createDevice.major++, 0)
  TTY.register(mytty, make_tty_ops())
  TTY.register(myttyerr, make_tty_ops())
  FS.mkdev('/dev/mytty', mytty)
  FS.mkdev('/dev/myttyerr', myttyerr)
  FS.unlink('/dev/stdin')
  FS.unlink('/dev/stdout')
  FS.unlink('/dev/stderr')
  FS.symlink('/dev/mytty', '/dev/stdin')
  FS.symlink('/dev/mytty', '/dev/stdout')
  FS.symlink('/dev/myttyerr', '/dev/stderr')
  FS.closeStream(0)
  FS.closeStream(1)
  FS.closeStream(2)
  FS.open('/dev/stdin', 0)
  FS.open('/dev/stdout', 1)
  FS.open('/dev/stderr', 1)
}

let reformat_exception = null

const log = (msg) => {
  console.debug('log:', msg)
  self.postMessage(msg + '\n')
}

async function load() {
  if (reformat_exception === null) {
    console.debug('Downloading pyodide...')
    await importScripts(
      'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js',
    )

    console.debug('Loading pyodide...')
    pyodide = await loadPyodide()
    const { FS } = pyodide
    setupStreams(FS, pyodide._module.TTY)

    console.debug('Loading micropip...')
    await pyodide.loadPackage(['micropip'])
    const micropip = pyodide.pyimport('micropip')

    const pydantic_core_version = '2.6.3'
    const pydantic_version = '2.3.0'
    console.debug('Installing pydantic-core...')
    const pydantic_core_wheel = `https://githubproxy.samuelcolvin.workers.dev/pydantic/pydantic-core/releases/download/v${pydantic_core_version}/pydantic_core-${pydantic_core_version}-cp311-cp311-emscripten_3_1_32_wasm32.whl`
    await micropip.install([pydantic_core_wheel])

    console.debug('Installing pydantic...')
    // const query_args = new URLSearchParams(location.search);
    // console.log('query args:', query_args);
    await micropip.install([`pydantic==${pydantic_version}`]) // TODO use query_args`

    pyodide.runPython(
      // language=Python
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
`,
    )

    reformat_exception = pyodide.globals.get('reformat_exception')
  }
}

self.onmessage = async (event) => {
  try {
    await load()
  } catch (e) {
    post()
    log(`Error starting Python: ${e}`)
    return
  }
  await pyodide.runPythonAsync(`
import pydantic, pydantic_core
print(f'pydantic version: v{pydantic.__version__}, pydantic-core version: v{pydantic_core.__version__}')
`)
  try {
    await pyodide.runPythonAsync(event.data)
  } catch (e) {
    post()
    log(reformat_exception())
    return
  }
  post()
}
