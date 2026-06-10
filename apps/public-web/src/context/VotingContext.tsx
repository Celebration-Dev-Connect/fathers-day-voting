import type { PublicCategory, PublicSpecialAward } from "@carshow/carshow-components";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getPublicEvent, submitBrowseVote, submitSpecialAwardVote } from "../api";
import {
  type DraftPick,
  type SpecialAwardPick,
  clearDraftPick,
  clearSpecialAwardDraftPick,
  getDrafts,
  getOrCreateVoterKey,
  getSpecialAwardDrafts,
  getSpecialAwardSubmitted,
  getSubmitted,
  markCategorySubmitted,
  markSpecialAwardSubmitted,
  moveSpecialAwardSubmittedToDraft,
  moveSubmittedToDraft,
  setDraftPick,
  setSpecialAwardDraftPick,
} from "../voter";

export interface VotingContextValue {
  voterKey: string;
  votingOpen: boolean;
  cutoffPassed: boolean;
  categories: PublicCategory[];
  specialAwards: PublicSpecialAward[];
  drafts: Record<string, DraftPick>; // categoryId → pending pick
  submitted: Record<string, DraftPick>; // categoryId → locked pick
  specialAwardDrafts: Record<string, SpecialAwardPick>;
  specialAwardSubmitted: Record<string, SpecialAwardPick>;
  select: (pick: DraftPick) => void;
  selectSpecialAward: (pick: SpecialAwardPick) => void;
  clearSelection: (categoryId: string) => void;
  clearSpecialAwardSelection: (specialAwardId: string) => void;
  submitVote: (categoryId: string) => Promise<void>;
  submitVoteDirect: (pick: DraftPick) => Promise<void>;
  submitSpecialAward: (specialAwardId: string) => Promise<void>;
  submitSpecialAwardDirect: (pick: SpecialAwardPick) => Promise<void>;
  changeVote: (categoryId: string) => void;
  changeSpecialAward: (specialAwardId: string) => void;
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
  const [specialAwards, setSpecialAwards] = useState<PublicSpecialAward[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftPick>>(() => getDrafts());
  const [submitted, setSubmitted] = useState<Record<string, DraftPick>>(() => getSubmitted());
  const [specialAwardDrafts, setSpecialAwardDrafts] = useState<Record<string, SpecialAwardPick>>(() =>
    getSpecialAwardDrafts(),
  );
  const [specialAwardSubmitted, setSpecialAwardSubmitted] = useState<Record<string, SpecialAwardPick>>(() =>
    getSpecialAwardSubmitted(),
  );
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const cutoffRef = useRef(cutoffTime);
  cutoffRef.current = cutoffTime;

  useEffect(() => {
    getPublicEvent()
      .then(({ event, categories, specialAwards = [] }) => {
        setVotingOpen(event.votingOpen);
        setCategories(categories);
        setSpecialAwards(specialAwards);
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

  const selectSpecialAward = useCallback((pick: SpecialAwardPick) => {
    setSpecialAwardDraftPick(pick);
    setSpecialAwardDrafts((current) => ({ ...current, [pick.specialAwardId]: pick }));
  }, []);

  const clearSpecialAwardSelection = useCallback((specialAwardId: string) => {
    clearSpecialAwardDraftPick(specialAwardId);
    setSpecialAwardDrafts((current) => {
      const next = { ...current };
      delete next[specialAwardId];
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

  const submitSpecialAward = useCallback(
    async (specialAwardId: string) => {
      const pick = specialAwardDrafts[specialAwardId];
      if (!pick) throw new Error("No pick selected for this special award");
      await submitSpecialAwardVote(pick.vehicleId, specialAwardId, voterKey);
      markSpecialAwardSubmitted(pick);
      setSpecialAwardSubmitted((current) => ({ ...current, [specialAwardId]: pick }));
      setSpecialAwardDrafts((current) => {
        const next = { ...current };
        delete next[specialAwardId];
        return next;
      });
    },
    [specialAwardDrafts, voterKey],
  );

  const submitVoteDirect = useCallback(
    async (pick: DraftPick) => {
      await submitBrowseVote(pick.vehicleId, voterKey);
      markCategorySubmitted(pick);
      setSubmitted((prev) => ({ ...prev, [pick.categoryId]: pick }));
    },
    [voterKey],
  );

  const submitSpecialAwardDirect = useCallback(
    async (pick: SpecialAwardPick) => {
      await submitSpecialAwardVote(pick.vehicleId, pick.specialAwardId, voterKey);
      markSpecialAwardSubmitted(pick);
      setSpecialAwardSubmitted((current) => ({ ...current, [pick.specialAwardId]: pick }));
    },
    [voterKey],
  );

  const changeVote = useCallback((categoryId: string) => {
    const pick = moveSubmittedToDraft(categoryId);
    if (!pick) return;
    setSubmitted((prev) => { const next = { ...prev }; delete next[categoryId]; return next; });
    setDrafts((prev) => ({ ...prev, [categoryId]: pick }));
  }, []);

  const changeSpecialAward = useCallback((specialAwardId: string) => {
    const pick = moveSpecialAwardSubmittedToDraft(specialAwardId);
    if (!pick) return;
    setSpecialAwardSubmitted((prev) => { const next = { ...prev }; delete next[specialAwardId]; return next; });
    setSpecialAwardDrafts((prev) => ({ ...prev, [specialAwardId]: pick }));
  }, []);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);

  const value = useMemo<VotingContextValue>(
    () => ({
      voterKey, votingOpen, cutoffPassed, categories, specialAwards,
      drafts, submitted, specialAwardDrafts, specialAwardSubmitted,
      select, selectSpecialAward, clearSelection, clearSpecialAwardSelection,
      submitVote, submitVoteDirect, submitSpecialAward, submitSpecialAwardDirect, changeVote, changeSpecialAward,
      isPanelOpen, openPanel, closePanel, togglePanel,
    }),
    [voterKey, votingOpen, cutoffPassed, categories, specialAwards, drafts, submitted,
      specialAwardDrafts, specialAwardSubmitted, select, selectSpecialAward, clearSelection,
      clearSpecialAwardSelection, submitVote, submitVoteDirect, submitSpecialAward, submitSpecialAwardDirect, changeVote, changeSpecialAward,
      isPanelOpen, openPanel, closePanel, togglePanel],
  );

  return <VotingContext.Provider value={value}>{children}</VotingContext.Provider>;
}
