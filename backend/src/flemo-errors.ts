export class FlemoServiceError extends Error {
 constructor(public code:string,message:string){super(message);this.name='FlemoServiceError';}
}
// Classify provider errors without exposing raw messages, account details or tokens.
export function flemoProviderError(error:unknown):FlemoServiceError {
 const data=error&&typeof error==='object'?error as Record<string,any>:{};
 const text=JSON.stringify([data.code,data.codexErrorInfo,data.data?.code,data.data?.codexErrorInfo,data.message]).toLowerCase().replace(/[_ -]/g,'');
 if(/usagelimitexceeded|insufficientquota|creditbalanceexhausted|hityourusagelimit|reached.*usagelimit/.test(text))return new FlemoServiceError('ai_usage_limit','The linked ChatGPT account has reached its usage or credit limit. Ask an administrator to top up credits where available, or wait until the account’s usage limit resets.');
 if(/unauthorized|authentication|tokenexpired|invalidtoken/.test(text))return new FlemoServiceError('ai_reconnect','The shared AI connection needs to be renewed. Ask an administrator to reconnect ChatGPT in Settings.');
 if(/ratelimit|429/.test(text))return new FlemoServiceError('ai_rate_limit','The AI service is temporarily limiting requests. Please try again shortly.');
 if(/contextwindowexceeded|contextlengthexceeded/.test(text))return new FlemoServiceError('ai_context_limit','There is too much information for one answer. Please ask a more specific question or attach fewer documents.');
 return new FlemoServiceError('ai_unavailable','The AI service could not complete this request. Please try again shortly.');
}
