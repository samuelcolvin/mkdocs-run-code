import {EditorView, basicSetup} from 'codemirror'
import { indentUnit } from '@codemirror/language'
import {python} from '@codemirror/lang-python'
import Convert from 'ansi-to-html'
import './run_code.css'

function load_css() {
  const head = document.head;
  const link = document.createElement('link');
  link.type = 'text/css';
  link.rel = 'stylesheet';
  const srcEl: HTMLScriptElement | null = document.querySelector('script[src*="run_code_main.js"]')
  if (srcEl) {
    const srcUrl = srcEl.src
    link.href = srcUrl.replace(/\.js$/, '.min.css');
    head.appendChild(link);
  } else {
    throw new Error('could not find script tag for `run_code_main.js`.')
  }
}
load_css()


document.querySelectorAll('.language-py pre').forEach((block) => {
  const btn = document.createElement('button')
  // console.log('adding code to:', block)
  btn.className = 'run-code'
  btn.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.parentNode) {
      run_block(target.parentNode as HTMLElement)
    }
  })
  block.appendChild(btn)
})

let terminal_output = '';

const query_args = new URLSearchParams(location.search);
query_args.set('ts', Date.now().toString());

let output_el: HTMLElement | null = null
const ansi_converter = new Convert()
const decoder = new TextDecoder();

const worker = new Worker(`./dist/run_code_worker.js?${query_args.toString()}`);
worker.onmessage = ({data}) => {
  if (typeof data == 'string') {
    terminal_output += data;
  } else {
    for (const chunk of data) {
      const arr = new Uint8Array(chunk);
      const extra = decoder.decode(arr);
      terminal_output += extra;
    }
  }
  if (output_el) {
    output_el.innerHTML = ansi_converter.toHtml(terminal_output);
    // scrolls to the bottom of the div
    output_el.scrollIntoView(false);
  }
}

function run_block(block_root: HTMLElement) {
  const cmElement = block_root.querySelector('.cm-content')
  let python_code
  if (cmElement) {
    const view = (cmElement as any).cmView.view as EditorView
    python_code = view.state.doc.toString()
  } else {
    const pre_el = block_root.querySelector('code')
    if (!pre_el) {
      throw new Error('could not find `code` element')
    }
    python_code = pre_el.innerText
    pre_el.innerHTML = ''

    new EditorView({
      extensions: [basicSetup, python(), indentUnit.of('    ')],
      parent: block_root,
      doc: python_code,
    })
  }

  terminal_output = '';
  output_el = document.getElementById('output');
  if (!output_el) {
    throw new Error('could not find `#output` element')
  }
  output_el.innerText = 'Starting Python and installing dependencies...';
  python_code = python_code.replace(new RegExp(`^ {8}`, 'gm'), '')
  worker.postMessage(python_code);
}
