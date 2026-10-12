import {readFile,writeFile} from 'node:fs/promises';
const files={
  original:'src/pitch.html',
  poster:'src/poster.html',
  found:'src/found.html',
  vista:'src/vista.html',
  loginOriginal:'src/login-original.html',
  loginPoster:'src/login-poster.html',
  loginFound:'src/login-found.html',
  loginVista:'src/login-vista.html'
};
const pages={};
for(const [key,path] of Object.entries(files)){
  pages[key]=await readFile(new URL('../'+path,import.meta.url),'utf8');
}
const workerPath=new URL('../worker/index.js',import.meta.url);
const previous=await readFile(workerPath,'utf8');
const marker='const common=';
const index=previous.indexOf(marker);
if(index<0)throw new Error('Worker authentication implementation missing');
await writeFile(workerPath,'const pages = '+JSON.stringify(pages)+';\n'+previous.slice(index));
console.log('Updated Worker HTML from src/*.html');
