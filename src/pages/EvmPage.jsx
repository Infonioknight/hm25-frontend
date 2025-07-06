import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQubicConnect } from '../contexts/QubicConnectContext'
import FormHead from '../components/qubic/ui/FormHead'
import { useHM25 } from '../contexts/HM25Context'
import InputText from '../components/qubic/ui/InputBytecode'

function EvmPage() {
    const navigate = useNavigate()
    const { connected, toggleConnectModal } = useQubicConnect()
    const { evmInit } = useHM25()
    const codeRef = useRef();
    const [code, setCode] = useState('')

    if (!connected) {
        return (
            <div className="mt-20 text-center text-white">
                Please connect your wallet.
                <button
                    onClick={toggleConnectModal}
                    className="bg-primary-40 text-black px-4 py-2 rounded ml-2"
                >
                    Unlock Wallet
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-md mx-auto mt-[90px] text-white">
            <FormHead title="EVM Page" onBack={() => navigate('/')} />
            <div className="space-y-4">
                <InputText
                    id="contractCode"
                    labelComponent={<span className="text-white">Contract ByteCode</span>}
                    placeholder="0x"
                    onChange={setCode}
                    ref={codeRef}
                />
                <button
                    className="bg-primary-40 text-black w-full p-3 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={code.length <= 0}
                    title={"Submit"}
                    onClick={() => evmInit(code)}
                >
                    Submit
                </button>
            </div>
        </div>
    )
}

export default EvmPage;
