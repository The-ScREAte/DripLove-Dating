// Verifies an Apple App Store Server Notifications V2 signed JWS string
// (signedPayload, signedTransactionInfo, or signedRenewalInfo) against a
// hardcoded, independently-verified Apple root certificate - never against
// whatever root happens to be embedded in the token's own x5c header, which
// an attacker fully controls. Returns the decoded, TRUSTED claims, or throws.
//
// Apple Root CA - G3 below was fetched directly from
// https://www.apple.com/certificateauthority/AppleRootCA-G3.cer and its
// SHA-256 fingerprint (63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F
// :5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79) was cross-checked byte-for-byte
// against the copy macOS ships locally in its own System Roots keychain (a
// source with zero network dependency), so it's confirmed authentic.
import * as jose from 'https://esm.sh/jose@5.9.6';
import { X509Certificate } from 'https://esm.sh/@peculiar/x509@1.12.3';

export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

export async function verifyAppleSignedPayload<T = Record<string, unknown>>(
  token: string,
  trustedRootPem: string = APPLE_ROOT_CA_G3_PEM
): Promise<T> {
  const protectedHeader = jose.decodeProtectedHeader(token);
  const x5c = protectedHeader.x5c as string[] | undefined;
  if (!x5c || x5c.length < 2) {
    throw new Error('Missing or incomplete x5c certificate chain in JWS header');
  }

  // x5c is leaf-first: [leaf, intermediate, (optionally root)]. Parse each
  // entry (base64 DER, no PEM wrapper) as an X.509 certificate.
  const chain = x5c.map((der) => new X509Certificate(Uint8Array.from(atob(der), (c) => c.charCodeAt(0))));
  const trustedRoot = new X509Certificate(trustedRootPem);

  // Verify each certificate was signed by the next one up the chain.
  for (let i = 0; i < chain.length - 1; i++) {
    const signed = chain[i];
    const issuer = chain[i + 1];
    const chainOk = await signed.verify({ publicKey: issuer.publicKey });
    if (!chainOk) {
      throw new Error(`Certificate chain broken at position ${i}: not signed by the next certificate in x5c`);
    }
  }

  // The top of the supplied chain must itself be signed by OUR trusted
  // root's key - never trust a root supplied inside the token itself.
  const topOfChain = chain[chain.length - 1];
  const rootSignsTop = await topOfChain.verify({ publicKey: trustedRoot.publicKey });
  if (!rootSignsTop) {
    throw new Error('Certificate chain does not terminate at the trusted Apple root');
  }

  // Now that the leaf certificate's key is fully trusted, verify the JWS
  // signature itself against that key, and return its decoded payload.
  const leafPublicKey = await jose.importX509(chain[0].toString('pem'), protectedHeader.alg as string);
  const { payload } = await jose.jwtVerify(token, leafPublicKey);
  return payload as T;
}
