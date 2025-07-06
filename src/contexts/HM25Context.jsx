import React, { createContext, useContext, useEffect, useReducer, useState } from 'react'
import { fetchHM25Stats, buildEchoTx, buildBurnTx, hexStringToUint8Array } from '../components/api/HM25Api' // <<< Changed import to new function
import { QubicHelper } from '@qubic-lib/qubic-ts-library/dist/qubicHelper'
import { TICK_OFFSET, useConfig } from './ConfigContext'
import { useQubicConnect } from './QubicConnectContext'
import { buildEVMInitTx, HM25_CONTRACT_PUBLIC_KEY } from '../components/api/HM25Api' // <<< Import HM25_CONTRACT_PUBLIC_KEY
import { Buffer } from 'buffer'

const HM25Context = createContext()

const initialState = {
    stats: { numberOfEchoCalls: 0n, numberOfBurnCalls: 0n },
    loading: false,
    error: null,
}

function hm25Reducer(state, action) {
    switch (action.type) {
        case 'SET_STATS':
            return { ...state, stats: action.payload }
        case 'SET_LOADING':
            return { ...state, loading: action.payload }
        case 'SET_ERROR':
            return { ...state, error: action.payload }
        default:
            return state
    }
}

export const HM25Provider = ({ children }) => {
    const [state, dispatch] = useReducer(hm25Reducer, initialState)
    const { httpEndpoint } = useConfig()
    const { wallet, connected, getTick, broadcastTx, signTransaction } = useQubicConnect()
    const [qHelper] = useState(() => new QubicHelper())
    const [balance, setBalance] = useState(null)
    const [walletPublicIdentity, setWalletPublicIdentity] = useState('')

    useEffect(() => {
        if (!httpEndpoint) return
        const fetchStats = async () => {
            try {
                dispatch({ type: 'SET_LOADING', payload: true })
                const stats = await fetchHM25Stats(httpEndpoint)
                dispatch({ type: 'SET_STATS', payload: stats })
            } catch (err) {
                console.error(err)
                dispatch({ type: 'SET_ERROR', payload: 'Failed to load stats' })
            } finally {
                dispatch({ type: 'SET_LOADING', payload: false })
            }
        }
        fetchStats() // Fetch immediately on mount or httpEndpoint change
        const intervalId = setInterval(fetchStats, 5000) // Fetch every 5 seconds
        return () => clearInterval(intervalId) // Cleanup interval on unmount or httpEndpoint change
    }, [httpEndpoint])

    useEffect(() => {
        const initIdentityAndBalance = async () => {
            if (!wallet) {
                setWalletPublicIdentity('')
                setBalance(null)
                return
            }
            if (wallet.connectType === 'walletconnect' || wallet.connectType === 'mmSnap') {
                if (wallet.publicKey) {
                    setWalletPublicIdentity(wallet.publicKey)
                    fetchBalance(wallet.publicKey)
                }
                return
            }
            try {
                const idPackage = await qHelper.createIdPackage(wallet.privateKey || wallet)
                const identity = await qHelper.getIdentity(idPackage.publicKey)
                if (identity) {
                    setWalletPublicIdentity(identity)
                    fetchBalance(identity)
                }
            } catch (err) {
                console.error('Error initializing identity:', err)
            }
        }
        initIdentityAndBalance()
    }, [wallet])

    useEffect(() => {
        let intervalId
        if (walletPublicIdentity) {
            intervalId = setInterval(() => fetchBalance(walletPublicIdentity), 300000) // 5 minutes
        }
        return () => clearInterval(intervalId)
    }, [walletPublicIdentity])

    const fetchBalance = async (publicId) => {
        if (!httpEndpoint || !publicId) return
        try {
            const response = await fetch(`${httpEndpoint}/v1/balances/${publicId}`, {
                headers: { accept: 'application/json' },
            })
            const data = await response.json()
            setBalance(data.balance.balance)
        } catch (error) {
            console.error('Error fetching balance:', error)
            dispatch({ type: 'SET_ERROR', payload: 'Failed to fetch balance' })
        }
    }

    const echo = async (amount) => {
        if (!connected || !wallet) return
        try {
            dispatch({ type: 'SET_LOADING', payload: true })
            const tick = await getTick()
            const unsignedTx = await buildEchoTx(qHelper, qHelper.getIdentityBytes(walletPublicIdentity), tick, amount)
            const finalTx = await signTransaction(unsignedTx)
            const broadcastRes = await broadcastTx(finalTx)
            console.log('Echo TX result:', broadcastRes)
            return { targetTick: tick + TICK_OFFSET, txResult: broadcastRes }
        } catch (err) {
            console.error(err)
            dispatch({ type: 'SET_ERROR', payload: 'Failed to echo coins' })
            throw err
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false })
        }
    }

    const burn = async (amount) => {
        if (!connected || !wallet) return
        try {
            dispatch({ type: 'SET_LOADING', payload: true })
            const tick = await getTick()
            const unsignedTx = await buildBurnTx(qHelper, qHelper.getIdentity(walletPublicIdentity), tick, amount)
            const finalTx = await signTransaction(unsignedTx)
            const broadcastRes = await broadcastTx(finalTx)
            console.log('Burn TX result:', broadcastRes)
            return { targetTick: tick + TICK_OFFSET, txResult: broadcastRes }
        } catch (err) {
            console.error(err)
            dispatch({ type: 'SET_ERROR', payload: 'Failed to burn coins' })
            throw err
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false })
        }
    }

    function uint8ArrayToBase64(uint8Array) {
        return Buffer.from(uint8Array).toString('base64');
    }

    const customBroadcastTx = async (tx) => {
        const url = `${httpEndpoint}/broadcast-transaction`;
        const txEncoded = uint8ArrayToBase64(tx);
        const body = { encodedTransaction: txEncoded };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error:', error);
        }
    };


     const evmInit = async (code) => {
        if (!connected || !wallet) {
            console.warn("Wallet not connected or available.");
            return;
        }

        try {
            const idPackage = await qHelper.createIdPackage(walletPublicIdentity);
            // 1. Convert hex code to Uint8Array once
            const fullByteCode = hexStringToUint8Array(code); // <<< Use the correct conversion function

            // Determine chunk size (Qubic contracts are often 1KB chunks)
            const CHUNK_SIZE = 1024; // 1KB
            const numChunks = Math.ceil(fullByteCode.length / CHUNK_SIZE);

            dispatch({ type: 'SET_LOADING', payload: true });

            console.log(`Deploying EVM contract in ${numChunks} chunks...`);

            for (let i = 0; i < numChunks; i++) {
                const tick = await getTick();
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, fullByteCode.length);
                const codeChunk = fullByteCode.slice(start, end); // <<< Correctly slice the Uint8Array

                console.log(`Building transaction for chunk ${i + 1}/${numChunks} at tick ${tick + TICK_OFFSET}`);

                // IMPORTANT: buildEVMInitTx no longer needs destinationPublicKey as a param
                const unsignedTx = await buildEVMInitTx(
                    idPackage.publicId,
                    tick,
                    codeChunk
                );

                const signedTxRaw = await unsignedTx.build(idPackage.privateKey); // Assuming .build() takes private key and returns Uint8Array
                
                // You were using broadcastTx(res) where res was the output of unsignedTx.build().
                // Your customBroadcastTx function takes a Uint8Array, so this should work.
                const broadcastRes = await broadcastTx(signedTxRaw); 
                // OR: If broadcastTx from QubicConnectContext expects a QubicTransaction object,
                //     you might need to adjust or use your customBroadcastTx as you defined.
                //     Let's assume broadcastTx from QubicConnectContext expects the raw signed Uint8Array,
                //     which is typical.

                console.log(`EVM Init TX chunk ${i + 1} result:`, broadcastRes); // <<< Updated log message

                if (broadcastRes && broadcastRes.code !== 0) { // Assuming 0 means success
                    throw new Error(`Broadcast failed for chunk ${i + 1}: ${broadcastRes.message || JSON.stringify(broadcastRes)}`);
                }
            }
            console.log('EVM contract deployment completed.');

        } catch (err) {
            console.error('Error deploying EVM contract:', err); // <<< Updated error message
            dispatch({ type: 'SET_ERROR', payload: 'Failed to deploy EVM contract' }); // <<< Updated error message
            throw err;
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }

    return (
        <HM25Context.Provider value={{ state, echo, burn, balance, walletPublicIdentity, fetchBalance, evmInit }}>
            {children}
        </HM25Context.Provider>
    )
}

export const useHM25 = () => useContext(HM25Context)
