import { TextInput, type TextInputProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

/** Shared text input with the application default field styling. */
const textFieldStyles = tv({
    base: "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-base",
    variants: {
        invalid: {
            true: "border-red-400",
        },
    },
    defaultVariants: {
        invalid: false,
    },
});

type TextFieldProps = TextInputProps &
    VariantProps<typeof textFieldStyles> & {
        className?: string;
    };

export function TextField({ className, invalid, ...props }: TextFieldProps) {
    return (
        <TextInput
            {...props}
            className={textFieldStyles({ className, invalid })}
        />
    );
}
