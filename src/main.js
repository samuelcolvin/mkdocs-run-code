import Convert from 'ansi-to-html'
import './run_code.css'

const ansi_converter = new Convert()
const decoder = new TextDecoder();

document.querySelectorAll('.language-py pre').forEach((block) => {
  const btn = document.createElement('button')
  console.log('adding code to:', block)
  btn.className = 'run-code'
  btn.innerText = 'Run'
  btn.addEventListener('click', (e) => {
    run_block(e.target.parentNode.querySelector('code'))
  })
  block.appendChild(btn)
})

let terminal_output = '';

const query_args = new URLSearchParams(location.search);
query_args.set('ts', Date.now());

let output_el

const worker = new Worker(`./run_code_worker.min.js?${query_args.toString()}`);
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

async function run_block(el) {
  let python_code = el.innerText
  output_el = document.getElementById('output');
  output_el.innerText = 'Starting Python...';
  python_code = python_code.replace(new RegExp(`^ {8}`, 'gm'), '')
  console.log('running code:', python_code)
  worker.postMessage(python_code);
}
