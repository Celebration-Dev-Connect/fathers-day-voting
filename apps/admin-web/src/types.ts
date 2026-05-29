export type StaffRole = "ADMIN" | "REGISTRAR";
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
  _count?: {
    vehicleEntries: number;
  };
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
  status: VehicleStatus;
  checkedInAt?: string | null;
  owner: Owner;
  category: Category;
  qrCard?: QrCard | null;
};

export type AuditLog = {
  id: string;
  action: string;
  reason?: string | null;
  createdAt: string;
  staffUser: StaffUser;
  qrCard: QrCard;
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
  };
};
