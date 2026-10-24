// One command for both servers, works on Windows/Mac/Linux:  npm start  |  npm run start:remote  |  npm run start:real
import { spawn, spawnSync } from 'node:child_process'

const mode = process.argv[2] || 'mock'
const py = ['python3', 'python', 'py'].find((c) => spawnSync(c, ['--version']).status === 0)
if (!py) { console.error('Python 3 not found. Install it from https://www.python.org/downloads/ and tick "Add to PATH".'); process.exit(1) }

const mods = mode === 'remote' ? ['flask', 'PIL', 'gradio_client'] : ['flask', 'PIL']
const pkgs = mode === 'remote' ? ['flask', 'pillow', 'gradio_client'] : ['flask', 'pillow']
if (spawnSync(py, ['-c', `import ${mods.join(',')}`]).status !== 0) {
  console.log('Installing Python packages:', pkgs.join(' '))
  if (spawnSync(py, ['-m', 'pip', 'install', ...pkgs], { stdio: 'inherit' }).status !== 0) process.exit(1)
}

const env = { ...process.env, VTON_MODE: mode }
const kids = [
  spawn(py, ['vton-server/server.py'], { stdio: 'inherit', env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], { stdio: 'inherit', env }),
]
console.log('\n>>> Open http://localhost:5173/tryon/ in your browser\n')
const stop = () => kids.forEach((k) => k.kill())
process.on('SIGINT', stop); process.on('exit', stop)
kids.forEach((k) => k.on('exit', () => { stop(); process.exit() }))
