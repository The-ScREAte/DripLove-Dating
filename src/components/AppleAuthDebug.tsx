import React from 'react';

export default function AppleAuthDebug() {
  if (typeof window === 'undefined') return null;

  const payloadStr = sessionStorage.getItem('apple_id_token_payload');
  const clientIdInUse = sessionStorage.getItem('apple_client_id_in_use');
  const supabaseErrStr = sessionStorage.getItem('apple_supabase_error');

  // If nothing useful is present, render nothing
  if (!payloadStr && !clientIdInUse && !supabaseErrStr) return null;

  let payload: any = null;
  let supErr: any = null;
  try {
    if (payloadStr) payload = JSON.parse(payloadStr);
  } catch (e) {
    payload = null;
  }
  try {
    if (supabaseErrStr) supErr = JSON.parse(supabaseErrStr);
  } catch (e) {
    supErr = { raw: supabaseErrStr };
  }

  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 1000 }}>
      <div style={{ background: 'rgba(0,0,0,0.7)', color: 'white', padding: 8, borderRadius: 8, fontSize: 12, maxWidth: 320 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Apple Sign-In Debug</div>
        {clientIdInUse ? <div>clientId: {String(clientIdInUse)}</div> : null}
        {payload ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 600 }}>id_token payload</div>
            <div>aud: {String(payload.aud)}</div>
            <div>iss: {String(payload.iss)}</div>
            <div>sub: {String(payload.sub)}</div>
            <div>exp: {String(payload.exp)}</div>
          </div>
        ) : null}

        {supErr ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 600 }}>Supabase error</div>
            <div>status: {String(supErr.status ?? 'unknown')}</div>
            <div style={{ maxWidth: 300, wordBreak: 'break-word' }}>{String(supErr.message ?? supErr.raw ?? '—')}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
