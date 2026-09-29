import {it,expect} from 'vitest';
import {emailAssetReferences,localEmailAsset,matchEmailAsset,replaceEmailAsset} from './emailAssets';
it('finds images and background assets and replaces their references',()=>{
 const html='<img src="images/logo.png"><td background="paper.jpg" style="background:url(\'paper.jpg\')">';
 expect(emailAssetReferences(html)).toEqual(['images/logo.png','paper.jpg']);
 expect(emailAssetReferences(replaceEmailAsset(html,'paper.jpg','https://example.test/paper.png'))).toEqual(['images/logo.png','https://example.test/paper.png']);
 expect(localEmailAsset('https://example.test/logo.png')).toBe(false);
 expect(localEmailAsset('cid:missing')).toBe(true);
});
it('resolves nested folder paths without guessing between duplicate file names',()=>{
 expect(matchEmailAsset('../assets/logo.png','folder/emails/welcome.html',['folder/assets/logo.png'])).toBe('folder/assets/logo.png');
 expect(matchEmailAsset('logo.png','email.html',['a/logo.png','b/logo.png'])).toBeUndefined();
 expect(matchEmailAsset('logo%20large.png','email.html',['logo large.png'])).toBe('logo large.png');
});
