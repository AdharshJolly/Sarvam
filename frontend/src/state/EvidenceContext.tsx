import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

interface EvidenceApi {
  openIds: string[];
  isOpen: boolean;
  open: (claimIds: string[]) => void;
  close: () => void;
  /** Element to return focus to when the drawer closes. */
  opener: React.MutableRefObject<HTMLElement | null>;
}

const EvidenceContext = createContext<EvidenceApi | null>(null);

export function useEvidence(): EvidenceApi {
  const c = useContext(EvidenceContext);
  if (!c) throw new Error("useEvidence must be used inside EvidenceProvider");
  return c;
}

export function EvidenceProvider({ children }: { children: ReactNode }) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement;
    setOpenIds(ids);
  }, []);
  const close = useCallback(() => setOpenIds([]), []);
  const value = useMemo(
    () => ({ openIds, isOpen: openIds.length > 0, open, close, opener }),
    [openIds, open, close],
  );
  return <EvidenceContext.Provider value={value}>{children}</EvidenceContext.Provider>;
}
