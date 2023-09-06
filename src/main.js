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
  const srcEl = document.querySelector('script[src*="run_code_main.min.js"]')
  let srcUrl = srcEl.src
  link.href = srcUrl.replace(/\.js$/, '.css');
  head.appendChild(link);
}
load_css()


document.querySelectorAll('.language-py pre').forEach((block) => {
  const btn = document.createElement('button')
  // console.log('adding code to:', block)
  btn.className = 'run-code'
  btn.addEventListener('click', (e) => {
    run_block(e.target.parentNode)
  })
  block.appendChild(btn)
})

let terminal_output = '';

const query_args = new URLSearchParams(location.search);
query_args.set('ts', Date.now());

let output_el
const ansi_converter = new Convert()
const decoder = new TextDecoder();

const worker = new Worker(`./dist/run_code_worker.min.js?${query_args.toString()}`);
worker.onmessage = ({data}) => {
  if (typeof data == 'string') {
    terminal_output += data;
  } else {
    for (let chunk of data) {
      let arr = new Uint8Array(chunk);
      let extra = decoder.decode(arr);
      terminal_output += extra;
    }
  }
  output_el.innerHTML = ansi_converter.toHtml(terminal_output);
  // scrolls to the bottom of the div
  output_el.scrollIntoView(false);
};

function run_block(block_root) {
  const cm_el = block_root.querySelector('.cm-content')
  let python_code
  if (cm_el) {
    python_code = cm_el.cmView.view.state.doc.toString()
  } else {
    let pre_el = block_root.querySelector('code')
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
  output_el.innerText = 'Starting Python and installing dependencies...';
  python_code = python_code.replace(new RegExp(`^ {8}`, 'gm'), '')
  worker.postMessage(python_code);
}
