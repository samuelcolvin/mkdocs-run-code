import { EditorView, minimalSetup } from 'codemirror'
import { indentUnit } from '@codemirror/language'
import { lineNumbers } from '@codemirror/view'
import { python } from '@codemirror/lang-python'
import Convert from 'ansi-to-html'
import './run_code.css'

function load_css() {
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
  } else {
    throw new Error('could not find script tag for `run_code_main.js`.')
  }
}
load_css()

document.querySelectorAll('.language-py').forEach((block) => {
  const btn = document.createElement('button')
  // console.log('adding code to:', block)
  btn.className = 'run-code-btn'
  btn.addEventListener('click', () => run_block(block))
  const pre = block.querySelector('pre') as HTMLElement
  pre.appendChild(btn)
})

let terminal_output = ''

const query_args = new URLSearchParams(location.search)
query_args.set('ts', Date.now().toString())

let output_el: HTMLElement | null = null
const ansi_converter = new Convert()
const decoder = new TextDecoder()

const worker = new Worker(`./dist/run_code_worker.js?${query_args.toString()}`)
worker.onmessage = ({ data }) => {
  if (typeof data == 'string') {
    terminal_output += data
  } else {
    for (const chunk of data) {
      const arr = new Uint8Array(chunk)
      const extra = decoder.decode(arr)
      terminal_output += extra
    }
  }
  if (output_el) {
    output_el.innerHTML = ansi_converter.toHtml(terminal_output)
    // scrolls to the bottom of the div
    output_el.scrollIntoView(false)
  }
}

function run_block(block_root: Element) {
  const cmElement = block_root.querySelector('.cm-content')
  let python_code
  if (cmElement) {
    const view = (cmElement as any).cmView.view as EditorView
    python_code = view.state.doc.toString()
  } else {
    const pre_el = block_root.querySelector('pre')
    if (!pre_el) {
      throw new Error('could not find `pre` element in code block')
    }
    pre_el.classList.add('hide-code')
    const code_el = pre_el.querySelector('code')
    if (!code_el) {
      throw new Error('could not find `code` element in code block `pre`')
    }
    python_code = code_el.innerText
    code_el.classList.add('hide-code')
    code_el.innerText = ''

    new EditorView({
      extensions: [minimalSetup, lineNumbers(), python(), indentUnit.of('    ')],
      parent: block_root,
      doc: python_code,
    })
  }

  terminal_output = ''
  output_el = block_root.querySelector('.run-code-output')
  if (!output_el) {
    const output_div = document.createElement('div')
    output_div.className = 'highlight'
    output_div.innerHTML = `
    <span class="filename run-code-title">Output</span>
    <pre id="__code_0"><code class="run-code-output"></code></pre>
    `
    block_root.appendChild(output_div)
    output_el = block_root.querySelector('.run-code-output') as HTMLElement
  }
  output_el.innerText = 'Starting Python and installing dependencies...'
  python_code = python_code.replace(new RegExp(`^ {8}`, 'gm'), '')
  worker.postMessage(python_code)
}
