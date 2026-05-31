import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground shadow-sm hover:-translate-y-px hover:bg-zinc-800",
                outline: "border border-white/70 bg-white/65 shadow-sm backdrop-blur hover:-translate-y-px hover:bg-white",
                secondary: "bg-secondary text-secondary-foreground shadow-sm backdrop-blur hover:bg-white/85",
                destructive: "bg-destructive text-destructive-foreground shadow-sm hover:opacity-90",
                ghost: "hover:bg-white/60",
            },
            size: {
                default: "h-9 px-4 py-2",
                sm: "h-8 px-3",
                lg: "h-10 px-5",
                icon: "h-9 w-9",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    },
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, type = "button", ...props }, ref) => {
        return (
            <button
                type={type}
                className={cn(buttonVariants({ variant, size }), className)}
                ref={ref}
                {...props}
            />
        );
    },
);
Button.displayName = "Button";

export { Button, buttonVariants };
