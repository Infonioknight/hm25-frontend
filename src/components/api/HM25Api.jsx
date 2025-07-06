import { Buffer } from 'buffer'
import base64 from 'base-64'
import { TICK_OFFSET } from "../../contexts/ConfigContext"
import { QubicTransaction } from '@qubic-lib/qubic-ts-library/dist/qubic-types/QubicTransaction'
import { DynamicPayload } from '@qubic-lib/qubic-ts-library/dist/qubic-types/DynamicPayload'

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

export const PROC_ECHO = 1
export const PROC_BURN = 2
export const FUNC_GET_STATS = 1

export function hexStringTo8BitArrays(hexString) {
    let cleanHexString = hexString;

    // 1. Remove "0x" prefix if present
    if (cleanHexString.startsWith("0x") || cleanHexString.startsWith("0X")) {
        cleanHexString = cleanHexString.substring(2);
    }

    // 2. Pad to even length if necessary (each byte needs 2 hex characters)
    if (cleanHexString.length % 2 !== 0) {
        cleanHexString = "0" + cleanHexString;
    }

    const byteArrays = [];

    // 3. Parse into bytes and convert each byte to an 8-bit array
    for (let i = 0; i < cleanHexString.length; i += 2) {
        const byteString = cleanHexString.substring(i, i + 2);
        const byteValue = parseInt(byteString, 16); // Convert hex string to decimal byte

        const bitArray = [];
        for (let j = 0; j < 8; j++) {
            // Start from MSB (index 0 for the 8-bit array)
            // Check if the (7 - j)-th bit is set
            bitArray.push(((byteValue >> (7 - j)) & 1) === 1);
        }
        byteArrays.push(bitArray);
    }

    return byteArrays;
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

export async function buildEVMInitTx(destinationPublicKey, sourcePublicKey, tick, code) {
    const finalTick = tick + TICK_OFFSET
    const payload = new DynamicPayload(code.length)
    payload.setPayload(code)
    const tx = new QubicTransaction()
        .setSourcePublicKey(sourcePublicKey)
        .setAmount(500)
        .setTick(finalTick)
        .setInputType(1)
        // .setPayload(payload)
        .setDestinationPublicKey(destinationPublicKey)

    return tx

}
