import { downloadPyodide, preparePyodide, TTY, Pyodide } from './pyodide'

const chunks: string[] = []
let lastPost = 0
let updateOut: ((data: string[]) => void) | null = null
const decoder = new TextDecoder()

function print(tty: TTY) {
  if (tty.output && tty.output.length > 0) {
    const arr = new Uint8Array(tty.output)
    chunks.push(decoder.decode(arr))
    tty.output.length = 0
    const now = performance.now()
    if (now - lastPost > 100) {
      update()
      lastPost = now
    }
  }
}

function update() {
  if (updateOut) {
    updateOut(chunks)
  }
  chunks.length = 0
}

function log(msg: string) {
  console.debug('log:', msg)
  if (updateOut) {
    updateOut([msg + '\n'])
  }
}

interface PyodideWrapper {
  pyodide: Pyodide
  reformatException: () => string
}

let _pyodideWrapper: PyodideWrapper | null = null

async function load() {
  if (_pyodideWrapper === null) {
    console.debug('Downloading pyodide...')

    const pyodide = await downloadPyodide()
    preparePyodide(pyodide, print)

    console.debug('Loading micropip...')
    await pyodide.loadPackage(['micropip'])
    const micropip = pyodide.pyimport('micropip')

    const pydantic_core_version = '2.10.0'
    const pydantic_version = '2.4.0'
    console.debug('Installing pydantic-core...')
    const pydantic_core_wheel = `https://githubproxy.samuelcolvin.workers.dev/pydantic/pydantic-core/releases/download/v${pydantic_core_version}/pydantic_core-${pydantic_core_version}-cp311-cp311-emscripten_3_1_32_wasm32.whl`
    await micropip.install([pydantic_core_wheel])

    console.debug('Installing pydantic...')
    // const query_args = new URLSearchParams(location.search);
    // console.log('query args:', query_args);
    await micropip.install([`pydantic==${pydantic_version}`]) // TODO use query_args`

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
`,
    )
    _pyodideWrapper = {
      pyodide,
      reformatException: pyodide.globals.get('reformat_exception'),
    }
  }
  return _pyodideWrapper
}

export async function runCode(
  code: string,
  onMessage: (data: string[]) => void,
): Promise<void> {
  updateOut = onMessage
  let py: PyodideWrapper
  try {
    py = await load()
  } catch (e) {
    update()
    log(`Error starting Python: ${e}`)
    updateOut = null
    throw e
  }
  await py.pyodide.runPythonAsync(`
import pydantic, pydantic_core
print(f'pydantic version: v{pydantic.__version__}, pydantic-core version: v{pydantic_core.__version__}')
`)
  try {
    await py.pyodide.runPythonAsync(code)
    update()
  } catch (e) {
    update()
    log(py.reformatException())
  }
  updateOut = null
}
