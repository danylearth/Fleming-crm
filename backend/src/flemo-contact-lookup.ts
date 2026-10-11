// Contact lookups need names, addresses and contact details, not document or financial evidence.
export function contactLookup(message:string){
 return /\b(?:phone|telephone|mobile|contact\s+(?:numbers?|details)|tenant\s+names?|full\s+address(?:es)?)\b/i.test(message)
  && !/\b(?:rent|arrears|payments?|income|invoices?|balances?|bank|documents?|files?|certificates?|passport|inventory|agreements?)\b/i.test(message);
}

export function contactLookupMessage(message:string,previous:{role:string;text:string}[]){
 const last=previous.filter(item=>item.role==='user').slice(-1)[0]?.text;
 return last&&contactLookup(last)&&message.length<120&&/^(?:yes\b|yeah\b|correct\b|i meant\b|\d)/i.test(message.trim())?`${last}\nClarification: ${message}`:message;
}

export const contactAnswerInstructions='For simple contact lookups only: The supplied records are candidates, not a list to repeat. Return only the requested matching properties and their current tenants, with the requested contact fields. Use one short plain-text block per address, separated by a blank line; never use a Markdown table or CRM record IDs. Match each address separately, including abbreviations. Never silently substitute a different house number. Give confirmed matches first, then one brief question for an ambiguous address, for example “Did you mean 2A Cavalier Circus?” Only suggest addresses present in the evidence, and wait for confirmation before treating them as matches. If there are several plausible matches, ask which one. No introduction, document discussion, extra suggestions, buttons or closing summary. Say “Not recorded” for missing contact details. Respect the supplied conversation when the user confirms a suggested address.';
