"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import "./share.css";

type Tier = { title: string; price: number; detail: string };
type Proposal = {
  id: string;
  client_name: string;
  project_name: string;
  summary: string;
  proposal_body: string;
  tiers: Record<string, Tier>;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const tierOrder = ["quick", "standard", "enterprise"] as const;

export default function ShareProposal({ slug }: { slug: string }) {
  const supabase = useMemo(
    () => (supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null),
    [],
  );
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tier, setTier] = useState<(typeof tierOrder)[number]>("standard");
  const [signer, setSigner] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [acceptedComplete, setAcceptedComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadProposal() {
      if (!supabase) {
        setError("This proposal link is not available yet. Please contact the freelancer who shared it.");
        setLoading(false);
        return;
      }
      const { data, error: loadError } = await supabase
        .from("proposals")
        .select("id, client_name, project_name, summary, proposal_body, tiers")
        .eq("share_slug", slug)
        .eq("is_shared", true)
        .maybeSingle();
      if (!active) return;
      if (loadError) {
        console.error("Could not load shared proposal:", loadError.message);
        setError("We couldn’t load this proposal. Please try again later.");
      } else if (!data) {
        setError("This proposal link is unavailable or has expired.");
      } else {
        setProposal(data as Proposal);
      }
      setLoading(false);
    }
    void loadProposal();
    return () => {
      active = false;
    };
  }, [slug, supabase]);

  async function acceptProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !proposal || !signer.trim() || !accepted) return;
    setSubmitting(true);
    setError("");
    const { error: saveError } = await supabase.from("proposal_acceptances").insert({
      proposal_id: proposal.id,
      tier,
      signer_name: signer.trim(),
      consent_text: `I agree to the ${proposal.tiers[tier]?.title ?? tier} scope and would like to begin.`,
    });
    if (saveError) {
      console.error("Could not record proposal acceptance:", saveError.message);
      setError(
        saveError.code === "23505"
          ? "This proposal has already been accepted."
          : "We couldn’t record your acceptance. Please try again or contact the freelancer.",
      );
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setError("");
    setAcceptedComplete(true);
    setAccepted(false);
  }

  return (
    <main className="shared-page">
      <header className="shared-topbar">
        <a href="/" aria-label="ScopePulse home">
          <img src="/scopepulse/logo.png" alt="ScopePulse — Proposal Intelligence" />
        </a>
        <span>Secure proposal preview</span>
      </header>
      <article className="shared-document">
        {loading ? (
          <div className="share-state"><span className="share-spinner" /> Loading your proposal…</div>
        ) : error && !proposal ? (
          <div className="share-state"><span className="share-state-mark">!</span><h1>Proposal unavailable</h1><p>{error}</p></div>
        ) : proposal ? (
          <>
            <p className="share-eyebrow">A PROJECT PROPOSAL FOR</p>
            <h1>{proposal.client_name}</h1>
            <p className="share-subtitle">{proposal.project_name}</p>
            <p className="share-summary">{proposal.summary}</p>
            <div className="share-section">
              <span>THE APPROACH</span>
              <p>{proposal.proposal_body}</p>
            </div>
            {acceptedComplete ? (
              <section className="share-acceptance share-success" role="status">
                <span>ACCEPTANCE RECORDED</span>
                <h2>Thank you. You’re all set.</h2>
                <p>Your selected option has been shared with the freelancer, who can follow up with next steps.</p>
              </section>
            ) : <form className="share-acceptance" onSubmit={acceptProposal}>
              <span>CHOOSE YOUR PATH</span>
              <h2>Three thoughtful ways to move forward.</h2>
              <div className="share-tiers">
                {tierOrder.map((key) => {
                  const option = proposal.tiers[key];
                  if (!option) return null;
                  return (
                    <label className={`share-tier${tier === key ? " selected" : ""}`} key={key}>
                      <input
                        type="radio"
                        name="proposal-tier"
                        value={key}
                        checked={tier === key}
                        onChange={() => setTier(key)}
                      />
                      <span>
                        <strong>{option.title}</strong>
                        <small>{option.detail}</small>
                      </span>
                      <b>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(option.price)}</b>
                    </label>
                  );
                })}
              </div>
              <label className="share-field">
                <span>YOUR FULL NAME</span>
                <input
                  autoComplete="name"
                  minLength={2}
                  maxLength={120}
                  required
                  value={signer}
                  onChange={(event) => setSigner(event.target.value)}
                  placeholder="Name of the person accepting"
                />
              </label>
              <label className="share-consent">
                <input checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required type="checkbox" />
                <span>I agree to the selected scope and would like to begin.</span>
              </label>
              {error && <p className="share-error" role="alert">{error}</p>}
              <button className="share-submit" disabled={submitting || !accepted} type="submit">
                {submitting ? "Recording acceptance…" : "Accept proposal"} <span>→</span>
              </button>
              <p className="share-legal">Your acceptance is recorded for the freelancer. This preview is not a substitute for a signed legal contract or payment checkout.</p>
            </form>}
          </>
        ) : null}
      </article>
    </main>
  );
}
