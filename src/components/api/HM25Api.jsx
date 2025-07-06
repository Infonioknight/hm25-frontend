import { Buffer } from 'buffer'
import base64 from 'base-64'
import { TICK_OFFSET } from "../../contexts/ConfigContext"
import { QubicTransaction } from '@qubic-lib/qubic-ts-library/dist/qubic-types/QubicTransaction'
import { DynamicPayload } from '@qubic-lib/qubic-ts-library/dist/qubic-types/DynamicPayload'
// Ensure you have these imports available or adjust paths if necessary
// import { SmartContractType } from '@qubic-lib/qubic-ts-library/dist/qubic-types/SmartContractType'; // If using this enum
// import { QubicDefinitions } from '@qubic-lib/qubic-ts-library/dist/qubicHelper'; // For inputType constants

export const HEADERS = {
    'accept': 'application/json',
    'Content-Type': 'application/json',
}

export const makeJsonData = (contractIndex, inputType, inputSize, requestData) => {
    return {
        contractIndex: contractIndex,
        inputType: inputType,
        inputSize: inputSize,
        requestData: requestData,
    }
}

export const HM25_CONTRACT_INDEX = 12
export const HM25_CONTRACT_PUBLIC_KEY = 'MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWLWD' // <<< NEW: Derived from index 12

export const PROC_ECHO = 1
export const PROC_BURN = 2
export const FUNC_GET_STATS = 1

export function hexStringToUint8Array(hexString) {
    let cleanHexString = hexString;

    // 1. Remove "0x" prefix if present
    if (cleanHexString.startsWith("0x") || cleanHexString.startsWith("0X")) {
        cleanHexString = cleanHexString.substring(2);
    }

    // 2. Pad to even length if necessary (each byte needs 2 hex characters)
    if (cleanHexString.length % 2 !== 0) {
        cleanHexString = "0" + cleanHexString;
    }

    // Ensure the hex string is valid (only hex characters)
    if (!/^[0-9a-fA-F]*$/.test(cleanHexString)) {
        throw new Error('Invalid hex string provided.');
    }

    const byteLength = cleanHexString.length / 2;
    const uint8Array = new Uint8Array(byteLength);

    // 3. Parse into bytes
    for (let i = 0; i < byteLength; i++) {
        const byteString = cleanHexString.substring(i * 2, (i * 2) + 2);
        uint8Array[i] = parseInt(byteString, 16);
    }

    return uint8Array;
}

export async function fetchHM25Stats(httpEndpoint) {
    const queryData = makeJsonData(HM25_CONTRACT_INDEX, FUNC_GET_STATS, 0, '')
    try {
        const response = await fetch(`${httpEndpoint}/v1/querySmartContract`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(queryData),
        })
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        const json = await response.json()
        if (!json.responseData) {
            throw new Error('No response data received')
        }
        const raw = base64.decode(json.responseData)
        const buf = Buffer.from(raw, 'binary')

        if (buf.length < 16) { // Ensure buffer has at least 16 bytes (2 * 8 bytes)
            console.warn('Buffer too short for stats, returning defaults:', buf.length)
            return {
                numberOfEchoCalls: 0n,
                numberOfBurnCalls: 0n,
            }
        }

        return {
            numberOfEchoCalls: buf.readBigUInt64LE(0),
            numberOfBurnCalls: buf.readBigUInt64LE(8),
        }
    } catch (error) {
        console.error('Error fetching HM25 stats:', error)
        return {
            numberOfEchoCalls: 0n,
            numberOfBurnCalls: 0n,
        }
    }
}

export async function buildEchoTx(qHelper, sourcePublicKey, tick, amount) {
    const finalTick = tick + TICK_OFFSET
    const INPUT_SIZE = 0
    const TX_SIZE = qHelper.TRANSACTION_SIZE + INPUT_SIZE
    const tx = new Uint8Array(TX_SIZE).fill(0)
    const dv = new DataView(tx.buffer)

    let offset = 0
    tx.set(sourcePublicKey, offset)
    offset += qHelper.PUBLIC_KEY_LENGTH
    tx[offset] = HM25_CONTRACT_INDEX
    offset += qHelper.PUBLIC_KEY_LENGTH
    dv.setBigInt64(offset, BigInt(amount), true)
    offset += 8
    dv.setUint32(offset, finalTick, true)
    offset += 4
    dv.setUint16(offset, PROC_ECHO, true)
    offset += 2
    dv.setUint16(offset, INPUT_SIZE, true)

    return tx
}

export async function buildBurnTx(qHelper, sourcePublicKey, tick, amount) {
    const finalTick = tick + TICK_OFFSET
    const INPUT_SIZE = 0
    const TX_SIZE = qHelper.TRANSACTION_SIZE + INPUT_SIZE
    const tx = new Uint8Array(TX_SIZE).fill(0)
    const dv = new DataView(tx.buffer)

    let offset = 0
    tx.set(sourcePublicKey, offset)
    offset += qHelper.PUBLIC_KEY_LENGTH
    tx[offset] = HM25_CONTRACT_INDEX
    offset += qHelper.PUBLIC_KEY_LENGTH
    dv.setBigInt64(offset, BigInt(amount), true)
    offset += 8
    dv.setUint32(offset, finalTick, true)
    offset += 4
    dv.setUint16(offset, PROC_BURN, true)
    offset += 2
    dv.setUint16(offset, INPUT_SIZE, true)

    return tx
}

export async function buildEVMInitTx(sourcePublicKey, tick, codeChunk) { // Removed destinationPublicKey as parameter, it's fixed
    const finalTick = tick + TICK_OFFSET

    // 1. Ensure codeChunk is Uint8Array
    //    It should already be a Uint8Array if passed from corrected evmInit
    if (!(codeChunk instanceof Uint8Array)) {
        throw new Error("codeChunk must be a Uint8Array");
    }

    const payload = new DynamicPayload(codeChunk.length)
    payload.setPayload(codeChunk) // <<< NOW CORRECTLY SETTING BYTE ARRAY

    const tx = new QubicTransaction()
        .setSourcePublicKey(sourcePublicKey)
        .setAmount(0) // <<< Amount usually 0 for contract deployment/init
        .setTick(finalTick)
        .setInputType(0) // <<< InputType 0 (Raw bytes) or a specific constant for contract code
        .setDestinationPublicKey(HM25_CONTRACT_PUBLIC_KEY) // <<< CORRECTED: Use the HM25 contract's derived public key
        .setPayload(payload) // <<< CRITICAL: UNCOMMENTED AND SETTING PAYLOAD

    return tx
}
