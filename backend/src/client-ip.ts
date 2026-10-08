import {isIP} from 'node:net';
import type {Request,Response,NextFunction} from 'express';
/** Fly terminates the public connection and sets Fly-Client-IP itself. Its XFF
 * chain can additionally contain the shared edge IP, so one-hop XFF is wrong. */
export function flyClientIp(req:Request,_res:Response,next:NextFunction){
 if(process.env.FLY_APP_NAME){
  const address=req.headers['fly-client-ip'];
  if(typeof address==='string'&&isIP(address))Object.defineProperty(req,'ip',{value:address,configurable:true});
 }
 next();
}
