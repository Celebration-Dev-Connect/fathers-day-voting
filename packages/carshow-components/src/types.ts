export type StaffRole = "ADMIN" | "REGISTRAR" | "JUDGE";
export type VehicleStatus = "DRAFT" | "REGISTERED" | "CHECKED_IN";

export type StaffUser = {
  id: string;
  email: string;
  displayName: string;
  role: StaffRole;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sortOrder: number;
  importIdentifier?: string | null;
  importYearMin?: number | null;
  importYearMax?: number | null;
  _count?: {
    vehicleEntries: number;
    judgeCategoryPicks?: number;
    peopleChoiceVotes?: number;
    winnerOverrides?: number;
  };
};

export type SpecialAward = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  sortOrder: number;
  _count?: {
    votes: number;
  };
};

export type DashboardMetrics = {
  total: number;
  checkedIn: number;
  assignedQr: number;
  categories: number;
};

export type VotingSettings = {
  id: string;
  name: string;
  registrationOpen: boolean;
  votingOpen: boolean;
  judgesVotingEnabled: boolean;
  judgingOpen: boolean;
  resultsPublished: boolean;
  resultsPublishedAt?: string | null;
  peopleChoiceCutoff?: string | null;
};

export type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  publicName?: string | null;
  publicNameOptIn: boolean;
  waiverAccepted: boolean;
  ownerInviteSentAt?: string | null;
};

export type QrCard = {
  id: string;
  visibleCode: string;
  publicToken: string;
  status: "PRINTED" | "ASSIGNED" | "REASSIGNED" | "RETIRED" | "REPRINTED";
  vehicleEntryId?: string | null;
  printedAt?: string | null;
  assignedAt?: string | null;
  vehicleEntry?: Registration;
};

export type VehiclePhoto = {
  id: string;
  vehicleEntryId?: string;
  url: string | null;
  altText?: string | null;
  sortOrder: number;
  isPrimary?: boolean;
  ownerUploaded?: boolean;
  moderationStatus?: PhotoModerationStatus;
  createdAt: string;
};

export type PhotoModerationStatus = "PENDING" | "PROCESSING" | "HUMAN_REVIEW" | "APPROVED" | "REJECTED" | "FAILED";
export type PhotoSource = "STAFF" | "VISITOR";

export type PhotoReviewItem = {
  id: string;
  url?: string | null;
  mediumUrl?: string | null;
  thumbUrl?: string | null;
  contentType?: string | null;
  altText?: string | null;
  sortOrder: number;
  moderationStatus: PhotoModerationStatus;
  moderationLabels?: unknown;
  source: PhotoSource;
  uploadedBy?: string | null;
  processingStartedAt?: string | null;
  processedAt?: string | null;
  createdAt: string;
  vehicleEntry: Registration;
};

export type Registration = {
  id: string;
  entryNumber: number;
  year: number;
  make: string;
  model: string;
  nickname?: string | null;
  plateNumber?: string | null;
  exteriorColor?: string | null;
  internalNotes?: string | null;
  buildStory?: string | null;
  ownerAccessCode: string;
  primaryPhotoId?: string | null;
  status: VehicleStatus;
  checkedInAt?: string | null;
  owner: Owner;
  category: Category;
  qrCard?: QrCard | null;
  photos?: VehiclePhoto[];
};

export type AuditLog = {
  id: string;
  action: string;
  reason?: string | null;
  createdAt: string;
  staffUser: StaffUser;
  qrCard: QrCard;
};

export type PeopleChoiceTally = {
  registration: Registration;
  votes: number;
  rank: number;
  tieBreakPoints: number;
};

export type JudgeTopPick = {
  rank: number;
  registration: Registration;
  judgePoints: number;
  peopleChoiceTieBreakPoints: number;
  rankCounts: number[];
  tieBreakSummary: string;
  manualOverride: boolean;
  overrideReason?: string | null;
  overrideBy?: string | null;
  overrideAt?: string | null;
};

export type CategoryVotingTally = {
  category: Category;
  peopleChoice: PeopleChoiceTally[];
  judgeRanking: JudgeTopPick[];
  judgeTop3: JudgeTopPick[];
  judgingDescription: string;
};

export type SpecialAwardTallyItem = {
  registration: Registration;
  votes: number;
  rank: number;
};

export type SpecialAwardVotingTally = {
  specialAward: SpecialAward;
  results: SpecialAwardTallyItem[];
};

export type JudgeCategorySummary = {
  category: Category;
  eligibleVehicleCount: number;
  rankedCount: number;
  submitted: boolean;
};

export type JudgeSession = {
  staff: StaffUser;
  judgesVotingEnabled: boolean;
  judgingOpen: boolean;
  resultsPublished: boolean;
  categories: JudgeCategorySummary[];
};

export type JudgeCompletionJudge = {
  judgeKey: string;
  judgeName: string;
  rankedCount: number;
  complete: boolean;
  updatedAt?: string | null;
};

export type JudgeCategoryCompletion = {
  category: Category;
  eligibleVehicleCount: number;
  judgeCount: number;
  completeJudgeCount: number;
  totalPicks: number;
  judges: JudgeCompletionJudge[];
};

export type JudgeBallotPick = {
  rank: number;
  registration: Registration;
};

export type JudgeBallot = {
  category: Category;
  judgesVotingEnabled: boolean;
  judgingOpen: boolean;
  submitted: boolean;
  picks: JudgeBallotPick[];
};

export type RegistrationPayload = {
  owner: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    publicName?: string;
    publicNameOptIn: boolean;
    waiverAccepted: boolean;
  };
  vehicle: {
    categoryId: string;
    year: number;
    make: string;
    model: string;
    nickname?: string;
    plateNumber?: string;
    exteriorColor?: string;
    internalNotes?: string;
    buildStory?: string;
  };
};

// Public visitor types

export type PublicCategory = {
  id: string;
  name: string;
  slug: string;
};

export type PublicSpecialAward = {
  id: string;
  name: string;
  description: string | null;
};

export type PublicPhoto = {
  id: string;
  url: string;
  mediumUrl: string | null;
  thumbUrl: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary?: boolean;
};

export type PublicVehicle = {
  id: string;
  entryNumber: number;
  year: number;
  make: string;
  model: string;
  nickname: string | null;
  exteriorColor: string | null;
  buildStory: string | null;
  category: PublicCategory;
  ownerName: string | null;
  primaryPhotoId?: string | null;
  photos: PublicPhoto[];
};

export type PublicEntry = PublicVehicle;

export type PublicEvent = {
  name: string;
  eventDate: string;
  venueName: string;
  votingOpen: boolean;
  peopleChoiceCutoff: string | null;
  resultsPublished: boolean;
  resultsPublishedAt?: string | null;
};

export type PublishedResultEntry = {
  rank: number;
  vehicle: PublicVehicle;
  votes?: number;
  judgePoints?: number;
};

export type PublishedCategoryResults = {
  category: PublicCategory;
  official: PublishedResultEntry[];
  peopleChoice: PublishedResultEntry[];
};

export type PublishedSpecialAwardResults = {
  specialAward: PublicSpecialAward;
  results: PublishedResultEntry[];
};

export type PublishedResultsSnapshot = {
  publishedAt: string;
  publishedByName: string;
  judgesVotingEnabled: boolean;
  categories: PublishedCategoryResults[];
  specialAwards: PublishedSpecialAwardResults[];
};

export type PublishedVehiclePlacement = {
  kind: "OFFICIAL" | "PEOPLE_CHOICE" | "SPECIAL_AWARD";
  label: string;
  rank: number;
};

export type CeremonyEvent = {
  peopleChoiceCutoff: string | null;
  resultsPublished: boolean;
  resultsPublishedAt?: string | null;
};

export type CeremonyPhotoSlide = {
  id: string;
  url: string;
  mediumUrl: string | null;
  thumbUrl: string | null;
  altText: string | null;
  vehicle: {
    id: string;
    entryNumber: number;
    year: number;
    make: string;
    model: string;
    ownerName: string | null;
    category: PublicCategory;
  };
};

export type CeremonyWinnerSlide = {
  id: string;
  kind: "CATEGORY" | "SPECIAL_AWARD";
  label: string;
  resultLabel: string;
  rank: number;
  votes?: number;
  judgePoints?: number;
  vehicle: PublicVehicle;
};

export type CeremonyData = {
  event: CeremonyEvent;
  photoSlides: CeremonyPhotoSlide[];
  winnerSlides: CeremonyWinnerSlide[];
};
