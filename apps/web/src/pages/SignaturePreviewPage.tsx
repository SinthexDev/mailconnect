import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errMsg, type Mailbox, type MailSignature } from '../api';
import { useI18n } from '../LanguageSwitcher';

export function SignatureView({ signature }: { signature: MailSignature }) {
  if (signature.kind === 'html') {
    return <iframe className="signature-frame" sandbox="" title={signature.title} srcDoc={signature.body} />;
  }
  return <pre className="signature-plain">{signature.body}</pre>;
}

export function SignaturePreviewPage() {
  const { id, signatureId } = useParams();
  const { m } = useI18n();
  const [signature, setSignature] = useState<MailSignature | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id || !signatureId) return;
    api<{ mailboxes: Mailbox[] }>('mailboxes').then((result) => {
      const mailbox = result.mailboxes.find((item) => item.id === id);
      const found = mailbox?.signatures?.find((item) => item.id === signatureId) ?? null;
      if (!found) setErr(m.signatureMissing);
      else setSignature(found);
    }).catch((error) => setErr(errMsg(error)));
  }, [id, signatureId, m.signatureMissing]);

  return (
    <article className="signature-preview">
      <header>
        {id ? <Link className="signature-back" to={`/mailboxes/${id}?bereich=signaturen`}>{m.signatureBack}</Link> : null}
        <p className="muted small">{signature ? (signature.kind === 'html' ? m.signatureHtml : m.signaturePlain) : 'MailConnect'}</p>
        <h1>{signature?.title ?? ''}</h1>
        {signature?.instructions ? <p>{signature.instructions}</p> : null}
      </header>
      {err ? <p className="error" role="alert">{err}</p> : null}
      {signature ? <SignatureView signature={signature} /> : null}
    </article>
  );
}
