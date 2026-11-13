"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef } from "react";

type FrameMessage = {
  source?: string;
  type?: string;
  requestId?: string;
  action?: string;
  email?: string;
  password?: string;
  proposal?: Record<string, unknown>;
  description?: string;
  clientName?: string;
  tone?: string;
  workspaceId?: string;
  workspaceName?: string;
  proposalId?: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function WorkspaceShell({ aiConfigured }: { aiConfigured: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const supabase = useMemo<SupabaseClient | null>(
    () =>
      supabaseUrl &&
      (supabaseUrl.startsWith("https://") || supabaseUrl.startsWith("http://")) &&
      supabaseKey
        ? createBrowserClient(supabaseUrl, supabaseKey, {
            auth: { flowType: "pkce" },
          })
        : null,
    [],
  );

  useEffect(() => {
    const reply = (message: Record<string, unknown>) => {
      frame.current?.contentWindow?.postMessage(
        { source: "scopepulse-host", ...message },
        window.location.origin,
      );
    };

    let activeWorkspaceId: string | null = null;
    let activeUserId: string | null = null;
    let frameReady = false;
    const workspaceIds = new Set<string>();

    const loadProposals = async () => {
      if (!supabase || !activeWorkspaceId) return;
      const { data, error } = await supabase
        .from("proposals")
        .select(
          "id, client_name, project_name, brief, tone, summary, proposal_body, risks, tiers, selected_tier, status, share_slug, is_shared, created_at",
        )
        .eq("workspace_id", activeWorkspaceId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("Could not load proposals:", error.message);
        reply({ type: "proposal-list", error: error.message, proposals: [] });
        return;
      }
      reply({ type: "proposal-list", proposals: data });
    };

    const loadWorkspaces = async (preferredId?: string) => {
      if (!supabase || !activeUserId) return;
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace:workspaces!inner(id, name, created_at, owner_id)")
        .eq("user_id", activeUserId);
      if (error) {
        console.error("Could not load workspaces:", error.message);
        reply({ type: "workspace-list", error: error.message, workspaces: [] });
        return;
      }

      const workspaces = (data || [])
        .flatMap((membership) => membership.workspace)
        .filter((workspace) => typeof workspace.id === "string");
      workspaceIds.clear();
      workspaces.forEach((workspace) => workspaceIds.add(workspace.id));
      const storageKey = `scopepulse-workspace:${activeUserId}`;
      const savedId = window.sessionStorage.getItem(storageKey);
      activeWorkspaceId =
        (preferredId && workspaceIds.has(preferredId) ? preferredId : null) ||
        (savedId && workspaceIds.has(savedId) ? savedId : null) ||
        workspaces[0]?.id ||
        null;
      if (activeWorkspaceId) window.sessionStorage.setItem(storageKey, activeWorkspaceId);
      reply({ type: "workspace-list", workspaces, activeWorkspaceId });
      await loadProposals();
    };

    const applySession = (user: { id: string } | null) => {
      activeUserId = user?.id || null;
      if (!activeUserId) {
        activeWorkspaceId = null;
        workspaceIds.clear();
        reply({ type: "workspace-list", workspaces: [], activeWorkspaceId: null });
        reply({ type: "proposal-list", proposals: [] });
      } else {
        void loadWorkspaces();
      }
    };

    const onMessage = async (event: MessageEvent<FrameMessage>) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.source !== "scopepulse-frame"
      ) {
        return;
      }

      const message = event.data;
      if (message.type === "ready") {
        if (frameReady) return;
        frameReady = true;
        reply({
          type: "backend-state",
          configured: Boolean(supabase),
          aiConfigured: Boolean(supabase) && aiConfigured,
        });
        if (new URLSearchParams(window.location.search).get("error") === "oauth") {
          reply({ type: "auth-state", user: null, error: "Google sign-in could not be completed. Please try again." });
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
        }
        if (!supabase) {
          reply({ type: "auth-state", user: null });
          reply({ type: "workspace-list", workspaces: [], activeWorkspaceId: null });
          reply({ type: "proposal-list", proposals: [] });
          return;
        }
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Could not restore the Supabase session:", error.message);
          reply({ type: "auth-state", user: null, error: "Could not restore your sign-in. Please sign in again." });
          return;
        }
        reply({ type: "auth-state", user: data.session?.user ?? null });
        applySession(data.session?.user ?? null);
        return;
      }

      if (!supabase) {
        reply({
          type: message.type === "analyze"
            ? "analysis-result"
            : message.type === "proposal-saved"
              ? "proposal-saved"
              : message.type === "proposal-published"
                ? "proposal-published"
                : message.type === "get-proposal"
                  ? "proposal-detail"
                  : message.type === "workspace-create"
                    ? "workspace-created"
                    : "auth-result",
          requestId: message.requestId,
          error: "Connect Supabase by setting NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        });
        return;
      }

      if (message.type === "auth") {
        let errorMessage: string | null = null;
        if (message.action === "sign-in" && message.email && message.password) {
          const result = await supabase.auth.signInWithPassword({
            email: message.email,
            password: message.password,
          });
          errorMessage = result.error?.message ?? null;
        } else if (message.action === "sign-up" && message.email && message.password) {
          const result = await supabase.auth.signUp({
            email: message.email,
            password: message.password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });
          errorMessage = result.error?.message ?? null;
          if (!errorMessage && !result.data.session) {
            reply({
              type: "auth-result",
              requestId: message.requestId,
              message: "Check your email to confirm your account, then sign in.",
            });
            return;
          }
        } else if (message.action === "google-sign-in") {
          const result = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });
          errorMessage = result.error?.message ?? null;
        } else if (message.action === "sign-out") {
          const result = await supabase.auth.signOut();
          errorMessage = result.error?.message ?? null;
        } else {
          errorMessage = "Enter a valid email address and a password of at least 8 characters.";
        }

        if (errorMessage) {
          reply({ type: "auth-result", requestId: message.requestId, error: errorMessage });
          return;
        }
        const { data } = await supabase.auth.getSession();
        reply({ type: "auth-state", user: data.session?.user ?? null });
        reply({ type: "auth-result", requestId: message.requestId, success: true });
        applySession(data.session?.user ?? null);
        return;
      }

      if (message.type === "analyze") {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          reply({ type: "analysis-result", requestId: message.requestId, error: "Sign in before analyzing a proposal." });
          return;
        }
        try {
          const response = await fetch("/api/analyze", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${data.session.access_token}`,
            },
            body: JSON.stringify({
              description: message.description,
              clientName: message.clientName,
              tone: message.tone,
            }),
          });
          const result = (await response.json()) as {
            analysis?: unknown;
            error?: string;
          };
          if (!response.ok) {
            reply({
              type: "analysis-result",
              requestId: message.requestId,
              error: result.error || "Proposal analysis failed.",
            });
            return;
          }
          reply({ type: "analysis-result", requestId: message.requestId, analysis: result.analysis });
        } catch (error) {
          console.error("Proposal analysis request failed:", error);
          reply({
            type: "analysis-result",
            requestId: message.requestId,
            error: "Could not reach the analysis service. Please try again.",
          });
        }
        return;
      }

      if (message.type === "save-proposal" && message.proposal) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          reply({ type: "proposal-saved", requestId: message.requestId, error: "Sign in to save this proposal." });
          return;
        }
        if (!activeWorkspaceId) {
          await loadWorkspaces();
          if (!activeWorkspaceId) {
            reply({ type: "proposal-saved", requestId: message.requestId, error: "Create a workspace before saving proposals." });
            return;
          }
        }
        const proposal = message.proposal;
        const id = typeof proposal.id === "string" ? proposal.id : crypto.randomUUID();
        if (
          typeof proposal.clientName !== "string" ||
          typeof proposal.brief !== "string" ||
          !["collaborative", "formal", "bold"].includes(String(proposal.tone))
        ) {
          reply({ type: "proposal-saved", requestId: message.requestId, error: "Proposal details are incomplete." });
          return;
        }
        const { data, error } = await supabase
          .from("proposals")
          .upsert(
            {
              id,
              user_id: sessionData.session.user.id,
              client_name: proposal.clientName,
              project_name: proposal.projectName || "Product design",
              brief: proposal.brief,
              workspace_id: activeWorkspaceId,
              tone: proposal.tone,
              summary: proposal.summary,
              proposal_body: proposal.proposalBody,
              risks: proposal.risks,
              tiers: proposal.tiers,
              selected_tier: proposal.selectedTier,
              status: "draft",
            },
            { onConflict: "id" },
          )
          .select("id, share_slug")
          .single();
        if (error) {
          console.error("Could not save proposal:", error.message);
          reply({ type: "proposal-saved", requestId: message.requestId, error: error.message });
          return;
        }
        reply({ type: "proposal-saved", requestId: message.requestId, proposal: data });
        void loadProposals();
        return;
      }

      if (message.type === "list-proposals") {
        if (!activeWorkspaceId) await loadWorkspaces();
        else void loadProposals();
        return;
      }

      if (message.type === "select-workspace" && typeof message.workspaceId === "string") {
        if (!workspaceIds.has(message.workspaceId) || !activeUserId) {
          reply({ type: "workspace-selected", requestId: message.requestId, error: "That workspace is unavailable." });
          return;
        }
        activeWorkspaceId = message.workspaceId;
        window.sessionStorage.setItem(`scopepulse-workspace:${activeUserId}`, activeWorkspaceId);
        reply({ type: "workspace-selected", requestId: message.requestId, workspaceId: activeWorkspaceId });
        await loadWorkspaces(activeWorkspaceId);
        return;
      }

      if (message.type === "workspace-create" && typeof message.workspaceName === "string") {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session) {
          reply({ type: "workspace-created", requestId: message.requestId, error: "Sign in to create a workspace." });
          return;
        }
        const { data, error } = await supabase.rpc("create_workspace", {
          workspace_name: message.workspaceName.trim(),
        });
        if (error) {
          console.error("Could not create workspace:", error.message);
          reply({ type: "workspace-created", requestId: message.requestId, error: error.message });
          return;
        }
        const workspace = data as { id?: string } | null;
        if (!workspace?.id) {
          reply({ type: "workspace-created", requestId: message.requestId, error: "Workspace creation returned no workspace." });
          return;
        }
        await loadWorkspaces(workspace.id);
        reply({ type: "workspace-created", requestId: message.requestId, workspaceId: workspace.id });
        return;
      }

      if (message.type === "get-proposal" && typeof message.proposalId === "string") {
        const { data, error } = await supabase
          .from("proposals")
          .select(
            "id, client_name, project_name, brief, tone, summary, proposal_body, risks, tiers, selected_tier, status, share_slug, is_shared, created_at",
          )
          .eq("id", message.proposalId)
          .single();
        if (error) {
          reply({ type: "proposal-detail", requestId: message.requestId, error: error.message });
          return;
        }
        reply({ type: "proposal-detail", requestId: message.requestId, proposal: data });
        return;
      }

      if (message.type === "publish-proposal" && typeof message.proposal?.id === "string") {
        const { data, error } = await supabase
          .from("proposals")
          .update({
            is_shared: true,
            status: "sent",
            selected_tier: message.proposal.selectedTier,
          })
          .eq("id", message.proposal.id)
          .select("share_slug")
          .single();
        if (error) {
          console.error("Could not publish proposal:", error.message);
          reply({ type: "proposal-published", requestId: message.requestId, error: error.message });
          return;
        }
        reply({
          type: "proposal-published",
          requestId: message.requestId,
          url: `${window.location.origin}/p/${data.share_slug}`,
        });
        void loadProposals();
      }
    };

    window.addEventListener("message", onMessage);
    const authListener = supabase?.auth.onAuthStateChange((_event, session) => {
      reply({ type: "auth-state", user: session?.user ?? null });
      if (session?.user?.id !== activeUserId) applySession(session?.user ?? null);
    });
    frame.current?.contentWindow?.postMessage(
      { source: "scopepulse-host", type: "host-ready" },
      window.location.origin,
    );

    return () => {
      window.removeEventListener("message", onMessage);
      authListener?.data.subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <iframe
      ref={frame}
      title="ScopePulse proposal workspace"
      src="/scopepulse/index.html"
      allow="clipboard-read; clipboard-write"
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0 }}
    />
  );
}
