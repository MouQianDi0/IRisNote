import { TextInput, type TextInputProps } from "react-native";

/** Shared text input with the application default field styling. */
type TextFieldProps = TextInputProps & {
    className?: string;
};

export function TextField({ className = "", ...props }: TextFieldProps) {
    return (
        <TextInput
            {...props}
            className={`rounded-xl border bg-gray-50 px-4 py-3.5 text-base ${className}`.trim()}
        />
    );
}
