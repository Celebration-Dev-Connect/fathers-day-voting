import type { PublicCategory } from "@carshow/carshow-components";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getPublicEvent, submitBrowseVote } from "../api";
import {
  type DraftPick,
  clearDraftPick,
  getDrafts,
  getOrCreateVoterKey,
  getSubmitted,
  markCategorySubmitted,
  setDraftPick,
} from "../voter";

export interface VotingContextValue {
  voterKey: string;
  votingOpen: boolean;
  cutoffPassed: boolean;
  categories: PublicCategory[];
  drafts: Record<string, DraftPick>; // categoryId → pending pick
  submitted: Record<string, DraftPick>; // categoryId → locked pick
  select: (pick: DraftPick) => void;
  clearSelection: (categoryId: string) => void;
  submitVote: (categoryId: string) => Promise<void>;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const VotingContext = createContext<VotingContextValue | null>(null);

export function useVoting() {
  const ctx = useContext(VotingContext);
  if (!ctx) throw new Error("useVoting must be inside VotingProvider");
  return ctx;
}

export function VotingProvider({ children }: { children: React.ReactNode }) {
  const voterKey = useMemo(() => getOrCreateVoterKey(), []);
  const [votingOpen, setVotingOpen] = useState(false);
  const [cutoffTime, setCutoffTime] = useState<Date | null>(null);
  const [cutoffPassed, setCutoffPassed] = useState(false);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftPick>>(() => getDrafts());
  const [submitted, setSubmitted] = useState<Record<string, DraftPick>>(() => getSubmitted());
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const cutoffRef = useRef(cutoffTime);
  cutoffRef.current = cutoffTime;

  useEffect(() => {
    getPublicEvent()
      .then(({ event, categories }) => {
        setVotingOpen(event.votingOpen);
        setCategories(categories);
        if (event.peopleChoiceCutoff) {
          const cutoff = new Date(event.peopleChoiceCutoff);
          setCutoffTime(cutoff);
          setCutoffPassed(new Date() > cutoff);
        }
      })
      .catch(() => {});
  }, []);

  // Re-check cutoff every 30 s
  useEffect(() => {
    const id = setInterval(() => {
      if (cutoffRef.current) setCutoffPassed(new Date() > cutoffRef.current);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const select = useCallback((pick: DraftPick) => {
    setDraftPick(pick);
    setDrafts((prev) => ({ ...prev, [pick.categoryId]: pick }));
  }, []);

  const clearSelection = useCallback((categoryId: string) => {
    clearDraftPick(categoryId);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
  }, []);

  const submitVote = useCallback(
    async (categoryId: string) => {
      const pick = drafts[categoryId];
      if (!pick) throw new Error("No pick selected for this category");
      await submitBrowseVote(pick.vehicleId, voterKey);
      markCategorySubmitted(pick);
      setSubmitted((prev) => ({ ...prev, [categoryId]: pick }));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
    },
    [drafts, voterKey],
  );

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);

  const value = useMemo<VotingContextValue>(
    () => ({
      voterKey, votingOpen, cutoffPassed, categories,
      drafts, submitted, select, clearSelection, submitVote,
      isPanelOpen, openPanel, closePanel, togglePanel,
    }),
    [voterKey, votingOpen, cutoffPassed, categories, drafts, submitted,
      select, clearSelection, submitVote, isPanelOpen, openPanel, closePanel, togglePanel],
  );

  return <VotingContext.Provider value={value}>{children}</VotingContext.Provider>;
}
