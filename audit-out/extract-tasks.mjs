import fs from 'node:fs'; const x=JSON.parse(fs.readFileSync('audit-out/hook-self-heal-tasks.json','utf8')); const i=x.content.indexOf('id: t15'); console.log(x.content.slice(i-100,i+1600));
