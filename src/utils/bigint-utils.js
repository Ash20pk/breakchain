/**
 * Utility functions to handle BigInt operations in a way that's compatible
 * with browsers that don't support BigInt literals (numbers with 'n' suffix).
 */

// Check if BigInt is natively supported
export const isBigIntSupported = typeof BigInt !== 'undefined';

// Create a BigInt using a function that works even if BigInt literals aren't supported
export function createBigInt(value) {
  if (isBigIntSupported) {
    return BigInt(value);
  }
  // Fallback for environments without BigInt
  console.warn('BigInt is not supported in this environment. Using Number instead.');
  return Number(value);
}

// Helper functions for common BigInt operations
export function bigIntAdd(a, b) {
  if (isBigIntSupported) {
    return BigInt(a) + BigInt(b);
  }
  return Number(a) + Number(b);
}

export function bigIntSubtract(a, b) {
  if (isBigIntSupported) {
    return BigInt(a) - BigInt(b);
  }
  return Number(a) - Number(b);
}

export function bigIntMultiply(a, b) {
  if (isBigIntSupported) {
    return BigInt(a) * BigInt(b);
  }
  return Number(a) * Number(b);
}

export function bigIntLeftShift(a, b) {
  if (isBigIntSupported) {
    return BigInt(a) << BigInt(b);
  }
  return Number(a) << Number(b);
}

// Function to convert a negative number to two's complement representation
export function twosFromBigInt(value, width) {
  if (!isBigIntSupported) {
    // Simplified version for environments without BigInt
    return value < 0 ? ((~(-value) + 1) & ((1 << width) - 1)) : value;
  }
  
  const bigValue = BigInt(value);
  const bigWidth = BigInt(width);
  
  const isNegative = bigValue < 0;
  let result;
  
  if (isNegative) {
    // Prepare a mask for the specified width to perform NOT operation
    const mask = (BigInt(1) << bigWidth) - BigInt(1);
    // Invert bits (using NOT) and add one
    result = (~bigValue & mask) + BigInt(1);
  } else {
    result = bigValue;
  }
  
  // Ensure the result fits in the specified width
  result &= (BigInt(1) << bigWidth) - BigInt(1);
  
  return result;
}

export default {
  createBigInt,
  bigIntAdd,
  bigIntSubtract,
  bigIntMultiply,
  bigIntLeftShift,
  twosFromBigInt,
  isBigIntSupported
};