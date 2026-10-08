import type {ReactNode} from 'react';

export default function TenancyActionsMenu({children}:{children:ReactNode}){
 return <div role="group" aria-label="Tenancy actions" className="ml-auto flex w-[180px] shrink-0 flex-col gap-1.5 [&_button]:!h-7 [&_button]:!min-h-7 [&_button]:!w-full [&_button]:!justify-start [&_button]:!gap-2 [&_button]:!rounded-full [&_button]:!px-3 [&_button]:!py-1 [&_button]:!text-xs [&_button]:!leading-5 [&_button]:!font-normal [&_button]:!text-white [&_svg]:!h-3.5 [&_svg]:!w-3.5 [&_svg]:!shrink-0">{children}</div>;
}
