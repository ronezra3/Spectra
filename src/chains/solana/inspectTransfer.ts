import {
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export type InspectedSolanaTransfer = Readonly<{
  from: string;
  to: string;
  lamports: string;
  recentBlockhash: string;
  transactionHex: string;
  messageHex: string;
}>;

/**
 * Fail closed on anything except a single unsigned, single-signer legacy
 * System Program transfer. This is not a general Solana transaction decoder.
 */
export function inspectSolanaTransfer(
  transactionHex: string,
  account: string
): InspectedSolanaTransfer {
  if (
    typeof transactionHex !== 'string' ||
    transactionHex.length === 0 ||
    transactionHex.length > 2464 ||
    !/^(?:[0-9a-f]{2})+$/.test(transactionHex)
  ) {
    throw new Error('Invalid Solana transaction');
  }
  try {
    const bytes = hexToBytes(transactionHex);
    const transaction = Transaction.from(bytes);
    const signer = new PublicKey(account);
    if (
      transaction.instructions.length !== 1 ||
      !transaction.feePayer?.equals(signer) ||
      !transaction.recentBlockhash ||
      transaction.signatures.length !== 1 ||
      !transaction.signatures[0].publicKey.equals(signer) ||
      transaction.signatures[0].signature !== null
    )
      throw new Error('Unsupported transaction');
    const instruction = transaction.instructions[0];
    if (
      !instruction.programId.equals(SystemProgram.programId) ||
      instruction.keys.length !== 2 ||
      !instruction.keys[0].isSigner ||
      !instruction.keys[0].isWritable ||
      instruction.keys[1].isSigner ||
      !instruction.keys[1].isWritable ||
      SystemInstruction.decodeInstructionType(instruction) !== 'Transfer'
    )
      throw new Error('Unsupported instruction');
    const transfer = SystemInstruction.decodeTransfer(instruction);
    if (!transfer.fromPubkey.equals(signer)) throw new Error('Signer mismatch');
    const canonical = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    if (bytesToHex(canonical) !== transactionHex)
      throw new Error('Non-canonical transaction');
    return Object.freeze({
      from: transfer.fromPubkey.toBase58(),
      to: transfer.toPubkey.toBase58(),
      lamports: transfer.lamports.toString(),
      recentBlockhash: transaction.recentBlockhash,
      transactionHex,
      messageHex: bytesToHex(transaction.serializeMessage()),
    });
  } catch {
    throw new Error('Unsupported or invalid Solana transfer');
  }
}
