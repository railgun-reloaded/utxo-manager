/**
 * Converts a Uint8Array to a hex string.
 * Used for Map/Set keys since Uint8Array uses reference equality.
 * @param bytes - Byte array to convert
 * @returns Hex string (without 0x prefix)
 * @example
 * const bytes = new Uint8Array([1, 2, 255])
 * toHex(bytes) // '0102ff'
 */
function toHex (bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Converts a hex string to a Uint8Array.
 * Accepts strings with or without 0x prefix.
 * @param hex - Hex string to convert (with or without 0x prefix)
 * @returns Byte array
 * @example
 * fromHex('0102ff') // Uint8Array([1, 2, 255])
 * fromHex('0x0102ff') // Uint8Array([1, 2, 255])
 */
function fromHex (hex: string): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

export { fromHex, toHex }
