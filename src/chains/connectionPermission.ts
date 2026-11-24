import { z } from 'zod';
import { areAddressIdentitiesEqual } from './addressIdentity';

// Origin and account data must still be established by trusted extension code.
// These schemas validate the decision input's shape, not public keys or consent.
const originSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.origin === value
    );
  } catch {
    return false;
  }
});

const accountSchema = z.discriminatedUnion('ecosystem', [
  z.object({ ecosystem: z.literal('evm'), address: z.string().min(1) }),
  z.object({ ecosystem: z.literal('solana'), address: z.string().min(1) }),
]);

const connectionGrantSchema = z.object({
  origin: originSchema,
  account: accountSchema,
  capability: z.literal('connect'),
});

export type ConnectionGrant = z.infer<typeof connectionGrantSchema>;

/**
 * Match an already-authorized connection grant. This never grants permission,
 * validates a public key, or authorizes message or transaction signatures.
 */
export const hasConnectionPermission = (
  grants: unknown,
  requested: unknown
): boolean => {
  const request = connectionGrantSchema.safeParse(requested);
  if (!request.success || !Array.isArray(grants)) return false;

  return grants.some((candidate) => {
    const grant = connectionGrantSchema.safeParse(candidate);
    return (
      grant.success &&
      grant.data.origin === request.data.origin &&
      areAddressIdentitiesEqual(grant.data.account, request.data.account)
    );
  });
};
