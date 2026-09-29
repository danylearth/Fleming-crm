import {it,expect} from 'vitest';
import sharp from 'sharp';
import {cropSignature} from './signature-image';
it('removes empty canvas space without clipping ink',async()=>{
 const ink=await sharp({create:{width:80,height:20,channels:4,background:'#27083d'}}).png().toBuffer();
 const source=await sharp({create:{width:700,height:290,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:ink,left:210,top:120}]).png().toBuffer();
 const result=await cropSignature(source),info=await sharp(result).metadata();
 expect(info.width).toBe(86);expect(info.height).toBe(26);
});
it('rejects an empty signature',async()=>{
 const source=await sharp({create:{width:20,height:10,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
 await expect(cropSignature(source)).rejects.toThrow('visible signature');
});
