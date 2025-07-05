import React, {forwardRef, useState} from 'react'

const InputText = forwardRef(({
                                         id,
                                         labelComponent,
                                         placeholder,
                                         onChange
                                     }, ref) => {
    const [value, setValue] = useState('')

    const handleChange = (e) => {
        const newValue = e.target.value
        setValue(newValue)
        onChange(newValue)
    }

    return (
        <div>
            {labelComponent}
            <input
                id={id}
                type="text"
                className={`w-full p-4 bg-gray-80 border border-gray-70 text-white rounded-lg placeholder-gray-500`}
                placeholder={placeholder}
                value={value}
                onChange={handleChange}
            />
        </div>
    );
});

export default InputText;