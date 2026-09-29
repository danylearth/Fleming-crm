import React from 'react';
// Only the authenticated wrapper is replaced; the recipient screen, signature
// editor and stylesheet are imported unchanged from the CRM source.
export function SigningPage({endpoint,children}) {
 const [src,setSrc]=React.useState('');
 React.useEffect(()=>{let active=true,url='';fetch(endpoint).then(r=>r.blob()).then(b=>{url=URL.createObjectURL(b);if(active)setSrc(url);});return()=>{active=false;if(url)URL.revokeObjectURL(url);};},[endpoint,children===false]);
 return src?<div className='relative w-full border bg-white'><img src={src} alt='Document page' className='w-full block'/>{children}</div>:<p>Loading document page...</p>;
}

