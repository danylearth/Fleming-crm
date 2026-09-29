const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
for(const file of ['tenants-subdomain/signature-editor.js','frontend/src/utils/signatureEditor.js']) {
  test(`${file}: crop keeps artwork dimensions and a consistent border`,()=>{
    const pixels=new Uint8ClampedArray(8*6*4);
    for(const [x,y] of [[2,1],[5,3]])pixels[(y*8+x)*4+3]=255;
    const calls=[];
    const output={width:0,height:0,getContext:()=>({drawImage:(...args)=>calls.push(args)})};
    const context=vm.createContext({document:{createElement:()=>output}});
    vm.runInContext(fs.readFileSync(file,'utf8').split('export function signatureEditor')[0].replace('export function','function'),context);
    const source={width:8,height:6,getContext:()=>({getImageData:()=>({data:pixels})})};
    assert.equal(context.cropSignatureCanvas(source),output);
    assert.equal(output.width,28);assert.equal(output.height,27);
    assert.deepEqual(calls[0].slice(1),[2,1,4,3,12,12,4,3]);
    pixels.fill(0);assert.equal(context.cropSignatureCanvas(source),source);
  });
}
