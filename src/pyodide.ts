interface TTYOps {
  put_char: (tty: TTY, val: number | null) => void
  fsync: (tty: TTY) => void
}

export interface TTY {
  output: number[]
  register: (dev: number, ops: TTYOps) => void
}

interface PyodideFileSystem {
  makedev: (major: number, minor: number) => number
  createDevice: { major: number }
  mkdev: (path: string, mode: number) => void
  unlink: (path: string) => void
  symlink: (oldpath: string, newpath: string) => void
  closeStream: (fd: number) => void
  open: (path: string, flags: number) => number
}

interface PyodideModule {
  TTY: TTY
}

interface MicroPip {
  install: (wheels: string[]) => Promise<void>
}

export interface Pyodide {
  _module: PyodideModule
  FS: PyodideFileSystem
  loadPackage: (packages: string[]) => Promise<void>
  pyimport: (name: string) => MicroPip
  runPythonAsync: (code: string) => Promise<void>
  globals: Map<string, any>
}

declare const importScripts: (url: string) => Promise<void>
declare const loadPyodide: () => Promise<Pyodide>

export async function downloadPyodide(): Promise<Pyodide> {
  await importScripts(
    'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js',
  )
  return await loadPyodide()
}

type OnPrint = (data: TTY) => void

function make_tty_ops(onPrint: OnPrint): TTYOps {
  return {
    put_char(tty: TTY, val: number | null) {
      if (val !== null) {
        tty.output.push(val)
      }
      if (val === null || val === 10) {
        onPrint(tty)
      }
    },
    fsync(tty: TTY) {
      onPrint(tty)
    },
  }
}

function setupStreams(FS: PyodideFileSystem, tty: TTY, onPrint: OnPrint) {
  const mytty = FS.makedev(FS.createDevice.major++, 0)
  const myttyerr = FS.makedev(FS.createDevice.major++, 0)
  tty.register(mytty, make_tty_ops(onPrint))
  tty.register(myttyerr, make_tty_ops(onPrint))
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

export function preparePyodide(pyodide: Pyodide, onPrint: OnPrint): void {
  const { FS } = pyodide
  setupStreams(FS, pyodide._module.TTY, onPrint)
}
