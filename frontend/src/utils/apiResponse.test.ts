import {it,expect} from 'vitest';
import {readApiResponse} from './apiResponse';
it('surfaces API validation errors and readable gateway failures without leaking HTML',async()=>{
 await expect(readApiResponse(new Response('{"error":"Choose a file"}',{status:400}))).rejects.toThrow('Choose a file');
 await expect(readApiResponse(new Response('<!DOCTYPE html>gateway error',{status:502}))).rejects.toThrow('Check Campaign History');
 await expect(readApiResponse(new Response('Too large',{status:413}))).rejects.toThrow('8 MB');
 expect(await readApiResponse(new Response('{"id":42}'))).toEqual({id:42});
});
