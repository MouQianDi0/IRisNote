import { TextInput, type TextInputProps } from "react-native";

type TextFieldProps = TextInputProps & {
    className?: string;
};

export function TextField({ className = "", ...props }: TextFieldProps) {
    return (
        <TextInput
            {...props}
            className={`border rounded-xl px-4 py-3.5 text-base bg-gray-50 ${className}`.trim()}
        />
    );
}
