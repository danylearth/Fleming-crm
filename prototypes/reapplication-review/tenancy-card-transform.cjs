// Local review layout; keep the existing actions and their event handlers intact.
module.exports=code=>{
 const start=code.indexOf('            {/* Tenancy Details */}');
 const end=code.indexOf('            {/* Onboarding Checklist */}',start);
 if(start<0||end<0)throw Error('Tenancy details section could not be located');
 let section=code.slice(start,end);
 const actions=section.match(/\s*<TenancyActionsMenu>[\s\S]*?<\/TenancyActionsMenu>/)?.[0];
 const badge=section.match(/\{tenancyDuration\(form\.tenancy_start_date,form\.tenancy_end_date\)&&<p[\s\S]*?<\/p>\}/)?.[0];
 if(!actions||!badge)throw Error('Tenancy actions or duration could not be located');
 section=section.replace(actions,'').replace(badge,'');
 section=section.replace('<GlassCard className="p-6">','<GlassCard className="p-6" data-review-tenancy-card>');
 section=section.replace('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 mb-4','mb-1');
 section=section.replace('</h3>',`</h3>${badge.replace('mt-4 inline-flex','inline-flex shrink-0').replace('text-sm font-normal','text-xs font-normal')}</div>`);
 section=section.replace('<h3 className=', '<div className="flex flex-wrap items-center justify-between gap-3"><h3 className=');
 section=section.replace('className="mt-5"','className="mt-4"');
 section=section.replace('            </GlassCard>',`<div className="mt-2 border-t border-[var(--border-subtle)] pt-4">${actions.replace('<TenancyActionsMenu>','<div role="group" aria-label="Tenancy actions" className="grid grid-cols-2 gap-2 [&>button]:!w-full [&>button]:!min-w-0 [&>button]:!px-2 [&>button]:!text-xs [&>button]:!justify-center [&>button]:!rounded-full">').replace('</TenancyActionsMenu>','</div>')}</div>\n            </GlassCard>`);
 return "import TenancyChangeover from '/@fs/"+require('path').resolve('prototypes/reapplication-review/TenancyChangeover.tsx').replaceAll('\\','/')+"';\n"+code.slice(0,start)+section+'<TenancyChangeover/>'+code.slice(end);
};
