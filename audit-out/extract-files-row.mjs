import fs from 'node:fs';
const x = JSON.parse(fs.readFileSync('audit-out/hook-self-heal-files-current.json', 'utf8'));
for (const term of ['HTTP hook-service','CORE024_hook-review.feature']) {
 const i=x.content.indexOf(term); console.log(term,i,JSON.stringify(x.content.slice(i-120,i+700)));
}
