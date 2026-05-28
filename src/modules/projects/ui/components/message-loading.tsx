import Image from "next/image";
import { Loader2Icon } from "lucide-react";

export const MessageLoading = () =>{
    return (
        <div className="flex flex-col group px-2 pb-4">
            <div className="flex items-center gap-2 pl-2 mb-2">
                <Image
                src="/logo.svg"
                alt="Helix"
                width={18}
                height={18}
                className="shrink-0"
                />

                <span className="text-sm font-medium">Helix</span>
            </div>
            <div className="pl-8.5">
                <div className="max-w-xl rounded-xl border border-border/70 bg-background/65 p-4 shadow-sm backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <p className="text-sm font-medium tracking-tight">Starting generation</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Setting up the builder. Live stage updates will appear in a moment.
                            </p>
                        </div>
                        <Loader2Icon className="size-4 animate-spin text-primary"/>
                    </div>

                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-2/5 rounded-full bg-linear-to-r from-primary/65 to-primary animate-pulse"/>
                    </div>
                </div>
            </div>
        </div>
    )

}

export default MessageLoading;