import { EditorView, minimalSetup } from 'codemirror'
import { indentUnit } from '@codemirror/language'
import { lineNumbers } from '@codemirror/view'
import { python } from '@codemirror/lang-python'
import Convert from 'ansi-to-html'
import './run_code.css'

function load_css(): Promise<void> {
  return new Promise((resolve) => {
    const head = document.head
    const link = document.createElement('link')
    link.type = 'text/css'
    link.rel = 'stylesheet'
    const srcEl: HTMLScriptElement | null = document.querySelector(
      'script[src*="run_code_main.js"]',
    )
    if (srcEl) {
      const srcUrl = srcEl.src
      link.href = srcUrl.replace(/\.js$/, '.css')
      head.appendChild(link)
      link.addEventListener('load', () => resolve())
    } else {
      throw new Error('could not find script tag for `run_code_main.js`.')
    }
  })
}
load_css()

function startWorker(): Worker {
  const query_args = new URLSearchParams(location.search)
  query_args.set('ts', Date.now().toString())
  return new Worker(`./dist/run_code_worker.js?${query_args.toString()}`)
}
const worker = startWorker()
const ansi_converter = new Convert()
const decoder = new TextDecoder()

declare global {
  interface Window {
    code_blocks: CodeBlock[]
  }
}

async function main() {
  await load_css()
  window.code_blocks = []
  document.querySelectorAll('.language-py').forEach((block) => {
    window.code_blocks.push(new CodeBlock(block))
  })
}
main()

class CodeBlock {
  readonly block: Element
  terminal_output = ''
  code_html = ''
  output_el: HTMLElement | null = null
  readonly resetBtn: HTMLElement
  readonly preEl: HTMLElement
  readonly codeEl: HTMLElement
  readonly onMessage: ({ data }: { data: string | Uint8Array[] }) => void
  active = false

  constructor(block: Element) {
    this.block = block
    const pre = block.querySelector('pre') as HTMLElement

    const playBtn = document.createElement('button')
    playBtn.className = 'run-code-btn play-btn'
    playBtn.addEventListener('click', this.run.bind(this))
    pre.appendChild(playBtn)

    this.resetBtn = document.createElement('button')
    this.resetBtn.className = 'run-code-btn reset-btn run-code-hidden'
    this.resetBtn.addEventListener('click', this.reset.bind(this))
    pre.appendChild(this.resetBtn)

    const preEl = block.querySelector('pre')
    if (!preEl) {
      throw new Error('could not find `pre` element in code block')
    }
    this.preEl = preEl
    const codeEl = preEl.querySelector('code')
    if (!codeEl) {
      throw new Error('could not find `code` element in code block `pre`')
    }
    this.codeEl = codeEl

    this.onMessage = this.onMessageMethod.bind(this)
  }

  run() {
    const cmElement = this.block.querySelector('.cm-content')
    let python_code
    if (cmElement) {
      const view = (cmElement as any).cmView.view as EditorView
      python_code = view.state.doc.toString()
    } else {
      this.preEl.classList.add('hide-code')
      python_code = this.codeEl.innerText
      this.code_html = this.codeEl.innerHTML
      this.codeEl.classList.add('hide-code')
      this.codeEl.innerText = ''

      new EditorView({
        extensions: [
          minimalSetup,
          lineNumbers(),
          python(),
          indentUnit.of('    '),
        ],
        parent: this.block,
        doc: python_code,
      })
    }

    this.resetBtn.classList.remove('run-code-hidden')

    this.terminal_output = ''
    this.output_el = this.block.querySelector('.run-code-output')
    if (!this.output_el) {
      const output_div = document.createElement('div')
      output_div.className = 'highlight output-parent'
      output_div.innerHTML = `
      <span class="filename run-code-title">Output</span>
      <pre id="__code_0"><code class="run-code-output"></code></pre>
      `
      this.block.appendChild(output_div)
      this.output_el = this.block.querySelector(
        '.run-code-output',
      ) as HTMLElement
    }
    this.output_el.innerText = 'Starting Python and installing dependencies...'
    python_code = python_code.replace(new RegExp(`^ {8}`, 'gm'), '')

    if (!this.active) {
      worker.addEventListener('message', this.onMessage)
      this.active = true
    }

    // reset other code blocks
    for (const block of window.code_blocks) {
      if (block != this) {
        if (block.active) {
          block.reset()
        }
      }
    }

    worker.postMessage(python_code)
  }

  reset() {
    const cmElement = this.block.querySelector('.cm-editor')
    if (cmElement) {
      cmElement.remove()
    }
    const output_parent = this.block.querySelector('.output-parent')
    if (output_parent) {
      output_parent.remove()
    }

    this.preEl.classList.remove('hide-code')
    this.codeEl.innerHTML = this.code_html
    this.codeEl.classList.remove('hide-code')

    this.resetBtn.classList.add('run-code-hidden')

    if (this.active) {
      worker.removeEventListener('message', this.onMessage)
      this.active = false
    }
  }

  onMessageMethod({ data }: { data: string | Uint8Array[] }) {
    if (typeof data == 'string') {
      this.terminal_output += data
    } else {
      for (const chunk of data) {
        const arr = new Uint8Array(chunk)
        const extra = decoder.decode(arr)
        this.terminal_output += extra
      }
    }
    const output_el = this.output_el
    if (output_el) {
      output_el.innerHTML = ansi_converter.toHtml(this.terminal_output)
      // scrolls to the bottom of the div
      output_el.scrollIntoView(false)
    }
  }
}
