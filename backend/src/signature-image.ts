import sharp from 'sharp';
/** Crop unused transparent canvas space so the ink fills the PDF signing slot. */
export async function cropSignature(image:Uint8Array):Promise<Buffer>{
 const {data,info}=await sharp(Buffer.from(image)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;if(data[i+3]>16&&(data[i]<245||data[i+1]<245||data[i+2]<245)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 if(right<left)throw new Error('Please add a visible signature');
 return sharp(Buffer.from(image)).extract({left,top,width:right-left+1,height:bottom-top+1}).extend({top:3,bottom:3,left:3,right:3,background:{r:255,g:255,b:255,alpha:0}}).png().toBuffer();
}
