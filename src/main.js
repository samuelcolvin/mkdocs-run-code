import {EditorView, basicSetup} from 'codemirror'
import {python} from '@codemirror/lang-python'
import Convert from 'ansi-to-html'
import './run_code.css'

const ansi_converter = new Convert()
const decoder = new TextDecoder();

// add th required styles to the page
const head = document.head;
const link = document.createElement('link');
link.type = 'text/css';
link.rel = 'stylesheet';
link.href = './dist/run_code.css';
head.appendChild(link);


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
  console.log('terminal_output:', terminal_output)
  output_el.innerHTML = ansi_converter.toHtml(terminal_output);
  // scrolls to the bottom of the div
  output_el.scrollIntoView(false);
};

async function run_block(block_root) {
  let pre_el = block_root.querySelector('code')
  let python_code = pre_el.innerText
  pre_el.innerHTML = ''

  let editor = new EditorView({
    extensions: [basicSetup, python()],
    parent: block_root,
    doc: python_code,
  })

  terminal_output = '';
  output_el = document.getElementById('output');
  output_el.innerText = 'Starting Python...';
  python_code = python_code.replace(new RegExp(`^ {8}`, 'gm'), '')
  worker.postMessage(python_code);
}
