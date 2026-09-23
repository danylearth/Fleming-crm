import {contactDetails,validDepartment} from './departments';
import type { Express } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { authMiddleware, AuthRequest } from './auth';
import { queryOne, run } from './db-pg';

const colors = ['#a32372','#6d28d9','#1d4ed8','#0f766e','#166534','#1e3a5f','#b91c1c','#881337','#c2410c','#854d0e','#4d7c0f','#0e7490','#4338ca','#475569','#27272a'];
async function auditProfile(req:AuthRequest,action:string,changes:unknown){await run("INSERT INTO audit_log(user_id,user_email,action,entity_type,entity_id,changes) VALUES($1,$2,$3,'user',$1,$4)",[req.user.id,req.user.email,action,JSON.stringify(changes)]);}
export function registerProfileRoutes(app: Express) {
  app.put('/api/auth/profile', authMiddleware, async (req: AuthRequest, res) => {
    const color = req.body.accent_color;
    const appearance=req.body.appearance;
    if (!colors.includes(color)) return res.status(400).json({error:'Choose one of the available colours'});
    if(appearance && (!['lufga','system','verdana','arial','aptos','times','comic','georgia','tahoma','trebuchet','courier','calibri','cambria','helvetica','palatino'].includes(appearance.font) || ![100,112.5,125,150].includes(appearance.scale) || !['default','cream','blue','green'].includes(appearance.background)))return res.status(400).json({error:'Choose the available appearance options'});
    const user = await queryOne('UPDATE users SET accent_color=$1,appearance=COALESCE($2::jsonb,appearance) WHERE id=$3 RETURNING accent_color,appearance', [color,appearance?JSON.stringify(appearance):null,req.user.id]);
    res.json(user);
  });
  app.get('/api/auth/login-history',authMiddleware,async(req:AuthRequest,res)=>{
    const {query}=await import('./db-pg');
    res.json(await query("SELECT created_at FROM audit_log WHERE user_id=$1 AND action='login' ORDER BY created_at DESC LIMIT 10",[req.user.id]));
  });
  app.put('/api/auth/profile/contact',authMiddleware,async(req:AuthRequest,res)=>{
    try{const contact=contactDetails(req.body);if(!await validDepartment(req.body.department))return res.status(400).json({error:'Choose an existing department/team'});
      const user=await queryOne('UPDATE users SET phone=$1,contact_email=$2,department=$3 WHERE id=$4 RETURNING phone,contact_email,department',[contact.phone,contact.contact_email,req.body.department,req.user.id]);await auditProfile(req,'update_profile_contact',user);res.json(user);
    }catch(e){res.status(400).json({error:(e as Error).message});}
  });
  app.delete('/api/auth/profile/photo',authMiddleware,async(req:AuthRequest,res)=>{
    await queryOne('UPDATE users SET avatar_url=NULL WHERE id=$1 RETURNING id',[req.user.id]);await auditProfile(req,'delete_profile_photo',{avatar_url:null});res.json({avatar_url:null});
  });
  const upload = multer({storage:multer.memoryStorage(), limits:{fileSize:5*1024*1024,files:1}}).single('photo');
  app.post('/api/auth/profile/photo', authMiddleware, (req: AuthRequest,res) => {
    upload(req,res,async error => {
      if (error) return res.status(400).json({error:'Choose one image smaller than 5 MB'});
      if (!req.file) return res.status(400).json({error:'Choose a photo'});
      try {
        const photo = await sharp(req.file.buffer, {limitInputPixels:40000000}).rotate().resize(256,256,{fit:'cover'}).webp({quality:85}).toBuffer();
        const avatar_url = `data:image/webp;base64,${photo.toString('base64')}`;
        await queryOne('UPDATE users SET avatar_url=$1 WHERE id=$2 RETURNING id',[avatar_url,req.user.id]);
        await auditProfile(req,'replace_profile_photo',{photo_uploaded:true});
        res.json({avatar_url});
      } catch { res.status(400).json({error:'This image could not be read. Choose a JPG, PNG or WebP photo'}); }
    });
  });
}
