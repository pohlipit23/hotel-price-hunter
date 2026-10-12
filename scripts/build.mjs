import {readFile,writeFile} from 'node:fs/promises';
const workerPath=new URL('../worker/index.js',import.meta.url);
const html=await readFile(new URL('../src/pitch.html',import.meta.url),'utf8');
const previous=await readFile(workerPath,'utf8');
const marker='const common=';
const index=previous.indexOf(marker);
if(index<0)throw new Error('Worker authentication implementation missing');
await writeFile(workerPath,'const html = '+JSON.stringify(html)+';\n'+previous.slice(index));
console.log('Updated Worker HTML from src/pitch.html');
